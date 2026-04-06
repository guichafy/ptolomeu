import { Globe } from "lucide-react"
import { createElement } from "react"
import type { SearchProvider, SearchResult } from "./types"

interface SearchEngine {
  id: string
  name: string
  urlTemplate: string
  icon: string
}

const SEARCH_ENGINES: SearchEngine[] = [
  { id: "google", name: "Google", urlTemplate: "https://www.google.com/search?q={query}", icon: "🔵" },
  { id: "duckduckgo", name: "DuckDuckGo", urlTemplate: "https://duckduckgo.com/?q={query}", icon: "🦆" },
  { id: "stackoverflow", name: "Stack Overflow", urlTemplate: "https://stackoverflow.com/search?q={query}", icon: "📚" },
  { id: "youtube", name: "YouTube", urlTemplate: "https://www.youtube.com/results?search_query={query}", icon: "▶️" },
]

export const webSearchProvider: SearchProvider = {
  id: "web",
  label: "Web",
  icon: Globe,
  placeholder: "Buscar na web...",
  search: async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return []

    const encoded = encodeURIComponent(query.trim())
    return SEARCH_ENGINES.map((engine) => {
      const url = engine.urlTemplate.replace("{query}", encoded)
      return {
        id: engine.id,
        title: `Buscar no ${engine.name}`,
        subtitle: url,
        icon: createElement("span", { className: "text-base" }, engine.icon),
        onSelect: () => window.open(url, "_blank"),
      }
    })
  },
}
