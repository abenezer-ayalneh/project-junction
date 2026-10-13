import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

import { PostgresFoundation } from '../libs/platform-core/dist/lib/postgres-foundation.js'
import { LocalMixedPaymentAdapter } from '../libs/platform-core/dist/lib/local-mixed-payment.js'

export async function checkComponentEarnings({ repository, identity, request, owner, finance, vendor, location, product, secret }) {
	const now = new Date(Date.now() - 8 * 86400000)
	const buyer = await identity()
	const adapter = new LocalMixedPaymentAdapter(secret)
	const historical = new PostgresFoundation(
		process.env.DATABASE_URL,
		undefined,
		undefined,
		undefined,
		undefined,
		() => new Date(now),
		undefined,
		undefined,
		adapter,
	)
	const originalSecret = process.env.JUNCTION_GOODS_HANDOFF_SECRET
	process.env.JUNCTION_GOODS_HANDOFF_SECRET = secret
	let allocationId
	try {
		const rate = await request(finance, '/platform/finance/commission-rates', 'POST', {
			vendorId: vendor.id,
			basisPoints: 0,
			effectiveFrom: new Date(now.getTime() - 60000).toISOString(),
			effectiveUntil: null,
			reason: 'Historical disposable earning release fixture.',
		})
		assert.equal(rate.status, 201)
		const cart = await historical.writeMixedCart(buyer.session.id, randomUUID(), {
			expectedVersion: 0,
			selection: {
				goodsGroups: [
					{
						vendorId: vendor.id,
						locationId: location.id,
						fulfillment: { method: 'pickup' },
						lines: [{ listingId: product.id, quantity: 1, expectedUnitPriceCents: 1000 }],
					},
				],
				bookings: [],
			},
		})
		const quote = await historical.createMixedQuote(buyer.session.id, randomUUID(), { cartId: cart.cartId, expectedVersion: cart.version })
		const hold = await historical.createMixedHold(buyer.session.id, randomUUID(), { quoteId: quote.quoteId })
		const payment = await historical.startMixedPayment(buyer.session.id, randomUUID(), { holdId: hold.holdId })
		const p = await historical.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id: payment.paymentId } })
		const payload = {
			eventId: randomUUID(),
			paymentId: p.id,
			workspaceId: p.workspaceId,
			reference: p.providerReference,
			merchant: 'junction',
			environment: 'local-controlled',
			amount: { minorUnits: Number(p.amountMinorUnits), currency: 'ETB' },
			outcome: 'succeeded',
			occurredAt: now.toISOString(),
		}
		const raw = Buffer.from(JSON.stringify(payload))
		await historical.receiveMixedPaymentWebhook(raw, adapter.sign(raw, now))
		const paid = await historical.readMixedPayment(buyer.session.id, p.id)
		const purchase = await historical.readMixedPurchase(buyer.session.id, paid.purchaseId)
		const order = purchase.orders[0]
		const fulfillment = await historical.readGoodsFulfillment(owner.session.id, order.orderId)
		await historical.prepareGoodsFulfillment(owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		await historical.readyGoodsPickup(owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		const ready = await historical.readGoodsFulfillment(buyer.session.id, order.orderId, true)
		await historical.collectGoodsPickup(owner.session.id, randomUUID(), fulfillment.fulfillmentId, {
			proof: { method: 'code', code: ready.collectionProof.code },
		})
		allocationId = (await historical.db.mixedCommerceAllocation.findUniqueOrThrow({ where: { goodsOrderLineId: order.lines[0].lineId } })).id
		const initial = await historical.db.earningRevision.findFirstOrThrow({ where: { allocationId }, orderBy: { version: 'desc' } })
		assert.equal(initial.snapshot.pending, 1000)
		assert.equal(initial.snapshot.available, 0)
	} finally {
		await historical.close()
		if (originalSecret === undefined) delete process.env.JUNCTION_GOODS_HANDOFF_SECRET
		else process.env.JUNCTION_GOODS_HANDOFF_SECRET = originalSecret
	}
	const saleCountBefore = await repository.db.ledgerTransaction.count({ where: { sourceId: allocationId } })
	const redis = new URL(process.env.REDIS_URL)
	assert.ok(['localhost', '127.0.0.1'].includes(redis.hostname))
	const worker = spawn(process.execPath, ['apps/worker/dist/main.js'], {
		env: { ...process.env, JUNCTION_RUNTIME_MODE: 'local', FOUNDATION_STORAGE: 'postgresql', JUNCTION_MIXED_PAYMENT_WEBHOOK_SECRET: secret },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	const closed = once(worker, 'close')
	let logs = ''
	worker.stdout.on('data', (chunk) => {
		logs = (logs + chunk).slice(-5000)
	})
	worker.stderr.on('data', (chunk) => {
		logs = (logs + chunk).slice(-5000)
	})
	try {
		let released = false
		for (let i = 0; i < 100; i++) {
			const row = await repository.db.earningRevision.findFirstOrThrow({ where: { allocationId }, orderBy: { version: 'desc' } })
			if (row.snapshot.available === 1000) {
				released = true
				break
			}
			if (worker.exitCode !== null) break
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		assert.ok(released, `Actual worker did not release due earnings: ${logs}`)
		assert.equal(await repository.db.ledgerTransaction.count({ where: { sourceId: allocationId } }), saleCountBefore)
		const read = await request(owner, '/vendor/earnings')
		assert.equal(read.status, 200)
		assert.equal(read.cacheControl, 'no-store')
		assert.equal(read.body.settlement, 'not_transferred')
		assert.equal(read.body.lots.find((l) => l.allocationId === allocationId).amounts.available, 1000)
		assert.equal((await request(buyer, '/vendor/earnings')).status, 403)
		assert.equal((await request(null, '/vendor/earnings')).status, 403)
		const count = await repository.db.earningRevision.count({ where: { allocationId } })
		await repository.releaseEarnings()
		assert.equal(await repository.db.earningRevision.count({ where: { allocationId } }), count)

		if (process.env.FINANCE_HTTP_CHECK === '1') {
			const workspaceId = owner.workspace.id,
				approver = await identity()
			await repository.db.platformFinanceGrant.update({
				where: { userId_workspaceId: { userId: finance.user.id, workspaceId: finance.workspace.id } },
				data: { settlementWorkspaceIds: [workspaceId] },
			})
			await repository.db.platformFinanceGrant.create({
				data: {
					userId: approver.user.id,
					workspaceId: approver.workspace.id,
					expiresAt: new Date(Date.now() + 3600000),
					grantedBy: 'C09 disposable HTTP fixture',
					reason: 'Explicit local settlement scope',
					settlementWorkspaceIds: [workspaceId],
				},
			})
			const operation = (who, input, key = randomUUID()) =>
				request(who, '/platform/finance/operations', 'POST', { workspaceId, reason: 'Disposable C09 HTTP verification.', ...input }, key)
			assert.equal((await operation(finance, { action: 'propose_policy', minimumMinorUnits: 1 })).status, 403)
			for (const f of [finance, approver])
				await repository.db.session.update({ where: { id: f.session.id }, data: { mfaVerifiedAt: new Date(), recentAuthAt: new Date() } })
			assert.equal((await operation(owner, { action: 'run_weekly' })).status, 403)
			const proposal = await operation(finance, { action: 'propose_policy', minimumMinorUnits: 1 })
			assert.equal(proposal.status, 201)
			const proposalId = proposal.body.records[0].id
			assert.equal((await operation(finance, { action: 'approve', proposalId })).status, 403)
			assert.equal((await operation(approver, { action: 'approve', proposalId })).status, 201)
			let transfer
			for (let i = 0; i < 100; i++) {
				transfer = await repository.db.financeRecord.findFirst({ where: { workspaceId, kind: 'transfer' } })
				if (transfer) break
				await new Promise((resolve) => setTimeout(resolve, 100))
			}
			assert.ok(transfer, 'Actual worker must allocate an approved weekly batch.')
			const transferId = transfer.id
			assert.equal(transfer.payload.amount, 1000)
			assert.equal((await operation(finance, { action: 'simulate_result', transferId, outcome: 'unknown' })).status, 201)
			const key = randomUUID(),
				completed = await operation(finance, { action: 'simulate_result', transferId, outcome: 'succeeded' }, key)
			assert.equal(completed.status, 201)
			assert.equal(
				(await operation(finance, { action: 'simulate_result', transferId, outcome: 'succeeded' }, key)).body.records[0].id,
				completed.body.records[0].id,
			)
			assert.equal((await operation(finance, { action: 'simulate_result', transferId, outcome: 'failed' })).status, 409)
			const reconciled = await operation(finance, { action: 'reconcile' })
			assert.equal(reconciled.status, 201)
			assert.equal(reconciled.body.records[0].payload.matched, true)
			assert.equal((await request(null, `/platform/finance/workspaces/${workspaceId}`)).status, 403)
			const statement = await request(finance, `/platform/finance/workspaces/${workspaceId}`)
			assert.equal(statement.status, 200)
			assert.equal(statement.cacheControl, 'no-store')
			assert.equal(statement.body.sandbox, true)
			const vendorStatement = await request(owner, '/vendor/payouts')
			assert.equal(vendorStatement.status, 200)
			assert.equal(vendorStatement.cacheControl, 'no-store')
			assert.equal(vendorStatement.body.transfers[0].status, 'succeeded')
			assert.equal((await request(buyer, '/vendor/payouts')).status, 403)
			await repository.db.platformFinanceGrant.update({
				where: { userId_workspaceId: { userId: approver.user.id, workspaceId: approver.workspace.id } },
				data: { revokedAt: new Date() },
			})
			assert.equal((await operation(approver, { action: 'reconcile' })).status, 403)
			console.log(
				'Built local Finance HTTP/actual worker passed: explicit scope/recent MFA/dual control, automatic weekly allocation, unknown/success replay, conflicting terminal rejection, ledger reconciliation, private no-store history and revocation.',
			)
		}
		console.log(
			'Built local earning HTTP/actual worker passed: historical verified handoff releases once, scoped no-store Owner read, Customer/anonymous denial and unchanged original sale posting.',
		)
	} finally {
		if (worker.exitCode === null) worker.kill('SIGTERM')
		const timer = setTimeout(() => worker.kill('SIGKILL'), 5000)
		try {
			await closed
		} finally {
			clearTimeout(timer)
		}
	}
}
