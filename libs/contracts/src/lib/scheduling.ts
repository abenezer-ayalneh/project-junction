import { z } from 'zod'

const id = z.string().uuid()
const version = z.number().int().min(0)
export const SchedulingTimezoneSchema = z
	.string()
	.min(1)
	.max(80)
	.refine((value) => {
		try {
			if (value !== 'UTC' && !value.includes('/')) return false
			new Intl.DateTimeFormat('en', { timeZone: value })
			return true
		} catch {
			return false
		}
	}, 'A supported IANA timezone is required')
const date = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		const parsed = new Date(`${value}T00:00:00Z`)
		return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
	}, 'A valid calendar date is required')
const WindowSchema = z
	.strictObject({ startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) })
	.refine((value) => value.endMinute > value.startMinute, 'Window end must follow start; split overnight hours across dates')
const windows = z
	.array(WindowSchema)
	.max(20)
	.refine((value) => {
		const sorted = [...value].sort((a, b) => a.startMinute - b.startMinute)
		return sorted.every((window, index) => !index || window.startMinute >= sorted[index - 1].endMinute)
	}, 'Windows must not overlap')
const DaySchema = z.strictObject({ hours: windows, breaks: windows })
export const ScheduleCalendarSchema = z
	.strictObject({
		timezone: SchedulingTimezoneSchema,
		weekly: z.array(DaySchema.extend({ weekday: z.number().int().min(0).max(6) })).max(7),
		exceptions: z.array(DaySchema.extend({ date })).max(366),
	})
	.superRefine((value, ctx) => {
		if (new Set(value.weekly.map((day) => day.weekday)).size !== value.weekly.length)
			ctx.addIssue({ code: 'custom', path: ['weekly'], message: 'Weekdays must be unique' })
		if (new Set(value.exceptions.map((day) => day.date)).size !== value.exceptions.length)
			ctx.addIssue({ code: 'custom', path: ['exceptions'], message: 'Exception dates must be unique' })
	})
export type ScheduleCalendar = z.infer<typeof ScheduleCalendarSchema>
export const StaffScheduleSchema = z
	.strictObject({
		scopes: z
			.array(
				z
					.strictObject({
						mode: z.enum(['in_person', 'online']),
						locationId: id.nullable(),
						calendar: ScheduleCalendarSchema,
					})
					.refine((value) => (value.mode === 'online') === (value.locationId === null), 'In-person requires a Location; online has none'),
			)
			.max(100),
	})
	.refine((value) => new Set(value.scopes.map((scope) => `${scope.mode}:${scope.locationId}`)).size === value.scopes.length, 'Schedule scopes must be unique')
export type StaffSchedule = z.infer<typeof StaffScheduleSchema>
export const ServiceSchedulingRulesSchema = z.strictObject({
	timezone: SchedulingTimezoneSchema,
	leadTimeMinutes: z.number().int().min(0).max(43_200),
	horizonDays: z.number().int().min(1).max(365),
	slotIntervalMinutes: z
		.number()
		.int()
		.min(5)
		.max(60)
		.refine((value) => 60 % value === 0, 'Slot interval must divide an hour'),
})
export type ServiceSchedulingRules = z.infer<typeof ServiceSchedulingRulesSchema>
export const LocationScheduleCommandSchema = z.strictObject({ expectedVersion: version, calendar: ScheduleCalendarSchema })
export const StaffScheduleCommandSchema = z.strictObject({ expectedVersion: version, schedule: StaffScheduleSchema })
export const ServiceSchedulingRulesCommandSchema = z.strictObject({ expectedVersion: version, rules: ServiceSchedulingRulesSchema })
export const LocationScheduleResultSchema = z.object({ locationId: id, version, calendar: ScheduleCalendarSchema.nullable(), replayed: z.boolean() })
export const StaffScheduleResultSchema = z.object({ staffId: id, version, schedule: StaffScheduleSchema.nullable(), replayed: z.boolean() })
export const ServiceSchedulingRulesResultSchema = z.object({ listingId: id, version, rules: ServiceSchedulingRulesSchema.nullable(), replayed: z.boolean() })
export const ServiceSlotSelectionSchema = z
	.strictObject({
		optionId: id,
		addonIds: z
			.array(id)
			.max(20)
			.refine((value) => new Set(value).size === value.length, 'Add-ons must be unique'),
		mode: z.enum(['in_person', 'online']),
		locationId: id.nullable(),
		staffId: id.nullable(),
		from: z.string().datetime({ offset: true }),
		to: z.string().datetime({ offset: true }),
	})
	.superRefine((value, ctx) => {
		if ((value.mode === 'online') !== (value.locationId === null))
			ctx.addIssue({ code: 'custom', path: ['locationId'], message: 'Mode and Location must match' })
		const range = new Date(value.to).getTime() - new Date(value.from).getTime()
		if (range <= 0 || range > 7 * 86400000) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Query must cover at most seven elapsed days' })
	})
export type ServiceSlotSelection = z.infer<typeof ServiceSlotSelectionSchema>
export const ServiceSlotsResultSchema = z.object({
	listingId: id,
	optionId: id,
	mode: z.enum(['in_person', 'online']),
	locationId: id.nullable(),
	staffId: id.nullable(),
	timezone: SchedulingTimezoneSchema,
	configurationVersion: version,
	rulesVersion: version,
	evaluatedAt: z.string().datetime(),
	priceCents: z.number().int().positive(),
	durationMinutes: z.number().int().positive(),
	bufferBeforeMinutes: z.number().int().min(0),
	bufferAfterMinutes: z.number().int().min(0),
	reserved: z.literal(false),
	slots: z.array(z.object({ start: z.string().datetime(), end: z.string().datetime() })),
})
