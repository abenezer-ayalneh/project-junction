import { GoodsAddressSnapshotSchema, GoodsQuoteSnapshotSchema } from 'contracts'
import { z } from 'zod'

import { GoodsCheckoutConflictError } from './goods-support.js'

export const DeliveryProgressSchema = z
	.object({
		state: z.enum(['preparing', 'out_for_delivery', 'delivery_failed', 'delivered', 'inspection_pending']),
		attempt: z.number().int().min(1).max(2),
		failedAt: z.string().datetime().nullable(),
		retryDeadline: z.string().datetime().nullable(),
		address: GoodsAddressSnapshotSchema,
	})
	.strict()
export type DeliveryProgress = z.infer<typeof DeliveryProgressSchema>
export const DeliveryActionSchema = z.discriminatedUnion('action', [
	z.object({ action: z.literal('dispatch') }).strict(),
	z
		.object({
			action: z.literal('failed'),
			reason: z.enum(['customer_unavailable', 'address_inaccessible', 'vendor_failure']),
			evidence: z.string().trim().min(10).max(1000),
		})
		.strict(),
	z.object({ action: z.literal('retry'), address: GoodsAddressSnapshotSchema, correction: z.string().trim().min(10).max(1000) }).strict(),
	z.object({ action: z.literal('delivered') }).strict(),
	z.object({ action: z.literal('expire') }).strict(),
])

/** Pure milestone guards; authoritative scope, zone and handoff proof belong to the command transaction. */
export function advanceDelivery(progressInput: unknown, actionInput: unknown, snapshotInput: unknown, now: Date): DeliveryProgress {
	const progress = DeliveryProgressSchema.parse(progressInput)
	const action = DeliveryActionSchema.parse(actionInput)
	const snapshot = GoodsQuoteSnapshotSchema.shape.groups.element.parse(snapshotInput)
	if (snapshot.fulfillment.method !== 'delivery' || snapshot.failedDeliveryRetryHours !== 48 || !snapshot.deliveryZone)
		throw new GoodsCheckoutConflictError('This fulfillment has no paid delivery policy.')
	if (!Number.isFinite(now.getTime())) throw new Error('A valid authoritative clock is required.')
	const reject = () => {
		throw new GoodsCheckoutConflictError('Delivery milestone is out of order or the corrected retry window has ended. Read current fulfillment state.')
	}
	if (progress.failedAt && now.getTime() < Date.parse(progress.failedAt)) return reject()
	switch (action.action) {
		case 'dispatch':
			if (progress.state !== 'preparing') return reject()
			return { ...progress, state: 'out_for_delivery' }
		case 'failed': {
			if (progress.state !== 'out_for_delivery') return reject()
			if (progress.attempt === 2) return { ...progress, state: 'inspection_pending', failedAt: now.toISOString(), retryDeadline: null }
			return { ...progress, state: 'delivery_failed', failedAt: now.toISOString(), retryDeadline: new Date(now.getTime() + 48 * 3600000).toISOString() }
		}
		case 'retry':
			if (
				progress.state !== 'delivery_failed' ||
				progress.attempt !== 1 ||
				!progress.retryDeadline ||
				now.getTime() >= Date.parse(progress.retryDeadline)
			)
				return reject()
			// The command must check the corrected pin against the original paid zone.
			return { ...progress, state: 'out_for_delivery', attempt: 2, address: action.address }
		case 'delivered':
			if (
				progress.state !== 'out_for_delivery' ||
				(progress.attempt === 2 && progress.retryDeadline && now.getTime() >= Date.parse(progress.retryDeadline))
			)
				return reject()
			return { ...progress, state: 'delivered' }
		case 'expire':
			if (
				!['delivery_failed', 'out_for_delivery'].includes(progress.state) ||
				(progress.state === 'out_for_delivery' && progress.attempt !== 2) ||
				!progress.retryDeadline ||
				now.getTime() < Date.parse(progress.retryDeadline)
			)
				return reject()
			return { ...progress, state: 'inspection_pending' }
	}
}
