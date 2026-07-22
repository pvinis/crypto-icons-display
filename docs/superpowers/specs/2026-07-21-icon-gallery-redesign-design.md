# crypto-icons.dev redesign — design

**Date:** 2026-07-21
**Repos:** `pvinis/crypto-icons-display` (site), `pvinis/crypto-icons-data` (pipeline + assets)

## Goal

Rebuild crypto-icons.dev as a fast, good-looking browser for the ~11,500 crypto icons in
`crypto-icons-data`. Light and dark themes, a card layout inspired by icons.lobehub.com, and a
grid that stays smooth at full collection size.

Visual direction was settled interactively: a **colour-wash card** with a **user-controlled
density**, both validated against real icons and real extracted colours.

## Why this is a rebuild, not a polish pass

The current site is ~60 lines in one `App.tsx` and its data path is the problem:

| | Today | Target |
|---|---|---|
| Metadata on load | 3.2MB `symbol-id-map.json` | 141KB gzipped manifest |
| DOM nodes | 28,536 (9,506 cards, all mounted) | ~2,000 (~120 cards, windowed) |
| `<img>` tags | 9,506, **none lazy** | ~120, all lazy |
| Image bytes | **248MB** of full-size originals rendered at 60px | ~250KB for a full screen |
| Largest single icon | 208KB (`ducks.png`) | ~2KB WebP thumbnail |
| Image host | `raw.githubusercontent.com` (rate-limited, not a CDN) | jsDelivr |

These are measured, not estimated. DOM node and `<img>` counts come from evaluating against the
live site; the 248MB is the exact sum of the icon files the site's own symbol-to-image mapping
resolves to — the browser cannot report it because cross-origin responses without
`Timing-Allow-Origin` expose a `transferSize` of 0.

The visual work and the performance work are independent, but both are needed, so they ship together.

## Decisions already taken

| Decision | Choice | Why |
|---|---|---|
| Card unit | One card per **coin** (11,508) | No symbol collisions to resolve; every icon reachable; unambiguous copy-URL |
| Hosting | **jsDelivr** off the data repo | Free, zero infra, already verified working and edge-cached |
| Site repo | Rewrite **`crypto-icons-display`** | Domain + Netlify already wired; keeps 320MB of assets out of site development |
| Card design | **Colour wash** (extracted dominant colour as a gradient behind the icon) | Colourful and calm; scales to 11.5k cards where a permanent chrome row does not |
| Density | **User-controlled**, 4 steps | Browsing and ticker-hunting are different modes; let the user pick |

### Defaults (settled in review)

- **Density:** Cosy — names still fit, ~9 across on a desktop width
- **Wash:** Medium (0.30 opacity) — Bold starts fighting saturated icons
- Both **persist to localStorage**
- **Theme:** follows system, with a manual override that persists

## Architecture

Two repos, one direction of dependency. The site never reads the data repo's source — only its
published CDN artefacts.

```
crypto-icons-data                          crypto-icons-display
─────────────────                          ────────────────────
src/main.ts        fetch from CoinGecko
src/build-assets.ts ──┐
                      ├─ thumb64/*.webp  ──── jsDelivr ────▶ grid images
                      ├─ index.json      ──── jsDelivr ────▶ manifest
                      └─ icons/large/*   ──── jsDelivr ────▶ download / copy-URL
```

### Part 1 — build-time pipeline (`crypto-icons-data`)

New script `src/build-assets.ts`, run after `do-it` in the existing daily workflow.
**Incremental:** skips any icon that already has a thumbnail and a colour, so daily runs only
process new coins.

For each icon in `data/icons/large/`:

1. **Thumbnail** → `data/icons/thumb64/<id>.webp`, 64×64, fit-inside, transparent background
   preserved. ~2KB each, ~25MB total.
2. **Dominant colour** → most vivid frequent hue, ignoring transparency, greys, near-white and
   near-black. Weight pixels by saturation so a small vivid mark beats a large muddy area.

Then emit `data/site/index.json` — an array of `[id, symbol, name, extIndex, colourHex]` rows.

`extIndex` indexes a fixed, append-only table `["png","jpg","jpeg","svg","ico"]` emitted as the
manifest's first element, so the site decodes extensions from the payload itself and a new format
never silently reindexes existing rows. `colourHex` is stored without the leading `#`.

The manifest covers **only coins that have an icon file** (11,508 rows), per the coverage decision.
Each row is keyed off an icon on disk, and its `name` comes from `data.json` when the coin is still
listed, falling back to the id when it is an orphan. The build also writes a small
`data/site/coverage.json` — orphan count and count of listed coins missing an icon — so the
map/list drift (see Data Integrity) is observable without blocking the site.

**Measured**, not estimated:

- Colour extraction: 11.9ms/icon → **2.3 min** for all 11,508, single-threaded. Parallelisable if
  it ever matters. Incremental runs process only new coins, so the daily cost is near zero.
- Manifest: **540KB raw, 141KB gzipped**. Columnar encoding was tested and is *worse* after
  compression (146KB) because it breaks per-row redundancy. Omitting derivable names saves 8KB for
  real complexity. Plain array-of-arrays wins.

Extraction accuracy spot-check: Bitcoin `#F89A28` (brand `#F7931A`), BNB `#F1C022` (`#F3BA2F`),
Chainlink `#2C5BD8` (`#2A5ADA`). Monochrome logos (XRP, Cosmos, IOST, 0x) correctly yield greys —
see Open Questions.

### Part 2 — delivery

- Grid images: `cdn.jsdelivr.net/gh/pvinis/crypto-icons-data@<tag>/data/icons/thumb64/<id>.webp`
- Download / copy-URL: the original under `data/icons/large/<id>.<ext>`
- The site **pins a release tag** at build time rather than using `@main`. jsDelivr caches a tag
  permanently but `@main` only 12h at the edge, so pinning is both faster and immutable — a copied
  URL keeps working forever.

**How the tag propagates.** The data repo's daily workflow, after committing new icons and assets,
cuts a date tag (`data-YYYY-MM-DD`) and fires a Netlify build hook. The site's build resolves the
newest `data-*` tag from the GitHub API once, at build time, and inlines it as
`VITE_DATA_TAG`. `lib/urls.ts` is the only module that reads it. If the API call fails the build
falls back to the previously committed tag rather than to `@main`, so a CI hiccup can never
downgrade every URL on the site to a 12h-cached one.

Tags accumulate at ~365/year, which is fine; the workflow only cuts one when the commit actually
changed something under `data/`.

### Part 3 — the site (`crypto-icons-display`)

Keep Vite + React (already there, already deployed), upgraded to current versions. Bun as package
manager, matching the data repo.

Modules, each independently understandable and testable:

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/manifest.ts` | Fetch + decode the manifest into typed rows | CDN URL |
| `lib/search.ts` | Filter rows by query over name / symbol / id | manifest rows |
| `lib/urls.ts` | Build thumb / original / CoinGecko URLs from a row | pinned tag |
| `lib/prefs.ts` | Density, wash, theme — read/write localStorage | — |
| `ui/Grid.tsx` | Windowed grid; owns only layout and windowing | virtualizer, prefs |
| `ui/Card.tsx` | One card: wash, icon, labels, hover actions | urls, prefs |
| `ui/Detail.tsx` | Detail sheet: preview, hex, all URLs, CoinGecko link | urls |
| `ui/Controls.tsx` | Search box, density, wash, theme toggles | prefs |

**Windowing.** `@tanstack/react-virtual` — headless, maintained, handles a re-measuring grid when
the density control changes column count. ~120 cards mounted instead of 11,508.

**Responsive by construction.** The density control sets a *minimum card width*, not a column
count; the grid is `repeat(auto-fill, minmax(var(--card), 1fr))`. One mechanism covers both the
density steps and every viewport, and "Dense" cannot produce 18 unusable columns on a phone.

**Search.** Naive `includes()` over 11,508 rows is ~1-2ms — no index library. Wrapped in
`useDeferredValue` so typing never blocks.

**Theme.** CSS custom properties, `prefers-color-scheme` as the default signal, manual override
persisted. A tiny inline script in `index.html` sets the theme class before first paint to avoid a
flash.

**Images.** `loading="lazy"` with explicit `width`/`height` so lazy loading cannot cause layout
shift. `decoding="async"`.

### Card behaviour

- **Hover** → copy-URL and download buttons fade in
- **Click** → detail sheet: large preview, name / symbol / id, colour swatch (click to copy hex),
  all three size URLs, link to CoinGecko
- Labels auto-hide at Compact and Dense — below ~30px the label costs more room than it earns

Touch has no hover, so on coarse pointers the actions render persistently rather than on hover.

### Error handling

| Case | Behaviour |
|---|---|
| Manifest fetch fails | Full-page error state with a retry button. Nothing else works without it. |
| Individual image 404s | Card falls back to a neutral tile showing the ticker. One bad icon never breaks the grid. |
| Clipboard API unavailable | Fall back to a selectable text field in the detail sheet |
| Search matches nothing | Empty state naming the query |

### Testing

- **`lib/` is pure and unit-tested** (Vitest): manifest decoding incl. malformed rows, search
  matching and ranking, URL construction, prefs round-trip with a mocked localStorage.
- **Colour extraction is tested in the data repo** against a small fixture set of known icons,
  asserting extracted colours land within a tolerance of known brand colours.
- **One end-to-end smoke test**: the built site loads, the grid renders, search narrows it,
  a copy action puts the right URL on the clipboard.
- Not unit-testing the visual layer — it's the part that changes most and tests there pay least.

## Resolved in review (2026-07-21)

1. **Grey washes → leave as-is.** XRP, Cosmos, IOST, 0x and similar have black/grey marks, so
   extraction correctly returns grey and those cards read as flat spots in the grid. Kept honest to
   the brand for v1; revisit once it's live and judgeable at scale.
2. **Styling → upgrade Tailwind to v4.** Its CSS-first config suits the variable-driven theming here,
   and it's already in the project.
3. **Grid coverage → only coins that have an icon (11,508 cards, zero blanks).** See the data-integrity
   note below — the original framing of this question undercounted the blanks by ~5,000, so the numbers
   were re-checked and the decision made against the corrected figures.

## Data integrity — the map has drifted from the coin list

Surfaced while sizing the coverage question, and it reshapes the grid decision:

- `data/icons/large/` holds **11,508** icon files.
- `data.json` (the current CoinGecko list) has **17,915** coins.
- Only **6,319** of our icons match a coin still in that list. The other **5,189** are **orphans** —
  coins CoinGecko has since delisted or renamed.
- Conversely **11,596** coins in the current list have no icon.

Root cause is the pipeline's shape: `main.ts` **overwrites** `data.json` with a fresh list each run
but only **appends** to `symbol-id-map.json`. CoinGecko churns constantly, so the map accumulates
icons whose coins have vanished. Both files were last written the same day, so this is structural,
not staleness.

Consequence for coverage: "show every coin as a card" would make the grid **65% empty** (current
list) or **50% empty** (union of list + orphans). That is a different product. Hence decision 3 above:
the grid is over the **icon files we actually have**. Coverage gaps are better surfaced as a header
stat or a CI report than as thousands of blank tiles.

This is a data-repo concern, not a site one — the site just consumes the manifest. But the manifest
build (`build-assets.ts`) is the natural place to **emit a coverage report** (orphan count, coins
missing icons) so the drift is at least visible. A future cleanup of the pipeline's append-only map
is out of scope here but worth a tracking issue.

## Risks

1. **jsDelivr fair use.** A 320MB repo served free is a courtesy, not a contract. If traffic ever
   becomes a problem the mitigation is a move to Cloudflare R2 — `lib/urls.ts` is the single place
   that would change.
2. **Repo growth.** The daily bot grows the data repo forever, and thumbnails add ~25MB. Not urgent,
   but worth a plan before it becomes one.
3. **Monochrome logos** produce grey washes — accepted for v1 (decision 1).
4. **Map/list drift** (above) — accepted for v1; the manifest build reports on it rather than fixing it.

## Out of scope for v1

Icon-set downloads (zip), an npm package, per-coin OG images, dark/light icon variants, and any
CoinGecko API calls from the browser. All are plausible later; none are needed to make the site
good.

## Success criteria

- First contentful paint under 1.5s on a cold cache
- Manifest transfer ≤ 150KB gzipped (icons-only manifest measures ~111KB)
- A full screen of icons under ~1.5MB
- Scrolling the full 11,508 stays at 60fps with no blank-tile flashing
- Light and dark both look deliberate, not one theme with inverted colours
- Copying a URL yields a link that still resolves in a year
