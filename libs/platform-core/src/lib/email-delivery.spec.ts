import { createAuthenticationEmailDelivery, type EmailDeliveryFactories } from './email-delivery.js'

const local = (): NodeJS.ProcessEnv => ({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025' })
const staging = (): NodeJS.ProcessEnv => ({ RESEND_API_KEY: 'deployment-key', RESEND_FROM_EMAIL: 'verify@junction.example' })

describe('authentication email delivery', () => {
	it('uses loopback SMTP for local email verification and recovery', async () => {
		const sendMail = jest.fn().mockResolvedValue(undefined)
		const createSmtp = jest.fn().mockReturnValue({ sendMail })
		const createResend = jest.fn()
		const factories: EmailDeliveryFactories = {
			createSmtp,
			createResend,
		}
		const delivery = createAuthenticationEmailDelivery('local', local(), factories)

		await delivery.send({ to: 'person@example.test', subject: 'Verify', text: 'http://localhost:3000/verify' })

		expect(createSmtp).toHaveBeenCalledWith({ host: '127.0.0.1', port: 1025, secure: false })
		expect(createResend).not.toHaveBeenCalled()
		expect(sendMail).toHaveBeenCalledWith({
			from: 'Project Junction <no-reply@junction.localhost>',
			to: 'person@example.test',
			subject: 'Verify',
			text: 'http://localhost:3000/verify',
		})
	})

	it('uses Resend only for deployment and surfaces delivery failures', async () => {
		const send = jest.fn().mockResolvedValue({ error: { message: 'refused' } })
		const createSmtp = jest.fn()
		const createResend = jest.fn().mockReturnValue({ emails: { send } })
		const factories: EmailDeliveryFactories = {
			createSmtp,
			createResend,
		}
		const delivery = createAuthenticationEmailDelivery('staging', staging(), factories)

		await expect(delivery.send({ to: 'person@example.test', subject: 'Reset', text: 'https://staging.example/reset' })).rejects.toThrow('refused')
		expect(createSmtp).not.toHaveBeenCalled()
		expect(createResend).toHaveBeenCalledWith('deployment-key')
	})
})
