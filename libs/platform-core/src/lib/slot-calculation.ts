import type { ScheduleCalendar, ServiceSchedulingRules } from 'contracts'

const minute = 60_000
export interface OccupiedInterval {
	startAt: Date
	endAt: Date
}
export interface SlotCandidateStaff {
	calendar: ScheduleCalendar
	allocations: OccupiedInterval[]
}
export interface SlotCalculation {
	from: Date
	to: Date
	now: Date
	rules: ServiceSchedulingRules
	timezone: string
	durationMinutes: number
	bufferBeforeMinutes: number
	bufferAfterMinutes: number
	locationCalendar?: ScheduleCalendar
	staff: SlotCandidateStaff[]
}

/** Scan real UTC minutes: DST gaps never exist; repeated wall-clock times retain distinct instants.
 * All windows and occupied intervals are half-open. Duration/buffers are elapsed minutes.
 */
export function calculateSlots(input: SlotCalculation): Array<{ start: string; end: string }> {
	const firstStart = Math.ceil(Math.max(input.from.getTime(), input.now.getTime() + input.rules.leadTimeMinutes * minute) / minute) * minute
	const lastStartExclusive = Math.min(input.to.getTime(), input.now.getTime() + input.rules.horizonDays * 86400000 + 1)
	if (firstStart >= lastStartExclusive || !input.staff.length) return []
	const scanStart = firstStart - input.bufferBeforeMinutes * minute
	const scanEnd = Math.ceil(lastStartExclusive / minute) * minute + (input.durationMinutes + input.bufferAfterMinutes) * minute
	const count = (scanEnd - scanStart) / minute
	const formatters = new Map<string, Intl.DateTimeFormat>()
	const localCache = new Map<string, { date: string; weekday: number; minute: number }[]>()
	function localTimes(timezone: string) {
		const cached = localCache.get(timezone)
		if (cached) return cached
		const formatter =
			formatters.get(timezone) ??
			new Intl.DateTimeFormat('en-CA', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23',
			})
		formatters.set(timezone, formatter)
		const result = Array.from({ length: count }, (_, index) => {
			const parts = Object.fromEntries(formatter.formatToParts(new Date(scanStart + index * minute)).map((part) => [part.type, part.value]))
			const date = `${parts['year']}-${parts['month']}-${parts['day']}`
			return { date, weekday: new Date(`${date}T00:00:00Z`).getUTCDay(), minute: Number(parts['hour']) * 60 + Number(parts['minute']) }
		})
		localCache.set(timezone, result)
		return result
	}
	function openMinutes(calendar: ScheduleCalendar) {
		const weekly = new Map(calendar.weekly.map((day) => [day.weekday, day]))
		const exceptions = new Map(calendar.exceptions.map((day) => [day.date, day]))
		return localTimes(calendar.timezone).map((local) => {
			const day = exceptions.get(local.date) ?? weekly.get(local.weekday)
			return Boolean(
				day &&
				day.hours.some((window) => local.minute >= window.startMinute && local.minute < window.endMinute) &&
				!day.breaks.some((window) => local.minute >= window.startMinute && local.minute < window.endMinute),
			)
		})
	}
	const location = input.locationCalendar && openMinutes(input.locationCalendar)
	const grid = localTimes(input.timezone)
	const candidates: number[] = []
	for (let start = firstStart; start < lastStartExclusive; start += minute)
		if (grid[(start - scanStart) / minute].minute % input.rules.slotIntervalMinutes === 0) candidates.push(start)
	const starts = new Set<number>()
	for (const staff of input.staff) {
		if (starts.size === candidates.length) break
		const open = openMinutes(staff.calendar)
		// Prefix sums answer complete elapsed-duration and buffer containment in constant time.
		const closed = new Uint32Array(count + 1)
		for (let index = 0; index < count; index++) closed[index + 1] = closed[index] + (open[index] && (!location || location[index]) ? 0 : 1)
		for (const start of candidates) {
			if (starts.has(start)) continue
			const allocationStart = start - input.bufferBeforeMinutes * minute
			const allocationEnd = start + (input.durationMinutes + input.bufferAfterMinutes) * minute
			const beginIndex = (allocationStart - scanStart) / minute
			const endIndex = (allocationEnd - scanStart) / minute
			if (closed[endIndex] !== closed[beginIndex]) continue
			if (staff.allocations.some((allocation) => allocation.startAt.getTime() < allocationEnd && allocation.endAt.getTime() > allocationStart)) continue
			starts.add(start)
		}
	}
	return [...starts]
		.sort((a, b) => a - b)
		.map((start) => ({ start: new Date(start).toISOString(), end: new Date(start + input.durationMinutes * minute).toISOString() }))
}
