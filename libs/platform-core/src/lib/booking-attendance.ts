import { randomBytes } from 'node:crypto'

import {
	type AccessContext,
	BookingAttendanceConfirmCommandSchema,
	BookingAttendanceProofSchema,
	BookingAttendanceReadSchema,
	BookingAttendanceResultSchema,
	BookingContestCommandSchema,
	BookingJoinCommandSchema,
	BookingJoinResultSchema,
	BookingNoShowCommandSchema,
	BookingNoShowResultSchema,
	BookingSnapshotSchema,
	IdempotencyKeySchema,
} from 'contracts'
import { z } from 'zod'

import { Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertScope } from './access.js'
import { BookingAttendanceCodec } from './booking-attendance-codec.js'
import { BookingHoldConflictError } from './booking-holds.js'
import type { BookingMeetings } from './booking-meetings.js'
import { goodsAudit, type GoodsDependencies, goodsEmit, goodsJson } from './goods-support.js'
type Tx = Prisma.TransactionClient
const hour = 3600000
export class BookingAttendance {
	private readonly codec = new BookingAttendanceCodec()
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly meetings: BookingMeetings,
	) {}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
	}
	private async current(tx: Tx, id: string) {
		let booking = await tx.booking.findUnique({
			where: { id },
			include: { hold: true, allocation: { include: { staff: { include: { membership: true } } } }, attendance: true },
		})
		if (!booking) throw new AccessDeniedError()
		const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
		await this.deps.lockWorkspace(tx, vendor.workspaceId)
		const snapshot = BookingSnapshotSchema.parse(booking.currentSnapshot ?? booking.snapshot)
		if (booking.state === 'confirmed' && new Date(snapshot.start) <= this.deps.now()) {
			const updated = await tx.booking.update({ where: { id: booking.id }, data: { state: 'attendance_pending' } })
			booking = { ...booking, ...updated }
			await goodsAudit(tx, vendor.workspaceId, null, 'booking.attendance-pending', { bookingId: booking.id })
			for (const workspaceId of new Set([booking.hold.workspaceId, vendor.workspaceId]))
				await goodsEmit(tx, () => this.deps.now(), workspaceId, 'BookingAttendancePending', booking.id, booking.version, null, {
					bookingId: booking.id,
				})
		}
		return { booking, vendor, snapshot }
	}
	private authorize(context: AccessContext, current: Awaited<ReturnType<BookingAttendance['current']>>, staff = false) {
		const { booking, vendor, snapshot } = current
		if (staff) {
			assertScope(context, { workspaceId: vendor.workspaceId, vendorId: vendor.id, ...(snapshot.locationId ? { locationId: snapshot.locationId } : {}) })
			const member = booking.allocation.staff.membership
			if (
				booking.allocation.staff.userId !== context.actor.userId ||
				!member ||
				member.revokedAt ||
				member.userId !== context.actor.userId ||
				member.vendorId !== vendor.id
			)
				throw new AccessDeniedError('Only the assigned Staff account can confirm attendance or report no-show.')
		} else if (booking.hold.customerId !== context.actor.userId || booking.hold.workspaceId !== context.workspaceId) throw new AccessDeniedError()
	}
	private async adult(tx: Tx, userId: string) {
		const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
		if (user.adultVerificationState !== 'verified' || !user.verifiedAt) throw new AccessDeniedError()
	}
	private view(current: Awaited<ReturnType<BookingAttendance['current']>>) {
		const { booking, snapshot } = current,
			a = booking.attendance
		return BookingAttendanceReadSchema.parse({
			bookingId: booking.id,
			bookingVersion: booking.version,
			state: booking.state,
			mode: snapshot.mode,
			joinedAt: a?.joinedAt?.toISOString() ?? null,
			completedAt: a?.completedAt?.toISOString() ?? null,
			noShowReportedAt: a?.noShowReportedAt?.toISOString() ?? null,
			noShowFinalAt: a?.noShowFinalAt?.toISOString() ?? null,
			contestUntil: a?.contestUntil?.toISOString() ?? null,
			contestedAt: a?.contestedAt?.toISOString() ?? null,
			earningAvailableAt: a?.earningAvailableAt?.toISOString() ?? null,
			earningPosting: 'phase04_pending',
		})
	}
	private async ensure(tx: Tx, current: Awaited<ReturnType<BookingAttendance['current']>>) {
		const { booking } = current
		if (booking.attendance?.bookingVersion === booking.version) return booking.attendance
		if (booking.attendance?.completedAt || booking.attendance?.noShowReportedAt)
			throw new BookingHoldConflictError('Attendance already has a terminal report.')
		return tx.bookingAttendance.upsert({
			where: { bookingId: booking.id },
			create: { bookingId: booking.id, bookingVersion: booking.version },
			update: { bookingVersion: booking.version, proofNonce: null, proofExpiresAt: null, proofAttempts: 0, joinedAt: null },
		})
	}
	private async emit(
		tx: Tx,
		current: Awaited<ReturnType<BookingAttendance['current']>>,
		type: 'BookingJoined' | 'BookingCompleted' | 'BookingNoShowReported' | 'BookingContested' | 'BookingNoShowFinal',
		key: string | null,
		version: number,
	) {
		for (const workspaceId of new Set([current.booking.hold.workspaceId, current.vendor.workspaceId]))
			await goodsEmit(tx, () => this.deps.now(), workspaceId, type, current.booking.id, version, key, { bookingId: current.booking.id })
	}
	async read(sessionId: string | undefined, idInput: string, staff = false) {
		const id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(async (tx) => {
			await this.lock(tx)
			const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true }),
				current = await this.current(tx, id)
			this.authorize(context, current, staff)
			return this.view(current)
		})
	}
	async proof(sessionId: string | undefined, idInput: string) {
		const id = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true }),
					current = await this.current(tx, id),
					{ booking, snapshot } = current
				this.authorize(context, current)
				await this.adult(tx, context.actor.userId)
				const now = this.deps.now(),
					expiresAt = new Date(new Date(snapshot.end).getTime() + 2 * hour)
				if (
					!['confirmed', 'attendance_pending'].includes(booking.state) ||
					snapshot.mode !== 'in_person' ||
					now.getTime() < new Date(snapshot.start).getTime() - 30 * 60000 ||
					now > expiresAt
				)
					throw new BookingHoldConflictError('Attendance proof is available from thirty minutes before start through two hours after end.')
				let attendance = await this.ensure(tx, current)
				if (!attendance.proofNonce || attendance.proofAttempts >= 5) {
					attendance = await tx.bookingAttendance.update({
						where: { id: attendance.id },
						data: { proofNonce: randomBytes(16).toString('hex'), proofExpiresAt: expiresAt, proofAttempts: 0 },
					})
					await goodsAudit(tx, booking.hold.workspaceId, context.actor.userId, 'booking.attendance-proof-issued', {
						bookingId: id,
						bookingVersion: booking.version,
					})
				}
				if (!attendance.proofNonce || !attendance.proofExpiresAt) throw new BookingHoldConflictError()
				const code = this.codec.code(`${id}:${booking.version}:${booking.allocation.staffId}`, attendance.proofNonce)
				return BookingAttendanceProofSchema.parse({
					bookingId: id,
					bookingVersion: booking.version,
					code,
					qrPayload: JSON.stringify({ bookingId: id, bookingVersion: booking.version, code }),
					expiresAt: attendance.proofExpiresAt.toISOString(),
				})
			},
			{ timeout: 30000 },
		)
	}
	async join(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = BookingJoinCommandSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true }),
					current = await this.current(tx, id),
					{ booking, snapshot } = current
				this.authorize(context, current)
				await this.adult(tx, context.actor.userId)
				const result = await this.deps.replay(tx, context, key, 'POST /v1/customer/bookings/:bookingId/join', { id, command }, async () => {
					const now = this.deps.now()
					if (
						!['confirmed', 'attendance_pending'].includes(booking.state) ||
						booking.version !== command.expectedVersion ||
						snapshot.mode !== 'online' ||
						now.getTime() < new Date(snapshot.start).getTime() - 15 * 60000 ||
						now.getTime() > new Date(snapshot.end).getTime() + 15 * 60000
					)
						throw new BookingHoldConflictError('Online join is outside the current appointment window.')
					const meeting = await this.meetings.readInTransaction(tx, id)
					if (meeting.state !== 'ready' || !meeting.uri) throw new BookingHoldConflictError('The meeting is not ready.')
					let attendance = await this.ensure(tx, current)
					if (!attendance.joinedAt) {
						attendance = await tx.bookingAttendance.update({ where: { id: attendance.id }, data: { joinedAt: now } })
						await goodsAudit(tx, booking.hold.workspaceId, context.actor.userId, 'booking.joined', { bookingId: id })
						await this.emit(tx, current, 'BookingJoined', key, booking.version)
					}
					return BookingJoinResultSchema.parse({ bookingId: id, joinedAt: attendance.joinedAt?.toISOString(), uri: meeting.uri, replayed: false })
				})
				const fresh = await this.current(tx, id)
				if (!['confirmed', 'attendance_pending'].includes(fresh.booking.state) || fresh.booking.version !== command.expectedVersion)
					throw new BookingHoldConflictError('Booking changed; the previous join cannot be reused.')
				const usable = await this.meetings.readInTransaction(tx, id)
				if (usable.state !== 'ready' || !usable.uri) throw new BookingHoldConflictError('Meeting is no longer ready.')
				return BookingJoinResultSchema.parse({ ...result.outcome, uri: usable.uri, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async confirm(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = BookingAttendanceConfirmCommandSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true }),
					current = await this.current(tx, id),
					{ booking, snapshot } = current
				this.authorize(context, current, true)
				const result = await this.deps.replay(tx, context, key, 'POST /v1/vendor/bookings/:bookingId/attendance/confirm', { id, command }, async () => {
					const now = this.deps.now()
					if (
						!['confirmed', 'attendance_pending'].includes(booking.state) ||
						booking.version !== command.expectedVersion ||
						now < new Date(snapshot.start) ||
						now.getTime() > new Date(snapshot.end).getTime() + 24 * hour
					)
						throw new BookingHoldConflictError('Booking changed or confirmation is outside the attendance window.')
					const attendance = await this.ensure(tx, current)
					let valid = false
					if (snapshot.mode === 'online') {
						if (command.method !== 'online' || command.proof !== undefined || !attendance.joinedAt)
							throw new BookingHoldConflictError('Online completion requires the Customer Junction join action.')
						const meeting = await this.meetings.readInTransaction(tx, id)
						valid = meeting.state === 'ready' && !!meeting.uri
					} else {
						let submitted = command.method === 'code' ? (command.proof ?? '') : ''
						if (command.method === 'qr')
							try {
								const qr = z
									.strictObject({
										bookingId: z.string().uuid(),
										bookingVersion: z.number().int().positive(),
										code: z.string().regex(/^\d{6}$/),
									})
									.parse(JSON.parse(command.proof ?? ''))
								if (qr.bookingId === id && qr.bookingVersion === booking.version) submitted = qr.code
							} catch {
								submitted = ''
							}
						valid = !!(
							attendance.proofNonce &&
							attendance.proofExpiresAt &&
							attendance.proofExpiresAt >= now &&
							attendance.proofAttempts < 5 &&
							this.codec.matches(this.codec.code(`${id}:${booking.version}:${booking.allocation.staffId}`, attendance.proofNonce), submitted)
						)
					}
					if (!valid) {
						const attempts = Math.min(5, attendance.proofAttempts + 1)
						await tx.bookingAttendance.update({ where: { id: attendance.id }, data: { proofAttempts: attempts } })
						await goodsAudit(tx, current.vendor.workspaceId, context.actor.userId, 'booking.attendance-proof-rejected', {
							bookingId: id,
							proofAttempts: attempts,
						})
						return BookingAttendanceResultSchema.parse({
							bookingId: id,
							state: 'proof_rejected',
							proofAttempts: attempts,
							completedAt: null,
							replayed: false,
						})
					}
					const contestUntil = new Date(now.getTime() + snapshot.policy.contestHours * hour)
					await tx.bookingAttendance.update({
						where: { id: attendance.id },
						data: { completedAt: now, staffActorId: context.actor.userId, contestUntil, earningAvailableAt: contestUntil },
					})
					await tx.booking.update({ where: { id }, data: { state: 'completed', version: { increment: 1 } } })
					await tx.bookingMeeting.updateMany({ where: { bookingId: id }, data: { bookingVersion: booking.version + 1 } })
					await goodsAudit(tx, current.vendor.workspaceId, context.actor.userId, 'booking.completed', {
						bookingId: id,
						earningAvailableAt: contestUntil.toISOString(),
					})
					await this.emit(tx, current, 'BookingCompleted', key, booking.version + 1)
					return BookingAttendanceResultSchema.parse({
						bookingId: id,
						state: 'completed',
						proofAttempts: attendance.proofAttempts,
						completedAt: now.toISOString(),
						replayed: false,
					})
				})
				return BookingAttendanceResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async noShow(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = BookingNoShowCommandSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true }),
					current = await this.current(tx, id),
					{ booking, snapshot } = current
				this.authorize(context, current, true)
				const result = await this.deps.replay(tx, context, key, 'POST /v1/vendor/bookings/:bookingId/no-show', { id, command }, async () => {
					const now = this.deps.now(),
						start = new Date(snapshot.start),
						end = new Date(snapshot.end),
						waited = new Date(command.waitedUntil)
					if (
						!['confirmed', 'attendance_pending'].includes(booking.state) ||
						booking.version !== command.expectedVersion ||
						now < end ||
						now.getTime() > end.getTime() + 24 * hour ||
						waited < end ||
						waited > now ||
						command.contactAttempts.some((value) => new Date(value) < start || new Date(value) > waited)
					)
						throw new BookingHoldConflictError('No-show evidence must describe this elapsed appointment and current version.')
					const attendance = await this.ensure(tx, current)
					if (attendance.joinedAt)
						throw new BookingHoldConflictError('The Customer has a Junction join action; a Customer-absent no-show cannot be recorded.')
					await tx.bookingAttendance.update({
						where: { id: attendance.id },
						data: {
							noShowReportedAt: now,
							noShowEvidence: goodsJson(command),
							staffActorId: context.actor.userId,
							contestUntil: new Date(now.getTime() + snapshot.policy.contestHours * hour),
							earningAvailableAt: null,
						},
					})
					await tx.booking.update({ where: { id }, data: { state: 'no_show_reported', version: { increment: 1 } } })
					await tx.bookingMeeting.updateMany({ where: { bookingId: id }, data: { bookingVersion: booking.version + 1 } })
					await goodsAudit(tx, current.vendor.workspaceId, context.actor.userId, 'booking.no-show-reported', { bookingId: id })
					await this.emit(tx, current, 'BookingNoShowReported', key, booking.version + 1)
					return this.view(await this.current(tx, id))
				})
				return BookingNoShowResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async contest(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		const key = IdempotencyKeySchema.parse(keyInput),
			id = z.string().uuid().parse(idInput),
			command = BookingContestCommandSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true }),
					current = await this.current(tx, id),
					{ booking } = current
				this.authorize(context, current)
				const result = await this.deps.replay(tx, context, key, 'POST /v1/customer/bookings/:bookingId/contest', { id, command }, async () => {
					const now = this.deps.now(),
						attendance = booking.attendance
					if (
						!['completed', 'no_show_reported'].includes(booking.state) ||
						booking.version !== command.expectedVersion ||
						!attendance?.contestUntil ||
						attendance.contestUntil <= now ||
						attendance.contestedAt
					)
						throw new BookingHoldConflictError('The contest window has ended or Booking changed.')
					await tx.bookingAttendance.update({
						where: { id: attendance.id },
						data: { contestedAt: now, contestReason: command.reason, earningAvailableAt: null },
					})
					await tx.booking.update({ where: { id }, data: { state: 'contested', version: { increment: 1 } } })
					await goodsAudit(tx, booking.hold.workspaceId, context.actor.userId, 'booking.contested', { bookingId: id })
					await this.emit(tx, current, 'BookingContested', key, booking.version + 1)
					return this.view(await this.current(tx, id))
				})
				return BookingNoShowResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30000 },
		)
	}
	async activate() {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const now = this.deps.now().toISOString()
				const due = await tx.booking.findMany({
					where: {
						state: 'confirmed',
						OR: [
							{ currentSnapshot: { path: ['start'], lte: now } },
							{ AND: [{ currentSnapshot: { equals: Prisma.DbNull } }, { snapshot: { path: ['start'], lte: now } }] },
						],
					},
					orderBy: { id: 'asc' },
					take: 100,
				})
				for (const booking of due) await this.current(tx, booking.id)
				return due.length
			},
			{ timeout: 30000 },
		)
	}

	async finalizeNoShows() {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const now = this.deps.now(),
					due = await tx.bookingAttendance.findMany({
						where: { booking: { state: 'no_show_reported' }, contestUntil: { lte: now }, contestedAt: null, noShowFinalAt: null },
						orderBy: { contestUntil: 'asc' },
						take: 100,
					})
				for (const attendance of due) {
					const current = await this.current(tx, attendance.bookingId)
					await tx.bookingAttendance.update({
						where: { id: attendance.id },
						data: { noShowFinalAt: now, earningAvailableAt: new Date(now.getTime() + current.snapshot.policy.contestHours * hour) },
					})
					await tx.booking.update({ where: { id: current.booking.id }, data: { state: 'no_show_final', version: { increment: 1 } } })
					await tx.bookingMeeting.updateMany({ where: { bookingId: current.booking.id }, data: { bookingVersion: current.booking.version + 1 } })
					await goodsAudit(tx, current.vendor.workspaceId, null, 'booking.no-show-final', { bookingId: current.booking.id })
					await this.emit(tx, current, 'BookingNoShowFinal', null, current.booking.version + 1)
				}
				return due.length
			},
			{ timeout: 30000 },
		)
	}
}
