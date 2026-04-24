# Ptolomeu

Suas ferramentas do dia, orbitando você. Um command center para a barra de menus do macOS, feito para engenheiros de software.

Ptolomeu é um app de menu bar para macOS construído com [Electrobun](https://electrobun.dev/) (runtime Bun) e React. Ele oferece uma command palette global (`⌘+Shift+Space`) extensível por um sistema de plugins — cada plugin é um provider que adiciona uma nova capacidade. Vem com 5 plugins integrados.

## Início rápido

```bash
# Pré-requisitos: macOS (arm64), Bun, Xcode Command Line Tools
bun install
bun run dev:hmr
```

## Plugins integrados

| Plugin | Descrição |
|--------|-----------|
| **GitHub** | Buscar repositórios, código, issues e usuários. Filtros customizados, builder de qualifiers, repos de times. |
| **Apps** | Abrir aplicativos do macOS direto da palette. |
| **Calculadora** | Avaliar expressões matemáticas inline. |
| **Busca Web** | Atalho para Google, DuckDuckGo, Stack Overflow, YouTube. |
| **Claude AI** | Conversar com Claude — respostas em streaming, persistência de sessões, janela dedicada. |

## Sistema de plugins

Todo plugin implementa a interface `SearchProvider`:

```typescript
interface SearchProvider {
  id: string;
  label: string;
  icon: IconComponent;
  placeholder: string;
  search(query: string, signal?: AbortSignal, context?: unknown): Promise<SearchResult[]>;
  useSearchContext?: () => unknown;   // contexto reativo opcional
  configComponent?: ComponentType;    // UI de configuração opcional
}
```

Resultados retornados por `search()`:

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

### Criando um plugin

```typescript
// src/mainview/providers/npm-provider.ts
import { Package } from "lucide-react";
import type { SearchProvider } from "./types";

export const npmProvider: SearchProvider = {
  id: "npm",
  label: "npm",
  icon: Package,
  placeholder: "Buscar pacotes npm...",

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

Registre em `src/mainview/providers/registry.ts`:

```typescript
import { npmProvider } from "./npm-provider";

export const PLUGIN_REGISTRY: Record<string, SearchProvider> = {
  // ... plugins existentes
  npm: npmProvider,
};

export const PLUGIN_META: PluginMeta[] = [
  // ... entradas existentes
  { id: "npm", label: "npm", description: "Buscar pacotes npm", icon: Package },
];
```

### Ideias de plugins

Procurando inspiração? Alguns plugins que a comunidade pode construir:

- **Jira / Linear** — issues, boards, status de sprint
- **Slack** — canais, mensagens, pessoas
- **AWS Console** — serviços, recursos, CloudWatch
- **Docker** — containers, imagens, compose stacks
- **npm / PyPI** — busca em registry de pacotes
- **Homebrew** — formulae, casks
- **Kubernetes** — pods, deployments, services
- **CI/CD** — status de runs do GitHub Actions, CircleCI
- **Bookmarks** — busca em favoritos do navegador
- **Notas** — Apple Notes, vault do Obsidian

Não viu sua ferramenta? Construa um plugin e abra um PR.

## Arquitetura

| Processo / view | Caminho | Papel |
|-----------------|---------|-------|
| **Main (Bun)** | `src/bun/` | System tray, janelas, FFI nativo, atalho global, gerente de sessões Claude, fetch com proxy. |
| **Renderer da palette** | `src/mainview/` | App React da command palette em uma BrowserWindow oculta, alternada por ⌘+Shift+Space. |
| **Renderer do chat** | `src/chatview/` | App React separado para a janela de chat do Claude, criada sob demanda. |

```
                       ┌───────────────────┐
                  RPC  │  Palette (React)  │
              ┌──────► │  cmdk, plugins    │
┌──────────────┐       └───────────────────┘
│  Main (Bun)   │
│  tray, FFI,   │       ┌───────────────────┐
│  Claude SDK   │  RPC  │  Chat (React)     │
│  proxy, RPC   ├─────► │  AI Elements      │
└──────────────┘       └───────────────────┘
```

Cada janela tem sua própria instância RPC do Electrobun (transporte por janela), mas compartilha o mesmo conjunto de handlers. Veja [CLAUDE.md](CLAUDE.md) para a documentação detalhada de arquitetura.

## Desenvolvimento

**Dev com HMR (recomendado)**

```bash
bun run dev:hmr         # Vite (mainview + chatview) + Electrobun simultaneamente
```

**Build**

```bash
bun run build:native       # Compila Objective-C → liboverlay.dylib
bun run build:vite         # Build do mainview (dist/) e chatview (dist-chat/)
bun run build:dev-bundle   # Bundle .app de dev (necessário para E2E)
bun run build:canary       # Build de produção (canal canary)
bun run build:release      # Build de produção (canal stable)
```

**Testes**

```bash
bun run test              # Vitest — projetos node + jsdom
bun run test:watch        # Vitest em modo watch
bun run test:coverage     # Relatório de cobertura (HTML em ./coverage/)
bun run test:e2e          # E2E (Appium Mac2; precisa do dev bundle)
bun run screenshots       # Build dev bundle + E2E + regenera docs/screenshots/
```

A suíte E2E controla o app real do macOS via Appium Mac2 e grava PNGs em
`docs/screenshots/`. Tanto o job `e2e` da CI quanto o script `screenshots`
produzem o dev bundle via `electrobun build --env=dev` antes de rodar.

O Vitest roda dois projetos lado a lado:

- `node` — módulos de backend (`src/bun/**`, `src/chatview/lib/**`, `src/chatview/hooks/**`)
- `jsdom` — UI React (`src/mainview/**`, `src/chatview/components/**`, `src/lib/**`)

**Git hooks (lefthook)**

O lefthook é instalado automaticamente via `bun install` (executa `lefthook install` pelo script `prepare`). Cada commit roda Biome nos arquivos staged e Vitest nos testes afetados pela mudança. Para pular temporariamente: `LEFTHOOK=0 git commit …`.

**Lint**

```bash
bun run lint            # Biome check
bun run lint:fix        # Biome auto-fix
```

## Contribuindo

### Reportar bugs

Abra uma issue com passos para reproduzir. Inclua sua versão do macOS, versão do Bun e os passos.

### Sugerir um plugin

Abra uma issue com a tag `plugin-idea`. Descreva a ferramenta ou serviço e quais buscas ele permitiria.

### Construir um plugin

1. Implemente a interface `SearchProvider` (veja [Sistema de plugins](#sistema-de-plugins) acima)
2. Adicione seu provider ao `PLUGIN_REGISTRY` em `src/mainview/providers/registry.ts`
3. Adicione uma entrada `PluginMeta` com ícone, label e descrição
4. Abra um PR

### Padrões de código

- **Linter/formatter:** Biome — rode `bun run lint:fix` antes de commitar
- **Commits:** conventional commits (`feat(scope):`, `fix(scope):`)
- **Labels da UI:** Português (pt-BR) — "Abrir", "Sair", "Buscar"
- **Gerenciador de pacotes:** apenas Bun (`bun install`, `bun run`)
- **Path alias:** `@/*` mapeia para `src/*`

### Processo de PR

1. Faça fork do repo
2. Crie uma branch (`feat/meu-plugin`)
3. Rode `bun run lint:fix && bun run test`
4. Abra um PR descrevendo as mudanças

## Licença

Apache 2.0 — veja [LICENSE](LICENSE) para detalhes.

---

> Nomeado em homenagem a Cláudio Ptolomeu, que colocou a Terra no centro do cosmos. Ptolomeu coloca você no centro do seu workflow.

[Read in English](README.md)
