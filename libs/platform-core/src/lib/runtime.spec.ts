import { applicationRuntimeMode, assertApplicationRuntimeConfiguration, assertLocalRuntimeConfiguration } from './runtime.js'

const local = (): NodeJS.ProcessEnv => ({
	JUNCTION_RUNTIME_MODE: 'local',
	FOUNDATION_STORAGE: 'postgresql',
	DATABASE_URL: 'postgresql://junction:junction@127.0.0.1:55432/junction',
	REDIS_URL: 'redis://127.0.0.1:6379',
	BETTER_AUTH_URL: 'http://localhost:3000',
	API_BIND_ADDRESS: '127.0.0.1',
	BETTER_AUTH_SECRET: 'a'.repeat(32),
	SMTP_HOST: '127.0.0.1',
	SMTP_PORT: '1025',
	GOOGLE_CLIENT_ID: 'local-google-client',
	GOOGLE_CLIENT_SECRET: 'local-google-secret',
})

describe('local runtime configuration', () => {
	it('accepts the isolated loopback runtime shape', () => {
		expect(applicationRuntimeMode(local())).toBe('local')
		expect(() => assertLocalRuntimeConfiguration(local())).not.toThrow()
	})

	it('rejects remote stores, non-local callbacks, and missing Google credentials', () => {
		expect(() => assertLocalRuntimeConfiguration({ ...local(), DATABASE_URL: 'postgresql://user:password@db.example/junction' })).toThrow(
			'loopback PostgreSQL',
		)
		expect(() => assertLocalRuntimeConfiguration({ ...local(), BETTER_AUTH_URL: 'http://127.0.0.1:3000' })).toThrow('http://localhost:3000')
		expect(() => assertLocalRuntimeConfiguration({ ...local(), API_BIND_ADDRESS: '0.0.0.0' })).toThrow('API_BIND_ADDRESS')
		expect(() => assertLocalRuntimeConfiguration({ ...local(), GOOGLE_CLIENT_SECRET: '' })).toThrow('GOOGLE_CLIENT_SECRET')
	})

	it('refuses every runtime other than local and staging', () => {
		expect(() => applicationRuntimeMode({ JUNCTION_RUNTIME_MODE: 'synthetic', FOUNDATION_STORAGE: 'postgresql' })).toThrow('local or staging')
	})

	it('retains strict provider configuration in staging', () => {
		expect(() =>
			assertApplicationRuntimeConfiguration({
				JUNCTION_RUNTIME_MODE: 'staging',
				FOUNDATION_STORAGE: 'postgresql',
				DATABASE_URL: 'postgresql://junction:password@postgres.internal/junction',
			}),
		).toThrow('REALTIME_REDIS_FANOUT')
	})
})
