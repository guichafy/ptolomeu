# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ptolomeu** — macOS menu bar desktop app: a global command palette (⌘+Shift+Space) with a plugin-based search architecture and an embedded Claude chat window. Built with Electrobun (Bun runtime, not Electron), React 19, Tailwind CSS 4, and Vite. Uses native Objective-C for window overlay and global hotkey registration.

## Commands

```bash
bun install                # Install dependencies (also runs `lefthook install` via `prepare`)
bun run dev:hmr            # Recommended dev — Vite (mainview + chatview) + Electrobun, all watching
bun run dev                # Dev without HMR (build once, watch for native/asset changes)
bun run start              # Build native + Vite (both views) + launch
bun run build:native       # Compile Objective-C → liboverlay.dylib (arm64 only)
bun run build:vite         # Build mainview (dist/) + chatview (dist-chat/)
bun run build:dev-bundle   # Full dev .app bundle (required for E2E)
bun run build:canary       # Production build, canary channel
bun run build:release      # Production build, stable channel
```

```bash
bun run test               # Vitest — two projects (node + jsdom), runs both
bun run test:watch         # Vitest in watch mode
bun run test:coverage      # Coverage via @vitest/coverage-v8 (thresholds enforced in vitest.config.ts)
bun run test:e2e           # E2E — Appium Mac2 (requires Xcode + the dev bundle from build:dev-bundle)
bun run screenshots        # Build dev bundle + run E2E + regenerate docs/screenshots/
bun run lint               # Biome check
bun run lint:fix           # Biome auto-fix
bun run devtools           # Launch React DevTools standalone (port 8097)
```

## Architecture

### Process model

1. **Main process** (`src/bun/index.ts`) — runs in Bun. Hides the dock icon (`Utils.setDockIconVisible(false)`) so the app lives in the menu bar only. Owns the system tray, two `BrowserWindow`s (palette + chat), the native FFI bridge, the Claude session manager, and the proxy-aware fetch layer. The palette window is recreated hidden and toggled by the global hotkey; the chat window is lazy and created on first open.

2. **Palette renderer** (`src/mainview/`) — React command palette. Vite root is `src/mainview/`, output `dist/`, copied to `views/mainview/` per `electrobun.config.ts`.

3. **Chat renderer** (`src/chatview/`) — separate React app for the Claude chat surface. Vite config is `vite.chat.config.ts`, root `src/chatview/`, output `dist-chat/`, copied to `views/chatview/`. Two webviews run in the same Bun process but with isolated transports.

### Provider system

Plugin-based search in `src/mainview/providers/`. Each plugin implements `SearchProvider` (`id`, `label`, `icon`, `placeholder`, `search`, optional `useSearchContext`, optional `configComponent`). Five built-ins:

- `apps` — macOS application launcher (`scanApps` over `/Applications`, `/System/Applications`, `~/Applications`)
- `github` — repos / code / issues / users with custom filters and qualifier builder
- `calc` — math expression evaluator
- `web` — Google / DuckDuckGo / Stack Overflow / YouTube
- `claude` — Claude session list + create-new (opens the chat window)

Registry in `registry.ts` (`PLUGIN_REGISTRY`, `PLUGIN_META`); active plugin is managed by `ProviderContextProvider`.

### Settings

`src/mainview/settings/` — dialog with three tabs: **Plugins** (per-plugin enable + per-plugin config nested as sub-items, e.g. GitHub token, Claude auth, MCP servers), **Rede** (proxy mode + manual proxy with Keychain-backed password), **Geral** (analytics consent, etc.). State lives in `SettingsContext` with debounced RPC persistence to `~/Library/Application Support/com.ptolomeu.app/settings.json`. Plugin reordering and custom GitHub filters use `@dnd-kit` drag-drop. Main-process IO in `src/bun/settings.ts` + `settings-io.ts`.

### State management

Pure React Context — no external state library. Three nested providers: `SettingsProvider` (outermost, persistence) → `ProviderContextProvider` (active plugin) → `GitHubProvider` (GitHub-specific state). Local `useState` in `App.tsx` for query/results/loading. Chat window has its own context tree under `src/chatview/`.

### IPC/RPC

Electrobun's `defineElectrobunRPC` with the typed `PtolomeuRPCSchema` in `src/bun/rpc.ts`. Both windows share the same `requestHandlers`, but each gets its **own** `rpc` instance (`mainRpc`, `chatRpc`) — Electrobun keeps a single transport per `rpc` object, so a shared instance would silently re-route pushes after the second window opens. Renderer-side RPC for the palette is in `src/mainview/providers/rpc.ts`; for the chat in `src/chatview/rpc.ts`.

Handler families:

- App launcher: `listApps`, `openApp`, `openUrl`, `getAppIcon`
- Window: `resizeWindow`
- Settings: `loadSettings`, `saveSettings`
- GitHub: `githubGetTokenStatus`, `githubSetToken`, `githubDeleteToken`, `githubFetchSearch`, `githubInvalidateCache`
- Claude session: `claudeListSessions`, `claudeCreateSession`, `claudeResumeSession`, `claudeSendMessage`, `claudeStopGeneration`, `claudeDeleteSession`, `claudeGetSessionMessages`, `claudeOpenChat`
- Claude auth: `claudeGetAuthStatus`, `claudeLoginSSO`, `claudeLogoutSSO`, `claudeSetBedrock`, `claudeGetBedrock`
- Agent HITL: `agentApproveTool`, `agentRejectTool`, `agentListMcpServers`, `agentSaveMcpServers`
- Proxy: `getProxyStatus`, `reloadProxyFromSystem`, `saveManualProxy`, `clearManualProxy`, `testProxyConnection`
- Analytics: `trackAnalyticsEvent`, `setAnalyticsConsent`

Webview-bound messages (bun → renderer): `openPreferences`, `claudeStreamChunk`, `claudeStreamEnd`, `claudeStreamError`, `claudeOpenSession`, `claudeSessionsUpdate`, `agentEvent` (typed event channel for the AI Elements UI).

### Native layer

`src/bun/native/overlay.m` — Objective-C dylib loaded via `bun:ffi`. Symbols:

- `makeWindowOverlay(NSWindow*)` — fullscreen overlay with custom `NSWindowDelegate` that hides instead of closing
- `registerHotkey(NSWindow*)` — global ⌘+Shift+Space via Carbon `RegisterEventHotKey`
- `setWindowShowCallback(JSCallback)` — direct callback when the hotkey transitions the window from hidden to visible (bypasses the unreliable delegate chain so the bun side can refresh Claude session list)
- `quitApp()` — clean shutdown

Compiled with `clang -dynamiclib -framework AppKit -framework Carbon -fobjc-arc -arch arm64`. Recompile after `.m` changes (`bun run build:native`).

### HMR flow

`bun run dev:hmr` runs three watchers concurrently via `concurrently`:

1. `vite build --watch --mode development` (mainview → `dist/`)
2. `vite build --config vite.chat.config.ts --watch --mode development` (chatview → `dist-chat/`)
3. `electrobun dev --watch`

Build mode (rather than `vite dev`) keeps Electrobun's bundle copy rules working; the dev React DevTools script is injected via the `injectReactDevtools` Vite plugin (loads `http://localhost:8097` in dev). Run `bun run devtools` separately to start the standalone DevTools.

### Claude integration (`src/bun/claude/`)

Built on `@anthropic-ai/claude-agent-sdk` (`unstable_v2_*` APIs).

- **Session manager** (`session-manager.ts`) — owns the active SDK session, persists messages, and exposes `create`/`resume`/`send`/`stop`/`delete`/`list`/`getMessages`. Each session gets its own project directory (auto-provisioned, cwd is set to that directory) — workspace isolation is part of the safety model, not just an organization detail.
- **Streaming** (`streaming.ts`) — pushes typed `AgentEvent`s (mapped by `event-mapper.ts` from raw `SDKMessage`s) and legacy `claudeStreamChunk`/`claudeStreamEnd` events to the chat window via `chatRpc`.
- **Permission gate** (`permission-gate.ts`) + **risk classifier** (`risk-classifier.ts`) — every `canUseTool` call creates a pending request; the renderer approves/rejects via `agentApproveTool`/`agentRejectTool`. Auto-whitelist for low-risk tools, session whitelist, audit log via `persistence/tool-decisions.ts`.
- **Workspace jail** (`workspace-jail.ts`) — hard pre-check that rejects Write/Edit/NotebookEdit/Bash invocations whose target path escapes the project workspace, *before* the permission gate sees them. `cwd` alone is not sufficient — the SDK accepts absolute paths.
- **MCP loader** (`mcp-loader.ts`) — runtime registry of MCP servers, persisted alongside settings, configurable via the **Plugins → Claude → MCP Servers** UI.
- **Auth** (`auth.ts`) — Anthropic SSO login/logout and Bedrock config (region, profile).

### Network / proxy (`src/bun/net/`)

`proxy.ts` resolves outbound HTTP routing with five user-selectable modes: `auto` (env → `scutil --proxy` → none), `system` (force `scutil`), `env` (only env vars), `none` (forcibly clear env vars so subprocesses + SDKs also bypass), `manual` (host/port/auth, password kept in Keychain via `PROXY_KEYCHAIN_SERVICE`). Bun's `fetch` accepts a `proxy` option but doesn't honor env vars automatically — `fetchWithProxy` is the wrapper used throughout. `initProxy` runs at startup *before* any fetch, so PostHog, the GitHub fetcher, and the Claude CLI subprocess all inherit the right configuration.

### Analytics

`src/bun/analytics.ts` — PostHog Node SDK, gated by `settings.analytics.consentGiven`. Distinct ID is an anonymous UUID stored in settings. Renderer-side (`src/mainview/analytics.ts`) uses `posthog-js` with the same consent gate. No PII is collected.

### UI stack

- shadcn/ui (New York style) — components in `src/components/ui/`
- AI Elements primitives in `src/components/ai-elements/` (Conversation, Message, PromptInput, Reasoning, Sources, Artifact, CodeBlock, Confirmation, Attachments)
- Radix UI primitives (Dialog, Popover, ScrollArea, Select, Separator, Slot, Switch, Tooltip, Collapsible)
- cmdk for the command palette
- Tailwind CSS 4 — config is **CSS-first** in `src/mainview/index.css` and `src/chatview/index.css` (`@import "tailwindcss" source(...)`, `@theme inline`, `@custom-variant dark`); there is no `tailwind.config.js`
- `src/lib/utils.ts` exports `cn()` (clsx + tailwind-merge)
- lucide-react for icons
- @dnd-kit for drag-drop (plugin reordering, custom GitHub filters)
- react-markdown + remark-gfm + react-syntax-highlighter for assistant message rendering

### Key config files

- `electrobun.config.ts` — app identity (`com.ptolomeu.app`), `exitOnLastWindowClosed: false`, copy rules: `dist/` → `views/mainview/`, `dist-chat/` → `views/chatview/`, dylib + tray icon → `native/`
- `vite.config.ts` — root `src/mainview/`, output `dist/`, manual chunks (vendor-react, vendor-radix, vendor-dnd, vendor-cmdk, vendor-posthog), DevTools injection in dev
- `vite.chat.config.ts` — root `src/chatview/`, output `dist-chat/`, port `5174`, separate vendor chunks for syntax-highlighter and markdown
- `vitest.config.ts` — two projects (`node` for `src/bun/**` + chatview lib/hooks; `jsdom` for mainview + chatview components + `src/lib`), coverage thresholds enforced
- `vitest.config.e2e.ts` — Appium Mac2 driver
- `components.json` — shadcn/ui config with `@/` path alias resolving to `src/`
- `lefthook.yml` — pre-commit hook: Biome check on staged JS/TS + Vitest `--changed` on staged sources
- `biome.json` — linter/formatter config
- `tsconfig.json` — `@/*` → `src/*` path alias

## Conventions

- UI labels are in Portuguese (pt-BR): "Abrir", "Sair", "Buscar", etc.
- Package manager is Bun — `bun install`, `bun run`, `bunx`. Don't introduce npm/yarn/pnpm scripts.
- Path alias `@/*` maps to `src/*` (configured in tsconfig and components.json)
- Linter/formatter is Biome — run `bun run lint:fix` before committing (lefthook also runs it on staged files)
- Commit messages follow conventional commits: `type(scope): description` — semantic-release uses these to generate `CHANGELOG.md`
- Skip lefthook once with `LEFTHOOK=0 git commit ...` if needed; don't commit with hooks bypassed by default
- Workspace isolation is a security boundary, not a hint — when adding tools to the Claude integration, make sure paths stay inside the conversation's project directory
