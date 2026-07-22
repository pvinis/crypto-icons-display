import { describe, it, expect } from "vitest"
import { decodeManifest } from "./manifest"

describe("decodeManifest", () => {
	it("decodes well-formed rows using the embedded ext table", () => {
		const payload = [
			["png", "jpg", "jpeg", "svg", "ico"],
			["bitcoin", "btc", "Bitcoin", 0, "f79824"],
			["chainlink", "link", "Chainlink", 0, "2f5dd6"],
		]
		const result = decodeManifest(payload)
		expect(result.droppedCount).toBe(0)
		expect(result.rows).toEqual([
			{ id: "bitcoin", symbol: "btc", name: "Bitcoin", ext: "png", colourHex: "f79824" },
			{ id: "chainlink", symbol: "link", name: "Chainlink", ext: "png", colourHex: "2f5dd6" },
		])
	})

	it("falls back to id when name is an empty string (orphan defensiveness)", () => {
		const payload = [
			["png", "jpg", "jpeg", "svg", "ico"],
			["some-delisted-coin", "some-delisted-coin", "", 1, "336699"],
		]
		const result = decodeManifest(payload)
		expect(result.rows[0]?.name).toBe("some-delisted-coin")
		expect(result.rows[0]?.ext).toBe("jpg")
	})

	it("drops a row with the wrong number of fields", () => {
		const payload = [["png", "jpg", "jpeg", "svg", "ico"], ["too-short", "ts"]]
		const result = decodeManifest(payload)
		expect(result.rows).toHaveLength(0)
		expect(result.droppedCount).toBe(1)
	})

	it("drops a row whose extIndex is out of range for the embedded ext table", () => {
		const payload = [
			["png", "jpg", "jpeg", "svg", "ico"],
			["bad-ext", "be", "Bad Ext", 99, "112233"],
		]
		const result = decodeManifest(payload)
		expect(result.rows).toHaveLength(0)
		expect(result.droppedCount).toBe(1)
	})

	it("drops a row with a malformed colourHex", () => {
		const payload = [
			["png", "jpg", "jpeg", "svg", "ico"],
			["bad-colour", "bc", "Bad Colour", 0, "notahex"],
		]
		const result = decodeManifest(payload)
		expect(result.rows).toHaveLength(0)
		expect(result.droppedCount).toBe(1)
	})

	it("drops a row with a non-string id", () => {
		const payload = [
			["png", "jpg", "jpeg", "svg", "ico"],
			[123, "num", "Numeric Id", 0, "aabbcc"],
		]
		const result = decodeManifest(payload)
		expect(result.rows).toHaveLength(0)
		expect(result.droppedCount).toBe(1)
	})

	it("returns an empty result for a payload with only the ext table", () => {
		const result = decodeManifest([["png", "jpg", "jpeg", "svg", "ico"]])
		expect(result.rows).toEqual([])
		expect(result.droppedCount).toBe(0)
	})

	it("returns an empty result for a non-array payload", () => {
		const result = decodeManifest({ not: "an array" })
		expect(result).toEqual({ rows: [], droppedCount: 0 })
	})
})
