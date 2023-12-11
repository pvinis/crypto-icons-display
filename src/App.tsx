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
	const [searchText, setSearchText] = useState("")

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
			<p>Made by pvinis</p>
			<a href="https://github.com/pvinis/crypto-icons-data">GitHub repo</a>
			<h4>Count: {Object.keys(symbolIdMap).length}</h4>
			<input
				type="text"
				className="border"
				placeholder="Search"
				value={searchText}
				onChange={(e) => setSearchText(e.target.value)}
			/>

			<div className="flex flex-wrap">
				{Object.keys(symbolIdMap)
					.filter((symbol) => symbol.toLowerCase().includes(searchText.toLowerCase()))
					.map((symbol) => {
						const image =
							"https://raw.githubusercontent.com/pvinis/crypto-icons-data/main/data/icons/large/" +
							symbolIdMap[symbol][0].image.large

						return (
							<div key={symbol} className="flex flex-col border w-[80px] items-center pb-2">
								<p>{symbol}</p>
								<img className="w-[60px] h-[60px] rounded-full" src={image}></img>
							</div>
						)
					})}
			</div>
		</div>
	)
}
