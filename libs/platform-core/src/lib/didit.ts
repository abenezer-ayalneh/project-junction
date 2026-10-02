import { createHmac, timingSafeEqual } from 'node:crypto'

const DIDIT_API = 'https://verification.didit.me'

function canonicalize(value: unknown): string {
	if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
	if (!value || typeof value !== 'object') throw new Error('Didit webhook contains an unsupported JSON value.')
	const object = value as Record<string, unknown>
	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
		.join(',')}}`
}

export class DiditSandboxAdapter {
	constructor(
		private readonly apiKey: string,
		private readonly webhookSecret: string,
		private readonly request: typeof fetch = fetch,
	) {
		if (!apiKey || !webhookSecret) throw new Error('Didit sandbox credentials are required.')
	}

	async createSession(userId: string, workflowId: string, callbackUrl: string): Promise<{ sessionId: string; url: string }> {
		if (!/^[0-9a-f-]{36}$/i.test(userId) || !workflowId.trim()) throw new Error('A user ID and configured Didit workflow are required.')
		const callback = new URL(callbackUrl)
		if (callback.protocol !== 'https:') throw new Error('Didit callback URL must use HTTPS.')
		const response = await this.request(`${DIDIT_API}/v3/session/`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
			body: JSON.stringify({ workflow_id: workflowId, vendor_data: userId, callback: callback.toString() }),
			signal: AbortSignal.timeout(8000),
		})
		if (response.status !== 201) throw new Error(`Didit session request failed with HTTP ${response.status}.`)
		const result: unknown = await response.json()
		if (!result || typeof result !== 'object') throw new Error('Didit returned an invalid session.')
		const sessionId = (result as Record<string, unknown>)['session_id']
		const url = (result as Record<string, unknown>)['url']
		if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 200 || typeof url !== 'string' || url.length > 2048) {
			throw new Error('Didit returned an invalid session.')
		}
		const verificationUrl = new URL(url)
		if (verificationUrl.protocol !== 'https:') throw new Error('Didit returned a non-HTTPS verification URL.')
		return { sessionId, url: verificationUrl.toString() }
	}

	async currentDecision(sessionId: string): Promise<{ status: string }> {
		if (!sessionId || sessionId.length > 200) throw new Error('A valid Didit session ID is required.')
		const response = await this.request(`${DIDIT_API}/v2/session/${encodeURIComponent(sessionId)}/decision/`, {
			method: 'GET',
			headers: { 'x-api-key': this.apiKey },
			signal: AbortSignal.timeout(8000),
		})
		if (!response.ok) throw new Error(`Didit decision request failed with HTTP ${response.status}.`)
		const result: unknown = await response.json()
		const status = result && typeof result === 'object' ? (result as Record<string, unknown>)['status'] : undefined
		if (typeof status !== 'string' || !status || status.length > 100) throw new Error('Didit returned an invalid decision.')
		return { status }
	}

	verifyWebhook(rawBody: Buffer, signatureV2: string | undefined): unknown {
		if (!signatureV2 || !/^[0-9a-f]{64}$/i.test(signatureV2)) throw new Error('Invalid Didit webhook signature.')
		let payload: unknown
		try {
			payload = JSON.parse(rawBody.toString('utf8')) as unknown
		} catch {
			throw new Error('Invalid Didit webhook payload.')
		}
		const expected = createHmac('sha256', this.webhookSecret).update(canonicalize(payload), 'utf8').digest()
		const actual = Buffer.from(signatureV2, 'hex')
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid Didit webhook signature.')
		return payload
	}
}
