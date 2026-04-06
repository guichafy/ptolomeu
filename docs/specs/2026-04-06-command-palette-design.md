# Command Palette Universal — Design Spec

## Contexto

O Ptolomeu é um app macOS de menu bar para busca de repositórios GitHub. Hoje ele abre uma janela overlay (630x260) via Ctrl+Option+Space ou clique no tray, com um único tipo de busca (GitHub repos). A proposta é transformá-lo num **command palette universal** inspirado no Alfred, mantendo a essência de launcher rápido acessível por hotkey.

## Objetivo

Expandir o Ptolomeu de "busca de repos GitHub" para um **launcher multifuncional** com 4 providers de busca alternáveis via Tab: Apps do macOS, GitHub (existente), Calculator, e Web Search.

## Arquitetura: Provider Plugin System

### Interface `SearchProvider`

```typescript
// src/mainview/providers/types.ts

interface SearchResult {
  id: string
  title: string
  subtitle?: string
  icon?: ReactNode
  badge?: string
  onSelect: () => void
}

interface SearchProvider {
  id: string           // "apps", "github", "calc", "web"
  label: string        // "Apps", "GitHub", "Calc", "Web"
  icon: LucideIcon
  placeholder: string
  search: (query: string) => Promise<SearchResult[]>
}
```

### Providers

| Provider | Arquivo | Fonte de dados | Ação no Enter | Processo |
|----------|---------|----------------|---------------|----------|
| Apps | `apps-provider.ts` | `/Applications` + `~/Applications` via RPC | Abre o app (`open -a`) | Main → RPC → Renderer |
| GitHub | `github-provider.ts` | API GitHub (já existe) | Abre repo no browser | Renderer (fetch) |
| Calculator | `calculator-provider.ts` | Math parser local | Copia resultado | Renderer (sync) |
| Web Search | `web-search-provider.ts` | URL templates configuráveis | Abre URL no browser | Renderer (template) |

### Contexto React

```typescript
// src/mainview/providers/provider-context.tsx

ProviderContext {
  providers: SearchProvider[]
  activeProvider: SearchProvider
  activeIndex: number
  cycleNext(): void      // Tab
  cyclePrev(): void      // Shift+Tab
  setProvider(id): void
}
```

## Design da Interface

### Layout

A janela overlay mantém as dimensões atuais (630x260) e adiciona:

1. **ModeBar** (topo) — pills horizontais com ícone + label para cada provider. O ativo tem fundo destacado. À direita: "Tab ↹ trocar".
2. **SearchInput** — input com ícone de busca, placeholder dinâmico por provider.
3. **ResultsList** — adaptável por provider, usando ScrollArea existente.
4. **Footer** — atalhos contextuais (↑↓ navegar, ↵ ação, esc fechar).

### Renderização por Provider

- **Apps**: ícone genérico + nome do app + path
- **GitHub**: nome do repo + descrição + stars + linguagem (como hoje)
- **Calculator**: resultado grande centralizado em verde, sem lista
- **Web Search**: lista de search engines (Google, DuckDuckGo, Stack Overflow, YouTube)

### Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| Ctrl+Option+Space | Ativa/mostra a janela (já implementado) |
| Tab | Próximo provider (cicla) |
| Shift+Tab | Provider anterior |
| ↑ / ↓ | Navega entre resultados |
| Enter | Executa ação do resultado selecionado |
| Escape | Esconde janela + limpa input e resultados |

### Comportamento de Dismiss

- **Escape**: esconde janela, limpa query e resultados, reseta para provider padrão (Apps)
- **Clique fora**: mesmo comportamento que Escape (requer `windowDidResignKey:` no delegate nativo)
- **Próxima ativação**: começa limpo, input vazio, sem resultados

## Detalhes de Implementação

### Apps Provider

- **Main process** (`src/bun/index.ts`): lê `/Applications` e `~/Applications` com `fs.readdir`, filtra `.app`, cacheia a lista
- **RPC Electrobun**: Renderer solicita lista de apps via RPC. Para abrir: renderer envia path, main executa `Bun.spawn(["open", "-a", path])`
- **Busca**: fuzzy matching no nome do app (filter local no renderer)
- **Ícone**: emoji genérico 📱 inicialmente

### Calculator Provider

- Math parser seguro (sem `eval`). Usar `math-expression-evaluator` ou parser customizado
- Suporta: `+ - * / % ( )` e funções como `sqrt`, `pow`
- Resultado em tempo real conforme digita (sem precisar Enter)
- Enter copia resultado para clipboard

### Web Search Provider

- Array configurável de search engines:
  ```typescript
  { name: "Google", url: "https://google.com/search?q={query}", icon: "🔵" }
  { name: "DuckDuckGo", url: "https://duckduckgo.com/?q={query}", icon: "🦆" }
  { name: "Stack Overflow", url: "https://stackoverflow.com/search?q={query}", icon: "📚" }
  { name: "YouTube", url: "https://youtube.com/results?search_query={query}", icon: "▶️" }
  ```
- Enter abre a URL construída no browser padrão

### GitHub Provider (adaptar existente)

- Extrair lógica de busca de `App.tsx` para `github-provider.ts`
- Implementar interface `SearchProvider`
- Manter debounce de 300ms
- Reusar `LANGUAGE_COLORS` e `formatStars` de `search-results.tsx`

### Mudanças na Camada Nativa (overlay.m)

- **Escape para fechar**: adicionar handler de `keyDown:` no delegate que intercepta Escape e chama `orderOut:`
- **Clique fora (perda de foco)**: implementar `windowDidResignKey:` para esconder quando perde foco

### Mudanças em Componentes Existentes

| Componente | Mudança |
|------------|---------|
| `App.tsx` | Substituir lógica de busca GitHub por ProviderContext. Remover state de results/loading/error (movem para providers). |
| `HeaderSearch` | Substituir `SearchTypeCombobox` por `ModeBar` com pills de Tab |
| `SearchResults` | Generalizar para renderizar `SearchResult[]` em vez de `Repository[]` |
| `SearchTypeCombobox` | Remover (substituído por ModeBar) |
| `constants.tsx` | Remover `SEARCH_TYPES` (substituído por providers) |
| `types.ts` | Atualizar com novos tipos do provider system |

### Novos Arquivos

```
src/mainview/providers/
  types.ts                  # SearchProvider, SearchResult interfaces
  provider-context.tsx      # React Context + hook useProvider
  apps-provider.ts          # Busca de apps macOS
  github-provider.ts        # Adaptação do existente
  calculator-provider.ts    # Math parser
  web-search-provider.ts    # Templates de URL
src/mainview/components/
  mode-bar.tsx              # Pills de Tab switching
  result-item.tsx           # Item genérico de resultado
  calculator-result.tsx     # Resultado do calculator (layout especial)
```

## Verificação

1. **Hotkey global**: Ctrl+Option+Space abre a janela (já funciona)
2. **Tab switching**: Tab alterna entre Apps → GitHub → Calc → Web → Apps
3. **Apps**: Digitar nome de app mostra resultados, Enter abre o app
4. **GitHub**: Buscar repos funciona como hoje, Enter abre no browser
5. **Calculator**: Digitar expressão mostra resultado em tempo real, Enter copia
6. **Web Search**: Digitar query mostra engines, Enter abre no browser
7. **Escape**: Fecha janela, limpa tudo
8. **Clique fora**: Mesmo que Escape
9. **Keyboard navigation**: ↑↓ navega resultados, Enter seleciona
