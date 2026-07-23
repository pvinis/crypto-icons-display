import { describe, it, expect } from "vitest"
import { pickNewestDataTag } from "./resolve-data-tag"

describe("pickNewestDataTag", () => {
	it("picks the lexicographically (and thus chronologically) newest data-* tag", () => {
		expect(pickNewestDataTag(["data-2026-07-01", "data-2026-07-22", "data-2026-07-15"])).toBe("data-2026-07-22")
	})

	it("ignores tags that don't match the data-YYYY-MM-DD shape", () => {
		expect(pickNewestDataTag(["v1.0.0", "data-2026-07-01", "not-a-tag"])).toBe("data-2026-07-01")
	})

	it("returns null when there are no matching tags", () => {
		expect(pickNewestDataTag(["v1.0.0", "release-42"])).toBeNull()
	})

	it("returns null for an empty list", () => {
		expect(pickNewestDataTag([])).toBeNull()
	})
})
