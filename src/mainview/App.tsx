import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { initRendererAnalytics, shutdownRendererAnalytics } from "./analytics";
import { CalculatorResult } from "./components/calculator-result";
import { ModeBar } from "./components/mode-bar";
import { ResultItem } from "./components/result-item";
import { SearchInput } from "./components/search-input";
import {
	SearchTypeCombobox,
	type SearchTypeComboboxHandle,
} from "./components/search-type-combobox";
import { sessionToResult } from "./providers/claude-provider";
import { GitHubProvider, useGitHub } from "./providers/github-context";
import {
	ProviderContextProvider,
	useProvider,
} from "./providers/provider-context";
import { rpc, setClaudeSessionsUpdateHandler } from "./providers/rpc";
import type { SearchResult } from "./providers/types";
import { SettingsProvider, useSettings } from "./settings/settings-context";
import { SettingsDialog } from "./settings/settings-dialog";

const COLLAPSED_HEIGHT = 120;
const EXPANDED_HEIGHT = 440;
const SETTINGS_HEIGHT = 480;

function PaletteContent() {
	const { activeProvider, cycleNext, cyclePrev } = useProvider();
	const {
		activeSubType,
		setSubType,
		customFilters,
		setLastSearchCached,
		lastSearchCached,
	} = useGitHub();
	const comboboxRef = useRef<SearchTypeComboboxHandle>(null);
	const providerContext = useMemo(
		() =>
			activeProvider.id === "github"
				? { subType: activeSubType, onCacheStatus: setLastSearchCached }
				: undefined,
		[activeProvider.id, activeSubType, setLastSearchCached],
	);
	const { isOpen: isSettingsOpen } = useSettings();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [isComboboxOpen, setIsComboboxOpen] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const prevProviderRef = useRef(activeProvider.id);
	const resultsQueryRef = useRef("");

	// Reset state when provider changes
	useEffect(() => {
		if (prevProviderRef.current !== activeProvider.id) {
			setQuery("");
			setResults([]);
			setError(null);
			setSelectedIndex(0);
			setLastSearchCached(null);
			resultsQueryRef.current = "";
			prevProviderRef.current = activeProvider.id;
		}
	}, [activeProvider.id, setLastSearchCached]);

	// Reset cache indicator when the user starts typing a new query
	const handleQueryChange = useCallback(
		(next: string) => {
			setQuery(next);
			setLastSearchCached(null);
		},
		[setLastSearchCached],
	);

	const clearPalette = useCallback(() => {
		setQuery("");
		setResults([]);
		setError(null);
		setSelectedIndex(0);
		resultsQueryRef.current = "";
	}, []);

	const selectResult = useCallback(
		(result: SearchResult) => {
			result.onSelect();
			clearPalette();
		},
		[clearPalette],
	);

	const handleSearch = useCallback(async () => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		setError(null);
		setSelectedIndex(0);

		// For Claude's "recent sessions" view (empty query), the backend can
		// push authoritative data at any moment. A parallel RPC that returns
		// [] — whether legitimately or due to a transient webview/RPC failure —
		// must not clobber a populated list that arrived via push. Use the
		// functional setter to compare against the latest state.
		const preserveOnEmpty = activeProvider.id === "claude" && !query.trim();

		try {
			const items = await activeProvider.search(
				query,
				controller.signal,
				providerContext,
			);
			if (!controller.signal.aborted) {
				setResults((prev) => {
					if (preserveOnEmpty && items.length === 0 && prev.length > 0) {
						return prev;
					}
					return items;
				});
				resultsQueryRef.current = query;
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") return;
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Erro desconhecido");
				setResults((prev) => (preserveOnEmpty && prev.length > 0 ? prev : []));
				resultsQueryRef.current = "";
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [activeProvider, query, providerContext]);

	// Auto-search for calculator (real-time), apps (on any change), and claude (recent sessions)
	useEffect(() => {
		if (
			activeProvider.id === "calc" ||
			activeProvider.id === "apps" ||
			activeProvider.id === "claude"
		) {
			const timer = setTimeout(
				handleSearch,
				activeProvider.id === "calc" ? 100 : 300,
			);
			return () => clearTimeout(timer);
		}
	}, [activeProvider.id, handleSearch]);

	// Primary refresh trigger: the backend pushes the Claude session list
	// whenever the main window gains focus (tray click, hotkey, reactivation).
	// Pushing from bun bypasses webview quirks entirely — the mainview
	// webview can be suspended by WebKit after the chat window is shown, and
	// outbound RPCs from this renderer have been seen to be dropped in that
	// state. The backend is always the authoritative source for sessions.
	useEffect(() => {
		setClaudeSessionsUpdateHandler(({ sessions }) => {
			console.log(
				`[mainview] claudeSessionsUpdate: count=${sessions.length} providerId=${activeProvider.id} hasQuery=${query.trim().length > 0}`,
			);
			if (activeProvider.id !== "claude") return;
			if (query.trim()) return;
			abortRef.current?.abort();
			setResults(sessions.map(sessionToResult));
			setError(null);
			setIsLoading(false);
			setSelectedIndex(0);
			resultsQueryRef.current = "";
		});
		return () => {
			setClaudeSessionsUpdateHandler(null);
		};
	}, [activeProvider.id, query]);

	// Fallback refresh on webview visibility/focus events. These are not
	// guaranteed to fire reliably after the chat window has been shown, but
	// when they do, they provide a redundant refresh path. The handleSearch
	// catch/empty-result paths are protected by `preserveOnEmpty`, so a
	// failed RPC here cannot clobber a populated list set by the push above.
	useEffect(() => {
		const onVisible = () => {
			if (document.hidden) return;
			if (activeProvider.id === "claude" && !query.trim()) {
				handleSearch();
			}
		};
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);
		return () => {
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onVisible);
		};
	}, [activeProvider.id, query, handleSearch]);

	const prevSubTypeRef = useRef(activeSubType);
	useEffect(() => {
		if (activeProvider.id !== "github") return;
		const prev = prevSubTypeRef.current;
		prevSubTypeRef.current = activeSubType;
		if (prev === activeSubType) return;
		if (!query.trim()) return;
		handleSearch();
	}, [activeProvider.id, activeSubType, handleSearch, query]);

	// Claude provider shows recent sessions even with empty query
	const hasIdleResults =
		activeProvider.id === "claude" && results.length > 0 && !query.trim();
	const hasContent =
		hasIdleResults ||
		(query.trim().length > 0 &&
			(results.length > 0 || isLoading || error !== null));

	// Resize native window when content appears/disappears, settings dialog toggles, or combobox opens
	useEffect(() => {
		const height = isSettingsOpen
			? SETTINGS_HEIGHT
			: isComboboxOpen || hasContent
				? EXPANDED_HEIGHT
				: COLLAPSED_HEIGHT;
		rpc.request.resizeWindow({ height }).catch(() => {});
	}, [hasContent, isSettingsOpen, isComboboxOpen]);

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
			clearPalette();
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
			const resultsAreFresh = resultsQueryRef.current === query;
			if (resultsAreFresh && results[selectedIndex]) {
				selectResult(results[selectedIndex]);
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
			<div className="border-b px-4 py-3 flex items-center gap-2">
				{activeProvider.id === "github" && (
					<SearchTypeCombobox
						ref={comboboxRef}
						onOpenChange={setIsComboboxOpen}
					/>
				)}
				<SearchInput
					placeholder={activeProvider.placeholder}
					value={query}
					onChange={handleQueryChange}
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
					{results.length > 0 ? (
						<ScrollArea className="flex-1">
							<div className="p-2">
								{results.map((result, i) => (
									<ResultItem
										key={result.id}
										result={result}
										isSelected={i === selectedIndex}
										onSelect={() => selectResult(result)}
									/>
								))}
							</div>
						</ScrollArea>
					) : isLoading ? (
						<div className="flex-1 flex items-center justify-center">
							<p className="text-sm text-muted-foreground animate-pulse">
								Buscando...
							</p>
						</div>
					) : error ? (
						<div className="flex-1 flex items-center justify-center px-4">
							<p className="text-sm text-destructive text-center">{error}</p>
						</div>
					) : (
						<div className="flex-1 flex items-center justify-center">
							<p className="text-sm text-muted-foreground">
								Nenhum resultado encontrado
							</p>
						</div>
					)}
				</div>
			) : null}

			{hasContent && (
				<div className="flex items-center justify-between px-4 py-1.5 border-t border-border/40">
					<span className="text-[10px] text-muted-foreground/60">
						↑↓ navegar
					</span>
					{activeProvider.id === "github" && lastSearchCached === true && (
						<span className="text-[10px] text-amber-300/80">⚡ cache</span>
					)}
					{activeProvider.id === "github" && lastSearchCached === false && (
						<span className="text-[10px] text-blue-300/70">🌐 rede</span>
					)}
					<span className="text-[10px] text-muted-foreground/60">
						{isCalc ? "↵ copiar" : "↵ abrir"} · esc fechar
					</span>
				</div>
			)}
		</div>
	);
}

function AnalyticsInitializer() {
	const { analyticsSettings } = useSettings();

	useEffect(() => {
		if (analyticsSettings.consentGiven && analyticsSettings.anonymousId) {
			initRendererAnalytics(analyticsSettings.anonymousId);
		} else {
			shutdownRendererAnalytics();
		}
	}, [analyticsSettings.consentGiven, analyticsSettings.anonymousId]);

	return null;
}

function App() {
	return (
		<SettingsProvider>
			<AnalyticsInitializer />
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
