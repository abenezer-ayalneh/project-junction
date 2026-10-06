import { randomUUID } from 'node:crypto'

export const ACTIVE_API_VERSION = 'v1'
export const ACTIVE_API_LIFECYCLE = 'active'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface RequestWithContext {
	headers: { [name: string]: string | string[] | undefined }
	authenticatedSessionId?: string
	requestId?: string
}

export interface ResponseWithContext {
	setHeader(name: string, value: string): void
}

function incomingRequestId(value: string | string[] | undefined): string | undefined {
	const candidate = Array.isArray(value) ? value[0] : value
	return candidate && UUID_PATTERN.test(candidate) ? candidate : undefined
}

export function requestIdFor(request: RequestWithContext): string {
	return incomingRequestId(request.headers['x-request-id']) ?? randomUUID()
}

export function requestContextMiddleware(request: RequestWithContext, response: ResponseWithContext, next: () => void): void {
	const requestId = requestIdFor(request)
	request.requestId = requestId
	response.setHeader('X-Request-Id', requestId)
	response.setHeader('X-API-Version', ACTIVE_API_VERSION)
	response.setHeader('X-API-Lifecycle', ACTIVE_API_LIFECYCLE)
	next()
}
