function required(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name]?.trim()
	if (!value) throw new Error(`${name} is required in private staging.`)
	return value
}

export function assertStagingProviderConfiguration(env: NodeJS.ProcessEnv = process.env): void {
	if (env['JUNCTION_RUNTIME_MODE'] !== 'staging') {
		if (env['NODE_ENV'] === 'test') return
		throw new Error('Running API and worker processes require JUNCTION_RUNTIME_MODE=staging; synthetic mode is test-only.')
	}
	if (env['FOUNDATION_STORAGE'] !== 'postgresql') throw new Error('FOUNDATION_STORAGE=postgresql is required in private staging.')
	required(env, 'DATABASE_URL')
	if (env['REALTIME_REDIS_FANOUT'] !== 'enabled') throw new Error('REALTIME_REDIS_FANOUT=enabled is required in private staging.')
	const redisUrl = new URL(required(env, 'REDIS_URL'))
	if (!['redis:', 'rediss:'].includes(redisUrl.protocol) || redisUrl.href === 'redis://127.0.0.1:6379') {
		throw new Error('REDIS_URL must target a separate staging Redis service, not the local fixture.')
	}
	const origin = new URL(required(env, 'BETTER_AUTH_URL'))
	if (
		origin.protocol !== 'https:' ||
		origin.origin !== origin.href.replace(/\/$/, '') ||
		origin.hostname === 'example.com' ||
		origin.hostname.endsWith('.example.com')
	) {
		throw new Error('BETTER_AUTH_URL must be the actual private staging HTTPS origin.')
	}
	if (required(env, 'BETTER_AUTH_SECRET').length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.')
	required(env, 'RESEND_API_KEY')
	required(env, 'RESEND_FROM_EMAIL')
	required(env, 'SUMSUB_APP_TOKEN')
	required(env, 'SUMSUB_SECRET_KEY')
	required(env, 'SUMSUB_WEBHOOK_SECRET')
	required(env, 'SUMSUB_AGE_LEVEL')
	const mediaEndpoint = new URL(required(env, 'MEDIA_S3_ENDPOINT'))
	if (
		mediaEndpoint.protocol !== 'https:' ||
		mediaEndpoint.origin !== mediaEndpoint.href.replace(/\/$/, '') ||
		['localhost', '127.0.0.1', '[::1]'].includes(mediaEndpoint.hostname) ||
		mediaEndpoint.hostname.endsWith('.local')
	) {
		throw new Error('MEDIA_S3_ENDPOINT must be a private staging HTTPS object-store origin.')
	}
	required(env, 'MEDIA_S3_REGION')
	required(env, 'MEDIA_S3_BUCKET')
	required(env, 'MEDIA_S3_ACCESS_KEY_ID')
	required(env, 'MEDIA_S3_SECRET_ACCESS_KEY')
	required(env, 'MEDIA_CLAMD_HOST')
	const clamdPort = Number(required(env, 'MEDIA_CLAMD_PORT'))
	if (!Number.isInteger(clamdPort) || clamdPort < 1 || clamdPort > 65535) throw new Error('MEDIA_CLAMD_PORT must be a valid TCP port.')
	if (env['SUMSUB_AGE_18_LEVEL_CONFIRMED'] && env['SUMSUB_AGE_18_LEVEL_CONFIRMED'] !== 'true') {
		throw new Error('SUMSUB_AGE_18_LEVEL_CONFIRMED must be true or unset.')
	}
	for (const name of ['SYNTHETIC_ACCOUNT_PROVISIONING_SECRET', 'SYNTHETIC_DEMO_SESSION_SECRET', 'SYNTHETIC_WEBHOOK_WORKSPACE_ID']) {
		if (env[name]) throw new Error(`${name} must be absent from private staging.`)
	}
}
