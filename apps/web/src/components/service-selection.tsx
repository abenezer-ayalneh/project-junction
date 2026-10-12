'use client'

import { type PublicListingDetail, PublicServiceDefinitionSchema, ServiceSlotsResultSchema } from 'contracts'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { goodsFieldClass } from '@/components/product-selection'
import { Button } from '@/components/ui/button'
import {
	appointmentDate,
	appointmentPrice,
	appointmentRequest,
	appointmentTime,
	readAppointmentIntents,
	saveAppointmentIntent,
	type ServiceDefinition,
	type ServiceSlots,
} from '@/lib/appointment-intents'

export function ServiceSelection({ listing, editId }: { listing: PublicListingDetail; editId?: string }) {
	const [editing, setEditing] = useState<string | undefined>()
	const [definition, setDefinition] = useState<ServiceDefinition | null>(null)
	const [optionId, setOptionId] = useState('')
	const [addonIds, setAddonIds] = useState<string[]>([])
	const [mode, setMode] = useState<'in_person' | 'online' | ''>('')
	const [locationId, setLocationId] = useState('')
	const [staffId, setStaffId] = useState('')
	const [date, setDate] = useState('')
	const [start, setStart] = useState('')
	const [slots, setSlots] = useState<ServiceSlots | null>(null)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('Loading Service options…')
	const [added, setAdded] = useState(false)
	const [online, setOnline] = useState(true)
	const generation = useRef(0)
	const running = useRef(false)
	useEffect(() => {
		let current = true
		const sync = () => {
			generation.current++
			setOnline(navigator.onLine)
			setSlots(null)
			setAdded(false)
		}
		setOnline(navigator.onLine)
		window.addEventListener('offline', sync)
		window.addEventListener('online', sync)
		void appointmentRequest(`public/listings/${listing.id}/service-definition`, (value) => PublicServiceDefinitionSchema.parse(value))
			.then((result) => {
				if (!current) return
				setDefinition(result)
				setMessage('')
				if (editId) {
					try {
						const intent = readAppointmentIntents().find((value) => value.id === editId && value.listing.id === listing.id)
						if (intent) {
							setEditing(intent.id)
							setStart(intent.command.start)
							setOptionId(intent.command.optionId)
							setAddonIds(
								intent.command.addonIds.filter((id) =>
									result.options.find((option) => option.id === intent.command.optionId)?.addons.some((addon) => addon.id === id),
								),
							)
							setMode(intent.command.mode)
							setLocationId(intent.command.locationId ?? '')
							setStaffId(intent.command.staffId ?? '')
							setDate(appointmentDate(intent.command.start, intent.timezone))
							setMessage('Review your selections and refresh times to update this intent.')
						}
					} catch {
						setMessage('Saved appointment could not be read. Check Cart before trying again.')
					}
				}
			})
			.catch((error: Error) => {
				if (current) setMessage(error.message)
			})
		return () => {
			current = false
			generation.current++
			window.removeEventListener('offline', sync)
			window.removeEventListener('online', sync)
		}
	}, [listing.id, editId])
	const option = definition?.options.find((value) => value.id === optionId)
	const location = option?.locations.find((value) => value.id === locationId)
	const eligible = option?.eligibleModes.find((value) => value.mode === mode && value.locationId === (mode === 'online' ? null : locationId))
	const timezone = mode === 'online' ? definition?.scheduling?.timezone : location?.timezone
	const addons = option?.addons.filter((value) => addonIds.includes(value.id)) ?? []
	const price = option ? option.priceCents + addons.reduce((total, value) => total + value.priceCents, 0) : null
	const duration = option ? option.durationMinutes + addons.reduce((total, value) => total + value.durationMinutes, 0) : null
	const visibleSlots = timezone ? (slots?.slots.filter((slot) => appointmentDate(slot.start, timezone) === date) ?? []) : []
	function changed() {
		generation.current++
		setSlots(null)
		setStart('')
		setAdded(false)
		setMessage('')
	}
	async function run(work: () => Promise<void>) {
		if (running.current) return
		running.current = true
		setBusy(true)
		setAdded(false)
		try {
			await work()
		} catch (error) {
			setSlots(null)
			setMessage(error instanceof Error ? error.message : 'Could not refresh times. Try again.')
		} finally {
			running.current = false
			setBusy(false)
		}
	}
	function reconcile(next: ServiceDefinition) {
		setDefinition(next)
		const selected = next.options.find((value) => value.id === optionId)
		if (!selected) {
			setOptionId('')
			setAddonIds([])
			setMode('')
			setLocationId('')
			setStaffId('')
			return
		}
		setAddonIds(addonIds.filter((id) => selected.addons.some((value) => value.id === id)))
		const scope = selected.eligibleModes.find((value) => value.mode === mode && value.locationId === (mode === 'online' ? null : locationId))
		if (!scope) {
			setMode('')
			setLocationId('')
			setStaffId('')
		} else if (staffId && !scope.namedStaff.some((value) => value.id === staffId)) setStaffId('')
	}
	async function reload() {
		await run(async () => {
			const result = await appointmentRequest(`public/listings/${listing.id}/service-definition`, (value) => PublicServiceDefinitionSchema.parse(value))
			reconcile(result)
			setSlots(null)
			setStart('')
			setMessage('Service options refreshed. Review your selections and refresh times.')
		})
	}
	async function currentTimes(): Promise<ServiceSlots | null> {
		if (!option || !mode || !timezone || !date || !eligible || (mode === 'in_person' && !locationId) || !definition?.scheduling) {
			setMessage('Select an Option, mode, Location, Staff and date before refreshing times.')
			return null
		}
		const at = generation.current
		const fresh = await appointmentRequest(`public/listings/${listing.id}/service-definition`, (value) => PublicServiceDefinitionSchema.parse(value))
		if (at !== generation.current) return null
		if (fresh.version !== definition.version || fresh.scheduling?.version !== definition.scheduling.version) {
			reconcile(fresh)
			setSlots(null)
			setStart('')
			setMessage('Service terms changed. Review your selections and refresh times.')
			return null
		}
		const freshScope = fresh.options
			.find((value) => value.id === optionId)
			?.eligibleModes.find((value) => value.mode === mode && value.locationId === (mode === 'online' ? null : locationId))
		if (!freshScope || (staffId && !freshScope.namedStaff.some((value) => value.id === staffId))) {
			reconcile(fresh)
			setStart('')
			setSlots(null)
			setMessage('Staff or Location eligibility changed. Review your selections and refresh times.')
			return null
		}
		setDefinition(fresh)
		// Three UTC days cover one selected local date even at the extremes of IANA offsets.
		const midnight = Date.parse(`${date}T00:00:00Z`)
		const result = await appointmentRequest(`public/listings/${listing.id}/slots`, (value) => ServiceSlotsResultSchema.parse(value), {
			optionId,
			addonIds,
			mode,
			locationId: mode === 'online' ? null : locationId,
			staffId: staffId || null,
			from: new Date(midnight - 86400000).toISOString(),
			to: new Date(midnight + 2 * 86400000).toISOString(),
		})
		if (at !== generation.current) return null
		if (
			result.configurationVersion !== fresh.version ||
			result.rulesVersion !== fresh.scheduling?.version ||
			result.timezone !== timezone ||
			result.listingId !== listing.id ||
			result.optionId !== optionId ||
			result.mode !== mode ||
			result.locationId !== (mode === 'online' ? null : locationId) ||
			result.staffId !== (staffId || null) ||
			result.priceCents !== price ||
			result.durationMinutes !== duration
		) {
			setSlots(null)
			setStart('')
			setMessage('Service terms changed. Reload Service options and refresh times.')
			return null
		}
		setSlots(result)
		return result
	}
	async function refresh() {
		await run(async () => {
			setMessage('Refreshing times…')
			const result = await currentTimes()
			if (!result) return
			const available = result.slots.filter((slot) => appointmentDate(slot.start, result.timezone) === date)
			if (start && !available.some((slot) => slot.start === start)) setStart('')
			setMessage(
				available.length
					? 'Times refreshed. Select an available time.'
					: 'No times available for this selection. Choose another date or Staff and refresh.',
			)
		})
	}
	async function add(event: React.FormEvent) {
		event.preventDefault()
		await run(async () => {
			if (!start || !slots) {
				setMessage('Refresh times and select a time before adding this appointment.')
				return
			}
			setMessage('Checking the selected time…')
			const result = await currentTimes()
			if (!result || !definition || !mode) return
			if (!result.slots.some((slot) => slot.start === start && appointmentDate(slot.start, result.timezone) === date)) {
				setStart('')
				setMessage('That time is no longer available. Select another time or change the date and refresh.')
				return
			}
			saveAppointmentIntent(
				listing,
				definition,
				{ optionId, addonIds, mode, locationId: mode === 'online' ? null : locationId, staffId: staffId || null, start },
				result,
				editId,
			)
			setAdded(true)
			setMessage(editing ? 'Appointment intent updated. Time is not reserved.' : 'Appointment intent added to Cart. Time is not reserved.')
		})
	}
	return (
		<form onSubmit={(event) => void add(event)} className="mt-8 space-y-5 border-t pt-6 text-center" aria-label="Service selection">
			<h2 className="text-xl font-semibold">Select appointment</h2>
			{definition ? (
				<>
					<label className="block text-sm">
						Service Option
						<select
							aria-label="Service Option"
							className={goodsFieldClass}
							value={optionId}
							disabled={busy}
							onChange={(event) => {
								changed()
								setOptionId(event.target.value)
								setAddonIds([])
								setMode('')
								setLocationId('')
								setStaffId('')
							}}>
							<option value="">Select Option</option>
							{definition.options.map((value) => (
								<option key={value.id} value={value.id}>
									{value.label} · {appointmentPrice(value.priceCents)} · {value.durationMinutes} minutes
								</option>
							))}
						</select>
					</label>
					{option?.addons.length ? (
						<fieldset className="space-y-2">
							<legend className="mb-2 w-full text-sm font-medium">Add-ons</legend>
							{option.addons.map((value) => (
								<label key={value.id} className="flex items-center justify-center gap-2 text-sm">
									<input
										type="checkbox"
										className="size-4 accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
										disabled={busy}
										checked={addonIds.includes(value.id)}
										onChange={(event) => {
											changed()
											setAddonIds(event.target.checked ? [...addonIds, value.id] : addonIds.filter((id) => id !== value.id))
										}}
									/>
									<span>
										{value.label} · +{appointmentPrice(value.priceCents)} · +{value.durationMinutes} minutes
									</span>
								</label>
							))}
						</fieldset>
					) : null}
					{price !== null ? (
						<p className="font-semibold" aria-label="Appointment total">
							{appointmentPrice(price)} · {duration} minutes
						</p>
					) : null}
					<label className="block text-sm">
						Appointment mode
						<select
							aria-label="Appointment mode"
							className={goodsFieldClass}
							value={mode}
							disabled={busy || !option}
							onChange={(event) => {
								changed()
								setMode(event.target.value as typeof mode)
								setLocationId('')
								setStaffId('')
							}}>
							<option value="">Select mode</option>
							{option?.locations.length ? <option value="in_person">At Vendor Location</option> : null}
							{option?.online ? <option value="online">Online</option> : null}
						</select>
					</label>
					{mode === 'in_person' ? (
						<label className="block text-sm">
							Service Location
							<select
								aria-label="Service Location"
								className={goodsFieldClass}
								value={locationId}
								disabled={busy}
								onChange={(event) => {
									changed()
									setLocationId(event.target.value)
									setStaffId('')
								}}>
								<option value="">Select Location</option>
								{option?.locations.map((value) => (
									<option key={value.id} value={value.id}>
										{value.label} · {value.city}
									</option>
								))}
							</select>
						</label>
					) : null}
					<label className="block text-sm">
						Staff
						<select
							aria-label="Staff"
							className={goodsFieldClass}
							value={staffId}
							disabled={busy || !eligible}
							onChange={(event) => {
								changed()
								setStaffId(event.target.value)
							}}>
							<option value="">Any qualified Staff</option>
							{eligible?.namedStaff.map((value) => (
								<option key={value.id} value={value.id}>
									{value.displayName}
								</option>
							))}
						</select>
					</label>
					{timezone ? (
						<p className="text-sm font-medium">Timezone: {timezone}</p>
					) : (
						<p className="text-sm text-muted-foreground">Select a configured mode and Location to see its timezone.</p>
					)}
					{definition.scheduling ? (
						<p className="text-sm text-muted-foreground">
							Minimum notice: {definition.scheduling.leadTimeMinutes} minutes. Book up to {definition.scheduling.horizonDays} days ahead.
						</p>
					) : (
						<p className="text-sm text-muted-foreground">Scheduling is not configured for this Service.</p>
					)}
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="block text-sm">
							Appointment date
							<input
								aria-label="Appointment date"
								type="date"
								className={goodsFieldClass}
								value={date}
								disabled={busy || !timezone}
								onChange={(event) => {
									changed()
									setDate(event.target.value)
								}}
							/>
						</label>
						<label className="block text-sm">
							Appointment time
							<select
								aria-label="Appointment time"
								className={goodsFieldClass}
								value={start}
								disabled={busy || !slots || !online}
								onChange={(event) => {
									setStart(event.target.value)
									setAdded(false)
									setMessage('')
								}}>
								<option value="">Select time</option>
								{visibleSlots.map((slot) => (
									<option key={slot.start} value={slot.start}>
										{appointmentTime(slot.start, slot.end, slots?.timezone ?? '')}
									</option>
								))}
							</select>
						</label>
					</div>
					{start && !slots && timezone && duration ? (
						<p className="text-sm text-muted-foreground">
							Previously selected: {appointmentTime(start, new Date(Date.parse(start) + duration * 60_000).toISOString(), timezone)}. Refresh
							times to check availability.
						</p>
					) : null}
					<Button type="button" variant="outline" disabled={busy || !online} onClick={() => void refresh()}>
						{busy ? 'Checking…' : 'Refresh times'}
					</Button>
					<p className="text-sm text-muted-foreground">Cancellation and amendment terms will be shown before payment.</p>
					<p className="text-sm text-muted-foreground">Adding an intent does not reserve time or confirm a Booking.</p>
					<Button type="submit" disabled={busy || !online || !slots || !start}>
						{editing ? 'Update appointment in Cart' : 'Add appointment to Cart'}
					</Button>
				</>
			) : null}
			{!online ? (
				<p role="status" className="text-sm">
					You are offline. Reconnect and refresh times. Your selections are kept on this page.
				</p>
			) : null}
			<p role="status" aria-live="polite" className="text-sm">
				{message}
			</p>
			<Button type="button" variant="ghost" disabled={busy || !online} onClick={() => void reload()}>
				Reload Service options
			</Button>
			{added ? (
				<div className="flex justify-center gap-5 text-sm">
					<Link href="/cart" className="underline underline-offset-4">
						View Cart
					</Link>
					<Link href="/search?kind=service" className="underline underline-offset-4">
						Continue shopping
					</Link>
				</div>
			) : null}
		</form>
	)
}
