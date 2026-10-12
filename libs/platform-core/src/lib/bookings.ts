import {
	BookingAmendmentCommandSchema,
	BookingAmendmentResultSchema,
	BookingCancellationCommandSchema,
	BookingCancellationResultSchema,
	BookingHoldSnapshotSchema,
	BookingPaymentReadSchema,
	BookingPaymentReceiptCommandSchema,
	BookingPaymentResultSchema,
	BookingPaymentStartSchema,
	BookingReadSchema,
	BookingSnapshotSchema,
	IdempotencyKeySchema,
} from 'contracts'
import { z } from 'zod'

import type { Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertScope } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import { bookingCancellationRefund } from './booking-policy.js'
import { goodsAudit, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { LocalGoodsPaymentAdapter } from './local-goods-payment.js'
import type { ServiceScheduling } from './service-scheduling.js'

type Tx = Prisma.TransactionClient
export class Bookings {
	private readonly payments: LocalGoodsPaymentAdapter
	constructor(
		private readonly dependencies: GoodsDependencies,
		private readonly scheduling: ServiceScheduling,
	) {
		this.payments = dependencies.payments ?? new LocalGoodsPaymentAdapter()
	}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
	}
	private async view(tx: Tx, paymentId: string) {
		const payment = await tx.bookingPayment.findUniqueOrThrow({
			where: { id: paymentId },
			include: { hold: true, booking: { include: { amendments: true } }, refunds: true },
		})
		return BookingPaymentReadSchema.parse({
			paymentId,
			holdId: payment.holdId,
			provider: 'local-controlled',
			currency: 'ETB',
			amountCents: payment.amountCents,
			collectedCents: payment.amountCents + (payment.booking?.amendments ?? []).reduce((sum, a) => sum + Math.max(0, a.deltaCents), 0),
			state: payment.state,
			bookingId: payment.booking?.id ?? null,
			expiresAt: payment.hold.expiresAt.toISOString(),
			refundedCents: payment.refunds.filter((r) => r.state === 'succeeded').reduce((s, r) => s + r.amountCents, 0),
			pendingRefundCents: payment.refunds.filter((r) => r.state === 'pending').reduce((s, r) => s + r.amountCents, 0),
		})
	}
	private async owned(tx: Tx, sessionId: string | undefined, paymentId: string) {
		const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
		const payment = await tx.bookingPayment.findFirst({
			where: { id: paymentId, hold: { customerId: context.actor.userId, workspaceId: context.workspaceId } },
			include: { hold: true },
		})
		if (!payment) throw new AccessDeniedError()
		return { context, payment }
	}
	async start(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		this.payments.assertLocal()
		const key = IdempotencyKeySchema.parse(keyInput),
			command = BookingPaymentStartSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId)
				const user = await tx.user.findUniqueOrThrow({ where: { id: context.actor.userId } })
				if (user.adultVerificationState !== 'verified' || !user.verifiedAt) throw new AccessDeniedError('Verified adult Customer identity is required.')
				const result = await this.dependencies.replay(tx, context, key, 'POST /v1/customer/bookings/payments', command, async () => {
					const hold = await tx.bookingHold.findFirst({
						where: { id: command.holdId, customerId: context.actor.userId, workspaceId: context.workspaceId },
					})
					if (!hold) throw new AccessDeniedError()
					const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: hold.vendorId } })
					await this.dependencies.lockWorkspace(tx, vendor.workspaceId)
					if (hold.state !== 'holding' || hold.expiresAt <= this.dependencies.now()) throw new BookingHoldConflictError('The hold has ended.')
					const existing = await tx.bookingPayment.findUnique({ where: { holdId: hold.id } })
					if (existing) throw new BookingHoldConflictError('Payment has already started. Read its current state.')
					const snapshot = BookingHoldSnapshotSchema.parse(hold.snapshot)
					const listing = await tx.listing.findFirst({
						where: {
							id: snapshot.listingId,
							state: 'published',
							vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'real' } },
						},
					})
					if (!listing) throw new BookingHoldConflictError('Service publication changed.')
					const flexible = listing.bookingPolicy === 'flexible'
					const policy = {
						template: listing.bookingPolicy,
						version: 1,
						fullRefundHours: flexible ? 24 : 48,
						partialRefundHours: flexible ? 2 : 12,
						amendmentLimit: flexible ? 2 : 1,
						contestHours: 48,
					}
					const payment = await tx.bookingPayment.create({
						data: {
							holdId: hold.id,
							amountCents: snapshot.priceCents,
							policySnapshot: goodsJson(policy),
							...(command.attendee ? { attendee: goodsJson(command.attendee) } : {}),
							createdAt: this.dependencies.now(),
						},
					})
					await goodsAudit(tx, context.workspaceId, context.actor.userId, 'booking.payment-started', { paymentId: payment.id, holdId: hold.id })
					await goodsEmit(tx, () => this.dependencies.now(), context.workspaceId, 'BookingPaymentStarted', payment.id, 1, key, {
						paymentId: payment.id,
						holdId: hold.id,
					})
					return this.view(tx, payment.id)
				})
				return BookingPaymentResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}
	async receipt(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		this.payments.assertLocal()
		const key = IdempotencyKeySchema.parse(keyInput),
			paymentId = z.string().uuid().parse(idInput),
			command = BookingPaymentReceiptCommandSchema.parse(input)
		const accepted = await this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const { context, payment } = await this.owned(tx, sessionId, paymentId)
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/customer/bookings/payments/:paymentId/local-result',
					{ paymentId, command },
					async () => {
						const existing = await tx.bookingPaymentReceipt.findUnique({ where: { paymentId } })
						if (existing && existing.outcome !== command.outcome) throw new BookingHoldConflictError('The payment already has a final result.')
						if (!existing) {
							if (command.outcome === 'unknown') {
								if (payment.state === 'processing') await tx.bookingPayment.update({ where: { id: paymentId }, data: { state: 'unknown' } })
							} else {
								await tx.bookingPaymentReceipt.create({ data: { paymentId, outcome: command.outcome, receivedAt: this.dependencies.now() } })
								await goodsAudit(tx, context.workspaceId, context.actor.userId, 'booking.payment-result-recorded', {
									paymentId,
									outcome: command.outcome,
								})
								await goodsEmit(tx, () => this.dependencies.now(), context.workspaceId, 'BookingPaymentResultRecorded', paymentId, 2, key, {
									paymentId,
									outcome: command.outcome,
								})
							}
						}
						return this.view(tx, paymentId)
					},
				)
				return BookingPaymentResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
		const current = await this.readPayment(sessionId, paymentId)
		return BookingPaymentResultSchema.parse({ ...current, replayed: accepted.replayed })
	}

	private async reconcile(tx: Tx, paymentId?: string) {
		const payments = await tx.bookingPayment.findMany({
			where: { ...(paymentId ? { id: paymentId } : {}), state: { in: ['processing', 'unknown'] }, result: { isNot: null } },
			include: { result: true, hold: { include: { allocation: true } } },
			orderBy: { id: 'asc' },
			take: 100,
		})
		for (const payment of payments) {
			const { hold, result } = payment
			if (!result) continue
			const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: hold.vendorId } })
			await this.dependencies.lockWorkspace(tx, vendor.workspaceId)
			const snapshot = BookingHoldSnapshotSchema.parse(hold.snapshot)
			const valid =
				hold.state === 'holding' &&
				result.receivedAt >= payment.createdAt &&
				result.receivedAt < hold.expiresAt &&
				hold.allocation?.state === 'held' &&
				vendor.applicationState === 'approved' &&
				!!vendor.publishedAt
			if (result.outcome === 'failed' || !valid) {
				if (hold.state === 'holding') {
					const state = hold.expiresAt <= this.dependencies.now() ? 'expired' : 'released'
					await tx.staffAllocation.updateMany({ where: { holdId: hold.id, state: 'held' }, data: { state } })
					await tx.bookingHold.update({ where: { id: hold.id }, data: { state, releasedAt: this.dependencies.now() } })
					for (const workspaceId of new Set([hold.workspaceId, vendor.workspaceId]))
						await goodsEmit(
							tx,
							() => this.dependencies.now(),
							workspaceId,
							state === 'expired' ? 'BookingHoldExpired' : 'BookingHoldReleased',
							hold.id,
							2,
							null,
							{ holdId: hold.id },
						)
				}
				await tx.bookingPayment.update({ where: { id: payment.id }, data: { state: result.outcome === 'failed' ? 'failed' : 'refund_pending' } })
				if (result.outcome === 'succeeded')
					await tx.bookingRefund.create({
						data: {
							paymentId: payment.id,
							semanticKey: `late-success:${payment.id}`,
							amountCents: payment.amountCents,
							createdAt: this.dependencies.now(),
						},
					})
				await goodsAudit(tx, hold.workspaceId, null, 'booking.payment-reconciled', {
					paymentId: payment.id,
					outcome: result.outcome === 'failed' ? 'failed' : 'refund_pending',
				})
				continue
			}
			if (!hold.allocation || payment.amountCents !== snapshot.priceCents)
				throw new BookingHoldConflictError('Payment allocation or amount does not match.')
			const purchased = BookingSnapshotSchema.parse({
				...snapshot,
				policy: payment.policySnapshot,
				attendee: payment.attendee ?? null,
				optionPriceCents: snapshot.priceCents - snapshot.addons.reduce((s, a) => s + a.priceCents, 0),
				promotion: null,
				commission: null,
			})
			const booking = await tx.booking.create({
				data: {
					holdId: hold.id,
					paymentId: payment.id,
					allocationId: hold.allocation.id,
					snapshot: goodsJson(purchased),
					confirmedAt: result.receivedAt,
				},
			})
			await tx.staffAllocation.update({ where: { id: hold.allocation.id }, data: { state: 'booked', expiresAt: null } })
			await tx.bookingHold.update({ where: { id: hold.id }, data: { state: 'committed' } })
			await tx.bookingPayment.update({ where: { id: payment.id }, data: { state: 'succeeded' } })
			for (const workspaceId of new Set([hold.workspaceId, vendor.workspaceId])) {
				await goodsAudit(tx, workspaceId, null, 'booking.confirmed', { bookingId: booking.id, paymentId: payment.id })
				await goodsEmit(tx, () => this.dependencies.now(), workspaceId, 'BookingConfirmed', booking.id, 1, null, { bookingId: booking.id })
			}
		}
		return payments.length
	}
	async reconcilePayments() {
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				return this.reconcile(tx)
			},
			{ timeout: 30_000 },
		)
	}
	async readPayment(sessionId: string | undefined, idInput: string) {
		const paymentId = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				await this.owned(tx, sessionId, paymentId)
				await this.reconcile(tx, paymentId)
				return this.view(tx, paymentId)
			},
			{ timeout: 30_000 },
		)
	}
	async read(sessionId: string | undefined, idInput: string) {
		const bookingId = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
			const booking = await tx.booking.findFirst({
				where: { id: bookingId, hold: { customerId: context.actor.userId, workspaceId: context.workspaceId } },
			})
			if (!booking) throw new AccessDeniedError()
			return BookingReadSchema.parse({
				bookingId,
				state: booking.state,
				version: booking.version,
				confirmedAt: booking.confirmedAt.toISOString(),
				snapshot: booking.currentSnapshot ?? booking.snapshot,
				originalSnapshot: booking.snapshot,
				customerAmendments: booking.customerAmendments,
			})
		})
	}
	async amend(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown, disruption = false) {
		this.payments.assertLocal()
		const key = IdempotencyKeySchema.parse(keyInput),
			bookingId = z.string().uuid().parse(idInput),
			command = BookingAmendmentCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { hold: true, payment: true } })
				if (!booking) throw new AccessDeniedError()
				const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
				await this.dependencies.lockWorkspace(tx, vendor.workspaceId)
				const original = BookingSnapshotSchema.parse(booking.currentSnapshot ?? booking.snapshot)
				if (disruption) throw new AccessDeniedError('Vendor disruption requires the substitution consent workflow.')
				if (booking.hold.customerId !== context.actor.userId || booking.hold.workspaceId !== context.workspaceId) throw new AccessDeniedError()
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/customer/bookings/:bookingId/amend',
					{ bookingId, command },
					async () => {
						const now = this.dependencies.now()
						if (booking.state !== 'confirmed' || booking.version !== command.expectedVersion) throw new BookingHoldConflictError('Booking changed.')
						if (
							booking.customerAmendments >= original.policy.amendmentLimit ||
							new Date(original.start).getTime() - now.getTime() <= original.policy.partialRefundHours * 3600000
						)
							throw new BookingHoldConflictError('The amendment allowance or cutoff has been reached.')
						if (command.selection.listingId !== original.listingId) throw new BookingHoldConflictError('Amendments must use the purchased Service.')
						// This release is invisible outside the transaction; every failure restores the original allocation.
						await tx.staffAllocation.update({ where: { id: booking.allocationId }, data: { state: 'cancelled' } })
						const start = new Date(command.selection.start).toISOString()
						const selected = await this.scheduling.evaluate(
							tx,
							original.listingId,
							{ ...command.selection, from: start, to: new Date(new Date(start).getTime() + 60000).toISOString() },
							now,
							start,
						)
						if (
							!selected.availableStaffIds.length ||
							selected.result.configurationVersion !== command.selection.expectedConfigurationVersion ||
							selected.result.rulesVersion !== command.selection.expectedRulesVersion
						)
							throw new BookingHoldConflictError()
						const sameOption = original.optionId === command.selection.optionId
						const optionPriceCents = sameOption ? original.optionPriceCents : selected.option.priceCents
						const addons = selected.addons.map((addon) => {
							if (!addon) throw new BookingHoldConflictError()
							const old = sameOption ? original.addons.find((a) => a.id === addon.id) : undefined
							return { ...addon, priceCents: old?.priceCents ?? addon.priceCents }
						})
						const priceCents = optionPriceCents + addons.reduce((sum, addon) => sum + addon.priceCents, 0)
						const deltaCents = priceCents - original.priceCents
						if (deltaCents > 0 && command.extraPaymentOutcome !== 'succeeded')
							throw new BookingHoldConflictError('Extra payment did not succeed. The original Booking is retained.')
						const end = new Date(new Date(start).getTime() + selected.result.durationMinutes * 60000)
						const snapshot = BookingSnapshotSchema.parse({
							...original,
							optionId: command.selection.optionId,
							optionLabel: selected.option.label,
							optionPriceCents,
							addons,
							priceCents,
							mode: command.selection.mode,
							locationId: command.selection.locationId,
							locationLabel: selected.location?.label ?? null,
							locationCity: selected.location?.city ?? null,
							selectedStaffId: command.selection.staffId,
							start,
							end: end.toISOString(),
							timezone: selected.result.timezone,
							durationMinutes: selected.result.durationMinutes,
							bufferBeforeMinutes: selected.result.bufferBeforeMinutes,
							bufferAfterMinutes: selected.result.bufferAfterMinutes,
							configurationVersion: selected.result.configurationVersion,
							rulesVersion: selected.result.rulesVersion,
						})
						const allocation = await tx.staffAllocation.create({
							data: {
								staffId: selected.availableStaffIds[0],
								state: 'booked',
								startAt: new Date(new Date(start).getTime() - snapshot.bufferBeforeMinutes * 60000),
								endAt: new Date(end.getTime() + snapshot.bufferAfterMinutes * 60000),
							},
						})
						const amendment = await tx.bookingAmendment.create({
							data: {
								bookingId,
								version: booking.version + 1,
								actorId: context.actor.userId,
								actorKind: 'customer',
								previousSnapshot: goodsJson(original),
								snapshot: goodsJson(snapshot),
								deltaCents,
								paymentReference: deltaCents > 0 ? `local-booking-delta:${bookingId}:${booking.version + 1}` : null,
								amendedAt: now,
							},
						})
						if (deltaCents < 0)
							await tx.bookingRefund.create({
								data: { paymentId: booking.paymentId, semanticKey: `amendment:${amendment.id}`, amountCents: -deltaCents, createdAt: now },
							})
						await tx.bookingSubstitution.updateMany({ where: { bookingId, state: 'pending' }, data: { state: 'withdrawn', decidedAt: now } })
						await tx.booking.update({
							where: { id: bookingId },
							data: {
								currentSnapshot: goodsJson(snapshot),
								allocationId: allocation.id,
								customerAmendments: { increment: 1 },
								version: { increment: 1 },
							},
						})
						for (const workspaceId of new Set([booking.hold.workspaceId, vendor.workspaceId])) {
							await goodsAudit(tx, workspaceId, context.actor.userId, 'booking.amended', { bookingId, amendmentId: amendment.id, deltaCents })
							await goodsEmit(tx, () => this.dependencies.now(), workspaceId, 'BookingAmended', bookingId, booking.version + 1, key, {
								bookingId,
								amendmentId: amendment.id,
								deltaCents,
							})
						}
						return BookingAmendmentResultSchema.parse({
							bookingId,
							amendmentId: amendment.id,
							version: booking.version + 1,
							deltaCents,
							snapshot,
							replayed: false,
						})
					},
				)
				return BookingAmendmentResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}

	async cancel(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown, provider = false) {
		this.payments.assertLocal()
		const key = IdempotencyKeySchema.parse(keyInput),
			bookingId = z.string().uuid().parse(idInput),
			command = BookingCancellationCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { hold: true, payment: true } })
				if (!booking) throw new AccessDeniedError()
				const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
				await this.dependencies.lockWorkspace(tx, vendor.workspaceId)
				const snapshot = BookingSnapshotSchema.parse(booking.currentSnapshot ?? booking.snapshot)
				if (provider) {
					assertScope(context, {
						workspaceId: vendor.workspaceId,
						vendorId: vendor.id,
						...(snapshot.locationId ? { locationId: snapshot.locationId } : {}),
					})
					const member = await tx.vendorMembership.findFirst({ where: { vendorId: vendor.id, userId: context.actor.userId, revokedAt: null } })
					if (!member || (member.role !== 'vendor_owner' && !member.schedulingEnabled)) throw new AccessDeniedError()
				} else if (booking.hold.customerId !== context.actor.userId || booking.hold.workspaceId !== context.workspaceId) throw new AccessDeniedError()
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					provider ? 'POST /v1/vendor/bookings/:bookingId/cancel' : 'POST /v1/customer/bookings/:bookingId/cancel',
					{ bookingId, command },
					async () => {
						if (booking.version !== command.expectedVersion || booking.state !== 'confirmed')
							throw new BookingHoldConflictError('Booking changed or is no longer cancellable.')
						return this.cancelInTransaction(tx, bookingId, context.actor.userId, provider, command.reason, key)
					},
				)
				return BookingCancellationResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}

	/** Internal only: caller must hold checkout/Vendor locks and establish actor authority. */
	async cancelInTransaction(tx: Tx, bookingId: string, actorId: string | null, provider: boolean, reason: string, key: string | null) {
		const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { hold: true, payment: true } })
		if (booking.state !== 'confirmed') throw new BookingHoldConflictError('Booking is no longer cancellable.')
		const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
		const snapshot = BookingSnapshotSchema.parse(booking.currentSnapshot ?? booking.snapshot)
		const now = this.dependencies.now()
		const refundCents = bookingCancellationRefund(snapshot.policy, snapshot.priceCents, new Date(snapshot.start), now, provider)
		const cancellation = await tx.bookingCancellation.create({
			data: {
				bookingId,
				actorId: actorId ?? booking.hold.customerId,
				actorKind: provider ? 'vendor' : 'customer',
				reason: reason,
				refundCents,
				policySnapshot: goodsJson(snapshot.policy),
				cancelledAt: now,
			},
		})
		await tx.bookingSubstitution.updateMany({ where: { bookingId, state: 'pending' }, data: { state: 'withdrawn', decidedAt: now } })
		await tx.booking.update({ where: { id: bookingId }, data: { state: 'cancelled', version: { increment: 1 } } })
		await tx.staffAllocation.update({ where: { id: booking.allocationId }, data: { state: 'cancelled' } })
		if (refundCents > 0)
			await tx.bookingRefund.create({
				data: { paymentId: booking.paymentId, semanticKey: `cancellation:${bookingId}`, amountCents: refundCents, createdAt: now },
			})
		for (const workspaceId of new Set([booking.hold.workspaceId, vendor.workspaceId])) {
			await goodsAudit(tx, workspaceId, actorId, 'booking.cancelled', {
				bookingId,
				cancellationId: cancellation.id,
				refundCents,
				actorKind: cancellation.actorKind,
			})
			await goodsEmit(tx, () => this.dependencies.now(), workspaceId, 'BookingCancelled', bookingId, booking.version + 1, key, {
				bookingId,
				cancellationId: cancellation.id,
				refundCents,
			})
		}
		return BookingCancellationResultSchema.parse({
			bookingId,
			cancellationId: cancellation.id,
			state: 'cancelled',
			refundCents,
			cancelledAt: now.toISOString(),
			replayed: false,
		})
	}

	async reconcileRefunds() {
		this.payments.assertLocal()
		const due = await this.dependencies.db.bookingRefund.findMany({ where: { state: 'pending' }, orderBy: { id: 'asc' }, take: 100 })
		for (const refund of due) {
			const result = await this.payments.refund({ operationId: refund.id, paymentId: refund.paymentId, amountCents: refund.amountCents })
			await this.dependencies.db.$transaction(async (tx) => {
				await this.lock(tx)
				const current = await tx.bookingRefund.findUniqueOrThrow({ where: { id: refund.id } })
				if (current.state !== 'pending') return
				await tx.bookingRefund.update({ where: { id: refund.id }, data: { state: 'succeeded', reference: result.reference } })
				const completed = await tx.bookingRefund.aggregate({ where: { paymentId: refund.paymentId, state: 'succeeded' }, _sum: { amountCents: true } })
				const original = await tx.bookingPayment.findUniqueOrThrow({
					where: { id: refund.paymentId },
					include: { booking: { include: { amendments: true } } },
				})
				const captured = original.amountCents + (original.booking?.amendments ?? []).reduce((sum, a) => sum + Math.max(0, a.deltaCents), 0)
				await tx.bookingPayment.update({
					where: { id: refund.paymentId },
					data: { state: (completed._sum.amountCents ?? 0) >= captured ? 'refunded' : 'succeeded' },
				})
				const payment = await tx.bookingPayment.findUniqueOrThrow({ where: { id: refund.paymentId }, include: { hold: true } })
				await goodsAudit(tx, payment.hold.workspaceId, null, 'booking.refund-completed', { refundId: refund.id, amountCents: refund.amountCents })
				await goodsEmit(tx, () => this.dependencies.now(), payment.hold.workspaceId, 'BookingRefundCompleted', refund.id, 1, null, {
					refundId: refund.id,
					paymentId: refund.paymentId,
				})
			})
		}
		return due.length
	}
}
