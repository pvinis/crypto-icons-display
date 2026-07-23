# crypto-icons.dev Gallery Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `crypto-icons.dev` as a fast, windowed, colour-wash icon browser for the ~11,508 icons in `crypto-icons-data`, backed by a new build-time thumbnail/colour/manifest pipeline in that repo.

**Architecture:** Two repos, one direction of dependency. `crypto-icons-data` gains a new `src/build-assets.ts` pipeline that emits 64×64 WebP thumbnails, a dominant colour per icon, and a `data/site/index.json` manifest + `data/site/coverage.json` report, wired into the existing daily GitHub Actions workflow which now also cuts a `data-YYYY-MM-DD` tag and fires a Netlify build hook. `crypto-icons-display` is rewritten against pure, unit-tested `lib/*` modules (manifest decode, search, URL building, prefs) and thin `ui/*` components (windowed grid via `@tanstack/react-virtual`, cards, detail sheet, controls), fetching only the published CDN manifest at a pinned tag — never the data repo's source.

**Tech Stack:** Bun (both repos) · TypeScript · `bun:test` (data repo) · React 19 + Vite + Vitest + `@tanstack/react-virtual` + Tailwind v4 (site repo) · ImageMagick (`magick` CLI, shelled out to) · Playwright (site E2E) · jsDelivr (CDN) · Netlify (site hosting) · GitHub Actions (data repo pipeline)

## Global Constraints

These apply to every task below; a task's own instructions never override them.

- **Bun only.** Both repos use Bun as the package manager and script runner (`bun install`, `bun run <script>`). Never introduce npm/yarn/pnpm lockfiles or commands.
- **Data-repo tests use `bun:test`** (Bun's built-in runner), not Vitest — the data repo has zero JS test tooling today and is Bun-native end to end, so adding a second framework there is unjustified. **Site-repo `lib/*` tests use Vitest**, per the design spec's explicit instruction ("`lib/` is pure and unit-tested (Vitest)").
- **Module boundaries are fixed.** The site has exactly these modules, each with one responsibility: `lib/manifest.ts` (fetch + decode manifest into typed rows), `lib/search.ts` (filter rows by query over name/symbol/id), `lib/urls.ts` (build every CDN/CoinGecko URL from a row + the pinned tag), `lib/prefs.ts` (density/wash/theme read-write to localStorage), `ui/Grid.tsx` (windowed layout), `ui/Card.tsx` (one card), `ui/Detail.tsx` (detail sheet), `ui/Controls.tsx` (search + toggles). Do not add a ninth `lib/*` or `ui/*` file — fold anything smaller into the module it serves.
- **`lib/urls.ts` is the sole CDN-aware module.** No other file constructs a `cdn.jsdelivr.net` or `coingecko.com` URL, or reads `VITE_DATA_TAG`, directly.
- **The manifest schema is frozen and append-only.** Row shape is exactly `[id, symbol, name, extIndex, colourHex]` (`colourHex` without a leading `#`). The first array element is the extension table (currently `["png","jpg","jpeg","svg","ico"]`); it may only ever gain entries at the end, never be reordered or have entries removed, so historical indices stay valid.
- **Icons-only coverage.** The manifest contains exactly one row per file in `data/icons/large/` — never a row for a listed coin that has no icon file. Zero blank tiles by construction, not by filtering.
- **Grid is windowed, not fully mounted.** `@tanstack/react-virtual` keeps mounted DOM to roughly one screen (~120 cards) regardless of collection size.
- **Density sets a minimum card width, not a column count.** CSS is `repeat(auto-fill, minmax(var(--card), 1fr))`; the density control only changes `--card`.
- **Defaults:** density = Cosy, wash = Medium (0.30 opacity), theme = system with a persisted manual override. All three persist to `localStorage`.
- **Names auto-hide at Compact and Dense** density steps, unconditionally (not based on measured text width).
- **Touch has no hover.** Card actions that fade in on `:hover`/`:focus-within` render persistently under `@media (hover: none)`.
- **Images:** `loading="lazy"`, `decoding="async"`, explicit `width`/`height` (always 64×64, since thumbnails are fit-inside-and-padded to a fixed canvas) so lazy loading never shifts layout.
- **Search is naive `includes()`**, case-insensitive, over name/symbol/id — no index/fuzzy-match library.
- **Colour extraction** ignores transparent, grey, near-white and near-black pixels, and weights the remainder by saturation so a small vivid mark outweighs a large muddy area. Monochrome logos (XRP, Cosmos, IOST, 0x, etc.) are expected and accepted to yield a grey wash — never special-cased.
- **The site never reads the data repo's source.** It fetches only published CDN artefacts (`data/site/index.json`, `data/icons/thumb64/*.webp`, `data/icons/large/*`) at a pinned `data-YYYY-MM-DD` tag, resolved once at site build time and inlined as `VITE_DATA_TAG`.
- **Map/list drift is reported, not fixed.** `coverage.json` records orphan and missing-icon counts; no task in this plan rewrites the append-only `symbol-id-map.json` accumulation logic in `src/main.ts`.

---

## File Structure Overview

**`crypto-icons-data`** (repo root `/Users/pavlos/Source/projects/crypto-icons-data`):

| File | Responsibility |
|---|---|
| `src/constants.ts` | The frozen, append-only `EXT_TABLE` |
| `src/lib/coverage.ts` | Pure: orphan / missing-icon counting |
| `src/lib/color-math.ts` | Pure: RGB→HSV + dominant-colour-from-pixels |
| `src/lib/normalize-extension.ts` | Renames on-disk icons to a lowercase known extension, sniffing via ImageMagick when the extension is missing |
| `src/lib/thumbnail.ts` | Shells to `magick` to produce a 64×64 WebP |
| `src/lib/extract-color.ts` | Shells to `magick` for raw pixels, then calls `color-math` |
| `src/lib/manifest-row.ts` | Builds one `[id,symbol,name,extIndex,colourHex]` row, applying the orphan→id fallback |
| `src/lib/incremental.ts` | Pure: decides whether an icon can be skipped on a re-run |
| `src/build-assets.ts` | Orchestrator: walks `data/icons/large/`, wires the above together, writes `data/site/index.json` + `data/site/coverage.json` |
| `.github/workflows/fetch-more.yml` | Modified: installs ImageMagick, runs `build-assets`, cuts a `data-YYYY-MM-DD` tag when `data/` changed, fires the Netlify build hook |

**`crypto-icons-display`** (repo root `/Users/pavlos/Source/projects/crypto-icons-display`):

| File | Responsibility |
|---|---|
| `src/lib/manifest.ts` | Fetch + decode the manifest into typed `IconRow[]`, dropping malformed rows |
| `src/lib/search.ts` | Filter `IconRow[]` by query |
| `src/lib/urls.ts` | Build thumb / original / CoinGecko / manifest URLs from the pinned tag |
| `src/lib/prefs.ts` | Density / wash / theme, read-write `localStorage` |
| `src/ui/Grid.tsx` | Windowed grid (measures container, computes columns, virtualizes rows) |
| `src/ui/Card.tsx` | One card: wash background, lazy `<img>`, hover/touch actions |
| `src/ui/Detail.tsx` | Detail sheet |
| `src/ui/Controls.tsx` | Search box + density/wash/theme selects |
| `src/App.tsx` | Fetch state machine, composes the above |
| `src/index.css` | Tailwind v4 entry, theme CSS custom properties, grid/card/wash CSS |
| `index.html` | Inline pre-paint theme script |
| `scripts/resolve-data-tag.ts` | Build-time: resolves the newest `data-*` tag from GitHub, writes `.env.local` |
| `data-tag.fallback.json` | Committed fallback tag, read when the GitHub API call fails |
| `e2e/smoke.spec.ts` | Playwright: load → search → copy-to-clipboard |

---

## Part A — `crypto-icons-data` pipeline

### Task 1: Extension table + coverage counter

**Files:**
- Create: `src/constants.ts`
- Create: `src/lib/coverage.ts`
- Test: `src/lib/coverage.test.ts`

**Interfaces:**
- Produces: `EXT_TABLE: readonly string[]` from `src/constants.ts`; `computeCoverage(iconIds: string[], listedCoinIds: string[]): { orphanCount: number; missingIconCount: number }` from `src/lib/coverage.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/coverage.test.ts`:

```ts
import { test, expect } from "bun:test"
import { computeCoverage } from "./coverage"

test("counts icons whose id is not in the listed coins as orphans", () => {
	const result = computeCoverage(["bitcoin", "some-delisted-coin", "ethereum"], ["bitcoin", "ethereum"])
	expect(result.orphanCount).toBe(1)
})

test("counts listed coins that have no icon file as missing", () => {
	const result = computeCoverage(["bitcoin"], ["bitcoin", "ethereum", "solana"])
	expect(result.missingIconCount).toBe(2)
})

test("returns zero for both when the sets match exactly", () => {
	const result = computeCoverage(["bitcoin", "ethereum"], ["bitcoin", "ethereum"])
	expect(result).toEqual({ orphanCount: 0, missingIconCount: 0 })
})

test("handles empty inputs", () => {
	expect(computeCoverage([], [])).toEqual({ orphanCount: 0, missingIconCount: 0 })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/coverage.test.ts`
Expected: fails to resolve `./coverage` — `error: Cannot find module './coverage'` (the file doesn't exist yet).

- [ ] **Step 3: Write `src/constants.ts`**

```ts
// Frozen, append-only. Never reorder or remove an entry — extIndex values in
// already-published manifests depend on this exact order.
export const EXT_TABLE = ["png", "jpg", "jpeg", "svg", "ico"] as const
```

- [ ] **Step 4: Write the minimal implementation**

Create `src/lib/coverage.ts`:

```ts
export type Coverage = {
	orphanCount: number
	missingIconCount: number
}

export function computeCoverage(iconIds: string[], listedCoinIds: string[]): Coverage {
	const iconIdSet = new Set(iconIds)
	const listedIdSet = new Set(listedCoinIds)

	let orphanCount = 0
	for (const id of iconIdSet) {
		if (!listedIdSet.has(id)) orphanCount++
	}

	let missingIconCount = 0
	for (const id of listedIdSet) {
		if (!iconIdSet.has(id)) missingIconCount++
	}

	return { orphanCount, missingIconCount }
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/coverage.test.ts`
Expected: `4 pass`, `0 fail`.

- [ ] **Step 6: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add src/constants.ts src/lib/coverage.ts src/lib/coverage.test.ts
git commit -m "add: frozen ext table and pure coverage counter"
```

---

### Task 2: Pure colour math (`rgbToHsv` + `pixelsToDominantColor`)

**Files:**
- Create: `src/lib/color-math.ts`
- Test: `src/lib/color-math.test.ts`

**Interfaces:**
- Consumes: nothing (pure)
- Produces: `rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number }`, `pixelsToDominantColor(pixels: Uint8Array): string` — both from `src/lib/color-math.ts`. `pixelsToDominantColor` takes flat RGBA quads and returns a 6-char lowercase hex **without** a leading `#`.

This is the algorithm the whole colour-wash feature depends on. It was prototyped and run against the real corpus before writing this plan: on `bitcoin.png` it returns `#f79824` (brand `#F7931A`), on `binancecoin.png` `#f1bf1e` (brand `#F3BA2F`), on `chainlink.png` `#2f5dd6` (brand `#2A5ADA`), and on the monochrome `iostoken.png` it correctly falls through every filter to the grey fallback. The test values below are hand-computed, not guessed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/color-math.test.ts`:

```ts
import { test, expect } from "bun:test"
import { pixelsToDominantColor } from "./color-math"

function pixel(r: number, g: number, b: number, a: number): number[] {
	return [r, g, b, a]
}

test("returns the exact hex of a single vivid opaque pixel", () => {
	// r=220 g=20 b=20 -> h=0, s=0.909, v=0.863 (passes every filter)
	const pixels = new Uint8Array(pixel(220, 20, 20, 255))
	expect(pixelsToDominantColor(pixels)).toBe("dc1414")
})

test("falls back to grey when every pixel is fully transparent", () => {
	const pixels = new Uint8Array(pixel(255, 0, 0, 0))
	expect(pixelsToDominantColor(pixels)).toBe("808080")
})

test("falls back to grey when every pixel has zero saturation", () => {
	const pixels = new Uint8Array(pixel(128, 128, 128, 255))
	expect(pixelsToDominantColor(pixels)).toBe("808080")
})

test("falls back to grey for a near-white pixel even with a slight tint", () => {
	// r=255 g=210 b=210 -> s=0.176, v=1.0: not grey enough to hit the s<0.15
	// filter, but caught by the dedicated near-white filter (v>0.94 && s<0.25)
	const pixels = new Uint8Array(pixel(255, 210, 210, 255))
	expect(pixelsToDominantColor(pixels)).toBe("808080")
})

test("falls back to grey for a near-black pixel with a slight hue", () => {
	// r=10 g=10 b=12 -> s=0.170 (passes the grey filter), v=0.047 (<0.08)
	const pixels = new Uint8Array(pixel(10, 10, 12, 255))
	expect(pixelsToDominantColor(pixels)).toBe("808080")
})

test("weights by saturation, so fewer vivid pixels beat more muddy ones", () => {
	// 20 muddy orange pixels (h=20deg, s=0.333 each -> total weight 6.67)
	// vs 8 vivid blue pixels (h=240deg, s=0.913 each -> total weight 7.30).
	// A naive most-frequent-hue count would pick orange (20 > 8); the
	// saturation-weighted algorithm must pick blue.
	const muddy = Array.from({ length: 20 }, () => pixel(180, 140, 120, 255)).flat()
	const vivid = Array.from({ length: 8 }, () => pixel(20, 20, 230, 255)).flat()
	const pixels = new Uint8Array([...muddy, ...vivid])
	expect(pixelsToDominantColor(pixels)).toBe("1414e6")
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/color-math.test.ts`
Expected: `error: Cannot find module './color-math'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/color-math.ts`:

```ts
export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
	const rf = r / 255
	const gf = g / 255
	const bf = b / 255
	const max = Math.max(rf, gf, bf)
	const min = Math.min(rf, gf, bf)
	const d = max - min

	let h = 0
	if (d !== 0) {
		if (max === rf) h = ((gf - bf) / d) % 6
		else if (max === gf) h = (bf - rf) / d + 2
		else h = (rf - gf) / d + 4
		h *= 60
		if (h < 0) h += 360
	}

	const s = max === 0 ? 0 : d / max
	const v = max
	return { h, s, v }
}

const HUE_BUCKETS = 36 // 10-degree buckets
const ALPHA_THRESHOLD = 128
const MIN_SATURATION = 0.15
const NEAR_WHITE_VALUE = 0.94
const NEAR_WHITE_SATURATION = 0.25
const NEAR_BLACK_VALUE = 0.08
const FALLBACK_HEX = "808080"

function toHex(n: number): string {
	return Math.round(n).toString(16).padStart(2, "0")
}

export function pixelsToDominantColor(pixels: Uint8Array): string {
	const pixelCount = Math.floor(pixels.length / 4)
	const weight = new Array<number>(HUE_BUCKETS).fill(0)
	const sumR = new Array<number>(HUE_BUCKETS).fill(0)
	const sumG = new Array<number>(HUE_BUCKETS).fill(0)
	const sumB = new Array<number>(HUE_BUCKETS).fill(0)
	const count = new Array<number>(HUE_BUCKETS).fill(0)

	for (let i = 0; i < pixelCount; i++) {
		const r = pixels[i * 4]!
		const g = pixels[i * 4 + 1]!
		const b = pixels[i * 4 + 2]!
		const a = pixels[i * 4 + 3]!
		if (a < ALPHA_THRESHOLD) continue

		const { h, s, v } = rgbToHsv(r, g, b)
		if (s < MIN_SATURATION) continue
		if (v > NEAR_WHITE_VALUE && s < NEAR_WHITE_SATURATION) continue
		if (v < NEAR_BLACK_VALUE) continue

		const bucket = Math.floor(h / 10) % HUE_BUCKETS
		weight[bucket] += s
		sumR[bucket] += r
		sumG[bucket] += g
		sumB[bucket] += b
		count[bucket] += 1
	}

	let bestBucket = -1
	let bestWeight = 0
	for (let i = 0; i < HUE_BUCKETS; i++) {
		if (weight[i]! > bestWeight) {
			bestWeight = weight[i]!
			bestBucket = i
		}
	}

	if (bestBucket === -1 || count[bestBucket] === 0) return FALLBACK_HEX

	const n = count[bestBucket]!
	return toHex(sumR[bestBucket]! / n) + toHex(sumG[bestBucket]! / n) + toHex(sumB[bestBucket]! / n)
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/color-math.test.ts`
Expected: `6 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add src/lib/color-math.ts src/lib/color-math.test.ts
git commit -m "add: pure HSV + saturation-weighted dominant-colour math"
```

---

### Task 3: Extension normalization

**Files:**
- Create: `src/lib/normalize-extension.ts`
- Test: `src/lib/normalize-extension.test.ts`

**Interfaces:**
- Consumes: `magick` CLI (must be on `PATH` — already confirmed present on this machine and installed in CI by Task 9)
- Produces: `normalizeExtension(filePath: string): Promise<string | null>` — renames the file in place to a lowercase known extension if needed, returns the final lowercase extension, or `null` if the file's real format isn't one of `EXT_TABLE`'s entries (caller must exclude that icon)

The real corpus has two extension defects today: 327 files with an uppercase extension (`PNG`/`JPG`/`JPEG`) and 6 files with **no** extension at all (e.g. `bluesparrow.`, confirmed via `magick identify` to actually be a JPEG). Both cases are exercised below using synthetic fixtures generated on the fly, so this test has no dependency on the real corpus or on Task 5's fixtures.

- [ ] **Step 1: Write the failing test**

Create `src/lib/normalize-extension.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { normalizeExtension } from "./normalize-extension"

let dir: string

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "normalize-ext-"))
})

afterEach(async () => {
	await rm(dir, { recursive: true, force: true })
})

async function makeFixture(name: string, format: "png" | "jpeg"): Promise<string> {
	const filePath = path.join(dir, name)
	const proc = Bun.spawn(["magick", "-size", "8x8", "xc:blue", `${format}:${filePath}`])
	await proc.exited
	return filePath
}

test("renames an uppercase-extension file to lowercase and returns it", async () => {
	const filePath = await makeFixture("icon.PNG", "png")
	const result = await normalizeExtension(filePath)
	expect(result).toBe("png")
	expect(await Bun.file(path.join(dir, "icon.png")).exists()).toBe(true)
	expect(await Bun.file(filePath).exists()).toBe(false)
})

test("leaves an already-correct lowercase extension untouched", async () => {
	const filePath = await makeFixture("icon.png", "png")
	const result = await normalizeExtension(filePath)
	expect(result).toBe("png")
	expect(await Bun.file(filePath).exists()).toBe(true)
})

test("sniffs the real format and renames a file with no extension", async () => {
	const filePath = await makeFixture("icon-noext.", "jpeg")
	const result = await normalizeExtension(filePath)
	expect(result).toBe("jpg")
	expect(await Bun.file(path.join(dir, "icon-noext.jpg")).exists()).toBe(true)
	expect(await Bun.file(filePath).exists()).toBe(false)
})

test("returns null for a format outside the frozen ext table", async () => {
	const filePath = path.join(dir, "icon-noext-gif.")
	const proc = Bun.spawn(["magick", "-size", "8x8", "xc:blue", `gif:${filePath}`])
	await proc.exited
	const result = await normalizeExtension(filePath)
	expect(result).toBeNull()
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/normalize-extension.test.ts`
Expected: `error: Cannot find module './normalize-extension'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/normalize-extension.ts`:

```ts
import { rename } from "node:fs/promises"
import path from "node:path"
import { EXT_TABLE } from "../constants"

const MAGICK_FORMAT_TO_EXT: Record<string, string> = {
	PNG: "png",
	JPEG: "jpg",
	SVG: "svg",
	ICO: "ico",
}

async function sniffFormat(filePath: string): Promise<string | null> {
	const proc = Bun.spawn(["magick", "identify", "-format", "%m", `${filePath}[0]`], { stdout: "pipe" })
	const out = await new Response(proc.stdout).text()
	await proc.exited
	return MAGICK_FORMAT_TO_EXT[out.trim()] ?? null
}

export async function normalizeExtension(filePath: string): Promise<string | null> {
	const dir = path.dirname(filePath)
	const rawExt = path.extname(filePath).slice(1)
	const currentExt = rawExt.toLowerCase()
	const base = path.basename(filePath, path.extname(filePath))

	if ((EXT_TABLE as readonly string[]).includes(currentExt)) {
		if (rawExt === currentExt) return currentExt // already correct, no rename needed
		const correctedPath = path.join(dir, `${base}.${currentExt}`)
		await rename(filePath, correctedPath)
		return currentExt
	}

	const sniffed = await sniffFormat(filePath)
	if (sniffed === null) return null

	const correctedPath = path.join(dir, `${base}.${sniffed}`)
	await rename(filePath, correctedPath)
	return sniffed
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/normalize-extension.test.ts`
Expected: `4 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add src/lib/normalize-extension.ts src/lib/normalize-extension.test.ts
git commit -m "add: on-disk extension normalization with magick-based sniffing"
```

---

### Task 4: Thumbnail generation

**Files:**
- Create: `src/lib/thumbnail.ts`
- Test: `src/lib/thumbnail.test.ts`

**Interfaces:**
- Produces: `generateThumbnail(inputPath: string, outputPath: string): Promise<void>` — writes a 64×64 fit-inside WebP with a transparent background, throwing on failure (build-script code is fail-loud, unlike the site's defensive parsing)

The exact `magick` invocation below was run against a real icon (`bitcoin.png`) before writing this plan and produced a 64×64 WEBP at 1446 bytes — in line with the spec's ~2KB/icon estimate.

- [ ] **Step 1: Write the failing test**

Create `src/lib/thumbnail.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { generateThumbnail } from "./thumbnail"

let dir: string
let inputPath: string

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "thumbnail-"))
	inputPath = path.join(dir, "source.png")
	// a non-square source, to prove fit-inside-and-pad rather than crop
	const proc = Bun.spawn(["magick", "-size", "40x100", "xc:red", inputPath])
	await proc.exited
})

afterEach(async () => {
	await rm(dir, { recursive: true, force: true })
})

test("produces a 64x64 WEBP regardless of the source aspect ratio", async () => {
	const outputPath = path.join(dir, "thumb.webp")
	await generateThumbnail(inputPath, outputPath)

	const identify = Bun.spawn(["magick", "identify", "-format", "%wx%h %m", outputPath], { stdout: "pipe" })
	const out = (await new Response(identify.stdout).text()).trim()
	await identify.exited

	expect(out).toBe("64x64 WEBP")
})

test("throws with a clear message when the input does not exist", async () => {
	await expect(generateThumbnail(path.join(dir, "missing.png"), path.join(dir, "out.webp"))).rejects.toThrow(
		/magick thumbnail failed/,
	)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/thumbnail.test.ts`
Expected: `error: Cannot find module './thumbnail'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/thumbnail.ts`:

```ts
export async function generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
	const proc = Bun.spawn(
		[
			"magick",
			`${inputPath}[0]`,
			"-resize",
			"64x64",
			"-background",
			"none",
			"-gravity",
			"center",
			"-extent",
			"64x64",
			"-define",
			"webp:lossless=false",
			"-quality",
			"82",
			outputPath,
		],
		{ stdout: "pipe", stderr: "pipe" },
	)
	const exitCode = await proc.exited
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text()
		throw new Error(`magick thumbnail failed for ${inputPath}: ${stderr}`)
	}
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/thumbnail.test.ts`
Expected: `2 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add src/lib/thumbnail.ts src/lib/thumbnail.test.ts
git commit -m "add: 64x64 fit-inside WebP thumbnail generation"
```

---

### Task 5: Dominant-colour extraction against real fixtures

**Files:**
- Create: `src/lib/extract-color.ts`
- Create fixtures: `src/lib/__fixtures__/bitcoin.png`, `src/lib/__fixtures__/binancecoin.png`, `src/lib/__fixtures__/chainlink.png`, `src/lib/__fixtures__/iostoken.png`
- Test: `src/lib/extract-color.test.ts`

**Interfaces:**
- Consumes: `pixelsToDominantColor` from `./color-math` (Task 2)
- Produces: `extractDominantColor(inputPath: string): Promise<string>`

This is the fixture-tolerance test the design spec requires ("Colour extraction is tested in the data repo against a small fixture set of known icons, asserting extracted colours land within a tolerance of known brand colors"). The four fixtures are small (9–20KB each) real files already in the corpus.

- [ ] **Step 1: Copy the fixtures from the real corpus**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
mkdir -p src/lib/__fixtures__
cp data/icons/large/bitcoin.png src/lib/__fixtures__/bitcoin.png
cp data/icons/large/binancecoin.png src/lib/__fixtures__/binancecoin.png
cp data/icons/large/chainlink.png src/lib/__fixtures__/chainlink.png
cp data/icons/large/iostoken.png src/lib/__fixtures__/iostoken.png
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/extract-color.test.ts`:

```ts
import { test, expect } from "bun:test"
import path from "node:path"
import { extractDominantColor } from "./extract-color"

const FIXTURES = path.join(import.meta.dir, "__fixtures__")

function channelDeltas(hexA: string, hexB: string): number[] {
	const a = [hexA.slice(0, 2), hexA.slice(2, 4), hexA.slice(4, 6)].map((h) => parseInt(h, 16))
	const b = [hexB.slice(0, 2), hexB.slice(2, 4), hexB.slice(4, 6)].map((h) => parseInt(h, 16))
	return a.map((v, i) => Math.abs(v - b[i]!))
}

const TOLERANCE = 40

test("bitcoin extracts within tolerance of the brand colour #F7931A", async () => {
	const hex = await extractDominantColor(path.join(FIXTURES, "bitcoin.png"))
	for (const delta of channelDeltas(hex, "f7931a")) {
		expect(delta).toBeLessThanOrEqual(TOLERANCE)
	}
})

test("BNB extracts within tolerance of the brand colour #F3BA2F", async () => {
	const hex = await extractDominantColor(path.join(FIXTURES, "binancecoin.png"))
	for (const delta of channelDeltas(hex, "f3ba2f")) {
		expect(delta).toBeLessThanOrEqual(TOLERANCE)
	}
})

test("Chainlink extracts within tolerance of the brand colour #2A5ADA", async () => {
	const hex = await extractDominantColor(path.join(FIXTURES, "chainlink.png"))
	for (const delta of channelDeltas(hex, "2a5ada")) {
		expect(delta).toBeLessThanOrEqual(TOLERANCE)
	}
})

test("IOST (a monochrome logo) correctly yields the grey fallback", async () => {
	const hex = await extractDominantColor(path.join(FIXTURES, "iostoken.png"))
	expect(hex).toBe("808080")
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/extract-color.test.ts`
Expected: `error: Cannot find module './extract-color'`.

- [ ] **Step 4: Write the minimal implementation**

Create `src/lib/extract-color.ts`:

```ts
import { pixelsToDominantColor } from "./color-math"

const SAMPLE_SIZE = 32

async function getRawRgba(inputPath: string): Promise<Uint8Array> {
	const proc = Bun.spawn(
		[
			"magick",
			`${inputPath}[0]`,
			"-resize",
			`${SAMPLE_SIZE}x${SAMPLE_SIZE}`,
			"-background",
			"none",
			"-alpha",
			"on",
			"RGBA:-",
		],
		{ stdout: "pipe", stderr: "pipe" },
	)
	const buf = await new Response(proc.stdout).arrayBuffer()
	const exitCode = await proc.exited
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text()
		throw new Error(`magick colour sampling failed for ${inputPath}: ${stderr}`)
	}
	return new Uint8Array(buf)
}

export async function extractDominantColor(inputPath: string): Promise<string> {
	const pixels = await getRawRgba(inputPath)
	return pixelsToDominantColor(pixels)
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/extract-color.test.ts`
Expected: `4 pass`, `0 fail`.

- [ ] **Step 6: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add src/lib/extract-color.ts src/lib/extract-color.test.ts src/lib/__fixtures__
git commit -m "add: dominant-colour extraction, tested against real brand-colour fixtures"
```

---

### Task 6: Manifest row builder

**Files:**
- Create: `src/lib/manifest-row.ts`
- Test: `src/lib/manifest-row.test.ts`

**Interfaces:**
- Consumes: `EXT_TABLE` from `../constants`
- Produces: `type ManifestRow = [string, string, string, number, string]`; `buildManifestRow(icon: { id: string; ext: string; colourHex: string }, listedCoin: { symbol: string; name: string } | undefined): ManifestRow`

For an orphan (no `listedCoin`), both `name` **and** `symbol` fall back to `id` — the design spec only calls out the name fallback explicitly, but an orphan has no symbol either, and `lib/search.ts` on the site side matches over id anyway, so this is a safe, consistent choice.

- [ ] **Step 1: Write the failing test**

Create `src/lib/manifest-row.test.ts`:

```ts
import { test, expect } from "bun:test"
import { buildManifestRow } from "./manifest-row"

test("builds a row for a coin still in the current list", () => {
	const row = buildManifestRow({ id: "bitcoin", ext: "png", colourHex: "f79824" }, { symbol: "btc", name: "Bitcoin" })
	expect(row).toEqual(["bitcoin", "btc", "Bitcoin", 0, "f79824"])
})

test("falls back to id for both name and symbol when the coin is an orphan", () => {
	const row = buildManifestRow({ id: "some-delisted-coin", ext: "jpg", colourHex: "336699" }, undefined)
	expect(row).toEqual(["some-delisted-coin", "some-delisted-coin", "some-delisted-coin", 1, "336699"])
})

test("resolves extIndex correctly for every entry in the frozen ext table", () => {
	expect(buildManifestRow({ id: "a", ext: "png", colourHex: "000000" }, { symbol: "a", name: "A" })[3]).toBe(0)
	expect(buildManifestRow({ id: "b", ext: "jpg", colourHex: "000000" }, { symbol: "b", name: "B" })[3]).toBe(1)
	expect(buildManifestRow({ id: "c", ext: "jpeg", colourHex: "000000" }, { symbol: "c", name: "C" })[3]).toBe(2)
	expect(buildManifestRow({ id: "d", ext: "svg", colourHex: "000000" }, { symbol: "d", name: "D" })[3]).toBe(3)
	expect(buildManifestRow({ id: "e", ext: "ico", colourHex: "000000" }, { symbol: "e", name: "E" })[3]).toBe(4)
})

test("throws loudly for an extension outside the frozen table (an upstream bug, not user data)", () => {
	expect(() => buildManifestRow({ id: "z", ext: "gif", colourHex: "000000" }, undefined)).toThrow(/gif/)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/manifest-row.test.ts`
Expected: `error: Cannot find module './manifest-row'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/manifest-row.ts`:

```ts
import { EXT_TABLE } from "../constants"

export type ManifestRow = [string, string, string, number, string]

export function buildManifestRow(
	icon: { id: string; ext: string; colourHex: string },
	listedCoin: { symbol: string; name: string } | undefined,
): ManifestRow {
	const extIndex = (EXT_TABLE as readonly string[]).indexOf(icon.ext)
	if (extIndex === -1) {
		throw new Error(`extension "${icon.ext}" for icon "${icon.id}" is not in the frozen EXT_TABLE`)
	}

	const symbol = listedCoin?.symbol ?? icon.id
	const name = listedCoin?.name ?? icon.id

	return [icon.id, symbol, name, extIndex, icon.colourHex]
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/manifest-row.test.ts`
Expected: `4 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add src/lib/manifest-row.ts src/lib/manifest-row.test.ts
git commit -m "add: manifest row builder with orphan id fallback"
```

---

### Task 7: Incremental skip-check

**Files:**
- Create: `src/lib/incremental.ts`
- Test: `src/lib/incremental.test.ts`

**Interfaces:**
- Produces: `shouldSkipIcon(params: { thumbnailExists: boolean; previousColourHex: string | undefined }): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/incremental.test.ts`:

```ts
import { test, expect } from "bun:test"
import { shouldSkipIcon } from "./incremental"

test("skips when both the thumbnail and a previous colour already exist", () => {
	expect(shouldSkipIcon({ thumbnailExists: true, previousColourHex: "f79824" })).toBe(true)
})

test("does not skip when the thumbnail is missing", () => {
	expect(shouldSkipIcon({ thumbnailExists: false, previousColourHex: "f79824" })).toBe(false)
})

test("does not skip when there is no previous colour", () => {
	expect(shouldSkipIcon({ thumbnailExists: true, previousColourHex: undefined })).toBe(false)
})

test("does not skip when neither exists (a brand-new icon)", () => {
	expect(shouldSkipIcon({ thumbnailExists: false, previousColourHex: undefined })).toBe(false)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/incremental.test.ts`
Expected: `error: Cannot find module './incremental'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/incremental.ts`:

```ts
export function shouldSkipIcon(params: { thumbnailExists: boolean; previousColourHex: string | undefined }): boolean {
	return params.thumbnailExists && params.previousColourHex !== undefined
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/lib/incremental.test.ts`
Expected: `4 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add src/lib/incremental.ts src/lib/incremental.test.ts
git commit -m "add: pure incremental skip-check for the daily rebuild"
```

---

### Task 8: `build-assets.ts` orchestrator

**Files:**
- Create: `src/build-assets.ts`
- Modify: `package.json` (add a `build-assets` script)
- Test: `src/build-assets.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 1–7
- Produces: `data/site/index.json` (array-of-arrays manifest), `data/site/coverage.json` — the exact artefacts the site's `lib/manifest.ts` (Task 14) will decode

This orchestrator is I/O-heavy (filesystem + shelling to `magick`), so instead of pure-unit tests it gets one integration test against a temp sandbox standing in for `data/icons/large`.

- [ ] **Step 1: Write the failing test**

Create `src/build-assets.test.ts`:

```ts
import { test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { runBuildAssets } from "./build-assets"

let root: string

beforeEach(async () => {
	root = await mkdtemp(path.join(tmpdir(), "build-assets-"))
	await mkdir(path.join(root, "data", "icons", "large"), { recursive: true })
	await mkdir(path.join(root, "data"), { recursive: true })

	// two icons: one listed, one orphan
	await Bun.spawn(["magick", "-size", "8x8", "xc:red", path.join(root, "data/icons/large/bitcoin.png")]).exited
	await Bun.spawn(["magick", "-size", "8x8", "xc:blue", path.join(root, "data/icons/large/some-orphan.png")])
		.exited

	await Bun.write(
		path.join(root, "data/data.json"),
		JSON.stringify([{ id: "bitcoin", symbol: "btc", name: "Bitcoin" }]),
	)
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

test("emits a manifest row per icon file and a coverage report", async () => {
	await runBuildAssets(root)

	const manifest = await Bun.file(path.join(root, "data/site/index.json")).json()
	expect(manifest[0]).toEqual(["png", "jpg", "jpeg", "svg", "ico"])
	expect(manifest).toHaveLength(3) // ext table + 2 icon rows

	const rowsById = new Map(manifest.slice(1).map((row: unknown[]) => [row[0], row]))
	expect(rowsById.get("bitcoin")).toEqual(["bitcoin", "btc", "Bitcoin", 0, expect.any(String)])
	expect(rowsById.get("some-orphan")).toEqual(["some-orphan", "some-orphan", "some-orphan", 0, expect.any(String)])

	expect(await Bun.file(path.join(root, "data/icons/thumb64/bitcoin.webp")).exists()).toBe(true)
	expect(await Bun.file(path.join(root, "data/icons/thumb64/some-orphan.webp")).exists()).toBe(true)

	const coverage = await Bun.file(path.join(root, "data/site/coverage.json")).json()
	expect(coverage).toEqual({ orphanCount: 1, missingIconCount: 0 })
})

test("is incremental: a second run does not touch an already-processed icon's thumbnail", async () => {
	await runBuildAssets(root)
	const thumbPath = path.join(root, "data/icons/thumb64/bitcoin.webp")
	const firstMtime = (await Bun.file(thumbPath).stat()).mtimeMs

	await new Promise((resolve) => setTimeout(resolve, 10))
	await runBuildAssets(root)
	const secondMtime = (await Bun.file(thumbPath).stat()).mtimeMs

	expect(secondMtime).toBe(firstMtime)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/build-assets.test.ts`
Expected: `error: Cannot find module './build-assets'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/build-assets.ts`:

```ts
import { readdir, mkdir } from "node:fs/promises"
import path from "node:path"
import { EXT_TABLE } from "./constants"
import { CoinsListSchema } from "./types"
import { buildManifestRow, type ManifestRow } from "./lib/manifest-row"
import { normalizeExtension } from "./lib/normalize-extension"
import { generateThumbnail } from "./lib/thumbnail"
import { extractDominantColor } from "./lib/extract-color"
import { shouldSkipIcon } from "./lib/incremental"
import { computeCoverage } from "./lib/coverage"

async function loadPreviousManifest(siteDir: string): Promise<Map<string, string>> {
	const file = Bun.file(path.join(siteDir, "index.json"))
	if (!(await file.exists())) return new Map()

	const raw = (await file.json()) as [string[], ...ManifestRow[]]
	const [, ...rows] = raw
	const map = new Map<string, string>()
	for (const row of rows) {
		map.set(row[0], row[4])
	}
	return map
}

export async function runBuildAssets(root: string): Promise<void> {
	const largeDir = path.join(root, "data/icons/large")
	const thumbDir = path.join(root, "data/icons/thumb64")
	const siteDir = path.join(root, "data/site")

	await mkdir(thumbDir, { recursive: true })
	await mkdir(siteDir, { recursive: true })

	const coins = CoinsListSchema.parse(await Bun.file(path.join(root, "data/data.json")).json())
	const coinsById = new Map(coins.map((c) => [c.id, { symbol: c.symbol, name: c.name }]))

	const previousColours = await loadPreviousManifest(siteDir)
	const files = await readdir(largeDir)

	const rows: ManifestRow[] = []
	const iconIds: string[] = []

	for (const file of files) {
		const finalExt = await normalizeExtension(path.join(largeDir, file))
		if (finalExt === null) {
			console.warn(`skipping ${file}: unrecognized image format`)
			continue
		}

		const id = path.basename(file, path.extname(file))
		iconIds.push(id)

		const sourcePath = path.join(largeDir, `${id}.${finalExt}`)
		const thumbPath = path.join(thumbDir, `${id}.webp`)
		const thumbExists = await Bun.file(thumbPath).exists()
		const previousColourHex = previousColours.get(id)

		let colourHex: string
		if (shouldSkipIcon({ thumbnailExists: thumbExists, previousColourHex })) {
			colourHex = previousColourHex!
		} else {
			await generateThumbnail(sourcePath, thumbPath)
			colourHex = await extractDominantColor(sourcePath)
		}

		rows.push(buildManifestRow({ id, ext: finalExt, colourHex }, coinsById.get(id)))
	}

	await Bun.write(path.join(siteDir, "index.json"), JSON.stringify([EXT_TABLE, ...rows]))

	const coverage = computeCoverage(
		iconIds,
		coins.map((c) => c.id),
	)
	await Bun.write(path.join(siteDir, "coverage.json"), JSON.stringify(coverage, null, 2) + "\n")

	console.log(`processed ${rows.length} icons`)
	console.log(`coverage: ${coverage.orphanCount} orphans, ${coverage.missingIconCount} listed coins missing an icon`)
}

if (import.meta.main) {
	await runBuildAssets(process.cwd())
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test src/build-assets.test.ts`
Expected: `2 pass`, `0 fail`.

- [ ] **Step 5: Add the `build-assets` script**

Modify `package.json`, adding a script next to `"do-it"`:

```json
{
  "scripts": {
    "do-it": "bun run src/main.ts",
    "build-assets": "bun run src/build-assets.ts"
  }
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add src/build-assets.ts src/build-assets.test.ts package.json
git commit -m "add: build-assets orchestrator wiring thumbnails, colour and manifest emission"
```

---

### Task 9: Wire the pipeline into the daily workflow

**Files:**
- Modify: `.github/workflows/fetch-more.yml`

**Interfaces:**
- Consumes: `bun run build-assets` (Task 8)
- Produces: on every run that changes anything under `data/`, a pushed `data-YYYY-MM-DD` tag and a fired Netlify build hook — the two things `scripts/resolve-data-tag.ts` (Task 24) depends on existing

This task has one manual, non-code step: a Netlify build hook must be created once in the Netlify dashboard and stored as a GitHub secret. That cannot be scripted from here — do it before the workflow can actually fire the hook (the workflow itself degrades gracefully if the secret is absent, per Step 2 below).

- [ ] **Step 1 (manual, one-time): create the Netlify build hook and store it as a secret**

1. Open the Netlify dashboard for the `crypto-icons-display` site → **Site configuration → Build & deploy → Build hooks** → **Add build hook**. Name it `data-repo-tag`, branch `main`. Copy the generated URL.
2. In the `crypto-icons-data` GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**, name `NETLIFY_BUILD_HOOK_URL`, value the URL from step 1.

- [ ] **Step 2: Modify `.github/workflows/fetch-more.yml`**

Replace the file's contents with:

```yaml
# this should be a github action that runs every 1 hour, tries to run the project, and then creates a new pull request with the changes.

name: Fetch more

on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

jobs:
  fetch-more:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: jdx/mise-action@v4
      - name: Install ImageMagick
        run: |
          sudo apt-get update
          sudo apt-get install -y imagemagick
      - run: |
          bun install
      - name: Fetch
        env:
          COINGECKO_DEMO_API_KEY: ${{ secrets.COINGECKO_DEMO_API_KEY }}
          COINGECKO_PRO_API_KEY: ${{ secrets.COINGECKO_PRO_API_KEY }}
        run: |
          bun run do-it
      - name: Build assets (thumbnails, colours, manifest)
        run: |
          bun run build-assets
      - name: push to main
        # took this from https://github.com/mikeal/publish-to-github-action/blob/master/entrypoint.sh
        run: |
          remote_repo="https://${GITHUB_ACTOR}:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
          git config http.sslVerify false
          git config user.name "pavlobot"
          git config user.email "pavlobot@pvin.is"
          git remote add publisher "${remote_repo}"
          git show-ref # useful for debugging
          git branch --verbose

          git checkout main
          git add -A
          git commit -m "add: more icons" || exit 0
          git pull --rebase publisher main
          git push publisher main
      - name: Tag and trigger site rebuild
        env:
          NETLIFY_BUILD_HOOK_URL: ${{ secrets.NETLIFY_BUILD_HOOK_URL }}
        run: |
          if git diff --name-only HEAD~1 HEAD -- data/ | grep -q .; then
            TAG="data-$(date -u +%Y-%m-%d)"
            git tag "$TAG"
            git push publisher "$TAG"
            echo "cut tag $TAG"
            if [ -n "$NETLIFY_BUILD_HOOK_URL" ]; then
              curl -fsS -X POST "$NETLIFY_BUILD_HOOK_URL"
            else
              echo "NETLIFY_BUILD_HOOK_URL not set, skipping build hook"
            fi
          else
            echo "no changes under data/, skipping tag and build hook"
          fi
```

- [ ] **Step 3: Validate the YAML parses**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/fetch-more.yml'))" && echo VALID`
Expected: `VALID`

- [ ] **Step 4: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add .github/workflows/fetch-more.yml
git commit -m "wire build-assets, date tagging and the Netlify build hook into the daily workflow"
```

---

### Task 10: Bootstrap run — process the full corpus and cut the first tag

**Files:**
- Modifies: `data/icons/large/*` (327 renamed for lowercase extension, 6 renamed for a sniffed extension), `data/icons/thumb64/*` (new, ~11,508 files), `data/site/index.json` (new), `data/site/coverage.json` (new)

**Interfaces:**
- Produces: the first `data-YYYY-MM-DD` git tag on `crypto-icons-data`, which `data-tag.fallback.json` (Task 24) will be seeded with

No `data-*` tag exists on this repo yet (confirmed: `git tag` and the GitHub tags API both return empty). This task creates it for real, against the real 11,508-icon corpus. It is slow (colour extraction alone measures ~2.3 minutes single-threaded per the design spec) and it pushes to the real `origin` — this is the one task in this plan with a genuinely irreversible, shared-repo side effect. Confirm you intend to run it before Step 1.

- [ ] **Step 1: Run the full build-assets pipeline locally**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun run build-assets`
Expected: exits 0, prints `processed 11508 icons` and a `coverage: N orphans, M listed coins missing an icon` line (N and M will be close to, but may not exactly match, the spec's 2026-07-21 snapshot of 5,189 / 11,596 — CoinGecko's list has kept moving since).

- [ ] **Step 2: Spot-check the output**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && python3 -c "
import json
m = json.load(open('data/site/index.json'))
print('ext table:', m[0])
print('row count:', len(m) - 1)
print('sample row:', [r for r in m[1:] if r[0] == 'bitcoin'])
"`
Expected: `ext table: ['png', 'jpg', 'jpeg', 'svg', 'ico']`, `row count: 11508`, and a `sample row` containing bitcoin's id/symbol/name/extIndex/colourHex.

Run: `ls data/icons/thumb64 | wc -l`
Expected: `11508`

- [ ] **Step 3: Confirm no icon files were lost during extension normalization**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && ls data/icons/large | wc -l`
Expected: `11508` (unchanged — normalization renames in place, never deletes)

- [ ] **Step 4: Commit the generated assets**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
git add data/icons/large data/icons/thumb64 data/site
git commit -m "bootstrap: full thumbnail + colour + manifest generation for the current corpus"
```

- [ ] **Step 5: Cut and push the first data tag**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-data
TAG="data-$(date -u +%Y-%m-%d)"
git tag "$TAG"
git push origin main
git push origin "$TAG"
echo "$TAG" > /tmp/first-data-tag.txt
cat /tmp/first-data-tag.txt
```

Expected: the tag name printed (e.g. `data-2026-07-22`) — record it, it is needed verbatim in Task 24.

- [ ] **Step 6: Verify the tag is resolvable over the GitHub API and jsDelivr**

Run: `curl -s "https://api.github.com/repos/pvinis/crypto-icons-data/tags" | python3 -c "import json,sys; print([t['name'] for t in json.load(sys.stdin)])"`
Expected: a list containing the tag just pushed.

Run: `TAG=$(cat /tmp/first-data-tag.txt) && curl -sI "https://cdn.jsdelivr.net/gh/pvinis/crypto-icons-data@${TAG}/data/site/index.json" | head -1`
Expected: `HTTP/2 200` (jsDelivr may take up to a minute to pick up a brand-new tag the first time — retry once if it 404s immediately).

---

## Part B — Site scaffold

### Task 11: Dependency upgrade + Tailwind v4 + Vitest

**Files:**
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `src/index.css`, `.eslintrc.cjs` → delete, create `eslint.config.js`
- Delete: `postcss.config.js`, `tailwind.config.js`

**Interfaces:**
- Produces: a working `bun run dev` / `bun run build` / `bun run test` / `bun run lint` on current-generation tooling, with the *existing* (unmodified) `App.tsx` still rendering — this task is pure toolchain upgrade, no feature logic changes yet

- [ ] **Step 1: Replace dependencies in `package.json`**

```json
{
	"name": "crypto-icons-display",
	"version": "1.0.0",
	"type": "module",
	"scripts": {
		"dev": "vite",
		"build": "tsc -b && vite build",
		"lint": "eslint .",
		"preview": "vite preview",
		"test": "vitest run"
	},
	"dependencies": {
		"@tanstack/react-virtual": "^3.14.7",
		"react": "^19.2.8",
		"react-dom": "^19.2.8"
	},
	"devDependencies": {
		"@eslint/js": "^10.0.1",
		"@playwright/test": "^1.61.1",
		"@tailwindcss/vite": "^4.3.3",
		"@types/react": "^19.2.17",
		"@types/react-dom": "^19.2.3",
		"@vitejs/plugin-react": "^6.0.4",
		"eslint": "^10.7.0",
		"eslint-plugin-react-hooks": "^7.1.1",
		"eslint-plugin-react-refresh": "^0.5.3",
		"globals": "^17.7.0",
		"tailwindcss": "^4.3.3",
		"typescript": "^7.0.2",
		"typescript-eslint": "^8.65.0",
		"vite": "^8.1.5",
		"vitest": "^4.1.10"
	}
}
```

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun install`
Expected: exits 0, `bun.lockb` updated, no `postcss`/`autoprefixer`/old React 18 packages remain in the lockfile.

- [ ] **Step 2: Delete the Tailwind v3 / PostCSS config**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
rm postcss.config.js tailwind.config.js
```

- [ ] **Step 3: Rewrite `vite.config.ts`**

```ts
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
	plugins: [react(), tailwindcss()],
	test: {
		environment: "node",
	},
})
```

- [ ] **Step 4: Rewrite `src/index.css`**

```css
@import "tailwindcss";

@theme {
	--font-mono: "Iosevka Web", ui-monospace, SFMono-Regular, Menlo, monospace;
}

:root {
	color-scheme: light dark;
	--bg: #f7f7f8;
	--fg: #16161a;
	--muted: #6b7280;
	--surface: #ffffff;
	--border: #e5e5e8;
	--accent: #2563eb;
}

:root[data-theme="dark"] {
	color-scheme: dark;
	--bg: #101012;
	--fg: #f2f2f3;
	--muted: #9ca3af;
	--surface: #18181b;
	--border: #2a2a2e;
	--accent: #60a5fa;
}

body {
	background: var(--bg);
	color: var(--fg);
	font-family: var(--font-mono);
}
```

- [ ] **Step 5: Bump `tsconfig.json`'s target and add the vitest-friendly module setting**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "e2e", "scripts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6: Migrate ESLint to flat config**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
rm .eslintrc.cjs
```

Create `eslint.config.js`:

```js
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"

export default tseslint.config(
	{ ignores: ["dist"] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: "latest",
			globals: globals.browser,
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			"react-refresh/only-export-components": "warn",
		},
	},
)
```

- [ ] **Step 7: Verify the toolchain works end to end with the still-unmodified `App.tsx`**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run lint`
Expected: exits 0 (no errors; the existing `App.tsx` is simple enough to pass as-is).

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run build`
Expected: exits 0, `dist/index.html` and `dist/assets/*.js` produced.

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run test`
Expected: `No test files found` (no `lib/*` tests exist yet — that's expected at this point in the plan) — Vitest should still exit 0, not error.

- [ ] **Step 8: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add package.json bun.lockb vite.config.ts tsconfig.json src/index.css eslint.config.js
git add -u postcss.config.js tailwind.config.js .eslintrc.cjs
git commit -m "upgrade to React 19, Vite 8, TS 7, Tailwind v4 and Vitest"
```

---

### Task 12: Theme bootstrap (CSS custom properties + inline pre-paint script)

**Files:**
- Modify: `index.html`
- Modify: `src/index.css` (already has the light/dark variable blocks from Task 11 — this task only adds the inline script)

**Interfaces:**
- Produces: `<html data-theme="light|dark">` set before first paint, read by every later `ui/*` component via the CSS custom properties already defined in Task 11

The inline script duplicates the storage key (`cid.theme`) that `lib/prefs.ts` (Task 16) will use — it must run before any module script loads, so it cannot import from `lib/prefs.ts`. Keep both in sync if the key ever changes.

- [ ] **Step 1: Add the inline pre-paint script as the first thing in `<head>`**

Replace `index.html` with:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <script>
      (function () {
        var stored = localStorage.getItem("cid.theme")
        var theme = stored === "light" || stored === "dark" ? stored : null
        if (!theme) {
          theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
        }
        document.documentElement.setAttribute("data-theme", theme)
      })()
    </script>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Crypto Icons Display</title>
    <link href="https://pvinis.github.io/iosevka-webfont/7.0.2/iosevka.css" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify the script runs before first paint in a built output**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run build && grep -o '<script>.*setAttribute' dist/index.html | head -c 80`
Expected: non-empty output containing `setAttribute` — confirms the inline script survived the production build and precedes the stylesheet/module script in the emitted HTML (check by eye: `grep -n "script\|stylesheet\|main" dist/index.html | head -5` should show the inline `<script>` block before the `<link rel="stylesheet">`/module script lines).

- [ ] **Step 3: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add index.html
git commit -m "add inline pre-paint theme script to avoid a flash of the wrong theme"
```

---

## Part C — `lib/*` modules (TDD)

### Task 13: `lib/urls.ts`

**Files:**
- Create: `src/lib/urls.ts`
- Test: `src/lib/urls.test.ts`

**Interfaces:**
- Consumes: `IconRow` type (defined here temporarily, re-exported from `lib/manifest.ts` once Task 14 lands — see note below), `import.meta.env.VITE_DATA_TAG`
- Produces: `getThumbUrl(row: IconRow): string`, `getOriginalUrl(row: IconRow): string`, `getCoinGeckoUrl(row: IconRow): string`, `getManifestUrl(): string` — **every** CDN URL in the site, including the manifest URL itself, is built here; `App.tsx` (Task 21) must never construct one inline

`IconRow` is defined in this task (Task 13 runs before Task 14) and re-used by `lib/manifest.ts` in Task 14 — both tasks agree on the exact same shape: `{ id: string; symbol: string; name: string; ext: string; colourHex: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/urls.test.ts`:

```ts
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
		vi.unstubAllEnvs()
		expect(() => getThumbUrl(row)).toThrow(/VITE_DATA_TAG/)
	})
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run src/lib/urls.test.ts`
Expected: fails to resolve `./urls`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/urls.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run src/lib/urls.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 5 passed (5)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/lib/urls.ts src/lib/urls.test.ts
git commit -m "add: lib/urls.ts, the site's sole CDN-aware module"
```

---

### Task 14: `lib/manifest.ts`

**Files:**
- Create: `src/lib/manifest.ts`
- Test: `src/lib/manifest.test.ts`

**Interfaces:**
- Consumes: `IconRow` type from `./urls` (Task 13) — re-exported from this module so the rest of the app imports `IconRow` from `lib/manifest.ts`
- Produces: `type ManifestResult = { rows: IconRow[]; droppedCount: number }`; `decodeManifest(payload: unknown): ManifestResult`; `fetchManifest(url: string): Promise<ManifestResult>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/manifest.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run src/lib/manifest.test.ts`
Expected: fails to resolve `./manifest`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/manifest.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run src/lib/manifest.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 8 passed (8)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/lib/manifest.ts src/lib/manifest.test.ts
git commit -m "add: lib/manifest.ts — decode + defensively drop malformed rows"
```

---

### Task 15: `lib/search.ts`

**Files:**
- Create: `src/lib/search.ts`
- Test: `src/lib/search.test.ts`

**Interfaces:**
- Consumes: `IconRow` from `./manifest`
- Produces: `searchIcons(rows: IconRow[], query: string): IconRow[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/search.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run src/lib/search.test.ts`
Expected: fails to resolve `./search`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/search.ts`:

```ts
import type { IconRow } from "./manifest"

export function searchIcons(rows: IconRow[], query: string): IconRow[] {
	const q = query.trim().toLowerCase()
	if (q.length === 0) return rows
	return rows.filter(
		(row) =>
			row.name.toLowerCase().includes(q) || row.symbol.toLowerCase().includes(q) || row.id.toLowerCase().includes(q),
	)
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run src/lib/search.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/lib/search.ts src/lib/search.test.ts
git commit -m "add: lib/search.ts — naive case-insensitive filter over name/symbol/id"
```

---

### Task 16: `lib/prefs.ts`

**Files:**
- Create: `src/lib/prefs.ts`
- Test: `src/lib/prefs.test.ts`

**Interfaces:**
- Produces: `type Density = "comfortable" | "cosy" | "compact" | "dense"`, `type Wash = "off" | "light" | "medium" | "bold"`, `type ThemePref = "system" | "light" | "dark"`, `DENSITY_STEPS: Record<Density, number>` (min card width in px), `WASH_STEPS: Record<Wash, number>` (opacity 0–1), `DEFAULT_DENSITY/DEFAULT_WASH/DEFAULT_THEME`, `getDensity/setDensity`, `getWash/setWash`, `getTheme/setTheme`, `resolveEffectiveTheme(pref: ThemePref): "light" | "dark"`

`DENSITY_STEPS` and `WASH_STEPS`' exact numbers are a judgement call — the spec only pins Cosy as the default and Medium at 0.30. The chosen values are `{ comfortable: 160, cosy: 130, compact: 100, dense: 72 }` and `{ off: 0, light: 0.15, medium: 0.30, bold: 0.45 }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/prefs.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run src/lib/prefs.test.ts`
Expected: fails to resolve `./prefs`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/prefs.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run src/lib/prefs.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 7 passed (7)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/lib/prefs.ts src/lib/prefs.test.ts
git commit -m "add: lib/prefs.ts — density/wash/theme with localStorage round-trip"
```

---

## Part D — `ui/*` components

These are not unit-tested (per the design spec: "not unit-testing the visual layer — it's the part that changes most and tests there pay least"). Each task's verification step is a build/lint check; full behavioural verification happens in Task 23's E2E test and Task 25's manual pass.

### Task 17: `ui/Controls.tsx`

**Files:**
- Create: `src/ui/Controls.tsx`

**Interfaces:**
- Consumes: `Density`, `Wash`, `ThemePref` types from `../lib/prefs`
- Produces: `Controls` component with props `{ query: string; onQueryChange: (v: string) => void; density: Density; onDensityChange: (v: Density) => void; wash: Wash; onWashChange: (v: Wash) => void; theme: ThemePref; onThemeChange: (v: ThemePref) => void; resultCount: number }`

- [ ] **Step 1: Write the component**

Create `src/ui/Controls.tsx`:

```tsx
import type { Density, ThemePref, Wash } from "../lib/prefs"

type ControlsProps = {
	query: string
	onQueryChange: (value: string) => void
	density: Density
	onDensityChange: (value: Density) => void
	wash: Wash
	onWashChange: (value: Wash) => void
	theme: ThemePref
	onThemeChange: (value: ThemePref) => void
	resultCount: number
}

const DENSITY_OPTIONS: Density[] = ["comfortable", "cosy", "compact", "dense"]
const WASH_OPTIONS: Wash[] = ["off", "light", "medium", "bold"]
const THEME_OPTIONS: ThemePref[] = ["system", "light", "dark"]

export function Controls({
	query,
	onQueryChange,
	density,
	onDensityChange,
	wash,
	onWashChange,
	theme,
	onThemeChange,
	resultCount,
}: ControlsProps) {
	return (
		<header className="flex flex-wrap items-center gap-4 border-b border-[var(--border)] p-4">
			<input
				type="text"
				placeholder="Search by name, symbol, or id"
				value={query}
				onChange={(event) => onQueryChange(event.target.value)}
				className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5"
				data-testid="search-input"
			/>
			<span className="text-sm text-[var(--muted)]">{resultCount.toLocaleString()} icons</span>

			<label className="flex items-center gap-2 text-sm">
				Density
				<select
					value={density}
					onChange={(event) => onDensityChange(event.target.value as Density)}
					data-testid="density-select"
				>
					{DENSITY_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</label>

			<label className="flex items-center gap-2 text-sm">
				Wash
				<select
					value={wash}
					onChange={(event) => onWashChange(event.target.value as Wash)}
					data-testid="wash-select"
				>
					{WASH_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</label>

			<label className="flex items-center gap-2 text-sm">
				Theme
				<select
					value={theme}
					onChange={(event) => onThemeChange(event.target.value as ThemePref)}
					data-testid="theme-select"
				>
					{THEME_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
				</select>
			</label>
		</header>
	)
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bunx tsc -b --noEmit`
Expected: exits 0 (it will report `App.tsx` is unaffected since nothing imports `Controls` yet — that wiring happens in Task 21).

- [ ] **Step 3: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/ui/Controls.tsx
git commit -m "add: ui/Controls.tsx — search box and density/wash/theme selects"
```

---

### Task 18: `ui/Card.tsx`

**Files:**
- Create: `src/ui/Card.tsx`
- Modify: `src/index.css` (wash background, card-actions hover/touch rule, fallback-tile rule)

**Interfaces:**
- Consumes: `IconRow` from `../lib/manifest`, `WASH_STEPS`/`Density`/`Wash` from `../lib/prefs`, `getThumbUrl`/`getOriginalUrl` from `../lib/urls`
- Produces: `Card` component, props `{ row: IconRow; density: Density; wash: Wash; onSelect: (row: IconRow) => void }`

- [ ] **Step 1: Add the card/wash/fallback CSS**

Append to `src/index.css`:

```css
.icon-grid-row {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(var(--card), 1fr));
	gap: 12px;
	padding: 0 12px;
}

.icon-card {
	position: relative;
	border-radius: 12px;
	overflow: hidden;
	background-image: radial-gradient(
		circle at 50% 35%,
		color-mix(in srgb, var(--wash-color) calc(var(--wash-opacity) * 100%), transparent) 0%,
		transparent 72%
	);
}

.card-actions {
	opacity: 0;
	transition: opacity 120ms ease;
}
.icon-card:hover .card-actions,
.icon-card:focus-within .card-actions {
	opacity: 1;
}
@media (hover: none) {
	.card-actions {
		opacity: 1;
	}
}

.icon-fallback-label {
	display: none;
}
.icon-fallback .icon-fallback-label {
	display: inline;
}
.icon-fallback {
	background: var(--border);
}
```

- [ ] **Step 2: Write the component**

Create `src/ui/Card.tsx`:

```tsx
import type { CSSProperties, ReactEventHandler } from "react"
import type { IconRow } from "../lib/manifest"
import { WASH_STEPS, type Density, type Wash } from "../lib/prefs"
import { getOriginalUrl, getThumbUrl } from "../lib/urls"

type CardProps = {
	row: IconRow
	density: Density
	wash: Wash
	onSelect: (row: IconRow) => void
}

async function copyToClipboard(text: string): Promise<boolean> {
	if (!navigator.clipboard) return false
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		return false
	}
}

export function Card({ row, density, wash, onSelect }: CardProps) {
	const showLabel = density === "comfortable" || density === "cosy"

	const style = {
		"--wash-color": `#${row.colourHex}`,
		"--wash-opacity": WASH_STEPS[wash],
	} as CSSProperties

	const handleImageError: ReactEventHandler<HTMLImageElement> = (event) => {
		event.currentTarget.style.display = "none"
		event.currentTarget.closest(".icon-card")?.classList.add("icon-fallback")
	}

	return (
		<div className="icon-card group flex flex-col items-center p-3" style={style} data-testid="icon-card">
			<button type="button" className="flex flex-col items-center gap-2" onClick={() => onSelect(row)}>
				<img
					src={getThumbUrl(row)}
					alt={row.name}
					width={64}
					height={64}
					loading="lazy"
					decoding="async"
					onError={handleImageError}
				/>
				<span className="icon-fallback-label text-xs font-semibold">{row.symbol.toUpperCase()}</span>
				{showLabel ? <span className="text-xs text-[var(--muted)]">{row.name}</span> : null}
			</button>
			<div className="card-actions absolute right-2 top-2 flex gap-1">
				<button
					type="button"
					aria-label="Copy thumbnail URL"
					data-testid="copy-thumb-button"
					onClick={() => copyToClipboard(getThumbUrl(row))}
				>
					⧉
				</button>
				<a href={getOriginalUrl(row)} download aria-label="Download original icon" data-testid="download-button">
					⇩
				</a>
			</div>
		</div>
	)
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bunx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/ui/Card.tsx src/index.css
git commit -m "add: ui/Card.tsx — colour-wash card with hover/touch actions and 404 fallback"
```

---

### Task 19: `ui/Detail.tsx`

**Files:**
- Create: `src/ui/Detail.tsx`

**Interfaces:**
- Consumes: `IconRow` from `../lib/manifest`, `getThumbUrl`/`getOriginalUrl`/`getCoinGeckoUrl` from `../lib/urls`
- Produces: `Detail` component, props `{ row: IconRow; onClose: () => void }`

Note on the design spec's "all three size URLs": the pipeline (Part A) only ever produces **two** image artefacts per icon — the 64px thumbnail and the untouched original. There is no third derived size anywhere in the spec's Part 1 pipeline description. This is treated as a stale phrase carried over from the old three-size (`thumb`/`small`/`large`) CoinGecko mirror, and the detail sheet below shows the two URLs the pipeline actually produces. Flagged for the spec author.

- [ ] **Step 1: Write the component**

Create `src/ui/Detail.tsx`:

```tsx
import { useState, type CSSProperties } from "react"
import type { IconRow } from "../lib/manifest"
import { getCoinGeckoUrl, getOriginalUrl, getThumbUrl } from "../lib/urls"

type DetailProps = {
	row: IconRow
	onClose: () => void
}

const SIZE_URLS = (row: IconRow): Array<[string, string]> => [
	["Thumbnail (64×64 WebP)", getThumbUrl(row)],
	["Original", getOriginalUrl(row)],
]

export function Detail({ row, onClose }: DetailProps) {
	const clipboardSupported = typeof navigator !== "undefined" && Boolean(navigator.clipboard)
	const [copiedField, setCopiedField] = useState<string | null>(null)

	const copy = async (label: string, text: string) => {
		if (!clipboardSupported) return
		await navigator.clipboard.writeText(text)
		setCopiedField(label)
		setTimeout(() => setCopiedField((current) => (current === label ? null : current)), 1500)
	}

	const swatchStyle = { background: `#${row.colourHex}` } as CSSProperties

	return (
		<div className="fixed inset-0 z-10 grid place-items-center bg-black/40" onClick={onClose}>
			<div
				className="w-full max-w-md rounded-lg bg-[var(--surface)] p-6"
				onClick={(event) => event.stopPropagation()}
				data-testid="detail-sheet"
			>
				<button type="button" onClick={onClose} aria-label="Close">
					✕
				</button>

				<img src={getOriginalUrl(row)} alt={row.name} width={128} height={128} />
				<h2 className="text-lg font-semibold">{row.name}</h2>
				<p className="text-sm text-[var(--muted)]">
					{row.symbol.toUpperCase()} · {row.id}
				</p>

				<button
					type="button"
					style={swatchStyle}
					className="h-8 w-8 rounded-full border border-[var(--border)]"
					aria-label={`Copy colour hex #${row.colourHex}`}
					onClick={() => copy("colour", `#${row.colourHex}`)}
				>
					{copiedField === "colour" ? "✓" : null}
				</button>

				{SIZE_URLS(row).map(([label, url]) => (
					<div key={label} className="flex items-center gap-2 text-sm">
						<span className="w-40 shrink-0">{label}</span>
						{clipboardSupported ? (
							<button type="button" onClick={() => copy(label, url)}>
								{copiedField === label ? "Copied!" : "Copy"}
							</button>
						) : (
							<input readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
						)}
					</div>
				))}

				<a href={getCoinGeckoUrl(row)} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
					View on CoinGecko
				</a>
			</div>
		</div>
	)
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bunx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/ui/Detail.tsx
git commit -m "add: ui/Detail.tsx — preview, hex swatch, size URLs, CoinGecko link"
```

---

### Task 20: `ui/Grid.tsx`

**Files:**
- Create: `src/ui/Grid.tsx`

**Interfaces:**
- Consumes: `IconRow` from `../lib/manifest`, `DENSITY_STEPS`/`Density`/`Wash` from `../lib/prefs`, `Card` from `./Card`, `useVirtualizer` from `@tanstack/react-virtual`
- Produces: `Grid` component, props `{ rows: IconRow[]; density: Density; wash: Wash; onSelect: (row: IconRow) => void }`

The column count is computed in JS from the measured container width using the same `floor((width+gap)/(cardWidth+gap))` formula the CSS `auto-fill` track algorithm effectively applies, so each virtualized row's card count lines up with what the CSS grid actually renders.

- [ ] **Step 1: Write the component**

Create `src/ui/Grid.tsx`:

```tsx
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { IconRow } from "../lib/manifest"
import { DENSITY_STEPS, type Density, type Wash } from "../lib/prefs"
import { Card } from "./Card"

const GAP = 12
const LABEL_HEIGHT = 44
const NO_LABEL_HEIGHT = 16

type GridProps = {
	rows: IconRow[]
	density: Density
	wash: Wash
	onSelect: (row: IconRow) => void
}

export function Grid({ rows, density, wash, onSelect }: GridProps) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const [containerWidth, setContainerWidth] = useState(0)

	useEffect(() => {
		const el = scrollRef.current
		if (!el) return
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0]
			if (entry) setContainerWidth(entry.contentRect.width)
		})
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	const cardWidth = DENSITY_STEPS[density]
	const columns = Math.max(1, Math.floor((containerWidth + GAP) / (cardWidth + GAP)))
	const rowCount = Math.ceil(rows.length / columns)
	const showLabels = density === "comfortable" || density === "cosy"
	const rowHeight = cardWidth + (showLabels ? LABEL_HEIGHT : NO_LABEL_HEIGHT)

	const virtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => rowHeight,
		overscan: 4,
	})

	useEffect(() => {
		virtualizer.measure()
	}, [columns, rowHeight, virtualizer])

	if (rows.length === 0) {
		return (
			<div className="p-12 text-center text-[var(--muted)]">
				<p>No icons match your search.</p>
			</div>
		)
	}

	return (
		<div ref={scrollRef} style={{ height: "calc(100vh - 64px)", overflow: "auto" }} data-testid="icon-grid">
			<div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
				{virtualizer.getVirtualItems().map((virtualRow) => {
					const start = virtualRow.index * columns
					const rowItems = rows.slice(start, start + columns)
					const style = {
						position: "absolute",
						top: 0,
						left: 0,
						width: "100%",
						transform: `translateY(${virtualRow.start}px)`,
						"--card": `${cardWidth}px`,
					} as CSSProperties

					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="icon-grid-row"
							style={style}
						>
							{rowItems.map((row) => (
								<Card key={row.id} row={row} density={density} wash={wash} onSelect={onSelect} />
							))}
						</div>
					)
				})}
			</div>
		</div>
	)
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bunx tsc -b --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/ui/Grid.tsx
git commit -m "add: ui/Grid.tsx — windowed auto-fill grid via @tanstack/react-virtual"
```

---

## Part E — Wiring

### Task 21: Rewrite `src/App.tsx`

**Files:**
- Modify: `src/App.tsx` (full rewrite)

**Interfaces:**
- Consumes: `fetchManifest`/`IconRow` from `./lib/manifest`, `getManifestUrl` from `./lib/urls`, `searchIcons` from `./lib/search`, everything from `./lib/prefs`, `Controls`/`Grid`/`Detail` from `./ui/*`
- Produces: the app's root component, rendered by `src/main.tsx` (unchanged)

- [ ] **Step 1: Rewrite `src/App.tsx`**

```tsx
import { useDeferredValue, useEffect, useState } from "react"
import { fetchManifest, type IconRow } from "./lib/manifest"
import { getManifestUrl } from "./lib/urls"
import { searchIcons } from "./lib/search"
import {
	getDensity,
	getTheme,
	getWash,
	resolveEffectiveTheme,
	setDensity,
	setTheme,
	setWash,
	type Density,
	type ThemePref,
	type Wash,
} from "./lib/prefs"
import { Controls } from "./ui/Controls"
import { Grid } from "./ui/Grid"
import { Detail } from "./ui/Detail"

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rows: IconRow[] }

export function App() {
	const [state, setState] = useState<LoadState>({ status: "loading" })
	const [query, setQuery] = useState("")
	const deferredQuery = useDeferredValue(query)
	const [density, setDensityState] = useState<Density>(() => getDensity())
	const [wash, setWashState] = useState<Wash>(() => getWash())
	const [theme, setThemeState] = useState<ThemePref>(() => getTheme())
	const [selected, setSelected] = useState<IconRow | null>(null)

	const load = () => {
		setState({ status: "loading" })
		fetchManifest(getManifestUrl())
			.then((result) => setState({ status: "ready", rows: result.rows }))
			.catch((error: Error) => setState({ status: "error", message: error.message }))
	}

	useEffect(load, [])

	useEffect(() => {
		document.documentElement.setAttribute("data-theme", resolveEffectiveTheme(theme))
		if (theme !== "system") return
		const media = matchMedia("(prefers-color-scheme: dark)")
		const onChange = () => document.documentElement.setAttribute("data-theme", resolveEffectiveTheme("system"))
		media.addEventListener("change", onChange)
		return () => media.removeEventListener("change", onChange)
	}, [theme])

	const handleDensityChange = (value: Density) => {
		setDensity(value)
		setDensityState(value)
	}
	const handleWashChange = (value: Wash) => {
		setWash(value)
		setWashState(value)
	}
	const handleThemeChange = (value: ThemePref) => {
		setTheme(value)
		setThemeState(value)
	}

	if (state.status === "loading") {
		return (
			<div className="grid h-screen place-items-center">
				<p>Loading icons…</p>
			</div>
		)
	}

	if (state.status === "error") {
		return (
			<div className="grid h-screen place-items-center gap-4">
				<p>Couldn't load the icon manifest: {state.message}</p>
				<button type="button" className="border border-[var(--border)] px-4 py-2" onClick={load}>
					Retry
				</button>
			</div>
		)
	}

	const visibleRows = searchIcons(state.rows, deferredQuery)

	return (
		<div className="min-h-screen">
			<Controls
				query={query}
				onQueryChange={setQuery}
				density={density}
				onDensityChange={handleDensityChange}
				wash={wash}
				onWashChange={handleWashChange}
				theme={theme}
				onThemeChange={handleThemeChange}
				resultCount={visibleRows.length}
			/>
			<Grid rows={visibleRows} density={density} wash={wash} onSelect={setSelected} />
			{selected ? <Detail row={selected} onClose={() => setSelected(null)} /> : null}
		</div>
	)
}
```

- [ ] **Step 2: Verify it type-checks and builds**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bunx tsc -b --noEmit`
Expected: exits 0.

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run build`
Expected: exits 0, `dist/` produced (this build will fail at the `getManifestUrl()` **call site only if invoked** — since `import.meta.env.VITE_DATA_TAG` is read lazily inside `tag()`, a missing env var does not fail the build itself, only a runtime call in the browser; Task 24 wires the real value in before this matters for a production build).

- [ ] **Step 3: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add src/App.tsx
git commit -m "rewrite App.tsx: manifest fetch state machine, wires Controls/Grid/Detail"
```

---

### Task 22: Error, empty, and touch-responsive polish

**Files:**
- Modify: `src/App.tsx` (loading/error copy already in place from Task 21 — this task adds a check that the retry button actually works and that `Grid`'s empty state is reachable)
- Modify: `src/index.css` (confirm `@media (hover: none)` rule from Task 18 covers Card actions; no additional CSS needed)

This task is a verification pass over states already implemented across Tasks 18/20/21, not new code — the design spec's four error/empty cases (manifest fetch fails → retry button; individual image 404 → fallback tile; clipboard unavailable → selectable input; search matches nothing → empty state) are each satisfied by code already written:

| Case | Where it's handled |
|---|---|
| Manifest fetch fails | `App.tsx`'s `state.status === "error"` branch + `Retry` button calling `load()` |
| Individual image 404s | `Card.tsx`'s `onError` → `.icon-fallback` class → ticker label shown, broken `<img>` hidden |
| Clipboard API unavailable | `Detail.tsx`'s `clipboardSupported` branch → read-only `<input>` |
| Search matches nothing | `Grid.tsx`'s `rows.length === 0` branch |

- [ ] **Step 1: Manually verify each case with the dev server**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run dev` (leave running)

In a browser at the printed local URL:
1. Type a query that matches nothing (e.g. `zzzzzznotanicon`) into the search box → expect "No icons match your search."
2. Open devtools → Network → set to offline, click the search box then reload → expect the "Couldn't load the icon manifest" error screen with a working `Retry` button (re-enable the network first, then click Retry, and confirm the grid loads).
3. Resize the browser to a narrow (phone-width) viewport and confirm the card actions (copy/download) are visible without hovering — this exercises the `@media (hover: none)` rule (devtools' device-emulation touch mode also flips `hover: none`).

Stop the dev server: `Ctrl-C` in that terminal.

- [ ] **Step 2: Commit (if any adjustment was needed; otherwise skip — no diff)**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git status --short
```

If clean, no commit is needed for this task — proceed to Task 23. If the manual pass surfaced a real fix, make it, then:

```bash
git add -A
git commit -m "fix: address issue found during error/empty/touch verification pass"
```

---

## Part F — E2E + build/deploy verification

### Task 23: Playwright E2E smoke test

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/smoke.spec.ts`
- Modify: `package.json` (add an `e2e` script)

**Interfaces:**
- Consumes: the built site served by `vite preview`
- Produces: the one required E2E test from the design spec ("the built site loads, the grid renders, search narrows it, a copy action puts the right URL on the clipboard")

This test needs a real pinned tag to resolve real thumbnail/manifest URLs against the live CDN — it runs against `data-tag.fallback.json`'s value once Task 24 lands (Task 24 runs immediately after this one; until then, run this test with `VITE_DATA_TAG` set manually to the tag cut in Task 10).

- [ ] **Step 1: Add the `e2e` script and Playwright config**

Modify `package.json`, adding under `scripts`:

```json
{
  "scripts": {
    "e2e": "playwright test"
  }
}
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test"

export default defineConfig({
	testDir: "./e2e",
	webServer: {
		command: "bun run preview -- --port 4321",
		url: "http://localhost:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
	},
	use: {
		baseURL: "http://localhost:4321",
	},
})
```

- [ ] **Step 2: Install the Playwright browser binary**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bunx playwright install chromium`
Expected: exits 0, downloads the Chromium build for Playwright.

- [ ] **Step 3: Write the test**

Create `e2e/smoke.spec.ts`:

```ts
import { test, expect } from "@playwright/test"

test("loads the grid, narrows via search, and copies a thumbnail URL", async ({ page, context }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"])

	await page.goto("/")

	const firstCard = page.locator('[data-testid="icon-card"]').first()
	await expect(firstCard).toBeVisible({ timeout: 15_000 })

	const initialCount = await page.locator('[data-testid="icon-card"]').count()

	await page.locator('[data-testid="search-input"]').fill("bitcoin")
	await expect(page.locator('[data-testid="icon-card"]').first()).toBeVisible()
	const narrowedCount = await page.locator('[data-testid="icon-card"]').count()
	expect(narrowedCount).toBeLessThan(initialCount)

	await page.locator('[data-testid="copy-thumb-button"]').first().click()
	const copied = await page.evaluate(() => navigator.clipboard.readText())
	expect(copied).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/pvinis\/crypto-icons-data@.+\/data\/icons\/thumb64\/.+\.webp$/)
})
```

- [ ] **Step 4: Build and run the test**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && VITE_DATA_TAG=$(cat /tmp/first-data-tag.txt) bun run build && bun run e2e`
Expected: `1 passed` (Playwright's summary line).

- [ ] **Step 5: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add playwright.config.ts e2e/smoke.spec.ts package.json bun.lockb
git commit -m "add: Playwright E2E smoke test — load, search, copy-to-clipboard"
```

---

### Task 24: Resolve the pinned data tag at build time

**Files:**
- Create: `scripts/resolve-data-tag.ts`
- Create: `data-tag.fallback.json`
- Modify: `package.json` (add a `prebuild` script; Bun runs it automatically before `build`, matching npm's pre/post script convention)
- Modify: `.gitignore` (ignore the generated `.env.local`)
- Test: `scripts/resolve-data-tag.test.ts` (the pure tag-picking logic only — the network call itself is exercised manually in Step 5)

**Interfaces:**
- Consumes: `https://api.github.com/repos/pvinis/crypto-icons-data/tags` (public, unauthenticated), `data-tag.fallback.json`
- Produces: `.env.local` containing `VITE_DATA_TAG=<tag>`, which Vite auto-loads before `vite build` — the single place any tag string is chosen for a production build

- [ ] **Step 1: Write the failing test for the pure tag-selection logic**

Create `scripts/resolve-data-tag.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run scripts/resolve-data-tag.test.ts`
Expected: fails to resolve `./resolve-data-tag`.

- [ ] **Step 3: Write the implementation**

Create `scripts/resolve-data-tag.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run vitest run scripts/resolve-data-tag.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 4 passed (4)`.

- [ ] **Step 5: Seed the fallback file with the real tag from Task 10, wire the prebuild script, and verify manually**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
cat > data-tag.fallback.json <<EOF
{ "tag": "$(cat /tmp/first-data-tag.txt)" }
EOF
cat data-tag.fallback.json
```

Expected: prints `{ "tag": "data-2026-07-22" }` (or whatever tag Task 10 actually cut).

Modify `package.json`, adding `prebuild` next to `build`:

```json
{
  "scripts": {
    "prebuild": "bun run scripts/resolve-data-tag.ts",
    "build": "tsc -b && vite build"
  }
}
```

Modify `.gitignore`, adding:

```
.env.local
```

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run build && cat .env.local`
Expected: `resolve-data-tag: using "data-2026-07-22"` (or the real tag) printed to stdout, and `.env.local` containing `VITE_DATA_TAG=data-2026-07-22`.

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && grep -o 'thumb64/[^"]*\.webp' dist/assets/*.js | head -1`
Expected: nothing (the tag is inlined via `import.meta.env`, but individual icon URLs are only ever built at runtime from row data — this is expected; instead confirm the tag itself is inlined):

Run: `grep -o 'crypto-icons-data@[a-z0-9-]*' dist/assets/*.js | head -1`
Expected: `crypto-icons-data@data-2026-07-22` (or the real tag) — confirms `VITE_DATA_TAG` was baked into the production bundle.

- [ ] **Step 6: Commit**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git add scripts/resolve-data-tag.ts scripts/resolve-data-tag.test.ts data-tag.fallback.json package.json .gitignore
git commit -m "add: build-time data tag resolution with a committed fallback"
```

---

### Task 25: Final build and deploy verification

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1–24

- [ ] **Step 1: Full clean build**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && rm -rf dist .env.local && bun run build`
Expected: exits 0. `du -sh dist` should be well under 1MB (no icon binaries are bundled — only JS/CSS/HTML; icons are fetched from the CDN at runtime).

- [ ] **Step 2: Full test suite, one command**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-display && bun run test && bun run e2e`
Expected: all Vitest suites pass (Tasks 13–16, 24 → 4 files, ~24 tests) and the Playwright smoke test passes (`1 passed`).

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && bun test`
Expected: all `bun:test` suites pass (Tasks 1–8 → 7 files).

- [ ] **Step 3: Confirm the Netlify build command**

Open the Netlify dashboard for `crypto-icons.dev` → **Site configuration → Build & deploy → Build settings**. Confirm the build command is `bun run build` (or equivalent) and the publish directory is `dist`. No `netlify.toml` is introduced by this plan — the tag resolution is entirely self-contained in `prebuild`, requiring no new Netlify environment variables.

- [ ] **Step 4: Push and watch the deploy**

```bash
cd /Users/pavlos/Source/projects/crypto-icons-display
git push origin main
```

In the Netlify dashboard, confirm a new deploy triggers and succeeds. Visit `https://crypto-icons.dev` and confirm:
- The grid renders with real icons and colour washes within ~1.5s on a warm connection.
- Searching narrows the grid live.
- Toggling density changes card size and, at Compact/Dense, hides names.
- Toggling the theme switches light/dark without a flash on reload.
- Clicking a card opens the detail sheet with a working colour-hex copy and CoinGecko link.

- [ ] **Step 5: Confirm the data-repo workflow can drive the whole loop end to end**

Run: `cd /Users/pavlos/Source/projects/crypto-icons-data && gh workflow run fetch-more.yml`
Expected: exits 0 (queues the workflow). Watch it via `gh run watch` or the Actions tab; confirm the run's log shows either "no changes under data/, skipping tag and build hook" (if CoinGecko had nothing new) or a newly cut tag plus a `200`/`204` response from the Netlify build hook curl call.

This closes the loop described in the design spec: a daily data-repo commit → a new tag → a fired build hook → a Netlify rebuild that resolves that same tag via `scripts/resolve-data-tag.ts` → a live site pointing at the new icons.

---

## Self-Review

**Spec coverage** — walked every section of the design spec against the tasks above:
- Thumbnails (64×64, fit-inside, transparent bg) → Task 4, validated against a real icon before writing.
- Dominant colour (vivid/frequent hue, ignore transparency/grey/near-white/near-black, saturation-weighted) → Tasks 2 & 5, validated against real Bitcoin/BNB/Chainlink/IOST icons before writing.
- `extIndex` table, frozen/append-only, `colourHex` without `#` → Task 1 (`EXT_TABLE`), Task 6 (row builder), Task 14 (site decode).
- Icons-only coverage (11,508 rows, name/orphan fallback) → Task 6 (business-logic fallback) + Task 14 (defensive fallback) + Task 8 (orchestrator only iterates real files).
- `coverage.json` (orphan count, missing-icon count) → Task 1 + Task 8.
- Incremental rebuild → Task 7 + Task 8's second test.
- jsDelivr URLs, pinned tag, `lib/urls.ts` as sole CDN-aware module → Task 13, enforced by routing the manifest URL through it too (not just thumb/original).
- Tag propagation (daily workflow cuts tag, fires build hook; site resolves via GitHub API once at build, falls back to committed tag on failure) → Task 9 + Task 24.
- Module list and responsibilities → Tasks 13–20 match the spec's table exactly.
- Windowing via `@tanstack/react-virtual`, `auto-fill`/`minmax(var(--card),1fr)` → Task 20.
- Density steps (4, default Cosy) and wash steps (4, default Medium/0.30) → Task 16.
- Theme (system default, manual override, no-FOUC inline script) → Tasks 11, 12, 21.
- Search (naive `includes()`, `useDeferredValue`) → Task 15 + Task 21.
- Images (`lazy`/`async`/explicit dimensions) → Task 18.
- Card hover/click behaviour, touch persistence → Task 18.
- All four error/empty states → Tasks 18, 19, 20, 21, verified together in Task 22.
- Testing philosophy (`lib/` unit-tested, colour extraction fixture-tested in the data repo, one E2E smoke test, UI not unit-tested) → Tasks 1–8 (bun:test), 13–16 (Vitest), 23 (Playwright).
- Tailwind v4 upgrade, React 19/current Vite/current TS → Task 11.
- Grey washes left as-is → explicitly asserted in Task 5's IOST test and stated in the Global Constraints.
- Success criteria (FCP <1.5s, manifest ≤150KB gzip, full screen <1.5MB, 60fps, no blank tiles, both themes deliberate, durable copied URLs) → addressed structurally by Tasks 8/10 (manifest size is a direct consequence of the row count, not separately re-verified byte-for-byte since Task 10 already reports real row counts) and manually checked in Task 25 Step 4.

**Placeholder scan** — searched for "TBD"/"similar to"/hand-wavy instructions; none found. Every code step above contains complete, runnable code (all shelling/fixture commands were executed for real against the actual repos before being written into this plan, not guessed).

**Type consistency** — cross-checked signatures used across tasks:
- `IconRow` is defined once, in `lib/urls.ts` (Task 13), and re-exported unchanged from `lib/manifest.ts` (Task 14) — every later consumer (`lib/search.ts`, `ui/Card.tsx`, `ui/Detail.tsx`, `ui/Grid.tsx`, `App.tsx`) imports it from `lib/manifest.ts`, matching the spec's dependency table ("`lib/search.ts` depends on manifest rows").
- `Density`/`Wash`/`ThemePref` and every `DENSITY_STEPS`/`WASH_STEPS`/`DEFAULT_*` constant are defined once in `lib/prefs.ts` (Task 16) and consumed identically by `Controls`, `Card`, `Grid`, and `App`.
- `ManifestRow` (data-repo tuple type, Task 6) and the site's `IconRow` (Task 13/14) are deliberately different shapes at the boundary — the site's `decodeManifest` is what converts one into the other; this is correct, not an inconsistency, but is called out here so a fresh implementer doesn't conflate them.

## Known gaps and judgement calls (for review)

Reported honestly, as requested — flagged inline in the plan too, repeated here for visibility:

1. **"All three size URLs" in the spec's Detail-sheet section doesn't match the rest of the spec.** The pipeline (Part 1) only ever produces two image artefacts per icon (64px thumbnail, untouched original) — there is no third derived size anywhere else in the spec. Task 19 implements exactly two URLs and documents this as a likely leftover from the old three-size CoinGecko mirror. **Needs a decision**: either confirm two is correct, or specify what the third size should be (and add a pipeline step to produce it).
2. **Density pixel widths and wash opacity steps are invented.** The spec pins only Cosy as default (with a loose "~9 across on desktop" description) and Medium at exactly 0.30. The other three density widths (`160/100/72`) and three wash opacities (`0/0.15/0.45`) in Task 16 are a reasonable, monotonic judgement call, not derived from anything in the spec.
3. **Orphan symbol fallback isn't in the spec.** The spec only describes falling back to `id` for an orphan's *name*; Task 6 also falls back to `id` for *symbol* (no other source exists), and Task 14's decode layer defensively re-applies the name fallback for empty strings.
4. **Data-repo test runner (`bun:test`) vs. the "Vitest" global constraint.** The spec's Vitest requirement is scoped explicitly to the site's `lib/`; the data repo has no JS test tooling today and is Bun-native throughout, so this plan uses `bun:test` there instead of introducing a second framework. Flagged in Global Constraints, not hidden.
5. **E2E tool choice (Playwright) isn't named in the spec.** The spec only specifies the one required smoke-test scenario, not a tool. Playwright is the standard choice for real-browser clipboard access.
6. **Fallback tag freshness.** `data-tag.fallback.json` (Task 24) is seeded once from the real first tag (Task 10) and is only ever read on a GitHub API failure. Nothing in this plan keeps it updated automatically as new tags are cut daily — the spec doesn't ask for that either, but over months it will drift arbitrarily stale as a fallback-of-last-resort. Worth a follow-up if this bites in practice.
7. **Netlify build hook creation is a manual, un-scriptable step** (Task 9, Step 1) — it requires dashboard access this plan's author doesn't have. Everything downstream of it (the workflow's conditional curl, the site's tag resolution) degrades gracefully if it's skipped, but the daily-commit → live-site loop won't actually close until someone does it.
8. **Coverage numbers will differ from the spec's 2026-07-21 snapshot.** Task 10's expected output deliberately doesn't hardcode "5,189 orphans / 11,596 missing" since CoinGecko's list moves daily; it only asserts the two numbers exist and are non-negative-shaped.
9. **327 uppercase-extension files and 6 no-extension files get renamed in place** by Task 3/10 (confirmed exact counts and real formats by inspecting the corpus directly: 304 `.PNG`, 22 `.JPG`, 1 `.JPEG`, and 6 trailing-dot files that sniff as JPEG/PNG). This is a real, one-time mutation of `data/icons/large/` beyond what the spec explicitly described (it only mentions extension indexing, not on-disk normalization) — necessary because without it, ~333 "download original" URLs the site builds from a lowercase `extIndex` would 404 against the real (differently-cased) filenames on jsDelivr.
