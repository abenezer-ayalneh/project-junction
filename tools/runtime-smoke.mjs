import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { PostgresFoundation } from '../libs/platform-core/dist/index.js'
import { io } from 'socket.io-client'
const repository = new PostgresFoundation(process.env.DATABASE_URL)
const server = createServer()
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await new Promise((resolve) => server.close(resolve))
const secondaryServer = createServer()
await new Promise((resolve) => secondaryServer.listen(0, '127.0.0.1', resolve))
const secondaryPort = secondaryServer.address().port
await new Promise((resolve) => secondaryServer.close(resolve))
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
const connectRealtime = (base, sessionId, cookie) =>
	new Promise((resolve, reject) => {
		const socket = io(base, {
			auth: { sessionId },
			transports: ['websocket'],
			forceNew: true,
			reconnection: false,
			timeout: 3000,
			extraHeaders: cookie ? { cookie } : undefined,
		})
		socket.once('connect', () => resolve(socket))
		socket.once('connect_error', (error) => {
			socket.close()
			reject(error)
		})
	})
const joinRealtime = (socket, room, cursor) =>
	new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			socket.off('room.joined', onJoined)
			reject(new Error('Realtime room response timed out.'))
		}, 3000)
		const onJoined = (result) => {
			clearTimeout(timeout)
			resolve(result)
		}
		socket.once('room.joined', onJoined)
		socket.emit('room.join', { room, ...(cursor ? { cursor } : {}) })
	})
const nextRealtimeEvent = (socket) =>
	new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			socket.off('realtime.event', onEvent)
			reject(new Error('Realtime fanout event timed out.'))
		}, 3000)
		const onEvent = (event) => {
			clearTimeout(timeout)
			resolve(event)
		}
		socket.once('realtime.event', onEvent)
	})
const waitForRealtimeDisconnect = (socket) =>
	new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			socket.off('disconnect', onDisconnect)
			reject(new Error('Realtime session revocation did not disconnect the socket.'))
		}, 3000)
		const onDisconnect = () => {
			clearTimeout(timeout)
			resolve()
		}
		socket.once('disconnect', onDisconnect)
	})
try {
	const workspace = await repository.db.workspace.create({ data: { kind: 'synthetic' } })
	const user = await repository.db.user.create({
		data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
	})
	const vendor = await repository.db.vendor.create({ data: { workspaceId: workspace.id, publicSlug: 'runtime-public-vendor', publishedAt: new Date() } })
	const location = await repository.db.location.create({ data: { vendorId: vendor.id } })
	await repository.db.vendorMembership.create({ data: { userId: user.id, vendorId: vendor.id, role: 'vendor_owner', locationIds: [location.id] } })
	const session = await repository.db.session.create({
		data: { userId: user.id, workspaceId: workspace.id, activeVendorId: vendor.id, activeRole: 'vendor_owner', expiresAt: new Date(Date.now() + 3600000) },
	})
	const webhookSecret = 'synthetic-webhook-runtime-secret'
	const checkApi = start('apps/api/dist/main.js', {
		API_PORT: String(port),
		SYNTHETIC_WEBHOOK_WORKSPACE_ID: workspace.id,
		SYNTHETIC_WEBHOOK_SECRET: webhookSecret,
		SYNTHETIC_DEMO_SESSION_SECRET: 'synthetic-demo-session-runtime-secret',
		SYNTHETIC_ACCOUNT_PROVISIONING_SECRET: 'synthetic-account-provisioning-runtime-secret',
		REALTIME_REDIS_FANOUT: 'enabled',
	})
	const base = `http://127.0.0.1:${port}/v1`
	let ready = false
	for (let i = 0; i < 100; i++) {
		checkApi()
		try {
			const requestId = randomUUID()
			const result = await fetch(`${base}/health`, { headers: { 'x-request-id': requestId } })
			if (result.ok) {
				const body = await result.json()
				assert.equal(body.storage, 'postgresql')
				assert.equal(body.runtimeMode, 'synthetic')
				assert.equal(body.requestId, requestId)
				assert.equal(result.headers.get('x-request-id'), requestId)
				assert.equal(result.headers.get('x-api-version'), 'v1')
				assert.equal(result.headers.get('x-api-lifecycle'), 'active')
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
	const publicVendors = await fetch(`${base}/public/vendors`)
	assert.equal(publicVendors.status, 200)
	const publicVendorPage = await publicVendors.json()
	assert.equal(publicVendorPage.nextCursor, null)
	assert.equal(
		publicVendorPage.items.some((item) => item.id === vendor.id && item.slug === 'runtime-public-vendor'),
		true,
	)
	const headers = { 'content-type': 'application/json', 'x-junction-session': session.id, 'idempotency-key': randomUUID() }
	assert.equal(
		(
			await fetch(`${base}/synthetic/accounts`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified' }),
			})
		).status,
		403,
	)
	const provisionedAccount = await fetch(`${base}/synthetic/accounts`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-synthetic-provisioning-secret': 'synthetic-account-provisioning-runtime-secret' },
		body: JSON.stringify({ email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified' }),
	})
	assert.equal(provisionedAccount.status, 201)
	const account = await provisionedAccount.json()
	const staffGrant = await fetch(`${base}/foundation/staff`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ userId: account.id, locationIds: [location.id] }),
	})
	assert.equal(staffGrant.status, 201)
	const staff = await staffGrant.json()
	assert.equal((await fetch(`${base}/foundation/locations/${location.id}`, { headers: { 'x-junction-session': staff.sessionId } })).status, 200)
	const staffRealtime = await connectRealtime(`http://127.0.0.1:${port}`, staff.sessionId)
	assert.equal((await joinRealtime(staffRealtime, { kind: 'workspace', workspaceId: workspace.id })).joined, true)
	const staffDisconnected = waitForRealtimeDisconnect(staffRealtime)
	assert.equal((await fetch(`${base}/foundation/staff/${staff.staffId}`, { method: 'DELETE', headers })).status, 200)
	await staffDisconnected
	assert.equal((await fetch(`${base}/access-context`, { headers: { 'x-junction-session': staff.sessionId } })).status, 403)
	const command = (body) => fetch(`${base}/foundation/audit-markers`, { method: 'POST', headers, body: JSON.stringify(body) })
	const first = await command({ marker: 'runtime smoke' })
	assert.equal(first.status, 201)
	const outcome = await first.json()
	assert.equal(outcome.replayed, false)
	assert.deepEqual(await (await command({ marker: 'runtime smoke' })).json(), { ...outcome, replayed: true })
	assert.equal((await command({ marker: 'changed' })).status, 409)
	const elevated = (key) =>
		fetch(`${base}/foundation/elevated-audit-markers`, {
			method: 'POST',
			headers: { ...headers, 'idempotency-key': key },
			body: JSON.stringify({ marker: 'runtime elevation' }),
		})
	assert.equal((await elevated(randomUUID())).status, 403)
	await repository.db.session.update({ where: { id: session.id }, data: { mfaVerifiedAt: new Date(), recentAuthAt: new Date() } })
	assert.equal((await elevated(randomUUID())).status, 201)
	const providerReference = `payment-intent-${randomUUID()}`
	const webhook = (eventId, body) => {
		const rawBody = JSON.stringify(body)
		return fetch(`${base}/webhooks/fake-payment`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-provider-event-id': eventId,
				'x-provider-signature': `sha256=${createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`,
			},
			body: rawBody,
		})
	}
	const timeoutEventId = randomUUID()
	assert.equal((await webhook(timeoutEventId, { providerReference, outcome: 'timed_out' })).status, 201)
	assert.equal((await webhook(randomUUID(), { providerReference, outcome: 'confirmed' })).status, 201)
	const timeout = await repository.db.providerInboxEvent.findUniqueOrThrow({
		where: { provider_providerEventId: { provider: 'fake-payment', providerEventId: timeoutEventId } },
	})
	assert.equal(timeout.reconciliationState, 'reconciled')
	assert.notEqual(timeout.reconciledAt, null)
	assert.equal((await fetch(`${base}/foundation/locations/${location.id}`, { headers })).status, 200)
	await assert.rejects(() => connectRealtime(`http://127.0.0.1:${port}`, undefined))
	const realtime = await connectRealtime(`http://127.0.0.1:${port}`, session.id)
	const joinedRealtime = await joinRealtime(realtime, { kind: 'workspace', workspaceId: workspace.id })
	assert.equal(joinedRealtime.joined, true)
	assert.equal(joinedRealtime.room.workspaceId, workspace.id)
	assert.notEqual(joinedRealtime.cursor, null)
	assert.equal(joinedRealtime.restRefetchRequired, false)
	const checkSecondaryApi = start('apps/api/dist/main.js', {
		API_PORT: String(secondaryPort),
		SYNTHETIC_WEBHOOK_WORKSPACE_ID: workspace.id,
		SYNTHETIC_WEBHOOK_SECRET: webhookSecret,
		SYNTHETIC_DEMO_SESSION_SECRET: 'synthetic-demo-session-runtime-secret',
		SYNTHETIC_ACCOUNT_PROVISIONING_SECRET: 'synthetic-account-provisioning-runtime-secret',
		REALTIME_REDIS_FANOUT: 'enabled',
	})
	let secondaryReady = false
	for (let i = 0; i < 100; i++) {
		checkSecondaryApi()
		try {
			if ((await fetch(`http://127.0.0.1:${secondaryPort}/v1/health`)).ok) {
				secondaryReady = true
				break
			}
		} catch {
			/* startup */
		}
		await sleep(100)
	}
	assert(secondaryReady, 'Secondary API must become healthy')
	const secondaryRealtime = await connectRealtime(`http://127.0.0.1:${secondaryPort}`, session.id)
	assert.equal((await joinRealtime(secondaryRealtime, { kind: 'workspace', workspaceId: workspace.id })).joined, true)
	const fanoutEvents = [nextRealtimeEvent(realtime), nextRealtimeEvent(secondaryRealtime)]
	assert.equal(
		(
			await fetch(`${base}/foundation/audit-markers`, {
				method: 'POST',
				headers: { ...headers, 'idempotency-key': randomUUID() },
				body: JSON.stringify({ marker: 'fanout smoke' }),
			})
		).status,
		201,
	)
	const [firstFanout, secondFanout] = await Promise.all(fanoutEvents)
	for (const event of [firstFanout, secondFanout]) {
		assert.equal(event.type, 'FoundationCommandAccepted')
		assert.equal(event.schemaVersion, 1)
		assert.equal(event.scope.workspaceId, workspace.id)
		assert.deepEqual(event.payload, {})
	}
	const refreshedCursor = await joinRealtime(realtime, { kind: 'workspace', workspaceId: workspace.id }, joinedRealtime.cursor)
	assert.equal(refreshedCursor.restRefetchRequired, false)
	assert.deepEqual(refreshedCursor.events, [firstFanout])
	const sameCursor = await joinRealtime(realtime, { kind: 'workspace', workspaceId: workspace.id }, refreshedCursor.cursor)
	assert.equal(sameCursor.restRefetchRequired, false)
	assert.deepEqual(sameCursor.events, [])
	assert.equal((await webhook(randomUUID(), { providerReference: `realtime-${randomUUID()}`, outcome: 'confirmed' })).status, 201)
	const staleCursor = await joinRealtime(realtime, { kind: 'workspace', workspaceId: workspace.id }, joinedRealtime.cursor)
	assert.equal(staleCursor.restRefetchRequired, false)
	assert.equal(
		staleCursor.events.some((event) => event.type === 'ProviderCallbackReceived'),
		true,
	)
	assert.deepEqual(await joinRealtime(realtime, { kind: 'workspace', workspaceId: randomUUID() }), { joined: false })
	await repository.db.vendorMembership.update({ where: { userId_vendorId: { userId: user.id, vendorId: vendor.id } }, data: { revokedAt: new Date() } })
	assert.deepEqual(await joinRealtime(realtime, { kind: 'location', workspaceId: workspace.id, vendorId: vendor.id, locationId: location.id }), {
		joined: false,
	})
	secondaryRealtime.close()
	realtime.close()
	assert.equal((await fetch(`${base}/foundation/locations/${location.id}`, { headers })).status, 403)
	const demoCreated = await fetch(`${base}/demo/workspaces`, { method: 'POST' })
	assert.equal(demoCreated.status, 201)
	const demoCookie = demoCreated.headers.get('set-cookie')?.split(';')[0]
	assert(demoCookie, 'Demo creation must set a signed browser session cookie')
	const demo = await demoCreated.json()
	assert.equal(demo.personas.length, 7)
	const demoHeaders = { cookie: demoCookie }
	const ownerContext = await fetch(`${base}/access-context`, { headers: demoHeaders })
	assert.equal(ownerContext.status, 200)
	const owner = await ownerContext.json()
	assert.equal(owner.actor.kind, 'demo_persona')
	assert.equal(owner.activeVendorId !== null, true)
	const revokedDemoRealtime = await connectRealtime(`http://127.0.0.1:${secondaryPort}`, undefined, demoCookie)
	assert.equal((await joinRealtime(revokedDemoRealtime, { kind: 'workspace', workspaceId: demo.id })).joined, true)
	const oldDemoSessionDisconnected = waitForRealtimeDisconnect(revokedDemoRealtime)
	const customerResponse = await fetch(`${base}/demo/workspaces/${demo.id}/personas/customer/sessions`, { method: 'POST', headers: demoHeaders })
	assert.equal(customerResponse.status, 201)
	await oldDemoSessionDisconnected
	const customerCookie = customerResponse.headers.get('set-cookie')?.split(';')[0]
	assert(customerCookie, 'Demo persona switching must rotate the signed browser session cookie')
	const customer = await customerResponse.json()
	assert.equal((await fetch(`${base}/access-context`, { headers: demoHeaders })).status, 403)
	const customerHeaders = { cookie: customerCookie }
	const customerContext = await fetch(`${base}/access-context`, { headers: customerHeaders })
	assert.equal(customerContext.status, 200)
	assert.equal((await customerContext.json()).activeVendorId, null)
	assert.equal((await fetch(`${base}/foundation/locations/${owner.locationIds[0]}`, { headers: customerHeaders })).status, 403)
	const demoRealtime = await connectRealtime(`http://127.0.0.1:${port}`, undefined, customerCookie)
	const joinedDemoRealtime = await joinRealtime(demoRealtime, { kind: 'workspace', workspaceId: demo.id })
	assert.equal(joinedDemoRealtime.joined, true)
	assert.equal(joinedDemoRealtime.room.workspaceId, demo.id)
	assert.equal(joinedDemoRealtime.cursor, null)
	assert.equal(joinedDemoRealtime.restRefetchRequired, false)
	demoRealtime.close()
	const checkWorker = start('apps/worker/dist/main.js')
	let delivered = false
	for (let i = 0; i < 100; i++) {
		checkWorker()
		if ((await repository.db.outboxReceipt.count({ where: { workspaceId: workspace.id } })) >= 1) {
			delivered = true
			break
		}
		await sleep(100)
	}
	assert(delivered, 'Separate worker must consume the API-created durable event')
	process.stdout.write(
		'Built API/worker smoke passed: health/request correlation, public Vendor browse, local-only synthetic account provisioning and Staff session grant/revocation, denial, replay, conflict, MFA/recent-auth elevation, injected fake-provider callback reconciliation, Redis fanout with per-socket scope revalidation, scoped realtime cursor reconciliation, signed demo cookie transport, cross-process revoked-session disconnect, scoped demo switching, cross-process delivery.\n',
	)
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
