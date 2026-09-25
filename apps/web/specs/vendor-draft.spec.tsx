import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import VendorWorkspace from '../src/app/vendor-workspace/page'

const catalog = {
	id: '00000000-0000-4000-8000-000000000011',
	applicationState: 'approved',
	slug: 'fixture-vendor',
	displayName: 'Fixture Vendor',
	description: 'A fixture Vendor for private draft recovery.',
	locations: [],
	listings: [],
}

it('keeps an unsent private draft through reload and reuses the retry key after an ambiguous failure', async () => {
	sessionStorage.clear()
	const createKeys: string[] = []
	let createAttempts = 0
	const originalFetch = globalThis.fetch
	const originalCrypto = globalThis.crypto
	Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { ...originalCrypto, randomUUID: () => 'retry-key' } })
	globalThis.fetch = jest.fn(async (input: unknown, init?: { headers?: Record<string, string> }) => {
		if (String(input).endsWith('/vendor/catalog')) return { ok: true, json: async () => catalog } as Response
		if (String(input).endsWith('/listings')) {
			createKeys.push(new Headers(init?.headers).get('idempotency-key') ?? '')
			createAttempts++
			if (createAttempts === 1) throw new TypeError('Failed to fetch')
			return { ok: true, json: async () => ({ id: '00000000-0000-4000-8000-000000000022' }) } as Response
		}
		throw new Error(`Unexpected request: ${input}`)
	}) as typeof fetch
	try {
		const first = render(<VendorWorkspace />)
		fireEvent.change(screen.getByLabelText('Synthetic session ID'), { target: { value: 'private-session' } })
		fireEvent.click(screen.getByRole('button', { name: 'Load workspace' }))
		await screen.findByRole('heading', { name: 'Create a private draft' })
		const draftSection = screen.getByRole('heading', { name: 'Create a private draft' }).closest('section')
		if (!draftSection) throw new Error('Private draft section was not rendered.')
		fireEvent.input(within(draftSection).getByLabelText('Title'), { target: { value: 'Saved basket' } })
		fireEvent.input(within(draftSection).getByLabelText('Description'), { target: { value: 'A handwoven basket saved before a network failure.' } })
		fireEvent.input(within(draftSection).getByLabelText('Price (ETB)'), { target: { value: '125' } })
		first.unmount()

		render(<VendorWorkspace />)
		fireEvent.change(screen.getByLabelText('Synthetic session ID'), { target: { value: 'private-session' } })
		fireEvent.click(screen.getByRole('button', { name: 'Load workspace' }))
		await screen.findByRole('heading', { name: 'Create a private draft' })
		await waitFor(() => expect((screen.getByLabelText('Title') as unknown as { value: string }).value).toBe('Saved basket'))
		fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
		await screen.findByText('Failed to fetch')
		fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
		await screen.findByText('Private listing draft created. Submit it when ready for review.')
		expect(createKeys).toEqual(['retry-key', 'retry-key'])
		expect(sessionStorage.getItem(`junction:vendor-draft:${catalog.id}`)).toBeNull()
	} finally {
		globalThis.fetch = originalFetch
		Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto })
		sessionStorage.clear()
	}
})
