export type Density = "comfortable" | "cosy" | "compact" | "dense"
export type Wash = "off" | "light" | "medium" | "bold"
export type ThemePref = "system" | "light" | "dark"

export const DENSITY_STEPS: Record<Density, number> = {
	comfortable: 160,
	cosy: 130,
	compact: 100,
	dense: 72,
}

export const WASH_STEPS: Record<Wash, number> = {
	off: 0,
	light: 0.15,
	medium: 0.3,
	bold: 0.45,
}

export const DEFAULT_DENSITY: Density = "cosy"
export const DEFAULT_WASH: Wash = "medium"
export const DEFAULT_THEME: ThemePref = "system"

const DENSITY_KEY = "cid.density"
const WASH_KEY = "cid.wash"
const THEME_KEY = "cid.theme"

function isDensity(value: string | null): value is Density {
	return value === "comfortable" || value === "cosy" || value === "compact" || value === "dense"
}

function isWash(value: string | null): value is Wash {
	return value === "off" || value === "light" || value === "medium" || value === "bold"
}

function isThemePref(value: string | null): value is ThemePref {
	return value === "system" || value === "light" || value === "dark"
}

export function getDensity(): Density {
	const stored = localStorage.getItem(DENSITY_KEY)
	return isDensity(stored) ? stored : DEFAULT_DENSITY
}

export function setDensity(value: Density): void {
	localStorage.setItem(DENSITY_KEY, value)
}

export function getWash(): Wash {
	const stored = localStorage.getItem(WASH_KEY)
	return isWash(stored) ? stored : DEFAULT_WASH
}

export function setWash(value: Wash): void {
	localStorage.setItem(WASH_KEY, value)
}

export function getTheme(): ThemePref {
	const stored = localStorage.getItem(THEME_KEY)
	return isThemePref(stored) ? stored : DEFAULT_THEME
}

export function setTheme(value: ThemePref): void {
	localStorage.setItem(THEME_KEY, value)
}

export function resolveEffectiveTheme(pref: ThemePref): "light" | "dark" {
	if (pref === "light" || pref === "dark") return pref
	return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}
