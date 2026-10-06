import { randomUUID } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { twoFactor } from 'better-auth/plugins'
import { PostgresDialect } from 'kysely'
import { Pool } from 'pg'

import { GoogleAccountLinkingConfiguration, isMfaPluginEnabled, localGoogleProvider } from './auth-policy.js'
import { recoveryLink } from './auth-recovery.js'
import { createAuthenticationEmailDelivery } from './email-delivery.js'
import { PostgresFoundation } from './postgres-foundation.js'
import { applicationRuntimeMode } from './runtime.js'

function requiredEnvironment(name: string): string {
	const value = process.env[name]
	if (!value) throw new Error(`${name} is required for real authentication.`)
	return value
}

export function createAuth() {
	const runtimeMode = applicationRuntimeMode()
	const baseURL = requiredEnvironment('BETTER_AUTH_URL')
	const secret = requiredEnvironment('BETTER_AUTH_SECRET')
	if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.')
	if (process.env['JUNCTION_RUNTIME_MODE'] === 'staging' && new URL(baseURL).protocol !== 'https:') {
		throw new Error('BETTER_AUTH_URL must use HTTPS in staging.')
	}
	const databaseUrl = requiredEnvironment('DATABASE_URL')
	if (runtimeMode === 'local' && baseURL !== 'http://localhost:3000') throw new Error('Local Better Auth must use http://localhost:3000.')
	const emailDelivery = createAuthenticationEmailDelivery(runtimeMode)
	const send = async (to: string, subject: string, url: string) => {
		await emailDelivery.send({ to, subject, text: `${subject}: ${url}` })
	}
	const google = localGoogleProvider()

	return betterAuth({
		appName: 'Project Junction',
		plugins: isMfaPluginEnabled(runtimeMode) ? [twoFactor({ issuer: 'Project Junction' })] : [],
		account: {
			accountLinking: GoogleAccountLinkingConfiguration,
		},
		databaseHooks: {
			session: {
				create: {
					after: async (session, context) => {
						if (context?.path !== '/two-factor/verify-totp' && context?.path !== '/two-factor/verify-backup-code') return
						// Enrollment can create a replacement session on verify-totp while an
						// authenticated session already exists. Only the sign-in challenge
						// creates its session without one.
						if (context.context.session) return
						const user = await context.context.internalAdapter.findUserById(session.userId)
						if (!user?.emailVerified) return
						const foundation = new PostgresFoundation(databaseUrl)
						try {
							await foundation.ensureAuthenticatedSession({
								sessionId: session.id,
								userId: session.userId,
								email: user.email,
								expiresAt: session.expiresAt,
							})
							await foundation.markVerifiedSecondFactor(session.id, session.userId, new Date())
						} finally {
							await foundation.close()
						}
					},
				},
			},
		},
		advanced: {
			cookiePrefix: 'junction-auth',
			useSecureCookies: process.env['JUNCTION_RUNTIME_MODE'] === 'staging',
			database: { generateId: () => randomUUID() },
		},
		baseURL,
		secret,
		database: {
			dialect: new PostgresDialect({ pool: new Pool({ connectionString: databaseUrl }) }),
			type: 'postgres',
			schemaName: 'junction_auth',
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: ({ user, url }) => send(user.email, 'Reset your Project Junction password', recoveryLink(url, baseURL)),
		},
		emailVerification: {
			sendOnSignUp: true,
			sendVerificationEmail: ({ user, url }) => send(user.email, 'Verify your Project Junction email', url),
		},
		...(google ? { socialProviders: { google } } : {}),
	})
}

let auth: ReturnType<typeof createAuth> | undefined
export function getAuth() {
	return (auth ??= createAuth())
}
