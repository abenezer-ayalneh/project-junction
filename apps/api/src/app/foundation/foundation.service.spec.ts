import { ConfigService } from '@nestjs/config'
import { AccessDeniedError, IdempotencyConflictError } from 'platform-core'

import { FoundationService } from './foundation.service'

const syntheticSession = '00000000-0000-4000-8000-000000000002'

describe('FoundationService', () => {
	const configService = new ConfigService({ FOUNDATION_STORAGE: 'memory' })
	const createService = () => new FoundationService(configService)

	it('makes a protected synthetic command replay-safe', async () => {
		const service = createService()
		const first = await service.acceptAuditMarker(syntheticSession, 'foundation-command-0001', {
			marker: 'first proof',
		})
		const replay = await service.acceptAuditMarker(syntheticSession, 'foundation-command-0001', {
			marker: 'first proof',
		})

		expect(first.replayed).toBe(false)
		expect(replay).toEqual({ ...first, replayed: true })
		await expect(service.acceptAuditMarker(syntheticSession, 'foundation-command-0001', { marker: 'different' })).rejects.toThrow(IdempotencyConflictError)
	})

	it('requires the synthetic Vendor Owner elevation context for elevated commands', async () => {
		const service = createService()
		await expect(
			service.acceptElevatedAuditMarker(syntheticSession, 'foundation-elevated-command-0001', { marker: 'elevated proof' }),
		).resolves.toMatchObject({
			status: 'accepted',
		})
	})

	it('does not treat client-supplied claims as a session', async () => {
		const service = createService()
		await expect(service.accessContext('invented-session-id')).rejects.toThrow(AccessDeniedError)
	})

	it('uses the HTTP request correlation ID in health output', async () => {
		const service = createService()
		await expect(service.health('e1f6c321-b78e-4ac5-8649-4dd14e9aa3d2')).resolves.toMatchObject({
			requestId: 'e1f6c321-b78e-4ac5-8649-4dd14e9aa3d2',
		})
	})

	it('reads only the synthetic Location within the derived membership scope', async () => {
		const service = createService()
		await expect(service.readLocation(syntheticSession, '00000000-0000-4000-8000-000000000004')).resolves.toEqual({
			id: '00000000-0000-4000-8000-000000000004',
			vendorId: '00000000-0000-4000-8000-000000000005',
			workspaceId: '00000000-0000-4000-8000-000000000003',
		})
		await expect(service.readLocation(syntheticSession, '00000000-0000-4000-8000-000000000099')).rejects.toThrow(AccessDeniedError)
	})

	it('issues one demo persona session at a time without signup', async () => {
		const service = createService()
		const demo = await service.createDemoWorkspace()
		expect(demo.personas).toHaveLength(7)
		const owner = await service.accessContext(demo.session.id)
		expect(owner.actor.kind).toBe('demo_persona')
		expect(owner.activeVendorId).not.toBeNull()
		const customer = await service.switchDemoPersona(demo.session.id, demo.id, 'customer')
		await expect(service.accessContext(demo.session.id)).rejects.toThrow(AccessDeniedError)
		await expect(service.readLocation(customer.id, owner.locationIds[0])).rejects.toThrow(AccessDeniedError)
	})
})
