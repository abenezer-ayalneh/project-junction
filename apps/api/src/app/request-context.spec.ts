import { ACTIVE_API_LIFECYCLE, ACTIVE_API_VERSION, requestContextMiddleware } from './request-context'

const clientRequestId = 'b1f6c321-b78e-4ac5-8649-4dd14e9aa3d2'

function runMiddleware(header?: string | string[]) {
	const request: { headers: { [name: string]: string | string[] | undefined }; requestId?: string } = {
		headers: header === undefined ? {} : { 'x-request-id': header },
	}
	const setHeader = jest.fn()
	const next = jest.fn()

	requestContextMiddleware(request, { setHeader }, next)
	return { next, request, setHeader }
}

describe('requestContextMiddleware', () => {
	it('preserves a valid caller correlation ID for the response and downstream handlers', () => {
		const result = runMiddleware(clientRequestId)

		expect(result.request.requestId).toBe(clientRequestId)
		expect(result.setHeader).toHaveBeenCalledWith('X-Request-Id', clientRequestId)
		expect(result.setHeader).toHaveBeenCalledWith('X-API-Version', ACTIVE_API_VERSION)
		expect(result.setHeader).toHaveBeenCalledWith('X-API-Lifecycle', ACTIVE_API_LIFECYCLE)
		expect(result.next).toHaveBeenCalledTimes(1)
	})

	it.each([undefined, 'not-a-uuid', ['not-a-uuid', clientRequestId]])('replaces unsafe correlation input: %p', (header) => {
		const result = runMiddleware(header)

		expect(result.request.requestId).toMatch(UUID_PATTERN)
		expect(result.setHeader).toHaveBeenCalledWith('X-Request-Id', result.request.requestId)
		expect(result.setHeader).toHaveBeenCalledWith('X-API-Version', ACTIVE_API_VERSION)
		expect(result.setHeader).toHaveBeenCalledWith('X-API-Lifecycle', ACTIVE_API_LIFECYCLE)
	})
})

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
