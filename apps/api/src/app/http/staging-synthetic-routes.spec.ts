import { isSyntheticStagingPath } from './staging-synthetic-routes'

describe('private staging API route boundary', () => {
	it('blocks synthetic account, demo, audit, staff, and fake webhook routes', () => {
		for (const path of [
			'/v1/synthetic/accounts',
			'/v1/demo/workspaces/abc/personas/customer/sessions',
			'/v1/foundation/audit-markers',
			'/v1/foundation/elevated-audit-markers',
			'/v1/foundation/staff/abc',
			'/v1/webhooks/fake-payment',
		]) {
			expect(isSyntheticStagingPath(path)).toBe(true)
		}
	})

	it('keeps real account, identity, and resource routes', () => {
		for (const path of ['/v1/access-context', '/v1/identity/sumsub-webhook', '/v1/foundation/locations/abc']) {
			expect(isSyntheticStagingPath(path)).toBe(false)
		}
	})
})
