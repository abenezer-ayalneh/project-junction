import { randomUUID } from 'node:crypto'

import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger, type LoggerService } from '@nestjs/common'
import { AccessDeniedError, IdempotencyConflictError } from 'platform-core'

interface ErrorResponse {
	headersSent?: boolean
	status(code: number): { json(body: unknown): void }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
	constructor(private readonly logger: LoggerService = new Logger(ApiExceptionFilter.name)) {}

	catch(exception: unknown, host: ArgumentsHost): void {
		const response = host.switchToHttp().getResponse<ErrorResponse>()
		if (response.headersSent) {
			return
		}

		const error = this.toPublicError(exception)
		const requestId = randomUUID()
		this.logException(exception, error.status, requestId)

		response.status(error.status).json({
			code: error.code,
			message: error.message,
			requestId,
			retryable: false,
		})
	}

	private toPublicError(exception: unknown): { status: number; code: string; message: string } {
		if (exception instanceof IdempotencyConflictError) {
			return { status: 409, code: exception.code, message: exception.message }
		}

		if (exception instanceof AccessDeniedError) {
			return { status: 403, code: exception.code, message: exception.message }
		}

		if (exception instanceof Error && exception.name === 'ZodError') {
			return { status: 400, code: 'INVALID_REQUEST', message: 'The request is invalid.' }
		}

		if (exception instanceof HttpException) {
			const status = exception.getStatus()
			return {
				status,
				code: this.codeForStatus(status),
				message: this.messageForHttpException(exception),
			}
		}

		return { status: 500, code: 'UNAVAILABLE', message: 'The service is temporarily unavailable.' }
	}

	private codeForStatus(status: HttpStatus): string {
		if (status === HttpStatus.BAD_REQUEST) return 'INVALID_REQUEST'
		if (status === HttpStatus.UNAUTHORIZED) return 'AUTH_REQUIRED'
		if (status === HttpStatus.FORBIDDEN) return 'ACCESS_DENIED'
		if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND'
		if (status === HttpStatus.TOO_MANY_REQUESTS) return 'RATE_LIMITED'
		return 'UNAVAILABLE'
	}

	private messageForHttpException(exception: HttpException): string {
		const response = exception.getResponse()
		if (typeof response === 'string') return response
		const message = 'message' in response ? response.message : undefined
		if (Array.isArray(message)) return message.join(', ')
		if (typeof message === 'string') return message
		return exception.message
	}

	private logException(exception: unknown, status: number, requestId: string): void {
		const message = `Request failed with status ${status} (requestId: ${requestId})`
		if (status >= 500) {
			const stack = exception instanceof Error ? exception.stack : undefined
			this.logger.error(message, stack)
			return
		}

		this.logger.warn(message)
	}
}
