export type IconRow = {
	id: string
	symbol: string
	name: string
	ext: string
	colourHex: string
}

const CDN_BASE = "https://cdn.jsdelivr.net/gh/pvinis/crypto-icons-data"

function tag(): string {
	const value = import.meta.env.VITE_DATA_TAG
	if (!value) {
		throw new Error("VITE_DATA_TAG is not set — did the build's prebuild step run?")
	}
	return value
}

export function getThumbUrl(row: IconRow): string {
	return `${CDN_BASE}@${tag()}/data/icons/thumb64/${row.id}.webp`
}

export function getOriginalUrl(row: IconRow): string {
	return `${CDN_BASE}@${tag()}/data/icons/large/${row.id}.${row.ext}`
}

export function getManifestUrl(): string {
	return `${CDN_BASE}@${tag()}/data/site/index.json`
}

export function getCoinGeckoUrl(row: IconRow): string {
	return `https://www.coingecko.com/en/coins/${row.id}`
}
