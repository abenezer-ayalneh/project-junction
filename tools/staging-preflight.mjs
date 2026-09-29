import { assertStagingProviderConfiguration } from '../libs/platform-core/dist/lib/staging-readiness.js'

function requireValue(name) {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`${name} is required for staging preflight.`)
	return value
}

function privateUpstream(name) {
	const value = requireValue(name)
	const url = new URL(`http://${value}`)
	if (url.host !== value || !['127.0.0.1', '[::1]'].includes(url.hostname) || !url.port || Number(url.port) < 1 || url.pathname !== '/') {
		throw new Error(`${name} must be a loopback host:port.`)
	}
	return value
}

try {
	if (process.env.NODE_ENV === 'test') throw new Error('Staging preflight cannot run with NODE_ENV=test.')
	assertStagingProviderConfiguration(process.env)
	for (const name of ['STAGING_APP_IMAGE', 'STAGING_POSTGRES_IMAGE', 'STAGING_REDIS_IMAGE', 'STAGING_CLAMAV_IMAGE', 'STAGING_MINIO_IMAGE']) {
		if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(requireValue(name))) {
			throw new Error(`${name} must be an immutable image digest.`)
		}
	}
	if (new URL(requireValue('DATABASE_URL')).hostname !== 'postgres' || new URL(requireValue('REDIS_URL')).hostname !== 'redis') {
		throw new Error('Staging database and Redis URLs must target their isolated Compose services.')
	}
	if (requireValue('MEDIA_CLAMD_HOST') !== 'clamav') throw new Error('MEDIA_CLAMD_HOST must target the staging ClamAV service.')
	const hostname = requireValue('STAGING_HOSTNAME')
	if (
		!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(hostname) ||
		!hostname.includes('.') ||
		['.example', '.test', '.invalid', '.localhost'].some((suffix) => hostname.endsWith(suffix))
	) {
		throw new Error('STAGING_HOSTNAME must be an actual DNS hostname.')
	}
	if (new URL(process.env.BETTER_AUTH_URL).hostname !== hostname) {
		throw new Error('STAGING_HOSTNAME must match BETTER_AUTH_URL.')
	}
	const minioHostname = requireValue('STAGING_MINIO_HOSTNAME')
	if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(minioHostname) || !minioHostname.includes('.') || minioHostname === hostname) {
		throw new Error('STAGING_MINIO_HOSTNAME must be a separate actual DNS hostname.')
	}
	if (new URL(process.env.MEDIA_S3_ENDPOINT).hostname !== minioHostname || new URL(process.env.MEDIA_S3_ENDPOINT).protocol !== 'https:') {
		throw new Error('MEDIA_S3_ENDPOINT must use the configured HTTPS MinIO hostname.')
	}
	if (requireValue('NEXT_PUBLIC_JUNCTION_RUNTIME_MODE') !== 'staging') {
		throw new Error('NEXT_PUBLIC_JUNCTION_RUNTIME_MODE must be staging.')
	}
	if (requireValue('NEXT_PUBLIC_JUNCTION_API_URL') !== '/v1') {
		throw new Error('NEXT_PUBLIC_JUNCTION_API_URL must be /v1.')
	}
	if (!/^[A-Za-z0-9_-]+$/.test(requireValue('STAGING_BASIC_AUTH_USER'))) {
		throw new Error('STAGING_BASIC_AUTH_USER must be a simple username.')
	}
	if (!/^\$2[aby]\$/.test(requireValue('STAGING_BASIC_AUTH_HASH'))) {
		throw new Error('STAGING_BASIC_AUTH_HASH must be a Caddy-compatible bcrypt hash.')
	}
	const api = privateUpstream('STAGING_API_UPSTREAM')
	const web = privateUpstream('STAGING_WEB_UPSTREAM')
	const minio = privateUpstream('STAGING_MINIO_UPSTREAM')
	if (new Set([api, web, minio]).size !== 3) throw new Error('Staging API, web, and MinIO upstreams must use distinct ports.')
	if (api !== `127.0.0.1:${requireValue('STAGING_API_HOST_PORT')}` || web !== `127.0.0.1:${requireValue('STAGING_WEB_HOST_PORT')}`) {
		throw new Error('Staging Caddy upstreams must match the loopback-published Compose ports.')
	}
	if (minio !== `127.0.0.1:${requireValue('STAGING_MINIO_HOST_PORT')}`)
		throw new Error('Staging MinIO upstream must match its loopback-published Compose port.')
	console.log('Staging configuration preflight passed. Live provider, isolation, and release acceptance remain pending.')
} catch (error) {
	console.error(`Staging configuration preflight failed: ${error.message}`)
	process.exitCode = 1
}
