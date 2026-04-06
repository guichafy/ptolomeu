import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

interface SearchInputProps {
  placeholder: string
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

export function SearchInput({
  placeholder,
  value,
  onChange,
  onSubmit,
}: SearchInputProps) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit()
          if (e.metaKey && e.key === "a") {
            e.currentTarget.select()
          }
        }}
        className="pl-9"
        autoFocus
      />
    </div>
  )
}
