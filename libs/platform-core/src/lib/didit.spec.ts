import { createHmac } from 'node:crypto'

import { DiditSandboxAdapter } from './didit.js'

function canonicalize(value: unknown): string {
	if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
	const object = value as Record<string, unknown>
	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
		.join(',')}}`
}

describe('Didit sandbox boundary', () => {
	it('creates a session with an API key header and never sends it in the body', async () => {
		const request = jest.fn((...args: [string, RequestInit]) => {
			void args
			return Promise.resolve(new Response(JSON.stringify({ session_id: 'session-123', url: 'https://verify.didit.me/session-123' }), { status: 201 }))
		})
		const adapter = new DiditSandboxAdapter('didit-api-key', 'webhook-secret', request as typeof fetch)
		await expect(
			adapter.createSession('00000000-0000-0000-0000-000000000001', 'age-18-workflow', 'https://staging-junction.abenezer-ayalneh.dev/account'),
		).resolves.toEqual({
			sessionId: 'session-123',
			url: 'https://verify.didit.me/session-123',
		})
		const [url, init] = request.mock.calls[0]
		expect(url).toBe('https://verification.didit.me/v3/session/')
		expect(init.headers).toMatchObject({ 'x-api-key': 'didit-api-key' })
		expect(init.body).toBe(
			JSON.stringify({
				workflow_id: 'age-18-workflow',
				vendor_data: '00000000-0000-0000-0000-000000000001',
				callback: 'https://staging-junction.abenezer-ayalneh.dev/account',
			}),
		)
		expect(init.body).not.toContain('didit-api-key')
	})

	it('accepts only a V2 signature over canonical JSON', () => {
		const adapter = new DiditSandboxAdapter('didit-api-key', 'webhook-secret')
		const payload = { vendor_data: '00000000-0000-0000-0000-000000000001', status: 'Approved', webhook_type: 'status.updated', nested: { b: 2, a: 1 } }
		const body = Buffer.from(
			JSON.stringify({ status: 'Approved', nested: { a: 1, b: 2 }, webhook_type: 'status.updated', vendor_data: payload.vendor_data }),
		)
		const signature = createHmac('sha256', 'webhook-secret').update(canonicalize(payload), 'utf8').digest('hex')
		expect(adapter.verifyWebhook(body, signature)).toMatchObject({ status: 'Approved' })
		expect(() => adapter.verifyWebhook(body, '0'.repeat(64))).toThrow('Invalid Didit webhook signature.')
	})

	it('reads the provider decision for a session', async () => {
		const request = jest.fn((...args: [string, RequestInit]) => {
			void args
			return Promise.resolve(new Response(JSON.stringify({ status: 'Approved' }), { status: 200 }))
		})
		const adapter = new DiditSandboxAdapter('didit-api-key', 'webhook-secret', request as typeof fetch)
		await expect(adapter.currentDecision('session-123')).resolves.toEqual({ status: 'Approved' })
		expect(request).toHaveBeenCalledWith('https://verification.didit.me/v2/session/session-123/decision/', expect.objectContaining({ method: 'GET' }))
	})
})
