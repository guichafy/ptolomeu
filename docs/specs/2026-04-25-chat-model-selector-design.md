# Chat Model Selector — Design

**Data:** 2026-04-25
**Escopo:** Plugin Claude (chat) — controle do modelo durante a conversa.

## Objetivo

Permitir ao usuário escolher o modelo do Claude **dentro da própria conversa**, com dois escopos:

- **B — Modelo da sessão:** afeta a sessão atual (e só ela). Persiste em `SessionMeta.model`.
- **C — Override de turno:** afeta apenas a próxima mensagem; depois volta ao modelo da sessão.

A lista de modelos é **dinâmica**, fornecida pela própria SDK (`Query.supportedModels()`/`initializationResult().models`), funcionando para `authMode: anthropic` e `authMode: bedrock` sem qualquer hardcode.

## Restrição arquitetural

Não introduzir novas dependências em APIs `unstable_v2_*` da SDK. As capacidades necessárias (`setModel`, `supportedModels`, `initializationResult`) existem **apenas** no `Query` retornado pela função estável `query(params)`. Portanto, este card inclui **migrar `src/bun/claude/session-manager.ts` da API `unstable_v2_*` para a API estável `query()`**, com streaming input mode.

## Componentes e mudanças

### 1. Cache e descoberta de modelos

Novo módulo: `src/bun/claude/models-cache.ts`.

- Mantém `Map<ClaudeAuthMode, ModelInfo[]>` em memória.
- `getModels(authMode)`:
  1. Cache hit → retorna.
  2. Se há `Query` ativa (sessão real), reaproveita seu `initializationResult()` (custo zero).
  3. Caso contrário, **discovery query**: cria uma `query()` temporária com `prompt` = `AsyncIterable` que nunca produz, chama `initializationResult()`, lê `result.models`, dispara `query.close()`. Sem mensagem enviada, sem custo de inferência.
- `invalidate(authMode?)`: limpa entrada (ou todas).
- Invalidação automática disparada por: `claudeSetBedrock`, `claudeLoginSSO`, `claudeLogoutSSO`, e por `saveSettings` quando `claude.authMode` muda.
- Se a discovery query falhar (offline, auth ausente), retorna erro tipado para o renderer; UI mostra estado vazio com CTA para configurar autenticação. **Sem fallback hardcoded** — coerente com o requisito.

### 2. Migração `session-manager.ts` para `query()` estável

**Padrão atual (a remover):**

```ts
const sdkSession = unstable_v2_createSession(opts);
await sdkSession.send(prompt);
for await (const msg of sdkSession.stream()) { ... }
```

**Padrão novo:**

```ts
const inbox = createMessageInbox();          // queue + AsyncIterable<SDKUserMessage>
inbox.push(buildUserMessage(prompt));
const q = query({ prompt: inbox.iterable, options });
for await (const msg of q) { ... }            // Query é AsyncGenerator<SDKMessage>
```

`createMessageInbox()` (novo helper em `src/bun/claude/message-inbox.ts`) implementa um `AsyncIterable<SDKUserMessage>` empurrável: backed por `Promise`/resolver pair (estilo `Subject`) — `push(msg)` resolve o `next()` pendente; `close()` finaliza o iterator. Pequeno utilitário, com testes unitários cobrindo: enfileiramento antes do consumo, ordem preservada, fechamento limpo, comportamento sob `cancel`/abort.

**Resume de sessão:** stable `query()` aceita `Options.resume = sdkSessionId`. `resumeSession(sessionId)` re-abre a sessão SDK lendo `meta.sdkSessionId` e passa em `options.resume`. **Importante:** o `model` agora vem de `meta.model` (não mais de `settings.claude.model`) — ver Seção 3.B.

**Deferred-start preservado:** o problema atual (chat window precisa estar montado antes do streaming começar, senão `chatRpc.send.*` cai no vazio) é mantido. `createSession` cria o inbox, persiste o user message + `SessionMeta`, mas **não** instancia a `query()`. A primeira chamada de `resumeSession` vinda do chat window (mesma porta de entrada que hoje) instancia a `query()` e inicia o streaming loop.

**`send()` subsequente:** `sessionManager.send(sessionId, prompt)` simplesmente faz `inbox.push(buildUserMessage(prompt))`. A `Query` em loop processa naturalmente.

**`cancel()`:** chama `query.interrupt()`. Em erros não-recuperáveis, `query.close()`.

**`stream()` interno** vira o próprio `for await` sobre `Query`. O `event-mapper.ts` continua transformando `SDKMessage` em `AgentEvent` sem mudanças (a forma das mensagens é a mesma).

**`initializationResult()`** chamado uma vez logo após `query()` ser construída → preenche `models-cache` com os modelos disponíveis (oportunístico, sem custo).

### 3. Modelo na sessão e no turno

#### B — Modelo da sessão

- `SessionMeta.model` (`src/bun/claude/session-manager.ts:548`) já existe. Continua sendo a fonte de verdade da sessão.
- **Correção:** `resumeSession` (linhas atuais ~630, ~721) hoje lê `settings.claude.model` para resumir. Vai ler `meta.model`. Settings global vira **default apenas para novas sessões**.
- Novo handler RPC `claudeSetSessionModel({ sessionId, model })`:
  - Se a sessão tem `Query` ativa (deferred-start já disparou) e está `idle`: `await query.setModel(model)`.
  - Se está streaming/tool-running: rejeita com erro tipado (UI deve manter o seletor disabled, mas defesa em profundidade).
  - Se ainda não há `Query` ativa (deferred): apenas atualiza `meta.model` em disco; o próximo `resumeSession` pegará.
  - Persiste `meta.model = model` via `writeIndex`.
  - Emite `agentEvent: { type: "session-model-changed", sessionId, model }` no canal do chatview.

#### C — Override de turno

- Novo parâmetro opcional em `claudeSendMessage`: `modelOverride?: string`.
- No bun:
  ```ts
  const restore = meta.model;
  try {
    if (modelOverride && modelOverride !== meta.model) {
      await query.setModel(modelOverride);
    }
    inbox.push(buildUserMessage(prompt));
    // streaming loop processa naturalmente; no `finish` do turno:
  } finally {
    if (modelOverride && modelOverride !== restore) {
      await query.setModel(restore).catch((err) => log warn);
    }
  }
  ```
- O restore acontece quando o streaming loop detecta `SDKResultMessage` (turn finished) ou no `cancel`. Se o restore falhar (raro), log + agentEvent: error.
- Override é **single-turn**. Se o usuário envia outra mensagem sem mexer no seletor, o seletor de override já voltou a `null` (UI side, ver Seção 4).

### 4. UI

#### Componente compartilhado

- Instalar `model-selector` do registry AI Elements via shadcn MCP (`mcp__shadcn` → `ai-elements/model-selector`).
- Wrapper local em `src/components/claude/model-picker.tsx` para esconder o registro e expor a API que serve aos três call-sites: header do chat, toolbar do prompt, settings.
- Props mínimas: `value: string | null`, `models: ModelInfo[]`, `onChange(value)`, `disabled`, `placeholder`, `variant: "session" | "turn-override" | "default"` (controla layout compacto vs. extenso).

#### Header do chat — `src/chatview/components/chat-header.tsx`

- Remove badge `"Sonnet 4.6"` hardcoded (linha 37).
- Substitui por `<ModelPicker variant="session" value={meta.model} onChange={handleSessionModelChange} models={models} disabled={state.sessionState !== "idle"} />`.
- `handleSessionModelChange` chama `rpc.request.claudeSetSessionModel({ sessionId, model })`.
- Recebe atualização via `agentEvent: session-model-changed` (caso a mudança venha de outra superfície).
- Carrega `models` na montagem via `rpc.request.claudeListSupportedModels()`.

#### Toolbar do prompt — `src/chatview/components/v2/chat-pane.tsx`

- Adiciona `<ModelPicker variant="turn-override" value={overrideModel} onChange={setOverrideModel} models={models} sessionDefault={state.sessionModel} disabled={state.sessionState !== "idle"} />` à esquerda do input file (antes de `<Button … aria-label="Anexar imagem">`).
- Default `overrideModel = null`. Quando definido e diferente do `sessionDefault`, mostra label completo + ✕ pra limpar.
- `handleSubmit` passa `modelOverride: overrideModel ?? undefined` para `sendMessage`.
- Após `await sendMessage(...)`, `setOverrideModel(null)` (volta ao default da sessão).
- Cada mensagem do usuário renderizada exibe um badge pequeno `"Modelo: <displayName>"` apenas quando o turno usou override. Origem do dado: novo campo `modelUsed` em `MessageStored` (ver Seção 6).

#### Settings — `src/mainview/settings/claude-section.tsx`

- Substitui o `<Select>` hardcoded (linhas 356-367) por `<ModelPicker variant="default" />` alimentado por `rpc.request.claudeListSupportedModels()`.
- Refresh on authMode change: settings já chama `saveSettings`; mainview escuta `agentEvent: models-cache-invalidated` (também emitido no canal mainview, não só chatview) e refaz o fetch.

### 5. RPC contract

Edições em `src/bun/rpc.ts` (`PtolomeuRPCSchema`):

```ts
// Novos
claudeListSupportedModels: {
  params: void;
  result: { models: ModelInfo[]; authMode: ClaudeAuthMode };
};
claudeSetSessionModel: {
  params: { sessionId: string; model: string };
  result: void;
};

// Modificado
claudeSendMessage: {
  params: { sessionId: string; prompt: string; modelOverride?: string };
  result: void;
};
```

Eventos novos em `agentEvent` (`src/bun/claude/streaming.ts`):

```ts
| { type: "session-model-changed"; sessionId: string; model: string }
| { type: "models-cache-invalidated"; authMode: ClaudeAuthMode }
```

`models-cache-invalidated` é publicado em **ambos** os canais (mainview + chatview) para que settings UI e chat header reajam.

### 6. Persistência

- `SessionMeta.model` continua existindo. Comportamento de leitura corrigido (ver Seção 3.B).
- **Auditoria de override por turno:** `MessageStored` (em `src/bun/claude/persistence/`) ganha campo opcional `modelUsed?: string` para mensagens do role `user` quando houve override. Permite renderização do badge "Modelo: X" e mantém histórico fiel.
- Se `meta.model` referenciar um modelo ausente do `models-cache` no momento do resume, downgrade silencioso para o primeiro modelo disponível, atualiza `meta.model` no disco, e emite `session-model-changed` para o renderer.

### 7. Edge cases

- **Discovery sem auth:** `query()` falha; cache fica vazio; UI mostra "Configurar autenticação" e desabilita seletores. Próxima tentativa só após login.
- **`setModel` durante streaming:** UI já desabilita; handler RPC rejeita com erro tipado como defesa em profundidade.
- **Override + cancel:** restore feito em `finally` no `claudeSendMessage` — sempre roda.
- **Override de modelo que sumiu da lista:** validação contra `models-cache` antes do `setModel`. Se inválido, ignora override (warning no log) e envia com modelo da sessão. Não bloqueia.
- **Auth mode mudou no meio da sessão:** sessão atual continua no modelo antigo (seu `Query` ainda está ativo). Cache é invalidado para próxima abertura. Se usuário abrir o seletor da sessão atual, lista virá vazia até nova discovery — UI mostra estado de loading e dispara fetch.
- **Concorrência:** discovery query e session real podem coexistir; cada `query()` é independente (subprocess por instância). `models-cache` é a única estrutura compartilhada — guard simples (single-flight para discovery em andamento) evita rajadas.

### 8. Testes

**Unit (Bun, projeto `node` do Vitest):**

- `models-cache.test.ts` (novo): cache hit/miss; invalidação por authMode; single-flight (duas chamadas concorrentes ⇒ uma única discovery); falha de discovery não polui cache.
- `message-inbox.test.ts` (novo): push antes do consumo; ordem; fechamento; cancel via abort.
- `session-manager.test.ts` (ampliação ou novo arquivo focado): `resumeSession` lê de `meta.model` e ignora `settings.claude.model`; downgrade silencioso quando `meta.model` ausente do cache; restore de modelo no `finally` do override.
- `session-options.test.ts`: já existe — adicionar caso de override não modificar o `model` persistido na sessão.

**Component (jsdom):**

- `chat-header.test.tsx` (novo): seletor disabled em `streaming` e `tool_running`; chama `claudeSetSessionModel` com payload correto; reage a `session-model-changed`.
- `chat-pane.test.tsx` (ampliação): override é passado pra `sendMessage`; limpa após `await sendMessage`; badge "Modelo: X" só aparece quando houve override.
- `model-picker.test.tsx` (novo): renderiza ModelInfo[]; `disabled`; estado de "carregando" enquanto cache vazio.

**Buffer:**

- `agent-event-buffer.test.ts`: caso para `session-model-changed` enfileirado antes do subscriber; caso para `models-cache-invalidated`.

**E2E (Appium):**

- `tests/e2e/chat-model-selector.test.ts` (novo): abre chat, snapshot do header com badge dinâmico, abre popover do seletor, snapshot da lista de modelos.

## Não-objetivos

- Remover hardcode de modelo no formato Bedrock-vs-Anthropic em outros lugares (já é responsabilidade da SDK).
- Editor de presets / favoritos de modelo. Cada sessão simplesmente persiste seu modelo.
- Multimodal (imagens) — fora do escopo; já existe TODO no chat-pane.

## Riscos

- **Migração para `query()` é ampla.** Maior risco de regressão. Mitigação: testes unitários do `message-inbox`, smoke E2E após migração antes de mexer nos seletores.
- **`Query.setModel` durante streaming** não testado em produção neste projeto. Mitigação: UI desabilita; handler também rejeita; documentado como guarda dupla.
- **Discovery query** pode despertar prompts de auth na primeira execução pós-login. Mitigação: chamada lazy, só quando UI realmente pede.

## Fluxo de implementação (alto nível, para o plano)

1. Helper `message-inbox.ts` + testes.
2. Migração `session-manager.ts` para `query()` (mantendo a interface pública atual: `create`/`resume`/`send`/`cancel`/`stream`).
3. Smoke teste: chat funciona como hoje, sem mudanças visuais.
4. `models-cache.ts` + RPC `claudeListSupportedModels` + invalidação automática.
5. `claudeSetSessionModel` + correção do `resumeSession` para ler `meta.model`.
6. Settings UI passa a usar `ModelPicker` com cache.
7. `<ModelPicker>` wrapper + instalação do AI Elements model-selector via shadcn MCP.
8. Seletor no `ChatHeader` + reação a `session-model-changed`.
9. Override por turno em `chat-pane.tsx` + `modelOverride` em `claudeSendMessage` + restore no `finally`.
10. Badge "Modelo: X" nas mensagens do user com override + persistência `MessageStored.modelUsed`.
11. Testes unitários + componente + E2E screenshot.
