import { z } from 'zod'

import { SchedulingTimezoneSchema, ServiceSchedulingRulesSchema } from './scheduling.js'

const id = z.string().uuid()
const cents = z.number().int().positive().max(100_000_000)
const label = z.string().trim().min(2).max(120)
const uniqueIds = z
	.array(id)
	.max(100)
	.refine((ids) => new Set(ids).size === ids.length, 'IDs must be unique')
export const ServiceAddonSchema = z.strictObject({
	id,
	label,
	priceCents: z.number().int().min(0).max(100_000_000),
	durationMinutes: z.number().int().min(0).max(480),
})
export const ServiceQualificationSchema = z
	.strictObject({
		staffId: id,
		locationIds: uniqueIds,
		online: z.boolean(),
	})
	.refine((value) => value.online || value.locationIds.length > 0, 'Qualification requires a mode')
export const ServiceOptionSchema = z
	.strictObject({
		id,
		label,
		priceCents: cents,
		durationMinutes: z.number().int().min(15).max(480),
		bufferBeforeMinutes: z.number().int().min(0).max(120),
		bufferAfterMinutes: z.number().int().min(0).max(120),
		locationIds: uniqueIds,
		online: z.boolean(),
		addons: z.array(ServiceAddonSchema).max(20),
		qualifications: z.array(ServiceQualificationSchema).max(100),
	})
	.superRefine((value, ctx) => {
		if (!value.online && !value.locationIds.length) ctx.addIssue({ code: 'custom', path: ['locationIds'], message: 'Option requires a mode' })
		if (new Set(value.addons.map((addon) => addon.id)).size !== value.addons.length)
			ctx.addIssue({ code: 'custom', path: ['addons'], message: 'Add-on IDs must be unique' })
		if (new Set(value.qualifications.map((qualification) => qualification.staffId)).size !== value.qualifications.length)
			ctx.addIssue({ code: 'custom', path: ['qualifications'], message: 'Staff qualifications must be unique' })
		for (const qualification of value.qualifications)
			if ((qualification.online && !value.online) || qualification.locationIds.some((locationId) => !value.locationIds.includes(locationId)))
				ctx.addIssue({ code: 'custom', path: ['qualifications'], message: 'Qualification mode must be eligible for the Option' })
		if (value.priceCents + value.addons.reduce((total, addon) => total + addon.priceCents, 0) > 100_000_000)
			ctx.addIssue({ code: 'custom', path: ['addons'], message: 'Combined price exceeds the supported maximum' })
		if (value.durationMinutes + value.addons.reduce((total, addon) => total + addon.durationMinutes, 0) > 480)
			ctx.addIssue({ code: 'custom', path: ['addons'], message: 'Combined duration exceeds eight hours' })
	})
export const ServiceConfigurationSchema = z
	.strictObject({
		capacity: z.literal('staff_only'),
		options: z.array(ServiceOptionSchema).min(1).max(50),
	})
	.refine((value) => new Set(value.options.map((option) => option.id)).size === value.options.length, 'Option IDs must be unique')
export type ServiceConfiguration = z.infer<typeof ServiceConfigurationSchema>
export const ServiceConfigurationCommandSchema = z.strictObject({
	expectedVersion: z.number().int().min(0),
	configuration: ServiceConfigurationSchema,
	bookingPolicy: z.enum(['flexible', 'standard']).optional(),
})
export const ServiceConfigurationResultSchema = z.object({
	bookingPolicy: z.enum(['flexible', 'standard']).optional(),
	listingId: id,
	version: z.number().int().min(0),
	configuration: ServiceConfigurationSchema.nullable(),
	replayed: z.boolean(),
})
export const StaffProfileCreateSchema = z.strictObject({ displayName: label, memberUserId: id.optional() })
export const StaffProfileUpdateSchema = z.strictObject({ expectedVersion: z.number().int().min(0), displayName: label })
export const StaffConsentCommandSchema = z.strictObject({ expectedVersion: z.number().int().min(0), publicDisplay: z.boolean() })
export const StaffProfileResultSchema = z.object({
	id,
	displayName: label.nullable(),
	version: z.number().int().min(0),
	publicDisplay: z.boolean(),
	replayed: z.boolean(),
})
export const StaffProfilesSchema = z.object({ items: z.array(StaffProfileResultSchema) })
export const PublicServiceDefinitionSchema = z.object({
	bookingPolicy: z.enum(['flexible', 'standard']).optional(),
	scheduling: ServiceSchedulingRulesSchema.extend({ version: z.number().int().positive() }).nullable().optional(),
	listingId: id,
	version: z.number().int().positive(),
	capacity: z.literal('staff_only'),
	options: z.array(
		z.object({
			id,
			label,
			priceCents: cents,
			durationMinutes: z.number().int().min(15).max(480),
			bufferBeforeMinutes: z.number().int().min(0).max(120),
			bufferAfterMinutes: z.number().int().min(0).max(120),
			locations: z.array(z.object({ id, label: z.string(), city: z.string(), timezone: SchedulingTimezoneSchema.nullable().optional() })),
			online: z.boolean(),
			addons: z.array(ServiceAddonSchema),
			eligibleModes: z.array(
				z.object({
					mode: z.enum(['in_person', 'online']),
					locationId: id.nullable(),
					anyStaffEligible: z.boolean(),
					namedStaff: z.array(z.object({ id, displayName: label })),
				}),
			),
		}),
	),
})
