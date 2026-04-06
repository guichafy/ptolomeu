import type { ReactNode, ComponentType, SVGProps } from "react"

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

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
  icon: IconComponent
  placeholder: string
  search: (query: string, signal?: AbortSignal) => Promise<SearchResult[]>
}
