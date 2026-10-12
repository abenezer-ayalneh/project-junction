import { bookingCancellationRefund } from './booking-policy.js'

describe('Booking cancellation snapshot boundaries', () => {
	const start = new Date('2026-10-20T09:00:00Z')
	for (const template of ['flexible', 'standard'] as const) {
		const full = template === 'flexible' ? 24 : 48
		const partial = template === 'flexible' ? 2 : 12
		const policy = {
			template,
			version: 1,
			fullRefundHours: full,
			partialRefundHours: partial,
			amendmentLimit: template === 'flexible' ? 2 : 1,
			contestHours: 48,
		}
		it(`${template} uses exact full/partial boundaries and integer rounding`, () => {
			const at = (hours: number, offset = 0) => new Date(start.getTime() - hours * 3_600_000 + offset)
			expect(bookingCancellationRefund(policy, 1001, start, at(full), false)).toBe(1001)
			expect(bookingCancellationRefund(policy, 1001, start, at(full, 1), false)).toBe(500)
			expect(bookingCancellationRefund(policy, 1001, start, at(partial), false)).toBe(500)
			expect(bookingCancellationRefund(policy, 1001, start, at(partial, 1), false)).toBe(0)
			expect(bookingCancellationRefund(policy, 1001, start, at(0), false)).toBe(0)
			expect(bookingCancellationRefund(policy, 1001, start, at(0, 1), true)).toBe(1001)
		})
	}
})
