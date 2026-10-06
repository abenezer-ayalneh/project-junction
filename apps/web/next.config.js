//@ts-check

if (
	process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE &&
	process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE !== 'local' &&
	process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE !== 'staging'
) {
	throw new Error('Web builds require NEXT_PUBLIC_JUNCTION_RUNTIME_MODE=local or staging.')
}

if (process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'staging' && process.env.NEXT_PUBLIC_JUNCTION_API_URL !== '/v1') {
	throw new Error('Private staging web builds require NEXT_PUBLIC_JUNCTION_API_URL=/v1.')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
	async rewrites() {
		if (process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE !== 'local') return []
		const apiBase = process.env.NEXT_PUBLIC_JUNCTION_API_URL ?? 'http://localhost:3001/v1'
		if (!apiBase.startsWith('http://localhost:3001/v1')) {
			throw new Error('Local web development requires NEXT_PUBLIC_JUNCTION_API_URL=http://localhost:3001/v1.')
		}
		return [{ source: '/v1/:path*', destination: `${apiBase}/:path*` }]
	},
}

module.exports = nextConfig
