import { BookMarked, Star } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Repository } from "../types"

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

const SKELETON_ITEMS = Array.from({ length: 5 }, (_, i) => i)

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}

interface SearchResultsProps {
  results: Repository[] | null
  isLoading: boolean
  error: string | null
}

function ResultSkeleton() {
  return (
    <div className="flex items-start gap-3 px-3 py-3 animate-pulse">
      <div className="h-4 w-4 mt-0.5 rounded bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
        <div className="flex gap-3">
          <div className="h-3 w-12 rounded bg-muted" />
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}

function ResultCard({ repo }: { repo: Repository }) {
  const langColor = repo.language
    ? LANGUAGE_COLORS[repo.language] ?? "#8b8b8b"
    : null

  return (
    <button
      className="flex items-start gap-3 px-3 py-3 w-full text-left rounded-md hover:bg-accent transition-colors"
      onClick={() => window.open(repo.html_url, "_blank")}
    >
      <BookMarked className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {repo.full_name}
        </p>
        {repo.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {repo.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3" />
            {formatStars(repo.stargazers_count)}
          </span>
          {repo.language && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: langColor ?? undefined }}
              />
              {repo.language}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

export function SearchResults({
  results,
  isLoading,
  error,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <ScrollArea className="flex-1">
        <div className="p-2">
          {SKELETON_ITEMS.map((i) => (
            <ResultSkeleton key={i} />
          ))}
        </div>
      </ScrollArea>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-destructive text-center">{error}</p>
      </div>
    )
  }

  if (results!.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Nenhum repositório encontrado
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2">
        {results!.map((repo) => (
          <ResultCard key={repo.id} repo={repo} />
        ))}
      </div>
    </ScrollArea>
  )
}
