import { randomUUID } from 'node:crypto'

export interface DemoWorkspace {
	id: string
	createdAt: string
	expiresAt: string
	state: 'active' | 'purged'
}

export class DemoWorkspaceService {
	private readonly workspaces = new Map<string, DemoWorkspace>()

	create(now = new Date()): DemoWorkspace {
		const workspace = {
			id: randomUUID(),
			createdAt: now.toISOString(),
			expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
			state: 'active' as const,
		}
		this.workspaces.set(workspace.id, workspace)
		return { ...workspace }
	}

	purgeExpired(now = new Date()): string[] {
		const purged: string[] = []
		for (const workspace of this.workspaces.values()) {
			if (workspace.state === 'active' && new Date(workspace.expiresAt) <= now) {
				workspace.state = 'purged'
				purged.push(workspace.id)
			}
		}
		return purged
	}

	get(id: string): DemoWorkspace | undefined {
		const workspace = this.workspaces.get(id)
		return workspace ? { ...workspace } : undefined
	}
}
