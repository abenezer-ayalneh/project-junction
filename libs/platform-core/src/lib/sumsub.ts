import { createHmac, timingSafeEqual } from 'node:crypto'

const SUMSUB_API = 'https://api.sumsub.com'
const SDK_TOKEN_PATH = '/resources/accessTokens/sdk'

export class SumsubSandboxAdapter {
	constructor(
		private readonly appToken: string,
		private readonly secretKey: string,
		private readonly webhookSecret: string,
		private readonly request: typeof fetch = fetch,
	) {
		if (!appToken || !secretKey || !webhookSecret) throw new Error('Sumsub sandbox credentials are required.')
	}

	async issueSdkToken(userId: string, levelName: string): Promise<string> {
		if (!/^[0-9a-f-]{36}$/i.test(userId) || !levelName.trim()) throw new Error('A user ID and configured Sumsub level are required.')
		const body = JSON.stringify({ ttlInSecs: 600, userId, levelName })
		const timestamp = String(Math.floor(Date.now() / 1000))
		const signature = createHmac('sha256', this.secretKey).update(timestamp).update('POST').update(SDK_TOKEN_PATH).update(body).digest('hex')
		const response = await this.request(`${SUMSUB_API}${SDK_TOKEN_PATH}`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-app-token': this.appToken,
				'x-app-access-ts': timestamp,
				'x-app-access-sig': signature,
			},
			body,
			signal: AbortSignal.timeout(8000),
		})
		if (!response.ok) throw new Error(`Sumsub access token request failed with HTTP ${response.status}.`)
		const result: unknown = await response.json()
		if (!result || typeof result !== 'object' || !('token' in result) || typeof result.token !== 'string' || !result.token || result.token.length > 1024) {
			throw new Error('Sumsub returned an invalid access token.')
		}
		return result.token
	}

	async currentReview(
		userId: string,
	): Promise<{ applicantId: string; externalUserId: string; levelName: string; reviewStatus: string; reviewAnswer: string | null }> {
		if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('A valid external user ID is required.')
		const applicantPath = `/resources/applicants/-;externalUserId=${encodeURIComponent(userId)}/one`
		const applicant = await this.signedGet(applicantPath)
		if (!applicant || typeof applicant !== 'object') throw new Error('Sumsub returned invalid applicant data.')
		const identity = applicant as Record<string, unknown>
		const applicantId = identity['id']
		const externalUserId = identity['externalUserId']
		if (typeof applicantId !== 'string' || !/^[a-z0-9]{24}$/i.test(applicantId) || externalUserId !== userId) {
			throw new Error('Sumsub applicant does not match the requested user.')
		}
		const status = await this.signedGet(`/resources/applicants/${applicantId}/status`)
		if (!status || typeof status !== 'object') throw new Error('Sumsub returned invalid review status.')
		const result = status as Record<string, unknown>
		const answer = result['reviewResult']
		const reviewAnswer = answer && typeof answer === 'object' ? (answer as Record<string, unknown>)['reviewAnswer'] : undefined
		if (
			typeof result['levelName'] !== 'string' ||
			typeof result['reviewStatus'] !== 'string' ||
			(reviewAnswer !== undefined && reviewAnswer !== 'GREEN' && reviewAnswer !== 'RED')
		) {
			throw new Error('Sumsub returned invalid review status.')
		}
		return { applicantId, externalUserId, levelName: result['levelName'], reviewStatus: result['reviewStatus'], reviewAnswer: reviewAnswer ?? null }
	}

	private async signedGet(path: string): Promise<unknown> {
		const timestamp = String(Math.floor(Date.now() / 1000))
		const signature = createHmac('sha256', this.secretKey).update(timestamp).update('GET').update(path).digest('hex')
		const response = await this.request(`${SUMSUB_API}${path}`, {
			method: 'GET',
			headers: { 'x-app-token': this.appToken, 'x-app-access-ts': timestamp, 'x-app-access-sig': signature },
			signal: AbortSignal.timeout(8000),
		})
		if (!response.ok) throw new Error(`Sumsub review request failed with HTTP ${response.status}.`)
		return response.json()
	}

	verifyWebhook(rawBody: Buffer, digest: string | undefined, algorithm: string | undefined): unknown {
		if (!digest || algorithm !== 'HMAC_SHA256_HEX' || !/^[0-9a-f]{64}$/i.test(digest)) throw new Error('Invalid Sumsub webhook signature.')
		const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest()
		const actual = Buffer.from(digest, 'hex')
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid Sumsub webhook signature.')
		return JSON.parse(rawBody.toString('utf8')) as unknown
	}
}
