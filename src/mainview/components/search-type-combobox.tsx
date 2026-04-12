import {
	BookMarked,
	ChevronDown,
	CircleDot,
	Code,
	Settings,
	Users,
} from "lucide-react";
import type React from "react";
import { forwardRef, useImperativeHandle, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { GitHubSubType } from "../providers/github/types";
import { NATIVE_TYPES } from "../providers/github/types";
import { useGitHub } from "../providers/github-context";
import { useSettings } from "../settings/settings-context";

export interface SearchTypeComboboxHandle {
	open: () => void;
}

interface SearchTypeComboboxProps {
	onOpenChange?: (open: boolean) => void;
}

function labelFor(subType: GitHubSubType): string {
	if (subType.kind === "native") {
		return NATIVE_TYPES.find((t) => t.type === subType.type)?.label ?? "Repos";
	}
	return subType.filter.name;
}

const NATIVE_ICONS: Record<string, React.ReactNode> = {
	repos: <BookMarked className="h-3 w-3" />,
	code: <Code className="h-3 w-3" />,
	issues: <CircleDot className="h-3 w-3" />,
	users: <Users className="h-3 w-3" />,
};

function iconFor(subType: GitHubSubType): React.ReactNode {
	if (subType.kind === "native")
		return NATIVE_ICONS[subType.type] ?? <BookMarked className="h-3 w-3" />;
	return subType.filter.icon ?? "⭐";
}

export const SearchTypeCombobox = forwardRef<
	SearchTypeComboboxHandle,
	SearchTypeComboboxProps
>(function SearchTypeCombobox({ onOpenChange }, ref) {
	const { activeSubType, setSubType, customFilters } = useGitHub();
	const { openDialog } = useSettings();
	const [open, setOpenState] = useState(false);

	const setOpen = (next: boolean) => {
		setOpenState(next);
		onOpenChange?.(next);
	};

	useImperativeHandle(ref, () => ({
		open: () => setOpen(true),
	}));

	const isCustom = activeSubType.kind === "custom";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
						isCustom
							? "border-amber-400/50 bg-amber-400/15 text-amber-200"
							: "border-blue-400/50 bg-blue-400/15 text-blue-200",
					)}
				>
					<span>{iconFor(activeSubType)}</span>
					<span>{labelFor(activeSubType)}</span>
					<ChevronDown className="h-3 w-3 opacity-70" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				sideOffset={6}
				avoidCollisions={false}
				className="w-[280px] p-1"
			>
				<div className="flex flex-col">
					<div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
						Tipos nativos
					</div>
					{NATIVE_TYPES.map((t) => {
						const active =
							activeSubType.kind === "native" && activeSubType.type === t.type;
						return (
							<button
								key={t.type}
								type="button"
								className={cn(
									"flex items-center justify-between rounded-sm px-2 py-1.5 text-sm",
									active
										? "bg-accent text-accent-foreground"
										: "hover:bg-muted",
								)}
								onClick={() => {
									setSubType({ kind: "native", type: t.type });
									setOpen(false);
								}}
							>
								<span>{t.label}</span>
								<span className="text-[10px] text-muted-foreground">
									{t.shortcut}
								</span>
							</button>
						);
					})}
					{customFilters.length > 0 && (
						<>
							<div className="my-1 border-t border-border/50" />
							<div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
								Filtros customizados
							</div>
							{customFilters.map((f, idx) => {
								const active =
									activeSubType.kind === "custom" &&
									activeSubType.filter.id === f.id;
								const shortcut = idx < 6 ? `⌘${(idx + 5) % 10}` : "";
								return (
									<button
										key={f.id}
										type="button"
										className={cn(
											"flex items-center justify-between rounded-sm px-2 py-1.5 text-sm",
											active
												? "bg-accent text-accent-foreground"
												: "hover:bg-muted",
										)}
										onClick={() => {
											setSubType({ kind: "custom", filter: f });
											setOpen(false);
										}}
									>
										<span className="flex items-center gap-1.5">
											<span>{f.icon ?? "⭐"}</span>
											<span>{f.name}</span>
										</span>
										{shortcut && (
											<span className="text-[10px] text-muted-foreground">
												{shortcut}
											</span>
										)}
									</button>
								);
							})}
						</>
					)}
					<div className="my-1 border-t border-border/50" />
					<button
						type="button"
						className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
						onClick={() => {
							setOpen(false);
							openDialog("github");
						}}
					>
						<Settings className="h-3 w-3" />
						Configurar filtros…
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
});
