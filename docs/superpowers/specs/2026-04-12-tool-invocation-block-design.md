# Design: Bloco Unificado de Tool Use + Tool Result

## Contexto

No chat do agente Claude, `tool_use` e `tool_result` são renderizados como blocos separados e desconectados, apesar do campo `toolUseId` já conectar um resultado ao seu uso correspondente. Isso dificulta a leitura — o usuário precisa correlacionar mentalmente qual resultado pertence a qual ferramenta.

Este design unifica os dois em um componente `ToolInvocationBlock` que mostra a execução da ferramenta e seu resultado juntos, tanto durante streaming quanto após finalizado.

## Decisões de design

- **Abordagem C (Header + Preview Inline)** escolhida pelo usuário entre 3 opções visuais
- **Pareamento na camada de renderização** (não nos dados) — não altera tipos, backend nem persistência
- **Compatibilidade total** com mensagens já persistidas

## Componente: `ToolInvocationBlock`

### Props

```typescript
interface ToolInvocationBlockProps {
  name: string;
  input: unknown;
  status: "running" | "done" | "error";
  elapsedSeconds?: number;
  result?: {
    content: string;
    isError?: boolean;
  };
}
```

### Estados visuais

| Estado | Header | Preview | Expandido |
|--------|--------|---------|-----------|
| **Running** | Spinner + ToolIcon + nome + input inline + timer (pulse) | "Executando..." (pulse) | — |
| **Done** | Chevron + Check verde + ToolIcon + nome + input inline + tempo | Output truncado (~3 linhas) com fade gradient | Input completo + Output completo |
| **Error** | Chevron + X vermelho + ToolIcon + nome + input inline | Output de erro visível sem truncar | Input completo + Output completo |

### Layout

```
┌─────────────────────────────────────────────────┐
│ ▶ ✓ 🔧 Bash  ls -la src/                 1.2s  │  ← header (clicável)
├─────────────────────────────────────────────────┤
│    drwxr-xr-x  bun/  chatview/                  │  ← preview truncado
│    -rw-r--r--  components/ lib/                  │
│    ░░░░░░░░░░░ fade gradient ░░░░░░░░░░░░░░░░░  │
└─────────────────────────────────────────────────┘
```

Expandido:

```
┌─────────────────────────────────────────────────┐
│ ▼ ✓ 🔧 Bash  ls -la src/                 1.2s  │
├─────────────────────────────────────────────────┤
│  INPUT                                          │
│  ┌───────────────────────────────────────────┐  │
│  │ { "command": "ls -la src/" }              │  │
│  └───────────────────────────────────────────┘  │
│  OUTPUT                                         │
│  ┌───────────────────────────────────────────┐  │
│  │ drwxr-xr-x  5 user  staff  160 bun/      │  │
│  │ drwxr-xr-x  3 user  staff   96 chatview/ │  │
│  │ ...                                       │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Detalhes de implementação

- **Header**: input preview extraído de `input` — para Bash mostra `command`, para Read/Write mostra `file_path`, fallback para JSON truncado
- **Preview**: max-height ~38px com `overflow: hidden` e gradient fade via pseudo-element ou div absoluto
- **Preview de erro**: sem truncar (erros são sempre importantes), borda e texto em `destructive`
- **Running**: sem chevron, preview mostra "Executando..." com `animate-pulse`
- **Expandido**: seções "Input" e "Output" com labels uppercase em `text-muted-foreground`, conteúdo em `<pre>` monospace
- **Ícones**: reutiliza mapa `TOOL_ICONS` existente (Read→FileText, Bash→Terminal, etc.)

## Função utilitária: `pairToolBlocks`

```typescript
function pairToolBlocks(blocks: ChatBlock[]): Map<string, ToolResultBlock> {
  const resultMap = new Map<string, ToolResultBlock>();
  for (const block of blocks) {
    if (block.type === "tool_result") {
      resultMap.set(block.toolUseId, block);
    }
  }
  return resultMap;
}
```

Usada em `message.tsx` e `conversation.tsx`. Na iteração de blocks:
- `tool_use` → renderiza `ToolInvocationBlock` passando o `result` pareado do Map
- `tool_result` → pula (já consumido pelo `tool_use` correspondente)
- Outros tipos → renderiza normalmente

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/chatview/components/blocks/tool-invocation-block.tsx` | **Criar** — componente unificado |
| `src/chatview/components/message.tsx` | **Modificar** — usar pairToolBlocks + ToolInvocationBlock |
| `src/chatview/components/conversation.tsx` | **Modificar** — mesma lógica para streamingBlocks |
| `src/chatview/components/blocks/tool-use-block.tsx` | **Remover** — substituído |
| `src/chatview/components/blocks/tool-result-block.tsx` | **Remover** — substituído |

## O que NÃO muda

- Tipos (`ChatBlock`, `PersistBlock`, `StoredBlock`, `ToolUseBlock`, `ToolResultBlock`)
- Backend (`streaming.ts`, `session-manager.ts`)
- Stream parser (`stream-parser.ts`)
- Persistência (formato de armazenamento em disco)
- Hook `use-chat-session.ts`

## Verificação

1. `bun run lint` — sem erros nos arquivos modificados
2. `bun run test` — testes existentes passam
3. `bun run dev:hmr` — iniciar app em modo dev
4. Enviar mensagem que use ferramentas (ex: "liste os arquivos do diretório atual")
5. **Durante streaming**: tool_use em estado "running" com spinner e "Executando..."
6. **Após streaming**: bloco unificado com preview do resultado truncado
7. Clicar no bloco: expande mostrando input + output completos
8. Erro de ferramenta: borda vermelha, output de erro visível sem truncar
9. Recarregar sessão: blocos persistidos renderizam corretamente com resultado pareado
