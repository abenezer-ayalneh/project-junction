import { z } from 'zod'

import { SchedulingTimezoneSchema } from './scheduling.js'
import { ServiceAddonSchema } from './services.js'
const id = z.string().uuid()
export const BookingHoldCommandSchema = z
	.strictObject({
		listingId: id,
		optionId: id,
		addonIds: z
			.array(id)
			.max(20)
			.refine((value) => new Set(value).size === value.length, 'Add-ons must be unique'),
		mode: z.enum(['in_person', 'online']),
		locationId: id.nullable(),
		staffId: id.nullable(),
		start: z
			.string()
			.datetime({ offset: true })
			.refine((value) => new Date(value).getTime() % 60_000 === 0, 'Start must have minute precision'),
		expectedConfigurationVersion: z.number().int().positive(),
		expectedRulesVersion: z.number().int().positive(),
	})
	.refine((value) => (value.mode === 'online') === (value.locationId === null), 'Mode and Location must match')
export type BookingHoldCommand = z.infer<typeof BookingHoldCommandSchema>
export const BookingHoldSnapshotSchema = z.object({
	listingId: id,
	vendorId: id,
	serviceTitle: z.string(),
	optionId: id,
	optionLabel: z.string(),
	addons: z.array(ServiceAddonSchema),
	mode: z.enum(['in_person', 'online']),
	locationId: id.nullable(),
	locationLabel: z.string().nullable(),
	locationCity: z.string().nullable(),
	selectedStaffId: id.nullable(),
	timezone: SchedulingTimezoneSchema,
	start: z.string().datetime(),
	end: z.string().datetime(),
	currency: z.literal('ETB'),
	priceCents: z.number().int().positive(),
	durationMinutes: z.number().int().positive(),
	bufferBeforeMinutes: z.number().int().min(0),
	bufferAfterMinutes: z.number().int().min(0),
	configurationVersion: z.number().int().positive(),
	rulesVersion: z.number().int().positive(),
})
export const BookingHoldReadSchema = z.object({
	holdId: id,
	state: z.enum(['holding', 'released', 'expired', 'committed']),
	expiresAt: z.string().datetime(),
	snapshot: BookingHoldSnapshotSchema,
})
export const BookingHoldResultSchema = BookingHoldReadSchema.extend({ replayed: z.boolean() })
export const BookingHoldReleaseResultSchema = z.object({ holdId: id, state: z.enum(['released', 'expired']), replayed: z.boolean() })
