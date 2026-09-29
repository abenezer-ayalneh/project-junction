import { ConfigService } from '@nestjs/config'

import { FoundationService } from './foundation.service'

describe('FoundationService', () => {
	it('rejects the retired in-memory foundation runtime', () => {
		expect(() => new FoundationService(new ConfigService({ FOUNDATION_STORAGE: 'memory' }))).toThrow(
			'FOUNDATION_STORAGE=postgresql is required for the API runtime.',
		)
	})
})
