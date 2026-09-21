import { render, screen } from '@testing-library/react'
import React from 'react'

import Page from '../src/app/page'

describe('Page', () => {
	it('discloses the synthetic-only boundary', () => {
		render(<Page />)
		expect(screen.getByRole('status').textContent).toContain('Synthetic runtime only')
		expect(screen.getByRole('heading', { name: /build the boundaries/i })).toBeTruthy()
	})
})
