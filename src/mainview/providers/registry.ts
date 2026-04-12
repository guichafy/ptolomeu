import { AppWindow, BookMarked, Bot, Calculator, Globe } from "lucide-react";
import { appsProvider } from "./apps-provider";
import { calculatorProvider } from "./calculator-provider";
import { claudeProvider } from "./claude-provider";
import { githubProvider } from "./github-provider";
import type { IconComponent, SearchProvider } from "./types";
import { webSearchProvider } from "./web-search-provider";

export const PLUGIN_REGISTRY: Record<string, SearchProvider> = {
	apps: appsProvider,
	github: githubProvider,
	calc: calculatorProvider,
	web: webSearchProvider,
	claude: claudeProvider,
};

export interface PluginMeta {
	id: string;
	label: string;
	description: string;
	icon: IconComponent;
}

export const PLUGIN_META: PluginMeta[] = [
	{
		id: "apps",
		label: "Apps",
		description: "Buscar aplicativos instalados no macOS",
		icon: AppWindow,
	},
	{
		id: "github",
		label: "GitHub",
		description: "Repositórios públicos do GitHub",
		icon: BookMarked,
	},
	{
		id: "calc",
		label: "Calculadora",
		description: "Avaliar expressões matemáticas",
		icon: Calculator,
	},
	{
		id: "web",
		label: "Busca Web",
		description: "Google, DuckDuckGo, Stack Overflow, YouTube",
		icon: Globe,
	},
	{
		id: "claude",
		label: "Claude",
		description: "Sessões de chat com Claude Code",
		icon: Bot,
	},
];

export const KNOWN_PLUGIN_IDS = PLUGIN_META.map((p) => p.id);

export function findPluginMeta(id: string): PluginMeta | undefined {
	return PLUGIN_META.find((p) => p.id === id);
}

export function hasPluginConfig(id: string): boolean {
	return !!PLUGIN_REGISTRY[id]?.configComponent;
}
