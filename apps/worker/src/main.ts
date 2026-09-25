import { randomUUID } from 'node:crypto'

import { PostgresFoundation } from 'platform-core'

import { WorkerRunner } from './worker-runner'

const workerId = randomUUID()
const durable = process.env['FOUNDATION_STORAGE'] === 'postgresql'
const databaseUrl = process.env['DATABASE_URL']
if (durable && !databaseUrl) throw new Error('DATABASE_URL is required.')
const repository = durable && databaseUrl ? new PostgresFoundation(databaseUrl) : undefined
const runner = new WorkerRunner(workerId)
let stopping = false
let timer: ReturnType<typeof setTimeout>
let lastMediaSweep = 0
async function tick() {
	try {
		await repository?.purgeExpiredDemoWorkspaces()
		await repository?.expirePendingVideoUploads()
		if (repository && Date.now() - lastMediaSweep >= 10 * 60 * 1000) {
			await repository.reconcileOrphanMediaObjects()
			lastMediaSweep = Date.now()
		}
		const result = repository ? await repository.processOne(workerId) : runner.processOne()
		process.stdout.write(`${JSON.stringify({ type: 'worker.heartbeat', ...result })}\n`)
	} catch {
		process.stderr.write(`${JSON.stringify({ type: 'worker.failure', retryable: true })}\n`)
	} finally {
		if (!stopping) timer = setTimeout(() => void tick(), 1000)
		else await repository?.close()
	}
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		stopping = true
		clearTimeout(timer)
		void repository?.close()
	})
process.stdout.write(`${JSON.stringify({ type: 'worker.started', runtimeMode: 'synthetic', storage: durable ? 'postgresql' : 'in-memory-test-double' })}\n`)
void tick()
