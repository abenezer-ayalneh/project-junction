import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CatalogFilters } from '../src/components/catalog-filters'
import { ListingMedia } from '../src/components/listing-media'
import { ListingSaveButton, SavedListingsProvider } from '../src/components/listing-save-button'

const originalDialogClose = globalThis.HTMLDialogElement.prototype.close
beforeAll(() => {
	globalThis.HTMLDialogElement.prototype.close = function () {
		this.open = false
		this.dispatchEvent(new Event('close'))
	}
})
afterAll(() => {
	globalThis.HTMLDialogElement.prototype.close = originalDialogClose
})
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/search' }))

it('keeps search, filters, and sort while applying changed criteria', () => {
	render(
		<CatalogFilters
			values={{ q: 'coffee', kind: 'product', category: 'goods', vendor: '', minPriceCents: '', maxPriceCents: '', sort: 'price_desc' }}
			vendors={[]}>
			<p>Results</p>
		</CatalogFilters>,
	)
	const form = screen.getByRole('complementary').querySelector('form')
	if (!form) throw new Error('Filter form missing')
	fireEvent.change(within(form).getByLabelText('Category'), { target: { value: 'home' } })
	fireEvent.submit(form)
	const query = new URL(push.mock.calls.at(-1)[0], 'http://localhost').searchParams
	expect(Object.fromEntries(query)).toMatchObject({ q: 'coffee', kind: 'product', category: 'home', sort: 'price_desc' })
	expect(query.has('cursor')).toBe(false)
})

it('updates desktop and mobile form values after filter removal and back navigation', () => {
	const initial = { q: 'coffee', kind: 'product', category: 'home', vendor: '', minPriceCents: '70000', maxPriceCents: '', sort: 'price_desc' }
	const view = render(
		<CatalogFilters values={initial} vendors={[]}>
			Results
		</CatalogFilters>,
	)
	const desktopCategory = within(screen.getByRole('complementary')).getByLabelText('Category')
	fireEvent.change(desktopCategory, { target: { value: 'goods' } })
	view.rerender(
		<CatalogFilters values={{ ...initial, category: '', minPriceCents: '' }} vendors={[]}>
			Results
		</CatalogFilters>,
	)
	for (const form of view.container.querySelectorAll('form')) {
		expect((within(form).getByLabelText('Category') as globalThis.HTMLSelectElement).value).toBe('')
		expect((within(form).getByLabelText('Min price (ETB)') as globalThis.HTMLInputElement).value).toBe('')
	}
	view.rerender(
		<CatalogFilters values={initial} vendors={[]}>
			Results
		</CatalogFilters>,
	)
	for (const form of view.container.querySelectorAll('form')) {
		expect((within(form).getByLabelText('Category') as globalThis.HTMLSelectElement).value).toBe('home')
		expect((within(form).getByLabelText('Min price (ETB)') as globalThis.HTMLInputElement).value).toBe('700')
	}
})

it('opens the named gallery, supports arrow navigation and returns focus on close', () => {
	const originalShow = globalThis.HTMLDialogElement.prototype.showModal
	const originalClose = globalThis.HTMLDialogElement.prototype.close
	globalThis.HTMLDialogElement.prototype.showModal = function () {
		this.open = true
	}
	globalThis.HTMLDialogElement.prototype.close = function () {
		this.open = false
		this.dispatchEvent(new Event('close'))
	}
	try {
		render(
			<ListingMedia
				title="Basket"
				kind="product"
				gallery
				images={[
					{ id: 'one', alt: 'Front view' },
					{ id: 'two', alt: 'Side view' },
				]}
			/>,
		)
		const trigger = screen.getByRole('button', { name: 'Enlarge image' })
		fireEvent.click(trigger)
		const dialog = screen.getByRole('dialog', { name: 'Basket — image 1 of 2' })
		fireEvent.keyDown(dialog, { key: 'ArrowRight' })
		expect(within(dialog).getByRole('img', { name: 'Side view' })).toBeTruthy()
		fireEvent.error(within(dialog).getByRole('img', { name: 'Side view' }))
		expect(within(dialog).getByRole('status')).toBeTruthy()
		fireEvent.click(within(dialog).getByRole('button', { name: 'Previous image' }))
		expect(within(dialog).getByRole('img', { name: 'Front view' })).toBeTruthy()
		fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
		expect(dialog.open).toBe(false)
		expect(globalThis.document.activeElement).toBe(trigger)
	} finally {
		globalThis.HTMLDialogElement.prototype.showModal = originalShow
		globalThis.HTMLDialogElement.prototype.close = originalClose
	}
})

describe('Listing Save action', () => {
	const originalFetch = globalThis.fetch
	afterEach(() => {
		globalThis.fetch = originalFetch
	})
	function mount() {
		return render(
			<SavedListingsProvider>
				<ListingSaveButton listingId="11111111-1111-4111-8111-111111111111" title="Basket" />
			</SavedListingsProvider>,
		)
	}
	it('loads saved state and removes an existing saved item', async () => {
		const mutations: boolean[] = []
		globalThis.fetch = jest.fn(async (_url, init) => {
			if (init?.method === 'POST') {
				mutations.push(JSON.parse(String(init.body)).saved)
				return { ok: true, status: 200 } as Response
			}
			return {
				ok: true,
				status: 200,
				json: async () => ({ savedListingIds: ['11111111-1111-4111-8111-111111111111'], followedVendorIds: [], personalizationOptIn: false }),
			} as Response
		})
		mount()
		const button = await screen.findByRole('button', { name: 'Remove saved Basket' })
		fireEvent.click(button)
		await waitFor(() => expect(mutations).toEqual([false]))
		await screen.findByText('Listing removed from saved items.')
		expect(button.getAttribute('aria-pressed')).toBe('false')
	})
	it('offers sign-in without sending an anonymous mutation', async () => {
		globalThis.fetch = jest.fn(async () => ({ ok: false, status: 403 }) as Response)
		mount()
		fireEvent.click(screen.getByRole('button', { name: 'Save Basket' }))
		await screen.findByRole('link', { name: 'Sign in' })
		expect(jest.mocked(globalThis.fetch).mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true)
	})
	it('retries the original desired state after an ambiguous committed response', async () => {
		let saved = false
		const mutations: boolean[] = []
		globalThis.fetch = jest.fn(async (_url, init) => {
			if (init?.method === 'POST') {
				saved = JSON.parse(String(init.body)).saved
				mutations.push(saved)
				if (mutations.length === 1) throw new TypeError('Response was lost')
				return { ok: true, status: 200 } as Response
			}
			return {
				ok: true,
				status: 200,
				json: async () => ({
					savedListingIds: saved ? ['11111111-1111-4111-8111-111111111111'] : [],
					followedVendorIds: [],
					personalizationOptIn: false,
				}),
			} as Response
		})
		mount()
		fireEvent.click(screen.getByRole('button', { name: 'Save Basket' }))
		await screen.findByText('Response was lost')
		fireEvent.click(screen.getByRole('button', { name: 'Save Basket' }))
		await screen.findByText('Listing saved.')
		expect(mutations).toEqual([true, true])
	})
})
