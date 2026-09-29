import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'

import { FoundationService } from './foundation/foundation.service'
import { AppController } from './http/app.controller'
import { RealtimeGateway } from './realtime/realtime.gateway'
import { getApiRuntimeConfig } from './runtime/api-runtime.config'

export const httpControllers = [AppController]

@Module({
	imports: [
		ConfigModule.forRoot({ cache: true, isGlobal: true, expandVariables: true }),
		ThrottlerModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const config = getApiRuntimeConfig(configService)
				return [{ ttl: config.throttleTtlMs, limit: config.throttleLimit }]
			},
		}),
	],
	controllers: httpControllers,
	providers: [
		FoundationService,
		RealtimeGateway,
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
	],
})
export class AppModule {}
