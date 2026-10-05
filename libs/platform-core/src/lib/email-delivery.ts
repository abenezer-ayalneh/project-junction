import { createTransport } from 'nodemailer'
import { Resend } from 'resend'

import type { ApplicationRuntimeMode } from './runtime.js'

export interface AuthenticationEmailMessage {
	to: string
	subject: string
	text: string
}

export interface AuthenticationEmailDelivery {
	send(message: AuthenticationEmailMessage): Promise<void>
}

interface SmtpTransport {
	sendMail(message: AuthenticationEmailMessage & { from: string }): Promise<unknown>
}

interface ResendClient {
	emails: {
		send(message: AuthenticationEmailMessage & { from: string }): Promise<{ error: { message: string } | null }>
	}
}

export interface EmailDeliveryFactories {
	createResend(apiKey: string): ResendClient
	createSmtp(options: { host: string; port: number; secure: false }): SmtpTransport
}

const defaultFactories: EmailDeliveryFactories = {
	createResend: (apiKey) => new Resend(apiKey),
	createSmtp: (options) => createTransport(options),
}

function requiredEnvironment(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name]?.trim()
	if (!value) throw new Error(`${name} is required for authentication email delivery.`)
	return value
}

export function createAuthenticationEmailDelivery(
	runtimeMode: ApplicationRuntimeMode,
	env: NodeJS.ProcessEnv = process.env,
	factories: EmailDeliveryFactories = defaultFactories,
): AuthenticationEmailDelivery {
	if (runtimeMode === 'local') {
		const from = env['LOCAL_MAIL_FROM_EMAIL']?.trim() || 'Project Junction <no-reply@junction.localhost>'
		const transport = factories.createSmtp({
			host: requiredEnvironment(env, 'SMTP_HOST'),
			port: Number(requiredEnvironment(env, 'SMTP_PORT')),
			secure: false,
		})
		return {
			send: async (message) => {
				await transport.sendMail({ ...message, from })
			},
		}
	}

	const from = requiredEnvironment(env, 'RESEND_FROM_EMAIL')
	const resend = factories.createResend(requiredEnvironment(env, 'RESEND_API_KEY'))
	return {
		send: async (message) => {
			const { error } = await resend.emails.send({ ...message, from })
			if (error) throw new Error(`Authentication email delivery failed: ${error.message}`)
		},
	}
}
