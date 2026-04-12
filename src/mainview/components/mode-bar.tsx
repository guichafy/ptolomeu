import { cn } from "@/lib/utils";
import { useProvider } from "../providers/provider-context";

export function ModeBar() {
	const { providers, activeIndex, setIndex } = useProvider();

	return (
		<div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 bg-background/30">
			{providers.map((provider, i) => (
				<button
					type="button"
					key={provider.id}
					onClick={() => setIndex(i)}
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer",
						i === activeIndex
							? "bg-accent text-accent-foreground font-medium"
							: "text-muted-foreground hover:bg-muted hover:text-foreground",
					)}
				>
					<provider.icon className="h-3.5 w-3.5" />
					{provider.label}
				</button>
			))}
			<span className="ml-auto text-[10px] text-muted-foreground/60">
				Tab ↹ trocar
			</span>
		</div>
	);
}
