import { randomUUID } from 'node:crypto'

import { assertStagingProviderConfiguration, PostgresFoundation, SumsubSandboxAdapter } from 'platform-core'

const workerId = randomUUID()
assertStagingProviderConfiguration()
if (process.env['FOUNDATION_STORAGE'] !== 'postgresql') throw new Error('FOUNDATION_STORAGE=postgresql is required for the worker runtime.')
const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) throw new Error('DATABASE_URL is required.')
const repository = new PostgresFoundation(databaseUrl)
const sumsubReady = process.env['JUNCTION_RUNTIME_MODE'] === 'staging' && process.env['SUMSUB_AGE_18_LEVEL_CONFIRMED'] === 'true'
const sumsub = sumsubReady
	? new SumsubSandboxAdapter(process.env['SUMSUB_APP_TOKEN'] ?? '', process.env['SUMSUB_SECRET_KEY'] ?? '', process.env['SUMSUB_WEBHOOK_SECRET'] ?? '')
	: undefined
const sumsubLevel = sumsubReady ? process.env['SUMSUB_AGE_LEVEL'] : undefined
if (sumsubReady && !sumsubLevel) throw new Error('SUMSUB_AGE_LEVEL is required after the age-18 level is confirmed.')
let stopping = false
let timer: ReturnType<typeof setTimeout>
let lastMediaSweep = 0
let lastSumsubReconcile = 0
async function tick() {
	try {
		if (process.env['JUNCTION_RUNTIME_MODE'] !== 'staging') await repository.purgeExpiredDemoWorkspaces()
		await repository.expirePendingVideoUploads()
		if (Date.now() - lastMediaSweep >= 10 * 60 * 1000) {
			await repository.reconcileOrphanMediaObjects()
			lastMediaSweep = Date.now()
		}
		const result = await repository.processOne(workerId)
		if (sumsub && sumsubLevel && Date.now() - lastSumsubReconcile >= 30_000) {
			lastSumsubReconcile = Date.now()
			await repository.reconcileOneSumsubReview(sumsub, sumsubLevel)
		}
		process.stdout.write(`${JSON.stringify({ type: 'worker.heartbeat', ...result })}\n`)
	} catch {
		process.stderr.write(`${JSON.stringify({ type: 'worker.failure', retryable: true })}\n`)
	} finally {
		if (!stopping) timer = setTimeout(() => void tick(), 1000)
		else await repository.close()
	}
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		stopping = true
		clearTimeout(timer)
		void repository.close()
	})
process.stdout.write(
	`${JSON.stringify({ type: 'worker.started', runtimeMode: process.env['JUNCTION_RUNTIME_MODE'] === 'staging' ? 'staging' : 'synthetic', storage: 'postgresql' })}\n`,
)
void tick()
