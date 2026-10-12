import { type ScheduleCalendar, ScheduleCalendarSchema, ServiceSlotSelectionSchema, StaffScheduleSchema } from 'contracts'

import { calculateSlots, type SlotCalculation } from './slot-calculation.js'

const allDay = (timezone = 'UTC'): ScheduleCalendar => ({
	timezone,
	weekly: Array.from({ length: 7 }, (_, weekday) => ({ weekday, hours: [{ startMinute: 0, endMinute: 1440 }], breaks: [] })),
	exceptions: [],
})
const calendar = (start = 540, end = 1020, timezone = 'UTC'): ScheduleCalendar => ({
	timezone,
	weekly: [{ weekday: 1, hours: [{ startMinute: start, endMinute: end }], breaks: [] }],
	exceptions: [],
})
const base = (overrides: Partial<SlotCalculation> = {}): SlotCalculation => ({
	from: new Date('2026-10-12T00:00:00Z'),
	to: new Date('2026-10-13T00:00:00Z'),
	now: new Date('2026-10-11T00:00:00Z'),
	rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 10, slotIntervalMinutes: 15 },
	timezone: 'UTC',
	durationMinutes: 30,
	bufferBeforeMinutes: 0,
	bufferAfterMinutes: 0,
	staff: [{ calendar: calendar(), allocations: [] }],
	...overrides,
})
const starts = (input: SlotCalculation) => calculateSlots(input).map((slot) => slot.start)

describe('authoritative Service slot calculation', () => {
	it('fits exact half-open hours and both buffers without treating adjacent time as overlap', () => {
		const input = base({ bufferBeforeMinutes: 5, bufferAfterMinutes: 10 })
		const result = calculateSlots(input)
		expect(result[0]).toEqual({ start: '2026-10-12T09:15:00.000Z', end: '2026-10-12T09:45:00.000Z' })
		expect(result.at(-1)?.start).toBe('2026-10-12T16:15:00.000Z')
		expect(starts(base())).toContain('2026-10-12T16:30:00.000Z')
	})
	it('intersects Location and Staff hours and subtracts both sets of breaks', () => {
		const staff = calendar()
		staff.weekly[0].breaks = [{ startMinute: 600, endMinute: 630 }]
		const location = calendar(570, 690)
		location.weekly[0].breaks = [{ startMinute: 660, endMinute: 675 }]
		expect(starts(base({ locationCalendar: location, staff: [{ calendar: staff, allocations: [] }] }))).toEqual([
			'2026-10-12T09:30:00.000Z',
			'2026-10-12T10:30:00.000Z',
		])
	})
	it('date exceptions replace weekly hours and breaks, including closure and one-off opening', () => {
		const staff = calendar()
		staff.exceptions = [{ date: '2026-10-12', hours: [], breaks: [] }]
		expect(calculateSlots(base({ staff: [{ calendar: staff, allocations: [] }] }))).toEqual([])
		staff.exceptions = [{ date: '2026-10-12', hours: [{ startMinute: 1080, endMinute: 1140 }], breaks: [] }]
		expect(starts(base({ staff: [{ calendar: staff, allocations: [] }] }))).toEqual([
			'2026-10-12T18:00:00.000Z',
			'2026-10-12T18:15:00.000Z',
			'2026-10-12T18:30:00.000Z',
		])
		const location = calendar()
		location.exceptions = [{ date: '2026-10-12', hours: [], breaks: [] }]
		expect(calculateSlots(base({ locationCalendar: location }))).toEqual([])
	})
	it('enforces exact lead-time and inclusive elapsed horizon boundaries with an exclusive query end', () => {
		const input = base({
			now: new Date('2026-10-12T09:00:00Z'),
			rules: { timezone: 'UTC', leadTimeMinutes: 60, horizonDays: 1, slotIntervalMinutes: 15 },
			staff: [{ calendar: allDay(), allocations: [] }],
			to: new Date('2026-10-13T12:00:00Z'),
		})
		expect(starts(input)[0]).toBe('2026-10-12T10:00:00.000Z')
		expect(starts(input).at(-1)).toBe('2026-10-13T09:00:00.000Z')
		expect(starts({ ...input, now: new Date('2026-10-12T09:00:00.001Z') })[0]).toBe('2026-10-12T10:15:00.000Z')
		expect(starts({ ...input, to: new Date('2026-10-12T10:15:00Z') })).toEqual(['2026-10-12T10:00:00.000Z'])
	})
	it('subtracts occupied Staff intervals including buffers, while allowing exact adjacency', () => {
		const input = base({
			bufferBeforeMinutes: 5,
			bufferAfterMinutes: 10,
			staff: [{ calendar: calendar(), allocations: [{ startAt: new Date('2026-10-12T10:00:00Z'), endAt: new Date('2026-10-12T11:00:00Z') }] }],
		})
		const result = starts(input)
		expect(result).toContain('2026-10-12T09:15:00.000Z')
		expect(result).not.toContain('2026-10-12T09:30:00.000Z')
		expect(result).not.toContain('2026-10-12T11:00:00.000Z')
		expect(result).toContain('2026-10-12T11:15:00.000Z')
	})
	it('unions any-qualified availability without duplicate slots or Staff identifiers', () => {
		const input = base({
			staff: [
				{ calendar: calendar(540, 600), allocations: [] },
				{ calendar: calendar(570, 630), allocations: [] },
			],
		})
		const result = calculateSlots(input)
		expect(result).toHaveLength(5)
		expect(result.every((slot) => Object.keys(slot).join(',') === 'start,end')).toBe(true)
		expect(calculateSlots({ ...input, staff: [] })).toEqual([])
	})
	it('uses a non-hour timezone offset and the local slot grid', () => {
		const input = base({
			timezone: 'Asia/Kathmandu',
			staff: [{ calendar: calendar(540, 600, 'Asia/Kathmandu'), allocations: [] }],
			rules: { timezone: 'Asia/Kathmandu', leadTimeMinutes: 0, horizonDays: 10, slotIntervalMinutes: 30 },
		})
		expect(starts(input)).toEqual(['2026-10-12T03:15:00.000Z', '2026-10-12T03:45:00.000Z'])
	})
	it('spring-forward produces no nonexistent local times and uses elapsed duration through the gap', () => {
		const spring: ScheduleCalendar = {
			timezone: 'America/New_York',
			weekly: [{ weekday: 0, hours: [{ startMinute: 60, endMinute: 240 }], breaks: [] }],
			exceptions: [],
		}
		const input = base({
			from: new Date('2027-03-14T00:00:00Z'),
			to: new Date('2027-03-15T00:00:00Z'),
			now: new Date('2027-03-13T00:00:00Z'),
			timezone: 'America/New_York',
			rules: { timezone: 'America/New_York', leadTimeMinutes: 0, horizonDays: 10, slotIntervalMinutes: 30 },
			staff: [{ calendar: spring, allocations: [] }],
		})
		expect(calculateSlots(input)).toEqual([
			{ start: '2027-03-14T06:00:00.000Z', end: '2027-03-14T06:30:00.000Z' },
			{ start: '2027-03-14T06:30:00.000Z', end: '2027-03-14T07:00:00.000Z' },
			{ start: '2027-03-14T07:00:00.000Z', end: '2027-03-14T07:30:00.000Z' },
			{ start: '2027-03-14T07:30:00.000Z', end: '2027-03-14T08:00:00.000Z' },
		])
	})
	it('fall-back preserves both repeated local times as distinct UTC slots and closes repeated breaks', () => {
		const fall: ScheduleCalendar = {
			timezone: 'America/New_York',
			weekly: [{ weekday: 0, hours: [{ startMinute: 60, endMinute: 120 }], breaks: [] }],
			exceptions: [],
		}
		const input = base({
			from: new Date('2026-11-01T00:00:00Z'),
			to: new Date('2026-11-02T00:00:00Z'),
			now: new Date('2026-10-31T00:00:00Z'),
			timezone: 'America/New_York',
			rules: { timezone: 'America/New_York', leadTimeMinutes: 0, horizonDays: 10, slotIntervalMinutes: 30 },
			staff: [{ calendar: fall, allocations: [] }],
		})
		expect(starts(input)).toEqual(['2026-11-01T05:00:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-01T06:00:00.000Z', '2026-11-01T06:30:00.000Z'])
		fall.weekly[0].breaks = [{ startMinute: 60, endMinute: 90 }]
		expect(starts(input)).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z'])
		expect(starts({ ...input, durationMinutes: 60 })).toEqual([])
	})
	it('split overnight windows preserve continuous coverage and timezone-local exception dates', () => {
		const overnight: ScheduleCalendar = {
			timezone: 'Africa/Addis_Ababa',
			weekly: [
				{ weekday: 1, hours: [{ startMinute: 1380, endMinute: 1440 }], breaks: [] },
				{ weekday: 2, hours: [{ startMinute: 0, endMinute: 60 }], breaks: [] },
			],
			exceptions: [],
		}
		const input = base({ timezone: overnight.timezone, staff: [{ calendar: overnight, allocations: [] }], durationMinutes: 60 })
		expect(starts(input)).toContain('2026-10-12T20:30:00.000Z')
		overnight.exceptions = [{ date: '2026-10-13', hours: [], breaks: [] }]
		expect(starts(input)).not.toContain('2026-10-12T20:30:00.000Z')
	})
	it('returns the complete maximum seven-day five-minute candidate set for one hundred qualified Staff', () => {
		const input = base({
			to: new Date('2026-10-19T00:00:00Z'),
			rules: { timezone: 'UTC', leadTimeMinutes: 0, horizonDays: 30, slotIntervalMinutes: 5 },
			staff: Array.from({ length: 100 }, () => ({ calendar: allDay(), allocations: [] })),
		})
		const result = calculateSlots(input)
		expect(result).toHaveLength(2016)
		expect(result[0].start).toBe('2026-10-12T00:00:00.000Z')
		expect(result.at(-1)?.start).toBe('2026-10-18T23:55:00.000Z')
	})
	it('rejects invalid calendar dates, zones, overlapping windows, duplicates and oversized reads', () => {
		for (const bad of [
			{ ...allDay(), timezone: 'Invalid/Zone' },
			{ ...allDay(), exceptions: [{ date: '2026-02-30', hours: [], breaks: [] }] },
			{ ...allDay(), weekly: [{ weekday: 1, hours: [{ startMinute: 600, endMinute: 540 }], breaks: [] }] },
			{
				...allDay(),
				weekly: [
					{
						weekday: 1,
						hours: [
							{ startMinute: 600, endMinute: 660 },
							{ startMinute: 630, endMinute: 700 },
						],
						breaks: [],
					},
				],
			},
			{
				...allDay(),
				exceptions: [
					{ date: '2026-10-12', hours: [], breaks: [] },
					{ date: '2026-10-12', hours: [], breaks: [] },
				],
			},
		])
			expect(ScheduleCalendarSchema.safeParse(bad).success).toBe(false)
		expect(
			StaffScheduleSchema.safeParse({ scopes: [{ mode: 'online', locationId: '00000000-0000-0000-0000-000000000000', calendar: allDay() }] }).success,
		).toBe(false)
		expect(
			ServiceSlotSelectionSchema.safeParse({
				optionId: '00000000-0000-0000-0000-000000000000',
				addonIds: [],
				mode: 'online',
				locationId: null,
				staffId: null,
				from: '2026-10-12T00:00:00Z',
				to: '2026-10-20T00:00:00Z',
			}).success,
		).toBe(false)
	})
})
