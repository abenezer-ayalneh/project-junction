import { assertStagingProviderConfiguration } from './staging-readiness.js'

const staging = (): NodeJS.ProcessEnv => ({
	JUNCTION_RUNTIME_MODE: 'staging',
	FOUNDATION_STORAGE: 'postgresql',
	DATABASE_URL: 'postgresql://user:password@db.internal/junction',
	BETTER_AUTH_URL: 'https://staging.junction.test',
	BETTER_AUTH_SECRET: 'a'.repeat(32),
	RESEND_API_KEY: 'staging-key',
	RESEND_FROM_EMAIL: 'verify@junction.test',
	SUMSUB_APP_TOKEN: 'sandbox-token',
	SUMSUB_SECRET_KEY: 'sandbox-api-secret',
	SUMSUB_WEBHOOK_SECRET: 'sandbox-webhook-secret',
	SUMSUB_AGE_LEVEL: 'sandbox-adult',
	MEDIA_S3_ENDPOINT: 'https://objects.junction.test',
	MEDIA_S3_REGION: 'auto',
	MEDIA_S3_BUCKET: 'junction-staging',
	MEDIA_S3_ACCESS_KEY_ID: 'staging-access-key',
	MEDIA_S3_SECRET_ACCESS_KEY: 'staging-secret-key',
	MEDIA_CLAMD_HOST: '127.0.0.1',
	MEDIA_CLAMD_PORT: '3310',
})

describe('private staging provider readiness', () => {
	it('allows synthetic fixtures only inside a test process', () => {
		expect(() => assertStagingProviderConfiguration({ JUNCTION_RUNTIME_MODE: 'synthetic', NODE_ENV: 'test' })).not.toThrow()
		expect(() => assertStagingProviderConfiguration({ JUNCTION_RUNTIME_MODE: 'synthetic', NODE_ENV: 'production' })).toThrow()
		expect(() => assertStagingProviderConfiguration({ NODE_ENV: 'production' })).toThrow()
	})

	it('allows the Sumsub rehearsal before adult grants are enabled', () => {
		expect(() => assertStagingProviderConfiguration(staging())).not.toThrow()
	})

	it('refuses placeholder origins and inherited synthetic secrets', () => {
		expect(() => assertStagingProviderConfiguration({ ...staging(), BETTER_AUTH_URL: 'https://staging.example.com' })).toThrow()
		expect(() => assertStagingProviderConfiguration({ ...staging(), SYNTHETIC_DEMO_SESSION_SECRET: 'old-secret' })).toThrow()
	})

	it('refuses staging without a real email or identity adapter configuration', () => {
		expect(() => assertStagingProviderConfiguration({ ...staging(), RESEND_API_KEY: '' })).toThrow()
		expect(() => assertStagingProviderConfiguration({ ...staging(), SUMSUB_WEBHOOK_SECRET: '' })).toThrow()
	})

	it('refuses local object-store fixtures and missing malware scanning', () => {
		expect(() => assertStagingProviderConfiguration({ ...staging(), MEDIA_S3_ENDPOINT: 'http://127.0.0.1:59000' })).toThrow()
		expect(() => assertStagingProviderConfiguration({ ...staging(), MEDIA_CLAMD_HOST: '' })).toThrow()
	})
})
