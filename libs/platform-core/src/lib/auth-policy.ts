import { applicationRuntimeMode, type ApplicationRuntimeMode } from './runtime.js'

export const GoogleAccountLinkingConfiguration = {
	enabled: true,
	requireLocalEmailVerified: true,
	trustedProviders: ['google'],
}

export function localGoogleProvider(env: NodeJS.ProcessEnv = process.env) {
	if (applicationRuntimeMode(env) !== 'local') return undefined
	const clientId = env['GOOGLE_CLIENT_ID']?.trim()
	const clientSecret = env['GOOGLE_CLIENT_SECRET']?.trim()
	if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for local Google authentication.')
	return { clientId, clientSecret }
}

export function isMfaPluginEnabled(runtimeMode: ApplicationRuntimeMode): boolean {
	return runtimeMode === 'staging'
}
