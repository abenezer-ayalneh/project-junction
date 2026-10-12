import {
	type AccessContext,
	BookingSnapshotSchema,
	BookingSubstitutionCommandSchema,
	BookingSubstitutionDecisionSchema,
	BookingSubstitutionReadSchema,
	BookingSubstitutionResultSchema,
	BookingWaitlistCommandSchema,
	BookingWaitlistReadSchema,
	BookingWaitlistResultSchema,
	IdempotencyKeySchema,
	ServiceSlotSelectionSchema,
} from 'contracts'
import { z } from 'zod'

import type { Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertScope } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import type { Bookings } from './bookings.js'
import { goodsAudit, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
import type { ServiceScheduling } from './service-scheduling.js'
type Tx = Prisma.TransactionClient
export class BookingChanges {
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly scheduling: ServiceScheduling,
		private readonly bookings: Bookings,
	) {}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
	}
	private async vendorActor(tx: Tx, context: AccessContext, bookingId: string) {
		const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { hold: true, allocation: true } })
		if (!booking) throw new AccessDeniedError()
		const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
		await this.deps.lockWorkspace(tx, vendor.workspaceId)
		const snapshot = BookingSnapshotSchema.parse(booking.currentSnapshot ?? booking.snapshot)
		assertScope(context, { workspaceId: vendor.workspaceId, vendorId: vendor.id, ...(snapshot.locationId ? { locationId: snapshot.locationId } : {}) })
		const member = await tx.vendorMembership.findFirst({ where: { vendorId: vendor.id, userId: context.actor.userId, revokedAt: null } })
		if (!member || (member.role !== 'vendor_owner' && !member.schedulingEnabled)) throw new AccessDeniedError()
		return { booking, vendor, snapshot }
	}
	private async proposalView(tx: Tx, id: string) {
		const proposal = await tx.bookingSubstitution.findUniqueOrThrow({ where: { id }, include: { booking: true, replacementStaff: true } })
		const snapshot = BookingSnapshotSchema.parse(proposal.booking.currentSnapshot ?? proposal.booking.snapshot)
		const named = !!snapshot.selectedStaffId
		return BookingSubstitutionReadSchema.parse({
			proposalId: id,
			bookingId: proposal.bookingId,
			state: proposal.state,
			expectedBookingVersion: proposal.expectedBookingVersion,
			replacementStaffId: named && proposal.replacementStaff.publicConsentAt ? proposal.replacementStaffId : null,
			replacementStaffName: named && proposal.replacementStaff.publicConsentAt ? proposal.replacementStaff.displayName : null,
		})
	}
	private async replace(tx: Tx, proposalId: string, actorId: string, key: string) {
		const proposal = await tx.bookingSubstitution.findUniqueOrThrow({
			where: { id: proposalId },
			include: { booking: { include: { hold: true, allocation: true } } },
		})
		const booking = proposal.booking,
			snapshot = BookingSnapshotSchema.parse(booking.currentSnapshot ?? booking.snapshot)
		if (booking.state !== 'confirmed' || booking.version !== proposal.expectedBookingVersion || new Date(snapshot.start) <= this.deps.now())
			throw new BookingHoldConflictError('Booking changed or already started.')
		if (booking.allocation.staffId === proposal.replacementStaffId) throw new BookingHoldConflictError('Select a different Staff member.')
		await tx.staffAllocation.update({ where: { id: booking.allocationId }, data: { state: 'cancelled' } })
		// Any-Staff target remains private; named replacement needs current public display consent.
		const evaluated = await this.scheduling.evaluate(
			tx,
			snapshot.listingId,
			{
				optionId: snapshot.optionId,
				addonIds: snapshot.addons.map((a) => a.id),
				mode: snapshot.mode,
				locationId: snapshot.locationId,
				staffId: snapshot.selectedStaffId ? proposal.replacementStaffId : null,
				from: snapshot.start,
				to: new Date(new Date(snapshot.start).getTime() + 60000).toISOString(),
			},
			this.deps.now(),
			snapshot.start,
		)
		if (
			!evaluated.availableStaffIds.includes(proposal.replacementStaffId) ||
			evaluated.result.durationMinutes !== snapshot.durationMinutes ||
			evaluated.result.bufferBeforeMinutes !== snapshot.bufferBeforeMinutes ||
			evaluated.result.bufferAfterMinutes !== snapshot.bufferAfterMinutes
		)
			throw new BookingHoldConflictError('Replacement is no longer available on purchased timing terms.')
		const allocation = await tx.staffAllocation.create({
			data: { staffId: proposal.replacementStaffId, state: 'booked', startAt: booking.allocation.startAt, endAt: booking.allocation.endAt },
		})
		const effective = { ...snapshot, selectedStaffId: snapshot.selectedStaffId ? proposal.replacementStaffId : null }
		await tx.bookingAmendment.create({
			data: {
				bookingId: booking.id,
				version: booking.version + 1,
				actorId,
				actorKind: 'vendor_disruption',
				previousSnapshot: goodsJson(snapshot),
				snapshot: goodsJson(effective),
				deltaCents: 0,
				amendedAt: this.deps.now(),
			},
		})
		await tx.booking.update({
			where: { id: booking.id },
			data: { allocationId: allocation.id, currentSnapshot: goodsJson(effective), version: { increment: 1 } },
		})
		await tx.bookingSubstitution.update({ where: { id: proposalId }, data: { state: 'accepted', decidedAt: this.deps.now() } })
		const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
		for (const workspaceId of new Set([booking.hold.workspaceId, vendor.workspaceId])) {
			await goodsAudit(tx, workspaceId, actorId, 'booking.staff-substituted', { bookingId: booking.id, proposalId })
			await goodsEmit(tx, () => this.deps.now(), workspaceId, 'BookingStaffSubstituted', booking.id, booking.version + 1, key, {
				bookingId: booking.id,
				proposalId,
			})
		}
	}
	async propose(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			bookingId = z.string().uuid().parse(idInput),
			command = BookingSubstitutionCommandSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
				const { booking, vendor, snapshot } = await this.vendorActor(tx, context, bookingId)
				const result = await this.deps.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/bookings/:bookingId/substitutions',
					{ bookingId, command },
					async () => {
						if (booking.state !== 'confirmed' || booking.version !== command.expectedVersion || new Date(snapshot.start) <= this.deps.now())
							throw new BookingHoldConflictError('Booking changed or already started.')
						const staff = await tx.staff.findFirst({ where: { id: command.replacementStaffId, vendorId: vendor.id } })
						if (!staff || (snapshot.selectedStaffId && (!staff.publicConsentAt || !staff.userId || !staff.displayName)))
							throw new AccessDeniedError()
						if (snapshot.selectedStaffId) {
							const checked = await this.scheduling.evaluate(
								tx,
								snapshot.listingId,
								{
									optionId: snapshot.optionId,
									addonIds: snapshot.addons.map((a) => a.id),
									mode: snapshot.mode,
									locationId: snapshot.locationId,
									staffId: staff.id,
									from: snapshot.start,
									to: new Date(new Date(snapshot.start).getTime() + 60000).toISOString(),
								},
								this.deps.now(),
								snapshot.start,
							)
							if (!checked.availableStaffIds.includes(staff.id) || checked.result.durationMinutes !== snapshot.durationMinutes)
								throw new BookingHoldConflictError('Replacement is not available on purchased timing terms.')
						}
						const pending = await tx.bookingSubstitution.findFirst({ where: { bookingId, state: 'pending' } })
						if (pending) throw new BookingHoldConflictError('A substitution decision is already pending.')
						const proposal = await tx.bookingSubstitution.create({
							data: {
								bookingId,
								replacementStaffId: staff.id,
								expectedBookingVersion: booking.version,
								actorId: context.actor.userId,
								reason: command.reason,
								decisionDueAt: new Date(snapshot.start),
								createdAt: this.deps.now(),
							},
						})
						if (!snapshot.selectedStaffId) await this.replace(tx, proposal.id, context.actor.userId, key)
						else {
							await goodsAudit(tx, context.workspaceId, context.actor.userId, 'booking.substitution-proposed', {
								bookingId,
								proposalId: proposal.id,
							})
							await goodsEmit(
								tx,
								() => this.deps.now(),
								booking.hold.workspaceId,
								'BookingSubstitutionProposed',
								bookingId,
								booking.version,
								key,
								{ bookingId, proposalId: proposal.id },
							)
						}
						return this.proposalView(tx, proposal.id)
					},
				)
				return BookingSubstitutionResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async readProposal(sessionId: string | undefined, idInput: string) {
		const id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
			const proposal = await tx.bookingSubstitution.findFirst({
				where: { id, booking: { hold: { customerId: context.actor.userId, workspaceId: context.workspaceId } } },
			})
			if (!proposal) throw new AccessDeniedError()
			return this.proposalView(tx, id)
		})
	}
	async decide(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = BookingSubstitutionDecisionSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
				const proposal = await tx.bookingSubstitution.findFirst({
					where: { id, booking: { hold: { customerId: context.actor.userId, workspaceId: context.workspaceId } } },
					include: { booking: { include: { hold: true } } },
				})
				if (!proposal) throw new AccessDeniedError()
				const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: proposal.booking.hold.vendorId } })
				await this.deps.lockWorkspace(tx, vendor.workspaceId)
				const result = await this.deps.replay(
					tx,
					context,
					key,
					'POST /v1/customer/bookings/substitutions/:proposalId/decision',
					{ id, command },
					async () => {
						const canWithdraw =
							command.decision === 'withdraw' &&
							!!BookingSnapshotSchema.parse(proposal.booking.currentSnapshot ?? proposal.booking.snapshot).selectedStaffId &&
							proposal.state === 'accepted' &&
							proposal.booking.version === proposal.expectedBookingVersion + 1
						if (proposal.state !== 'pending' && !canWithdraw) throw new BookingHoldConflictError('This substitution decision has ended.')
						if (command.decision === 'accept') await this.replace(tx, id, context.actor.userId, key)
						else {
							if (proposal.booking.version !== proposal.expectedBookingVersion && !canWithdraw)
								throw new BookingHoldConflictError('Booking changed.')
							await this.bookings.cancelInTransaction(
								tx,
								proposal.bookingId,
								context.actor.userId,
								true,
								'Named Staff substitution declined or consent withdrawn',
								key,
							)
							await tx.bookingSubstitution.update({
								where: { id },
								data: { state: command.decision === 'withdraw' ? 'withdrawn' : 'declined', decidedAt: this.deps.now() },
							})
						}
						return this.proposalView(tx, id)
					},
				)
				return BookingSubstitutionResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async waitlist(sessionId: string | undefined, keyInput: string | undefined, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			command = BookingWaitlistCommandSchema.parse(input)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId)
			const user = await tx.user.findUniqueOrThrow({ where: { id: context.actor.userId } })
			if (user.adultVerificationState !== 'verified' || !user.verifiedAt) throw new AccessDeniedError()
			const result = await this.deps.replay(tx, context, key, 'POST /v1/customer/bookings/waitlists', command, async () => {
				await this.scheduling.evaluate(tx, command.listingId, command.selection, this.deps.now())
				if ((await tx.bookingWaitlist.count({ where: { customerId: context.actor.userId, state: 'waiting' } })) >= 100)
					throw new BookingHoldConflictError('Waitlist limit reached.')
				const entry = await tx.bookingWaitlist.create({
					data: {
						customerId: context.actor.userId,
						workspaceId: context.workspaceId,
						listingId: command.listingId,
						selection: goodsJson(command.selection),
						createdAt: this.deps.now(),
					},
				})
				await goodsAudit(tx, context.workspaceId, context.actor.userId, 'booking.waitlist-joined', { waitlistId: entry.id })
				return BookingWaitlistReadSchema.parse({
					waitlistId: entry.id,
					state: entry.state,
					listingId: entry.listingId,
					selection: entry.selection,
					reserved: false,
				})
			})
			return BookingWaitlistResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	async readWaitlist(sessionId: string | undefined, idInput: string, keyInput?: string) {
		const id = z.string().uuid().parse(idInput),
			key = keyInput === undefined ? undefined : IdempotencyKeySchema.parse(keyInput)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
			const entry = await tx.bookingWaitlist.findFirst({ where: { id, customerId: context.actor.userId, workspaceId: context.workspaceId } })
			if (!entry) throw new AccessDeniedError()
			const view = (state: string) =>
				BookingWaitlistReadSchema.parse({ waitlistId: id, state, listingId: entry.listingId, selection: entry.selection, reserved: false })
			if (!key) return view(entry.state)
			const result = await this.deps.replay(tx, context, key, 'POST /v1/customer/bookings/waitlists/:waitlistId/remove', { id }, async () => {
				await tx.bookingWaitlist.update({ where: { id }, data: { state: 'removed' } })
				await goodsAudit(tx, context.workspaceId, context.actor.userId, 'booking.waitlist-removed', { waitlistId: id })
				return view('removed')
			})
			return BookingWaitlistResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	removeWaitlist(sessionId: string | undefined, id: string, key: string | undefined) {
		return this.readWaitlist(sessionId, id, IdempotencyKeySchema.parse(key))
	}

	async expireSubstitutions() {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const due = await tx.bookingSubstitution.findMany({
					where: { state: 'pending', decisionDueAt: { lte: this.deps.now() } },
					include: { booking: { include: { hold: true } } },
					orderBy: { decisionDueAt: 'asc' },
					take: 100,
				})
				for (const proposal of due) {
					const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: proposal.booking.hold.vendorId } })
					await this.deps.lockWorkspace(tx, vendor.workspaceId)
					if (proposal.booking.state === 'confirmed')
						await this.bookings.cancelInTransaction(
							tx,
							proposal.bookingId,
							proposal.actorId,
							true,
							'Named Staff substitution has no Customer consent by appointment start',
							null,
						)
					await tx.bookingSubstitution.update({ where: { id: proposal.id }, data: { state: 'withdrawn', decidedAt: this.deps.now() } })
				}
				return due.length
			},
			{ timeout: 30000 },
		)
	}

	async notifyWaitlists() {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const entries = await tx.bookingWaitlist.findMany({
					where: { state: 'waiting' },
					orderBy: [{ checkedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
					take: 100,
				})
				let notified = 0
				for (const entry of entries) {
					await tx.bookingWaitlist.update({ where: { id: entry.id }, data: { checkedAt: this.deps.now() } })
					const user = await tx.user.findUniqueOrThrow({ where: { id: entry.customerId } })
					if (user.adultVerificationState !== 'verified' || !user.verifiedAt) continue
					const selection = ServiceSlotSelectionSchema.parse(entry.selection)
					if (new Date(selection.to) <= this.deps.now()) {
						await tx.bookingWaitlist.update({ where: { id: entry.id }, data: { state: 'removed' } })
						continue
					}
					let available = false
					try {
						available = (await this.scheduling.evaluate(tx, entry.listingId, selection, this.deps.now())).result.slots.length > 0
					} catch (error) {
						if (error instanceof AccessDeniedError) continue
						throw error
					}
					if (!available) continue
					const changed = await tx.bookingWaitlist.updateMany({
						where: { id: entry.id, state: 'waiting' },
						data: { state: 'notified', notifiedAt: this.deps.now() },
					})
					if (!changed.count) continue
					await goodsEmit(tx, () => this.deps.now(), entry.workspaceId, 'BookingWaitlistAvailable', entry.id, 1, null, {
						waitlistId: entry.id,
						listingId: entry.listingId,
						reserved: false,
					})
					notified++
				}
				return notified
			},
			{ timeout: 30000 },
		)
	}
}
