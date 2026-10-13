import { AccessDeniedError } from './access.js'
import { LocalMixedPaymentAdapter } from './local-mixed-payment.js'
describe('Local mixed payment receipt authentication', () => {
	const prior = { mode: process.env['JUNCTION_RUNTIME_MODE'], storage: process.env['FOUNDATION_STORAGE'] }
	beforeEach(() => {
		process.env['JUNCTION_RUNTIME_MODE'] = 'local'
		process.env['FOUNDATION_STORAGE'] = 'postgresql'
	})
	afterEach(() => {
		for (const [key, value] of [
			['JUNCTION_RUNTIME_MODE', prior.mode],
			['FOUNDATION_STORAGE', prior.storage],
		]) {
			if (value === undefined) delete process.env[key!]
			else process.env[key!] = value
		}
	})
	test('authenticates exact raw bytes and rejects changed bytes/signature/stale delivery', () => {
		const adapter = new LocalMixedPaymentAdapter('a'.repeat(32)),
			now = new Date('2026-10-13T10:00:00Z'),
			raw = Buffer.from('{"outcome":"succeeded"}'),
			signature = adapter.sign(raw, now)
		expect(() => adapter.verify(raw, signature, now)).not.toThrow()
		expect(() => adapter.verify(Buffer.from('{"outcome":"failed"}'), signature, now)).toThrow(AccessDeniedError)
		expect(() => adapter.verify(raw, signature, new Date(now.getTime() + 301000))).toThrow(AccessDeniedError)
		expect(() => adapter.verify(raw, 'bad', now)).toThrow(AccessDeniedError)
	})
	test('requires an explicit strong key and local runtime', () => {
		expect(() => new LocalMixedPaymentAdapter('').sign(Buffer.from('{}'), new Date())).toThrow(AccessDeniedError)
		process.env['JUNCTION_RUNTIME_MODE'] = 'staging'
		expect(() => new LocalMixedPaymentAdapter('b'.repeat(32)).sign(Buffer.from('{}'), new Date())).toThrow(AccessDeniedError)
	})
})
