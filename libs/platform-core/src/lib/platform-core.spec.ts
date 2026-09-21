import type { AccessContext, DomainEvent } from 'contracts'

import { AccessDeniedError, assertScope, SessionRegistry } from './access.js'
import { DemoWorkspaceService } from './demo-workspaces.js'
import { IdempotencyConflictError, IdempotencyStore } from './idempotency.js'
import { InMemoryOutbox, ProviderInbox } from './outbox.js'

const ids = {
	user: '11111111-1111-4111-8111-111111111111',
	session: '22222222-2222-4222-8222-222222222222',
	workspace: '33333333-3333-4333-8333-333333333333',
	vendor: '44444444-4444-4444-8444-444444444444',
	location: '55555555-5555-4555-8555-555555555555',
	otherWorkspace: '66666666-6666-4666-8666-666666666666',
	event: '77777777-7777-4777-8777-777777777777',
}

function accessContext(): AccessContext {
	return {
		actor: { kind: 'user', userId: ids.user },
		workspaceId: ids.workspace,
		activeVendorId: ids.vendor,
		locationIds: [ids.location],
		memberships: [{ vendorId: ids.vendor, role: 'vendor_owner', locationIds: [ids.location], active: true }],
		capabilities: ['platform:foundation:read', 'platform:foundation:write'],
		session: {
			id: ids.session,
			expiresAt: '2030-01-01T00:00:00.000Z',
			revokedAt: null,
			mfaVerifiedAt: '2029-01-01T00:00:00.000Z',
			recentAuthAt: '2029-01-01T00:00:00.000Z',
		},
	}
}

describe('platform foundation guards', () => {
	it('derives a revocable server-side context and rejects scope substitution', () => {
		const sessions = new SessionRegistry()
		sessions.register(accessContext())
		const context = sessions.derive(ids.session, new Date('2029-06-01T00:00:00.000Z'))

		expect(() => assertScope(context, { workspaceId: ids.otherWorkspace })).toThrow(AccessDeniedError)
		sessions.revoke(ids.session, new Date('2029-06-01T00:00:00.000Z'))
		expect(() => sessions.derive(ids.session, new Date('2029-06-01T00:00:01.000Z'))).toThrow(AccessDeniedError)
	})

	it('returns the original outcome on an idempotent replay and rejects a mismatch', () => {
		const store = new IdempotencyStore()
		const scope = { actorId: ids.user, workspaceId: ids.workspace, vendorId: ids.vendor }
		const key = 'foundation-command-0001'
		const first = store.execute(key, scope, { marker: 'one' }, () => ({ commandId: ids.event }))
		const replay = store.execute(key, scope, { marker: 'one' }, () => ({ commandId: 'unexpected' }))

		expect(first.replayed).toBe(false)
		expect(replay).toEqual({ outcome: { commandId: ids.event }, replayed: true })
		expect(() => store.execute(key, scope, { marker: 'two' }, () => ({}))).toThrow(IdempotencyConflictError)
	})

	it('deduplicates provider callbacks and only allows the claiming worker to finish an outbox event', () => {
		const inbox = new ProviderInbox()
		const handler = jest.fn(() => 'applied')
		expect(inbox.receive('fake-payment', 'callback-1', { status: 'ok' }, handler).duplicate).toBe(false)
		expect(inbox.receive('fake-payment', 'callback-1', { status: 'ok' }, handler).duplicate).toBe(true)
		expect(handler).toHaveBeenCalledTimes(1)

		const outbox = new InMemoryOutbox()
		outbox.publish({
			eventId: ids.event,
			type: 'FoundationCommandAccepted',
			aggregateId: ids.event,
			aggregateVersion: 1,
			workspaceId: ids.workspace,
			causationId: ids.event,
			correlationId: ids.event,
			idempotencyKey: 'foundation-command-0001',
			occurredAt: '2029-01-01T00:00:00.000Z',
			schemaVersion: 1,
			payload: {},
		} satisfies DomainEvent)
		const claimed = outbox.claim('worker-a')
		if (!claimed) throw new Error('Expected the pending outbox event to be claimed.')
		expect(() => outbox.complete(claimed.id, 'worker-b')).toThrow()
		outbox.complete(claimed.id, 'worker-a')
		expect(outbox.snapshot()[0]?.state).toBe('delivered')
	})

	it('purges an expired synthetic workspace without affecting an active peer', () => {
		const demos = new DemoWorkspaceService()
		const old = demos.create(new Date('2029-01-01T00:00:00.000Z'))
		const current = demos.create(new Date('2029-01-02T12:00:00.000Z'))
		expect(demos.purgeExpired(new Date('2029-01-02T12:00:00.000Z'))).toEqual([old.id])
		expect(demos.get(old.id)?.state).toBe('purged')
		expect(demos.get(current.id)?.state).toBe('active')
	})
})
