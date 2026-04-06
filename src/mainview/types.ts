export interface SearchType {
  value: string
  label: string
  icon: React.FC<React.SVGProps<SVGSVGElement>>
  placeholder: string
}

export interface Repository {
  id: number
  full_name: string
  description: string | null
  stargazers_count: number
  language: string | null
  html_url: string
}
