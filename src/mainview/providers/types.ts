import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

export interface SearchResult {
  id: string
  title: string
  subtitle?: string
  icon?: ReactNode
  badge?: string
  onSelect: () => void
}

export interface SearchProvider {
  id: string
  label: string
  icon: LucideIcon
  placeholder: string
  search: (query: string, signal?: AbortSignal) => Promise<SearchResult[]>
}
