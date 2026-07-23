import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { getThumbUrl, getOriginalUrl, getCoinGeckoUrl, getManifestUrl } from "./urls"
import type { IconRow } from "./urls"

const row: IconRow = { id: "bitcoin", symbol: "btc", name: "Bitcoin", ext: "png", colourHex: "f79824" }

describe("urls", () => {
	beforeEach(() => {
		vi.stubEnv("VITE_DATA_TAG", "data-2026-07-22")
	})
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it("builds the thumbnail URL from the pinned tag", () => {
		expect(getThumbUrl(row)).toBe(
			"https://cdn.jsdelivr.net/gh/pvinis/crypto-icons-data@data-2026-07-22/data/icons/thumb64/bitcoin.webp",
		)
	})

	it("builds the original URL using the row's resolved extension", () => {
		expect(getOriginalUrl(row)).toBe(
			"https://cdn.jsdelivr.net/gh/pvinis/crypto-icons-data@data-2026-07-22/data/icons/large/bitcoin.png",
		)
	})

	it("builds the manifest URL from the pinned tag", () => {
		expect(getManifestUrl()).toBe(
			"https://cdn.jsdelivr.net/gh/pvinis/crypto-icons-data@data-2026-07-22/data/site/index.json",
		)
	})

	it("builds the CoinGecko link from the id, independent of the tag", () => {
		expect(getCoinGeckoUrl(row)).toBe("https://www.coingecko.com/en/coins/bitcoin")
	})

	it("throws a clear error when the tag was never resolved", () => {
		// Stub to empty rather than unstubbing: a generated .env.local (from the
		// prebuild step) would otherwise leak VITE_DATA_TAG into the test env.
		vi.stubEnv("VITE_DATA_TAG", "")
		expect(() => getThumbUrl(row)).toThrow(/VITE_DATA_TAG/)
	})
})
