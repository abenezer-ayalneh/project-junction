export function recoveryLink(url: string, baseURL: string): string {
	const source = new URL(url)
	const expectedOrigin = new URL(baseURL).origin
	const match = source.pathname.match(/\/api\/auth\/reset-password\/([^/]+)$/)
	if (source.origin !== expectedOrigin || !match?.[1]) throw new Error('Better Auth returned an invalid password recovery URL.')
	const destination = new URL('/account/reset', expectedOrigin)
	destination.searchParams.set('token', match[1])
	return destination.toString()
}
