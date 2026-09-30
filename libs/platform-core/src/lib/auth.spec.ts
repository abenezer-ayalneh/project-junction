import { recoveryLink } from './auth-recovery.js'

describe('recoveryLink', () => {
	it('sends the signed Better Auth reset token directly to the public reset page', () => {
		expect(
			recoveryLink(
				'https://staging-junction.abenezer-ayalneh.dev/api/auth/reset-password/reset-token?callbackURL=https%3A%2F%2Fstaging-junction.abenezer-ayalneh.dev%2Faccount%2Freset',
				'https://staging-junction.abenezer-ayalneh.dev',
			),
		).toBe('https://staging-junction.abenezer-ayalneh.dev/account/reset?token=reset-token')
	})

	it('rejects a recovery URL outside the configured Better Auth origin', () => {
		expect(() => recoveryLink('https://example.test/api/auth/reset-password/reset-token', 'https://staging-junction.abenezer-ayalneh.dev')).toThrow(
			'Better Auth returned an invalid password recovery URL.',
		)
	})
})
