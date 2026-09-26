import { ConfigService } from '@nestjs/config'
import { SkipThrottle } from '@nestjs/throttler'
import { ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'
import { createAdapter } from '@socket.io/redis-adapter'
import { RealtimeJoinRequestSchema, type RealtimeJoinResult, RealtimeJoinResultSchema, type RealtimeRoom } from 'contracts'
import { createClient } from 'redis'
import type { DefaultEventsMap, Server, Socket } from 'socket.io'

import { FoundationService } from '../foundation/foundation.service'
import { getApiRuntimeConfig } from '../runtime/api-runtime.config'

const denied = (): RealtimeJoinResult => RealtimeJoinResultSchema.parse({ joined: false })
interface RealtimeSocketData {
	sessionId?: string
}
type RealtimeSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, RealtimeSocketData>

function roomKey(room: RealtimeRoom): string {
	if (room.kind === 'workspace') return `workspace:${room.workspaceId}`
	if (room.kind === 'vendor') return `vendor:${room.workspaceId}:${room.vendorId}`
	return `location:${room.workspaceId}:${room.vendorId}:${room.locationId}`
}

function sessionFrom(socket: RealtimeSocket): string | undefined {
	const auth = socket.handshake.auth as unknown
	if (typeof auth === 'object' && auth && 'sessionId' in auth && typeof (auth as Record<string, unknown>)['sessionId'] === 'string')
		return (auth as Record<string, string>)['sessionId']
	const headerSession = socket.handshake.headers['x-junction-session']
	return typeof headerSession === 'string' ? headerSession : undefined
}

function storedSessionFrom(data: unknown): string | undefined {
	return typeof data === 'object' && data && 'sessionId' in data && typeof data.sessionId === 'string' ? data.sessionId : undefined
}

@WebSocketGateway({ transports: ['websocket'] })
export class RealtimeGateway implements OnGatewayInit {
	private crossProcessFanout = false
	private fanoutReady: Promise<void> = Promise.resolve()
	private server: Server | undefined

	constructor(
		private readonly configService: ConfigService,
		private readonly foundation: FoundationService,
	) {}

	afterInit(server: Server): void {
		this.server = server
		server.use((socket, next) => void this.authorize(socket as RealtimeSocket, next))
		server.on('realtime.session-revoked', (sessionId: unknown) => {
			if (typeof sessionId === 'string') void this.disconnectSessionSockets(sessionId)
		})
		const config = getApiRuntimeConfig(this.configService)
		if (config.realtimeRedisFanout && config.redisUrl) {
			this.crossProcessFanout = true
			this.fanoutReady = this.configureRedisFanout(server, config.redisUrl)
			void this.fanoutReady.catch(() => undefined)
		}
	}

	async ready(): Promise<void> {
		if (process.env['JUNCTION_RUNTIME_MODE'] === 'staging' && !this.crossProcessFanout) {
			throw new Error('Staging realtime Redis fanout is not initialized.')
		}
		await this.fanoutReady
	}

	async revokeSession(sessionId: string | undefined): Promise<void> {
		if (!sessionId || !this.server) return
		await this.disconnectSessionSockets(sessionId)
		if (!this.crossProcessFanout) return
		await this.fanoutReady
		this.server.serverSideEmit('realtime.session-revoked', sessionId)
	}

	async publishFoundationCommand(sessionId: string | undefined, commandId: string, replayed: boolean): Promise<void> {
		if (replayed || !this.server) return
		await this.fanoutReady
		const context = await this.foundation.accessContext(sessionId)
		const event = await this.foundation.realtimeFoundationEventForCommand(sessionId, commandId)
		if (!event || event.scope.workspaceId !== context.workspaceId) return
		const candidates = await this.server.in(roomKey({ kind: 'workspace', workspaceId: context.workspaceId })).fetchSockets()
		await Promise.all(
			candidates.map(async (candidate) => {
				try {
					const current = await this.foundation.accessContext(storedSessionFrom(candidate.data))
					if (current.workspaceId !== context.workspaceId) return candidate.leave(roomKey({ kind: 'workspace', workspaceId: context.workspaceId }))
					candidate.emit('realtime.event', event)
				} catch {
					return candidate.leave(roomKey({ kind: 'workspace', workspaceId: context.workspaceId }))
				}
			}),
		)
	}

	@SubscribeMessage('room.join')
	@SkipThrottle()
	async join(@ConnectedSocket() socket: RealtimeSocket, @MessageBody() input: unknown): Promise<void> {
		const request = RealtimeJoinRequestSchema.safeParse(input)
		const sessionId = socket.data['sessionId']
		if (!request.success || typeof sessionId !== 'string') return this.respond(socket, denied())
		try {
			const context = await this.foundation.accessContext(sessionId)
			if (!this.allowed(context, request.data.room)) return this.respond(socket, denied())
			const replay = await this.foundation.realtimeReplay(sessionId, request.data.cursor)
			await socket.join(roomKey(request.data.room))
			this.respond(
				socket,
				RealtimeJoinResultSchema.parse({
					joined: true,
					room: request.data.room,
					cursor: replay.cursor,
					events: replay.events,
					restRefetchRequired: replay.restRefetchRequired,
				}),
			)
		} catch {
			this.leaveScopedRooms(socket)
			this.respond(socket, denied())
		}
	}

	private allowed(context: Awaited<ReturnType<FoundationService['accessContext']>>, room: RealtimeRoom): boolean {
		if (room.workspaceId !== context.workspaceId) return false
		if (room.kind === 'workspace') return true
		if (room.vendorId !== context.activeVendorId) return false
		return room.kind === 'vendor' || context.locationIds.includes(room.locationId)
	}

	private async authorize(socket: RealtimeSocket, next: (error?: Error) => void): Promise<void> {
		try {
			const sessionId =
				process.env['JUNCTION_RUNTIME_MODE'] === 'staging'
					? await this.foundation.authenticateFromCookie(socket.handshake.headers.cookie)
					: this.foundation.resolveSessionId(sessionFrom(socket), socket.handshake.headers.cookie)
			await this.fanoutReady
			await this.foundation.accessContext(sessionId)
			socket.data.sessionId = sessionId
			next()
		} catch {
			next(new Error('ACCESS_DENIED'))
		}
	}

	private leaveScopedRooms(socket: RealtimeSocket): void {
		for (const room of socket.rooms) if (room !== socket.id) void socket.leave(room)
	}

	private async disconnectSessionSockets(sessionId: string): Promise<void> {
		if (!this.server) return
		const candidates = await this.server.fetchSockets()
		for (const candidate of candidates) if (storedSessionFrom(candidate.data) === sessionId) candidate.disconnect(true)
	}

	private respond(socket: RealtimeSocket, result: RealtimeJoinResult): void {
		socket.emit('room.joined', result)
	}

	private async configureRedisFanout(server: Server, redisUrl: string): Promise<void> {
		const publisher = createClient({ url: redisUrl })
		const subscriber = publisher.duplicate()
		try {
			await Promise.all([publisher.connect(), subscriber.connect()])
			server.adapter(createAdapter(publisher, subscriber))
		} catch (error) {
			await Promise.all([publisher.disconnect().catch(() => undefined), subscriber.disconnect().catch(() => undefined)])
			throw error
		}
	}
}
