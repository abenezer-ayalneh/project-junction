import {
	type AccessContext,
	IdempotencyKeySchema,
	LocationScheduleCommandSchema,
	LocationScheduleResultSchema,
	ScheduleCalendarSchema,
	ServiceConfigurationSchema,
	ServiceSchedulingRulesCommandSchema,
	ServiceSchedulingRulesResultSchema,
	ServiceSchedulingRulesSchema,
	type ServiceSlotSelection,
	ServiceSlotSelectionSchema,
	ServiceSlotsResultSchema,
	type StaffSchedule,
	StaffScheduleCommandSchema,
	StaffScheduleResultSchema,
	StaffScheduleSchema,
} from 'contracts'
import { z } from 'zod'

import { Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertScope } from './access.js'
import { goodsAudit, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import { ServiceDefinitionConflictError } from './service-definitions.js'
import { calculateSlots } from './slot-calculation.js'

type Transaction = Prisma.TransactionClient
type Dependencies = Omit<GoodsDependencies, 'payments'>
export class ServiceScheduling {
	constructor(private readonly dependencies: Dependencies) {}
	private isOwner(context: AccessContext) {
		return context.memberships.some(
			(membership) => membership.active && membership.vendorId === context.activeVendorId && membership.role === 'vendor_owner',
		)
	}
	private async scheduler(tx: Transaction, context: AccessContext) {
		if (this.isOwner(context)) return true
		if (!context.activeVendorId) return false
		const membership = await tx.vendorMembership.findUnique({
			where: { userId_vendorId: { userId: context.actor.userId, vendorId: context.activeVendorId } },
		})
		return Boolean(membership && !membership.revokedAt && membership.schedulingEnabled)
	}
	private locationScope(context: AccessContext, locationId: string) {
		assertScope(context, { workspaceId: context.workspaceId, vendorId: context.activeVendorId ?? undefined, locationId })
	}
	private scheduleScope(context: AccessContext, schedule: StaffSchedule) {
		for (const scope of schedule.scopes) if (scope.locationId) this.locationScope(context, scope.locationId)
	}
	async locationCalendar(sessionId: string | undefined, idInput: string, keyInput?: string, input?: unknown) {
		const locationId = z.string().uuid().parse(idInput)
		const command = input === undefined ? undefined : LocationScheduleCommandSchema.parse(input)
		const key = command ? IdempotencyKeySchema.parse(keyInput) : undefined
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId)
			if (!(await this.scheduler(tx, context))) throw new AccessDeniedError()
			this.locationScope(context, locationId)
			const location = await tx.location.findFirst({ where: { id: locationId, vendorId: context.activeVendorId ?? '' } })
			if (!location) throw new AccessDeniedError()
			if (!command || !key)
				return LocationScheduleResultSchema.parse({
					locationId,
					version: location.scheduleVersion,
					calendar: location.scheduleCalendar,
					replayed: false,
				})
			const result = await this.dependencies.replay(tx, context, key, 'PUT /v1/locations/:locationId/schedule', { locationId, command }, async () => {
				if (location.scheduleVersion !== command.expectedVersion)
					throw new ServiceDefinitionConflictError('Location schedule changed. Reload before saving.')
				const updated = await tx.location.update({
					where: { id: locationId },
					data: { scheduleCalendar: goodsJson(command.calendar), scheduleVersion: { increment: 1 } },
				})
				await goodsAudit(tx, context.workspaceId, context.actor.userId, 'schedule.location-updated', { locationId, version: updated.scheduleVersion })
				await goodsEmit(tx, this.dependencies.now, context.workspaceId, 'LocationScheduleUpdated', locationId, updated.scheduleVersion, key, {
					locationId,
				})
				return LocationScheduleResultSchema.parse({ locationId, version: updated.scheduleVersion, calendar: command.calendar, replayed: false })
			})
			return LocationScheduleResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	async staffSchedule(sessionId: string | undefined, idInput: string, keyInput?: string, input?: unknown) {
		const staffId = z.string().uuid().parse(idInput)
		const command = input === undefined ? undefined : StaffScheduleCommandSchema.parse(input)
		const key = command ? IdempotencyKeySchema.parse(keyInput) : undefined
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId)
			const staff = await tx.staff.findFirst({ where: { id: staffId, vendorId: context.activeVendorId ?? '' } })
			if (!staff || (!(await this.scheduler(tx, context)) && staff.userId !== context.actor.userId)) throw new AccessDeniedError()
			if (staff.schedule) this.scheduleScope(context, StaffScheduleSchema.parse(staff.schedule))
			if (!command || !key) return StaffScheduleResultSchema.parse({ staffId, version: staff.scheduleVersion, schedule: staff.schedule, replayed: false })
			this.scheduleScope(context, command.schedule)
			const result = await this.dependencies.replay(tx, context, key, 'PUT /v1/vendor/staff/:staffId/schedule', { staffId, command }, async () => {
				if (staff.scheduleVersion !== command.expectedVersion) throw new ServiceDefinitionConflictError('Staff schedule changed. Reload before saving.')
				const updated = await tx.staff.update({
					where: { id: staffId },
					data: { schedule: goodsJson(command.schedule), scheduleVersion: { increment: 1 } },
				})
				await goodsAudit(tx, context.workspaceId, context.actor.userId, 'schedule.staff-updated', { staffId, version: updated.scheduleVersion })
				await goodsEmit(tx, this.dependencies.now, context.workspaceId, 'StaffScheduleUpdated', staffId, updated.scheduleVersion, key, { staffId })
				return StaffScheduleResultSchema.parse({ staffId, version: updated.scheduleVersion, schedule: command.schedule, replayed: false })
			})
			return StaffScheduleResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	async serviceRules(sessionId: string | undefined, idInput: string, keyInput?: string, input?: unknown) {
		const listingId = z.string().uuid().parse(idInput)
		const command = input === undefined ? undefined : ServiceSchedulingRulesCommandSchema.parse(input)
		const key = command ? IdempotencyKeySchema.parse(keyInput) : undefined
		return this.dependencies.db.$transaction(async (tx) => {
			const context = await this.dependencies.derive(tx, sessionId)
			if (!this.isOwner(context)) throw new AccessDeniedError()
			const listing = await tx.listing.findFirst({ where: { id: listingId, kind: 'service', vendorId: context.activeVendorId ?? '' } })
			if (!listing?.serviceConfiguration) throw new AccessDeniedError()
			for (const option of ServiceConfigurationSchema.parse(listing.serviceConfiguration).options)
				for (const locationId of option.locationIds) this.locationScope(context, locationId)
			if (!command || !key)
				return ServiceSchedulingRulesResultSchema.parse({
					listingId,
					version: listing.schedulingRulesVersion,
					rules: listing.schedulingRules,
					replayed: false,
				})
			const result = await this.dependencies.replay(
				tx,
				context,
				key,
				'PUT /v1/listings/:listingId/scheduling-rules',
				{ listingId, command },
				async () => {
					if (listing.schedulingRulesVersion !== command.expectedVersion)
						throw new ServiceDefinitionConflictError('Service scheduling rules changed. Reload before saving.')
					const updated = await tx.listing.update({
						where: { id: listingId },
						data: { schedulingRules: goodsJson(command.rules), schedulingRulesVersion: { increment: 1 } },
					})
					await goodsAudit(tx, context.workspaceId, context.actor.userId, 'schedule.service-rules-updated', {
						listingId,
						version: updated.schedulingRulesVersion,
					})
					await goodsEmit(
						tx,
						this.dependencies.now,
						context.workspaceId,
						'ServiceSchedulingRulesUpdated',
						listingId,
						updated.schedulingRulesVersion,
						key,
						{ listingId },
					)
					return ServiceSchedulingRulesResultSchema.parse({
						listingId,
						version: updated.schedulingRulesVersion,
						rules: command.rules,
						replayed: false,
					})
				},
			)
			return ServiceSchedulingRulesResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	async slots(idInput: string, input: unknown) {
		const listingId = z.string().uuid().parse(idInput)
		const selection = ServiceSlotSelectionSchema.parse(input)
		return this.dependencies.db.$transaction(async (tx) => (await this.evaluate(tx, listingId, selection, this.dependencies.now())).result, {
			isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
			timeout: 30_000,
		})
	}
	/** Shared current-state evaluator; holds call this after the capacity/Vendor lock. */
	async evaluate(tx: Transaction, listingId: string, selection: ServiceSlotSelection, now: Date, chooseAt?: string) {
		const listing = await tx.listing.findFirst({
			where: {
				id: listingId,
				kind: 'service',
				state: 'published',
				vendor: { applicationState: 'approved', publishedAt: { not: null }, workspace: { kind: 'real' } },
			},
			include: { vendor: { include: { staff: true, locations: true } } },
		})
		if (!listing?.serviceConfiguration || !listing.schedulingRules) throw new AccessDeniedError()
		const configuration = ServiceConfigurationSchema.parse(listing.serviceConfiguration)
		const rules = ServiceSchedulingRulesSchema.parse(listing.schedulingRules)
		const option = configuration.options.find((value) => value.id === selection.optionId)
		if (!option || (selection.mode === 'online' ? !option.online : !option.locationIds.includes(selection.locationId ?? ''))) throw new AccessDeniedError()
		const addons = selection.addonIds.map((addonId) => option.addons.find((addon) => addon.id === addonId))
		if (addons.some((addon) => !addon)) throw new AccessDeniedError()
		const durationMinutes = option.durationMinutes + addons.reduce((sum, addon) => sum + (addon?.durationMinutes ?? 0), 0)
		const priceCents = option.priceCents + addons.reduce((sum, addon) => sum + (addon?.priceCents ?? 0), 0)
		const location = selection.locationId ? listing.vendor.locations.find((value) => value.id === selection.locationId) : undefined
		if (selection.mode === 'in_person' && (!location?.scheduleCalendar || !location.label || !location.city)) throw new AccessDeniedError()
		const locationCalendar = location?.scheduleCalendar ? ScheduleCalendarSchema.parse(location.scheduleCalendar) : undefined
		const qualifiedIds = option.qualifications
			.filter((value) => (selection.mode === 'online' ? value.online : value.locationIds.includes(selection.locationId ?? '')))
			.map((value) => value.staffId)
		const qualified = listing.vendor.staff.filter((staff) => qualifiedIds.includes(staff.id))
		if (selection.staffId && !qualified.some((staff) => staff.id === selection.staffId && staff.publicConsentAt && staff.userId && staff.displayName))
			throw new AccessDeniedError()
		const selectedStaff = qualified.filter((staff) => !selection.staffId || staff.id === selection.staffId)
		const from = new Date(selection.from)
		const to = new Date(selection.to)
		const rangeStart = new Date(from.getTime() - option.bufferBeforeMinutes * 60_000)
		const rangeEnd = new Date(to.getTime() + (durationMinutes + option.bufferAfterMinutes) * 60_000)
		// Occupancy spans all Services, Locations and modes for each concrete Staff member.
		const allocations = await tx.staffAllocation.findMany({
			where: {
				staffId: { in: selectedStaff.map((staff) => staff.id) },
				startAt: { lt: rangeEnd },
				endAt: { gt: rangeStart },
				OR: [{ state: 'booked' }, { state: 'held', expiresAt: { gt: now } }],
			},
		})
		const staffCalendars = selectedStaff.flatMap((staff) => {
			if (!staff.schedule) return []
			const scope = StaffScheduleSchema.parse(staff.schedule).scopes.find(
				(scope) => scope.mode === selection.mode && scope.locationId === selection.locationId,
			)
			return scope ? [{ calendar: scope.calendar, allocations: allocations.filter((allocation) => allocation.staffId === staff.id) }] : []
		})
		const timezone = locationCalendar?.timezone ?? rules.timezone
		const slots = calculateSlots({
			from,
			to,
			now,
			rules,
			timezone,
			durationMinutes,
			bufferBeforeMinutes: option.bufferBeforeMinutes,
			bufferAfterMinutes: option.bufferAfterMinutes,
			locationCalendar,
			staff: staffCalendars,
		})
		const result = ServiceSlotsResultSchema.parse({
			listingId,
			optionId: option.id,
			mode: selection.mode,
			locationId: selection.locationId,
			staffId: selection.staffId,
			timezone,
			configurationVersion: listing.serviceConfigurationVersion,
			rulesVersion: listing.schedulingRulesVersion,
			evaluatedAt: now.toISOString(),
			durationMinutes,
			priceCents,
			bufferBeforeMinutes: option.bufferBeforeMinutes,
			bufferAfterMinutes: option.bufferAfterMinutes,
			reserved: false,
			slots,
		})
		const availableStaffIds = chooseAt
			? selectedStaff
					.filter((staff) => {
						if (!staff.schedule) return false
						const scope = StaffScheduleSchema.parse(staff.schedule).scopes.find(
							(scope) => scope.mode === selection.mode && scope.locationId === selection.locationId,
						)
						return Boolean(
							scope &&
							calculateSlots({
								from,
								to,
								now,
								rules,
								timezone,
								durationMinutes,
								bufferBeforeMinutes: option.bufferBeforeMinutes,
								bufferAfterMinutes: option.bufferAfterMinutes,
								locationCalendar,
								staff: [{ calendar: scope.calendar, allocations: allocations.filter((allocation) => allocation.staffId === staff.id) }],
							}).some((slot) => slot.start === chooseAt),
						)
					})
					.map((staff) => staff.id)
					.sort()
			: []
		return { result, availableStaffIds, listing, option, addons, location }
	}
}
