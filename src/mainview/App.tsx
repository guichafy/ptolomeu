import { useCallback, useEffect, useRef, useState } from "react"
import { ProviderContextProvider, useProvider } from "./providers/provider-context"
import { ModeBar } from "./components/mode-bar"
import { SearchInput } from "./components/search-input"
import { ResultItem } from "./components/result-item"
import { CalculatorResult } from "./components/calculator-result"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SearchResult } from "./providers/types"

import { appsProvider } from "./providers/apps-provider"
import { githubProvider } from "./providers/github-provider"
import { calculatorProvider } from "./providers/calculator-provider"
import { webSearchProvider } from "./providers/web-search-provider"

const providers = [appsProvider, githubProvider, calculatorProvider, webSearchProvider]

function PaletteContent() {
  const { activeProvider, cycleNext, cyclePrev } = useProvider()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const prevProviderRef = useRef(activeProvider.id)

  // Reset state when provider changes
  useEffect(() => {
    if (prevProviderRef.current !== activeProvider.id) {
      setQuery("")
      setResults([])
      setError(null)
      setSelectedIndex(0)
      prevProviderRef.current = activeProvider.id
    }
  }, [activeProvider.id])

  const handleSearch = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)
    setSelectedIndex(0)

    try {
      const items = await activeProvider.search(query, controller.signal)
      if (!controller.signal.aborted) {
        setResults(items)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
        setResults([])
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [activeProvider, query])

  // Auto-search for calculator (real-time) and apps (on any change)
  useEffect(() => {
    if (activeProvider.id === "calc" || activeProvider.id === "apps") {
      const timer = setTimeout(handleSearch, activeProvider.id === "calc" ? 100 : 300)
      return () => clearTimeout(timer)
    }
  }, [query, activeProvider.id, handleSearch])

  const hasContent = results.length > 0 || isLoading || error !== null

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setQuery("")
      setResults([])
      setError(null)
      setSelectedIndex(0)
      return
    }
    if (e.key === "Tab") {
      e.preventDefault()
      if (e.shiftKey) cyclePrev()
      else cycleNext()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (results.length > 0) {
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      }
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === "Enter") {
      if (results[selectedIndex]) {
        results[selectedIndex].onSelect()
      } else if (activeProvider.id !== "calc" && activeProvider.id !== "apps") {
        handleSearch()
      }
      return
    }
  }

  const isCalc = activeProvider.id === "calc"
  const calcResult = isCalc && results.length > 0 ? results[0] : null

  return (
    <div className="flex flex-col min-h-screen" onKeyDown={handleKeyDown}>
      <ModeBar />
      <div className="border-b px-4 py-3">
        <SearchInput
          placeholder={activeProvider.placeholder}
          value={query}
          onChange={setQuery}
        />
      </div>

      {isCalc ? (
        <CalculatorResult
          expression={query}
          result={calcResult?.title ?? null}
          error={calcResult?.id === "calc-error" ? calcResult.subtitle ?? null : error}
        />
      ) : hasContent ? (
        isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground animate-pulse">Buscando...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center px-4">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Nenhum resultado encontrado</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-2">
              {results.map((result, i) => (
                <ResultItem
                  key={result.id}
                  result={result}
                  isSelected={i === selectedIndex}
                />
              ))}
            </div>
          </ScrollArea>
        )
      ) : null}

      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground/60">↑↓ navegar</span>
        <span className="text-[10px] text-muted-foreground/60">
          {isCalc ? "↵ copiar" : "↵ abrir"} · esc fechar
        </span>
      </div>
    </div>
  )
}

function App() {
  return (
    <ProviderContextProvider providers={providers}>
      <PaletteContent />
    </ProviderContextProvider>
  )
}

export default App
