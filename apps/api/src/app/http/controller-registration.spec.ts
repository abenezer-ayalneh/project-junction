import { Test } from '@nestjs/testing'

import { httpControllersForMode } from '../app.module'
import { FoundationService } from '../foundation/foundation.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { AppController } from './app.controller'
import { SyntheticController } from './synthetic.controller'

describe('runtime HTTP controller registration', () => {
	it('omits synthetic routes from staging and retains the local regression controller', async () => {
		expect(httpControllersForMode('staging')).toEqual([AppController])
		expect(httpControllersForMode('synthetic')).toEqual([AppController, SyntheticController])
		for (const [mode, expectedStatus] of [
			['staging', 404],
			['synthetic', 201],
		] as const) {
			const module = await Test.createTestingModule({
				controllers: httpControllersForMode(mode),
				providers: [
					{
						provide: FoundationService,
						useValue: { health: () => Promise.resolve({ status: 'ok' }), createSyntheticAccount: () => Promise.resolve({ id: 'local-test' }) },
					},
					{ provide: RealtimeGateway, useValue: { ready: () => Promise.resolve() } },
				],
			}).compile()
			const app = module.createNestApplication()
			app.setGlobalPrefix('v1')
			try {
				await app.listen(0, '127.0.0.1')
				const url = await app.getUrl()
				const response = await fetch(`${url}/v1/synthetic/accounts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
				expect(response.status).toBe(expectedStatus)
				expect((await fetch(`${url}/v1/health`)).status).toBe(200)
			} finally {
				await app.close()
			}
		}
	})
})
