import { BookingReadSchema } from 'contracts'

const escapeText = (value: string) =>
	value.replaceAll('\\', '\\\\').replaceAll('\r\n', '\\n').replaceAll('\n', '\\n').replaceAll('\r', '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,')
const timestamp = (value: string) =>
	new Date(value)
		.toISOString()
		.replaceAll('-', '')
		.replaceAll(':', '')
		.replace(/\.\d{3}Z$/, 'Z')
/** RFC 5545 content lines are folded at 75 octets without splitting a UTF-8 codepoint. */
function fold(value: string) {
	let result = '',
		line = '',
		bytes = 0
	for (const character of value) {
		const width = Buffer.byteLength(character)
		if (bytes + width > 75) {
			result += line + '\r\n'
			line = ' '
			bytes = 1
		}
		line += character
		bytes += width
	}
	return result + line
}
export function bookingCalendar(input: unknown) {
	const booking = BookingReadSchema.parse(input),
		s = booking.snapshot
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Junction//Booking//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${booking.bookingId}@junction`,
		`DTSTAMP:${timestamp(booking.confirmedAt)}`,
		`SEQUENCE:${booking.version}`,
		`DTSTART:${timestamp(s.start)}`,
		`DTEND:${timestamp(s.end)}`,
		`SUMMARY:${escapeText(s.serviceTitle + ' — ' + s.optionLabel)}`,
		`LOCATION:${escapeText(s.mode === 'online' ? 'Online' : (s.locationLabel ?? ''))}`,
		`STATUS:${booking.state === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
		'CLASS:PRIVATE',
		'END:VEVENT',
		'END:VCALENDAR',
	]
	return lines.map(fold).join('\r\n') + '\r\n'
}
