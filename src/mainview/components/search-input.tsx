import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";

interface SearchInputProps {
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	leftSlot?: ReactNode;
}

export function SearchInput({
	placeholder,
	value,
	onChange,
	leftSlot,
}: SearchInputProps) {
	return (
		<div className="relative flex flex-1 items-center gap-2">
			<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
			{leftSlot ? <div className="ml-7 shrink-0">{leftSlot}</div> : null}
			<Input
				type="text"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.metaKey && e.key === "a") {
						e.currentTarget.select();
					}
				}}
				className={leftSlot ? "pl-2" : "pl-9"}
				autoFocus
			/>
		</div>
	);
}
