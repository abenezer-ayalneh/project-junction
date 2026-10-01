'use client'

import { AccessContextSchema, type RealtimeFoundationEvent, RealtimeFoundationEventSchema, RealtimeJoinResultSchema } from 'contracts'
import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'

const apiBase = '/v1'

type ConnectionState = 'connecting' | 'connected' | 'unavailable'

export function RealtimeWorkspace({ onEvent, onRefetchRequired }: { onEvent: (event: RealtimeFoundationEvent) => void; onRefetchRequired: () => void }) {
	const onEventRef = useRef(onEvent)
	const onRefetchRequiredRef = useRef(onRefetchRequired)
	const [state, setState] = useState<ConnectionState>('connecting')

	useEffect(() => {
		onEventRef.current = onEvent
	}, [onEvent])

	useEffect(() => {
		onRefetchRequiredRef.current = onRefetchRequired
	}, [onRefetchRequired])

	useEffect(() => {
		let cancelled = false
		let socket: ReturnType<typeof io> | undefined

		async function connect() {
			try {
				const response = await fetch(`${apiBase}/access-context`, { cache: 'no-store' })
				if (!response.ok) throw new Error('Access context is unavailable.')
				const context = AccessContextSchema.parse(await response.json())
				if (cancelled) return
				const cursorKey = `junction:realtime-cursor:${context.workspaceId}`
				socket = io({ transports: ['websocket'], withCredentials: true })
				socket.on('connect_error', () => {
					if (!cancelled) setState('unavailable')
				})
				socket.on('room.joined', (input: unknown) => {
					const result = RealtimeJoinResultSchema.safeParse(input)
					if (!result.success || !result.data.joined) {
						if (!cancelled) setState('unavailable')
						return
					}
					if (result.data.cursor) sessionStorage.setItem(cursorKey, result.data.cursor)
					if (!cancelled) setState('connected')
					for (const event of result.data.events) onEventRef.current(event)
					if (result.data.restRefetchRequired) onRefetchRequiredRef.current()
				})
				socket.on('realtime.event', (input: unknown) => {
					const event = RealtimeFoundationEventSchema.safeParse(input)
					if (!event.success) return
					sessionStorage.setItem(cursorKey, event.data.cursor)
					onEventRef.current(event.data)
				})
				socket.on('connect', () => {
					socket?.emit('room.join', {
						room: { kind: 'workspace', workspaceId: context.workspaceId },
						cursor: sessionStorage.getItem(cursorKey) ?? undefined,
					})
				})
			} catch {
				if (!cancelled) setState('unavailable')
			}
		}

		void connect()
		return () => {
			cancelled = true
			socket?.disconnect()
		}
	}, [])

	return (
		<p className="mt-2 text-xs text-muted-foreground" role="status">
			{state === 'connecting'
				? 'Connecting live updates…'
				: state === 'connected'
					? 'Live updates connected.'
					: 'Live updates are unavailable. Refresh to retry.'}
		</p>
	)
}
