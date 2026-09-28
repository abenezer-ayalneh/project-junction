const LOCAL_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
const DEFAULT_API_PORT = 3001
const DEFAULT_THROTTLE_TTL_MS = 60_000
const DEFAULT_THROTTLE_LIMIT = 100

export interface ApiRuntimeConfig {
	bindAddress: string
	corsAllowedOrigins: string[]
	logLevel: string
	port: number
	realtimeRedisFanout: boolean
	redisUrl: string | undefined
	throttleLimit: number
	throttleTtlMs: number
}

interface ConfigReader {
	get<T = unknown>(propertyPath: string): T | undefined
}

export function getApiRuntimeConfig(configService: ConfigReader): ApiRuntimeConfig {
	const staging = configService.get<string>('JUNCTION_RUNTIME_MODE') === 'staging'
	const stagingOrigin = staging ? configService.get<string>('BETTER_AUTH_URL') : undefined
	if (staging && !stagingOrigin) throw new Error('BETTER_AUTH_URL is required for staging CORS.')
	const corsAllowedOrigins = staging
		? parseCorsAllowedOrigins(configService.get<string>('CORS_ALLOWED_ORIGINS') ?? stagingOrigin)
		: parseCorsAllowedOrigins(configService.get<string>('CORS_ALLOWED_ORIGINS'))
	if (staging && (corsAllowedOrigins.length !== 1 || corsAllowedOrigins[0] !== stagingOrigin || !stagingOrigin?.startsWith('https://'))) {
		throw new Error('Staging CORS must allow only the BETTER_AUTH_URL HTTPS origin.')
	}
	const redisFanout = parseRealtimeRedisFanout(configService.get<string>('REALTIME_REDIS_FANOUT'), configService.get<string>('REDIS_URL'))
	if (staging && !redisFanout.realtimeRedisFanout) throw new Error('Staging realtime requires Redis fanout.')
	return {
		bindAddress: parseBindAddress(configService.get<string>('API_BIND_ADDRESS')),
		corsAllowedOrigins,
		logLevel: configService.get<string>('LOG_LEVEL') ?? 'info',
		port: parsePort(configService.get<string>('API_PORT') ?? configService.get<string>('PORT')),
		...redisFanout,
		throttleLimit: parsePositiveInteger(configService.get<string>('THROTTLE_LIMIT'), DEFAULT_THROTTLE_LIMIT, 'THROTTLE_LIMIT'),
		throttleTtlMs: parsePositiveInteger(configService.get<string>('THROTTLE_TTL_MS'), DEFAULT_THROTTLE_TTL_MS, 'THROTTLE_TTL_MS'),
	}
}

function parseBindAddress(value: string | undefined): string {
	if (value === undefined) return '127.0.0.1'
	if (value === '127.0.0.1' || value === '0.0.0.0') return value
	throw new Error('API_BIND_ADDRESS must be 127.0.0.1 or 0.0.0.0.')
}

function parseRealtimeRedisFanout(value: string | undefined, redisUrl: string | undefined) {
	if (value === undefined || value === 'disabled') return { realtimeRedisFanout: false, redisUrl: undefined }
	if (value !== 'enabled') throw new Error('REALTIME_REDIS_FANOUT must be enabled or disabled.')
	if (!redisUrl) throw new Error('REDIS_URL is required when REALTIME_REDIS_FANOUT is enabled.')
	const parsed = new URL(redisUrl)
	if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error('REDIS_URL must use redis or rediss.')
	return { realtimeRedisFanout: true, redisUrl }
}

export function parseCorsAllowedOrigins(value?: string): string[] {
	const origins = (value ?? LOCAL_CORS_ORIGINS.join(','))
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean)

	if (origins.length === 0) {
		throw new Error('CORS_ALLOWED_ORIGINS must include at least one origin.')
	}

	const uniqueOrigins = [...new Set(origins)]
	for (const origin of uniqueOrigins) {
		const parsed = new URL(origin)
		if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
			throw new Error(`CORS_ALLOWED_ORIGINS contains an invalid origin: ${origin}`)
		}
	}

	return uniqueOrigins
}

function parsePort(value: string | undefined): number {
	const port = parsePositiveInteger(value, DEFAULT_API_PORT, 'API_PORT')
	if (port > 65_535) {
		throw new Error('API_PORT must be between 1 and 65535.')
	}

	return port
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
	if (value === undefined) {
		return fallback
	}

	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive integer.`)
	}

	return parsed
}
