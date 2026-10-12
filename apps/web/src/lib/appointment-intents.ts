import {
	BookingHoldCommandSchema,
	type PublicListingDetail,
	PublicServiceDefinitionSchema,
	SchedulingTimezoneSchema,
	ServiceSlotsResultSchema,
} from 'contracts'
import { z } from 'zod'

export type ServiceDefinition = z.infer<typeof PublicServiceDefinitionSchema>
export type ServiceSlots = z.infer<typeof ServiceSlotsResultSchema>
export const AppointmentIntentSchema = z.object({
	id: z.string().uuid(),
	listing: z.object({ id: z.string().uuid(), title: z.string(), vendor: z.object({ id: z.string().uuid(), displayName: z.string() }) }),
	command: BookingHoldCommandSchema,
	optionLabel: z.string(),
	addonLabels: z.array(z.string()),
	staffLabel: z.string(),
	locationLabel: z.string(),
	timezone: SchedulingTimezoneSchema,
	end: z.string().datetime(),
	priceCents: z.number().int().positive(),
	durationMinutes: z.number().int().positive(),
})
export type AppointmentIntent = z.infer<typeof AppointmentIntentSchema>
const intentsKey = 'junction:appointment-intents:v1'
const intentsSchema = z.array(AppointmentIntentSchema).max(100)
export function readAppointmentIntents(): AppointmentIntent[] {
	const saved = window.localStorage.getItem(intentsKey)
	return saved ? intentsSchema.parse(JSON.parse(saved)) : []
}
export function writeAppointmentIntents(intents: AppointmentIntent[]) {
	window.localStorage.setItem(intentsKey, JSON.stringify(intentsSchema.parse(intents)))
	window.dispatchEvent(new Event('junction:cart-changed'))
}
export function clearAppointmentIntents() {
	window.localStorage.removeItem(intentsKey)
	window.dispatchEvent(new Event('junction:cart-changed'))
}
export function saveAppointmentIntent(
	listing: PublicListingDetail,
	definition: ServiceDefinition,
	selection: {
		optionId: string
		addonIds: string[]
		mode: 'in_person' | 'online'
		locationId: string | null
		staffId: string | null
		start: string
	},
	result: ServiceSlots,
	editId?: string,
) {
	const option = definition.options.find((value) => value.id === selection.optionId)
	const slot = result.slots.find((value) => value.start === selection.start)
	if (!option || !slot || result.configurationVersion !== definition.version || result.rulesVersion !== definition.scheduling?.version)
		throw new Error('Service terms changed. Reload options and refresh times.')
	const eligible = option.eligibleModes.find((value) => value.mode === selection.mode && value.locationId === selection.locationId)
	const staffLabel = selection.staffId ? eligible?.namedStaff.find((value) => value.id === selection.staffId)?.displayName : 'Any qualified Staff'
	if (!staffLabel) throw new Error('Staff selection changed. Reload options and refresh times.')
	const intents = readAppointmentIntents()
	const duplicate = intents.find(
		(value) =>
			value.command.listingId === listing.id &&
			value.command.optionId === selection.optionId &&
			value.command.mode === selection.mode &&
			value.command.locationId === selection.locationId &&
			value.command.staffId === selection.staffId &&
			value.command.start === selection.start &&
			JSON.stringify([...value.command.addonIds].sort()) === JSON.stringify([...selection.addonIds].sort()),
	)
	const id = editId ?? duplicate?.id ?? crypto.randomUUID()
	const intent = AppointmentIntentSchema.parse({
		id,
		listing,
		command: { listingId: listing.id, ...selection, expectedConfigurationVersion: result.configurationVersion, expectedRulesVersion: result.rulesVersion },
		optionLabel: option.label,
		addonLabels: option.addons.filter((value) => selection.addonIds.includes(value.id)).map((value) => value.label),
		staffLabel,
		locationLabel: selection.mode === 'online' ? 'Online' : (option.locations.find((value) => value.id === selection.locationId)?.label ?? ''),
		timezone: result.timezone,
		end: slot.end,
		priceCents: result.priceCents,
		durationMinutes: result.durationMinutes,
	})
	writeAppointmentIntents([...intents.filter((value) => value.id !== id && value.id !== duplicate?.id), intent])
}
export class AppointmentRequestError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message)
	}
}
export async function appointmentRequest<T>(path: string, parse: (input: unknown) => T, body?: unknown): Promise<T> {
	if (!navigator.onLine) throw new Error('You are offline. Reconnect and refresh times. Your selections are kept on this page.')
	try {
		const response = await fetch(`/v1/${path}`, {
			cache: 'no-store',
			credentials: 'same-origin',
			...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
		})
		if (response.status === 403 || response.status === 404)
			throw new AppointmentRequestError(response.status, 'This Service selection is unavailable. Reload Service options.')
		if (!response.ok) throw new Error()
		return parse(await response.json())
	} catch (error) {
		if (error instanceof AppointmentRequestError) throw error
		throw new Error('Current Service information could not be read. Keep your selections and try again.')
	}
}
export const appointmentPrice = (cents: number) =>
	new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)
export function appointmentDate(instant: string, timezone: string): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
			.formatToParts(new Date(instant))
			.map((part) => [part.type, part.value]),
	)
	return `${parts['year']}-${parts['month']}-${parts['day']}`
}
export function appointmentTime(start: string, end: string, timezone: string) {
	const format = new Intl.DateTimeFormat('en', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' })
	return `${format.format(new Date(start))} – ${format.format(new Date(end))}`
}
