import { readFile } from 'node:fs/promises'

const [phase, crossPhase, catalog, manifest, status] = await Promise.all([
	readFile('docs/requirements/PHASE-00-PLATFORM-FOUNDATION.md', 'utf8'),
	readFile('docs/requirements/CROSS-PHASE-NONFUNCTIONAL-REQUIREMENTS.md', 'utf8'),
	readFile('docs/quality/PHASE-ACCEPTANCE-CATALOG.md', 'utf8'),
	readFile('docs/MANIFEST.md', 'utf8'),
	readFile('docs/STATUS.md', 'utf8'),
])

const requirementSources = `${phase}\n${crossPhase}`
const requirements = [...new Set(requirementSources.match(/REQ-P00-[A-Z]+-\d{3}/g) ?? [])]
const scenarios = ['TST-P00-001', 'TST-P00-002', 'TST-P00-003', 'TST-P00-004', 'TST-P00-005']
const manifestRows = [...manifest.matchAll(/^\| `([^`]+\.md)`\s*\|\s*([^|]+)\|/gm)].map(([, path, documentStatus]) => ({
	path,
	documentStatus: documentStatus.trim(),
}))

if (manifestRows.length === 0) {
	throw new Error('Documentation manifest must contain document rows.')
}

for (const requirement of requirements) {
	if (!catalog.includes(`| \`${requirement}\``)) {
		throw new Error(`Missing Phase 00 traceability for ${requirement}.`)
	}
}
for (const scenario of scenarios) {
	if (!phase.includes(scenario) || !catalog.includes(scenario)) {
		throw new Error(`Missing Phase 00 acceptance reference for ${scenario}.`)
	}
}
if (!status.includes('Claim labels')) {
	throw new Error('Documentation status must retain explicit claim labels.')
}

const targetDocuments = manifestRows.filter((row) => row.documentStatus === 'S/NE/NV')
for (const { path } of targetDocuments) {
	let document
	try {
		document = await readFile(path, 'utf8')
	} catch {
		throw new Error(`Manifest document is missing: ${path}.`)
	}
	if (!document.includes('Specified — Not Executed — Not Verified')) {
		throw new Error(`Target document is missing an explicit target-status label: ${path}.`)
	}
}

process.stdout.write(
	`Phase 00 documentation audit passed: ${requirements.length} requirement mappings, ${scenarios.length} acceptance scenarios, ${manifestRows.length} manifest documents, and ${targetDocuments.length} target-status labels.\n`,
)
