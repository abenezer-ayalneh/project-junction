import { getApiRuntimeConfig, parseCorsAllowedOrigins } from './api-runtime.config'

function configService(environment: Record<string, string | undefined>) {
	return {
		get<T>(propertyPath: string): T | undefined {
			return environment[propertyPath] as T | undefined
		},
	}
}

describe('API runtime configuration', () => {
	it('uses local origins and safe throttling defaults when no environment overrides exist', () => {
		expect(getApiRuntimeConfig(configService({}))).toEqual({
			corsAllowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
			logLevel: 'info',
			port: 3001,
			realtimeRedisFanout: false,
			redisUrl: undefined,
			throttleLimit: 100,
			throttleTtlMs: 60_000,
		})
	})

	it('uses API_PORT before the backwards-compatible PORT fallback', () => {
		expect(getApiRuntimeConfig(configService({ API_PORT: '3002', PORT: '3003' })).port).toBe(3002)
		expect(getApiRuntimeConfig(configService({ PORT: '3003' })).port).toBe(3003)
	})

	it('deduplicates explicit allowed origins', () => {
		expect(parseCorsAllowedOrigins('https://app.example.com, https://app.example.com')).toEqual(['https://app.example.com'])
	})

	it('requires a valid Redis URL when realtime fanout is enabled', () => {
		expect(() => getApiRuntimeConfig(configService({ REALTIME_REDIS_FANOUT: 'enabled' }))).toThrow('REDIS_URL is required')
		expect(() => getApiRuntimeConfig(configService({ REALTIME_REDIS_FANOUT: 'enabled', REDIS_URL: 'https://redis.example' }))).toThrow('redis or rediss')
		expect(getApiRuntimeConfig(configService({ REALTIME_REDIS_FANOUT: 'enabled', REDIS_URL: 'redis://127.0.0.1:6379' }))).toMatchObject({
			realtimeRedisFanout: true,
			redisUrl: 'redis://127.0.0.1:6379',
		})
	})

	it('rejects empty and path-based CORS origins', () => {
		expect(() => parseCorsAllowedOrigins('')).toThrow('at least one origin')
		expect(() => parseCorsAllowedOrigins('https://app.example.com/path')).toThrow('invalid origin')
	})
})
