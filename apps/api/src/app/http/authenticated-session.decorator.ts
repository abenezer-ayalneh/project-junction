import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

import type { RequestWithContext } from './request-context'

/** Supplies the Better Auth session resolved by the API middleware. */
export const AuthenticatedSession = createParamDecorator((_data: unknown, context: ExecutionContext): string | undefined => {
	return context.switchToHttp().getRequest<RequestWithContext>().authenticatedSessionId
})
