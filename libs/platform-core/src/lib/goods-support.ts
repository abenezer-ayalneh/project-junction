import { randomUUID } from 'node:crypto'

import { type AccessContext, type DomainEvent, DomainEventSchema } from 'contracts'

import { Prisma, type PrismaClient } from '../../generated/prisma/index.js'
import type { LocalGoodsPaymentAdapter } from './local-goods-payment.js'
type Transaction = Prisma.TransactionClient
export const goodsJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
export interface GoodsDependencies {
	payments?: LocalGoodsPaymentAdapter
	expireMixed?(tx: Transaction): Promise<number>
	db: PrismaClient
	derive(tx: Transaction, sessionId: string | undefined, options?: { allowRestrictedVendor?: boolean }): Promise<AccessContext>
	lockWorkspace(tx: Transaction, id: string): Promise<void>
	replay<T>(
		tx: Transaction,
		context: AccessContext,
		key: string,
		method: string,
		request: unknown,
		create: () => Promise<T>,
	): Promise<{ outcome: T; replayed: boolean }>
	now(): Date
}

export function goodsAudit(tx: Transaction, workspaceId: string, actorId: string | null, action: string, metadata: Record<string, unknown>) {
	return tx.auditLog.create({ data: { workspaceId, actorId, action, correlationId: randomUUID(), metadata: goodsJson(metadata) } })
}
export function goodsEmit(
	tx: Transaction,
	now: () => Date,
	workspaceId: string,
	type: DomainEvent['type'],
	aggregateId: string,
	aggregateVersion: number,
	key: string | null,
	payload: Record<string, unknown>,
) {
	const eventId = randomUUID()
	const event = DomainEventSchema.parse({
		eventId,
		workspaceId,
		type,
		aggregateId,
		aggregateVersion,
		idempotencyKey: key,
		causationId: eventId,
		correlationId: eventId,
		occurredAt: now().toISOString(),
		schemaVersion: 1,
		payload,
	})
	return tx.outboxEvent.create({ data: { eventId, workspaceId, type, payload: goodsJson(event), occurredAt: new Date(event.occurredAt) } })
}

export class GoodsCheckoutConflictError extends Error {
	readonly code = 'UNAVAILABLE'
	constructor(message = 'Goods are no longer available on these terms. Request a new quote.') {
		super(message)
		this.name = 'GoodsCheckoutConflictError'
	}
}
