import { Github, BookMarked } from "lucide-react"
import type { SearchProvider, SearchResult } from "./types"
import { createElement } from "react"

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  PHP: "#4F5D95",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Dart: "#00B4AB",
  Lua: "#000080",
  Zig: "#ec915c",
}

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}

interface GitHubRepo {
  id: number
  full_name: string
  description: string | null
  stargazers_count: number
  language: string | null
  html_url: string
}

export const githubProvider: SearchProvider = {
  id: "github",
  label: "GitHub",
  icon: Github,
  placeholder: "Buscar repositórios...",
  search: async (query: string, signal?: AbortSignal): Promise<SearchResult[]> => {
    if (!query.trim()) return []

    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query.trim())}`,
      { signal }
    )

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error("Rate limit atingido. Aguarde um momento e tente novamente.")
      }
      throw new Error(`Erro ao buscar: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    const repos: GitHubRepo[] = data.items ?? []

    return repos.map((repo) => ({
      id: String(repo.id),
      title: repo.full_name,
      subtitle: repo.description ?? undefined,
      icon: createElement(BookMarked, { className: "h-4 w-4" }),
      badge: `⭐ ${formatStars(repo.stargazers_count)}${repo.language ? ` · ${repo.language}` : ""}`,
      onSelect: () => window.open(repo.html_url, "_blank"),
    }))
  },
}
