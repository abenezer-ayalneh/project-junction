import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'
import { assertApplicationRuntimeConfiguration } from 'platform-core'

import { AppModule } from './app/app.module'
import { FoundationService } from './app/foundation/foundation.service'
import { ApiExceptionFilter } from './app/http/api-exception.filter'
import { createApiLogger } from './app/http/api-logger'
import { requestContextMiddleware, type RequestWithContext, type ResponseWithContext } from './app/http/request-context'
import { configureSwagger } from './app/http/swagger'
import { getApiRuntimeConfig } from './app/runtime/api-runtime.config'

async function bootstrap() {
	assertApplicationRuntimeConfiguration()
	const app = await NestFactory.create(AppModule, { rawBody: true })
	const config = getApiRuntimeConfig(app.get(ConfigService))
	const logger = createApiLogger(config.logLevel)
	app.useLogger(logger)

	app.enableShutdownHooks()
	app.setGlobalPrefix('v1')
	app.use(helmet())
	app.use((request: RequestWithContext, response: ResponseWithContext, next: () => void) => requestContextMiddleware(request, response, next))
	if (process.env['JUNCTION_RUNTIME_MODE'] === 'local' || process.env['JUNCTION_RUNTIME_MODE'] === 'staging') {
		const foundation = app.get(FoundationService)
		app.use((request: RequestWithContext, _response: ResponseWithContext, next: (error?: Error) => void) => {
			const cookie = request.headers.cookie
			void foundation.authenticateFromCookie(Array.isArray(cookie) ? cookie.join('; ') : cookie).then(
				(sessionId) => {
					request.authenticatedSessionId = sessionId
					next()
				},
				(error: Error) => next(error),
			)
		})
	}
	app.enableCors({
		origin: config.corsAllowedOrigins,
		credentials: true,
		methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id'],
		exposedHeaders: ['X-Request-Id', 'X-API-Version', 'X-API-Lifecycle'],
	})
	app.useGlobalFilters(new ApiExceptionFilter(logger))
	configureSwagger(app)

	await app.listen(config.port, config.bindAddress)
	logger.log(`API listening on http://${config.bindAddress}:${config.port}/v1`)
}

void bootstrap().catch(() => {
	console.error('API bootstrap failed.')
	process.exitCode = 1
})
