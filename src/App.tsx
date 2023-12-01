import { useEffect, useState } from "react"

type SymbolIdMap = Record<
	string,
	Array<{
		id: string
		alexa: number | null
		gecko_rank: number | null
		gecko_score: number
		community_score: number
		image: {
			thumb: string
			small: string
			large: string
		}
	}>
>

export function App() {
	const [symbolIdMap, setSymbolIdMap] = useState<SymbolIdMap>({})

	useEffect(() => {
		const doIt = async () => {
			const response = await fetch(
				"https://raw.githubusercontent.com/pvinis/crypto-icons-data/main/data/symbol-id-map.json"
			)
			setSymbolIdMap(await response.json())
		}
		doIt()
	}, [])

	return (
		<div className="bg-gray-400 font-mono">
			<h1 className="text-4xl mb-6">Crypto Icons Display</h1>
			<h4>Count: {Object.keys(symbolIdMap).length}</h4>
			<div className="flex flex-wrap">
				{Object.keys(symbolIdMap).map((symbol) => {
					const image =
						"https://raw.githubusercontent.com/pvinis/crypto-icons-data/main/data/icons/large/" +
						symbolIdMap[symbol][0].image.large

					return (
						<div
							key={symbol}
							className="flex flex-col border w-[80px] items-center pb-2"
						>
							<p>{symbol}</p>
							<img className="w-[60px] h-[60px] rounded-full" src={image}></img>
						</div>
					)
				})}
			</div>
		</div>
	)
}
