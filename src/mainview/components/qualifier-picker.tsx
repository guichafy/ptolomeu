import { Plus } from "lucide-react";
import { useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { QUALIFIER_REGISTRY } from "../providers/github/qualifier-registry";
import type { GitHubSearchType } from "../providers/rpc";

interface Props {
	baseType: GitHubSearchType;
	activeKeys: Set<string>;
	onSelect: (key: string) => void;
}

export function QualifierPicker({ baseType, activeKeys, onSelect }: Props) {
	const [open, setOpen] = useState(false);

	const available = QUALIFIER_REGISTRY[baseType].filter(
		(def) => !activeKeys.has(def.key),
	);

	if (available.length === 0) return null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-blue-400 transition-colors hover:border-blue-400/50 hover:bg-blue-400/5"
				>
					<Plus className="h-3.5 w-3.5" />
					Adicionar qualifier
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-[220px] p-0" align="start">
				<Command>
					<CommandInput placeholder="Buscar qualifier..." />
					<CommandList>
						<CommandEmpty>Nenhum qualifier encontrado.</CommandEmpty>
						<CommandGroup>
							{available.map((def) => (
								<CommandItem
									key={def.key}
									value={def.label}
									onSelect={() => {
										onSelect(def.key);
										setOpen(false);
									}}
								>
									<span className="text-xs text-amber-400/90">{def.label}</span>
									<span className="ml-auto text-[10px] text-muted-foreground">
										{def.type}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
