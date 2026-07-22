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
