import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import { PostgresFoundation } from '../libs/platform-core/dist/index.js'

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to an isolated Phase 00 integration schema.')

const databaseUrl = new URL(process.env.DATABASE_URL)
const schema = databaseUrl.searchParams.get('schema')
if (!schema || !/^phase00_[a-f0-9]+$/.test(schema)) throw new Error('Workspace lock measurement requires an isolated generated Phase 00 schema.')

const concurrentWrites = 16
const repository = new PostgresFoundation(databaseUrl.toString())
let fixture

function percentile(samples, value) {
	return samples[Math.min(samples.length - 1, Math.ceil(samples.length * value) - 1)]
}

try {
	const workspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
	const user = await repository.db.user.create({
		data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
	})
	const vendor = await repository.db.vendor.create({ data: { workspaceId: workspace.id } })
	const location = await repository.db.location.create({ data: { vendorId: vendor.id } })
	await repository.db.vendorMembership.create({ data: { userId: user.id, vendorId: vendor.id, role: 'vendor_owner', locationIds: [location.id] } })
	const session = await repository.db.session.create({
		data: { userId: user.id, workspaceId: workspace.id, activeVendorId: vendor.id, activeRole: 'vendor_owner', expiresAt: new Date(Date.now() + 3600000) },
	})
	fixture = { userId: user.id, workspaceId: workspace.id }

	const startedAt = performance.now()
	const samples = await Promise.all(
		Array.from({ length: concurrentWrites }, async (_, index) => {
			const started = performance.now()
			const outcome = await repository.acceptAuditMarker(session.id, randomUUID(), { marker: `lock measurement ${index}` })
			assert.equal(outcome.replayed, false)
			return performance.now() - started
		}),
	)
	const elapsed = performance.now() - startedAt
	const sorted = samples.toSorted((left, right) => left - right)
	assert.equal(await repository.db.auditLog.count({ where: { workspaceId: workspace.id, action: 'foundation.audit-marker' } }), concurrentWrites)
	assert.equal(await repository.db.outboxEvent.count({ where: { workspaceId: workspace.id } }), concurrentWrites)
	process.stdout.write(
		`Workspace lock measurement: ${concurrentWrites} distinct writes, elapsed ${elapsed.toFixed(1)}ms, p50 ${percentile(sorted, 0.5).toFixed(1)}ms, p95 ${percentile(sorted, 0.95).toFixed(1)}ms.\n`,
	)
} finally {
	if (fixture)
		await repository.db.$transaction(async (tx) => {
			await tx.auditLog.deleteMany({ where: { workspaceId: fixture.workspaceId } })
			await tx.outboxEvent.deleteMany({ where: { workspaceId: fixture.workspaceId } })
			await tx.providerInboxEvent.deleteMany({ where: { workspaceId: fixture.workspaceId } })
			await tx.idempotencyRecord.deleteMany({ where: { workspaceId: fixture.workspaceId } })
			await tx.session.deleteMany({ where: { workspaceId: fixture.workspaceId } })
			await tx.vendorMembership.deleteMany({ where: { vendor: { workspaceId: fixture.workspaceId } } })
			await tx.location.deleteMany({ where: { vendor: { workspaceId: fixture.workspaceId } } })
			await tx.vendor.deleteMany({ where: { workspaceId: fixture.workspaceId } })
			await tx.user.deleteMany({ where: { id: fixture.userId } })
			await tx.workspace.deleteMany({ where: { id: fixture.workspaceId } })
		})
	await repository.close()
}
