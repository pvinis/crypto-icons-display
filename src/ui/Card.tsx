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

async function downloadOriginal(url: string, filename: string): Promise<void> {
	try {
		const response = await fetch(url)
		if (!response.ok) return
		const blob = await response.blob()
		const objectUrl = URL.createObjectURL(blob)
		const anchor = document.createElement("a")
		anchor.href = objectUrl
		anchor.download = filename
		document.body.appendChild(anchor)
		anchor.click()
		anchor.remove()
		URL.revokeObjectURL(objectUrl)
	} catch {
		// Network/permission failure — silently no-op; the copy-URL action remains available.
	}
}

export function Card({ row, density, wash, onSelect }: CardProps) {
	const bigLabel = density === "comfortable" || density === "cosy"

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
			<button type="button" className="flex w-full min-w-0 flex-col items-center gap-2" onClick={() => onSelect(row)}>
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
				<span
					className={
						bigLabel
							? "text-center text-xs text-[var(--muted)]"
							: "w-full truncate text-center text-[10px] leading-tight text-[var(--muted)]"
					}
				>
					{row.name}
				</span>
			</button>
			<span className="card-symbol">{row.symbol.toUpperCase()}</span>
			<div className="card-actions absolute right-2 top-2 flex gap-1">
				<button
					type="button"
					aria-label="Copy symbol"
					data-testid="copy-symbol-button"
					onClick={() => copyToClipboard(row.symbol)}
				>
					⧉
				</button>
				<button
					type="button"
					aria-label="Download original icon"
					data-testid="download-button"
					onClick={() => downloadOriginal(getOriginalUrl(row), `${row.id}.${row.ext}`)}
				>
					⇩
				</button>
			</div>
		</div>
	)
}
