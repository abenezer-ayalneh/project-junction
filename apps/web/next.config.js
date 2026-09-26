//@ts-check

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE !== 'staging') {
	throw new Error('Production web builds require NEXT_PUBLIC_JUNCTION_RUNTIME_MODE=staging. Synthetic preview builds are test-only.')
}

if (process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE === 'staging' && process.env.NEXT_PUBLIC_JUNCTION_API_URL !== '/v1') {
	throw new Error('Private staging web builds require NEXT_PUBLIC_JUNCTION_API_URL=/v1.')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Next.js options go here
	// See: https://nextjs.org/docs/app/api-reference/config/next-config-js
}

module.exports = nextConfig
