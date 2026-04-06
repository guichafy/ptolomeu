import { cn } from "@/lib/utils";
import { useProvider } from "../providers/provider-context";

export function ModeBar() {
	const { providers, activeIndex } = useProvider();

	return (
		<div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 bg-background/30">
			{providers.map((provider, i) => (
				<div
					key={provider.id}
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors",
						i === activeIndex
							? "bg-accent text-accent-foreground font-medium"
							: "text-muted-foreground",
					)}
				>
					<provider.icon className="h-3.5 w-3.5" />
					{provider.label}
				</div>
			))}
			<span className="ml-auto text-[10px] text-muted-foreground/60">
				Tab ↹ trocar
			</span>
		</div>
	);
}
