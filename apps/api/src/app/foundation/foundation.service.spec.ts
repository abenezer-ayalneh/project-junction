import { ConfigService } from '@nestjs/config'

import { diditObservedAt, FoundationService } from './foundation.service'

describe('FoundationService', () => {
	it('rejects the retired in-memory foundation runtime', () => {
		expect(() => new FoundationService(new ConfigService({ FOUNDATION_STORAGE: 'memory' }))).toThrow(
			'FOUNDATION_STORAGE=postgresql is required for the API runtime.',
		)
	})

	it('normalizes Didit epoch-second and epoch-millisecond callback timestamps', () => {
		expect(diditObservedAt(1_790_870_583)).toEqual(new Date('2026-10-01T16:03:03.000Z'))
		expect(diditObservedAt(1_790_870_583_000)).toEqual(new Date('2026-10-01T16:03:03.000Z'))
		expect(diditObservedAt('2026-10-01T16:03:03.000Z')).toEqual(new Date('2026-10-01T16:03:03.000Z'))
		expect(diditObservedAt(0)).toBeUndefined()
	})
})
