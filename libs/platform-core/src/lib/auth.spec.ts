import { GoogleAccountLinkingConfiguration, isMfaPluginEnabled, localGoogleProvider } from './auth-policy.js'

const local = (): NodeJS.ProcessEnv => ({
	JUNCTION_RUNTIME_MODE: 'local',
	FOUNDATION_STORAGE: 'postgresql',
	GOOGLE_CLIENT_ID: 'local-client-id',
	GOOGLE_CLIENT_SECRET: 'local-client-secret',
})

describe('local Google authentication', () => {
	it('links only trusted Google identities to an existing verified email account', () => {
		expect(GoogleAccountLinkingConfiguration).toEqual({
			enabled: true,
			requireLocalEmailVerified: true,
			trustedProviders: ['google'],
		})
	})

	it('requires local Google credentials and never configures Google for staging', () => {
		expect(localGoogleProvider(local())).toEqual({ clientId: 'local-client-id', clientSecret: 'local-client-secret' })
		expect(() => localGoogleProvider({ ...local(), GOOGLE_CLIENT_SECRET: '' })).toThrow('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET')
		expect(
			localGoogleProvider({
				JUNCTION_RUNTIME_MODE: 'staging',
				FOUNDATION_STORAGE: 'postgresql',
				GOOGLE_CLIENT_ID: 'ignored',
				GOOGLE_CLIENT_SECRET: 'ignored',
			}),
		).toBeUndefined()
	})

	it('keeps the MFA plugin unavailable in the local runtime', () => {
		expect(isMfaPluginEnabled('local')).toBe(false)
		expect(isMfaPluginEnabled('staging')).toBe(true)
	})
})
