import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { AccessDeniedError } from './access.js'
import { PostgresFoundation } from './postgres-foundation.js'

const execFileAsync = promisify(execFile)
const databaseUrl = process.env['DATABASE_URL']
const endpoint = process.env['MEDIA_S3_ENDPOINT']
const bucket = process.env['MEDIA_S3_BUCKET']
const region = process.env['MEDIA_S3_REGION']
const accessKeyId = process.env['MEDIA_S3_ACCESS_KEY_ID']
const secretAccessKey = process.env['MEDIA_S3_SECRET_ACCESS_KEY']
const suite =
	process.env['FOUNDATION_INTEGRATION'] === '1' &&
	databaseUrl &&
	endpoint &&
	bucket &&
	region &&
	accessKeyId &&
	secretAccessKey &&
	process.env['MEDIA_CLAMD_HOST']
		? describe
		: describe.skip

suite('Phase 01 sealed video worker path', () => {
	it('moves a scanned clip to private moderation without granting public delivery', async () => {
		if (!databaseUrl || !endpoint || !bucket || !region || !accessKeyId || !secretAccessKey)
			throw new Error('Local media integration configuration is incomplete.')
		if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Media integration requires a loopback object store.')
		const repository = new PostgresFoundation(databaseUrl, { deliver: async () => ({ duplicate: false }) })
		const client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } })
		const directory = await mkdtemp(join(tmpdir(), 'junction-media-workflow-'))
		const keys: string[] = []
		try {
			const workspace = await repository.db.workspace.create({ data: { kind: 'real' } })
			const user = await repository.db.user.create({
				data: { email: `${randomUUID()}@example.invalid`, adultVerificationState: 'verified', verifiedAt: new Date() },
			})
			const vendor = await repository.db.vendor.create({ data: { workspaceId: workspace.id, applicationState: 'approved', publishedAt: new Date() } })
			const location = await repository.db.location.create({ data: { vendorId: vendor.id } })
			await repository.db.vendorMembership.create({ data: { userId: user.id, vendorId: vendor.id, role: 'vendor_owner', locationIds: [location.id] } })
			const session = await repository.db.session.create({
				data: {
					userId: user.id,
					workspaceId: workspace.id,
					activeVendorId: vendor.id,
					activeRole: 'vendor_owner',
					expiresAt: new Date(Date.now() + 3600000),
				},
			})
			const listing = await repository.db.listing.create({
				data: {
					vendorId: vendor.id,
					kind: 'service',
					category: 'repair',
					title: 'Scanned video fixture',
					description: 'A private one-second test clip.',
					priceCents: 1200,
					durationMinutes: 30,
				},
			})
			const sourcePath = join(directory, 'clip.mp4')
			await execFileAsync(
				'ffmpeg',
				[
					'-hide_banner',
					'-nostdin',
					'-loglevel',
					'error',
					'-f',
					'lavfi',
					'-i',
					'testsrc2=size=320x180:rate=24',
					'-t',
					'1',
					'-c:v',
					'libx264',
					'-pix_fmt',
					'yuv420p',
					'-threads',
					'1',
					'-y',
					sourcePath,
				],
				{ timeout: 15_000 },
			)
			const source = await readFile(sourcePath)
			const sha256 = createHash('sha256').update(source).digest('hex')
			const intent = await repository.createVideoUploadIntent(session.id, randomUUID(), listing.id, {
				bytes: source.length,
				sha256,
				noSpeechDeclared: true,
				description: 'A silent repair demonstration.',
			})
			const uploaded = await fetch(intent.url, { method: intent.method, headers: intent.headers, body: new Uint8Array(source) })
			expect(uploaded.ok).toBe(true)
			const quarantined = await repository.completeVideoUpload(session.id, intent.mediaId, { sha256 })
			expect(quarantined.state).toBe('quarantined')
			const before = await repository.db.mediaAsset.findUniqueOrThrow({ where: { id: intent.mediaId } })
			if (!before.uploadKey || !before.sealedKey) throw new Error('Quarantine keys were not persisted.')
			keys.push(before.uploadKey, before.sealedKey)
			await repository.db.outboxEvent.updateMany({
				where: { workspaceId: workspace.id, type: 'MediaQuarantined' },
				data: { occurredAt: new Date(0) },
			})
			expect(await repository.processOne(randomUUID())).toMatchObject({ processed: true })
			const after = await repository.db.mediaAsset.findUniqueOrThrow({ where: { id: intent.mediaId } })
			await expect(repository.readPublicMedia(intent.mediaId, 'video')).rejects.toThrow(AccessDeniedError)
			expect(after.state).toBe('needs_moderation')
			expect(after.scanVerdict).toBe('clean')
			expect(after.processedAt).not.toBeNull()
			expect(after.moderatedAt).toBeNull()
			expect(after.renditionKey).toContain(intent.mediaId)
			expect(after.posterKey).toContain(intent.mediaId)
			if (!after.renditionKey || !after.posterKey) throw new Error('Processed keys were not persisted.')
			keys.push(after.renditionKey, after.posterKey)
			expect((await fetch(`${endpoint}/${bucket}/${after.renditionKey}`)).status).toBe(403)
			expect((await fetch(`${endpoint}/${bucket}/${after.posterKey}`)).status).toBe(403)
			await expect(repository.readPlatformMediaQueue(session.id, {})).rejects.toThrow(AccessDeniedError)
			const reviewerUserId = randomUUID()
			const reviewerSessionId = randomUUID()
			const reviewerEmail = `${reviewerUserId}@example.com`
			const reviewerExpiresAt = new Date(Date.now() + 3600000)
			await repository.db.user.create({ data: { id: reviewerUserId, email: reviewerEmail, adultVerificationState: 'verified', verifiedAt: new Date() } })
			const reviewerSession = await repository.db.session.create({
				data: {
					id: reviewerSessionId,
					userId: reviewerUserId,
					workspaceId: workspace.id,
					mfaVerifiedAt: new Date(),
					recentAuthAt: new Date(),
					expiresAt: reviewerExpiresAt,
				},
			})
			await repository.db.platformReviewerGrant.create({ data: { userId: reviewerUserId, grantedBy: 'integration-test' } })
			await repository.db
				.$executeRaw`INSERT INTO junction_auth."user" (id, name, email, "emailVerified") VALUES (${reviewerUserId}, ${'Media integration reviewer'}, ${reviewerEmail}, true)`
			await repository.db
				.$executeRaw`INSERT INTO junction_auth.session (id, "expiresAt", token, "updatedAt", "userId") VALUES (${reviewerSessionId}, ${reviewerExpiresAt}, ${randomUUID()}, now(), ${reviewerUserId})`
			const queue = await repository.readPlatformMediaQueue(reviewerSession.id, {})
			expect(queue.items).toMatchObject([{ id: intent.mediaId, version: after.version, captioned: false, noSpeechDeclared: true }])
			const preview = await repository.previewMediaForReview(reviewerSession.id, intent.mediaId)
			expect((await fetch(preview.videoUrl)).status).toBe(200)
			expect((await fetch(preview.posterUrl)).status).toBe(200)
			const reviewKey = randomUUID()
			const review = await repository.reviewMedia(reviewerSession.id, reviewKey, intent.mediaId, {
				decision: 'approve',
				expectedVersion: after.version,
				note: 'Silent clip and safe rendition reviewed.',
			})
			expect(review).toMatchObject({ state: 'ready', replayed: false, version: after.version + 1 })
			expect(
				await repository.reviewMedia(reviewerSession.id, reviewKey, intent.mediaId, {
					decision: 'approve',
					expectedVersion: after.version,
					note: 'Silent clip and safe rendition reviewed.',
				}),
			).toMatchObject({ state: 'ready', replayed: true })
			await expect(
				repository.reviewMedia(reviewerSession.id, randomUUID(), intent.mediaId, {
					decision: 'reject',
					expectedVersion: after.version,
					note: 'Stale decision.',
				}),
			).rejects.toThrow(AccessDeniedError)
			expect((await repository.readPlatformMediaQueue(reviewerSession.id, {})).items).toHaveLength(0)
			expect((await repository.db.mediaAsset.findUniqueOrThrow({ where: { id: intent.mediaId } })).moderatedAt).not.toBeNull()
			await expect(repository.readPublicMedia(intent.mediaId, 'video')).rejects.toThrow(AccessDeniedError)
			await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'published', publishedAt: new Date() } })
			expect((await repository.readPublicMedia(intent.mediaId, 'video')).body.subarray(4, 8).toString()).toBe('ftyp')
			expect((await repository.readPublicMedia(intent.mediaId, 'poster')).contentType).toBe('image/jpeg')
			await expect(repository.readPublicMedia(intent.mediaId, 'captions')).rejects.toThrow(AccessDeniedError)
			await repository.db.listing.update({ where: { id: listing.id }, data: { state: 'unpublished' } })
			await expect(repository.readPublicMedia(intent.mediaId, 'video')).rejects.toThrow(AccessDeniedError)
		} finally {
			await Promise.all(keys.map((Key) => client.send(new DeleteObjectCommand({ Bucket: bucket, Key })).catch(() => undefined)))
			await rm(directory, { recursive: true, force: true })
			await repository.close()
			client.destroy()
		}
	})
})
