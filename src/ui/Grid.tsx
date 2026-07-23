import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { IconRow } from "../lib/manifest"
import { DENSITY_STEPS, type Density, type Wash } from "../lib/prefs"
import { Card } from "./Card"

const GAP = 12
const ROW_PADDING = 12 // matches the .icon-grid-row horizontal padding in src/index.css
const FULL_LABEL_HEIGHT = 44 // name, may wrap to 2 lines (comfortable/cosy)
const COMPACT_LABEL_HEIGHT = 26 // name, single truncated line (compact/dense)

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
	const availableWidth = Math.max(0, containerWidth - 2 * ROW_PADDING)
	const columns = Math.max(1, Math.floor((availableWidth + GAP) / (cardWidth + GAP)))
	const rowCount = Math.ceil(rows.length / columns)
	const bigLabel = density === "comfortable" || density === "cosy"
	const rowHeight = cardWidth + (bigLabel ? FULL_LABEL_HEIGHT : COMPACT_LABEL_HEIGHT)

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
			{containerWidth > 0 ? (
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
			) : null}
		</div>
	)
}
