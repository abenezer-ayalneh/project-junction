const LOCAL_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']
const DEFAULT_API_PORT = 3001
const DEFAULT_THROTTLE_TTL_MS = 60_000
const DEFAULT_THROTTLE_LIMIT = 100

export interface ApiRuntimeConfig {
	corsAllowedOrigins: string[]
	logLevel: string
	port: number
	throttleLimit: number
	throttleTtlMs: number
}

interface ConfigReader {
	get<T = unknown>(propertyPath: string): T | undefined
}

export function getApiRuntimeConfig(configService: ConfigReader): ApiRuntimeConfig {
	return {
		corsAllowedOrigins: parseCorsAllowedOrigins(configService.get<string>('CORS_ALLOWED_ORIGINS')),
		logLevel: configService.get<string>('LOG_LEVEL') ?? 'info',
		port: parsePort(configService.get<string>('API_PORT') ?? configService.get<string>('PORT')),
		throttleLimit: parsePositiveInteger(configService.get<string>('THROTTLE_LIMIT'), DEFAULT_THROTTLE_LIMIT, 'THROTTLE_LIMIT'),
		throttleTtlMs: parsePositiveInteger(configService.get<string>('THROTTLE_TTL_MS'), DEFAULT_THROTTLE_TTL_MS, 'THROTTLE_TTL_MS'),
	}
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
