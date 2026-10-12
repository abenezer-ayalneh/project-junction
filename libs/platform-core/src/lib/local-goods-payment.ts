import { AccessDeniedError } from './access.js'
import { applicationRuntimeMode } from './runtime.js'

/** Deterministic local simulation only. No card, charge or live fund movement. */
export class LocalGoodsPaymentAdapter {
	assertLocal() {
		if (applicationRuntimeMode() !== 'local') throw new AccessDeniedError('Controlled goods payments are available only in local development.')
	}
	refund(request: { operationId: string; paymentId: string; amountCents: number }): Promise<{ reference: string }> {
		this.assertLocal()
		return Promise.resolve({ reference: `local-refund:${request.operationId}` })
	}
}
