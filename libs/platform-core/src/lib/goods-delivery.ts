import { randomBytes, timingSafeEqual } from 'node:crypto'

import {
	type AccessContext,
	GoodsCustomerDeliveryReadSchema,
	GoodsDeliveryAcknowledgementCommandSchema,
	GoodsDeliveryAcknowledgementResultSchema,
	GoodsDeliveryHandoffCommandSchema,
	GoodsDeliveryMilestoneCommandSchema,
	GoodsDeliveryMilestoneResultSchema,
	GoodsDeliveryProgressReadSchema,
	GoodsPickupInspectionCommandSchema,
	GoodsQuoteSnapshotSchema,
	IdempotencyKeySchema,
} from 'contracts'
import QRCode from 'qrcode'
import { z } from 'zod'

import { type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertRequiredMfa, assertScope } from './access.js'
import { GoodsCancellation } from './goods-cancellation.js'
import { advanceDelivery, type DeliveryProgress } from './goods-delivery-policy.js'
import { GoodsHandoffCodec } from './goods-handoff-codec.js'
import { goodsAudit, GoodsCheckoutConflictError, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { stableHash } from './idempotency.js'

type Transaction = Prisma.TransactionClient
export class GoodsDelivery {
	private readonly codec = new GoodsHandoffCodec()
	constructor(
		private readonly dependencies: GoodsDependencies,
		private readonly cancellations: GoodsCancellation,
	) {}
	private newCode(id: string) {
		const code = randomBytes(8).toString('hex').toUpperCase()
		return { codeCiphertext: this.codec.encrypt(code, id), codeDigest: this.codec.digest(id, code) }
	}
	private authorize(context: AccessContext, order: { vendorId: string; vendorWorkspaceId: string; locationId: string }) {
		if (
			!context.memberships.some(
				(member) =>
					member.active &&
					member.vendorId === order.vendorId &&
					(member.role === 'vendor_owner' || (member.role === 'vendor_staff' && member.goodsFulfillmentEnabled)),
			)
		)
			throw new AccessDeniedError()
		assertScope(context, { workspaceId: order.vendorWorkspaceId, vendorId: order.vendorId, locationId: order.locationId })
		assertRequiredMfa(context)
	}
	private async view(tx: Transaction, fulfillmentId: string) {
		const row = await tx.goodsDeliveryProgress.findUniqueOrThrow({ where: { fulfillmentId }, include: { events: { orderBy: { version: 'asc' } } } })
		return GoodsDeliveryProgressReadSchema.parse({
			fulfillmentId,
			state: row.state,
			attempt: row.attempt,
			address: row.address,
			version: row.version,
			codeLocked: row.rejectedProofs >= 5,
			quantitySnapshot: row.quantitySnapshot,
			failedAt: row.failedAt?.toISOString() ?? null,
			retryDeadline: row.retryDeadline?.toISOString() ?? null,
			milestones: row.events.map((event) => ({ action: event.action, occurredAt: event.occurredAt.toISOString(), version: event.version })),
		})
	}
	async milestone(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = GoodsDeliveryMilestoneCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const fulfillment = await tx.goodsFulfillment.findUnique({
					where: { id },
					include: { delivery: true, order: { include: { purchase: true, lines: { include: { cancellationLines: true } } } } },
				})
				if (!fulfillment) throw new AccessDeniedError()
				this.authorize(context, fulfillment.order)
				await this.dependencies.lockWorkspace(tx, fulfillment.order.vendorWorkspaceId)
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/goods/fulfillments/:fulfillmentId/delivery-milestones',
					{ fulfillmentId: id, command },
					async () => {
						const snapshot = GoodsQuoteSnapshotSchema.shape.groups.element.parse(fulfillment.snapshot)
						if (
							fulfillment.method !== 'delivery' ||
							snapshot.fulfillment.method !== 'delivery' ||
							fulfillment.state !== 'preparing' ||
							fulfillment.order.state === 'cancelled'
						)
							throw new GoodsCheckoutConflictError('Prepare an active paid delivery Order before recording delivery milestones.')
						const current = fulfillment.delivery
						const progress: DeliveryProgress = current
							? {
									state: current.state as DeliveryProgress['state'],
									attempt: current.attempt,
									address: current.address as DeliveryProgress['address'],
									failedAt: current.failedAt?.toISOString() ?? null,
									retryDeadline: current.retryDeadline?.toISOString() ?? null,
								}
							: { state: 'preparing', attempt: 1, address: snapshot.fulfillment.address, failedAt: null, retryDeadline: null }
						if (!current && command.action !== 'dispatch') throw new GoodsCheckoutConflictError('Dispatch must be the first delivery milestone.')
						if (command.action === 'retry') {
							const acknowledgement = await tx.goodsDeliveryAcknowledgement.findUnique({ where: { id: command.acknowledgementId } })
							if (
								!current ||
								!acknowledgement ||
								acknowledgement.progressId !== current.id ||
								acknowledgement.customerId !== fulfillment.order.purchase.customerId ||
								acknowledgement.purpose !== 'correction' ||
								stableHash((acknowledgement.evidence as { address?: unknown }).address) !== stableHash(command.address) ||
								!current.failedAt ||
								acknowledgement.acknowledgedAt < current.failedAt ||
								acknowledgement.acknowledgedAt > this.dependencies.now()
							)
								throw new AccessDeniedError('A Customer-confirmed correction for this failed attempt is required.')
							if (!snapshot.deliveryZone) throw new GoodsCheckoutConflictError('Original delivery zone is missing.')
							const polygon = JSON.stringify({ type: 'Polygon', coordinates: [snapshot.deliveryZone.polygon] })
							const [eligible] = await tx.$queryRaw<
								Array<{ covered: boolean }>
							>`SELECT ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(${polygon}),4326),ST_SetSRID(ST_MakePoint(${command.address.point[0]},${command.address.point[1]}),4326)) AS covered`
							if (!eligible?.covered)
								throw new GoodsCheckoutConflictError(
									'The corrected delivery pin is outside the original paid zone. Resolve through aftercare instead of changing the paid fee.',
								)
						}
						const next = advanceDelivery(
							progress,
							command.action === 'retry' ? { action: command.action, address: command.address, correction: command.correction } : command,
							snapshot,
							this.dependencies.now(),
						)
						const version = (current?.version ?? 0) + 1
						const data = {
							...(next.state === 'inspection_pending' ? { codeCiphertext: '' } : {}),
							state: next.state,
							attempt: next.attempt,
							address: goodsJson(next.address),
							failedAt: next.failedAt ? new Date(next.failedAt) : null,
							retryDeadline: next.retryDeadline ? new Date(next.retryDeadline) : null,
							version,
						}
						const row = current
							? await tx.goodsDeliveryProgress.update({ where: { id: current.id }, data })
							: await tx.goodsDeliveryProgress.create({
									data: {
										...data,
										fulfillmentId: id,
										quantitySnapshot: goodsJson(
											fulfillment.order.lines.flatMap((line) => {
												const original = GoodsQuoteSnapshotSchema.shape.groups.element.shape.lines.element.parse(line.snapshot)
												const quantity = original.quantity - line.cancellationLines.reduce((sum, item) => sum + item.quantity, 0)
												return quantity > 0 ? [{ lineId: line.id, quantity }] : []
											}),
										),
										...this.newCode(id),
									},
								})
						await tx.goodsDeliveryEvent.create({
							data: {
								progressId: row.id,
								version,
								action: command.action,
								actorId: context.actor.userId,
								evidence: goodsJson(command),
								occurredAt: this.dependencies.now(),
							},
						})
						await goodsAudit(tx, fulfillment.order.vendorWorkspaceId, context.actor.userId, 'goods.delivery-milestone', {
							fulfillmentId: id,
							action: command.action,
							attempt: next.attempt,
							version,
						})
						await goodsEmit(
							tx,
							() => this.dependencies.now(),
							fulfillment.order.purchase.workspaceId,
							'GoodsDeliveryMilestoneRecorded',
							id,
							version,
							key,
							{ fulfillmentId: id, action: command.action, state: next.state, attempt: next.attempt },
						)
						return this.view(tx, id)
					},
				)
				return GoodsDeliveryMilestoneResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async acknowledge(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const id = z.string().uuid().parse(idInput),
			key = IdempotencyKeySchema.parse(keyInput),
			command = GoodsDeliveryAcknowledgementCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await tx.goodsDeliveryProgress.findUnique({
					where: { fulfillmentId: id },
					include: { fulfillment: { include: { order: { include: { purchase: true } } } } },
				})
				if (
					!row ||
					row.fulfillment.order.purchase.customerId !== context.actor.userId ||
					row.fulfillment.order.purchase.workspaceId !== context.workspaceId
				)
					throw new AccessDeniedError()
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/customer/goods/fulfillments/:fulfillmentId/delivery-acknowledgements',
					{ fulfillmentId: id, command },
					async () => {
						if (
							(command.purpose === 'correction' &&
								(row.state !== 'delivery_failed' || !row.retryDeadline || row.retryDeadline <= this.dependencies.now())) ||
							(command.purpose === 'handoff' && row.state !== 'out_for_delivery')
						)
							throw new GoodsCheckoutConflictError('Delivery is not awaiting this Customer acknowledgement.')
						const ack = await tx.goodsDeliveryAcknowledgement.create({
							data: {
								progressId: row.id,
								customerId: context.actor.userId,
								purpose: command.purpose,
								evidence: goodsJson(command),
								acknowledgedAt: this.dependencies.now(),
							},
						})
						await goodsAudit(tx, context.workspaceId, context.actor.userId, 'goods.delivery-acknowledged', {
							fulfillmentId: id,
							acknowledgementId: ack.id,
							purpose: command.purpose,
						})
						return { acknowledgementId: ack.id, fulfillmentId: id, purpose: command.purpose, replayed: false }
					},
				)
				return GoodsDeliveryAcknowledgementResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async inspect(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const id = z.string().uuid().parse(idInput),
			key = IdempotencyKeySchema.parse(keyInput),
			command = GoodsPickupInspectionCommandSchema.parse(input)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const row = await tx.goodsDeliveryProgress.findUnique({ where: { fulfillmentId: id }, include: { fulfillment: { include: { order: true } } } })
				if (!row) throw new AccessDeniedError()
				this.authorize(context, row.fulfillment.order)
				if (
					!context.memberships.some((member) => member.active && member.vendorId === row.fulfillment.order.vendorId && member.role === 'vendor_owner')
				)
					throw new AccessDeniedError()
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/goods/fulfillments/:fulfillmentId/delivery-inspection',
					{ fulfillmentId: id, command },
					async () => {
						if (row.state !== 'inspection_pending')
							throw new GoodsCheckoutConflictError('Delivery failure must reach inspection before stock or refund recovery.')
						const frozen = z.array(z.object({ lineId: z.string().uuid(), quantity: z.number().int().positive() })).parse(row.quantitySnapshot)
						if (
							frozen.length !== command.lines.length ||
							frozen.some((line) => !command.lines.some((item) => item.lineId === line.lineId && item.quantity === line.quantity))
						)
							throw new GoodsCheckoutConflictError('Inspect all remaining delivery quantities exactly once.')
						const cancellation = await this.cancellations.cancelInTransaction(
							tx,
							context,
							key,
							row.fulfillment.orderId,
							{ note: command.evidence.slice(0, 500), lines: command.lines },
							'vendor',
							'delivery_failure',
						)
						const now = this.dependencies.now()
						await tx.goodsDeliveryInspection.create({
							data: {
								progressId: row.id,
								cancellationId: cancellation.cancellationId,
								actorId: context.actor.userId,
								evidence: goodsJson(command),
								inspectedAt: now,
							},
						})
						await tx.goodsDeliveryProgress.update({ where: { id: row.id }, data: { state: 'inspection_completed', version: { increment: 1 } } })
						await tx.goodsDeliveryEvent.create({
							data: {
								progressId: row.id,
								version: row.version + 1,
								action: 'inspected',
								actorId: context.actor.userId,
								evidence: { cancellationId: cancellation.cancellationId },
								occurredAt: now,
							},
						})
						await goodsAudit(tx, row.fulfillment.order.vendorWorkspaceId, context.actor.userId, 'goods.delivery-inspected', {
							fulfillmentId: id,
							cancellationId: cancellation.cancellationId,
						})
						await goodsEmit(tx, () => now, row.fulfillment.order.vendorWorkspaceId, 'GoodsDeliveryMilestoneRecorded', id, row.version + 1, key, {
							fulfillmentId: id,
							action: 'inspected',
							state: 'inspection_completed',
							cancellationId: cancellation.cancellationId,
						})
						return this.view(tx, id)
					},
				)
				return GoodsDeliveryMilestoneResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}

	async handoff(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = GoodsDeliveryHandoffCommandSchema.parse(input)
		const outcome = await this.dependencies.db.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout',0))`
				const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
				const fulfillment = await tx.goodsFulfillment.findUnique({
					where: { id },
					include: { delivery: true, order: { include: { purchase: true, lines: { include: { cancellationLines: true } } } } },
				})
				if (!fulfillment?.delivery) throw new AccessDeniedError()
				this.authorize(context, fulfillment.order)
				await this.dependencies.lockWorkspace(tx, fulfillment.order.vendorWorkspaceId)
				const current = fulfillment.delivery
				if (current.state === 'out_for_delivery' && command.proof.method !== 'fallback') {
					const proof = command.proof
					const code =
						proof.method === 'code'
							? proof.code.replace(/[-\s]/g, '').toUpperCase()
							: proof.payload.startsWith(`junction-delivery-v1:${id}:`)
								? proof.payload.slice(`junction-delivery-v1:${id}:`.length)
								: ''
					if (
						current.rejectedProofs >= 5 ||
						!timingSafeEqual(Buffer.from(this.codec.digest(id, code), 'hex'), Buffer.from(current.codeDigest, 'hex'))
					) {
						if (current.rejectedProofs < 5) {
							await tx.goodsDeliveryProgress.update({
								where: { id: current.id },
								data: { rejectedProofs: { increment: 1 }, version: { increment: 1 } },
							})
							await tx.goodsDeliveryEvent.create({
								data: {
									progressId: current.id,
									version: current.version + 1,
									action: 'proof_rejected',
									actorId: context.actor.userId,
									evidence: {},
									occurredAt: this.dependencies.now(),
								},
							})
							await goodsAudit(tx, fulfillment.order.vendorWorkspaceId, context.actor.userId, 'goods.delivery-proof-rejected', {
								fulfillmentId: id,
							})
						}
						return { error: 'Delivery proof could not be verified. Check the Customer code or use controlled fallback.' }
					}
				}
				const result = await this.dependencies.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/goods/fulfillments/:fulfillmentId/delivery-handoff',
					{ fulfillmentId: id, command },
					async () => {
						const row = fulfillment.delivery
						if (!row) throw new AccessDeniedError()
						const snapshot = GoodsQuoteSnapshotSchema.shape.groups.element.parse(fulfillment.snapshot)

						let acknowledgementId: string | null = null
						let evidence: Prisma.InputJsonValue = { proofDigest: row.codeDigest, attempt: row.attempt }
						if (command.proof.method === 'fallback') {
							const ack = await tx.goodsDeliveryAcknowledgement.findUnique({ where: { id: command.proof.acknowledgementId } })
							if (
								!ack ||
								ack.progressId !== row.id ||
								ack.purpose !== 'handoff' ||
								ack.customerId !== fulfillment.order.purchase.customerId ||
								ack.customerId === context.actor.userId ||
								ack.acknowledgedAt > this.dependencies.now() ||
								ack.acknowledgedAt.getTime() < this.dependencies.now().getTime() - 15 * 60000 ||
								(ack.evidence as { reason?: string }).reason !== command.proof.reason
							)
								throw new AccessDeniedError('Fallback requires fresh Customer acknowledgement and a distinct assigned witness.')
							acknowledgementId = ack.id
							evidence = goodsJson({
								acknowledgementId,
								reason: command.proof.reason,
								witnessStatement: command.proof.witnessStatement,
								customerStatement: ack.evidence,
								attempt: row.attempt,
							})
						} else {
							const code =
								command.proof.method === 'code'
									? command.proof.code.replace(/[-\s]/g, '').toUpperCase()
									: command.proof.payload.startsWith(`junction-delivery-v1:${id}:`)
										? command.proof.payload.slice(`junction-delivery-v1:${id}:`.length)
										: ''
							if (
								row.rejectedProofs >= 5 ||
								!timingSafeEqual(Buffer.from(this.codec.digest(id, code), 'hex'), Buffer.from(row.codeDigest, 'hex'))
							)
								throw new GoodsCheckoutConflictError(
									'Delivery proof could not be verified. Ask for the current Customer code or use controlled fallback.',
								)
						}

						const next = advanceDelivery(
							{
								state: row.state,
								attempt: row.attempt,
								address: row.address,
								failedAt: row.failedAt?.toISOString() ?? null,
								retryDeadline: row.retryDeadline?.toISOString() ?? null,
							},
							{ action: 'delivered' },
							snapshot,
							this.dependencies.now(),
						)
						const now = this.dependencies.now(),
							version = row.version + 1
						await tx.goodsDeliveryHandoff.create({
							data: {
								progressId: row.id,
								actorId: context.actor.userId,
								customerId: fulfillment.order.purchase.customerId,
								method: command.proof.method,
								acknowledgementId,
								evidence,
								handedOffAt: now,
							},
						})
						await tx.goodsDeliveryProgress.update({ where: { id: row.id }, data: { state: next.state, codeCiphertext: '', version } })
						await tx.goodsDeliveryEvent.create({
							data: {
								progressId: row.id,
								version,
								action: 'delivered',
								actorId: context.actor.userId,
								evidence: { method: command.proof.method },
								occurredAt: now,
							},
						})
						await goodsAudit(tx, fulfillment.order.vendorWorkspaceId, context.actor.userId, 'goods.delivery-handed-off', {
							fulfillmentId: id,
							method: command.proof.method,
						})
						await goodsEmit(
							tx,
							() => this.dependencies.now(),
							fulfillment.order.purchase.workspaceId,
							'GoodsDeliveryMilestoneRecorded',
							id,
							version,
							key,
							{ fulfillmentId: id, state: 'delivered', handoffAt: now.toISOString() },
						)
						return this.view(tx, id)
					},
				)
				return { value: GoodsDeliveryMilestoneResultSchema.parse({ ...result.outcome, replayed: result.replayed }) }
			},
			{ timeout: 30000 },
		)
		if ('error' in outcome) throw new GoodsCheckoutConflictError(outcome.error)
		return outcome.value
	}

	async expire() {
		return this.dependencies.db.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
				const rows = await tx.goodsDeliveryProgress.findMany({
					where: { retryDeadline: { lte: this.dependencies.now() }, OR: [{ state: 'delivery_failed' }, { state: 'out_for_delivery', attempt: 2 }] },
					include: { fulfillment: { include: { order: { include: { purchase: true, lines: { include: { cancellationLines: true } } } } } } },
					orderBy: [{ retryDeadline: 'asc' }, { id: 'asc' }],
					take: 100,
				})
				for (const row of rows) {
					await this.dependencies.lockWorkspace(tx, row.fulfillment.order.vendorWorkspaceId)
					const snapshot = GoodsQuoteSnapshotSchema.shape.groups.element.parse(row.fulfillment.snapshot)
					const next = advanceDelivery(
						{
							state: row.state,
							attempt: row.attempt,
							address: row.address,
							failedAt: row.failedAt?.toISOString() ?? null,
							retryDeadline: row.retryDeadline?.toISOString() ?? null,
						},
						{ action: 'expire' },
						snapshot,
						this.dependencies.now(),
					)
					await tx.goodsDeliveryProgress.update({ where: { id: row.id }, data: { state: next.state, codeCiphertext: '', version: { increment: 1 } } })
					await tx.goodsDeliveryEvent.create({
						data: {
							progressId: row.id,
							version: row.version + 1,
							action: 'expire',
							actorId: null,
							evidence: { reason: 'corrected_retry_deadline_reached' },
							occurredAt: this.dependencies.now(),
						},
					})
					await goodsAudit(tx, row.fulfillment.order.vendorWorkspaceId, null, 'goods.delivery-expired', {
						fulfillmentId: row.fulfillmentId,
						attempt: row.attempt,
					})
					await goodsEmit(
						tx,
						() => this.dependencies.now(),
						row.fulfillment.order.purchase.workspaceId,
						'GoodsDeliveryMilestoneRecorded',
						row.fulfillmentId,
						row.version + 1,
						null,
						{ fulfillmentId: row.fulfillmentId, action: 'expire', state: next.state, attempt: row.attempt },
					)
				}
				return rows.length
			},
			{ timeout: 30000 },
		)
	}

	async read(sessionId: string | undefined, idInput: string, customer = false) {
		const id = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId, { allowRestrictedVendor: true })
			const fulfillment = await tx.goodsFulfillment.findUnique({
				where: { id },
				include: { order: { include: { purchase: true, lines: { include: { cancellationLines: true } } } } },
			})
			if (!fulfillment) throw new AccessDeniedError()
			if (customer) {
				if (fulfillment.order.purchase.customerId !== context.actor.userId || fulfillment.order.purchase.workspaceId !== context.workspaceId)
					throw new AccessDeniedError()
			} else this.authorize(context, fulfillment.order)
			const base = await this.view(tx, id)
			if (!customer) return base
			const progress = await tx.goodsDeliveryProgress.findUniqueOrThrow({ where: { fulfillmentId: id } })
			let collectionProof = null
			if (
				progress.state === 'out_for_delivery' &&
				progress.rejectedProofs < 5 &&
				progress.codeCiphertext &&
				(progress.attempt === 1 || !progress.retryDeadline || progress.retryDeadline > this.dependencies.now())
			) {
				const code = this.codec.decrypt(progress.codeCiphertext, id),
					qrPayload = `junction-delivery-v1:${id}:${code}`
				const svg = await QRCode.toString(qrPayload, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })
				collectionProof = {
					code: code.match(/.{1,4}/g)?.join('-') ?? code,
					qrPayload,
					qrSvgDataUri: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
				}
			}
			return GoodsCustomerDeliveryReadSchema.parse({ ...base, collectionProof })
		})
	}
}
