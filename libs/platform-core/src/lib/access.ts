import { type AccessContext, AccessContextSchema, type OwnershipScope } from 'contracts'

export class AccessDeniedError extends Error {
	readonly code = 'ACCESS_DENIED'

	constructor(message = 'This action is not permitted.') {
		super(message)
		this.name = 'AccessDeniedError'
	}
}

/**
 * The opaque session identifier is the only client input. The stored session
 * determines every authorization dimension before an application service runs.
 */
export class SessionRegistry {
	private readonly sessions = new Map<string, AccessContext>()

	register(context: AccessContext): void {
		this.sessions.set(context.session.id, AccessContextSchema.parse(context))
	}

	revoke(sessionId: string, at = new Date()): void {
		const context = this.sessions.get(sessionId)
		if (!context) return

		this.sessions.set(sessionId, {
			...context,
			session: { ...context.session, revokedAt: at.toISOString() },
		})
	}

	derive(sessionId: string | undefined, now = new Date()): AccessContext {
		if (!sessionId) {
			throw new AccessDeniedError('Authentication is required.')
		}

		const context = this.sessions.get(sessionId)
		if (!context || context.session.revokedAt || new Date(context.session.expiresAt) <= now) {
			throw new AccessDeniedError('Authentication is required.')
		}

		return context
	}
}

export function assertScope(context: AccessContext, scope: OwnershipScope): void {
	if (context.workspaceId !== scope.workspaceId) {
		throw new AccessDeniedError()
	}

	if (scope.vendorId && context.activeVendorId !== scope.vendorId) {
		throw new AccessDeniedError()
	}

	if (scope.locationId && !context.locationIds.includes(scope.locationId)) {
		throw new AccessDeniedError()
	}
}

/** High-risk mutations require an actual Vendor Owner session with current MFA and recent authentication. */
export function assertElevatedSession(context: AccessContext, now = new Date()): void {
	if (
		context.actor.kind !== 'user' ||
		!context.activeVendorId ||
		!context.memberships.some((membership) => membership.active && membership.role === 'vendor_owner')
	)
		throw new AccessDeniedError()
	const mfaVerifiedAt = context.session.mfaVerifiedAt && new Date(context.session.mfaVerifiedAt)
	const recentAuthAt = context.session.recentAuthAt && new Date(context.session.recentAuthAt)
	const oldestAllowed = now.getTime() - 15 * 60 * 1000
	if (
		!mfaVerifiedAt ||
		!recentAuthAt ||
		mfaVerifiedAt.getTime() > now.getTime() ||
		recentAuthAt.getTime() > now.getTime() ||
		recentAuthAt.getTime() < oldestAllowed
	)
		throw new AccessDeniedError('Recent multi-factor authentication is required.')
}
