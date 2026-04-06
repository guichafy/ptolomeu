import { SearchTypeCombobox } from "./search-type-combobox"
import { SearchInput } from "./search-input"

interface HeaderSearchProps {
  searchType: string
  onSearchTypeChange: (value: string) => void
  query: string
  onQueryChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
}

export function HeaderSearch({
  searchType,
  onSearchTypeChange,
  query,
  onQueryChange,
  onSubmit,
  placeholder,
}: HeaderSearchProps) {
  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center gap-2">
        <SearchTypeCombobox
          value={searchType}
          onValueChange={onSearchTypeChange}
        />
        <SearchInput
          placeholder={placeholder}
          value={query}
          onChange={onQueryChange}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  )
}
