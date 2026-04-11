import { GitBranch, Settings2, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SettingsSection } from "../providers/rpc";
import { GeneralSection } from "./general-section";
import { GitHubSection } from "./github-section";
import { PluginsSection } from "./plugins-section";
import { useSettings } from "./settings-context";

type Section = SettingsSection;

const NAV_ITEMS: { id: Section; label: string; icon: typeof Settings2 }[] = [
	{ id: "plugins", label: "Plugins", icon: SlidersHorizontal },
	{ id: "github", label: "GitHub", icon: GitBranch },
	{ id: "general", label: "Geral", icon: Settings2 },
];

export function SettingsDialog() {
	const { isOpen, closeDialog, initialSection } = useSettings();
	const [section, setSection] = useState<Section>("plugins");

	useEffect(() => {
		if (isOpen && initialSection) {
			setSection(initialSection);
		}
	}, [isOpen, initialSection]);

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) closeDialog();
			}}
		>
			<DialogContent className="h-[460px] max-w-[600px] gap-0 overflow-hidden p-0">
				<DialogTitle className="sr-only">Preferências</DialogTitle>
				<div className="flex h-full">
					<aside className="flex w-[160px] flex-col gap-1 border-r border-border/50 bg-muted/20 p-3">
						<div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Preferências
						</div>
						{NAV_ITEMS.map((item) => {
							const Icon = item.icon;
							const active = section === item.id;
							return (
								<button
									key={item.id}
									type="button"
									onClick={() => setSection(item.id)}
									className={cn(
										"flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
										active
											? "bg-accent text-accent-foreground"
											: "text-muted-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									<Icon className="h-4 w-4" />
									<span>{item.label}</span>
								</button>
							);
						})}
					</aside>
					<main className="flex-1 overflow-y-auto p-5">
						{section === "plugins" ? (
							<PluginsSection />
						) : section === "github" ? (
							<GitHubSection />
						) : (
							<GeneralSection />
						)}
					</main>
				</div>
			</DialogContent>
		</Dialog>
	);
}
