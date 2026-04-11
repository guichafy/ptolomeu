# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ptolomeu** — macOS menu bar desktop app for GitHub repository search. Built with Electrobun (Bun runtime, not Electron), React 18, Tailwind CSS, and Vite. Uses native Objective-C for macOS window management.

## Commands

```bash
bun install                # Install dependencies
bun run dev:hmr            # Development with HMR (recommended) — runs Vite + Electrobun concurrently
bun run dev                # Development without HMR (uses bundled assets, watches for changes)
bun run start              # Build native + Vite build + launch (no watch)
bun run build:native       # Compile Objective-C → liboverlay.dylib (arm64 only)
bun run build:canary       # Production build with canary environment
```

```bash
bun run test               # Unit tests (Vitest)
bun run test:e2e           # E2E tests — Appium Mac2 (requires Xcode + mac2 driver)
bun run screenshots        # Build + E2E screenshots to docs/screenshots/
bun run lint               # Biome linting
```

## Architecture

### Two-process model

1. **Main process** (`src/bun/index.ts`) — runs in Bun. Manages windows, system tray, native FFI. Hides dock icon (`Utils.setDockIconVisible(false)`) — app lives in the menu bar only. Window hides on close instead of quitting (native delegate behavior).

2. **Renderer** (`src/mainview/`) — React app loaded in a BrowserWindow. Vite builds to `dist/`, which Electrobun copies into the app bundle per `electrobun.config.ts` copy rules.

### Native layer

`src/bun/native/overlay.m` — Objective-C dylib loaded via `bun:ffi`. Provides `makeWindowOverlay(NSWindow*)` (fullscreen overlay with custom delegate that hides instead of closing) and `quitApp()`. Compiled with `clang -dynamiclib -framework AppKit -fobjc-arc -arch arm64`. Must recompile after changes (`bun run build:native`).

### HMR flow

`bun run dev:hmr` starts Vite on `:5173` concurrently with Electrobun. Main process probes `http://localhost:5173` — if reachable in dev channel, BrowserWindow loads from Vite (instant React updates). Otherwise falls back to bundled `views://mainview/index.html`.

### UI stack

- shadcn/ui (New York style) — components in `src/components/ui/`
- Radix UI primitives (Dialog, Popover)
- cmdk for command menu
- Tailwind CSS 3 with dark mode enabled by default
- `src/lib/utils.ts` exports `cn()` (clsx + tailwind-merge)

### Key config files

- `electrobun.config.ts` — app identity (`com.ptolomeu.app`), build copy rules (dist → views, dylib → native), `exitOnLastWindowClosed: false`
- `vite.config.ts` — root is `src/mainview/`, output to `dist/`
- `components.json` — shadcn/ui config with `@/` path alias resolving to `src/`
- `tailwind.config.js` — CSS variable-based theming, custom animations

## Conventions

- UI labels are in Portuguese (pt-BR): "Abrir", "Sair", etc.
- Package manager is Bun — use `bun install`, `bun run`, `bunx`
- Path alias `@/*` maps to `src/*` (configured in tsconfig and components.json)
