# Command Palette Universal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Ptolomeu from a GitHub-only search into a universal command palette with 4 providers (Apps, GitHub, Calculator, Web Search) switchable via Tab.

**Architecture:** Provider Plugin System with `SearchProvider` interface. Each provider is an independent module. React Context manages active provider state. Tab cycles through providers. RPC connects renderer to main process for Apps provider.

**Tech Stack:** Electrobun (Bun runtime), React 18, TypeScript, Tailwind CSS, shadcn/ui, Electrobun RPC, Objective-C FFI

**Spec:** `docs/specs/2026-04-06-command-palette-design.md`

---

## File Structure

### New Files
```
src/mainview/providers/
  types.ts                    # SearchProvider, SearchResult interfaces
  provider-context.tsx        # React Context + useProvider hook
  github-provider.ts          # Extracted from existing App.tsx
  calculator-provider.ts      # Safe math evaluation
  web-search-provider.ts      # URL template search engines
  apps-provider.ts            # macOS app search via RPC
  rpc.ts                      # RPC schema definition + init (renderer side)

src/mainview/components/
  mode-bar.tsx                # Tab-switching provider pills
  result-item.tsx             # Generic search result row
  calculator-result.tsx       # Special calculator display

src/bun/rpc.ts                # RPC schema + handlers (main process side)
```

### Modified Files
```
src/bun/index.ts              # Add RPC setup, app listing, app opening handlers
src/bun/native/overlay.m      # Add Escape key + resignKey dismiss behavior
src/mainview/App.tsx           # Replace GitHub-specific logic with provider system
src/mainview/components/
  header-search.tsx            # Replace SearchTypeCombobox with ModeBar
  search-results.tsx           # Generalize to render SearchResult[] (not Repository[])
src/mainview/types.ts          # Update/extend with provider types
```

### Removed Files
```
src/mainview/components/search-type-combobox.tsx  # Replaced by ModeBar
src/mainview/constants.tsx                         # SEARCH_TYPES replaced by providers
```

---

## Task 1: Provider Types and Interfaces

**Files:**
- Create: `src/mainview/providers/types.ts`

- [ ] **Step 1: Create the provider types file**

```typescript
// src/mainview/providers/types.ts
import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

export interface SearchResult {
  id: string
  title: string
  subtitle?: string
  icon?: ReactNode
  badge?: string
  onSelect: () => void
}

export interface SearchProvider {
  id: string
  label: string
  icon: LucideIcon
  placeholder: string
  search: (query: string, signal?: AbortSignal) => Promise<SearchResult[]>
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd /Users/guichafy/Workspaces/BunWorkspace/sample-electronbun && bunx tsc --noEmit src/mainview/providers/types.ts`

If tsc is not configured for standalone files, verify no red squiggles in editor or just proceed — it will be validated when imported.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/providers/types.ts
git commit -m "feat: add SearchProvider and SearchResult interfaces"
```

---

## Task 2: ProviderContext

**Files:**
- Create: `src/mainview/providers/provider-context.tsx`

- [ ] **Step 1: Create the provider context**

```tsx
// src/mainview/providers/provider-context.tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { SearchProvider } from "./types"

interface ProviderContextValue {
  providers: SearchProvider[]
  activeProvider: SearchProvider
  activeIndex: number
  cycleNext: () => void
  cyclePrev: () => void
}

const ProviderContext = createContext<ProviderContextValue | null>(null)

export function ProviderContextProvider({
  providers,
  children,
}: {
  providers: SearchProvider[]
  children: ReactNode
}) {
  const [activeIndex, setActiveIndex] = useState(0)

  const cycleNext = useCallback(() => {
    setActiveIndex((i) => (i + 1) % providers.length)
  }, [providers.length])

  const cyclePrev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + providers.length) % providers.length)
  }, [providers.length])

  return (
    <ProviderContext.Provider
      value={{
        providers,
        activeProvider: providers[activeIndex],
        activeIndex,
        cycleNext,
        cyclePrev,
      }}
    >
      {children}
    </ProviderContext.Provider>
  )
}

export function useProvider() {
  const ctx = useContext(ProviderContext)
  if (!ctx) throw new Error("useProvider must be used within ProviderContextProvider")
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/providers/provider-context.tsx
git commit -m "feat: add ProviderContext for managing active search provider"
```

---

## Task 3: ModeBar Component

**Files:**
- Create: `src/mainview/components/mode-bar.tsx`

- [ ] **Step 1: Create the ModeBar component**

```tsx
// src/mainview/components/mode-bar.tsx
import { cn } from "@/lib/utils"
import { useProvider } from "../providers/provider-context"

export function ModeBar() {
  const { providers, activeIndex } = useProvider()

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 bg-background/30">
      {providers.map((provider, i) => (
        <div
          key={provider.id}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors",
            i === activeIndex
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground"
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
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/components/mode-bar.tsx
git commit -m "feat: add ModeBar component with Tab-switching pills"
```

---

## Task 4: Generic Result Components

**Files:**
- Create: `src/mainview/components/result-item.tsx`
- Create: `src/mainview/components/calculator-result.tsx`

- [ ] **Step 1: Create ResultItem component**

```tsx
// src/mainview/components/result-item.tsx
import { cn } from "@/lib/utils"
import type { SearchResult } from "../providers/types"

interface ResultItemProps {
  result: SearchResult
  isSelected: boolean
}

export function ResultItem({ result, isSelected }: ResultItemProps) {
  return (
    <button
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 w-full text-left rounded-md transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/50"
      )}
      onClick={result.onSelect}
    >
      {result.icon && (
        <span className="shrink-0 text-muted-foreground">{result.icon}</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {result.title}
        </p>
        {result.subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {result.subtitle}
          </p>
        )}
      </div>
      {result.badge && (
        <span className="text-xs text-muted-foreground shrink-0">
          {result.badge}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Create CalculatorResult component**

```tsx
// src/mainview/components/calculator-result.tsx
interface CalculatorResultProps {
  expression: string
  result: string | null
  error: string | null
  onCopy: () => void
}

export function CalculatorResult({ expression, result, error, onCopy }: CalculatorResultProps) {
  if (!expression.trim()) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Digite uma expressão matemática...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2">
      <p className="text-4xl font-bold font-mono text-green-400">
        = {result}
      </p>
      <p className="text-xs text-muted-foreground/60">
        ↵ copiar resultado
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/mainview/components/result-item.tsx src/mainview/components/calculator-result.tsx
git commit -m "feat: add ResultItem and CalculatorResult components"
```

---

## Task 5: GitHub Provider (extract from existing)

**Files:**
- Create: `src/mainview/providers/github-provider.ts`

This extracts the GitHub search logic from `App.tsx` into a provider module. Reuses `LANGUAGE_COLORS` and `formatStars` from `search-results.tsx`.

- [ ] **Step 1: Create the GitHub provider**

```tsx
// src/mainview/providers/github-provider.ts
import { Github, Star, BookMarked } from "lucide-react"
import type { SearchProvider, SearchResult } from "./types"
import { createElement } from "react"

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  PHP: "#4F5D95",
  Shell: "#89e051",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Dart: "#00B4AB",
  Lua: "#000080",
  Zig: "#ec915c",
}

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(count)
}

interface GitHubRepo {
  id: number
  full_name: string
  description: string | null
  stargazers_count: number
  language: string | null
  html_url: string
}

export const githubProvider: SearchProvider = {
  id: "github",
  label: "GitHub",
  icon: Github,
  placeholder: "Buscar repositórios...",
  search: async (query: string, signal?: AbortSignal): Promise<SearchResult[]> => {
    if (!query.trim()) return []

    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query.trim())}`,
      { signal }
    )

    if (!res.ok) {
      if (res.status === 403) {
        throw new Error("Rate limit atingido. Aguarde um momento e tente novamente.")
      }
      throw new Error(`Erro ao buscar: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    const repos: GitHubRepo[] = data.items ?? []

    return repos.map((repo) => ({
      id: String(repo.id),
      title: repo.full_name,
      subtitle: repo.description ?? undefined,
      icon: createElement(BookMarked, { className: "h-4 w-4" }),
      badge: `⭐ ${formatStars(repo.stargazers_count)}${repo.language ? ` · ${repo.language}` : ""}`,
      onSelect: () => window.open(repo.html_url, "_blank"),
    }))
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/providers/github-provider.ts
git commit -m "feat: extract GitHub search into provider module"
```

---

## Task 6: Calculator Provider

**Files:**
- Create: `src/mainview/providers/calculator-provider.ts`

Uses a safe math parser (no `eval`). Supports `+ - * / % ( )` and common functions.

- [ ] **Step 1: Create the calculator provider**

```tsx
// src/mainview/providers/calculator-provider.ts
import { Calculator } from "lucide-react"
import type { SearchProvider, SearchResult } from "./types"

// Safe math evaluator — no eval(), only supports arithmetic
function evaluateMath(expr: string): number {
  // Remove whitespace
  const cleaned = expr.replace(/\s+/g, "")
  if (!cleaned) throw new Error("Expressão vazia")

  // Only allow safe characters: digits, operators, parens, decimal point
  if (!/^[\d+\-*/%().]+$/.test(cleaned)) {
    throw new Error("Caractere inválido")
  }

  // Tokenize
  const tokens: (number | string)[] = []
  let i = 0
  while (i < cleaned.length) {
    if (/\d/.test(cleaned[i]) || (cleaned[i] === "." && i + 1 < cleaned.length && /\d/.test(cleaned[i + 1]))) {
      let num = ""
      while (i < cleaned.length && (/\d/.test(cleaned[i]) || cleaned[i] === ".")) {
        num += cleaned[i++]
      }
      tokens.push(parseFloat(num))
    } else {
      tokens.push(cleaned[i++])
    }
  }

  // Recursive descent parser
  let pos = 0

  function parseExpr(): number {
    let left = parseTerm()
    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
      const op = tokens[pos++]
      const right = parseTerm()
      left = op === "+" ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number {
    let left = parseFactor()
    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/" || tokens[pos] === "%")) {
      const op = tokens[pos++]
      const right = parseFactor()
      if (op === "*") left *= right
      else if (op === "/") left /= right
      else left %= right
    }
    return left
  }

  function parseFactor(): number {
    // Unary minus
    if (tokens[pos] === "-") {
      pos++
      return -parseFactor()
    }
    // Parentheses
    if (tokens[pos] === "(") {
      pos++ // skip (
      const val = parseExpr()
      pos++ // skip )
      return val
    }
    // Number
    if (typeof tokens[pos] === "number") {
      return tokens[pos++] as number
    }
    throw new Error("Expressão inválida")
  }

  const result = parseExpr()
  if (pos < tokens.length) throw new Error("Expressão inválida")
  return result
}

function formatResult(n: number): string {
  if (Number.isInteger(n)) return String(n)
  // Max 10 decimal places, remove trailing zeros
  return parseFloat(n.toFixed(10)).toString()
}

// The calculator provider is special: it returns a single "result" item
// The App.tsx will detect provider.id === "calc" and render CalculatorResult instead
export const calculatorProvider: SearchProvider = {
  id: "calc",
  label: "Calc",
  icon: Calculator,
  placeholder: "Digite uma expressão (ex: 245 * 3 + 17)...",
  search: async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return []

    try {
      const result = evaluateMath(query)
      const formatted = formatResult(result)
      return [{
        id: "calc-result",
        title: formatted,
        subtitle: query,
        onSelect: () => {
          navigator.clipboard.writeText(formatted)
        },
      }]
    } catch {
      return [{
        id: "calc-error",
        title: "Expressão inválida",
        subtitle: "Suporta: + - * / % ( )",
        onSelect: () => {},
      }]
    }
  },
}
```

- [ ] **Step 2: Verify math evaluator works with test expressions**

Open browser console (when app is running) and test:
- `evaluateMath("2 + 3")` → 5
- `evaluateMath("245 * 3 + 17")` → 752
- `evaluateMath("(10 + 5) * 2")` → 30
- `evaluateMath("100 / 3")` → 33.3333333333

(These will be verified visually once wired into the UI)

- [ ] **Step 3: Commit**

```bash
git add src/mainview/providers/calculator-provider.ts
git commit -m "feat: add calculator provider with safe math parser"
```

---

## Task 7: Web Search Provider

**Files:**
- Create: `src/mainview/providers/web-search-provider.ts`

- [ ] **Step 1: Create the web search provider**

```tsx
// src/mainview/providers/web-search-provider.ts
import { Globe } from "lucide-react"
import { createElement } from "react"
import type { SearchProvider, SearchResult } from "./types"

interface SearchEngine {
  id: string
  name: string
  urlTemplate: string
  icon: string
}

const SEARCH_ENGINES: SearchEngine[] = [
  { id: "google", name: "Google", urlTemplate: "https://www.google.com/search?q={query}", icon: "🔵" },
  { id: "duckduckgo", name: "DuckDuckGo", urlTemplate: "https://duckduckgo.com/?q={query}", icon: "🦆" },
  { id: "stackoverflow", name: "Stack Overflow", urlTemplate: "https://stackoverflow.com/search?q={query}", icon: "📚" },
  { id: "youtube", name: "YouTube", urlTemplate: "https://www.youtube.com/results?search_query={query}", icon: "▶️" },
]

export const webSearchProvider: SearchProvider = {
  id: "web",
  label: "Web",
  icon: Globe,
  placeholder: "Buscar na web...",
  search: async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return []

    const encoded = encodeURIComponent(query.trim())
    return SEARCH_ENGINES.map((engine) => {
      const url = engine.urlTemplate.replace("{query}", encoded)
      return {
        id: engine.id,
        title: `Buscar no ${engine.name}`,
        subtitle: url,
        icon: createElement("span", { className: "text-base" }, engine.icon),
        onSelect: () => window.open(url, "_blank"),
      }
    })
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/providers/web-search-provider.ts
git commit -m "feat: add web search provider with Google, DuckDuckGo, SO, YouTube"
```

---

## Task 8: RPC Setup (Main Process + Renderer)

**Files:**
- Create: `src/bun/rpc.ts`
- Create: `src/mainview/providers/rpc.ts`
- Modify: `src/bun/index.ts`

This sets up Electrobun RPC for the Apps provider. The main process lists installed apps and opens them on demand.

- [ ] **Step 1: Create RPC schema and handlers for main process**

```typescript
// src/bun/rpc.ts
import { defineElectrobunRPC, type ElectrobunRPCSchema } from "electrobun/bun";
import { readdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      listApps: { params: void; response: { name: string; path: string }[] };
      openApp: { params: { path: string }; response: boolean };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
}

// Cache app list to avoid repeated fs reads
let cachedApps: { name: string; path: string }[] | null = null;

async function scanApps(): Promise<{ name: string; path: string }[]> {
  if (cachedApps) return cachedApps;

  const dirs = ["/Applications", join(homedir(), "Applications")];
  const apps: { name: string; path: string }[] = [];

  for (const dir of dirs) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (entry.endsWith(".app")) {
          apps.push({
            name: entry.replace(/\.app$/, ""),
            path: join(dir, entry),
          });
        }
      }
    } catch {
      // Directory may not exist (e.g., ~/Applications)
    }
  }

  // Sort alphabetically
  apps.sort((a, b) => a.name.localeCompare(b.name));
  cachedApps = apps;
  return apps;
}

export const rpc = defineElectrobunRPC<PtolomeuRPCSchema>("bun", {
  handlers: {
    requests: {
      listApps: async () => {
        return scanApps();
      },
      openApp: async ({ path }) => {
        try {
          Bun.spawn(["open", "-a", path]);
          return true;
        } catch {
          return false;
        }
      },
    },
  },
});
```

- [ ] **Step 2: Wire RPC into BrowserWindow creation in main process**

Modify `src/bun/index.ts` — add the RPC import and pass it to BrowserWindow.

Find this block in `src/bun/index.ts`:
```typescript
const mainWindow = new BrowserWindow({
	title: "Ptolomeu",
	url,
	hidden: true,
	frame: {
		width: 630,
		height: 260,
		x: 200,
		y: 200,
	},
});
```

Replace with:
```typescript
import { rpc } from "./rpc";

const mainWindow = new BrowserWindow({
	title: "Ptolomeu",
	url,
	hidden: true,
	frame: {
		width: 630,
		height: 260,
		x: 200,
		y: 200,
	},
	rpc,
});
```

Note: The `import { rpc } from "./rpc"` should go at the top of the file with other imports.

- [ ] **Step 3: Create renderer-side RPC client**

```typescript
// src/mainview/providers/rpc.ts
import { Electroview, type ElectrobunRPCSchema } from "electrobun/view"

interface PtolomeuRPCSchema extends ElectrobunRPCSchema {
  bun: {
    requests: {
      listApps: { params: void; response: { name: string; path: string }[] };
      openApp: { params: { path: string }; response: boolean };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {};
  };
}

export const rpc = Electroview.defineRPC<PtolomeuRPCSchema>({
  handlers: {},
})
```

- [ ] **Step 4: Commit**

```bash
git add src/bun/rpc.ts src/mainview/providers/rpc.ts src/bun/index.ts
git commit -m "feat: set up Electrobun RPC for app listing and launching"
```

---

## Task 9: Apps Provider

**Files:**
- Create: `src/mainview/providers/apps-provider.ts`

- [ ] **Step 1: Create the apps provider**

```tsx
// src/mainview/providers/apps-provider.ts
import { AppWindow } from "lucide-react"
import { createElement } from "react"
import type { SearchProvider, SearchResult } from "./types"
import { rpc } from "./rpc"

export const appsProvider: SearchProvider = {
  id: "apps",
  label: "Apps",
  icon: AppWindow,
  placeholder: "Buscar aplicativos...",
  search: async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) {
      // Show all apps when query is empty
      try {
        const apps = await rpc.request.listApps()
        return apps.slice(0, 20).map((app) => ({
          id: app.path,
          title: app.name,
          subtitle: app.path,
          icon: createElement("span", { className: "text-base" }, "📱"),
          onSelect: () => { rpc.request.openApp({ path: app.path }) },
        }))
      } catch {
        return []
      }
    }

    try {
      const apps = await rpc.request.listApps()
      const lowerQuery = query.toLowerCase().trim()
      const filtered = apps.filter((app) =>
        app.name.toLowerCase().includes(lowerQuery)
      )

      return filtered.map((app) => ({
        id: app.path,
        title: app.name,
        subtitle: app.path,
        icon: createElement("span", { className: "text-base" }, "📱"),
        onSelect: () => { rpc.request.openApp({ path: app.path }) },
      }))
    } catch {
      return [{
        id: "error",
        title: "Erro ao listar apps",
        subtitle: "Verifique a conexão RPC",
        onSelect: () => {},
      }]
    }
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/providers/apps-provider.ts
git commit -m "feat: add apps provider with RPC-based macOS app search"
```

---

## Task 10: Wire App.tsx with Provider System

**Files:**
- Modify: `src/mainview/App.tsx`
- Modify: `src/mainview/components/header-search.tsx`
- Modify: `src/mainview/components/search-results.tsx`

This is the main integration task that replaces the old GitHub-specific UI with the provider system.

- [ ] **Step 1: Rewrite App.tsx**

Replace the entire contents of `src/mainview/App.tsx` with:

```tsx
// src/mainview/App.tsx
import { useCallback, useEffect, useRef, useState } from "react"
import { ProviderContextProvider, useProvider } from "./providers/provider-context"
import { ModeBar } from "./components/mode-bar"
import { SearchInput } from "./components/search-input"
import { ResultItem } from "./components/result-item"
import { CalculatorResult } from "./components/calculator-result"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SearchResult } from "./providers/types"

import { appsProvider } from "./providers/apps-provider"
import { githubProvider } from "./providers/github-provider"
import { calculatorProvider } from "./providers/calculator-provider"
import { webSearchProvider } from "./providers/web-search-provider"

const providers = [appsProvider, githubProvider, calculatorProvider, webSearchProvider]

function PaletteContent() {
  const { activeProvider, cycleNext, cyclePrev } = useProvider()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const prevProviderRef = useRef(activeProvider.id)

  // Reset state when provider changes
  useEffect(() => {
    if (prevProviderRef.current !== activeProvider.id) {
      setQuery("")
      setResults([])
      setError(null)
      setSelectedIndex(0)
      prevProviderRef.current = activeProvider.id
    }
  }, [activeProvider.id])

  const handleSearch = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)
    setSelectedIndex(0)

    try {
      const items = await activeProvider.search(query, controller.signal)
      if (!controller.signal.aborted) {
        setResults(items)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
        setResults([])
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [activeProvider, query])

  // Auto-search for calculator (real-time) and apps (on any change)
  useEffect(() => {
    if (activeProvider.id === "calc" || activeProvider.id === "apps") {
      const timer = setTimeout(handleSearch, activeProvider.id === "calc" ? 100 : 300)
      return () => clearTimeout(timer)
    }
  }, [query, activeProvider.id, handleSearch])

  const hasContent = results.length > 0 || isLoading || error !== null

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault()
      if (e.shiftKey) cyclePrev()
      else cycleNext()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === "Enter") {
      if (results[selectedIndex]) {
        results[selectedIndex].onSelect()
      } else if (activeProvider.id !== "calc" && activeProvider.id !== "apps") {
        handleSearch()
      }
      return
    }
  }

  const isCalc = activeProvider.id === "calc"
  const calcResult = isCalc && results.length > 0 ? results[0] : null

  return (
    <div className="flex flex-col min-h-screen" onKeyDown={handleKeyDown}>
      <ModeBar />
      <div className="border-b px-4 py-3">
        <SearchInput
          placeholder={activeProvider.placeholder}
          value={query}
          onChange={setQuery}
          onSubmit={handleSearch}
        />
      </div>

      {isCalc ? (
        <CalculatorResult
          expression={query}
          result={calcResult?.title ?? null}
          error={calcResult?.title === "Expressão inválida" ? calcResult.subtitle ?? null : error}
          onCopy={() => calcResult?.onSelect()}
        />
      ) : hasContent ? (
        isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground animate-pulse">Buscando...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center px-4">
            <p className="text-sm text-destructive text-center">{error}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Nenhum resultado encontrado</p>
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
        )
      ) : null}

      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground/60">↑↓ navegar</span>
        <span className="text-[10px] text-muted-foreground/60">
          {isCalc ? "↵ copiar" : "↵ abrir"} · esc fechar
        </span>
      </div>
    </div>
  )
}

function App() {
  return (
    <ProviderContextProvider providers={providers}>
      <PaletteContent />
    </ProviderContextProvider>
  )
}

export default App
```

- [ ] **Step 2: Simplify HeaderSearch → just exports SearchInput**

Since the ModeBar is now separate and the combobox is removed, update `src/mainview/components/header-search.tsx`:

Actually, `HeaderSearch` is no longer needed — `App.tsx` now renders `ModeBar` + `SearchInput` directly. We can delete `header-search.tsx` later in cleanup. For now, leave it — it's not imported anymore.

- [ ] **Step 3: Verify the app compiles and renders**

Run: `bun run dev:hmr`

Open the app via Ctrl+Option+Space. Verify:
- ModeBar shows 4 provider pills (Apps, GitHub, Calc, Web)
- Tab switches between providers
- Input placeholder changes per provider
- Footer shows keyboard hints

- [ ] **Step 4: Commit**

```bash
git add src/mainview/App.tsx
git commit -m "feat: wire App.tsx with provider system and keyboard navigation"
```

---

## Task 11: Native Layer — Escape and Click-Outside Dismiss

**Files:**
- Modify: `src/bun/native/overlay.m`

- [ ] **Step 1: Update the Objective-C delegate to handle Escape and resignKey**

Replace the entire contents of `src/bun/native/overlay.m` with:

```objc
#import <AppKit/AppKit.h>
#include <signal.h>

// Custom window that intercepts Escape key
@interface OverlayWindow : NSWindow
@end

@implementation OverlayWindow

- (void)keyDown:(NSEvent *)event {
    // Escape key hides the window
    if (event.keyCode == 53) {
        [self orderOut:nil];
        [NSApp hide:nil];
        return;
    }
    [super keyDown:event];
}

@end

// Delegate that hides the window instead of closing it
@interface OverlayWindowDelegate : NSObject <NSWindowDelegate>
@property (nonatomic, weak) id originalDelegate;
@end

@implementation OverlayWindowDelegate

- (BOOL)windowShouldClose:(NSWindow *)sender {
    [sender orderOut:nil];
    return NO;
}

- (void)windowDidResignKey:(NSNotification *)notification {
    NSWindow *window = notification.object;
    [window orderOut:nil];
    [NSApp hide:nil];
}

- (BOOL)respondsToSelector:(SEL)aSelector {
    if (aSelector == @selector(windowShouldClose:)) return YES;
    if (aSelector == @selector(windowDidResignKey:)) return YES;
    if (self.originalDelegate && [self.originalDelegate respondsToSelector:aSelector]) return YES;
    return [super respondsToSelector:aSelector];
}

- (id)forwardingTargetForSelector:(SEL)aSelector {
    if (self.originalDelegate && [self.originalDelegate respondsToSelector:aSelector]) {
        return self.originalDelegate;
    }
    return [super forwardingTargetForSelector:aSelector];
}

@end

static OverlayWindowDelegate *overlayDelegate = nil;

void makeWindowOverlay(void *nsWindowPtr) {
    if (!nsWindowPtr) return;
    NSWindow *window = (__bridge NSWindow *)nsWindowPtr;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (window.delegate != overlayDelegate) {
            if (!overlayDelegate) {
                overlayDelegate = [[OverlayWindowDelegate alloc] init];
            }
            overlayDelegate.originalDelegate = window.delegate;
            window.delegate = overlayDelegate;
        }

        [window setOpaque:NO];
        [window setBackgroundColor:[[NSColor blackColor] colorWithAlphaComponent:0.85]];
        [window setCollectionBehavior:
            NSWindowCollectionBehaviorMoveToActiveSpace |
            NSWindowCollectionBehaviorFullScreenAuxiliary];
        [window setLevel:NSStatusWindowLevel];

        NSScreen *screen = [NSScreen mainScreen];
        if (screen) {
            NSRect screenFrame = [screen visibleFrame];
            NSRect windowFrame = [window frame];
            CGFloat x = NSMidX(screenFrame) - windowFrame.size.width / 2;
            CGFloat y = NSMidY(screenFrame) - windowFrame.size.height / 2;
            [window setFrameOrigin:NSMakePoint(x, y)];
        }

        [window orderFrontRegardless];
        [NSApp activateIgnoringOtherApps:YES];
    });
}

void quitApp(void) {
    kill(0, SIGTERM);
    _exit(0);
}
```

Key changes from original:
- Added `OverlayWindow` subclass with `keyDown:` intercepting Escape (keyCode 53)
- Added `windowDidResignKey:` to delegate — hides window when it loses focus (click outside)
- Both hide paths call `[NSApp hide:nil]` to deactivate the app after hiding

Note: The `OverlayWindow` subclass approach may not work if Electrobun manages its own NSWindow class. In that case, the Escape handling will need to be done in the renderer via JavaScript `keydown` listener (fallback approach). The `windowDidResignKey:` in the delegate WILL work regardless.

- [ ] **Step 2: Rebuild the native library**

Run: `bun run build:native`

Verify it compiles without errors.

- [ ] **Step 3: Add Escape key fallback in renderer**

Since the native `keyDown:` override may not intercept events that the webview consumes, add a JavaScript fallback. In `App.tsx`, the `handleKeyDown` function should also handle Escape. Add this case to `handleKeyDown` in `PaletteContent`:

Already handled — we need to add Escape to the `handleKeyDown` in App.tsx. Add this at the beginning of `handleKeyDown`:

```typescript
if (e.key === "Escape") {
  // Clear state — native layer will hide the window
  setQuery("")
  setResults([])
  setError(null)
  setSelectedIndex(0)
  return
}
```

The native delegate handles hiding the window; the renderer just clears its state.

- [ ] **Step 4: Commit**

```bash
git add src/bun/native/overlay.m src/mainview/App.tsx
git commit -m "feat: add Escape dismiss and click-outside hide behavior"
```

---

## Task 12: Cleanup Old Components

**Files:**
- Delete: `src/mainview/components/search-type-combobox.tsx`
- Delete: `src/mainview/constants.tsx`
- Modify: `src/mainview/types.ts`

- [ ] **Step 1: Remove old files**

```bash
rm src/mainview/components/search-type-combobox.tsx
rm src/mainview/constants.tsx
```

- [ ] **Step 2: Clean up types.ts**

The `Repository` and `SearchType` types are no longer used externally. Replace `src/mainview/types.ts` with a re-export of provider types:

```typescript
// src/mainview/types.ts
export type { SearchProvider, SearchResult } from "./providers/types"
```

- [ ] **Step 3: Check no broken imports remain**

Run: `cd /Users/guichafy/Workspaces/BunWorkspace/sample-electronbun && bunx tsc --noEmit`

Or run `bun run dev:hmr` and verify no build errors in the terminal.

- [ ] **Step 4: Commit**

```bash
git rm src/mainview/components/search-type-combobox.tsx src/mainview/constants.tsx
git add src/mainview/types.ts
git commit -m "refactor: remove old search type components, clean up types"
```

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Build native library**

```bash
bun run build:native
```

- [ ] **Step 2: Start dev server**

```bash
bun run dev:hmr
```

- [ ] **Step 3: Verify all features**

1. **Hotkey**: Press Ctrl+Option+Space → window appears, centered, dark overlay
2. **ModeBar**: 4 pills visible — Apps (active), GitHub, Calc, Web
3. **Tab**: Press Tab → cycles to GitHub, then Calc, then Web, back to Apps
4. **Shift+Tab**: Cycles backward
5. **Apps**: Type "sla" → shows Slack (or similar matching app). Enter opens the app.
6. **GitHub**: Tab to GitHub, type "electrobun", press Enter → repos appear. Enter on result opens browser.
7. **Calculator**: Tab to Calc, type "245 * 3 + 17" → shows "= 752" in green. Enter copies "752".
8. **Web Search**: Tab to Web, type "bun runtime" → shows Google, DuckDuckGo, SO, YouTube options. Enter opens in browser.
9. **Escape**: Press Escape → window hides, state clears
10. **Click outside**: Click outside window → window hides
11. **Re-activate**: Press Ctrl+Option+Space again → window appears clean (empty input, no results)
12. **Arrow keys**: Type a query, use ↑↓ to navigate results, selected item highlights

- [ ] **Step 4: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "fix: final adjustments from end-to-end verification"
```
