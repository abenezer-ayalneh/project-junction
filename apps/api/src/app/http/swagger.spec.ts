import { Test } from '@nestjs/testing'

import { AppModule } from '../app.module'
import { createSwaggerDocument } from './swagger'

describe('OpenAPI v1 contract', () => {
	it('publishes a stable, persistence-free public contract', async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
		const app = module.createNestApplication()
		app.setGlobalPrefix('v1')

		try {
			const document = createSwaggerDocument(app)

			expect(document.openapi).toBe('3.0.0')
			expect(document).toMatchSnapshot()
			expect(JSON.stringify(document)).not.toMatch(/Prisma|@prisma|providerSecret|rawProviderPayload/)
			expect(JSON.stringify(document)).not.toContain('"type":"null"')
		} finally {
			await app.close()
		}
	})

	it('publishes the real identity contract without a session-header contract', async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] }).compile()
		const app = module.createNestApplication()
		app.setGlobalPrefix('v1')
		try {
			const document = createSwaggerDocument(app)
			expect(document.paths['/v1/identity/didit-webhook']).toBeDefined()
			expect(document.paths['/v1/identity/verification-status']?.get?.security).toEqual([{ 'junction-auth-cookie': [] }])
			expect(document.components?.securitySchemes?.['junction-session']).toBeUndefined()
			expect(document.paths['/v1/access-context']?.get?.security).toEqual([{ 'junction-auth-cookie': [] }])
			expect(JSON.stringify(document)).not.toContain('x-junction-session')
		} finally {
			await app.close()
		}
	})
})
