import { describe, it, expect } from "vitest"
import { searchIcons } from "./search"
import type { IconRow } from "./manifest"

const rows: IconRow[] = [
	{ id: "bitcoin", symbol: "btc", name: "Bitcoin", ext: "png", colourHex: "f79824" },
	{ id: "chainlink", symbol: "link", name: "Chainlink", ext: "png", colourHex: "2f5dd6" },
	{ id: "binancecoin", symbol: "bnb", name: "BNB", ext: "png", colourHex: "f1bf1e" },
]

describe("searchIcons", () => {
	it("matches by name, case-insensitively", () => {
		expect(searchIcons(rows, "chain")).toEqual([rows[1]])
		expect(searchIcons(rows, "CHAIN")).toEqual([rows[1]])
	})

	it("matches by symbol", () => {
		expect(searchIcons(rows, "bnb")).toEqual([rows[2]])
	})

	it("matches by id", () => {
		expect(searchIcons(rows, "bitcoin")).toEqual([rows[0]])
	})

	it("returns every row for an empty query", () => {
		expect(searchIcons(rows, "")).toEqual(rows)
	})

	it("returns every row for a whitespace-only query", () => {
		expect(searchIcons(rows, "   ")).toEqual(rows)
	})

	it("returns an empty array when nothing matches", () => {
		expect(searchIcons(rows, "dogecoin")).toEqual([])
	})
})
