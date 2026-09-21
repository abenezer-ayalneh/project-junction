import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'

import { getApiRuntimeConfig } from './api-runtime.config'
import { AppController } from './app.controller'
import { FoundationService } from './foundation.service'

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
	controllers: [AppController],
	providers: [
		FoundationService,
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
	],
})
export class AppModule {}
