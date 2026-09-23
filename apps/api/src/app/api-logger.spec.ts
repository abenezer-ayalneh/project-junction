import { redactLogInfo } from './api-logger'

describe('API logger redaction', () => {
	it('removes stacks and redacts sensitive fields recursively without removing request correlation', () => {
		const info = redactLogInfo({
			message: 'request failed',
			requestId: 'd1f6c321-b78e-4ac5-8649-4dd14e9aa3d2',
			stack: 'database password and webhook secret',
			cookie: 'junction_demo_session=private',
			context: { authorization: 'Bearer private', nested: { signature: 'sha256=private' } },
		})

		expect(info).toEqual({
			message: 'request failed',
			requestId: 'd1f6c321-b78e-4ac5-8649-4dd14e9aa3d2',
			cookie: '[REDACTED]',
			context: { authorization: '[REDACTED]', nested: { signature: '[REDACTED]' } },
		})
	})
})
