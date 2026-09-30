import { type AccessContext, type OwnershipScope } from 'contracts'

export class AccessDeniedError extends Error {
	readonly code = 'ACCESS_DENIED'

	constructor(message = 'This action is not permitted.') {
		super(message)
		this.name = 'AccessDeniedError'
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
	assertRecentMfa(context, now)
}

export function assertRecentMfa(context: AccessContext, now = new Date()): void {
	if (context.actor.kind !== 'user') throw new AccessDeniedError()
	const mfaVerifiedAt = context.session.mfaVerifiedAt && new Date(context.session.mfaVerifiedAt)
	const recentAuthAt = context.session.recentAuthAt && new Date(context.session.recentAuthAt)
	const oldestAllowed = now.getTime() - 15 * 60 * 1000
	if (
		!mfaVerifiedAt ||
		!recentAuthAt ||
		mfaVerifiedAt.getTime() > now.getTime() ||
		mfaVerifiedAt.getTime() < oldestAllowed ||
		recentAuthAt.getTime() > now.getTime() ||
		recentAuthAt.getTime() < oldestAllowed
	)
		throw new AccessDeniedError('Recent multi-factor authentication is required.')
}
