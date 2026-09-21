import { readFile } from 'node:fs/promises'

const contractFiles = ['libs/contracts/src/lib/access-context.ts', 'libs/contracts/src/lib/api.ts', 'libs/contracts/src/lib/events.ts']

const source = await Promise.all(contractFiles.map((file) => readFile(file, 'utf8')))
const forbidden = /\b(Prisma|@prisma\/client|providerSecret|rawProviderPayload)\b/

if (source.some((file) => forbidden.test(file))) {
	throw new Error('Public contracts must not expose persistence or provider implementation types.')
}

if (!source.join('\n').includes('zod')) {
	throw new Error('Public contracts must be defined with Zod schemas.')
}

process.stdout.write('Public contract isolation check passed.\n')
