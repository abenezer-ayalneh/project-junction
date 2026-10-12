import { assignQualifiedStaff } from './staff-assignment.js'
describe('joint concrete Staff assignment', () => {
	test('an any-Staff intent cannot consume the only Staff eligible for a named intent', () => {
		const assigned = assignQualifiedStaff([
			{ key: 'any', staffIds: ['a', 'b'], start: 0, end: 60 },
			{ key: 'named', staffIds: ['a'], start: 0, end: 60 },
		])
		expect(assigned?.get('named')).toBe('a')
		expect(assigned?.get('any')).toBe('b')
	})
	test('backtracks flexible choices, respects buffered overlap and allows adjacent intervals', () => {
		expect(
			assignQualifiedStaff([
				{ key: 'first', staffIds: ['a'], start: 0, end: 60 },
				{ key: 'second', staffIds: ['a'], start: 59, end: 120 },
			]),
		).toBeNull()
		expect(
			assignQualifiedStaff([
				{ key: 'first', staffIds: ['a'], start: 0, end: 60 },
				{ key: 'second', staffIds: ['a'], start: 60, end: 120 },
			])?.size,
		).toBe(2)
		const data = [
			{ key: 'a', staffIds: ['1', '2'], start: 0, end: 60 },
			{ key: 'b', staffIds: ['2', '3'], start: 0, end: 60 },
			{ key: 'c', staffIds: ['1', '3'], start: 0, end: 60 },
		]
		expect(assignQualifiedStaff(data)?.size).toBe(3)
		expect([...(assignQualifiedStaff(data) ?? new Map())].sort()).toEqual([...(assignQualifiedStaff([...data].reverse()) ?? new Map())].sort())
	})
})
