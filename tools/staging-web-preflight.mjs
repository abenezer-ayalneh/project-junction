function required(name) {
	const value = process.env[name]?.trim()
	if (!value) throw new Error(`${name} is required for the private staging web runtime.`)
	return value
}

try {
	if (required('NODE_ENV') !== 'production') throw new Error('The private staging web runtime requires NODE_ENV=production.')
	if (required('JUNCTION_RUNTIME_MODE') !== 'staging' || required('NEXT_PUBLIC_JUNCTION_RUNTIME_MODE') !== 'staging') {
		throw new Error('The private staging web runtime requires staging mode at build and runtime.')
	}
	if (required('NEXT_PUBLIC_JUNCTION_API_URL') !== '/v1' || required('JUNCTION_API_URL') !== 'http://api:3001/v1') {
		throw new Error('The private staging web runtime must use the same-origin browser API and isolated internal API service.')
	}
	const authOrigin = new URL(required('BETTER_AUTH_URL'))
	if (
		authOrigin.protocol !== 'https:' ||
		authOrigin.href !== authOrigin.origin + '/' ||
		['localhost', '127.0.0.1', 'example.com'].includes(authOrigin.hostname) ||
		authOrigin.hostname.endsWith('.example.com')
	) {
		throw new Error('BETTER_AUTH_URL must be the actual private staging HTTPS origin.')
	}
	const database = new URL(required('DATABASE_URL'))
	if (!['postgresql:', 'postgres:'].includes(database.protocol) || database.hostname !== 'postgres') {
		throw new Error('DATABASE_URL must target the isolated staging PostgreSQL service.')
	}
	if (required('BETTER_AUTH_SECRET').length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.')
	required('RESEND_API_KEY')
	required('RESEND_FROM_EMAIL')
	for (const name of ['SYNTHETIC_ACCOUNT_PROVISIONING_SECRET', 'SYNTHETIC_DEMO_SESSION_SECRET', 'SYNTHETIC_WEBHOOK_WORKSPACE_ID']) {
		if (process.env[name]) throw new Error(`${name} must be absent from private staging.`)
	}
} catch (error) {
	console.error(`Staging web preflight failed: ${error.message}`)
	process.exitCode = 1
}
