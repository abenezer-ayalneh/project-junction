import { readFile } from 'node:fs/promises'

const [phase, catalog, status] = await Promise.all([
	readFile('docs/requirements/PHASE-00-PLATFORM-FOUNDATION.md', 'utf8'),
	readFile('docs/quality/PHASE-ACCEPTANCE-CATALOG.md', 'utf8'),
	readFile('docs/STATUS.md', 'utf8'),
])

const requirements = ['REQ-P00-IAM-001', 'REQ-P00-IAM-002', 'REQ-P00-API-001', 'REQ-P00-DATA-001', 'REQ-P00-EVT-001', 'REQ-P00-DEMO-001']
const scenarios = ['TST-P00-001', 'TST-P00-002', 'TST-P00-003', 'TST-P00-004', 'TST-P00-005']

for (const requirement of requirements) {
	if (!phase.includes(requirement) || !catalog.includes(requirement)) {
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

process.stdout.write('Phase 00 requirement and acceptance traceability check passed.\n')
