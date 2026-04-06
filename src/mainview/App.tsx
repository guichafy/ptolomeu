import { useRef, useState } from "react"
import { HeaderSearch } from "./components/header-search"
import { SearchResults } from "./components/search-results"
import { SEARCH_TYPES } from "./constants"
import type { Repository } from "./types"

function App() {
  const [searchType, setSearchType] = useState(SEARCH_TYPES[0].value)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Repository[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const selectedType = SEARCH_TYPES.find((t) => t.value === searchType)
  const hasContent = results !== null || isLoading || error !== null

  async function handleSearch() {
    const trimmed = query.trim()
    if (!trimmed) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal }
      )

      if (!res.ok) {
        if (res.status === 403) {
          setError("Rate limit atingido. Aguarde um momento e tente novamente.")
        } else {
          setError(`Erro ao buscar: ${res.status} ${res.statusText}`)
        }
        setResults([])
        return
      }

      const data = await res.json()
      setResults(data.items ?? [])
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      console.error("[search]", err)
      setError("Erro de conexão. Verifique sua internet e tente novamente.")
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <HeaderSearch
        searchType={searchType}
        onSearchTypeChange={setSearchType}
        query={query}
        onQueryChange={setQuery}
        onSubmit={handleSearch}
        placeholder={selectedType?.placeholder ?? "Buscar..."}
      />
      {hasContent && (
        <SearchResults
          results={results}
          isLoading={isLoading}
          error={error}
        />
      )}
    </div>
  )
}

export default App
