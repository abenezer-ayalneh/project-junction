/* eslint-disable @typescript-eslint/no-non-null-assertion -- failed delivery always records its validated deadline */
import { advanceDelivery, type DeliveryProgress } from './goods-delivery-policy.js'

const id = '11111111-1111-4111-8111-111111111111'
const address = { contactName: 'Customer', phone: '0911000000', locality: 'City', address: 'Original address', point: [41.5, 9.5] }
const snapshot = {
	vendorId: id,
	locationId: id,
	configurationVersion: 1,
	fulfillment: { method: 'delivery', zoneId: id, address },
	deliveryZone: {
		id,
		label: 'Zone',
		polygon: [
			[41, 9],
			[42, 9],
			[42, 10],
			[41, 10],
			[41, 9],
		],
		feeCents: 200,
		minimumCents: 1000,
		freeDeliveryThresholdCents: null,
		etaMinutes: 60,
	},
	deliveryFeeCents: 200,
	etaMinutes: 60,
	pickupWindowHours: null,
	pickupGraceHours: null,
	failedDeliveryRetryHours: 48,
	lines: [
		{
			listingId: id,
			listingVersion: 1,
			sku: null,
			quantity: 1,
			unitPriceCents: 1000,
			subtotalCents: 1000,
			policy: { returnTemplate: 'standard', changeOfMindDays: 7, faultProtectionDays: 30, restockingFeeCents: 0, startsAt: 'verified_handoff' },
		},
	],
}
const initial = { state: 'preparing', attempt: 1, failedAt: null, retryDeadline: null, address }
const now = new Date('2026-10-12T09:00:00Z')
const failure = { action: 'failed', reason: 'customer_unavailable', evidence: 'Customer was unavailable at the agreed destination.' }
const retry = {
	action: 'retry',
	address: { ...address, address: 'Corrected gate instruction' },
	correction: 'Customer clarified the accessible gate for the same destination.',
}
function failed(): DeliveryProgress {
	return advanceDelivery(advanceDelivery(initial, { action: 'dispatch' }, snapshot, now), failure, snapshot, now)
}
it('requires ordered preparation, dispatch and proved handoff milestones', () => {
	expect(() => advanceDelivery(initial, { action: 'delivered' }, snapshot, now)).toThrow('out of order')
	const dispatched = advanceDelivery(initial, { action: 'dispatch' }, snapshot, now)
	expect(() => advanceDelivery(dispatched, { action: 'dispatch' }, snapshot, now)).toThrow('out of order')
	const delivered = advanceDelivery(dispatched, { action: 'delivered' }, snapshot, now)
	expect(delivered.state).toBe('delivered')
	expect(() => advanceDelivery(delivered, failure, snapshot, now)).toThrow()
})
it('allows only one corrected retry before the exact 48-hour boundary', () => {
	const first = failed()
	expect(Date.parse(first.retryDeadline!) - now.getTime()).toBe(48 * 3600000)
	const second = advanceDelivery(first, retry, snapshot, new Date(Date.parse(first.retryDeadline!) - 1))
	expect(second).toMatchObject({ state: 'out_for_delivery', attempt: 2, address: retry.address })
	expect(snapshot.fulfillment.address).toEqual(address)
	const terminal = advanceDelivery(second, failure, snapshot, new Date(Date.parse(first.retryDeadline!)))
	expect(terminal.state).toBe('inspection_pending')
	expect(() => advanceDelivery(terminal, retry, snapshot, now)).toThrow()
	expect(() => advanceDelivery(first, retry, snapshot, new Date(Date.parse(first.retryDeadline!)))).toThrow()
})
it('expiry routes failed delivery to inspection without implying refund or stock recovery', () => {
	const first = failed()
	expect(() => advanceDelivery(first, { action: 'expire' }, snapshot, new Date(Date.parse(first.retryDeadline!) - 1))).toThrow()
	expect(advanceDelivery(first, { action: 'expire' }, snapshot, new Date(Date.parse(first.retryDeadline!)))).toMatchObject({
		state: 'inspection_pending',
		attempt: 1,
		address,
	})
})
it('rejects missing failure evidence and invalid corrected contact/pin data', () => {
	expect(() => advanceDelivery(initial, { ...failure, evidence: '' }, snapshot, now)).toThrow()
	expect(() => advanceDelivery(failed(), { ...retry, address: { ...address, point: [190, 9] } }, snapshot, now)).toThrow()
	expect(() => advanceDelivery(failed(), { ...retry, correction: '' }, snapshot, now)).toThrow()
})
