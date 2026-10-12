import {
	type AccessContext,
	IdempotencyKeySchema,
	PublicServiceDefinitionSchema,
	type ServiceConfiguration,
	ServiceConfigurationCommandSchema,
	ServiceConfigurationResultSchema,
	ServiceConfigurationSchema,
	StaffConsentCommandSchema,
	StaffProfileCreateSchema,
	StaffProfileResultSchema,
	StaffProfilesSchema,
	StaffProfileUpdateSchema,
} from 'contracts'
import { z } from 'zod'

import { type Prisma, type Staff } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertScope } from './access.js'
import { goodsAudit, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'

type Transaction = Prisma.TransactionClient
// Shares the foundation's authoritative transaction, session, workspace lock and retry boundary.
type Dependencies = Omit<GoodsDependencies, 'payments'>
export class ServiceDefinitionConflictError extends Error {
	readonly code = 'UNAVAILABLE'
	constructor(message = 'Service configuration changed. Reload before saving.') {
		super(message)
		this.name = 'ServiceDefinitionConflictError'
	}
}

export class ServiceDefinitions {
	constructor(private readonly dependencies: Dependencies) {}

	private async owner(tx: Transaction, sessionId: string | undefined) {
		const context = await this.dependencies.derive(tx, sessionId)
		if (
			!context.activeVendorId ||
			!context.memberships.some((membership) => membership.active && membership.vendorId === context.activeVendorId && membership.role === 'vendor_owner')
		)
			throw new AccessDeniedError()
		return context
	}
	private async listing(tx: Transaction, context: AccessContext, listingId: string) {
		const listing = await tx.listing.findFirst({ where: { id: listingId, vendorId: context.activeVendorId ?? '' } })
		if (!listing || listing.kind !== 'service') throw new AccessDeniedError()
		return listing
	}
	private assertLocations(context: AccessContext, configuration: ServiceConfiguration) {
		for (const option of configuration.options)
			for (const locationId of option.locationIds)
				assertScope(context, { workspaceId: context.workspaceId, vendorId: context.activeVendorId ?? undefined, locationId })
	}
	async read(sessionId: string | undefined, idInput: string) {
		const listingId = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.owner(tx, sessionId)
			const listing = await this.listing(tx, context, listingId)
			if (listing.serviceConfiguration) this.assertLocations(context, ServiceConfigurationSchema.parse(listing.serviceConfiguration))
			return ServiceConfigurationResultSchema.parse({
				listingId,
				version: listing.serviceConfigurationVersion,
				configuration: listing.serviceConfiguration,
				replayed: false,
			})
		})
	}
	async configure(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const listingId = z.string().uuid().parse(idInput)
		const command = ServiceConfigurationCommandSchema.parse(input)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.owner(tx, sessionId)
			const listing = await this.listing(tx, context, listingId)
			// An Owner with a partial Location grant cannot erase another Location's definitions.
			if (listing.serviceConfiguration) this.assertLocations(context, ServiceConfigurationSchema.parse(listing.serviceConfiguration))
			this.assertLocations(context, command.configuration)
			const result = await this.dependencies.replay(
				tx,
				context,
				key,
				'PUT /v1/listings/:listingId/service-configuration',
				{ listingId, command },
				async () => {
					if (listing.serviceConfigurationVersion !== command.expectedVersion) throw new ServiceDefinitionConflictError()
					const locationIds = [...new Set(command.configuration.options.flatMap((option) => option.locationIds))]
					const locations = await tx.location.findMany({ where: { id: { in: locationIds }, vendorId: listing.vendorId } })
					if (locations.length !== locationIds.length || locations.some((location) => !location.label || !location.city))
						throw new AccessDeniedError()
					const staffIds = [
						...new Set(command.configuration.options.flatMap((option) => option.qualifications.map((qualification) => qualification.staffId))),
					]
					const staff = await tx.staff.findMany({ where: { id: { in: staffIds }, vendorId: listing.vendorId } })
					if (staff.length !== staffIds.length) throw new AccessDeniedError()
					const updated = await tx.listing.update({
						where: { id: listingId },
						data: { serviceConfiguration: goodsJson(command.configuration), serviceConfigurationVersion: { increment: 1 } },
					})
					await goodsAudit(tx, context.workspaceId, context.actor.userId, 'service.configured', {
						listingId,
						version: updated.serviceConfigurationVersion,
					})
					await goodsEmit(tx, this.dependencies.now, context.workspaceId, 'ServiceConfigured', listingId, updated.serviceConfigurationVersion, key, {
						listingId,
					})
					return ServiceConfigurationResultSchema.parse({
						listingId,
						version: updated.serviceConfigurationVersion,
						configuration: command.configuration,
						replayed: false,
					})
				},
			)
			return ServiceConfigurationResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	private profile(staff: Staff, replayed = false) {
		return StaffProfileResultSchema.parse({
			id: staff.id,
			displayName: staff.displayName,
			version: staff.profileVersion,
			publicDisplay: Boolean(staff.publicConsentAt),
			replayed,
		})
	}
	async profiles(sessionId: string | undefined) {
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.owner(tx, sessionId)
			const staff = await tx.staff.findMany({ where: { vendorId: context.activeVendorId ?? '' }, orderBy: { id: 'asc' } })
			return StaffProfilesSchema.parse({ items: staff.map((profile) => this.profile(profile)) })
		})
	}
	async readProfile(sessionId: string | undefined, idInput: string) {
		const staffId = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId)
			const staff = await tx.staff.findFirst({ where: { id: staffId, vendorId: context.activeVendorId ?? '' } })
			const isOwner = context.memberships.some(
				(membership) => membership.active && membership.vendorId === context.activeVendorId && membership.role === 'vendor_owner',
			)
			if (!staff || (!isOwner && staff.userId !== context.actor.userId)) throw new AccessDeniedError()
			return this.profile(staff)
		})
	}
	async createProfile(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = StaffProfileCreateSchema.parse(input)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.owner(tx, sessionId)
			const result = await this.dependencies.replay(tx, context, key, 'POST /v1/vendor/staff', command, async () => {
				if (!context.activeVendorId) throw new AccessDeniedError()
				if (command.memberUserId)
					await tx.$queryRaw`SELECT id FROM vendor_memberships WHERE user_id = ${command.memberUserId}::uuid AND vendor_id = ${context.activeVendorId}::uuid FOR UPDATE`
				const membership = command.memberUserId
					? await tx.vendorMembership.findFirst({
							where: { userId: command.memberUserId, vendorId: context.activeVendorId, revokedAt: null, staffId: null },
						})
					: null
				if (command.memberUserId && !membership) throw new AccessDeniedError()
				const staff = await tx.staff.create({
					data: { vendorId: context.activeVendorId, displayName: command.displayName, profileVersion: 1, userId: command.memberUserId },
				})
				if (membership) await tx.vendorMembership.update({ where: { id: membership.id }, data: { staffId: staff.id } })
				await goodsAudit(tx, context.workspaceId, context.actor.userId, 'staff.profile-created', { staffId: staff.id })
				await goodsEmit(tx, this.dependencies.now, context.workspaceId, 'StaffProfileCreated', staff.id, staff.profileVersion, key, {
					staffId: staff.id,
				})
				return this.profile(staff)
			})
			return StaffProfileResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	async updateProfile(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown, consent = false) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const staffId = z.string().uuid().parse(idInput)
		const command = consent ? StaffConsentCommandSchema.parse(input) : StaffProfileUpdateSchema.parse(input)
		return this.dependencies.db.$transaction(async (tx) => {
			const context = consent ? await this.dependencies.derive(tx, sessionId) : await this.owner(tx, sessionId)
			const staff = await tx.staff.findFirst({ where: { id: staffId, vendorId: context.activeVendorId ?? '' } })
			if (!staff || (consent && (staff.userId !== context.actor.userId || !staff.displayName))) throw new AccessDeniedError()
			const action = consent ? 'StaffPublicConsentChanged' : 'StaffProfileUpdated'
			const result = await this.dependencies.replay(
				tx,
				context,
				key,
				consent ? 'PUT /v1/vendor/staff/:staffId/public-consent' : 'PUT /v1/vendor/staff/:staffId',
				{ staffId, command },
				async () => {
					if (staff.profileVersion !== command.expectedVersion)
						throw new ServiceDefinitionConflictError('Staff profile changed. Reload before saving.')
					const updated = await tx.staff.update({
						where: { id: staffId },
						data: {
							profileVersion: { increment: 1 },
							...('publicDisplay' in command
								? { publicConsentAt: command.publicDisplay ? this.dependencies.now() : null }
								: { displayName: command.displayName, publicConsentAt: null }),
						},
					})
					// Renaming withdraws prior display consent: the linked Staff member must approve the new name.
					await goodsAudit(tx, context.workspaceId, context.actor.userId, consent ? 'staff.public-consent-changed' : 'staff.profile-updated', {
						staffId,
						publicDisplay: Boolean(updated.publicConsentAt),
					})
					await goodsEmit(tx, this.dependencies.now, context.workspaceId, action, staffId, updated.profileVersion, key, { staffId })
					return this.profile(updated)
				},
			)
			return StaffProfileResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	async publicDefinition(idInput: string) {
		const listingId = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(async (tx) => {
			const listing = await tx.listing.findFirst({
				where: {
					id: listingId,
					kind: 'service',
					state: 'published',
					vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'real' } },
				},
				include: { vendor: { include: { locations: true, staff: true } } },
			})
			if (!listing?.serviceConfiguration) throw new AccessDeniedError()
			const configuration = ServiceConfigurationSchema.parse(listing.serviceConfiguration)
			return PublicServiceDefinitionSchema.parse({
				listingId,
				version: listing.serviceConfigurationVersion,
				capacity: configuration.capacity,
				options: configuration.options.map((option) => {
					const locations = listing.vendor.locations.filter((location) => option.locationIds.includes(location.id) && location.label && location.city)
					const modes = [
						...locations.map((location) => ({ mode: 'in_person' as const, locationId: location.id })),
						...(option.online ? [{ mode: 'online' as const, locationId: null }] : []),
					]
					return {
						...option,
						locations: locations.map((location) => ({ id: location.id, label: location.label, city: location.city })),
						eligibleModes: modes.map((mode) => {
							const qualifiedIds = option.qualifications
								.filter((qualification) => (mode.locationId ? qualification.locationIds.includes(mode.locationId) : qualification.online))
								.map((qualification) => qualification.staffId)
							const qualified = listing.vendor.staff.filter((staff) => qualifiedIds.includes(staff.id))
							return {
								...mode,
								anyStaffEligible: qualified.length > 0,
								namedStaff: qualified
									.filter((staff) => staff.publicConsentAt && staff.userId && staff.displayName)
									.map((staff) => ({ id: staff.id, displayName: staff.displayName })),
							}
						}),
					}
				}),
			})
		})
	}
}
