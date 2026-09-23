import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { PostgresFoundation } from '../libs/platform-core/dist/index.js'

const legacyRef = process.env.PHASE00_LEGACY_REF ?? '000fa8c'
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to an isolated Phase 00 integration schema.')

const databaseUrl = new URL(process.env.DATABASE_URL)
const schema = databaseUrl.searchParams.get('schema')
if (!schema || !/^phase00_[a-f0-9]+$/.test(schema)) throw new Error('Rollback compatibility requires an isolated generated Phase 00 schema.')

function run(command, args, options = {}) {
	const result = spawnSync(command, args, { stdio: 'inherit', ...options })
	if (result.status !== 0) throw new Error(`${command} failed during rollback compatibility verification.`)
}

function succeeds(command, args) {
	return spawnSync(command, args, { stdio: 'ignore' }).status === 0
}

const worktree = await mkdtemp(join(tmpdir(), 'project-junction-phase00-rollback-'))
const current = new PostgresFoundation(databaseUrl.toString())
let worktreeCreated = false
let fixture

try {
	if (!succeeds('git', ['merge-base', '--is-ancestor', legacyRef, 'HEAD'])) throw new Error('PHASE00_LEGACY_REF must be an ancestor of the current checkout.')
	run('git', ['worktree', 'add', '--detach', worktree, legacyRef])
	worktreeCreated = true
	await Promise.all([
		symlink(resolve('node_modules'), join(worktree, 'node_modules')),
		symlink(resolve('libs/contracts/node_modules'), join(worktree, 'libs/contracts/node_modules')),
		symlink(resolve('libs/platform-core/node_modules'), join(worktree, 'libs/platform-core/node_modules')),
	])
	run('pnpm', ['nx', 'run', 'platform-core:build'], { cwd: worktree })

	const legacyModule = await import(pathToFileURL(join(worktree, 'libs/platform-core/dist/index.js')).href)
	const legacy = new legacyModule.PostgresFoundation(databaseUrl.toString())
	try {
		const workspace = await current.db.workspace.create({ data: { kind: 'synthetic' } })
		const user = await current.db.user.create({
			data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
		})
		const vendor = await current.db.vendor.create({ data: { workspaceId: workspace.id } })
		const location = await current.db.location.create({ data: { vendorId: vendor.id } })
		await current.db.vendorMembership.create({ data: { userId: user.id, vendorId: vendor.id, role: 'vendor_owner', locationIds: [location.id] } })
		const session = await current.db.session.create({
			data: {
				userId: user.id,
				workspaceId: workspace.id,
				activeVendorId: vendor.id,
				activeRole: 'vendor_owner',
				expiresAt: new Date(Date.now() + 3600000),
			},
		})
		fixture = { userId: user.id, workspaceId: workspace.id }

		await expectLegacyFoundation(legacy, session.id, workspace.id)
	} finally {
		await legacy.close()
	}
	process.stdout.write(`Legacy ${legacyRef} foundation rollback compatibility passed against the current migrated schema.\n`)
} finally {
	if (fixture)
		await current.db.$transaction(async (tx) => {
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
	await current.close()
	if (worktreeCreated) run('git', ['worktree', 'remove', '--force', worktree])
	else run('rmdir', [worktree])
}

async function expectLegacyFoundation(legacy, sessionId, workspaceId) {
	const context = await legacy.accessContext(sessionId)
	assert.deepEqual(context.actor, { kind: 'user', userId: context.actor.userId })
	assert.equal(context.workspaceId, workspaceId)
	const outcome = await legacy.acceptAuditMarker(sessionId, randomUUID(), { marker: 'legacy rollback compatibility' })
	assert.equal(outcome.status, 'accepted')
	assert.equal(outcome.replayed, false)
}
