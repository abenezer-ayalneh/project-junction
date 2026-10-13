/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomBytes, randomUUID } from 'node:crypto'

import { GoodsCustomerPickupReadSchema, type MixedCartSelection } from 'contracts'

import { AccessDeniedError } from './access.js'
import { LocalMixedPaymentAdapter, type MixedProviderEvent } from './local-mixed-payment.js'
import { PostgresFoundation } from './postgres-foundation.js'
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 04 reconciliation and payouts PostgreSQL', () => {
	jest.setTimeout(30000)
	let repository: PostgresFoundation
	let other: PostgresFoundation
	let adapter: LocalMixedPaymentAdapter
	const secret = randomBytes(32).toString('hex')
	let now: Date
	const clock = () => new Date(now)
	async function customer() {
		const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
		const user = await repository.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const session = await repository.db.session.create({ data: { userId: user.id, workspaceId: workspace.id, expiresAt: new Date(Date.now() + 3600000) } })
		return { workspace, user, session }
	}
	async function vendor(twoStaff = false) {
		const owner = await customer()
		const vendor = await repository.db.vendor.create({
			data: {
				workspaceId: owner.workspace.id,
				applicationState: 'approved',
				publishedAt: new Date(),
				publicSlug: randomUUID(),
				displayName: 'Mixed quote Vendor',
			},
		})
		const location = await repository.db.location.create({ data: { vendorId: vendor.id, label: 'Shop', city: 'Test city' } })
		const membership = await repository.db.vendorMembership.create({
			data: { vendorId: vendor.id, userId: owner.user.id, role: 'vendor_owner', locationIds: [location.id] },
		})
		await repository.db.session.update({ where: { id: owner.session.id }, data: { activeVendorId: vendor.id, activeRole: 'vendor_owner' } })
		const product = await repository.createListing(owner.session.id, randomUUID(), {
			kind: 'product',
			category: 'goods',
			title: 'Mixed Product',
			description: 'Disposable quote Product.',
			priceCents: 1000,
		})
		await repository.db.listing.update({ where: { id: product.id }, data: { state: 'published' } })
		await repository.createInventoryMovement(owner.session.id, randomUUID(), {
			listingId: product.id,
			locationId: location.id,
			reason: 'received',
			quantityDelta: 20,
		})
		const zone = {
			id: randomUUID(),
			label: 'Local delivery',
			polygon: [
				[41, 9],
				[42, 9],
				[42, 10],
				[41, 10],
				[41, 9],
			],
			feeCents: 200,
			minimumCents: 1000,
			freeDeliveryThresholdCents: 3000,
			etaMinutes: 60,
		}
		await repository.configureGoodsLocation(owner.session.id, randomUUID(), location.id, {
			expectedVersion: 0,
			configuration: { pickupEnabled: true, returnTemplate: 'standard', deliveryZones: [zone] },
		})
		const linked = await repository.createStaffProfile(owner.session.id, randomUUID(), { displayName: 'Named Staff', memberUserId: owner.user.id })
		await repository.setStaffPublicConsent(owner.session.id, randomUUID(), linked.id, { expectedVersion: 1, publicDisplay: true })
		const hidden = twoStaff ? await repository.createStaffProfile(owner.session.id, randomUUID(), { displayName: 'Hidden Staff' }) : null
		const calendar = { timezone: 'UTC', weekly: [{ weekday: 1, hours: [{ startMinute: 540, endMinute: 1020 }], breaks: [] }], exceptions: [] }
		for (const staff of [linked, ...(hidden ? [hidden] : [])])
			await repository.configureStaffSchedule(owner.session.id, randomUUID(), staff.id, {
				expectedVersion: 0,
				schedule: {
					scopes: [
						{ mode: 'in_person', locationId: location.id, calendar },
						{ mode: 'online', locationId: null, calendar },
					],
				},
			})
		await repository.configureLocationSchedule(owner.session.id, randomUUID(), location.id, { expectedVersion: 0, calendar })
		const service = await repository.createListing(owner.session.id, randomUUID(), {
			kind: 'service',
			category: 'appointment',
			title: 'Mixed Service',
			description: 'Disposable quote Service.',
			priceCents: 1500,
			durationMinutes: 30,
		})
		const option = {
			id: randomUUID(),
			label: 'Fixed service',
			priceCents: 1500,
			durationMinutes: 30,
			bufferBeforeMinutes: 5,
			bufferAfterMinutes: 10,
			locationIds: [location.id],
			online: true,
			addons: [{ id: randomUUID(), label: 'Extra service', priceCents: 500, durationMinutes: 15 }],
			qualifications: [linked, ...(hidden ? [hidden] : [])].map((s) => ({ staffId: s.id, locationIds: [location.id], online: true })),
		}
		const configuration = { capacity: 'staff_only', options: [option] }
		await repository.configureService(owner.session.id, randomUUID(), service.id, { expectedVersion: 0, configuration, bookingPolicy: 'flexible' })
		await repository.configureServiceSchedulingRules(owner.session.id, randomUUID(), service.id, {
			expectedVersion: 0,
			rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 15 },
		})
		await repository.db.listing.update({ where: { id: service.id }, data: { state: 'published' } })
		const selection: MixedCartSelection = {
			goodsGroups: [
				{
					vendorId: vendor.id,
					locationId: location.id,
					fulfillment: { method: 'pickup' },
					lines: [{ listingId: product.id, quantity: 1, expectedUnitPriceCents: 1000 }],
				},
			],
			bookings: [
				{
					intentId: randomUUID(),
					quantity: 1,
					expectedPriceCents: 1500,
					selection: {
						listingId: service.id,
						optionId: option.id,
						addonIds: [],
						mode: 'in_person',
						locationId: location.id,
						staffId: null,
						start: '2026-10-12T09:15:00Z',
						expectedConfigurationVersion: 1,
						expectedRulesVersion: 1,
					},
				},
			],
		}
		return { owner, vendor, location, membership, product, service, linked, hidden, option, configuration, zone, selection }
	}
	beforeEach(async () => {
		now = new Date('2026-10-12T08:00:00Z')
		adapter = new LocalMixedPaymentAdapter(secret)
		repository = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock, undefined, undefined, adapter)
		other = new PostgresFoundation(process.env['DATABASE_URL']!, undefined, undefined, undefined, undefined, clock, undefined, undefined, adapter)
		// Mixed hold fixtures explicitly configure their controlled zero-rate
		// policy; production does not infer a commission when none was published.
		if (!(await repository.db.commissionRate.findFirst({ where: { vendorId: null, effectiveFrom: { lte: now } } }))) {
			const control = await customer()
			await repository.db.platformFinanceGrant.create({
				data: {
					userId: control.user.id,
					workspaceId: control.workspace.id,
					expiresAt: new Date(Date.now() + 3600000),
					grantedBy: 'C02 control fixture',
					reason: 'Controlled quote regression policy',
				},
			})
			await repository.publishCommissionRate(control.session.id, randomUUID(), {
				vendorId: null,
				basisPoints: 0,
				effectiveFrom: '2026-10-12T00:00:00Z',
				effectiveUntil: null,
				reason: 'Explicit zero-rate regression fixture',
			})
		}
	})
	afterEach(async () => {
		await Promise.all([repository.close(), other.close()])
	})
	async function save(sessionId: string, selection: MixedCartSelection, expectedVersion = 0, key = randomUUID()) {
		return repository.writeMixedCart(sessionId, key, { expectedVersion, selection })
	}
	async function quote(sessionId: string, cart: { cartId: string | null; version: number }, key = randomUUID()) {
		return repository.createMixedQuote(sessionId, key, { cartId: cart.cartId!, expectedVersion: cart.version })
	}
	async function campaign(amount = 1000) {
		const f = await customer()
		await repository.db.platformFinanceGrant.create({
			data: {
				userId: f.user.id,
				workspaceId: f.workspace.id,
				expiresAt: new Date(Date.now() + 3600000),
				grantedBy: 'C04 fixture',
				reason: 'Controlled configuration',
			},
		})
		return repository.publishPlatformCampaign(f.session.id, randomUUID(), {
			definition: {
				code: `C_${randomUUID().slice(0, 12)}`,
				validFrom: '2026-10-12T00:00:00Z',
				validUntil: '2026-10-13T00:00:00Z',
				scope: { kinds: ['goods', 'booking'], listingIds: [] },
				rule: { kind: 'fixed', minorUnits: 100 },
				minimumMinorUnits: 0,
				usageLimit: null,
				perCustomerLimit: null,
				refundFundingRule: 'proportional_original_allocations',
			},
			vendorIds: [],
			budget: { minorUnits: amount, currency: 'ETB' },
			reason: 'C04 controlled campaign',
		})
	}
	async function prepared(c: Awaited<ReturnType<typeof customer>>, selection: MixedCartSelection) {
		const old = await repository.readMixedCart(c.session.id)
		const cart = await save(c.session.id, selection, old.version)
		return quote(c.session.id, cart)
	}
	const hold = (sessionId: string, quoteId: string, key = randomUUID(), repo = repository) => repo.createMixedHold(sessionId, key, { quoteId })
	async function event(id: string, outcome: MixedProviderEvent['outcome'] = 'succeeded', changes: Partial<MixedProviderEvent> = {}) {
		const p = await repository.db.mixedPaymentAttempt.findUniqueOrThrow({ where: { id } })
		return {
			...{
				eventId: randomUUID(),
				paymentId: p.id,
				workspaceId: p.workspaceId,
				reference: p.providerReference,
				merchant: 'junction' as const,
				environment: 'local-controlled' as const,
				amount: { minorUnits: Number(p.amountMinorUnits), currency: 'ETB' as const },
				outcome,
				occurredAt: now.toISOString(),
			},
			...changes,
		}
	}
	async function receive(e: unknown, repo = repository) {
		const raw = Buffer.from(JSON.stringify(e))
		return repo.receiveMixedPaymentWebhook(raw, adapter.sign(raw, now))
	}
	async function paid(quantity = 1, days = 7, promoted = false, future = false, delivery = false) {
		process.env['JUNCTION_GOODS_HANDOFF_SECRET'] = secret
		process.env['JUNCTION_BOOKING_ATTENDANCE_SECRET'] = secret
		const c = await customer(),
			v = await vendor()
		if (days === 14)
			await repository.configureGoodsLocation(v.owner.session.id, randomUUID(), v.location.id, {
				expectedVersion: 1,
				configuration: { pickupEnabled: true, returnTemplate: 'flexible', deliveryZones: [] },
			})
		const promotion = promoted ? await campaign() : null
		const q = await prepared(c, {
			...v.selection,
			bookings: future ? v.selection.bookings.map((b) => ({ ...b, selection: { ...b.selection, start: '2026-10-19T09:15:00Z' } })) : v.selection.bookings,
			promotions: { vendorCouponId: null, platformCampaignId: promotion?.promotionId ?? null },
			goodsGroups: [
				{
					...v.selection.goodsGroups[0],
					fulfillment: delivery
						? {
								method: 'delivery',
								zoneId: v.zone.id,
								address: { contactName: 'Customer', phone: '0911000000', locality: 'Test city', address: 'Original gate', point: [41.5, 9.5] },
							}
						: { method: 'pickup' },
					lines: [{ ...v.selection.goodsGroups[0].lines[0], quantity }],
				},
			],
		})
		const h = await hold(c.session.id, q.quoteId),
			payment = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId })
		await receive(await event(payment.paymentId))
		const result = await repository.readMixedPayment(c.session.id, payment.paymentId)
		const purchase = await repository.readMixedPurchase(c.session.id, result.purchaseId!)
		return { c, v, purchase, order: purchase.orders[0], booking: purchase.bookings[0] }
	}
	async function goodsHandoff(f: Awaited<ReturnType<typeof paid>>) {
		const fulfillment = await repository.readGoodsFulfillment(f.v.owner.session.id, f.order.orderId)
		await repository.prepareGoodsFulfillment(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		await repository.readyGoodsPickup(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId)
		const ready = GoodsCustomerPickupReadSchema.parse(await repository.readGoodsFulfillment(f.c.session.id, f.order.orderId, true))
		await repository.collectGoodsPickup(f.v.owner.session.id, randomUUID(), fulfillment.fulfillmentId, {
			proof: { method: 'code', code: ready.collectionProof!.code },
		})
	}
	async function bookingComplete(f: Awaited<ReturnType<typeof paid>>) {
		now = new Date(f.booking.snapshot.start)
		const proof = await repository.readBookingAttendanceProof(f.c.session.id, f.booking.bookingId)
		now = new Date(f.booking.snapshot.end)
		await repository.confirmBookingAttendance(f.v.owner.session.id, randomUUID(), f.booking.bookingId, {
			expectedVersion: 1,
			method: 'code',
			proof: proof.code,
			confirmed: true,
		})
	}
	async function claim(f: Awaited<ReturnType<typeof paid>>, quantity = 1) {
		return repository.submitGoodsReturn(f.c.session.id, randomUUID(), f.order.orderId, {
			lineId: f.order.lines[0].lineId,
			quantity,
			reason: 'material_misdescription',
			unused: false,
			evidence: 'The received goods differ materially from their committed description.',
		})
	}

	async function finance(target: string) {
		const f = await customer()
		await repository.db.session.update({ where: { id: f.session.id }, data: { mfaVerifiedAt: now, recentAuthAt: now } })
		await repository.db.platformFinanceGrant.create({
			data: {
				userId: f.user.id,
				workspaceId: f.workspace.id,
				expiresAt: new Date(Date.now() + 3600000),
				grantedBy: 'C09 fixture',
				reason: 'Scoped settlement fixture',
				settlementWorkspaceIds: [target],
			},
		})
		return f
	}
	const command = (f: Awaited<ReturnType<typeof customer>>, workspaceId: string, input: object, key = randomUUID(), repo = repository) =>
		repo.financeCommand(f.session.id, key, { workspaceId, reason: 'Controlled C09 verification.', ...input })
	async function policy(f: Awaited<ReturnType<typeof paid>>, minimumMinorUnits = 1) {
		const a = await finance(f.v.owner.workspace.id),
			b = await finance(f.v.owner.workspace.id)
		const p = await command(a, f.v.owner.workspace.id, { action: 'propose_policy', minimumMinorUnits })
		await command(b, f.v.owner.workspace.id, { action: 'approve', proposalId: p.records[0].id })
		return { a, b }
	}
	async function ready() {
		const f = await paid(2)
		await goodsHandoff(f)
		await bookingComplete(f)
		now = new Date(now.getTime() + 8 * 86400000)
		return f
	}
	async function fresh(f: Awaited<ReturnType<typeof customer>>) {
		await repository.db.session.update({ where: { id: f.session.id }, data: { mfaVerifiedAt: now, recentAuthAt: now } })
	}
	async function transfer(w: string) {
		return repository.db.financeRecord.findFirstOrThrow({ where: { workspaceId: w, kind: 'transfer' }, orderBy: { createdAt: 'desc' } })
	}
	test('fresh MFA, explicit settlement scope and distinct Finance approval are required even locally', async () => {
		const f = await paid(),
			a = await finance(f.v.owner.workspace.id)
		await expect(command(f.c, f.v.owner.workspace.id, { action: 'reconcile' })).rejects.toThrow(AccessDeniedError)
		await expect(command(a, f.c.workspace.id, { action: 'reconcile' })).rejects.toThrow(AccessDeniedError)
		const p = await command(a, f.v.owner.workspace.id, { action: 'propose_policy', minimumMinorUnits: 1 })
		await expect(command(a, f.v.owner.workspace.id, { action: 'approve', proposalId: p.records[0].id })).rejects.toThrow('different')
		now = new Date(now.getTime() + 16 * 60000)
		await expect(command(a, f.v.owner.workspace.id, { action: 'reconcile' })).rejects.toThrow('Recent')
	})
	test('weekly races and different request keys allocate each available lot once; unknown remains reserved', async () => {
		const f = await ready(),
			{ a, b } = await policy(f),
			w = f.v.owner.workspace.id
		const [x, y] = await Promise.all([command(a, w, { action: 'run_weekly' }), command(b, w, { action: 'run_weekly' }, randomUUID(), other)])
		expect(x.records[0].id).toBe(y.records[0].id)
		const t = await transfer(w)
		expect((t.payload as { amount: number }).amount).toBe(3500)
		await command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'unknown' })
		now = new Date(now.getTime() + 7 * 86400000)
		await fresh(a)
		const next = await command(a, w, { action: 'run_weekly' })
		expect(next.records[0].payload['amount']).toBe(0)
		expect(await repository.db.financeRecord.count({ where: { workspaceId: w, kind: 'transfer' } })).toBe(1)
	})
	test('success duplicates post one exact balanced transfer; conflicting terminal and ledger mutation are rejected', async () => {
		const f = await ready(),
			{ a } = await policy(f),
			w = f.v.owner.workspace.id
		await command(a, w, { action: 'run_weekly' })
		const t = await transfer(w)
		const [x, y] = await Promise.all([
			command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'succeeded' }),
			command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'succeeded' }, randomUUID(), other),
		])
		expect(x.records[0].id).toBe(y.records[0].id)
		expect(await repository.db.ledgerTransaction.count({ where: { sourceId: t.id } })).toBe(2)
		const r = await command(a, w, { action: 'reconcile' })
		expect(r.records[0].payload['matched']).toBe(true)
		await expect(command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'failed' })).rejects.toThrow('terminal')
		await expect(repository.db.financeRecord.delete({ where: { id: t.id } })).rejects.toThrow('immutable')
		await expect(repository.db.$executeRawUnsafe('TRUNCATE finance_records')).rejects.toThrow('immutable')
	})
	test('failed transfers release reservations only to the next weekly batch; no blind same-week repeat', async () => {
		const f = await ready(),
			{ a } = await policy(f),
			w = f.v.owner.workspace.id
		await command(a, w, { action: 'run_weekly' })
		const t = await transfer(w)
		await command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'failed' })
		await command(a, w, { action: 'run_weekly' })
		expect(await repository.db.financeRecord.count({ where: { workspaceId: w, kind: 'transfer' } })).toBe(1)
		now = new Date(now.getTime() + 7 * 86400000)
		await fresh(a)
		expect((await command(a, w, { action: 'run_weekly' })).records[0].payload['amount']).toBe(3500)
	})
	test('pending and frozen components never enter allocation, while independent Booking remains eligible', async () => {
		const f = await ready()
		await claim(f)
		const { a } = await policy(f),
			w = f.v.owner.workspace.id
		await command(a, w, { action: 'run_weekly' })
		const t = await transfer(w)
		expect((t.payload as { amount: number }).amount).toBe(2500)
	})
	test('configured minimum and automatic worker tick preserve empty batches and replay', async () => {
		const f = await ready()
		await policy(f, 5000)
		const w = f.v.owner.workspace.id
		await Promise.all([repository.runWeeklyPayouts(), other.runWeeklyPayouts()])
		expect(await repository.db.financeRecord.count({ where: { workspaceId: w, kind: 'batch' } })).toBe(1)
		expect(await repository.db.financeRecord.count({ where: { workspaceId: w, kind: 'transfer' } })).toBe(0)
	})
	test('reconciliation binds capture to verified receipt and stores deduplicated exceptions without editing money', async () => {
		const f = await paid(),
			a = await finance(f.c.workspace.id),
			w = f.c.workspace.id
		const matched = await command(a, w, { action: 'reconcile' })
		expect(matched.records[0].payload['matched']).toBe(true)
		const payment = await repository.db.mixedPaymentAttempt.findFirstOrThrow({ where: { workspaceId: w } })
		await receive(await event(payment.id, 'succeeded', { amount: { minorUnits: Number(payment.amountMinorUnits) + 1, currency: 'ETB' } }))
		await repository.reconcileMixedPayments()

		const count = await repository.db.ledgerTransaction.count()
		await command(a, w, { action: 'reconcile' })
		await command(a, w, { action: 'reconcile' })
		expect(await repository.db.financeRecord.count({ where: { workspaceId: w, kind: 'exception', sourceId: payment.id } })).toBe(1)
		expect(await repository.db.ledgerTransaction.count()).toBe(count)
	})
	test('raw forged allocation and same-actor approval fail database validation', async () => {
		const f = await paid(),
			a = await finance(f.v.owner.workspace.id),
			w = f.v.owner.workspace.id
		const lot = (await repository.readVendorEarnings(f.v.owner.session.id)).lots[0]
		await expect(
			repository.db.financeRecord.create({
				data: {
					workspaceId: w,
					kind: 'transfer',
					operationKey: randomUUID(),
					createdAt: now,
					payload: { amount: 1, currency: 'ETB', lots: [{ allocationId: lot.allocationId, amount: 1 }] },
				},
			}),
		).rejects.toThrow()
		const p = await command(a, w, { action: 'propose_policy', minimumMinorUnits: 1 })
		await expect(
			repository.db.financeRecord.create({
				data: {
					workspaceId: w,
					kind: 'approval',
					operationKey: 'approve:' + p.records[0].id,
					sourceId: p.records[0].id,
					actorId: a.user.id,
					createdAt: now,
					payload: {},
				},
			}),
		).rejects.toThrow('distinct')
	})
	test('ordinary fees debit Junction expense; distinct approval reverses a linked exception without editing history', async () => {
		const f = await paid(),
			w = f.c.workspace.id,
			a = await finance(w),
			b = await finance(w)
		const fee = await command(a, w, {
			action: 'propose_fee',
			feeKind: 'processor',
			amountMinorUnits: 25,
			reference: randomUUID(),
			evidence: 'Controlled provider fee statement.',
		})
		await command(b, w, { action: 'approve', proposalId: fee.records[0].id })
		const ledger = await repository.db.ledgerTransaction.findFirstOrThrow({ where: { sourceId: fee.records[0].id }, include: { postings: true } })
		expect(ledger.postings.find((p) => p.account === 'platform_processor_fee_expense')?.minorUnits).toBe(25n)
		const exception = await command(a, w, {
			action: 'open_exception',
			sourceId: ledger.id,
			code: 'incorrect_fee',
			evidence: 'Controlled provider corrected its statement.',
		})
		const correction = await command(a, w, {
			action: 'propose_correction',
			exceptionId: exception.records[0].id,
			transactionId: ledger.id,
			evidence: 'Exact reversal of the erroneous fee.',
		})
		await expect(command(a, w, { action: 'approve', proposalId: correction.records[0].id })).rejects.toThrow('different')
		await command(b, w, { action: 'approve', proposalId: correction.records[0].id })
		await command(b, w, { action: 'approve', proposalId: correction.records[0].id })
		expect(await repository.db.ledgerTransaction.count({ where: { reversalOf: ledger.id } })).toBe(1)
		expect(await repository.db.financeRecord.count({ where: { kind: 'exception_resolution', sourceId: exception.records[0].id } })).toBe(1)
	})
	test('late claim after paid transfer withholds debt against future unrelated available value', async () => {
		const f = await ready(),
			{ a } = await policy(f),
			w = f.v.owner.workspace.id
		await command(a, w, { action: 'run_weekly' })
		const t = await transfer(w)
		await command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'succeeded' })
		await claim(f)
		now = new Date(now.getTime() + 7 * 86400000)
		await fresh(a)
		const result = await command(a, w, { action: 'run_weekly' })
		expect(result.records[0].payload['amount']).toBe(0)
		const vendors = result.records[0].payload['vendors'] as { unrecoveredMinorUnits: number }[]
		expect(vendors[0].unrecoveredMinorUnits).toBe(1000)
	})
	test('Owner statements retain Vendor and Location scope and do not grant withdrawal authority', async () => {
		const f = await ready(),
			{ a } = await policy(f),
			w = f.v.owner.workspace.id
		await command(a, w, { action: 'run_weekly' })
		const t = await transfer(w)
		expect((await repository.readVendorPayouts(f.v.owner.session.id)).transfers[0]).toMatchObject({ status: 'pending', amountMinorUnits: 3500 })
		await expect(repository.readVendorPayouts(f.c.session.id)).rejects.toThrow(AccessDeniedError)
		await repository.db.vendorMembership.update({ where: { id: f.v.membership.id }, data: { locationIds: [] } })
		expect((await repository.readVendorPayouts(f.v.owner.session.id)).transfers).toEqual([])
		await expect(command(f.v.owner, w, { action: 'simulate_result', transferId: t.id, outcome: 'succeeded' })).rejects.toThrow(AccessDeniedError)
	})
	test('a revoked proposer cannot be approved and cross-workspace correction targets are denied', async () => {
		const f = await paid(),
			w = f.c.workspace.id,
			a = await finance(w),
			b = await finance(w)
		const p = await command(a, w, {
			action: 'propose_fee',
			feeKind: 'dispute',
			amountMinorUnits: 20,
			reference: randomUUID(),
			evidence: 'Controlled ordinary dispute fee.',
		})
		await repository.db.platformFinanceGrant.update({
			where: { userId_workspaceId: { userId: a.user.id, workspaceId: a.workspace.id } },
			data: { revokedAt: new Date() },
		})
		await expect(command(b, w, { action: 'approve', proposalId: p.records[0].id })).rejects.toThrow('revoked')
		await expect(
			command(b, w, { action: 'open_exception', sourceId: randomUUID(), code: 'foreign', evidence: 'Foreign transaction is inaccessible.' }),
		).rejects.toThrow(AccessDeniedError)
	})
	test('raw success without exact ledger is rejected and terminal-write failure rolls back all transfer postings', async () => {
		const f = await ready(),
			{ a } = await policy(f),
			w = f.v.owner.workspace.id
		await command(a, w, { action: 'run_weekly' })
		const t = await transfer(w)
		await expect(
			repository.db.financeRecord.create({
				data: {
					workspaceId: w,
					kind: 'transfer_terminal',
					operationKey: 'terminal:' + t.id,
					sourceId: t.id,
					createdAt: now,
					payload: { outcome: 'succeeded' },
				},
			}),
		).rejects.toThrow('exact ledger')
		await repository.db.$executeRawUnsafe(
			"CREATE FUNCTION fail_c09_terminal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='transfer_terminal' THEN RAISE EXCEPTION 'Controlled terminal write failure'; END IF; RETURN NEW; END; $$",
		)
		await repository.db.$executeRawUnsafe(
			'CREATE TRIGGER fail_c09_terminal BEFORE INSERT ON finance_records FOR EACH ROW EXECUTE FUNCTION fail_c09_terminal()',
		)
		try {
			await expect(command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'succeeded' })).rejects.toThrow('Controlled terminal')
			expect(await repository.db.ledgerTransaction.count({ where: { sourceId: t.id } })).toBe(0)
		} finally {
			await repository.db.$executeRawUnsafe('DROP TRIGGER fail_c09_terminal ON finance_records')
			await repository.db.$executeRawUnsafe('DROP FUNCTION fail_c09_terminal()')
		}
		await command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'succeeded' })
		expect(await repository.db.ledgerTransaction.count({ where: { sourceId: t.id } })).toBe(2)
	})
	test('C10 acceptance: multi-Vendor promoted mixed Purchase, partial original refund and independent weekly payouts reconcile', async () => {
		process.env['JUNCTION_GOODS_HANDOFF_SECRET'] = secret
		process.env['JUNCTION_BOOKING_ATTENDANCE_SECRET'] = secret
		const c = await customer(),
			v = await vendor(),
			second = await vendor(),
			controller = await finance(v.owner.workspace.id)
		for (const seller of [v, second])
			await repository.publishCommissionRate(controller.session.id, randomUUID(), {
				vendorId: seller.vendor.id,
				basisPoints: 1500,
				effectiveFrom: '2026-10-12T00:00:00Z',
				effectiveUntil: null,
				reason: 'Explicit C10 original 15 percent fixture.',
			})
		const promotion = await campaign(5000)
		const coupon = await repository.publishVendorCoupon(v.owner.session.id, randomUUID(), {
			definition: { ...promotion.definition, code: 'C10_' + randomUUID().slice(0, 8), rule: { kind: 'fixed', minorUnits: 50 } },
			reason: 'Original Vendor-funded C10 discount.',
		})
		const q = await prepared(c, {
			goodsGroups: [{ ...v.selection.goodsGroups[0], lines: [{ ...v.selection.goodsGroups[0].lines[0], quantity: 2 }] }, second.selection.goodsGroups[0]],
			bookings: [...v.selection.bookings, ...second.selection.bookings],
			promotions: { vendorCouponId: coupon.promotionId, platformCampaignId: promotion.promotionId },
		})
		const h = await hold(c.session.id, q.quoteId),
			p = await repository.startMixedPayment(c.session.id, randomUUID(), { holdId: h.holdId }),
			e = await event(p.paymentId)
		await Promise.all([receive(e), receive(e, other)])
		const paidResult = await repository.readMixedPayment(c.session.id, p.paymentId),
			purchase = await repository.readMixedPurchase(c.session.id, paidResult.purchaseId!)
		expect(purchase.orders).toHaveLength(2)
		expect(purchase.bookings).toHaveLength(2)
		expect(purchase.receipt.taxCalculated).toBe(false)
		expect(purchase.receipt.snapshot.promotion?.vendorDiscountMinorUnits).toBe(50)
		expect(purchase.receipt.snapshot.promotion?.platformSubsidyMinorUnits).toBe(100)
		const f = {
				c,
				v,
				purchase,
				order: purchase.orders.find((o) => o.vendorId === v.vendor.id)!,
				booking: purchase.bookings.find((b) => b.snapshot.vendorId === v.vendor.id)!,
			},
			g = {
				c,
				v: second,
				purchase,
				order: purchase.orders.find((o) => o.vendorId === second.vendor.id)!,
				booking: purchase.bookings.find((b) => b.snapshot.vendorId === second.vendor.id)!,
			}
		await goodsHandoff(f)
		await goodsHandoff(g)
		await bookingComplete(f)
		await bookingComplete(g)
		now = new Date(now.getTime() + 8 * 86400000)
		const returned = await claim(f)
		const unaffectedBefore = await repository.readVendorEarnings(g.v.owner.session.id)
		for (const input of [
			{ action: 'approve', instructions: 'Return the selected original unit.' },
			{ action: 'ship', evidence: 'The Customer shipped the original unit.' },
			{ action: 'receive', evidence: 'The original unit was received.' },
			{ action: 'inspect', evidence: 'Inspection confirms the fault.', stockDisposition: 'restock' },
			{ action: 'refund', evidence: 'Refund this original unit after inspection.' },
		])
			await repository.actOnGoodsReturn(
				input.action === 'ship' ? c.session.id : v.owner.session.id,
				randomUUID(),
				returned.returnId,
				input,
				input.action === 'ship' ? 'customer' : 'vendor',
			)
		await repository.reconcileMixedComponentRefunds()
		const frozenReceipt = (await repository.readMixedPurchase(c.session.id, purchase.purchaseId)).receipt
		expect(frozenReceipt).toEqual(purchase.receipt)
		expect((await repository.readVendorEarnings(g.v.owner.session.id)).lots).toEqual(unaffectedBefore.lots)
		const owners = [f, g]
		for (const owner of owners) {
			const { a } = await policy(owner)
			const w = owner.v.owner.workspace.id
			const expected = (await repository.readVendorEarnings(owner.v.owner.session.id)).lots.reduce((sum, l) => sum + l.amounts.available, 0)
			await command(a, w, { action: 'run_weekly' })
			const t = await transfer(w)
			expect((t.payload as { amount: number }).amount).toBe(expected)
			await command(a, w, { action: 'simulate_result', transferId: t.id, outcome: 'succeeded' })
			expect((await command(a, w, { action: 'reconcile' })).records[0].payload['matched']).toBe(true)
		}
		const customerFinance = await finance(c.workspace.id)
		expect((await command(customerFinance, c.workspace.id, { action: 'reconcile' })).records[0].payload['matched']).toBe(true)
		const unbalanced = await repository.db.$queryRaw<
			{ id: string }[]
		>`SELECT transaction_id AS id FROM ledger_postings GROUP BY transaction_id HAVING sum(minor_units)<>0`
		expect(unbalanced).toEqual([])
		expect(await repository.db.mixedPurchase.count({ where: { paymentId: p.paymentId } })).toBe(1)
	})
	test('C10 acceptance: newly affiliated Vendor proposer loses approval eligibility despite an unrevoked Finance grant', async () => {
		const f = await paid(),
			w = f.c.workspace.id,
			a = await finance(w),
			b = await finance(w)
		const p = await command(a, w, {
			action: 'propose_fee',
			feeKind: 'processor',
			amountMinorUnits: 10,
			reference: randomUUID(),
			evidence: 'Controlled fee awaiting distinct approval.',
		})
		await repository.db.vendorMembership.create({ data: { vendorId: f.v.vendor.id, userId: a.user.id, role: 'vendor_staff', locationIds: [] } })
		await expect(command(b, w, { action: 'approve', proposalId: p.records[0].id })).rejects.toThrow('Vendor affiliation')
		expect(await repository.db.ledgerTransaction.count({ where: { sourceId: p.records[0].id } })).toBe(0)
	})
})
