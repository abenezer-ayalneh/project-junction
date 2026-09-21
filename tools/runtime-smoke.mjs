import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PostgresFoundation } from '../libs/platform-core/dist/index.js'
const repository = new PostgresFoundation(process.env.DATABASE_URL)
const server = createServer()
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await new Promise((resolve) => server.close(resolve))
const children = []
function start(file, extra = {}) {
	const child = spawn(process.execPath, [file], { env: { ...process.env, FOUNDATION_STORAGE: 'postgresql', ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
	let diagnostics = ''
	child.stdout.on('data', (data) => {
		diagnostics += data
	})
	child.stderr.on('data', (data) => {
		diagnostics += data
	})
	child.on('error', (error) => {
		diagnostics += error.message
	})
	children.push(child)
	return () => {
		if (child.exitCode !== null) throw new Error(`Runtime exited: ${diagnostics.slice(-2000)}`)
	}
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
try {
	const checkApi = start('apps/api/dist/main.js', { PORT: String(port) })
	const base = `http://127.0.0.1:${port}/v1`
	let ready = false
	for (let i = 0; i < 100; i++) {
		checkApi()
		try {
			const result = await fetch(`${base}/health`)
			if (result.ok) {
				const body = await result.json()
				assert.equal(body.storage, 'postgresql')
				assert.equal(body.runtimeMode, 'synthetic')
				ready = true
				break
			}
		} catch {
			/* startup */
		}
		await sleep(100)
	}
	assert(ready, 'API must become healthy')
	const denied = await fetch(`${base}/access-context`)
	assert.equal(denied.status, 403)
	assert.equal((await denied.json()).code, 'ACCESS_DENIED')
	const workspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
	const user = await repository.db.user.create({ data: { email: `${randomUUID()}@example.invalid`, verifiedAt: new Date() } })
	const session = await repository.db.session.create({ data: { userId: user.id, workspaceId: workspace.id, expiresAt: new Date(Date.now() + 3600000) } })
	const headers = { 'content-type': 'application/json', 'x-junction-session': session.id, 'idempotency-key': randomUUID() }
	const command = (body) => fetch(`${base}/foundation/audit-markers`, { method: 'POST', headers, body: JSON.stringify(body) })
	const first = await command({ marker: 'runtime smoke' })
	assert.equal(first.status, 201)
	const outcome = await first.json()
	assert.equal(outcome.replayed, false)
	assert.deepEqual(await (await command({ marker: 'runtime smoke' })).json(), { ...outcome, replayed: true })
	assert.equal((await command({ marker: 'changed' })).status, 409)
	const checkWorker = start('apps/worker/dist/main.js')
	let delivered = false
	for (let i = 0; i < 100; i++) {
		checkWorker()
		if ((await repository.db.outboxReceipt.count({ where: { workspaceId: workspace.id } })) === 1) {
			delivered = true
			break
		}
		await sleep(100)
	}
	assert(delivered, 'Separate worker must consume the API-created durable event')
	process.stdout.write('Built API/worker smoke passed: health, denial, replay, conflict, cross-process delivery.\n')
} finally {
	await Promise.all(
		children.map(
			(child) =>
				new Promise((resolve) => {
					if (child.exitCode !== null) return resolve()
					child.once('exit', resolve)
					child.kill('SIGTERM')
					const timeout = setTimeout(() => child.kill('SIGKILL'), 3000)
					timeout.unref()
				}),
		),
	)
	await repository.close()
}
