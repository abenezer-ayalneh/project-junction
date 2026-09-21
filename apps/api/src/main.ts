import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'

import { ApiExceptionFilter } from './app/api-exception.filter'
import { createApiLogger } from './app/api-logger'
import { getApiRuntimeConfig } from './app/api-runtime.config'
import { AppModule } from './app/app.module'
import { configureSwagger } from './app/swagger'

async function bootstrap() {
	const app = await NestFactory.create(AppModule)
	const config = getApiRuntimeConfig(app.get(ConfigService))
	const logger = createApiLogger(config.logLevel)
	app.useLogger(logger)

	app.enableShutdownHooks()
	app.setGlobalPrefix('v1')
	app.use(helmet())
	app.enableCors({
		origin: config.corsAllowedOrigins,
		credentials: true,
		methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Idempotency-Key', 'X-Junction-Session', 'X-Request-Id'],
	})
	app.useGlobalFilters(new ApiExceptionFilter(logger))
	configureSwagger(app)

	await app.listen(config.port, '127.0.0.1')
	logger.log(`API listening on http://127.0.0.1:${config.port}/v1`)
}

void bootstrap().catch((error: unknown) => {
	console.error(error)
	process.exitCode = 1
})
