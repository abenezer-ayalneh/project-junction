export interface StaffAssignmentCandidate {
	key: string
	staffIds: string[]
	start: number
	end: number
}
/** At most five intents. Allocate restrictive named choices before flexible ones,
 * backtracking when an early any-Staff choice would make a later intent fail. */
export function assignQualifiedStaff(candidates: readonly StaffAssignmentCandidate[]): Map<string, string> | null {
	const sorted = [...candidates].sort((a, b) => a.staffIds.length - b.staffIds.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
	const assigned: { key: string; staffId: string; start: number; end: number }[] = []
	const visit = (index: number): boolean => {
		if (index === sorted.length) return true
		const candidate = sorted[index]
		for (const staffId of [...candidate.staffIds].sort()) {
			if (assigned.some((a) => a.staffId === staffId && a.start < candidate.end && a.end > candidate.start)) continue
			assigned.push({ key: candidate.key, staffId, start: candidate.start, end: candidate.end })
			if (visit(index + 1)) return true
			assigned.pop()
		}
		return false
	}
	return visit(0) ? new Map(assigned.map((a) => [a.key, a.staffId])) : null
}
