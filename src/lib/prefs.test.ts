import { describe, it, expect, beforeEach } from "vitest"
import {
	getDensity,
	setDensity,
	getWash,
	setWash,
	getTheme,
	setTheme,
	resolveEffectiveTheme,
	DEFAULT_DENSITY,
	DEFAULT_WASH,
	DEFAULT_THEME,
} from "./prefs"

class MemoryStorage implements Storage {
	private store = new Map<string, string>()
	get length() {
		return this.store.size
	}
	clear(): void {
		this.store.clear()
	}
	getItem(key: string): string | null {
		return this.store.has(key) ? this.store.get(key)! : null
	}
	key(index: number): string | null {
		return Array.from(this.store.keys())[index] ?? null
	}
	removeItem(key: string): void {
		this.store.delete(key)
	}
	setItem(key: string, value: string): void {
		this.store.set(key, value)
	}
}

beforeEach(() => {
	globalThis.localStorage = new MemoryStorage()
})

describe("prefs", () => {
	it("returns defaults when nothing is stored", () => {
		expect(getDensity()).toBe(DEFAULT_DENSITY)
		expect(getWash()).toBe(DEFAULT_WASH)
		expect(getTheme()).toBe(DEFAULT_THEME)
	})

	it("round-trips density through localStorage", () => {
		setDensity("dense")
		expect(getDensity()).toBe("dense")
		expect(localStorage.getItem("cid.density")).toBe("dense")
	})

	it("round-trips wash through localStorage", () => {
		setWash("bold")
		expect(getWash()).toBe("bold")
	})

	it("round-trips theme through localStorage", () => {
		setTheme("dark")
		expect(getTheme()).toBe("dark")
	})

	it("falls back to the default when the stored value is not a recognised option", () => {
		localStorage.setItem("cid.density", "gigantic")
		expect(getDensity()).toBe(DEFAULT_DENSITY)
	})

	it("resolveEffectiveTheme passes through an explicit override", () => {
		expect(resolveEffectiveTheme("dark")).toBe("dark")
		expect(resolveEffectiveTheme("light")).toBe("light")
	})

	it("resolveEffectiveTheme reads the system preference for 'system'", () => {
		const original = globalThis.matchMedia
		// @ts-expect-error minimal MediaQueryList stub for the test
		globalThis.matchMedia = (query: string) => ({ matches: query.includes("dark") })
		expect(resolveEffectiveTheme("system")).toBe("dark")
		globalThis.matchMedia = original
	})
})
