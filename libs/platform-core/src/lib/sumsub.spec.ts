import { createHmac } from 'node:crypto'

import { SumsubSandboxAdapter } from './sumsub.js'

describe('Sumsub sandbox boundary', () => {
	it('signs the exact request bytes and never sends credentials in the body', async () => {
		const request = jest.fn((url: string, init: RequestInit) => {
			expect(url).toContain('api.sumsub.com')
			expect(init.method).toBe('POST')
			return Promise.resolve(new Response(JSON.stringify({ token: 'sandbox-sdk-token' }), { status: 200 }))
		})
		const adapter = new SumsubSandboxAdapter('app-token', 'app-secret', 'webhook-secret', request as typeof fetch)
		await expect(adapter.issueSdkToken('00000000-0000-0000-0000-000000000001', 'age-18')).resolves.toBe('sandbox-sdk-token')
		const [url, init] = request.mock.calls[0]
		expect(url).toBe('https://api.sumsub.com/resources/accessTokens/sdk')
		const headers = init.headers as Record<string, string>
		expect(headers['x-app-access-sig']).toBe(
			createHmac('sha256', 'app-secret')
				.update(headers['x-app-access-ts'])
				.update('POST/resources/accessTokens/sdk')
				.update(init.body as string)
				.digest('hex'),
		)
		expect(init.body).not.toContain('app-secret')
	})

	it('accepts only the signed raw webhook body', () => {
		const adapter = new SumsubSandboxAdapter('app-token', 'app-secret', 'webhook-secret')
		const body = Buffer.from('{ "type":"applicantReviewed", "reviewResult":{"reviewAnswer":"GREEN"} }')
		const digest = createHmac('sha256', 'webhook-secret').update(body).digest('hex')
		expect(adapter.verifyWebhook(body, digest, 'HMAC_SHA256_HEX')).toMatchObject({ type: 'applicantReviewed' })
		expect(() => adapter.verifyWebhook(Buffer.from('{}'), digest, 'HMAC_SHA256_HEX')).toThrow('Invalid Sumsub webhook signature.')
		expect(() => adapter.verifyWebhook(body, digest, 'HMAC_SHA1_HEX')).toThrow('Invalid Sumsub webhook signature.')
	})

	it('reads the current applicant and review with signed GET requests', async () => {
		const userId = '00000000-0000-0000-0000-000000000001'
		const applicantId = '5cb56e8e0a975a35f333cb83'
		const request = jest.fn((url: string, init: RequestInit) => {
			const path = new URL(url).pathname
			const headers = init.headers as Record<string, string>
			expect(headers['x-app-access-sig']).toBe(
				createHmac('sha256', 'app-secret').update(headers['x-app-access-ts']).update('GET').update(path).digest('hex'),
			)
			expect(init.method).toBe('GET')
			return Promise.resolve(
				new Response(
					JSON.stringify(
						path.endsWith('/status')
							? { levelName: 'age-18', reviewStatus: 'completed', reviewResult: { reviewAnswer: 'GREEN' } }
							: { id: applicantId, externalUserId: userId },
					),
					{ status: 200 },
				),
			)
		})
		const adapter = new SumsubSandboxAdapter('app-token', 'app-secret', 'webhook-secret', request as typeof fetch)
		await expect(adapter.currentReview(userId)).resolves.toEqual({
			applicantId,
			externalUserId: userId,
			levelName: 'age-18',
			reviewStatus: 'completed',
			reviewAnswer: 'GREEN',
		})
		expect(request).toHaveBeenCalledTimes(2)
	})
})
