'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
	appointmentDate,
	type AppointmentIntent,
	appointmentPrice,
	appointmentTime,
	clearAppointmentIntents,
	readAppointmentIntents,
	writeAppointmentIntents,
} from '@/lib/appointment-intents'

export function AppointmentIntents({ locked = false }: { locked?: boolean }) {
	const [intents, setIntents] = useState<AppointmentIntent[] | null>(null)
	const [message, setMessage] = useState('')
	const [corrupt, setCorrupt] = useState(false)
	useEffect(() => {
		const read = () => {
			try {
				setIntents(readAppointmentIntents())
				setCorrupt(false)
			} catch {
				setIntents([])
				setCorrupt(true)
				setMessage('Saved appointments could not be read. Clear appointments to start again.')
			}
		}
		read()
		window.addEventListener('junction:cart-changed', read)
		window.addEventListener('storage', read)
		return () => {
			window.removeEventListener('junction:cart-changed', read)
			window.removeEventListener('storage', read)
		}
	}, [])
	function remove(id: string) {
		try {
			writeAppointmentIntents((intents ?? []).filter((value) => value.id !== id))
			setMessage('Appointment intent removed.')
		} catch {
			setMessage('Appointments could not be saved. Your Cart is unchanged.')
		}
	}
	function clear() {
		try {
			clearAppointmentIntents()
			setMessage('Saved appointment intents cleared.')
		} catch {
			setMessage('Saved appointments could not be cleared. Try again.')
		}
	}
	return (
		<section aria-labelledby="appointment-intents-title" className="space-y-5 text-center">
			<h2 id="appointment-intents-title" className="text-xl font-semibold">
				Appointments
			</h2>
			<p className="text-sm text-muted-foreground">
				These are unreserved intents. No Booking is confirmed. Review current times and terms before payment.
			</p>
			{intents === null ? (
				<p className="text-sm">Loading saved appointments…</p>
			) : intents.length ? (
				<ul className="divide-y rounded-lg border px-5">
					{intents.map((intent) => (
						<li key={intent.id} className="space-y-3 py-5">
							<h3 className="font-semibold">
								<Link href={`/listings/${intent.listing.id}`} className="underline underline-offset-4">
									{intent.listing.title}
								</Link>
							</h3>
							<p className="text-sm">
								{intent.listing.vendor.displayName} · {intent.optionLabel}
							</p>
							{intent.addonLabels.length ? <p className="text-sm">Add-ons: {intent.addonLabels.join(', ')}</p> : null}
							<p className="text-sm">
								{intent.locationLabel} · {intent.staffLabel}
							</p>
							<p className="text-sm">
								{appointmentDate(intent.command.start, intent.timezone)} · {appointmentTime(intent.command.start, intent.end, intent.timezone)}
							</p>
							<p className="text-sm">Timezone: {intent.timezone}</p>
							<p className="font-semibold">
								{appointmentPrice(intent.priceCents)} · {intent.durationMinutes} minutes
							</p>
							<div className="flex flex-wrap justify-center gap-4">
								{!locked ? (
									<Link
										href={`/listings/${intent.listing.id}?appointmentIntent=${intent.id}`}
										className="self-center text-sm underline underline-offset-4">
										Edit appointment
									</Link>
								) : null}
								<Button type="button" variant="outline" disabled={locked} onClick={() => remove(intent.id)}>
									Remove appointment
								</Button>
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="text-sm text-muted-foreground">No appointment intents in Cart.</p>
			)}
			{corrupt ? (
				<Button type="button" variant="outline" disabled={locked} onClick={clear}>
					Clear appointments
				</Button>
			) : null}
			<Link href="/search?kind=service" className="inline-flex text-sm underline underline-offset-4">
				Browse Services
			</Link>
			<p role="status" aria-live="polite" className="text-sm">
				{message}
			</p>
		</section>
	)
}
