//@ts-check

if (process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE && process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE !== 'local' && process.env.NEXT_PUBLIC_JUNCTION_RUNTIME_MODE !== 'staging') {
	throw new Error('Web builds require NEXT_PUBLIC_JUNCTION_RUNTIME_MODE=local or staging.')
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
