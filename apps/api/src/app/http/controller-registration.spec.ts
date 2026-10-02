import { Test } from '@nestjs/testing'

import { httpControllers } from '../app.module'
import { FoundationService } from '../foundation/foundation.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { AppController } from './app.controller'

describe('runtime HTTP controller registration', () => {
	it('registers the real HTTP controller set', async () => {
		expect(httpControllers).toEqual([AppController])
		const module = await Test.createTestingModule({
			controllers: httpControllers,
			providers: [
				{ provide: FoundationService, useValue: { health: () => Promise.resolve({ status: 'ok' }) } },
				{ provide: RealtimeGateway, useValue: { ready: () => Promise.resolve() } },
			],
		}).compile()
		const app = module.createNestApplication()
		app.setGlobalPrefix('v1')
		try {
			await app.listen(0, '127.0.0.1')
			expect((await fetch(`${await app.getUrl()}/v1/health`)).status).toBe(200)
		} finally {
			await app.close()
		}
	})
})
