import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	ListObjectVersionsCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import { type MediaDeletionEntry, MediaDeletionEntrySchema as entrySchema } from 'contracts'

const prefix = 'rejected-media-v1/'
export type { MediaDeletionEntry } from 'contracts'
export interface DeletionJournal {
	record(entry: MediaDeletionEntry): Promise<void>
	get(mediaId: string): Promise<MediaDeletionEntry | undefined>
	entries(): AsyncIterable<MediaDeletionEntry>
}

function status(error: unknown) {
	return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
}

/** Independent of database recovery points. Never rotate this bucket with media copies. */
export class S3DeletionJournal implements DeletionJournal {
	constructor(
		private readonly client: S3Client,
		private readonly bucket: string,
	) {}

	static fromEnvironment(env: NodeJS.ProcessEnv = process.env) {
		const bucket = env['MEDIA_DELETION_JOURNAL_BUCKET']
		const mediaEndpoint = env['MEDIA_S3_ENDPOINT']
		const local = mediaEndpoint && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(mediaEndpoint).hostname)
		const endpoint = env['MEDIA_DELETION_JOURNAL_ENDPOINT'] ?? (local ? mediaEndpoint : undefined)
		const region = env['MEDIA_DELETION_JOURNAL_REGION'] ?? (local ? env['MEDIA_S3_REGION'] : undefined)
		const accessKeyId = env['MEDIA_DELETION_JOURNAL_ACCESS_KEY_ID'] ?? (local ? env['MEDIA_S3_ACCESS_KEY_ID'] : undefined)
		const secretAccessKey = env['MEDIA_DELETION_JOURNAL_SECRET_ACCESS_KEY'] ?? (local ? env['MEDIA_S3_SECRET_ACCESS_KEY'] : undefined)
		if (!bucket || !endpoint || !region || !accessKeyId || !secretAccessKey) return undefined
		if (bucket === env['MEDIA_S3_BUCKET']) throw new Error('Deletion journal must use a separate bucket.')
		return new S3DeletionJournal(new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } }), bucket)
	}

	async get(mediaId: string) {
		if (!/^[0-9a-f-]{36}$/i.test(mediaId)) throw new Error('Invalid media ID.')
		try {
			const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: `${prefix}${mediaId}.json` }))
			if (!object.Body || !object.ContentLength || object.ContentLength > 16384) throw new Error('Invalid deletion journal object.')
			const entry = entrySchema.parse(JSON.parse(await object.Body.transformToString()))
			if (entry.mediaId !== mediaId) throw new Error('Deletion journal key mismatch.')
			return entry
		} catch (error) {
			if (status(error) === 404) return undefined
			throw error
		}
	}

	async record(input: MediaDeletionEntry) {
		const entry = entrySchema.parse(input)
		try {
			await this.client.send(
				new PutObjectCommand({
					Bucket: this.bucket,
					Key: `${prefix}${entry.mediaId}.json`,
					Body: JSON.stringify(entry),
					ContentType: 'application/json',
					IfNoneMatch: '*',
				}),
			)
		} catch (error) {
			if (status(error) !== 412) throw error
			const existing = await this.get(entry.mediaId)
			// A retry may have a later clock but cannot change deletion scope.
			if (
				!existing ||
				existing.workspaceId !== entry.workspaceId ||
				existing.policy !== entry.policy ||
				JSON.stringify([...existing.keys].sort()) !== JSON.stringify([...entry.keys].sort())
			)
				throw new Error('Deletion journal scope conflict.')
		}
	}

	async *entries() {
		let token: string | undefined
		do {
			const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }))
			for (const object of page.Contents ?? []) {
				if (!object.Key) throw new Error('Invalid deletion journal listing.')
				const id = object.Key.slice(prefix.length).replace(/\.json$/, '')
				const entry = await this.get(id)
				if (!entry) throw new Error('Deletion journal changed during reconciliation.')
				yield entry
			}
			token = page.IsTruncated ? page.NextContinuationToken : undefined
		} while (token)
	}
}

/** Removes every version, including delete markers. Locked versions fail closed. */
export async function purgeObjectVersions(client: S3Client, bucket: string, key: string) {
	let deletedVersions = 0
	let keyMarker: string | undefined
	let versionMarker: string | undefined
	const versions: { Key: string; VersionId?: string }[] = []
	do {
		const page = await client.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key, KeyMarker: keyMarker, VersionIdMarker: versionMarker }))
		for (const object of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])])
			if (object.Key === key) versions.push({ Key: key, VersionId: object.VersionId })
		keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
		versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined
	} while (keyMarker)
	for (const version of versions) {
		await client.send(new DeleteObjectCommand({ Bucket: bucket, ...version }))
		deletedVersions++
	}
	// Also handles unversioned stores. No governance-lock bypass is permitted.
	await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
	const remaining = await client.send(new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key }))
	// A delete on versioned storage creates a new marker: remove it as well.
	for (const marker of remaining.DeleteMarkers ?? [])
		if (marker.Key === key) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key, VersionId: marker.VersionId }))
	if ((remaining.Versions ?? []).some((object) => object.Key === key)) throw new Error('Media copy retains a deleted object version.')
	try {
		await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
		throw new Error('Media copy deletion verification failed.')
	} catch (error) {
		if (status(error) !== 404) throw error
	}
	return deletedVersions
}

export async function purgeMediaCopy(client: S3Client, bucket: string, journal: DeletionJournal) {
	let deletedVersions = 0
	for await (const entry of journal.entries()) {
		const keys = new Set(entry.keys)
		// Older transcodes can use different content hashes for this same asset.
		let keyMarker: string | undefined
		let versionMarker: string | undefined
		do {
			const page = await client.send(
				new ListObjectVersionsCommand({
					Bucket: bucket,
					Prefix: `private/processed/${entry.mediaId}/`,
					KeyMarker: keyMarker,
					VersionIdMarker: versionMarker,
				}),
			)
			for (const object of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) if (object.Key) keys.add(object.Key)
			keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
			versionMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined
		} while (keyMarker)
		for (const key of keys) deletedVersions += await purgeObjectVersions(client, bucket, key)
	}
	return { deletedVersions }
}
