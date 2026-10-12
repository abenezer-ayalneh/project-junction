import { createHash } from 'node:crypto'

import { applicationRuntimeMode } from './runtime.js'

export interface MeetingProviderRequest {
	operationKey: string
	bookingId: string
	staffId: string
	provider: 'demo_meet' | 'controlled_google_meet'
	connectionReference: string | null
}
export interface MeetingProviderResult extends MeetingProviderRequest {
	uri: string
	providerReference: string
}
export interface MeetingProviderAdapter {
	provision(request: MeetingProviderRequest): Promise<MeetingProviderResult>
}

/** Local protocol simulator only: never connects to Google or creates a live meeting. */
export class LocalMeetingProvider implements MeetingProviderAdapter {
	provision(request: MeetingProviderRequest): Promise<MeetingProviderResult> {
		if (applicationRuntimeMode() !== 'local') throw new Error('Local meeting simulation is unavailable outside local development.')
		const digest = createHash('sha256').update(request.operationKey).digest('hex')
		const letters = [...digest.slice(0, 10)].map((letter) => String.fromCharCode(97 + Number.parseInt(letter, 16))).join('')
		const uri =
			request.provider === 'demo_meet'
				? `/demo-meet/bookings/${request.bookingId}?operation=${digest.slice(0, 16)}`
				: `https://meet.google.com/${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7, 10)}`
		return Promise.resolve({ ...request, uri, providerReference: `local-meeting:${digest}` })
	}
}
