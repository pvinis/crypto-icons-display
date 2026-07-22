import type { IconRow } from "./urls"

export type { IconRow }

export type ManifestResult = {
	rows: IconRow[]
	droppedCount: number
}

const HEX_COLOUR_RE = /^[0-9a-fA-F]{6}$/

function isValidRow(row: unknown, extTable: string[]): row is [string, string, string, number, string] {
	if (!Array.isArray(row) || row.length !== 5) return false
	const [id, symbol, name, extIndex, colourHex] = row
	if (typeof id !== "string" || id.length === 0) return false
	if (typeof symbol !== "string") return false
	if (typeof name !== "string") return false
	if (typeof extIndex !== "number" || extIndex < 0 || extIndex >= extTable.length) return false
	if (typeof colourHex !== "string" || !HEX_COLOUR_RE.test(colourHex)) return false
	return true
}

export function decodeManifest(payload: unknown): ManifestResult {
	if (!Array.isArray(payload) || payload.length === 0) {
		return { rows: [], droppedCount: 0 }
	}

	const [extTable, ...rawRows] = payload
	if (!Array.isArray(extTable) || !extTable.every((e) => typeof e === "string")) {
		return { rows: [], droppedCount: 0 }
	}

	const rows: IconRow[] = []
	let droppedCount = 0

	for (const raw of rawRows) {
		if (!isValidRow(raw, extTable)) {
			droppedCount++
			continue
		}
		const [id, symbol, name, extIndex, colourHex] = raw
		rows.push({
			id,
			symbol,
			name: name.length > 0 ? name : id,
			ext: extTable[extIndex]!,
			colourHex,
		})
	}

	return { rows, droppedCount }
}

export async function fetchManifest(url: string): Promise<ManifestResult> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`manifest fetch failed: ${response.status} ${response.statusText}`)
	}
	const payload = await response.json()
	return decodeManifest(payload)
}
