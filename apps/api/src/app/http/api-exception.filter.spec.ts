import type { ArgumentsHost } from '@nestjs/common'
import { HttpException, HttpStatus } from '@nestjs/common'

import { ApiExceptionFilter } from './api-exception.filter'

function createHost() {
	let statusCode: number | undefined
	let body: unknown
	const request = { headers: {}, requestId: 'd1f6c321-b78e-4ac5-8649-4dd14e9aa3d2' }
	const response = {
		status: jest.fn((status: number) => {
			statusCode = status
			return {
				json: jest.fn((value: unknown) => {
					body = value
				}),
			}
		}),
	}

	return {
		host: {
			switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
		} as ArgumentsHost,
		response,
		result: () => ({ statusCode, body }),
	}
}

describe('ApiExceptionFilter', () => {
	const logger = {
		error: jest.fn(),
		log: jest.fn(),
		warn: jest.fn(),
	}

	beforeEach(() => jest.clearAllMocks())

	it('keeps throttling responses public and machine-readable', () => {
		const fixture = createHost()
		new ApiExceptionFilter(logger).catch(new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS), fixture.host)

		expect(fixture.result().statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS)
		expect(fixture.result().body).toMatchObject({
			code: 'RATE_LIMITED',
			message: 'Too many requests',
			requestId: 'd1f6c321-b78e-4ac5-8649-4dd14e9aa3d2',
			retryable: false,
		})
		expect(logger.warn).toHaveBeenCalledTimes(1)
	})

	it('hides unexpected errors and records only a request-correlated safe summary', () => {
		const fixture = createHost()
		new ApiExceptionFilter(logger).catch(new Error('database password and webhook secret'), fixture.host)

		expect(fixture.result().statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
		expect(fixture.result().body).toMatchObject({
			code: 'UNAVAILABLE',
			message: 'The service is temporarily unavailable.',
		})
		expect(logger.error).toHaveBeenCalledWith('Request failed with status 500 (requestId: d1f6c321-b78e-4ac5-8649-4dd14e9aa3d2)')
		expect(logger.error.mock.calls.flat().join(' ')).not.toMatch(/database password|webhook secret/i)
	})
})
