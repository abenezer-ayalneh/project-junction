import { randomUUID } from 'node:crypto'

import {
	type AccessContext,
	BookingMeetingReadSchema,
	BookingMeetingReplacementCommandSchema,
	BookingMeetingResultSchema,
	BookingSnapshotSchema,
	IdempotencyKeySchema,
	StaffMeetConnectionCommandSchema,
	StaffMeetConnectionResultSchema,
} from 'contracts'
import { z } from 'zod'

import { Prisma } from '../../generated/prisma/index.js'
import { AccessDeniedError, assertRequiredMfa, assertScope } from './access.js'
import { BookingHoldConflictError } from './booking-holds.js'
import type { Bookings } from './bookings.js'
import { goodsAudit, type GoodsDependencies, goodsEmit } from './goods-support.js'
import { LocalMeetingProvider, type MeetingProviderAdapter, type MeetingProviderRequest, type MeetingProviderResult } from './meeting-provider.js'
import { applicationRuntimeMode } from './runtime.js'
type Tx = Prisma.TransactionClient
const cutoffMinutes = z.coerce
		.number()
		.int()
		.min(1)
		.max(120)
		.parse(process.env['BOOKING_MEETING_SAFETY_MINUTES'] ?? 15),
	retryMilliseconds = 60_000,
	leaseMilliseconds = 30_000
export class BookingMeetings {
	private readonly provider: MeetingProviderAdapter
	constructor(
		private readonly deps: GoodsDependencies,
		private readonly bookings: Bookings,
		provider?: MeetingProviderAdapter,
	) {
		this.provider = provider ?? new LocalMeetingProvider()
	}
	private local() {
		if (applicationRuntimeMode() !== 'local') throw new AccessDeniedError('Controlled meeting configuration is local only.')
	}
	private async lock(tx: Tx) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('junction:goods-checkout', 0))`
	}
	private async current(tx: Tx, bookingId: string) {
		const booking = await tx.booking.findUnique({
			where: { id: bookingId },
			include: { hold: true, allocation: { include: { staff: { include: { meetConnection: true, membership: true } } } }, meeting: true },
		})
		if (!booking) throw new AccessDeniedError()
		return {
			booking,
			snapshot: BookingSnapshotSchema.parse(booking.currentSnapshot ?? booking.snapshot),
			connection: booking.allocation.staff.meetConnection,
		}
	}
	private async authorize(tx: Tx, context: AccessContext, bookingId: string, vendorActor = false, ownerOnly = false) {
		const current = await this.current(tx, bookingId),
			{ booking, snapshot } = current
		const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
		if (vendorActor) {
			assertScope(context, { workspaceId: vendor.workspaceId, vendorId: vendor.id, ...(snapshot.locationId ? { locationId: snapshot.locationId } : {}) })
			const owner = context.memberships.some((m) => m.active && m.vendorId === vendor.id && m.role === 'vendor_owner')
			if (ownerOnly ? !owner : !owner && booking.allocation.staff.userId !== context.actor.userId) throw new AccessDeniedError()
		} else if (booking.hold.customerId !== context.actor.userId || booking.hold.workspaceId !== context.workspaceId) throw new AccessDeniedError()
		if (snapshot.mode !== 'online') throw new AccessDeniedError('This Booking is not online.')
		return { ...current, vendor }
	}
	private view(current: Awaited<ReturnType<BookingMeetings['current']>>) {
		const { booking, snapshot, connection } = current,
			meeting = booking.meeting
		const terminal = booking.state === 'cancelled' || snapshot.mode !== 'online'
		const ready =
			!terminal &&
			meeting?.state === 'ready' &&
			meeting.bookingVersion === booking.version &&
			meeting.staffId === booking.allocation.staffId &&
			(meeting.manualReplacement ||
				meeting.provider === 'demo_meet' ||
				(connection?.active &&
					booking.allocation.staff.membership?.revokedAt === null &&
					booking.allocation.staff.membership.userId === booking.allocation.staff.userId &&
					connection.version === meeting.connectionVersion &&
					connection.privateReference === meeting.connectionReference))
		return BookingMeetingReadSchema.parse({
			bookingId: booking.id,
			meetingId: meeting?.id ?? null,
			state: terminal ? 'booking_cancelled' : meeting?.state === 'ready' && !ready ? 'pending' : (meeting?.state ?? 'pending'),
			provider: meeting?.provider ?? null,
			bookingVersion: booking.version,
			attempts: meeting?.attempts ?? 0,
			retryAt: meeting?.retryAt?.toISOString() ?? null,
			safetyCutoffAt: (meeting?.safetyCutoffAt ?? new Date(new Date(snapshot.start).getTime() - cutoffMinutes * 60_000)).toISOString(),
			uri: ready ? (meeting?.uri ?? null) : null,
			lastError: meeting?.lastError ?? null,
			manualReplacement: meeting?.manualReplacement ?? false,
		})
	}
	readInTransaction(tx: Tx, id: string) {
		return this.current(tx, id).then((current) => this.view(current))
	}

	async read(sessionId: string | undefined, idInput: string, vendor = false) {
		const bookingId = z.string().uuid().parse(idInput)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
			return this.view(await this.authorize(tx, context, bookingId, vendor))
		})
	}
	async connection(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		this.local()
		const key = IdempotencyKeySchema.parse(keyInput),
			staffId = z.string().uuid().parse(idInput),
			command = StaffMeetConnectionCommandSchema.parse(input)
		return this.deps.db.$transaction(async (tx) => {
			const context = await this.deps.derive(tx, sessionId)
			if (!context.activeVendorId) throw new AccessDeniedError()
			const staff = await tx.staff.findFirst({ where: { id: staffId, vendorId: context.activeVendorId ?? '', userId: context.actor.userId } })
			if (!staff) throw new AccessDeniedError('Only the linked Staff account can manage its meeting connection.')
			const result = await this.deps.replay(tx, context, key, 'PUT /v1/vendor/staff/:staffId/local-meet-connection', { staffId, command }, async () => {
				const existing = await tx.staffMeetConnection.findUnique({ where: { staffId } })
				if ((existing?.version ?? 0) !== command.expectedVersion) throw new BookingHoldConflictError('Connection changed.')
				const connection = await tx.staffMeetConnection.upsert({
					where: { staffId },
					create: { staffId, privateReference: `local-staff-connection:${randomUUID()}`, active: command.connected },
					update: {
						active: command.connected,
						version: { increment: 1 },
						...(command.connected ? { privateReference: `local-staff-connection:${randomUUID()}` } : {}),
					},
				})
				await goodsAudit(tx, context.workspaceId, context.actor.userId, 'booking.staff-meeting-connection', {
					staffId,
					connected: command.connected,
					version: connection.version,
				})
				return StaffMeetConnectionResultSchema.parse({
					staffId,
					connected: connection.active,
					version: connection.version,
					provider: 'controlled_google_meet',
					replayed: false,
				})
			})
			return StaffMeetConnectionResultSchema.parse({ ...result.outcome, replayed: result.replayed })
		})
	}
	private async claim() {
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const now = this.deps.now()
				const unseeded = await tx.booking.findMany({
					where: {
						state: { in: ['confirmed', 'attendance_pending'] },
						meeting: { is: null },
						OR: [
							{ currentSnapshot: { path: ['mode'], equals: 'online' } },
							{ AND: [{ currentSnapshot: { equals: Prisma.DbNull } }, { snapshot: { path: ['mode'], equals: 'online' } }] },
						],
					},
					include: { allocation: { include: { staff: { include: { meetConnection: true, membership: true } } } } },
					orderBy: { id: 'asc' },
					take: 100,
				})
				for (const booking of unseeded) {
					const snapshot = BookingSnapshotSchema.parse(booking.currentSnapshot ?? booking.snapshot),
						connection = booking.allocation.staff.meetConnection
					await tx.bookingMeeting.create({
						data: {
							bookingId: booking.id,
							staffId: booking.allocation.staffId,
							bookingVersion: booking.version,
							operationKey: `meeting:${booking.id}:${booking.version}:${connection?.version ?? 0}`,
							provider: connection ? 'controlled_google_meet' : 'demo_meet',
							connectionReference: connection?.active ? connection.privateReference : null,
							connectionVersion: connection?.version ?? null,
							safetyCutoffAt: new Date(new Date(snapshot.start).getTime() - cutoffMinutes * 60_000),
							createdAt: now,
							updatedAt: now,
						},
					})
				}
				const records = await tx.bookingMeeting.findMany({
					where: {
						OR: [
							{ state: { not: 'booking_cancelled' } },
							{ booking: { state: { in: ['confirmed', 'attendance_pending'] }, currentSnapshot: { path: ['mode'], equals: 'online' } } },
						],
					},
					orderBy: { updatedAt: 'asc' },
					take: 100,
				})
				for (let record of records) {
					const current = await this.current(tx, record.bookingId),
						{ booking, snapshot, connection } = current
					const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
					await this.deps.lockWorkspace(tx, vendor.workspaceId)
					if (booking.state === 'cancelled' || snapshot.mode !== 'online') {
						await tx.bookingMeeting.update({
							where: { id: record.id },
							data: { state: 'booking_cancelled', uri: null, providerReference: null, leaseUntil: null, updatedAt: now },
						})
						continue
					}
					const changed =
						(record.state === 'ready' &&
							!record.manualReplacement &&
							record.provider === 'controlled_google_meet' &&
							(booking.allocation.staff.membership?.revokedAt !== null ||
								booking.allocation.staff.membership.userId !== booking.allocation.staff.userId)) ||
						record.bookingVersion !== booking.version ||
						record.staffId !== booking.allocation.staffId ||
						(!record.manualReplacement &&
							record.provider === 'controlled_google_meet' &&
							(record.connectionVersion !== (connection?.version ?? null) ||
								record.connectionReference !== (connection?.active ? connection.privateReference : null)))
					if (changed) {
						record = await tx.bookingMeeting.update({
							where: { id: record.id },
							data: {
								bookingVersion: booking.version,
								staffId: booking.allocation.staffId,
								operationKey: `meeting:${booking.id}:${booking.version}:${connection?.version ?? 0}`,
								connectionReference: connection?.active ? connection.privateReference : null,
								connectionVersion: connection?.version ?? null,
								state: 'pending',
								attempts: 0,
								retryAt: null,
								leaseUntil: null,
								uri: null,
								providerReference: null,
								lastError: null,
								manualReplacement: false,
								safetyCutoffAt: new Date(new Date(snapshot.start).getTime() - cutoffMinutes * 60_000),
								updatedAt: now,
							},
						})
					}
					if (!['confirmed', 'attendance_pending'].includes(booking.state)) {
						await tx.bookingMeeting.update({ where: { id: record.id }, data: { updatedAt: now } })
						continue
					}
					if (record.state === 'ready') {
						await tx.bookingMeeting.update({ where: { id: record.id }, data: { updatedAt: now } })
						continue
					}
					if (record.safetyCutoffAt <= now) {
						await this.bookings.cancelInTransaction(tx, booking.id, null, true, 'Online meeting unavailable by safety cutoff', null)
						await tx.bookingMeeting.update({
							where: { id: record.id },
							data: { state: 'booking_cancelled', uri: null, providerReference: null, leaseUntil: null, updatedAt: now },
						})
						await goodsEmit(
							tx,
							() => this.deps.now(),
							booking.hold.workspaceId,
							'BookingMeetingCompensated',
							record.id,
							booking.version + 1,
							null,
							{ bookingId: booking.id, meetingId: record.id },
						)
						continue
					}
					if (record.state === 'provisioning' && record.leaseUntil && record.leaseUntil > now) continue
					if (record.retryAt && record.retryAt > now) continue
					if (record.attempts >= 3) {
						await tx.bookingMeeting.update({ where: { id: record.id }, data: { state: 'replacement_required', updatedAt: now } })
						continue
					}
					record = await tx.bookingMeeting.update({
						where: { id: record.id },
						data: {
							state: 'provisioning',
							attempts: { increment: 1 },
							leaseUntil: new Date(now.getTime() + leaseMilliseconds),
							retryAt: null,
							updatedAt: now,
						},
					})
					const request: MeetingProviderRequest = {
						operationKey: record.operationKey,
						bookingId: booking.id,
						staffId: record.staffId,
						provider: record.provider as MeetingProviderRequest['provider'],
						connectionReference: record.connectionReference,
					}
					return {
						id: record.id,
						attempt: record.attempts,
						bookingVersion: booking.version,
						request,
						connectionEligible:
							record.provider === 'demo_meet' ||
							!!(
								connection?.active &&
								booking.allocation.staff.userId &&
								booking.allocation.staff.membership?.revokedAt === null &&
								booking.allocation.staff.membership.userId === booking.allocation.staff.userId
							),
					}
				}
				return null
			},
			{ timeout: 30_000 },
		)
	}
	private valid(request: MeetingProviderRequest, result: MeetingProviderResult) {
		return (
			result &&
			result.operationKey === request.operationKey &&
			result.bookingId === request.bookingId &&
			result.staffId === request.staffId &&
			result.provider === request.provider &&
			result.connectionReference === request.connectionReference &&
			typeof result.providerReference === 'string' &&
			result.providerReference.length > 0 &&
			result.providerReference.length <= 500 &&
			(request.provider === 'demo_meet'
				? typeof result.uri === 'string' &&
					result.uri.startsWith(`/demo-meet/bookings/${request.bookingId}?operation=`) &&
					/^\/[a-z0-9/-]+\?operation=[a-f0-9]+$/.test(result.uri)
				: /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(result.uri))
		)
	}
	async reconcile() {
		let processed = 0
		for (let count = 0; count < 20; count++) {
			const claim = await this.claim()
			if (!claim) break
			let result: MeetingProviderResult | undefined,
				error: 'timeout' | 'provider_failure' | 'invalid_response' | 'connection_unavailable' | null = null
			let timer: ReturnType<typeof setTimeout> | undefined
			try {
				if (!claim.connectionEligible) error = 'connection_unavailable'
				else {
					const timeout = new Promise<never>((_, reject) => {
						timer = setTimeout(() => reject(new Error('meeting-timeout')), 1000)
					})
					result = await Promise.race([this.provider.provision(claim.request), timeout])
					if (!this.valid(claim.request, result)) {
						result = undefined
						error = 'invalid_response'
					}
				}
			} catch (failure) {
				error = failure instanceof Error && failure.message === 'meeting-timeout' ? 'timeout' : 'provider_failure'
			} finally {
				if (timer) clearTimeout(timer)
			}
			await this.deps.db.$transaction(
				async (tx) => {
					await this.lock(tx)
					const current = await this.current(tx, claim.request.bookingId),
						{ booking, connection } = current,
						meeting = booking.meeting
					if (
						!meeting ||
						meeting.state !== 'provisioning' ||
						meeting.operationKey !== claim.request.operationKey ||
						meeting.attempts !== claim.attempt
					)
						return
					const vendor = await tx.vendor.findUniqueOrThrow({ where: { id: booking.hold.vendorId } })
					await this.deps.lockWorkspace(tx, vendor.workspaceId)
					if (
						!['confirmed', 'attendance_pending'].includes(booking.state) ||
						booking.version !== claim.bookingVersion ||
						booking.allocation.staffId !== claim.request.staffId ||
						(!meeting.manualReplacement &&
							meeting.provider === 'controlled_google_meet' &&
							((connection?.version ?? null) !== meeting.connectionVersion ||
								(connection?.active ? connection.privateReference : null) !== claim.request.connectionReference ||
								(claim.connectionEligible &&
									(!connection?.active ||
										booking.allocation.staff.membership?.revokedAt !== null ||
										booking.allocation.staff.membership.userId !== booking.allocation.staff.userId))))
					) {
						await tx.bookingMeeting.update({
							where: { id: meeting.id },
							data: {
								state: booking.state === 'cancelled' ? 'booking_cancelled' : 'pending',
								uri: null,
								providerReference: null,
								leaseUntil: null,
								updatedAt: this.deps.now(),
							},
						})
						return
					}
					if (this.deps.now() >= meeting.safetyCutoffAt) {
						await this.bookings.cancelInTransaction(tx, booking.id, null, true, 'Online meeting unavailable by safety cutoff', null)
						await tx.bookingMeeting.update({
							where: { id: meeting.id },
							data: { state: 'booking_cancelled', uri: null, providerReference: null, leaseUntil: null, updatedAt: this.deps.now() },
						})
						return
					}
					await tx.bookingMeeting.update({
						where: { id: meeting.id },
						data: result
							? {
									state: 'ready',
									uri: result.uri,
									providerReference: result.providerReference,
									lastError: null,
									leaseUntil: null,
									retryAt: null,
									updatedAt: this.deps.now(),
								}
							: {
									state: meeting.attempts >= 3 ? 'replacement_required' : 'retry_scheduled',
									lastError: error,
									leaseUntil: null,
									retryAt: new Date(this.deps.now().getTime() + retryMilliseconds),
									updatedAt: this.deps.now(),
								},
					})
					await goodsAudit(tx, booking.hold.workspaceId, null, result ? 'booking.meeting-ready' : 'booking.meeting-retry', {
						bookingId: booking.id,
						meetingId: meeting.id,
						attempt: meeting.attempts,
						error,
					})
					if (result)
						for (const workspaceId of new Set([booking.hold.workspaceId, vendor.workspaceId]))
							await goodsEmit(tx, () => this.deps.now(), workspaceId, 'BookingMeetingReady', meeting.id, meeting.attempts, null, {
								bookingId: booking.id,
								meetingId: meeting.id,
							})
				},
				{ timeout: 30_000 },
			)
			processed++
		}
		return processed
	}
	async replacement(sessionId: string | undefined, keyInput: string | undefined, idInput: string, input: unknown) {
		this.local()
		const key = IdempotencyKeySchema.parse(keyInput),
			bookingId = z.string().uuid().parse(idInput),
			command = BookingMeetingReplacementCommandSchema.parse(input)
		return this.deps.db.$transaction(
			async (tx) => {
				await this.lock(tx)
				const context = await this.deps.derive(tx, sessionId, { allowRestrictedVendor: true })
				const current = await this.authorize(tx, context, bookingId, true, true)
				assertRequiredMfa(context, this.deps.now())
				await this.deps.lockWorkspace(tx, current.vendor.workspaceId)
				const result = await this.deps.replay(
					tx,
					context,
					key,
					'POST /v1/vendor/bookings/:bookingId/meeting/replacement',
					{ bookingId, command },
					async () => {
						const meeting = current.booking.meeting
						if (
							!meeting ||
							!['confirmed', 'attendance_pending'].includes(current.booking.state) ||
							current.booking.version !== command.expectedVersion ||
							this.deps.now() >= meeting.safetyCutoffAt
						)
							throw new BookingHoldConflictError('Meeting replacement is no longer available.')
						await tx.bookingMeeting.update({
							where: { id: meeting.id },
							data: {
								state: 'ready',
								provider: 'demo_meet',
								uri: `/demo-meet/bookings/${bookingId}?operation=${meeting.id.replaceAll('-', '')}`,
								providerReference: `local-protected-replacement:${meeting.id}`,
								manualReplacement: true,
								leaseUntil: null,
								retryAt: null,
								lastError: null,
								bookingVersion: current.booking.version,
								staffId: current.booking.allocation.staffId,
								updatedAt: this.deps.now(),
							},
						})
						await goodsAudit(tx, context.workspaceId, context.actor.userId, 'booking.meeting-replaced', {
							bookingId,
							meetingId: meeting.id,
							reason: command.reason,
						})
						await goodsEmit(
							tx,
							() => this.deps.now(),
							current.booking.hold.workspaceId,
							'BookingMeetingReady',
							meeting.id,
							Math.max(1, meeting.attempts),
							key,
							{ bookingId, meetingId: meeting.id },
						)
						return this.view(await this.current(tx, bookingId))
					},
				)
				return BookingMeetingResultSchema.parse({ ...result.outcome, replayed: result.replayed })
			},
			{ timeout: 30_000 },
		)
	}
}
