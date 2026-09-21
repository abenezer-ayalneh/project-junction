import type { ArgumentsHost } from '@nestjs/common'
import { HttpException, HttpStatus } from '@nestjs/common'

import { ApiExceptionFilter } from './api-exception.filter'

function createHost() {
	let statusCode: number | undefined
	let body: unknown
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
			switchToHttp: () => ({ getResponse: () => response }),
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
			retryable: false,
		})
		expect(logger.warn).toHaveBeenCalledTimes(1)
	})

	it('hides unexpected errors and records them at error level', () => {
		const fixture = createHost()
		new ApiExceptionFilter(logger).catch(new Error('database password'), fixture.host)

		expect(fixture.result().statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
		expect(fixture.result().body).toMatchObject({
			code: 'UNAVAILABLE',
			message: 'The service is temporarily unavailable.',
		})
		expect(logger.error).toHaveBeenCalledTimes(1)
	})
})
