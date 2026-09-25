export const CATALOG_CSV_HEADER = 'kind,category,title,description,priceCents,durationMinutes'

export interface CsvRow {
	rowNumber: number
	fields: string[]
	error?: string
}

export function parseCatalogCsv(input: string): CsvRow[] {
	const text = input.startsWith('\uFEFF') ? input.slice(1) : input
	const rows: CsvRow[] = []
	let fields: string[] = []
	let field = ''
	let inQuotes = false
	let afterQuote = false
	let rowError: string | undefined
	let rowHasContent = false
	let rowNumber = 1
	let lineNumber = 1

	const finishField = () => {
		fields.push(field)
		field = ''
		afterQuote = false
	}
	const finishRow = () => {
		finishField()
		rows.push({ rowNumber, fields, ...(rowError ? { error: rowError } : {}) })
		fields = []
		rowError = undefined
		rowHasContent = false
		rowNumber = lineNumber + 1
	}

	for (let index = 0; index < text.length; index++) {
		const char = text[index]
		const next = text[index + 1]
		if (inQuotes) {
			if (char === '"') {
				if (next === '"') {
					field += '"'
					index++
				} else {
					inQuotes = false
					afterQuote = true
				}
			} else if (char === '\r' && next === '\n') {
				field += '\n'
				index++
				lineNumber++
			} else {
				field += char
				if (char === '\n' || char === '\r') lineNumber++
			}
			continue
		}
		if (char === ',') {
			finishField()
			rowHasContent = true
			continue
		}
		if (char === '\n' || char === '\r') {
			finishRow()
			if (char === '\r' && next === '\n') index++
			lineNumber++
			continue
		}
		if (char === '"') {
			if (field === '' && !afterQuote) {
				inQuotes = true
			} else {
				rowError ??= 'Unexpected quote in CSV field.'
				field += char
			}
		} else {
			if (afterQuote) rowError ??= 'Unexpected character after a quoted CSV field.'
			field += char
		}
		rowHasContent = true
	}
	if (inQuotes) rowError ??= 'Unclosed quoted CSV field.'
	if (rowHasContent || fields.length > 0 || field !== '' || rowError) finishRow()
	return rows
}

export function decodeCatalogCsvText(value: string): string {
	return value.startsWith("'") ? value.slice(1) : value
}

export function encodeCatalogCsvField(value: string | number | null): string {
	const text = String(value ?? '')
	const safe = /^[=+\-@'\t\r\n]/.test(text) ? `'${text}` : text
	return `"${safe.replaceAll('"', '""')}"`
}
