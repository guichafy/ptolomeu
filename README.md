# Ptolomeu

App de menu bar para macOS que permite buscar repositórios no GitHub diretamente da barra de menus. Construído com [Electrobun](https://electrobun.dev/) (runtime Bun), React 18, Tailwind CSS 4 e Vite.

## Funcionalidades

- Busca de repositórios GitHub via command palette (cmdk)
- Vive exclusivamente na barra de menus (sem ícone no Dock)
- Atalho global **⌘ + Shift + Space** para abrir/fechar
- Janela overlay em tela cheia com delegate nativo que esconde ao fechar
- Splash screen na inicialização
- Interface em português (pt-BR)

## Pré-requisitos

- macOS (arm64)
- [Bun](https://bun.sh/) instalado
- Xcode Command Line Tools (para compilar a dylib nativa)

## Instalação

```bash
bun install
```

## Desenvolvimento

```bash
# Recomendado — Vite HMR + Electrobun rodando juntos
bun run dev:hmr

# Sem HMR (builda assets e observa mudanças)
bun run dev

# Build completo + executa (sem watch)
bun run start
```

## Build

```bash
# Build de produção (canary)
bun run build:canary

# Compilar a dylib nativa (Objective-C → liboverlay.dylib)
bun run build:native
```

## Lint e Testes

```bash
bun run lint          # Biome check
bun run lint:fix      # Biome check com auto-fix
bun run test          # Vitest
```

## Arquitetura

### Modelo de dois processos

| Processo | Caminho | Responsabilidade |
|----------|---------|------------------|
| **Main** | `src/bun/index.ts` | Roda no Bun. Gerencia janelas, system tray, FFI nativo, atalhos globais. |
| **Renderer** | `src/mainview/` | App React carregado em BrowserWindow. Vite builda para `dist/`. |

### Camada nativa

`src/bun/native/overlay.m` — dylib Objective-C carregada via `bun:ffi`. Expõe:

- `makeWindowOverlay(NSWindow*)` — overlay fullscreen com delegate customizado
- `registerHotkey(NSWindow*)` — atalho global ⌘+Shift+Space via Carbon API
- `quitApp()` — encerra o app

Após alterações no `.m`, recompilar com `bun run build:native`.

### HMR

`bun run dev:hmr` inicia o Vite na porta `5173` em paralelo com o Electrobun. O processo main detecta o servidor — se acessível, carrega do Vite (hot reload instantâneo). Caso contrário, usa os assets empacotados.

### Stack de UI

- [shadcn/ui](https://ui.shadcn.com/) (estilo New York) — `src/components/ui/`
- [Radix UI](https://www.radix-ui.com/) (Dialog, Popover, ScrollArea)
- [cmdk](https://cmdk.paco.me/) — command palette
- [Tailwind CSS 4](https://tailwindcss.com/) com dark mode (CSS-first config via `@theme inline`)
- [Lucide React](https://lucide.dev/) — ícones

## Estrutura do projeto

```
src/
├── bun/
│   ├── index.ts          # Processo main (tray, janelas, FFI)
│   ├── rpc.ts            # Comunicação main ↔ renderer
│   └── native/
│       └── overlay.m     # Dylib Objective-C (overlay + hotkey + quit)
├── mainview/
│   ├── index.html        # Entry point do Vite
│   ├── App.tsx           # Componente raiz React
│   └── splash.html       # Splash screen
├── components/
│   └── ui/               # Componentes shadcn/ui
└── lib/
    └── utils.ts          # cn() — clsx + tailwind-merge
```

## Configurações principais

| Arquivo | Descrição |
|---------|-----------|
| `electrobun.config.ts` | Identidade do app (`com.ptolomeu.app`), regras de cópia no build |
| `vite.config.ts` | Root em `src/mainview/`, output para `dist/`, plugin `@tailwindcss/vite` |
| `components.json` | Config shadcn/ui com alias `@/` → `src/` |
| `src/mainview/index.css` | Tailwind CSS 4: `@theme inline` (cores, radius), dark mode via `@custom-variant` |

## Licença

Projeto privado.
