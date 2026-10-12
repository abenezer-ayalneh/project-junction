import { createHmac, timingSafeEqual } from 'node:crypto'

export class BookingAttendanceCodec {
	code(binding: string, nonce: string) {
		const secret = process.env['JUNCTION_BOOKING_ATTENDANCE_SECRET']
		if (!secret || secret.length < 32 || secret.startsWith('replace-with-'))
			throw new Error('Configure a stable JUNCTION_BOOKING_ATTENDANCE_SECRET before attendance verification.')
		const digest = createHmac('sha256', secret).update(`junction:booking:attendance:v1:${binding}:${nonce}`).digest()
		return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0')
	}
	matches(expected: string, submitted: string) {
		return /^\d{6}$/.test(submitted) && timingSafeEqual(Buffer.from(expected), Buffer.from(submitted))
	}
}
