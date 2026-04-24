# Ptolomeu

Your daily tools, orbiting you. A macOS menu bar command center for software engineers.

Ptolomeu is a menu bar app for macOS built with [Electrobun](https://electrobun.dev/) (Bun runtime) and React. It provides a global command palette (`⌘+Shift+Space`) extensible via a plugin system — each plugin is a provider that adds a new capability. Ships with 5 built-in plugins.

## Quick Start

```bash
# Prerequisites: macOS (arm64), Bun, Xcode Command Line Tools
bun install
bun run dev:hmr
```

## Built-in Plugins

| Plugin | Description |
|--------|-------------|
| **GitHub** | Search repos, code, issues, users. Custom filters, qualifier builder, team repos. |
| **Apps** | Launch macOS applications from the palette. |
| **Calculator** | Evaluate math expressions inline. |
| **Web Search** | Quick access to Google, DuckDuckGo, StackOverflow, YouTube. |
| **Claude AI** | Chat with Claude — streaming responses, session persistence, dedicated window. |

## Plugin System

Every plugin implements the `SearchProvider` interface:

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

Results returned by `search()`:

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

### Creating a Plugin

```typescript
// src/mainview/providers/npm-provider.ts
import { Package } from "lucide-react";
import type { SearchProvider } from "./types";

export const npmProvider: SearchProvider = {
  id: "npm",
  label: "npm",
  icon: Package,
  placeholder: "Search npm packages...",

  async search(query) {
    if (!query) return [];
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`
    );
    const data = await res.json();
    return data.objects.map((obj: any) => ({
      id: obj.package.name,
      title: obj.package.name,
      subtitle: obj.package.description,
      badge: obj.package.version,
      onSelect: () => window.open(`https://npmjs.com/package/${obj.package.name}`),
    }));
  },
};
```

Register it in `src/mainview/providers/registry.ts`:

```typescript
import { npmProvider } from "./npm-provider";

export const PLUGIN_REGISTRY: Record<string, SearchProvider> = {
  // ... existing plugins
  npm: npmProvider,
};

export const PLUGIN_META: PluginMeta[] = [
  // ... existing entries
  { id: "npm", label: "npm", description: "Search npm packages", icon: Package },
];
```

### Plugin Ideas

Looking for inspiration? Here are some plugins the community could build:

- **Jira / Linear** — issues, boards, sprint status
- **Slack** — channels, messages, people
- **AWS Console** — services, resources, CloudWatch
- **Docker** — containers, images, compose stacks
- **npm / PyPI** — package registry search
- **Homebrew** — formulae, casks
- **Kubernetes** — pods, deployments, services
- **CI/CD** — GitHub Actions, CircleCI run status
- **Bookmarks** — browser bookmarks search
- **Notes** — Apple Notes, Obsidian vault search

Don't see your tool? Build a plugin and open a PR.

## Architecture

| Process | Path | Role |
|---------|------|------|
| **Main** | `src/bun/` | Runs in Bun. System tray, windows, native FFI, global hotkey. |
| **Renderer** | `src/mainview/` | React app in BrowserWindow. Command palette, plugins, settings. |

```
┌──────────────┐      RPC      ┌───────────────────┐
│  Main (Bun)   │◄────────────►│  Renderer (React)  │
│  tray, FFI,   │              │  palette, UI,      │
│  native APIs  │              │  plugins           │
└──────────────┘              └───────────────────┘
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## Development

**Dev with HMR (recommended)**

```bash
bun run dev:hmr         # Vite HMR + Electrobun concurrently
```

**Build**

```bash
bun run build:native    # Compile Objective-C → liboverlay.dylib
bun run build:canary    # Production build
```

**Test**

```bash
bun run test              # Unit + integration tests (Vitest)
bun run test:watch        # Vitest in watch mode
bun run test:coverage     # Coverage report (HTML in ./coverage/)
bun run build:dev-bundle  # Build the dev .app bundle (needed for E2E)
bun run test:e2e          # E2E tests (Appium Mac2; requires the dev bundle)
bun run screenshots       # Build dev bundle + run E2E + regenerate docs/screenshots/
```

The E2E suite drives a real macOS app via Appium Mac2 and writes PNG
screenshots to `docs/screenshots/`. Both the CI `e2e` job and the `screenshots`
npm script produce the dev bundle via `electrobun build --env=dev` before
running.

Vitest runs two projects side by side:

- `node` — backend modules (`src/bun/**`, `src/chatview/lib/**`, `src/chatview/hooks/**`)
- `jsdom` — React UI (`src/mainview/**`, `src/chatview/components/**`, `src/lib/**`)

**Git hooks (lefthook)**

Lefthook installs automatically via `bun install` (runs `lefthook install` through the `prepare` script). Every commit runs Biome on the staged files and Vitest on the tests affected by the change. To skip temporarily: `LEFTHOOK=0 git commit …`.

**Lint**

```bash
bun run lint            # Biome check
bun run lint:fix        # Biome auto-fix
```

## Contributing

### Report Bugs

Open an issue with reproduction steps. Include your macOS version, Bun version, and steps to reproduce.

### Suggest a Plugin

Open an issue tagged `plugin-idea`. Describe the tool or service and what searches it would enable.

### Build a Plugin

1. Implement the `SearchProvider` interface (see [Plugin System](#plugin-system) above)
2. Add your provider to `PLUGIN_REGISTRY` in `src/mainview/providers/registry.ts`
3. Add a `PluginMeta` entry with icon, label, and description
4. Open a PR

### Code Standards

- **Linter/formatter:** Biome — run `bun run lint:fix` before committing
- **Commits:** conventional commits (`feat(scope):`, `fix(scope):`)
- **UI labels:** Portuguese (pt-BR) — "Abrir", "Sair", "Buscar"
- **Package manager:** Bun only (`bun install`, `bun run`)
- **Path alias:** `@/*` maps to `src/*`

### PR Process

1. Fork the repo
2. Create a feature branch (`feat/my-plugin`)
3. Run `bun run lint:fix && bun run test`
4. Open a PR with a description of your changes

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.

---

> Named after Claudius Ptolemy, who placed Earth at the center of the cosmos. Ptolomeu places you at the center of your workflow.

🇧🇷 [Leia em Português](README.pt-BR.md)
