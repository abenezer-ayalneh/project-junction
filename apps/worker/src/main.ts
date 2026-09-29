import { randomUUID } from 'node:crypto'

import { assertStagingProviderConfiguration, DiditSandboxAdapter, PostgresFoundation } from 'platform-core'
import { createClient } from 'redis'

import { RedisEventStreamAdapter } from './redis-event-stream'

const workerId = randomUUID()
assertStagingProviderConfiguration()
if (process.env['FOUNDATION_STORAGE'] !== 'postgresql') throw new Error('FOUNDATION_STORAGE=postgresql is required for the worker runtime.')
const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) throw new Error('DATABASE_URL is required.')
const staging = process.env['JUNCTION_RUNTIME_MODE'] === 'staging'
const redis = staging
	? createClient({
			url: process.env['REDIS_URL'],
			socket: { reconnectStrategy: (retries) => (retries >= 5 ? new Error('Redis is unavailable.') : Math.min(1000 * retries, 5000)) },
		})
	: undefined
redis?.on('error', () => process.stderr.write(`${JSON.stringify({ type: 'worker.redis-error' })}\n`))
const repository = new PostgresFoundation(databaseUrl, redis ? new RedisEventStreamAdapter(redis) : undefined)
const diditReady = process.env['JUNCTION_RUNTIME_MODE'] === 'staging' && process.env['DIDIT_AGE_18_WORKFLOW_CONFIRMED'] === 'true'
const didit = diditReady ? new DiditSandboxAdapter(process.env['DIDIT_API_KEY'] ?? '', process.env['DIDIT_WEBHOOK_SECRET'] ?? '') : undefined
let stopping = false
let timer: ReturnType<typeof setTimeout>
let tickRunning = false
let shutdownPromise: Promise<void> | undefined
let lastMediaSweep = 0
let lastDiditReconcile = 0
function shutdown(): Promise<void> {
	shutdownPromise ??= Promise.all([repository.close(), redis?.isOpen ? redis.quit() : Promise.resolve()]).then(() => undefined)
	return shutdownPromise
}
async function tick() {
	tickRunning = true
	try {
		if (process.env['JUNCTION_RUNTIME_MODE'] !== 'staging') await repository.purgeExpiredDemoWorkspaces()
		await repository.expirePendingVideoUploads()
		if (Date.now() - lastMediaSweep >= 10 * 60 * 1000) {
			await repository.reconcileOrphanMediaObjects()
			lastMediaSweep = Date.now()
		}
		const result = await repository.processOne(workerId)
		if (didit && Date.now() - lastDiditReconcile >= 30_000) {
			lastDiditReconcile = Date.now()
			await repository.reconcileOneDiditSession(didit)
		}
		process.stdout.write(`${JSON.stringify({ type: 'worker.heartbeat', ...result })}\n`)
	} catch {
		process.stderr.write(`${JSON.stringify({ type: 'worker.failure', retryable: true })}\n`)
	} finally {
		tickRunning = false
		if (!stopping) timer = setTimeout(() => void tick(), 1000)
		else await shutdown()
	}
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		stopping = true
		clearTimeout(timer)
		if (!tickRunning) void shutdown()
	})
void (async () => {
	if (redis) await redis.connect()
	if (stopping) return shutdown()
	process.stdout.write(`${JSON.stringify({ type: 'worker.started', runtimeMode: staging ? 'staging' : 'synthetic', storage: 'postgresql' })}\n`)
	await tick()
})().catch(() => {
	process.stderr.write(`${JSON.stringify({ type: 'worker.startup-failed' })}\n`)
	process.exitCode = 1
	void shutdown()
})
