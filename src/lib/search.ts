import type { IconRow } from "./manifest"

export function searchIcons(rows: IconRow[], query: string): IconRow[] {
	const q = query.trim().toLowerCase()
	if (q.length === 0) return rows
	return rows.filter(
		(row) =>
			row.name.toLowerCase().includes(q) || row.symbol.toLowerCase().includes(q) || row.id.toLowerCase().includes(q),
	)
}
