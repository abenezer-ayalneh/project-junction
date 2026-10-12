import { render, screen } from '@testing-library/react'
import React from 'react'

import SearchPage from '../src/app/search/page'

jest.mock('../src/components/catalog-filters', () => ({
	CatalogFilters: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
jest.mock('../src/components/listing-card', () => ({ ListingCard: () => null }))
jest.mock('../src/components/marketplace-header', () => ({ MarketplaceHeader: () => null }))
jest.mock('../src/lib/marketplace', () => ({
	getPublicListings: jest.fn(),
	getPublicVendors: jest.fn(async () => ({ items: [], nextCursor: null })),
}))

import { getPublicListings } from '../src/lib/marketplace'

const getListings = jest.mocked(getPublicListings)

describe('SearchPage recovery and pagination state', () => {
	beforeEach(() => getListings.mockReset())

	it('clears the current cursor from the sort form', async () => {
		getListings.mockResolvedValue({ items: [], nextCursor: null, total: 0 })
		const page = await SearchPage({
			searchParams: Promise.resolve({ kind: 'product', q: 'coffee', cursor: '11111111-1111-4111-8111-111111111111' }),
		})
		render(page)

		const sortForm = screen.getByLabelText('Sort').closest('form')
		expect(sortForm?.querySelector('input[name="cursor"]')).toBeNull()
		expect(sortForm?.querySelector('input[name="q"]')?.getAttribute('value')).toBe('coffee')
	})

	it('keeps the current query when retrying an unavailable catalog', async () => {
		getListings.mockResolvedValue(null)
		const page = await SearchPage({
			searchParams: Promise.resolve({
				kind: 'product',
				q: 'coffee',
				category: 'goods',
				cursor: '11111111-1111-4111-8111-111111111111',
			}),
		})
		render(page)

		expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe(
			'/search?kind=product&category=goods&q=coffee&cursor=11111111-1111-4111-8111-111111111111',
		)
	})
})
