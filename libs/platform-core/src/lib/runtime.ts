import { assertStagingProviderConfiguration } from './staging-readiness.js'

export type ApplicationRuntimeMode = 'local' | 'staging'

function required(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name]?.trim()
	if (!value) throw new Error(`${name} is required.`)
	return value
}

function isLoopback(hostname: string): boolean {
	const normalized = hostname.toLowerCase()
	return normalized === 'localhost' || normalized === '[::1]' || normalized.endsWith('.localhost') || /^127(?:\.\d{1,3}){3}$/.test(normalized)
}

export function applicationRuntimeMode(env: NodeJS.ProcessEnv = process.env): ApplicationRuntimeMode {
	const mode = env['JUNCTION_RUNTIME_MODE']
	if (mode !== 'local' && mode !== 'staging') throw new Error('JUNCTION_RUNTIME_MODE must be local or staging.')
	if (env['FOUNDATION_STORAGE'] !== 'postgresql') throw new Error('FOUNDATION_STORAGE=postgresql is required.')
	return mode
}

export function assertLocalRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): void {
	if (applicationRuntimeMode(env) !== 'local') throw new Error('Local runtime configuration requires JUNCTION_RUNTIME_MODE=local.')
	const database = new URL(required(env, 'DATABASE_URL'))
	const redis = new URL(required(env, 'REDIS_URL'))
	const origin = new URL(required(env, 'BETTER_AUTH_URL'))
	if (!['postgres:', 'postgresql:'].includes(database.protocol) || !isLoopback(database.hostname)) {
		throw new Error('Local DATABASE_URL must target loopback PostgreSQL.')
	}
	if (!['redis:', 'rediss:'].includes(redis.protocol) || !isLoopback(redis.hostname)) throw new Error('Local REDIS_URL must target loopback Redis.')
	if (origin.origin !== 'http://localhost:3000') throw new Error('Local BETTER_AUTH_URL must be http://localhost:3000.')
	if (required(env, 'API_BIND_ADDRESS') !== '127.0.0.1') throw new Error('Local API_BIND_ADDRESS must be 127.0.0.1.')
	if (required(env, 'BETTER_AUTH_SECRET').length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.')
	if (!isLoopback(required(env, 'SMTP_HOST'))) throw new Error('Local SMTP_HOST must target the loopback Mailpit service.')
	if (Number(required(env, 'SMTP_PORT')) !== 1025) throw new Error('Local SMTP_PORT must be 1025.')
	required(env, 'GOOGLE_CLIENT_ID')
	required(env, 'GOOGLE_CLIENT_SECRET')
}

export function assertApplicationRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): ApplicationRuntimeMode {
	const mode = applicationRuntimeMode(env)
	if (mode === 'local') assertLocalRuntimeConfiguration(env)
	else assertStagingProviderConfiguration(env)
	return mode
}
