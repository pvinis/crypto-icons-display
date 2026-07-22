import { writeFile, readFile } from "node:fs/promises"

const TAG_RE = /^data-\d{4}-\d{2}-\d{2}$/
const TAGS_API = "https://api.github.com/repos/pvinis/crypto-icons-data/tags"
const FALLBACK_FILE = new URL("../data-tag.fallback.json", import.meta.url)
const ENV_FILE = new URL("../.env.local", import.meta.url)

export function pickNewestDataTag(tagNames: string[]): string | null {
	const matching = tagNames.filter((name) => TAG_RE.test(name))
	if (matching.length === 0) return null
	return matching.sort().at(-1)!
}

async function resolveViaGitHub(): Promise<string | null> {
	try {
		const response = await fetch(TAGS_API)
		if (!response.ok) return null
		const tags = (await response.json()) as Array<{ name: string }>
		return pickNewestDataTag(tags.map((t) => t.name))
	} catch {
		return null
	}
}

async function resolveFallback(): Promise<string> {
	const raw = await readFile(FALLBACK_FILE, "utf-8")
	const parsed = JSON.parse(raw) as { tag: string }
	return parsed.tag
}

async function main() {
	const resolved = await resolveViaGitHub()
	const tag = resolved ?? (await resolveFallback())
	if (!resolved) {
		console.warn(`resolve-data-tag: GitHub API resolution failed, falling back to committed tag "${tag}"`)
	}
	await writeFile(ENV_FILE, `VITE_DATA_TAG=${tag}\n`)
	console.log(`resolve-data-tag: using "${tag}"`)
}

if (import.meta.main) {
	await main()
}
