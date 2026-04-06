import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { SEARCH_TYPES } from "../constants"

interface SearchTypeComboboxProps {
  value: string
  onValueChange: (value: string) => void
}

export function SearchTypeCombobox({
  value,
  onValueChange,
}: SearchTypeComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = SEARCH_TYPES.find((t) => t.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[140px] justify-between"
        >
          <span className="flex items-center gap-2">
            {selected && (
              <selected.icon className="h-4 w-4" />
            )}
            {selected?.label ?? "Selecionar..."}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[140px] p-0">
        <Command>
          <CommandList>
            <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
            <CommandGroup>
              {SEARCH_TYPES.map((type) => (
                <CommandItem
                  key={type.value}
                  value={type.value}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue)
                    setOpen(false)
                  }}
                >
                  <type.icon className="h-4 w-4" />
                  {type.label}
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === type.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
