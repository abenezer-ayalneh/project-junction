import {
	type AccessContext,
	BookingHoldCommandSchema,
	BookingHoldReadSchema,
	BookingHoldReleaseResultSchema,
	BookingHoldResultSchema,
	BookingHoldSnapshotSchema,
	IdempotencyKeySchema,
} from 'contracts'
import { z } from 'zod'

import { type BookingHold, type Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError } from './access.js'
import { goodsAudit, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import type { ServiceScheduling } from './service-scheduling.js'

type Transaction = Prisma.TransactionClient
type Dependencies = Omit<GoodsDependencies, 'payments'>
export class BookingHoldConflictError extends Error {
	readonly code = 'UNAVAILABLE'
	constructor(message = 'The appointment is no longer available on these terms. Refresh availability.') {
		super(message)
		this.name = 'BookingHoldConflictError'
	}
}
export class BookingHolds {
	constructor(
		private readonly dependencies: Dependencies,
		private readonly scheduling: ServiceScheduling,
	) {}
	private async capacityLock(tx: Transaction) {
		// Share the goods checkout lock so Customer/Vendor workspace lock order cannot invert across checkout types.
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
	}
	private async customer(tx: Transaction, sessionId: string | undefined, creation = false) {
		const context = await this.dependencies.derive(tx, sessionId, creation ? undefined : { allowRestrictedVendor: true })
		if (creation) {
			const user = await tx.user.findUniqueOrThrow({ where: { id: context.actor.userId } })
			if (user.adultVerificationState !== 'verified' || !user.verifiedAt)
				throw new AccessDeniedError('Verified adult Customer identity is required for appointment holds.')
		}
		return context
	}
	private async vendorLock(tx: Transaction, vendorId: string) {
		const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: vendorId } })
		await this.dependencies.lockWorkspace(tx, vendor.workspaceId)
		return vendor
	}
	private async emit(
		tx: Transaction,
		context: { workspaceId: string; vendorId: string },
		holdId: string,
		state: 'holding' | 'released' | 'expired',
		key: string | null,
	) {
		const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: context.vendorId } })
		for (const workspaceId of new Set([context.workspaceId, vendor.workspaceId]))
			await goodsEmit(
				tx,
				this.dependencies.now,
				workspaceId,
				state === 'holding' ? 'BookingHoldCreated' : state === 'released' ? 'BookingHoldReleased' : 'BookingHoldExpired',
				holdId,
				state === 'holding' ? 1 : 2,
				key,
				{ holdId },
			)
	}
	private view(hold: BookingHold) {
		return BookingHoldReadSchema.parse({ holdId: hold.id, state: hold.state, expiresAt: hold.expiresAt.toISOString(), snapshot: hold.snapshot })
	}
	private async terminal(tx: Transaction, hold: BookingHold, state: 'released' | 'expired', actorId: string | null, key: string | null, now: Date) {
		if (hold.state !== 'holding') return hold
		await tx.staffAllocation.updateMany({ where: { holdId: hold.id, state: 'held' }, data: { state } })
		const updated = await tx.bookingHold.update({ where: { id: hold.id }, data: { state, releasedAt: now } })
		await goodsAudit(tx, hold.workspaceId, actorId, `booking.hold-${state}`, { holdId: hold.id })
		await this.emit(tx, hold, hold.id, state, key)
		return updated
	}
	private async expireVendor(tx: Transaction, vendorId: string, now: Date) {
		const due = await tx.bookingHold.findMany({ where: { vendorId, state: 'holding', expiresAt: { lte: now } } })
		for (const hold of due) await this.terminal(tx, hold, 'expired', null, null, now)
		// C02 introduced nullable legacy/test occupancy without a hold. Retire it before the static exclusion guard.
		await tx.staffAllocation.updateMany({
			where: { holdId: null, staff: { vendorId }, state: 'held', expiresAt: { lte: now } },
			data: { state: 'expired' },
		})
	}
	async create(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const command = BookingHoldCommandSchema.parse(input)
		try {
			return await this.dependencies.db.$transaction(
				async (tx) => {
					await this.capacityLock(tx)
					const context = await this.customer(tx, sessionId, true)
					const result = await this.dependencies.replay(tx, context, key, 'POST /v1/customer/bookings/holds', command, async () => {
						const listing = await tx.listing.findUnique({ where: { id: command.listingId }, select: { vendorId: true } })
						if (!listing) throw new AccessDeniedError()
						await this.vendorLock(tx, listing.vendorId)
						const now = this.dependencies.now()
						await this.expireVendor(tx, listing.vendorId, now)
						const start = new Date(command.start).toISOString()
						const evaluated = await this.scheduling.evaluate(
							tx,
							command.listingId,
							{
								optionId: command.optionId,
								addonIds: command.addonIds,
								mode: command.mode,
								locationId: command.locationId,
								staffId: command.staffId,
								from: start,
								to: new Date(new Date(start).getTime() + 60_000).toISOString(),
							},
							now,
							start,
						)
						const terms = evaluated.result
						if (
							terms.configurationVersion !== command.expectedConfigurationVersion ||
							terms.rulesVersion !== command.expectedRulesVersion ||
							!evaluated.availableStaffIds.length
						)
							throw new BookingHoldConflictError()
						const staffId = evaluated.availableStaffIds[0]
						const end = new Date(new Date(start).getTime() + terms.durationMinutes * 60_000)
						const expiresAt = new Date(now.getTime() + 15 * 60_000)
						const snapshot = BookingHoldSnapshotSchema.parse({
							listingId: command.listingId,
							vendorId: listing.vendorId,
							serviceTitle: evaluated.listing.title,
							optionId: command.optionId,
							optionLabel: evaluated.option.label,
							addons: evaluated.addons,
							mode: command.mode,
							locationId: command.locationId,
							locationLabel: evaluated.location?.label ?? null,
							locationCity: evaluated.location?.city ?? null,
							selectedStaffId: command.staffId,
							timezone: terms.timezone,
							start,
							end: end.toISOString(),
							currency: 'ETB',
							priceCents: terms.priceCents,
							durationMinutes: terms.durationMinutes,
							bufferBeforeMinutes: terms.bufferBeforeMinutes,
							bufferAfterMinutes: terms.bufferAfterMinutes,
							configurationVersion: terms.configurationVersion,
							rulesVersion: terms.rulesVersion,
						})
						const hold = await tx.bookingHold.create({
							data: {
								customerId: context.actor.userId,
								workspaceId: context.workspaceId,
								vendorId: listing.vendorId,
								snapshot: goodsJson(snapshot),
								expiresAt,
							},
						})
						await tx.staffAllocation.create({
							data: {
								holdId: hold.id,
								staffId,
								state: 'held',
								expiresAt,
								startAt: new Date(new Date(start).getTime() - terms.bufferBeforeMinutes * 60_000),
								endAt: new Date(end.getTime() + terms.bufferAfterMinutes * 60_000),
							},
						})
						await goodsAudit(tx, context.workspaceId, context.actor.userId, 'booking.hold-created', { holdId: hold.id })
						await this.emit(tx, hold, hold.id, 'holding', key)
						return BookingHoldResultSchema.parse({ ...this.view(hold), replayed: false })
					})
					return BookingHoldResultSchema.parse({ ...result.outcome, replayed: result.replayed })
				},
				{ timeout: 30_000 },
			)
		} catch (error) {
			if (error instanceof Error && error.message.includes('staff_allocations_no_overlap')) throw new BookingHoldConflictError()
			throw error
		}
	}
	private async owned(tx: Transaction, context: AccessContext, holdId: string) {
		const hold = await tx.bookingHold.findFirst({ where: { id: holdId, customerId: context.actor.userId, workspaceId: context.workspaceId } })
		if (!hold) throw new AccessDeniedError()
		await this.vendorLock(tx, hold.vendorId)
		return hold
	}
	async read(sessionId: string | undefined, idInput: string) {
		const holdId = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.capacityLock(tx)
				const context = await this.customer(tx, sessionId)
				let hold = await this.owned(tx, context, holdId)
				const now = this.dependencies.now()
				if (hold.state === 'holding' && hold.expiresAt <= now) hold = await this.terminal(tx, hold, 'expired', null, null, now)
				return this.view(hold)
			},
			{ timeout: 30_000 },
		)
	}
	async release(sessionId: string | undefined, keyInput: string | undefined, idInput: string) {
		const key = IdempotencyKeySchema.parse(keyInput)
		const holdId = z.string().uuid().parse(idInput)
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.capacityLock(tx)
				const context = await this.customer(tx, sessionId)
				const hold = await this.owned(tx, context, holdId)
				const result = await this.dependencies.replay(tx, context, key, 'POST /v1/customer/bookings/holds/:holdId/release', { holdId }, async () => {
					if (hold.state === 'committed') throw new BookingHoldConflictError('The hold has already committed.')
					const now = this.dependencies.now()
					const state = hold.state === 'holding' ? (hold.expiresAt <= now ? 'expired' : 'released') : hold.state
					if (state !== 'expired' && state !== 'released') throw new BookingHoldConflictError()
					await this.terminal(tx, hold, state, context.actor.userId, key, now)
					return BookingHoldReleaseResultSchema.parse({ holdId, state, replayed: false })
				})
				return BookingHoldReleaseResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}
	async expire() {
		return this.dependencies.db.$transaction(
			async (tx) => {
				await this.capacityLock(tx)
				const now = this.dependencies.now()
				const due = await tx.bookingHold.findMany({
					where: { state: 'holding', expiresAt: { lte: now } },
					orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
					take: 100,
				})
				const vendors = await tx.vendor.findMany({
					where: { id: { in: [...new Set(due.map((hold) => hold.vendorId))] } },
					orderBy: { workspaceId: 'asc' },
				})
				for (const workspaceId of [...new Set(vendors.map((vendor) => vendor.workspaceId))]) await this.dependencies.lockWorkspace(tx, workspaceId)
				for (const hold of due) await this.terminal(tx, hold, 'expired', null, null, now)
				return due.length
			},
			{ timeout: 30_000 },
		)
	}
}
