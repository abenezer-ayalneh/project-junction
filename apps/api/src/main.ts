import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'

import { ApiExceptionFilter } from './app/api-exception.filter'
import { createApiLogger } from './app/api-logger'
import { getApiRuntimeConfig } from './app/api-runtime.config'
import { AppModule } from './app/app.module'
import { requestContextMiddleware, type RequestWithContext, type ResponseWithContext } from './app/request-context'
import { configureSwagger } from './app/swagger'

async function bootstrap() {
	const app = await NestFactory.create(AppModule, { rawBody: true })
	const config = getApiRuntimeConfig(app.get(ConfigService))
	const logger = createApiLogger(config.logLevel)
	app.useLogger(logger)

	app.enableShutdownHooks()
	app.setGlobalPrefix('v1')
	app.use(helmet())
	app.use((request: RequestWithContext, response: ResponseWithContext, next: () => void) => requestContextMiddleware(request, response, next))
	app.enableCors({
		origin: config.corsAllowedOrigins,
		credentials: true,
		methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Junction-Session', 'X-Request-Id'],
		exposedHeaders: ['X-Request-Id', 'X-API-Version', 'X-API-Lifecycle'],
	})
	app.useGlobalFilters(new ApiExceptionFilter(logger))
	configureSwagger(app)

	await app.listen(config.port, '127.0.0.1')
	logger.log(`API listening on http://127.0.0.1:${config.port}/v1`)
}

void bootstrap().catch(() => {
	console.error('API bootstrap failed.')
	process.exitCode = 1
})
