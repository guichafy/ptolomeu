# README Open Source Redesign — Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Approach:** Technical-first (Bun/esbuild style) with plugin system as central feature

## Decisions Made

| Decision | Choice |
|----------|--------|
| Target audience | Software engineers in general — hub centralizado na menu bar |
| Tone | Technical-first, metáfora como tagline (não intro longa) |
| Language | English (main) + link to README.pt-BR.md |
| Plugin positioning | Central feature — maior seção do README |
| Contributing | Inline no README, sem link externo |
| License | Apache 2.0 |
| Style reference | Bun, esbuild — respeita tempo do leitor, info acionável |

## README Structure

### 1. Header + Tagline

```markdown
# Ptolomeu

Your daily tools, orbiting you. A macOS menu bar command center for software engineers.
```

Single line. "Orbiting you" references Claudius Ptolemy's geocentric model without explaining it. Those who know the reference get it; everyone else reads it as "tools around you".

### 2. What It Is (2-3 sentences)

- macOS menu bar app built with Electrobun (Bun runtime) + React
- Extensible via plugin system — each plugin is a provider that adds a capability to the command palette
- Ships with 5 built-in plugins: GitHub, Apps, Calculator, Web Search, Claude AI
- Global hotkey `⌘+Shift+Space` to summon

### 3. Quick Start

```bash
# Prerequisites: macOS (arm64), Bun, Xcode Command Line Tools
bun install
bun run dev:hmr
```

Three lines. No filler.

### 4. Built-in Plugins (table)

| Plugin | Description |
|--------|-------------|
| **GitHub** | Search repos, code, issues, users. Custom filters, qualifier builder, team repos. |
| **Apps** | Launch macOS applications from the palette. |
| **Calculator** | Evaluate math expressions inline. |
| **Web Search** | Quick access to Google, DuckDuckGo, StackOverflow, YouTube. |
| **Claude AI** | Chat with Claude — streaming responses, session persistence, dedicated window. |

### 5. Plugin System (largest section)

#### 5a. Interface

Show the real `SearchProvider` interface from `src/mainview/providers/types.ts`:

```typescript
interface SearchProvider {
  id: string;
  label: string;
  icon: IconComponent;
  placeholder: string;
  search(query: string, signal?: AbortSignal, context?: unknown): Promise<SearchResult[]>;
  useSearchContext?: () => unknown;   // optional reactive context
  configComponent?: ComponentType;    // optional settings UI
}
```

And `SearchResult`:

```typescript
interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: string;
  onSelect: () => void;
}
```

#### 5b. Creating a Plugin (example skeleton)

Fictional "npm" provider (~20 lines) showing:
1. Implement `SearchProvider`
2. Return `SearchResult[]` from `search()`
3. Register in `PLUGIN_REGISTRY` (registry.ts)
4. Add `PluginMeta` entry

The example must be realistic but minimal — fetch from an API, map to SearchResult, register.

#### 5c. Plugin Ideas (community call-to-action)

Bulleted list of ideas to inspire contributions:

- Jira / Linear (issues, boards)
- Slack (channels, messages, people)
- AWS Console (services, resources)
- Docker (containers, images)
- npm / PyPI registry search
- Homebrew (formulae, casks)
- Kubernetes (pods, deployments, services)
- CI/CD status (GitHub Actions, CircleCI)
- Bookmarks (browser bookmarks search)
- Notes (Apple Notes, Obsidian)

Closing line: "Don't see your tool? Build a plugin and open a PR."

### 6. Architecture (concise)

#### 6a. Two-process table

| Process | Path | Role |
|---------|------|------|
| **Main** | `src/bun/` | Runs in Bun. System tray, windows, native FFI, global hotkey. |
| **Renderer** | `src/mainview/` | React app in BrowserWindow. Command palette, plugins, settings. |

#### 6b. ASCII diagram

```
┌─────────────┐     RPC      ┌──────────────────┐
│  Main (Bun)  │◄────────────►│ Renderer (React)  │
│  tray, FFI,  │              │  palette, UI,     │
│  native APIs │              │  plugins          │
└──────────────┘              └──────────────────┘
```

#### 6c. Link to CLAUDE.md

"See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation."

### 7. Development

Subheadings with commands:

**Dev with HMR (recommended)**
```bash
bun run dev:hmr    # Vite HMR + Electrobun concurrently
```

**Build**
```bash
bun run build:native    # Compile Objective-C → liboverlay.dylib
bun run build:canary    # Production build
```

**Test**
```bash
bun run test        # Unit tests (Vitest)
bun run test:e2e    # E2E tests (Appium Mac2)
```

**Lint**
```bash
bun run lint        # Biome check
bun run lint:fix    # Biome auto-fix
```

### 8. Contributing

Inline, no external file. Subsections:

#### 8a. Report Bugs
- Open an issue with reproduction steps
- Include macOS version, Bun version, steps to reproduce

#### 8b. Suggest a Plugin
- Open an issue tagged `plugin-idea`
- Describe the tool/service and what searches it would enable

#### 8c. Build a Plugin
1. Implement `SearchProvider` interface
2. Add to `PLUGIN_REGISTRY` in `src/mainview/providers/registry.ts`
3. Add `PluginMeta` entry with icon, label, description
4. Open a PR

#### 8d. Code Standards
- Linter/formatter: Biome — run `bun run lint:fix` before committing
- Commit messages: conventional commits (`feat(scope):`, `fix(scope):`)
- UI labels: Portuguese (pt-BR) — "Abrir", "Sair", "Buscar"
- Package manager: Bun only (`bun install`, `bun run`)
- Path alias: `@/*` → `src/*`

#### 8e. PR Process
1. Fork the repo
2. Create a feature branch (`feat/my-plugin`)
3. Run `bun run lint:fix && bun run test`
4. Open a PR with description of changes

### 9. Footer

#### 9a. License
```
Apache 2.0 — see LICENSE for details.
```

#### 9b. Inspiration
> Named after Claudius Ptolemy, who placed Earth at the center of the cosmos. Ptolomeu places you at the center of your workflow.

#### 9c. Portuguese
```
🇧🇷 [Leia em Português](README.pt-BR.md)
```

## Out of Scope

- README.pt-BR.md (separate task)
- LICENSE file creation (separate task, Apache 2.0 text)
- CONTRIBUTING.md (contributing is inline in README per decision)
- Badges (CI status, license badge — can be added later)
- Screenshots/GIFs (can be added later when app is more polished)
- Logo/branding assets

## Implementation Notes

- The current README.md will be replaced entirely
- The current README content (in Portuguese) should be moved to README.pt-BR.md as a starting point
- The `SearchProvider` interface and `SearchResult` shown in the README must match the real types in `src/mainview/providers/types.ts` exactly
- The example plugin should be realistic but not functional — it's documentation, not runnable code
