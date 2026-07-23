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
