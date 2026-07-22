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
				<button
					type="button"
					className="border border-[var(--border)] px-4 py-2"
					onClick={() => {
						setState({ status: "loading" })
						load()
					}}
				>
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
