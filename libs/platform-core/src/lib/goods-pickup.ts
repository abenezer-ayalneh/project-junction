import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
	type AccessContext,
	GoodsCustomerPickupReadSchema,
	GoodsFulfillmentReadSchema,
	GoodsFulfillmentResultSchema,
	GoodsPickupAcknowledgementCommandSchema,
	GoodsPickupAcknowledgementResultSchema,
	GoodsPickupCollectionCommandSchema,
	GoodsPickupInspectionCommandSchema,
	GoodsQuoteSnapshotSchema,
	IdempotencyKeySchema,
} from 'contracts'
import QRCode from 'qrcode'
import { z } from 'zod'

import { type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertRequiredMfa, assertScope } from './access.js'
import { GoodsCancellation } from './goods-cancellation.js'
import { GoodsHandoffCodec } from './goods-handoff-codec.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'

type Transaction = Prisma.TransactionClient
const quantities = z.array(z.object({ lineId: z.string().uuid(), quantity: z.number().int().positive() }).strict()).min(1)
const hour = 3600000
const loaded = {
	order: { include: { purchase: true, lines: { include: { cancellationLines: true } } } },
	delivery: { include: { handoff: true, inspection: { include: { cancellation: { include: { refund: true } } } } } },
	handoff: true,
	inspection: { include: { cancellation: { include: { refund: true } } } },
} as const

export class GoodsPickup {
	private readonly codec = new GoodsHandoffCodec()
	constructor(
		private readonly dependencies: GoodsDependencies,
		private readonly cancellations: GoodsCancellation,
	) {}
	private async lock(tx: Transaction) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
	}
	private authorize(context: AccessContext, order: { vendorId: string; vendorWorkspaceId: string; locationId: string }, ownerOnly = false) {
		if (
			!context.memberships.some(
				(member) =>
					member.active &&
					member.vendorId === order.vendorId &&
					(member.role === 'vendor_owner' || (!ownerOnly && member.role === 'vendor_staff' && member.goodsFulfillmentEnabled)),
			)
		)
			throw new AccessDeniedError()
		assertScope(context, { workspaceId: order.vendorWorkspaceId, vendorId: order.vendorId, locationId: order.locationId })
		assertRequiredMfa(context)
	}
	private async load(tx: Transaction, id: string) {
		const row = await tx.goodsFulfillment.findUnique({ where: { id }, include: loaded })
		if (!row) throw new AccessDeniedError()
		return row
	}
	private async view(tx: Transaction, id: string) {
		const row = await this.load(tx, id)
		const now = this.dependencies.now()
		const handoff = row.delivery?.handoff ?? row.handoff
		const inspection = row.delivery?.inspection ?? row.inspection
		return GoodsFulfillmentReadSchema.parse({
			fulfillmentId: row.id,
			orderId: row.orderId,
			method: row.method,
			state: row.delivery?.state ?? row.state,
			version: row.version + (row.delivery?.version ?? 0),
			snapshot: row.snapshot,
			quantitySnapshot: row.delivery?.quantitySnapshot ?? row.quantitySnapshot,
			remainingLines: row.order.lines.map((line) => {
				const original = GoodsQuoteSnapshotSchema.shape.groups.element.shape.lines.element.parse(line.snapshot)
				return {
					lineId: line.id,
					listingId: original.listingId,
					sku: original.sku,
					quantity: original.quantity - line.cancellationLines.reduce((sum, cancel) => sum + cancel.quantity, 0),
				}
			}),
			preparedAt: row.preparedAt?.toISOString() ?? null,
			readyAt: row.readyAt?.toISOString() ?? null,
			pickupWindowEndsAt: row.pickupWindowEndsAt?.toISOString() ?? null,
			pickupGraceEndsAt: row.pickupGraceEndsAt?.toISOString() ?? null,
			handoffAt: handoff?.handedOffAt.toISOString() ?? null,
			pickupPhase:
				row.state !== 'ready_for_pickup'
					? row.readyAt
						? 'ended'
						: 'not_ready'
					: row.pickupWindowEndsAt && now >= row.pickupWindowEndsAt
						? 'grace'
						: 'window',
			codeLocked: (row.delivery?.rejectedProofs ?? row.failedCodeAttempts) >= 5,
			handoff: handoff ? { handoffId: handoff.id, method: handoff.method, handedOffAt: handoff.handedOffAt.toISOString() } : null,
			inspection: inspection
				? {
						inspectionId: inspection.id,
						inspectedAt: inspection.inspectedAt.toISOString(),
						cancellationId: inspection.cancellationId,
						refundId: inspection.cancellation.refundId,
						refundState: inspection.cancellation.refund.state,
					}
				: null,
		})
	}
	private async expireOne(tx: Transaction, id: string) {
		const row = await this.load(tx, id)
		if (row.state !== 'ready_for_pickup' || !row.pickupGraceEndsAt || row.pickupGraceEndsAt > this.dependencies.now()) return false
		await this.dependencies.lockWorkspace(tx, row.order.vendorWorkspaceId)
		await tx.goodsFulfillment.update({
			where: { id },
			data: { state: 'inspection_pending', endedAt: this.dependencies.now(), codeCiphertext: null, version: { increment: 1 } },
		})
		await goodsAudit(tx, row.order.vendorWorkspaceId, null, 'goods.pickup-expired', { fulfillmentId: id, orderId: row.orderId })
		await goodsEmit(tx, () => this.dependencies.now(), row.order.vendorWorkspaceId, 'GoodsPickupExpired', id, row.version + 1, null, {
			fulfillmentId: id,
			orderId: row.orderId,
			inspectionRequired: true,
		})
		await goodsEmit(tx, () => this.dependencies.now(), row.order.purchase.workspaceId, 'GoodsPickupExpired', id, row.version + 1, null, {
			fulfillmentId: id,
			orderId: row.orderId,
			inspectionRequired: true,
		})
		return true
	}
	async expire() {
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const rows = await tx.goodsFulfillment.findMany({
					where: { state: 'ready_for_pickup', pickupGraceEndsAt: { lte: this.dependencies.now() } },
					orderBy: [{ pickupGraceEndsAt: 'asc' }, { id: 'asc' }],
					take: 100,
				})
				let count = 0
				for (const row of rows) if (await this.expireOne(tx, row.id)) count++
				return count
			},
			{ timeout: 30000 },
		)
	}
	async byOrder(sessionId: string | undefined, orderInput: string, customer: boolean) {
		const orderId = z.string().uuid().parse(orderInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await tx.goodsFulfillment.findUnique({ where: { orderId }, include: loaded })
				if (!row) throw new AccessDeniedError()
				if (customer) {
					if (row.order.purchase.customerId !== context.actor.userId || row.order.purchase.workspaceId !== context.workspaceId)
						throw new AccessDeniedError()
				} else this.authorize(context, row.order)
				await this.expireOne(tx, row.id)
				const current = await this.load(tx, row.id)
				const base = await this.view(tx, row.id)
				if (!customer) return base
				let collectionProof = null
				if (current.state === 'ready_for_pickup' && current.codeCiphertext && current.failedCodeAttempts < 5) {
					const code = this.codec.decrypt(current.codeCiphertext, current.id)
					const qrPayload = `junction-pickup-v1:${current.id}:${code}`
					const svg = await QRCode.toString(qrPayload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
					collectionProof = {
						code: code.match(/.{1,4}/g)?.join('-') ?? code,
						qrPayload,
						qrSvgDataUri: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
					}
				}
				return GoodsCustomerPickupReadSchema.parse({ ...base, collectionProof })
			},
			{ timeout: 30000 },
		)
	}
	async prepare(sessionId: string | undefined, keyInput: string | undefined, idInput: string) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const id = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await this.load(tx, id)
				this.authorize(context, row.order)
				await this.dependencies.lockWorkspace(tx, row.order.vendorWorkspaceId)
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/goods/fulfillments/:fulfillmentId/prepare',
					{ fulfillmentId: id },
					async () => {
						if (row.state !== 'pending' || row.order.state === 'cancelled')
							throw new GoodsCheckoutConflictError('Only an active confirmed Order can begin preparation.')
						await tx.goodsFulfillment.update({
							where: { id },
							data: { state: 'preparing', preparedAt: this.dependencies.now(), version: { increment: 1 } },
						})
						await goodsAudit(tx, row.order.vendorWorkspaceId, context.actor.userId, 'goods.order-preparing', {
							fulfillmentId: id,
							orderId: row.orderId,
						})
						await goodsEmit(tx, () => this.dependencies.now(), row.order.vendorWorkspaceId, 'GoodsOrderPreparing', id, row.version + 1, key, {
							fulfillmentId: id,
							orderId: row.orderId,
						})
						return this.view(tx, id)
					},
				)
				return GoodsFulfillmentResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async ready(sessionId: string | undefined, keyInput: string | undefined, idInput: string) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const id = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await this.load(tx, id)
				this.authorize(context, row.order)
				await this.dependencies.lockWorkspace(tx, row.order.vendorWorkspaceId)
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/goods/fulfillments/:fulfillmentId/ready',
					{ fulfillmentId: id },
					async () => {
						if (row.method !== 'pickup' || row.state !== 'preparing' || row.order.state === 'cancelled')
							throw new GoodsCheckoutConflictError('Prepare an active pickup Order before marking it ready.')
						const group = GoodsQuoteSnapshotSchema.shape.groups.element.parse(row.snapshot)
						const selected = row.order.lines.flatMap((line) => {
							const original = GoodsQuoteSnapshotSchema.shape.groups.element.shape.lines.element.parse(line.snapshot)
							const quantity = original.quantity - line.cancellationLines.reduce((total, cancel) => total + cancel.quantity, 0)
							return quantity > 0 ? [{ lineId: line.id, quantity }] : []
						})
						quantities.parse(selected)
						const code = randomBytes(8).toString('hex').toUpperCase()
						const readyAt = this.dependencies.now()
						await tx.goodsFulfillment.update({
							where: { id },
							data: {
								state: 'ready_for_pickup',
								quantitySnapshot: goodsJson(selected),
								readyAt,
								pickupWindowEndsAt: new Date(readyAt.getTime() + (group.pickupWindowHours ?? 72) * hour),
								pickupGraceEndsAt: new Date(readyAt.getTime() + ((group.pickupWindowHours ?? 72) + (group.pickupGraceHours ?? 48)) * hour),
								codeCiphertext: this.codec.encrypt(code, id),
								codeDigest: this.codec.digest(id, code),
								version: { increment: 1 },
							},
						})
						await goodsAudit(tx, row.order.vendorWorkspaceId, context.actor.userId, 'goods.pickup-ready', {
							fulfillmentId: id,
							orderId: row.orderId,
						})
						await goodsEmit(tx, () => this.dependencies.now(), row.order.purchase.workspaceId, 'GoodsPickupReady', id, row.version + 1, key, {
							fulfillmentId: id,
							orderId: row.orderId,
						})
						return this.view(tx, id)
					},
				)
				return GoodsFulfillmentResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async acknowledge(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const id = z.string().uuid().parse(idInput)
		const command = GoodsPickupAcknowledgementCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await this.load(tx, id)
				if (row.order.purchase.customerId !== context.actor.userId || row.order.purchase.workspaceId !== context.workspaceId)
					throw new AccessDeniedError()
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/customer/goods/fulfillments/:fulfillmentId/acknowledgements',
					{ fulfillmentId: id, command },
					async () => {
						if (row.state !== 'ready_for_pickup' || !row.pickupGraceEndsAt || row.pickupGraceEndsAt <= this.dependencies.now())
							throw new GoodsCheckoutConflictError('Pickup is not available for acknowledgement. Refresh the Order.')
						const ack = await tx.goodsPickupAcknowledgement.create({
							data: {
								fulfillmentId: id,
								customerId: context.actor.userId,
								reason: command.reason,
								statement: command.statement,
								createdAt: this.dependencies.now(),
							},
						})
						await goodsAudit(tx, row.order.purchase.workspaceId, context.actor.userId, 'goods.pickup-acknowledged', {
							fulfillmentId: id,
							acknowledgementId: ack.id,
							reason: command.reason,
						})
						await goodsEmit(tx, () => this.dependencies.now(), row.order.purchase.workspaceId, 'GoodsPickupAcknowledged', id, row.version, key, {
							fulfillmentId: id,
							acknowledgementId: ack.id,
						})
						return GoodsPickupAcknowledgementResultSchema.parse({
							acknowledgementId: ack.id,
							fulfillmentId: id,
							acknowledgedAt: ack.createdAt.toISOString(),
							replayed: false,
						})
					},
				)
				return GoodsPickupAcknowledgementResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async collect(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const id = z.string().uuid().parse(idInput)
		const command = GoodsPickupCollectionCommandSchema.parse(input)
		const outcome = await this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await this.load(tx, id)
				this.authorize(context, row.order)
				await this.dependencies.lockWorkspace(tx, row.order.vendorWorkspaceId)
				if (row.state === 'ready_for_pickup' && row.pickupGraceEndsAt && row.pickupGraceEndsAt <= this.dependencies.now()) {
					await this.expireOne(tx, id)
					return { error: 'Pickup expired. Inspection is required before stock or refund recovery.' }
				}
				if (command.proof.method !== 'fallback' && row.state === 'ready_for_pickup') {
					const proof = command.proof
					const code =
						proof.method === 'code'
							? proof.code.replace(/[-\s]/g, '').toUpperCase()
							: proof.payload.startsWith(`junction-pickup-v1:${id}:`)
								? proof.payload.slice(`junction-pickup-v1:${id}:`.length)
								: ''
					const supplied = this.codec.digest(id, code)
					if (row.failedCodeAttempts >= 5 || !row.codeDigest || !timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(row.codeDigest, 'hex'))) {
						if (row.failedCodeAttempts < 5) {
							await tx.goodsFulfillment.update({ where: { id }, data: { failedCodeAttempts: { increment: 1 }, version: { increment: 1 } } })
							await goodsAudit(tx, row.order.vendorWorkspaceId, context.actor.userId, 'goods.pickup-proof-rejected', { fulfillmentId: id })
							await goodsEmit(
								tx,
								() => this.dependencies.now(),
								row.order.vendorWorkspaceId,
								'GoodsPickupProofRejected',
								id,
								row.version + 1,
								null,
								{ fulfillmentId: id },
							)
						}
						return { error: 'Code could not be verified. Check the Customer code or use the controlled fallback.' }
					}
				}
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/goods/fulfillments/:fulfillmentId/collect',
					{ fulfillmentId: id, command },
					async () => {
						if (row.state !== 'ready_for_pickup') throw new GoodsCheckoutConflictError('Only a ready pickup may be collected once.')
						let acknowledgementId: string | null = null
						let evidence: unknown = { method: command.proof.method, proofDigest: row.codeDigest }
						if (command.proof.method === 'fallback') {
							const proof = command.proof
							const ack = await tx.goodsPickupAcknowledgement.findUnique({ where: { id: proof.acknowledgementId } })
							if (
								!ack ||
								ack.fulfillmentId !== id ||
								ack.customerId !== row.order.purchase.customerId ||
								ack.customerId === context.actor.userId ||
								ack.reason !== proof.reason ||
								!row.readyAt ||
								ack.createdAt < row.readyAt ||
								ack.createdAt > this.dependencies.now() ||
								ack.createdAt.getTime() < this.dependencies.now().getTime() - 15 * 60_000
							)
								throw new AccessDeniedError('Fallback requires this Customer acknowledgement and a distinct assigned witness.')
							acknowledgementId = ack.id
							evidence = {
								method: 'fallback',
								reason: proof.reason,
								customerStatement: ack.statement,
								witnessStatement: proof.witnessStatement,
								customerId: ack.customerId,
								witnessId: context.actor.userId,
							}
						}
						const handoffAt = this.dependencies.now()
						await tx.goodsPickupHandoff.create({
							data: {
								fulfillmentId: id,
								method: command.proof.method,
								actorId: context.actor.userId,
								customerId: row.order.purchase.customerId,
								acknowledgementId,
								evidence: goodsJson(evidence),
								handedOffAt: handoffAt,
							},
						})
						await tx.goodsFulfillment.update({
							where: { id },
							data: { state: 'collected', handoffAt, endedAt: handoffAt, codeCiphertext: null, version: { increment: 1 } },
						})
						await goodsAudit(tx, row.order.vendorWorkspaceId, context.actor.userId, 'goods.pickup-collected', {
							fulfillmentId: id,
							method: command.proof.method,
						})
						await goodsEmit(tx, () => this.dependencies.now(), row.order.purchase.workspaceId, 'GoodsPickupCollected', id, row.version + 1, key, {
							fulfillmentId: id,
							orderId: row.orderId,
							handoffAt: handoffAt.toISOString(),
							method: command.proof.method,
						})
						return this.view(tx, id)
					},
				)
				return { value: GoodsFulfillmentResultSchema.parse({ ...result.outcome, replayed: result.replayed }) }
			},
			{ timeout: 30000 },
		)
		if ('error' in outcome) throw new GoodsCheckoutConflictError(outcome.error)
		return outcome.value
	}
	async inspect(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const id = z.string().uuid().parse(idInput)
		const command = GoodsPickupInspectionCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await this.load(tx, id)
				this.authorize(context, row.order, true)
				await this.dependencies.lockWorkspace(tx, row.order.vendorWorkspaceId)
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/goods/fulfillments/:fulfillmentId/inspect',
					{ fulfillmentId: id, command },
					async () => {
						if (row.state !== 'inspection_pending' || row.method !== 'pickup')
							throw new GoodsCheckoutConflictError('Only expired pickups awaiting inspection can be inspected.')
						const frozen = quantities.parse(row.quantitySnapshot)
						if (
							frozen.length !== command.lines.length ||
							frozen.some((line) => !command.lines.some((candidate) => candidate.lineId === line.lineId && candidate.quantity === line.quantity))
						)
							throw new GoodsCheckoutConflictError('Inspect every remaining allocated quantity exactly once.')
						const cancellation = await this.cancellations.cancelInTransaction(
							tx,
							context,
							key,
							row.orderId,
							{ note: command.evidence.slice(0, 500), lines: command.lines },
							'vendor',
							'pickup_expiry',
						)
						await tx.goodsPickupInspection.create({
							data: {
								fulfillmentId: id,
								cancellationId: cancellation.cancellationId,
								actorId: context.actor.userId,
								evidence: goodsJson({ statement: command.evidence, lines: command.lines }),
								inspectedAt: this.dependencies.now(),
							},
						})
						await tx.goodsFulfillment.update({
							where: { id },
							data: { state: 'inspection_completed', endedAt: this.dependencies.now(), version: { increment: 1 } },
						})
						await goodsAudit(tx, row.order.vendorWorkspaceId, context.actor.userId, 'goods.pickup-inspected', {
							fulfillmentId: id,
							cancellationId: cancellation.cancellationId,
						})
						await goodsEmit(tx, () => this.dependencies.now(), row.order.purchase.workspaceId, 'GoodsPickupInspected', id, row.version + 1, key, {
							fulfillmentId: id,
							cancellationId: cancellation.cancellationId,
						})
						return this.view(tx, id)
					},
				)
				return GoodsFulfillmentResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
}
