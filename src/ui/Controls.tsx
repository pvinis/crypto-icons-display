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
