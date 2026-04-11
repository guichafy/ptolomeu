import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalculatorResult } from "./components/calculator-result";
import { ModeBar } from "./components/mode-bar";
import { ResultItem } from "./components/result-item";
import { SearchInput } from "./components/search-input";
import {
	SearchTypeCombobox,
	type SearchTypeComboboxHandle,
} from "./components/search-type-combobox";
import { GitHubProvider, useGitHub } from "./providers/github-context";
import {
	ProviderContextProvider,
	useProvider,
} from "./providers/provider-context";
import { rpc } from "./providers/rpc";
import type { SearchResult } from "./providers/types";
import { SettingsProvider, useSettings } from "./settings/settings-context";
import { SettingsDialog } from "./settings/settings-dialog";

const COLLAPSED_HEIGHT = 120;
const EXPANDED_HEIGHT = 440;
const SETTINGS_HEIGHT = 480;

function PaletteContent() {
	const { activeProvider, cycleNext, cyclePrev } = useProvider();
	const { activeSubType, setSubType, customFilters } = useGitHub();
	const comboboxRef = useRef<SearchTypeComboboxHandle>(null);
	const providerContext =
		activeProvider.id === "github" ? activeSubType : undefined;
	const { isOpen: isSettingsOpen } = useSettings();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const abortRef = useRef<AbortController | null>(null);
	const prevProviderRef = useRef(activeProvider.id);

	// Reset state when provider changes
	useEffect(() => {
		if (prevProviderRef.current !== activeProvider.id) {
			setQuery("");
			setResults([]);
			setError(null);
			setSelectedIndex(0);
			prevProviderRef.current = activeProvider.id;
		}
	}, [activeProvider.id]);

	const handleSearch = useCallback(async () => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		setError(null);
		setSelectedIndex(0);

		try {
			const items = await activeProvider.search(
				query,
				controller.signal,
				providerContext,
			);
			if (!controller.signal.aborted) {
				setResults(items);
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") return;
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Erro desconhecido");
				setResults([]);
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [activeProvider, query, providerContext]);

	// Auto-search for calculator (real-time) and apps (on any change)
	useEffect(() => {
		if (activeProvider.id === "calc" || activeProvider.id === "apps") {
			const timer = setTimeout(
				handleSearch,
				activeProvider.id === "calc" ? 100 : 300,
			);
			return () => clearTimeout(timer);
		}
	}, [activeProvider.id, handleSearch]);

	const prevSubTypeRef = useRef(activeSubType);
	useEffect(() => {
		if (activeProvider.id !== "github") return;
		const prev = prevSubTypeRef.current;
		prevSubTypeRef.current = activeSubType;
		if (prev === activeSubType) return;
		if (!query.trim()) return;
		handleSearch();
	}, [activeProvider.id, activeSubType, handleSearch, query]);

	const hasContent =
		query.trim().length > 0 &&
		(results.length > 0 || isLoading || error !== null);

	// Resize native window when content appears/disappears or settings dialog toggles
	useEffect(() => {
		const height = isSettingsOpen
			? SETTINGS_HEIGHT
			: hasContent
				? EXPANDED_HEIGHT
				: COLLAPSED_HEIGHT;
		rpc.request.resizeWindow({ height }).catch(() => {});
	}, [hasContent, isSettingsOpen]);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (activeProvider.id === "github" && e.metaKey) {
			if (e.key === "f" || e.key === "F") {
				e.preventDefault();
				comboboxRef.current?.open();
				return;
			}
			const digit = e.key;
			if (digit >= "0" && digit <= "9") {
				const num = Number(digit);
				if (num >= 1 && num <= 4) {
					e.preventDefault();
					const type = (["repos", "code", "issues", "users"] as const)[num - 1];
					setSubType({ kind: "native", type });
					return;
				}
				const customIdx = num === 0 ? 5 : num - 5;
				if (customIdx >= 0 && customFilters[customIdx]) {
					e.preventDefault();
					setSubType({ kind: "custom", filter: customFilters[customIdx] });
					return;
				}
			}
		}
		if (e.key === "Escape") {
			setQuery("");
			setResults([]);
			setError(null);
			setSelectedIndex(0);
			return;
		}
		if (e.key === "Tab") {
			e.preventDefault();
			if (e.shiftKey) cyclePrev();
			else cycleNext();
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (results.length > 0) {
				setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
			}
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex((i) => Math.max(i - 1, 0));
			return;
		}
		if (e.key === "Enter") {
			if (results[selectedIndex]) {
				results[selectedIndex].onSelect();
			} else if (activeProvider.id !== "calc" && activeProvider.id !== "apps") {
				handleSearch();
			}
			return;
		}
	}

	const isCalc = activeProvider.id === "calc";
	const calcResult = isCalc && results.length > 0 ? results[0] : null;

	return (
		<div
			role="application"
			className="flex flex-col h-screen overflow-hidden"
			onKeyDown={handleKeyDown}
		>
			<ModeBar />
			<div className="border-b px-4 py-3">
				<SearchInput
					placeholder={activeProvider.placeholder}
					value={query}
					onChange={setQuery}
					leftSlot={
						activeProvider.id === "github" ? (
							<SearchTypeCombobox ref={comboboxRef} />
						) : undefined
					}
				/>
			</div>

			{isCalc && hasContent ? (
				<div className="flex-1 animate-in fade-in-0 slide-in-from-top-2 duration-200">
					<CalculatorResult
						expression={query}
						result={calcResult?.title ?? null}
						error={
							calcResult?.id === "calc-error"
								? (calcResult.subtitle ?? null)
								: error
						}
					/>
				</div>
			) : hasContent ? (
				<div className="flex-1 flex flex-col overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200">
					{isLoading ? (
						<div className="flex-1 flex items-center justify-center">
							<p className="text-sm text-muted-foreground animate-pulse">
								Buscando...
							</p>
						</div>
					) : error ? (
						<div className="flex-1 flex items-center justify-center px-4">
							<p className="text-sm text-destructive text-center">{error}</p>
						</div>
					) : results.length === 0 ? (
						<div className="flex-1 flex items-center justify-center">
							<p className="text-sm text-muted-foreground">
								Nenhum resultado encontrado
							</p>
						</div>
					) : (
						<ScrollArea className="flex-1">
							<div className="p-2">
								{results.map((result, i) => (
									<ResultItem
										key={result.id}
										result={result}
										isSelected={i === selectedIndex}
									/>
								))}
							</div>
						</ScrollArea>
					)}
				</div>
			) : null}

			{hasContent && (
				<div className="flex items-center justify-between px-4 py-1.5 border-t border-border/40">
					<span className="text-[10px] text-muted-foreground/60">
						↑↓ navegar
					</span>
					<span className="text-[10px] text-muted-foreground/60">
						{isCalc ? "↵ copiar" : "↵ abrir"} · esc fechar
					</span>
				</div>
			)}
		</div>
	);
}

function App() {
	return (
		<SettingsProvider>
			<ProviderContextProvider>
				<GitHubProvider>
					<PaletteContent />
					<SettingsDialog />
				</GitHubProvider>
			</ProviderContextProvider>
		</SettingsProvider>
	);
}

export default App;
