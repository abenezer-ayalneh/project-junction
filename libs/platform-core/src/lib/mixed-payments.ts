import { createHash } from 'node:crypto'

import {
	IdempotencyKeySchema,
	MixedCurrentPaymentSchema,
	MixedPaymentReadSchema,
	MixedPaymentResultSchema,
	MixedPaymentSimulationSchema,
	MixedPaymentStartSchema,
	MixedPaymentWebhookAckSchema,
	MixedQuoteSnapshotSchema,
} from 'contracts'
import { z } from 'zod'

import { type MixedPaymentAttempt, type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError } from './access.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { stableHash } from './idempotency.js'
import { ImmutableLedger } from './ledger.js'
import { LocalMixedPaymentAdapter, MixedProviderEventSchema } from './local-mixed-payment.js'
import { type MixedCheckoutHolds } from './mixed-holds.js'
type Tx = Prisma.TransactionClient
const provider = 'local-mixed-payment'
export class MixedCheckoutPayments {
	private readonly ledger = new ImmutableLedger()
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly holds: MixedCheckoutHolds,
		private readonly adapter: LocalMixedPaymentAdapter,
		private readonly commit?: (tx: Tx, payment: MixedPaymentAttempt) => Promise<unknown>,
	) {}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
	}
	private async owned(tx: Tx, sessionId: string | undefined, id: string) {
		const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
		const payment = await tx.mixedPaymentAttempt.findFirst({ where: { id, workspaceId: context.workspaceId, customerId: context.actor.userId } })
		if (!payment) throw new AccessDeniedError()
		return { context, payment }
	}
	private async view(tx: Tx, id: string) {
		const p = await tx.mixedPaymentAttempt.findUniqueOrThrow({
			where: { id },
			include: { hold: true, refund: true, purchase: true, goodsRefunds: true, bookingRefunds: true },
		})
		return MixedPaymentReadSchema.parse({
			paymentId: p.id,
			purchaseId: p.purchase?.id ?? null,
			holdId: p.holdId,
			holdState: p.hold.state,
			state: p.state,
			provider: p.provider,
			sandbox: true,
			amount: { minorUnits: Number(p.amountMinorUnits), currency: p.currency },
			createdAt: p.createdAt.toISOString(),
			expiresAt: p.expiresAt.toISOString(),
			commitmentReady: ['succeeded', 'no_payment_required'].includes(p.state) && p.hold.state === 'holding' && p.expiresAt > this.deps.now(),
			refundState: p.refund?.state ?? null,
		})
	}
	async start(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		this.adapter.assertLocal()
		const key = IdempotencyKeySchema.parse(keyInput),
			command = MixedPaymentStartSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId)
				const user = await tx.user.findUniqueOrThrow({ where: { id: context.actor.userId } })
				if (user.adultVerificationState !== 'verified' || !user.verifiedAt) throw new AccessDeniedError('Verified adult identity is required.')
				const hold = await tx.mixedCheckoutHold.findFirst({
					where: { id: command.holdId, workspaceId: context.workspaceId, customerId: context.actor.userId },
				})
				if (!hold) throw new AccessDeniedError()
				const result = await this.deps.replay(tx, context, key, 'POST /v1/customer/checkout/payments', command, async () => {
					if (hold.state !== 'holding' || hold.expiresAt <= this.deps.now())
						throw new GoodsCheckoutConflictError('Hold ended. Start a fresh checkout.')
					if (await tx.mixedPaymentAttempt.findUnique({ where: { holdId: hold.id } }))
						throw new GoodsCheckoutConflictError('Payment already started. Recover its current state.')
					const snapshot = MixedQuoteSnapshotSchema.parse(hold.snapshot)
					const vendorIds = [...new Set([...snapshot.goods.map((g) => g.group.vendorId), ...snapshot.bookings.map((b) => b.snapshot.vendorId)])]
					const vendors = await tx.vendor.findMany({ where: { id: { in: vendorIds } }, select: { workspaceId: true } })
					for (const workspaceId of [...new Set(vendors.map((v) => v.workspaceId))].sort()) await this.deps.lockWorkspace(tx, workspaceId)
					const listingIds = [
						...new Set([
							...snapshot.goods.flatMap((g) => g.group.lines.map((l) => l.listingId)),
							...snapshot.bookings.map((b) => b.snapshot.listingId),
						]),
					]
					if (
						(await tx.listing.count({
							where: {
								id: { in: listingIds },
								state: 'published',
								vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'real' } },
							},
						})) !== listingIds.length
					)
						throw new GoodsCheckoutConflictError('Publication changed. Release this hold and request a fresh checkout.')
					if (!snapshot.total) throw new GoodsCheckoutConflictError()
					const payment = await tx.mixedPaymentAttempt.create({
						data: {
							holdId: hold.id,
							workspaceId: hold.workspaceId,
							customerId: hold.customerId,
							providerReference: `local-mixed:${hold.id}`,
							amountMinorUnits: BigInt(snapshot.total.minorUnits),
							currency: snapshot.total.currency,
							state: snapshot.total.minorUnits === 0 ? 'no_payment_required' : 'pending_provider',
							createdAt: this.deps.now(),
							expiresAt: hold.expiresAt,
						},
					})
					await goodsAudit(tx, context.workspaceId, context.actor.userId, 'mixed-payment.started', {
						paymentId: payment.id,
						holdId: hold.id,
						sandbox: true,
					})
					if (payment.state === 'no_payment_required') await this.commit?.(tx, payment)
					if (payment.amountMinorUnits > 0n)
						await goodsEmit(tx, () => this.deps.now(), context.workspaceId, 'MixedPaymentRequested', payment.id, 1, key, {
							paymentId: payment.id,
							holdId: hold.id,
							provider: 'local-controlled',
							sandbox: true,
						})
					return { paymentId: payment.id }
				})
				return MixedPaymentResultSchema.parse({ ...(await this.view(tx, result.outcome.paymentId)), replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	/** Authenticate raw bytes before parsing or writing inbox/audit. Malformed authenticated facts are retained. */
	async receive(raw: Buffer | undefined, signature: string | undefined) {
		this.adapter.verify(raw, signature, this.deps.now())
		let payload: unknown
		try {
			payload = JSON.parse(raw!.toString('utf8'))
			if (payload === null) payload = { malformedJson: null }
		} catch {
			payload = { malformedBodyHash: createHash('sha256').update(raw!).digest('hex') }
		}
		const hash = stableHash(payload),
			parsed = MixedProviderEventSchema.safeParse(payload),
			candidate = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
		const eventId = typeof candidate['eventId'] === 'string' && candidate['eventId'].length <= 200 ? candidate['eventId'] : `malformed:${hash}`
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const existing = await tx.providerInboxEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId: eventId } } })
				if (existing) {
					if (existing.payloadHash !== hash) {
						const conflictId = `conflict:${createHash('sha256')
							.update(eventId + hash)
							.digest('hex')}`
						await tx.providerInboxEvent.upsert({
							where: { provider_providerEventId: { provider, providerEventId: conflictId } },
							create: {
								provider,
								providerEventId: conflictId,
								payloadHash: hash,
								payload: goodsJson({ conflictingEventId: eventId, payload }),
								reconciliationState: 'exception',
								receivedAt: this.deps.now(),
							},
							update: {},
						})
					}
					return MixedPaymentWebhookAckSchema.parse({ accepted: true, duplicate: true })
				}
				const payment = parsed.success ? await tx.mixedPaymentAttempt.findUnique({ where: { id: parsed.data.paymentId } }) : null
				await tx.providerInboxEvent.create({
					data: {
						provider,
						providerEventId: eventId,
						providerReference: parsed.success ? parsed.data.reference : null,
						workspaceId: payment?.workspaceId ?? null,
						payloadHash: hash,
						payload: goodsJson(payload),
						reconciliationState: parsed.success ? 'pending' : 'exception',
						receivedAt: this.deps.now(),
					},
				})
				if (payment)
					await goodsEmit(tx, () => this.deps.now(), payment.workspaceId, 'MixedPaymentResultRecorded', payment.id, 1, eventId, {
						paymentId: payment.id,
						sandbox: true,
					})
				return MixedPaymentWebhookAckSchema.parse({ accepted: true, duplicate: false })
			},
			{ timeout: 30000 },
		)
	}
	async simulate(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		this.adapter.assertLocal()
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = MixedPaymentSimulationSchema.parse(input)
		const receipt = await this.deps.db.$transaction(async (tx) => {
			await this.lock(tx)
			const { context, payment } = await this.owned(tx, sessionId, id)
			if (payment.amountMinorUnits === 0n) throw new GoodsCheckoutConflictError('No provider charge is required.')
			const result = await this.deps.replay(
				tx,
				context,
				key,
				'POST /v1/customer/checkout/payments/:paymentId/local-result',
				{ paymentId: id, command },
				() => {
					const payload = {
						eventId: `simulation:${id}:${stableHash(key)}`,
						paymentId: id,
						workspaceId: payment.workspaceId,
						reference: payment.providerReference,
						merchant: 'junction',
						environment: 'local-controlled',
						amount: { minorUnits: Number(payment.amountMinorUnits), currency: payment.currency },
						outcome: command.outcome,
						occurredAt: this.deps.now().toISOString(),
					}
					this.adapter.sign(Buffer.from(JSON.stringify(payload)), this.deps.now())
					return Promise.resolve({ payload })
				},
			)
			return result
		})
		const raw = Buffer.from(JSON.stringify(receipt.outcome.payload))
		await this.receive(raw, this.adapter.sign(raw, this.deps.now()))
		return this.deps.db.$transaction(async (tx) => MixedPaymentResultSchema.parse({ ...(await this.view(tx, id)), replayed: receipt.replayed }))
	}
	private async changed(tx: Tx, p: MixedPaymentAttempt) {
		await goodsAudit(tx, p.workspaceId, null, 'mixed-payment.changed', { paymentId: p.id, state: p.state })
		await goodsEmit(tx, () => this.deps.now(), p.workspaceId, 'MixedPaymentChanged', p.id, 2, null, { paymentId: p.id, state: p.state, sandbox: true })
	}
	async abandoned(tx: Tx, holdId: string) {
		const p = await tx.mixedPaymentAttempt.findUnique({ where: { holdId } })
		if (p?.captureLedgerId) await this.compensate(tx, p, 'Hold ended before Purchase commitment.')
	}
	private async compensate(tx: Tx, p: MixedPaymentAttempt, reason: string) {
		if (p.state === 'refunded') return
		let refund = await tx.mixedPaymentRefund.findUnique({ where: { paymentId: p.id } })
		if (!refund) {
			refund = await tx.mixedPaymentRefund.create({
				data: { paymentId: p.id, amountMinorUnits: p.amountMinorUnits, currency: p.currency, reason, createdAt: this.deps.now() },
			})
			await goodsEmit(tx, () => this.deps.now(), p.workspaceId, 'MixedRefundRequested', refund.id, 1, null, {
				paymentId: p.id,
				refundId: refund.id,
				sandbox: true,
			})
			await goodsAudit(tx, p.workspaceId, null, 'mixed-refund.requested', { paymentId: p.id, refundId: refund.id, reason })
		}
		if (p.state !== 'refund_pending') {
			const updated = await tx.mixedPaymentAttempt.update({ where: { id: p.id }, data: { state: 'refund_pending' } })
			await this.changed(tx, updated)
		}
	}
	private async process(tx: Tx, inboxId: string) {
		const inbox = await tx.providerInboxEvent.findUniqueOrThrow({ where: { id: inboxId } })
		if (inbox.reconciliationState !== 'pending') return
		const parsed = MixedProviderEventSchema.safeParse(inbox.payload)
		let state = 'exception'
		if (parsed.success) {
			const e = parsed.data,
				p = await tx.mixedPaymentAttempt.findUnique({ where: { id: e.paymentId }, include: { hold: true } }),
				at = new Date(e.occurredAt)
			if (
				p &&
				p.amountMinorUnits > 0n &&
				p.workspaceId === e.workspaceId &&
				p.providerReference === e.reference &&
				Number(p.amountMinorUnits) === e.amount.minorUnits &&
				p.currency === e.amount.currency &&
				at >= p.createdAt &&
				at <= this.deps.now()
			) {
				state = 'reconciled'
				if (e.outcome === 'unknown') {
					if (p.state === 'pending_provider') {
						const updated = await tx.mixedPaymentAttempt.update({ where: { id: p.id }, data: { state: 'unknown' } })
						await this.changed(tx, updated)
					} else state = 'superseded'
				} else if (e.outcome === 'failed') {
					if (['pending_provider', 'unknown'].includes(p.state)) {
						const updated = await tx.mixedPaymentAttempt.update({ where: { id: p.id }, data: { state: 'failed' } })
						await this.changed(tx, updated)
						if (p.hold.state === 'holding')
							await this.holds.endInTransaction(tx, p.hold.id, p.hold.expiresAt <= this.deps.now() ? 'expired' : 'released')
					} else state = 'superseded'
				} else if (p.captureLedgerId) state = 'superseded'
				else {
					if (p.hold.state === 'holding' && at >= p.expiresAt) await this.holds.endInTransaction(tx, p.hold.id, 'expired', true)
					const hold = await tx.mixedCheckoutHold.findUniqueOrThrow({ where: { id: p.holdId } })
					const captured = await this.ledger.post(tx, {
						workspaceId: p.workspaceId,
						economicEventId: `mixed-capture:${p.id}`,
						sourceId: p.id,
						reason: 'Verified local mixed payment capture.',
						postings: [
							{
								account: 'processor_clearing',
								vendorId: null,
								locationId: null,
								componentId: null,
								money: { currency: p.currency, minorUnits: Number(p.amountMinorUnits) },
							},
							{
								account: 'customer_refund_liability',
								vendorId: null,
								locationId: null,
								componentId: null,
								money: { currency: p.currency, minorUnits: -Number(p.amountMinorUnits) },
							},
						],
					})
					const updated = await tx.mixedPaymentAttempt.update({
						where: { id: p.id },
						data: { state: hold.state === 'holding' ? 'succeeded' : 'refund_pending', captureLedgerId: captured.transaction.id, capturedAt: at },
					})
					await this.changed(tx, updated)
					if (hold.state !== 'holding') await this.compensate(tx, updated, 'Verified success after hold ended.')
					else if (this.commit && (await this.commit(tx, updated)) === null)
						await this.holds.endInTransaction(tx, updated.holdId, this.deps.now() >= updated.expiresAt ? 'expired' : 'released', true)
				}
			}
		}
		await tx.providerInboxEvent.update({
			where: { id: inbox.id },
			data: { reconciliationState: state, processedAt: this.deps.now(), reconciledAt: this.deps.now() },
		})
	}
	async reconcileInTransaction(tx: Tx, paymentId?: string) {
		const pending = await tx.providerInboxEvent.findMany({
			where: { provider, reconciliationState: 'pending', ...(paymentId ? { payload: { path: ['paymentId'], equals: paymentId } } : {}) },
			orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
			take: 100,
		})
		for (const e of pending) await this.process(tx, e.id)
		const due = await tx.mixedPaymentAttempt.findMany({
			where: { state: 'pending_provider', createdAt: { lte: new Date(this.deps.now().getTime() - 30000) }, ...(paymentId ? { id: paymentId } : {}) },
			take: 100,
		})
		for (const p of due) {
			const updated = await tx.mixedPaymentAttempt.update({ where: { id: p.id }, data: { state: 'unknown' } })
			await this.changed(tx, updated)
		}
		return pending.length
	}
	async beforeExpiry(tx: Tx, holdId: string) {
		const p = await tx.mixedPaymentAttempt.findUnique({ where: { holdId } })
		if (p) {
			await this.reconcileInTransaction(tx, p.id)
			const current = await tx.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: p.id }, include: { hold: true } })
			if (
				['succeeded', 'no_payment_required'].includes(current.state) &&
				current.hold.state === 'holding' &&
				(current.capturedAt ?? current.createdAt) < current.expiresAt
			)
				await this.commit?.(tx, current)
		}
	}
	async reconcile() {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				return this.reconcileInTransaction(tx)
			},
			{ timeout: 30000 },
		)
	}
	async current(sessionId: string | undefined) {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
				const cart = await tx.mixedCart.findUnique({
					where: { workspaceId_customerId: { workspaceId: context.workspaceId, customerId: context.actor.userId } },
				})
				if (!cart) return MixedCurrentPaymentSchema.parse({ payment: null })
				const hold = await tx.mixedCheckoutHold.findFirst({
					where: { cartId: cart.id, workspaceId: context.workspaceId, customerId: context.actor.userId, quote: { cartVersion: cart.version } },
					orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
					include: { payment: true },
				})
				if (!hold?.payment) return MixedCurrentPaymentSchema.parse({ payment: null })
				await this.reconcileInTransaction(tx, hold.payment.id)
				if (hold.state === 'holding' && hold.expiresAt <= this.deps.now()) await this.holds.endInTransaction(tx, hold.id, 'expired')
				return MixedCurrentPaymentSchema.parse({ payment: await this.view(tx, hold.payment.id) })
			},
			{ timeout: 30000 },
		)
	}
	async read(sessionId: string | undefined, idInput: string) {
		const id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				await this.owned(tx, sessionId, id)
				await this.reconcileInTransaction(tx, id)
				const p = await tx.mixedPaymentAttempt.findUniqueOrThrow({ where: { id }, include: { hold: true } })
				if (p.hold.state === 'holding' && p.expiresAt <= this.deps.now()) await this.holds.endInTransaction(tx, p.holdId, 'expired')
				return this.view(tx, id)
			},
			{ timeout: 30000 },
		)
	}
	/** Provider I/O outside DB transactions. Unknown delivery retries the same stable operation identity. */
	async refunds() {
		const rows = await this.deps.db.mixedPaymentRefund.findMany({
			where: { state: { in: ['pending', 'unknown'] } },
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
			take: 100,
		})
		let completed = 0
		for (const row of rows) {
			let result: { state: 'completed' | 'unknown'; reference: string }
			try {
				result = await this.adapter.refund({ operationId: row.id, paymentId: row.paymentId, amountMinorUnits: Number(row.amountMinorUnits) })
			} catch {
				result = { state: 'unknown', reference: '' }
			}
			await this.deps.db.$transaction(
				async (tx) => {
					await this.lock(tx)
					const r = await tx.mixedPaymentRefund.findUniqueOrThrow({ where: { id: row.id }, include: { payment: true } })
					if (r.state === 'completed') return
					if (result.state === 'unknown') {
						if (r.state !== 'unknown') await tx.mixedPaymentRefund.update({ where: { id: r.id }, data: { state: 'unknown' } })
						return
					}
					if (result.reference !== `local-mixed-refund:${r.id}`)
						throw new GoodsCheckoutConflictError('Refund provider reference does not match operation.')
					const reversal = await this.ledger.reverse(
						tx,
						r.payment.workspaceId,
						r.payment.captureLedgerId!,
						`mixed-refund:${r.id}`,
						'Verified local abandoned payment refund.',
					)
					await tx.mixedPaymentRefund.update({
						where: { id: r.id },
						data: {
							state: 'completed',
							providerReference: result.reference,
							reversalLedgerId: reversal.transaction.id,
							completedAt: this.deps.now(),
						},
					})
					const updated = await tx.mixedPaymentAttempt.update({ where: { id: r.paymentId }, data: { state: 'refunded' } })
					await this.changed(tx, updated)
					await goodsAudit(tx, r.payment.workspaceId, null, 'mixed-refund.completed', { paymentId: r.paymentId, refundId: r.id })
					await goodsEmit(tx, () => this.deps.now(), r.payment.workspaceId, 'MixedRefundCompleted', r.id, 2, null, {
						paymentId: r.paymentId,
						refundId: r.id,
						sandbox: true,
					})
					completed++
				},
				{ timeout: 30000 },
			)
		}
		return { completed }
	}
}
