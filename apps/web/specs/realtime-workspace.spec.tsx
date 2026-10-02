import { act, render, screen, waitFor } from '@testing-library/react'

import { RealtimeWorkspace } from '../src/components/realtime-workspace'

const mockHandlers = new Map<string, (input?: unknown) => void>()
const mockEmit = jest.fn()
const mockDisconnect = jest.fn()
const mockIo = jest.fn(() => ({
	disconnect: mockDisconnect,
	emit: mockEmit,
	on: (event: string, handler: (input?: unknown) => void) => mockHandlers.set(event, handler),
}))

jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }))

const workspaceId = '00000000-0000-4000-8000-000000000011'
const cursor = '00000000-0000-4000-8000-000000000022'
const event = {
	eventId: '00000000-0000-4000-8000-000000000033',
	type: 'FoundationCommandAccepted',
	schemaVersion: 1,
	cursor,
	occurredAt: '2026-10-01T00:00:00.000Z',
	scope: { workspaceId },
	payload: {},
}

describe('RealtimeWorkspace', () => {
	const originalFetch = globalThis.fetch

	beforeEach(() => {
		mockHandlers.clear()
		mockEmit.mockClear()
		mockDisconnect.mockClear()
		mockIo.mockClear()
		globalThis.fetch = jest.fn(
			async () =>
				({
					ok: true,
					json: async () => ({
						actor: { kind: 'user', userId: '00000000-0000-4000-8000-000000000044' },
						workspaceId,
						activeVendorId: null,
						locationIds: [],
						memberships: [],
						capabilities: [],
						session: {
							id: '00000000-0000-4000-8000-000000000055',
							expiresAt: '2026-10-02T00:00:00.000Z',
							mfaVerifiedAt: null,
							recentAuthAt: null,
							revokedAt: null,
						},
					}),
				}) as Response,
		) as typeof fetch
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	it('joins the authenticated workspace and replays durable events', async () => {
		const onEvent = jest.fn()
		render(<RealtimeWorkspace onEvent={onEvent} onRefetchRequired={jest.fn()} />)

		await waitFor(() => expect(mockIo).toHaveBeenCalledWith({ transports: ['websocket'], withCredentials: true }))
		act(() => mockHandlers.get('connect')?.())
		expect(mockEmit).toHaveBeenCalledWith('room.join', { room: { kind: 'workspace', workspaceId } })

		act(() =>
			mockHandlers.get('room.joined')?.({ joined: true, room: { kind: 'workspace', workspaceId }, cursor, events: [event], restRefetchRequired: false }),
		)
		expect(onEvent).toHaveBeenCalledWith(event)
		expect(mockEmit).toHaveBeenCalledWith('room.ack', { cursor })
		expect(screen.getByRole('status').textContent).toContain('Live updates connected.')
	})
})
