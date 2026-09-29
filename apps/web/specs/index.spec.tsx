import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import Page from '../src/app/page'
import { ThemeProvider } from '../src/components/theme-provider'
import { ThemeToggle } from '../src/components/theme-toggle'

jest.mock('../src/lib/marketplace', () => ({
	getPublicListings: async () => ({ items: [], nextCursor: null }),
	getPublicVendors: async () => ({ items: [], nextCursor: null }),
	formatPrice: () => 'ETB 0',
}))

type MatchMediaListener = (event: { matches: boolean }) => void

let systemIsDark = false
let systemThemeListeners = new Set<MatchMediaListener>()

function updateSystemTheme(matches: boolean) {
	systemIsDark = matches
	systemThemeListeners.forEach((listener) => listener({ matches }))
}

describe('Page', () => {
	it('identifies the private staging environment', async () => {
		render(await Page({ searchParams: Promise.resolve({}) }))

		expect(screen.getByText('Private staging')).toBeTruthy()
		expect(screen.getByRole('heading', { name: /find the good work happening nearby/i })).toBeTruthy()
	})

	it('preserves the discovery accessibility baseline', async () => {
		render(await Page({ searchParams: Promise.resolve({}) }))

		expect(screen.getByRole('main')).toBeTruthy()
		expect(screen.getByRole('banner')).toBeTruthy()
		const skipLink = screen.getByRole('link', { name: /skip to discovery/i })
		expect(skipLink.getAttribute('href')).toBe('#discover')
		skipLink.focus()
		expect(globalThis.document.activeElement).toBe(skipLink)
		expect(screen.getByRole('button', { name: /choose color theme/i })).toBeTruthy()
	})
})

describe('ThemeToggle', () => {
	beforeEach(() => {
		systemIsDark = false
		systemThemeListeners = new Set()
		Object.defineProperty(globalThis, 'matchMedia', {
			configurable: true,
			value: () => ({
				addEventListener: (_event: string, listener: MatchMediaListener | null) => {
					if (listener) {
						systemThemeListeners.add(listener)
					}
				},
				addListener: (listener: MatchMediaListener) => systemThemeListeners.add(listener),
				dispatchEvent: () => false,
				get matches() {
					return systemIsDark
				},
				media: '(prefers-color-scheme: dark)',
				onchange: null,
				removeEventListener: (_event: string, listener: MatchMediaListener | null) => {
					if (listener) {
						systemThemeListeners.delete(listener)
					}
				},
				removeListener: (listener: MatchMediaListener) => systemThemeListeners.delete(listener),
			}),
		})
	})

	it('persists a choice and can return to the system setting', async () => {
		globalThis.localStorage.clear()
		const view = render(
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="junction-theme">
				<ThemeToggle />
			</ThemeProvider>,
		)

		fireEvent.click(screen.getByRole('button', { name: /choose color theme/i }))
		fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))

		await waitFor(() => expect(globalThis.localStorage.getItem('junction-theme')).toBe('dark'))
		expect(globalThis.document.documentElement.classList.contains('dark')).toBe(true)

		view.unmount()
		render(
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="junction-theme">
				<ThemeToggle />
			</ThemeProvider>,
		)

		fireEvent.click(screen.getByRole('button', { name: /choose color theme/i }))
		expect(screen.getByRole('menuitemradio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true')
		fireEvent.click(screen.getByRole('menuitemradio', { name: 'System' }))

		await waitFor(() => expect(globalThis.localStorage.getItem('junction-theme')).toBe('system'))
		act(() => {
			updateSystemTheme(true)
		})
		await waitFor(() => expect(globalThis.document.documentElement.classList.contains('dark')).toBe(true))
		act(() => {
			updateSystemTheme(false)
		})
		await waitFor(() => expect(globalThis.document.documentElement.classList.contains('dark')).toBe(false))
	})
})
