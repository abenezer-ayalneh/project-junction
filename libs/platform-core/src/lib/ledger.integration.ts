/* eslint-disable @typescript-eslint/no-non-null-assertion -- integration requires a loopback DATABASE_URL */
import { randomUUID } from 'node:crypto'

import { type LedgerCommand, LedgerCommandSchema, MoneySchema } from 'contracts'

import { ImmutableLedger } from './ledger.js'
import { PostgresFoundation } from './postgres-foundation.js'
const suite = process.env['FOUNDATION_INTEGRATION'] === '1' ? describe : describe.skip
suite('Phase 04 immutable ledger PostgreSQL', () => {
	let repository: PostgresFoundation
	let other: PostgresFoundation
	const ledger = new ImmutableLedger()
	let workspaceId: string
	let vendorId: string
	let locationId: string
	let command: LedgerCommand
	const post = (input = command, repo = repository) => repo.db.$transaction((tx) => ledger.post(tx, input))
	beforeAll(() => {
		repository = new PostgresFoundation(process.env['DATABASE_URL']!)
		other = new PostgresFoundation(process.env['DATABASE_URL']!)
	})
	afterAll(async () => {
		await repository.close()
		await other.close()
	})
	beforeEach(async () => {
		workspaceId = (await repository.db.workspace.create({ data: { kind: 'real' } })).id
		vendorId = (await repository.db.vendor.create({ data: { workspaceId } })).id
		locationId = (await repository.db.location.create({ data: { vendorId, label: 'Office', city: 'Test' } })).id
		command = {
			workspaceId,
			economicEventId: randomUUID(),
			sourceId: randomUUID(),
			reason: 'Controlled capture',
			postings: [
				{ account: 'processor_clearing', vendorId: null, locationId: null, componentId: null, money: { minorUnits: 1000, currency: 'ETB' } },
				{ account: 'vendor_payable', vendorId, locationId, componentId: randomUUID(), money: { minorUnits: -900, currency: 'ETB' } },
				{ account: 'platform_commission', vendorId: null, locationId: null, componentId: null, money: { minorUnits: -100, currency: 'ETB' } },
			],
		}
	})
	test('posts immutable scoped Money with atomic audit/outbox and merchant snapshot', async () => {
		const { transaction } = await post()
		expect(transaction.postings.reduce((n, p) => n + p.minorUnits, 0n)).toBe(0n)
		expect(transaction.merchantModel).toMatchObject({
			paymentMerchant: 'junction',
			contractingSeller: 'vendor',
			ordinaryProcessorFees: 'junction',
			ordinaryDisputeFees: 'junction',
		})
		expect(await repository.db.auditLog.count({ where: { workspaceId, action: 'ledger.posted' } })).toBe(1)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId, type: 'LedgerTransactionPosted' } })).toBe(1)
	})
	test('rejects unsafe/fractional amounts, unbalanced and cross-currency commands', async () => {
		for (const minorUnits of [0.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])
			expect(MoneySchema.safeParse({ minorUnits, currency: 'ETB' }).success).toBe(false)
		const bad = structuredClone(command)
		bad.postings[0].money.minorUnits++
		await expect(post(bad)).rejects.toThrow()
		const currency = structuredClone(command)
		currency.postings[0].money.currency = 'USD'
		await expect(post(currency)).rejects.toThrow()
		expect(await repository.db.ledgerTransaction.count({ where: { workspaceId } })).toBe(0)
	})
	test('uses bigint summation when intermediate sums exceed safe integers', async () => {
		const big = Number.MAX_SAFE_INTEGER
		const p = command.postings[0]
		const input = { ...command, postings: [big, big, -big, -big].map((minorUnits) => ({ ...p, money: { currency: 'USD', minorUnits } })) }
		expect(LedgerCommandSchema.safeParse(input).success).toBe(true)
		expect((await post(input)).transaction.postings.length).toBe(4)
	})
	test('concurrent same-event replay creates one transaction and rejects changed terms', async () => {
		const outcomes = await Promise.all([post(), post(command, other)])
		expect(outcomes[0].transaction.id).toBe(outcomes[1].transaction.id)
		expect(outcomes.filter((x) => x.replayed)).toHaveLength(1)
		await expect(post({ ...command, reason: 'Changed reason' })).rejects.toThrow('idempotency')
		expect(await repository.db.outboxEvent.count({ where: { workspaceId, type: 'LedgerTransactionPosted' } })).toBe(1)
	})
	test('exact reversal is once-only and compensating repost preserves original', async () => {
		const original = (await post()).transaction
		const event = randomUUID()
		const reverse = (repo = repository) => repo.db.$transaction((tx) => ledger.reverse(tx, workspaceId, original.id, event, 'Correction'))
		const reversed = await Promise.all([reverse(), reverse(other)])
		expect(reversed[0].transaction.id).toBe(reversed[1].transaction.id)
		expect(reversed[0].transaction.postings.map((p) => p.minorUnits)).toEqual(original.postings.map((p) => -p.minorUnits))
		await expect(repository.db.$transaction((tx) => ledger.reverse(tx, workspaceId, original.id, randomUUID(), 'Second reversal'))).rejects.toThrow(
			'already reversed',
		)
		await post({ ...command, economicEventId: randomUUID(), reason: 'Corrected posting' })
		expect(await repository.db.ledgerTransaction.count({ where: { workspaceId } })).toBe(3)
		expect(
			(await repository.db.ledgerTransaction.findUniqueOrThrow({ where: { id: original.id }, include: { postings: true } })).postings[0].minorUnits,
		).toBe(1000n)
	})
	test('cross-workspace Vendor, wrong Location and foreign reversal are denied', async () => {
		const foreign = await repository.db.workspace.create({ data: { kind: 'real' } })
		await expect(post({ ...command, workspaceId: foreign.id })).rejects.toThrow()
		const vendor = await repository.db.vendor.create({ data: { workspaceId } })
		const bad = structuredClone(command)
		bad.postings[1].vendorId = vendor.id
		await expect(post(bad)).rejects.toThrow()
		const original = (await post()).transaction
		await expect(repository.db.$transaction((tx) => ledger.reverse(tx, foreign.id, original.id, randomUUID(), 'Wrong scope'))).rejects.toThrow('workspace')
	})
	test('DB rejects updating, deleting, truncating and appending committed history', async () => {
		const original = (await post()).transaction
		await expect(repository.db.ledgerTransaction.update({ where: { id: original.id }, data: { reason: 'Overwrite' } })).rejects.toThrow('immutable')
		await expect(repository.db.ledgerPosting.update({ where: { id: original.postings[0].id }, data: { minorUnits: 1n } })).rejects.toThrow('immutable')
		await expect(repository.db.ledgerPosting.delete({ where: { id: original.postings[0].id } })).rejects.toThrow('immutable')
		await expect(repository.db.ledgerTransaction.delete({ where: { id: original.id } })).rejects.toThrow('immutable')
		await expect(repository.db.$executeRaw`TRUNCATE ledger_postings`).rejects.toThrow('immutable')
		await expect(
			repository.db.ledgerPosting.create({
				data: { transactionId: original.id, ordinal: 3, account: 'processor_clearing', minorUnits: 1n, currency: 'ETB' },
			}),
		).rejects.toThrow('append')
	})
	test('raw DB writes reject unbalanced, cross-currency, empty and invalid reversals', async () => {
		const original = (await post()).transaction
		for (const mode of ['unbalanced', 'currency', 'empty', 'reversal']) {
			await expect(
				repository.db.$transaction(async (tx) => {
					const t = await tx.ledgerTransaction.create({
						data: {
							workspaceId,
							economicEventId: randomUUID(),
							sourceId: randomUUID(),
							reason: 'Raw write',
							currency: 'ETB',
							requestHash: 'test',
							merchantModel: original.merchantModel!,
							reversalOf: mode === 'reversal' ? original.id : null,
						},
					})
					if (mode !== 'empty')
						await tx.ledgerPosting.createMany({
							data: [1, mode === 'unbalanced' ? -2 : -1].map((minorUnits, ordinal) => ({
								transactionId: t.id,
								ordinal,
								account: 'processor_clearing',
								currency: mode === 'currency' ? 'USD' : 'ETB',
								minorUnits: BigInt(minorUnits),
							})),
						})
				}),
			).rejects.toThrow()
		}
		expect(await repository.db.ledgerTransaction.count({ where: { workspaceId } })).toBe(1)
	})
	test('ordinary processor and dispute fees use Junction expense, preserving Vendor payable', async () => {
		const original = (await post()).transaction
		for (const account of ['platform_processor_fee_expense', 'platform_dispute_fee_expense'] as const) {
			await post({
				...command,
				economicEventId: randomUUID(),
				reason: 'Junction ordinary fee',
				postings: [
					{ ...command.postings[0], money: { minorUnits: -25, currency: 'ETB' } },
					{ ...command.postings[0], account, money: { minorUnits: 25, currency: 'ETB' } },
				],
			})
		}
		expect((await repository.db.ledgerPosting.findMany({ where: { vendorId } })).map((p) => p.minorUnits)).toEqual([-900n])
		expect(original.postings[1].minorUnits).toBe(-900n)
	})
	test('outer commerce rollback removes ledger audit and outbox atomically', async () => {
		await expect(
			repository.db.$transaction(async (tx) => {
				await ledger.post(tx, command)
				throw new Error('Commerce failed')
			}),
		).rejects.toThrow('Commerce failed')
		expect(await repository.db.ledgerTransaction.count({ where: { workspaceId } })).toBe(0)
		expect(await repository.db.auditLog.count({ where: { workspaceId } })).toBe(0)
		expect(await repository.db.outboxEvent.count({ where: { workspaceId } })).toBe(0)
	})
})
