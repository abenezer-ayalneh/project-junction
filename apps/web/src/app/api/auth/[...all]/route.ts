import { getAuth } from 'platform-core/auth'

export const runtime = 'nodejs'

export function GET(request: Request) {
	return getAuth().handler(request)
}

export function POST(request: Request) {
	return getAuth().handler(request)
}
