import { Settings2, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
	findPluginMeta,
	hasPluginConfig,
	PLUGIN_REGISTRY,
} from "../providers/registry";
import type { SettingsSection } from "../providers/rpc";
import { GeneralSection } from "./general-section";
import { PluginsSection } from "./plugins-section";
import { useSettings } from "./settings-context";

type Section = SettingsSection;

interface PluginSubItem {
	id: string;
	label: string;
	icon: typeof Settings2;
}

const NAV_ITEMS: { id: Section; label: string; icon: typeof Settings2 }[] = [
	{ id: "plugins", label: "Plugins", icon: SlidersHorizontal },
	{ id: "general", label: "Geral", icon: Settings2 },
];

function PluginConfigSection({ pluginId }: { pluginId: string }) {
	const ConfigComponent = PLUGIN_REGISTRY[pluginId]?.configComponent;

	if (!ConfigComponent) return null;

	return <ConfigComponent />;
}

export function SettingsDialog() {
	const { isOpen, closeDialog, initialSection, enabledOrder } = useSettings();
	const [section, setSection] = useState<Section>("plugins");

	useEffect(() => {
		if (isOpen && initialSection) {
			setSection(initialSection);
		}
	}, [isOpen, initialSection]);

	const pluginSubItems = useMemo(
		() =>
			enabledOrder
				.filter(hasPluginConfig)
				.map((id) => {
					const meta = findPluginMeta(id);
					return meta ? { id, label: meta.label, icon: meta.icon } : null;
				})
				.filter((x): x is PluginSubItem => x !== null),
		[enabledOrder],
	);

	// Reset to plugins list if current plugin section becomes invalid
	const resolvedSection =
		section.startsWith("plugin:") &&
		!hasPluginConfig(section.replace("plugin:", ""))
			? "plugins"
			: section;

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
							const active =
								resolvedSection === item.id ||
								(item.id === "plugins" &&
									resolvedSection.startsWith("plugin:"));
							return (
								<div key={item.id}>
									<button
										type="button"
										onClick={() => setSection(item.id)}
										className={cn(
											"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
											active && !resolvedSection.startsWith("plugin:")
												? "bg-accent text-accent-foreground"
												: active
													? "text-foreground"
													: "text-muted-foreground hover:bg-muted hover:text-foreground",
										)}
									>
										<Icon className="h-4 w-4" />
										<span>{item.label}</span>
									</button>
									{item.id === "plugins" &&
										pluginSubItems.map((sub) => {
											const SubIcon = sub.icon;
											const subActive = resolvedSection === `plugin:${sub.id}`;
											return (
												<button
													key={sub.id}
													type="button"
													onClick={() => setSection(`plugin:${sub.id}`)}
													className={cn(
														"ml-4 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors",
														subActive
															? "bg-accent text-accent-foreground"
															: "text-muted-foreground hover:bg-muted hover:text-foreground",
													)}
												>
													<SubIcon className="h-3.5 w-3.5" />
													<span>{sub.label}</span>
												</button>
											);
										})}
								</div>
							);
						})}
					</aside>
					<main className="flex-1 overflow-y-auto p-5">
						{resolvedSection === "plugins" ? (
							<PluginsSection
								onNavigateToPlugin={(id) => setSection(`plugin:${id}`)}
							/>
						) : resolvedSection === "general" ? (
							<GeneralSection />
						) : resolvedSection.startsWith("plugin:") ? (
							<PluginConfigSection
								pluginId={resolvedSection.replace("plugin:", "")}
							/>
						) : (
							<PluginsSection />
						)}
					</main>
				</div>
			</DialogContent>
		</Dialog>
	);
}
