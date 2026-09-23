import { randomUUID } from 'node:crypto'

import { type AccessContext, AccessContextSchema, type DemoPersona, DemoPersonaKeySchema, type DemoSession, DemoWorkspaceSchema } from 'contracts'

import { AccessDeniedError } from './access.js'

const PERSONAS = [
	{ key: 'customer', role: 'customer' },
	{ key: 'vendor_owner', role: 'vendor_owner' },
	{ key: 'service_staff', role: 'service_staff' },
	{ key: 'support', role: 'support' },
	{ key: 'trust', role: 'trust' },
	{ key: 'finance', role: 'finance' },
	{ key: 'platform_owner', role: 'platform_owner' },
] as const satisfies readonly DemoPersona[]

export interface DemoWorkspace {
	id: string
	createdAt: string
	expiresAt: string
	state: 'active' | 'purged'
	personas: DemoPersona[]
	session: DemoSession
}

interface StoredDemoWorkspace extends DemoWorkspace {
	personaIds: Map<DemoPersona['key'], string>
	commandEventsUsed: Map<string, number>
	vendorId: string
	locationId: string
	contexts: Map<string, AccessContext>
}

export class DemoWorkspaceService {
	private readonly workspaces = new Map<string, StoredDemoWorkspace>()

	create(now = new Date()): DemoWorkspace {
		const id = randomUUID()
		const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
		const personaIds = new Map(PERSONAS.map((persona) => [persona.key, randomUUID()]))
		const workspace: StoredDemoWorkspace = {
			id,
			createdAt: now.toISOString(),
			expiresAt,
			state: 'active' as const,
			personas: PERSONAS.map((persona) => ({ ...persona })),
			session: { id: '', personaKey: 'vendor_owner', expiresAt },
			personaIds,
			commandEventsUsed: new Map([...personaIds.values()].map((personaId) => [personaId, 0])),
			vendorId: randomUUID(),
			locationId: randomUUID(),
			contexts: new Map(),
		}
		const context = this.contextFor(workspace, 'vendor_owner')
		workspace.session = { id: context.session.id, personaKey: 'vendor_owner', expiresAt }
		workspace.contexts.set(context.session.id, context)
		this.workspaces.set(workspace.id, workspace)
		return this.public(workspace)
	}

	purgeExpired(now = new Date()): string[] {
		const purged: string[] = []
		for (const workspace of this.workspaces.values()) {
			if (workspace.state === 'active' && new Date(workspace.expiresAt) <= now) {
				workspace.state = 'purged'
				workspace.contexts.clear()
				purged.push(workspace.id)
			}
		}
		return purged
	}

	get(id: string): DemoWorkspace | undefined {
		const workspace = this.workspaces.get(id)
		return workspace ? this.public(workspace) : undefined
	}

	context(sessionId: string, now = new Date()): AccessContext | undefined {
		for (const workspace of this.workspaces.values()) {
			if (workspace.state !== 'active' || new Date(workspace.expiresAt) <= now) continue
			const context = workspace.contexts.get(sessionId)
			if (context) return context
		}
		return undefined
	}

	consumeCommandQuota(personaId: string) {
		for (const workspace of this.workspaces.values()) {
			if (workspace.state !== 'active' || new Date(workspace.expiresAt) <= new Date()) continue
			const used = workspace.commandEventsUsed.get(personaId)
			if (used === undefined) continue
			if (used >= 25) throw new AccessDeniedError('Synthetic demo persona command quota reached.')
			workspace.commandEventsUsed.set(personaId, used + 1)
			return
		}
		throw new AccessDeniedError('Demo persona is unavailable.')
	}

	switchPersona(workspaceId: string, sessionId: string, keyInput: string, now = new Date()): { previous: AccessContext; next: AccessContext } {
		const key = DemoPersonaKeySchema.parse(keyInput)
		const workspace = this.workspaces.get(workspaceId)
		if (!workspace || workspace.state !== 'active' || new Date(workspace.expiresAt) <= now) throw new Error('Demo workspace is unavailable.')
		const previous = workspace.contexts.get(sessionId)
		if (!previous) throw new Error('Demo session is unavailable.')
		const next = this.contextFor(workspace, key)
		workspace.contexts.delete(sessionId)
		workspace.contexts.set(next.session.id, next)
		workspace.session = { id: next.session.id, personaKey: key, expiresAt: workspace.expiresAt }
		return { previous, next }
	}

	private contextFor(workspace: StoredDemoWorkspace, key: DemoPersona['key']): AccessContext {
		const persona = PERSONAS.find((candidate) => candidate.key === key)
		if (!persona) throw new Error('Unknown demo persona.')
		const ownsVendor = key === 'vendor_owner'
		return AccessContextSchema.parse({
			actor: { kind: 'demo_persona', personaId: workspace.personaIds.get(key) },
			workspaceId: workspace.id,
			activeVendorId: ownsVendor ? workspace.vendorId : null,
			locationIds: ownsVendor ? [workspace.locationId] : [],
			memberships: ownsVendor ? [{ vendorId: workspace.vendorId, role: 'vendor_owner', locationIds: [workspace.locationId], active: true }] : [],
			capabilities: ownsVendor ? ['platform:foundation:read', 'platform:foundation:write'] : ['platform:foundation:read'],
			session: { id: randomUUID(), expiresAt: workspace.expiresAt, revokedAt: null, mfaVerifiedAt: null, recentAuthAt: null },
		})
	}

	private public(workspace: StoredDemoWorkspace): DemoWorkspace {
		return DemoWorkspaceSchema.parse({
			id: workspace.id,
			createdAt: workspace.createdAt,
			expiresAt: workspace.expiresAt,
			state: workspace.state,
			personas: workspace.personas,
			session: workspace.session,
		})
	}
}
