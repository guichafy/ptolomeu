# Integração Claude Agent SDK + AI Elements

> Plano de execução derivado do briefing "Ptolomeu × Claude Agent SDK × AI
> Elements". Branch: `claude/ptolomeu-agent-sdk-7cjCe`.

## Contexto

O plugin Claude AI do Ptolomeu já usa `@anthropic-ai/claude-agent-sdk`
(via `unstable_v2_createSession` / `session.stream()`) com janela dedicada
(`src/chatview/`) e streaming loop em `src/bun/claude/streaming.ts`. Esta
integração é **incremental**: produz um contrato de eventos tipado
(`AgentEvent`), adiciona HITL real via `canUseTool`, troca a UI por
componentes AI Elements e liga MCP servers de runtime.

SDK alinhado: **0.2.118** (última publicada, `bun pm view` em 2026-04-23).
`canUseTool` + `parent_tool_use_id` já existem em `SDKSessionOptions` nessa
versão (decisão B validada).

## Decisões travadas

| # | Decisão | Valor |
|---|---|---|
| A | Persistência de `tool_decisions` | JSON em `~/.ptolomeu/sessions/<id>/tool-decisions.json` (consistente com o resto). Migrar para SQLite só se surgirem queries globais. |
| B | API do SDK para `canUseTool` | `unstable_v2_createSession` com `SDKSessionOptions.canUseTool`. Mantém a integração v2 atual. |
| C | Evento cru `claudeStreamChunk` | Mantido como canal legado durante migração. Novos componentes consomem `agentEvent`. Removido ao fim da Fase 5. |
| D | AI Elements compartilhados | Instalados em `src/components/ui/`. `src/chatview/index.css` passa a importar os mesmos tokens que `src/mainview/index.css`. |
| E | MCP runtime | Novo `~/.ptolomeu/mcp-servers.json` + `src/bun/claude/mcp-loader.ts`. Não misturar com `.mcp.json` do dev. |
| F | Permission modes | `ClaudeSettings.permissionMode` aceita os valores do SDK: `"default" \| "acceptEdits" \| "bypassPermissions" \| "plan" \| "dontAsk" \| "auto"`. |

## Arquitetura alvo

```
┌────────────────────────────────────────────────────────────────────┐
│  Main (Bun) — src/bun/claude/                                      │
│                                                                    │
│  RPC handlers ──▶ unstable_v2_createSession ──▶ session.stream()   │
│      │                  ▲                              │           │
│      │ canUseTool ──────┘                              ▼           │
│      │                                          event-mapper.ts    │
│      ▼                                                 │           │
│  permission-gate.ts (promise registry)                 │           │
│      │                                                 │           │
│      └───────── push via chatRpc.send.agentEvent ◀─────┘           │
└────────────────────────┬───────────────────────────────────────────┘
                         │ Electrobun RPC
┌────────────────────────┴───────────────────────────────────────────┐
│  Renderer (React) — src/chatview/                                  │
│                                                                    │
│  useAgentChat (reducer AgentEvent → AgentState)                    │
│      │                                                             │
│      ▼                                                             │
│  AI Elements: Conversation, Message, Reasoning, Tool,              │
│               Chain of Thought, Confirmation, Artifact, Sources    │
└────────────────────────────────────────────────────────────────────┘
```

## Contrato RPC (seção 4 do briefing)

Definido em `src/shared/agent-protocol.ts` (Fase 1.1). Novos eventos e
comandos coexistem com o schema `claude*` legado. Todos os valores do
`permissionMode` espelham os do SDK.

### Eventos adicionais (sobre os do briefing)

- `session-state-change` — mapeia `SDKSessionStateChangedMessage` (sinal
  autoritativo de idle/running/requires_action).
- `task-start` / `task-progress` / `task-update` / `task-end` — alinhados
  a `SDKTaskStartedMessage` e família em vez do genérico
  `subagent-task-*`. Transportam `parentToolCallId`.
- `prompt-suggestions` — payload do `SDKPromptSuggestionMessage`,
  alimenta `<Suggestion>`.

## Fase 1 — Event mapper tipado + permission gate stub

| # | Tarefa | Arquivos | Critério |
|---|---|---|---|
| 1.1 | `src/shared/agent-protocol.ts` com `AgentEvent`, `AgentCommand`, `SessionConfig`, `MessageContent`, `ToolDecision`, `PermissionMode`, `PermissionBehavior`. Sem `import "@anthropic-ai/claude-agent-sdk"` para não puxar SDK no bundle renderer. | novo | Compila em main e renderer |
| 1.2 | `event-mapper.ts` puro (extrai lógica do `streaming.ts`): `buildAgentEvents(msg: SDKMessage, ctx): AgentEvent[]` | `src/bun/claude/event-mapper.ts` | Função pura, sem side effects |
| 1.3 | Handle `content_block_start/delta/stop` para **text** (hoje só thinking está tratado) → emitir `text-start/delta/end` | `event-mapper.ts` | Delta incremental flui |
| 1.4 | Handle `tool_use` no stream: `tool-input-start`, `tool-input-delta` (de `input_json_delta`), `tool-call`, `tool-result`, `tool-error` | `event-mapper.ts` | `is_error` classifica erro |
| 1.5 | Tracking de `parentToolCallId` via `parent_tool_use_id` do SDK (já existe em Assistant/User/ToolProgress messages) | `event-mapper.ts` | Subagents carregam parent ref |
| 1.6 | `permission-gate.ts` — classe `PermissionGate { request(toolCallId, toolName, args): Promise<Decision> }`, registry UUID→resolver, timeout config. **Nenhum wire no SDK ainda** — só shell + testes. | `src/bun/claude/permission-gate.ts` | Allow/deny/timeout unit-tested |
| 1.7 | Testes `event-mapper.test.ts` cobrindo todos `content_block_*`, `tool_progress`, `result`, `SDKTaskStarted/Progress/Updated/Notification` | `src/bun/claude/__tests__/` | `bun run test` verde |
| 1.8 | Testes `permission-gate.test.ts` (allow/deny/timeout/always-allow) | `src/bun/claude/__tests__/` | Verde |

**Aceitação**: `bun run test` verde. Zero impacto visível ao usuário.

## Fase 2 — Contrato RPC: `agentEvent` + `useAgentChat`

| # | Tarefa | Arquivos | Critério |
|---|---|---|---|
| 2.1 | Adicionar em `PtolomeuRPCSchema.webview.messages`: `agentEvent: { sessionId: string; event: AgentEvent }` | `src/bun/rpc.ts`, `src/chatview/rpc.ts` | Tipos vêm de `@/shared/agent-protocol` |
| 2.2 | Em `streaming.ts`: após `sendChunk`, também chamar `buildAgentEvents(msg)` e `chatRpc.send.agentEvent()` | `streaming.ts` | Dual-channel |
| 2.3 | `src/chatview/hooks/use-agent-chat.ts`: reducer `AgentEvent → AgentState` | novo | Fixtures de eventos cobrem casos |
| 2.4 | RPC requests novos: `agentStartSession`, `agentSendMessage`, `agentCancel`, `agentResume` — wrap thin dos `claude*` existentes | `src/bun/rpc.ts`, `session-manager.ts` | Handlers delegam |
| 2.5 | `event-reducer.test.ts` | `src/chatview/hooks/__tests__/` | Verde |

**Aceitação**: `useAgentChat` monta `AgentState` correto a partir dos
eventos; UI legacy ainda ativa.

## Fase 3 — AI Elements core (paridade)

| # | Tarefa | Arquivos | Critério |
|---|---|---|---|
| 3.1 | Ajustar `components.json` e `src/chatview/index.css` para permitir `src/components/ui/` compartilhado entre os dois bundles Vite | `components.json`, `src/chatview/index.css` | `bunx shadcn add button` gera em `src/components/ui/` e funciona nos dois roots |
| 3.2 | Instalar AI Elements core: `conversation`, `message`, `prompt-input`, `suggestion`, `reasoning` | `src/components/ui/*` | Compila |
| 3.3 | Estender `ClaudeSettings` com `useAiElements: boolean` (default `false`) | `src/chatview/rpc.ts`, `src/bun/settings.ts`, `src/mainview/settings/claude-section.tsx` | Toggle em Settings |
| 3.4 | `chat-v2/conversation-pane.tsx` usando AI Elements + `useAgentChat` | novo | Render paridade com `conversation.tsx` |
| 3.5 | `chat-v2/prompt-composer.tsx` com `<PromptInput>` + `<Suggestion>` | novo | Paridade com `chat-input.tsx` |
| 3.6 | `App.tsx`: branch `useAiElements ? <V2 /> : <Legacy />` | `src/chatview/App.tsx` | Toggle sem reload |

## Fase 4 — Tools locais + HITL real

| # | Tarefa | Arquivos | Critério |
|---|---|---|---|
| 4.1 | ✅ Validado na Fase 0: `SDKSessionOptions.canUseTool` está disponível em 0.2.118. Basta passar na criação da sessão. | — | Já confirmado |
| 4.2 | Wire `PermissionGate` no `session-manager.ts`: callback `canUseTool` consulta gate | `session-manager.ts`, `permission-gate.ts` | Sessão bloqueia até decisão |
| 4.3 | Emitir `tool-permission-request` via `agentEvent` quando `canUseTool` é chamado; resolver via `approve-tool`/`reject-tool` | `streaming.ts`, `rpc.ts` | Roundtrip completo |
| 4.4 | AI Element `confirmation` → `chat-v2/confirmation-queue.tsx` com fila FIFO | `src/components/ui/`, novo | Labels pt-BR |
| 4.5 | Whitelist por-sessão: `always-allow-this-session` adiciona tool (+ args hash) ao set | `permission-gate.ts` | Próxima invocação skippa |
| 4.6 | Regras "sempre perguntar" não-bypassáveis: regex Bash (`rm -rf`, `sudo`, `curl \| sh`, redirect destrutivo), paths fora de cwd para Write/Edit, tools MCP externo | `permission-gate.ts:classifyRisk()` | Unit tests por regra |
| 4.7 | AI Elements `tool` + `chain-of-thought` → `chat-v2/tool-timeline.tsx` | novo | Estados running/done/error; subagents aninhados |
| 4.8 | Auditoria: `~/.ptolomeu/sessions/<id>/tool-decisions.json` append-only com `{permissionId, toolName, argsHash, decision, decidedBy, at}` | `src/bun/claude/persistence/tool-decisions.ts` | Cobertura em testes |
| 4.9 | Tests: `permission-gate.test.ts` estende com classifyRisk + whitelist + auditoria | `__tests__/` | Verde |

## Fase 5 — Rich content + MCP + Plan

| # | Tarefa | Status | Notas |
|---|---|---|---|
| 5.1 | `mcp-loader.ts` + `~/.ptolomeu/mcp-servers.json` + session-manager integration | ✅ | `McpLoader` + 12 testes. Injetado nos 3 sites (`unstable_v2_createSession`, ambos `unstable_v2_resumeSession`). |
| 5.2 | Settings UI "MCP Servers" | ✅ | `McpServersSection` em `src/mainview/settings/mcp-servers.tsx`. RPCs `agentListMcpServers` / `agentSaveMcpServers`. |
| 5.3 | AI Elements: `artifact`, `code-block`, `sources`, `inline-citation`, `attachments` | ✅ | Implementados localmente em `src/components/ai-elements/`, API-compat com o registry oficial. |
| 5.4 | Heurística de artifact em `tool-result` | ✅ | Output ≥20 linhas ou ≥1200 chars vira `<Artifact>` + `<CodeBlock>`; linguagem inferida do `file_path` arg. |
| 5.5 | `<Sources>` / `<InlineCitation>` para `WebSearch`/`WebFetch` | ✅ | Resultado com `{url, title?}` (ou `{results:[...]}`) vira chips clicáveis. |
| 5.6 | Attachments no composer | ⚠️ Parcial | Picker + preview prontos (png/jpeg/webp, ≤5MB). **Envio multimodal deferido**: requer extender `claudeSendMessage` para aceitar `MessagePart[]` e mapear para `SDKUserMessage.message.content` com `image` blocks. Por ora, o composer notifica o usuário que anexos ficam pendentes. |
| 5.7 | Plan mode | ✅ Indicador | Banner `PlanModeBanner` acima da Conversation quando `permissionMode === "plan"`. Render estruturado da saída de `ExitPlanMode` ainda é oportunidade de polish futura. |
| 5.8 | Flip `useAiElements` default → `true` + remover legado | ⏸ Deferido | Precisa verificação manual UI (criar sessão, enviar mensagens, aprovar tools, rodar com um MCP server real) em build dev ou canary antes de flipar. Remoção do `claudeStreamChunk` legado também precisa dessa verificação. |
| 5.9 | E2E Appium smoke | ⏸ Deferido | Requer macOS + Xcode + `appium-mac2-driver` instalado. Infraestrutura CI existente (`bun run test:e2e`) pode acomodar; deixa-se para sessão de dev local. |

## Riscos

| Risco | Mitigação |
|---|---|
| `canUseTool` pode introduzir deadlock se renderer não responde | Timeout padrão 5 min + reject automático; log de auditoria |
| AI Elements falham no bundle chatview (Tailwind tokens divergentes) | Teste cedo na 3.1; fallback copiar componentes manualmente |
| Persistência JSON concorrente | Só a streaming loop escreve; serializar via fila se necessário |
| Feature flag troca no meio da sessão | Flag é read-once no mount; troca requer reopen (documentar) |

## Referências

- Agent SDK TypeScript: <https://code.claude.com/docs/en/agent-sdk/typescript>
- AI Elements: <https://elements.ai-sdk.dev/>
- `CLAUDE.md` (raiz do repo) — convenções do projeto.
