export const syntheticRoutePrefixes = [
	'/v1/synthetic',
	'/v1/demo',
	'/v1/webhooks',
	'/v1/foundation/audit-markers',
	'/v1/foundation/elevated-audit-markers',
	'/v1/foundation/staff',
] as const

export function isSyntheticStagingPath(path: string): boolean {
	return syntheticRoutePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}
