import { BookMarked } from "lucide-react"
import type { SearchProvider, SearchResult } from "./types"
import { createElement } from "react"

function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return createElement("svg", { viewBox: "0 0 16 16", fill: "currentColor", ...props },
    createElement("path", { d: "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" })
  )
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
  icon: GithubIcon,
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
