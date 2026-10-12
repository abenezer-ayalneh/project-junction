import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
export class GoodsHandoffCodec {
	private key() {
		const secret = process.env['JUNCTION_GOODS_HANDOFF_SECRET']
		if (!secret || secret.length < 32 || secret.startsWith('replace-with-'))
			throw new Error('Configure a stable JUNCTION_GOODS_HANDOFF_SECRET of at least 32 characters before pickup readiness.')
		return createHash('sha256')
			.update('junction:goods:handoff:v1:' + secret)
			.digest()
	}
	encrypt(code: string, id: string) {
		const nonce = randomBytes(12)
		const cipher = createCipheriv('aes-256-gcm', this.key(), nonce)
		cipher.setAAD(Buffer.from(id))
		const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
		return [nonce, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
	}
	decrypt(ciphertext: string, id: string) {
		const [nonce, tag, data] = ciphertext.split('.').map((part) => Buffer.from(part, 'base64url'))
		const cipher = createDecipheriv('aes-256-gcm', this.key(), nonce)
		cipher.setAAD(Buffer.from(id))
		cipher.setAuthTag(tag)
		return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')
	}
	digest(id: string, code: string) {
		return createHash('sha256')
			.update(id + ':' + code)
			.digest('hex')
	}
}
