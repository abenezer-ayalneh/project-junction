import { spawnSync } from 'node:child_process'
const result = spawnSync('pnpm', ['exec', 'prisma', 'generate'], {
	stdio: 'inherit',
	env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://localhost/junction' },
})
process.exitCode = result.status ?? 1
