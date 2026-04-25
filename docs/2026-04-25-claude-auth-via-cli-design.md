# Claude Auth via CLI — Design

**Data:** 2026-04-25
**Status:** Em revisão

## Contexto

A tela **Configurações → Plugins → Claude → Autenticação** hoje oferece um botão "Conectar" que apenas abre `console.anthropic.com/settings/keys` no navegador. Não existe fluxo OAuth real, e nenhum token é salvo de volta — o status sempre mostra "Desconectado", mesmo quando o usuário já está autenticado no Claude Code instalado na máquina.

Como o Ptolomeu usa `@anthropic-ai/claude-agent-sdk`, que consome diretamente as credenciais do Claude Code do sistema (Keychain do macOS, serviço `Claude Code-credentials`), pedir um login separado é redundante e induz o usuário a um caminho quebrado.

## Objetivo

Refletir a realidade da autenticação do Claude Code no painel do Ptolomeu e delegar 100% do fluxo de login/instalação ao CLI oficial. O Ptolomeu **não implementa** OAuth nem gerencia tokens próprios — apenas observa o estado do Claude Code e orienta o usuário quando precisa agir.

## Estados

O painel "Anthropic SSO" passa a ter três estados mutuamente exclusivos:

| Estado | Detecção | UI |
|---|---|---|
| `not-installed` | CLI `claude` não está no PATH e não está em paths conhecidos | Aviso + botão **"Instalar Claude Code"** |
| `not-authenticated` | CLI presente, mas Keychain não tem `Claude Code-credentials` | Botão **"Abrir Claude Code para conectar"** |
| `authenticated` | Keychain tem `Claude Code-credentials` para o usuário atual | Badge verde "Conectado via Claude Code" |

## Detecção

### CLI instalado

Em `src/bun/claude/auth.ts`:

```ts
async function detectClaudeCli(): Promise<{ installed: boolean; path?: string }> {
  // 1. login shell — pega PATH completo do usuário (homebrew, ~/.local/bin, etc.)
  const proc = Bun.spawn(["/bin/zsh", "-lc", "command -v claude"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code === 0) {
    const path = (await new Response(proc.stdout).text()).trim();
    if (path) return { installed: true, path };
  }
  // 2. fallback: paths conhecidos do install.sh oficial
  const candidates = [
    join(homedir(), ".local/bin/claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
  for (const p of candidates) {
    if (await Bun.file(p).exists()) return { installed: true, path: p };
  }
  return { installed: false };
}
```

### Credencial no Keychain

```ts
async function detectClaudeCodeKeychain(): Promise<boolean> {
  const proc = Bun.spawn(
    ["security", "find-generic-password", "-s", "Claude Code-credentials", "-a", userInfo().username],
    { stdout: "ignore", stderr: "ignore" },
  );
  return (await proc.exited) === 0;
}
```

`security` sem `-w` retorna apenas metadados — **não dispara o diálogo de unlock do Keychain**.

## Tipo `ClaudeAuthStatus`

```ts
export interface ClaudeAuthStatus {
  mode: "anthropic" | "bedrock" | "none";
  anthropic?: {
    cliStatus: "not-installed" | "not-authenticated" | "authenticated";
  };
  bedrock?: { endpoint: string; profile: string; region: string };
}
```

- `mode` reflete o backing **efetivamente utilizável**, derivado de `cliStatus` + presença de config Bedrock (ver `getClaudeAuthStatus` abaixo). **Não** é dirigido pelo `settings.claude.authMode` — esse setting governa apenas qual painel da UI é exibido.
- `anthropic.cliStatus` é sempre populado.
- Os campos antigos `anthropic.connected` e `anthropic.email` são **removidos** — o estado de conexão agora é representado por `cliStatus`.

## Funções públicas em `auth.ts`

### `getClaudeAuthStatus()` — atualizada

```ts
export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatus> {
  const [cli, bedrock] = await Promise.all([detectClaudeCli(), getBedrockConfig()]);

  let cliStatus: "not-installed" | "not-authenticated" | "authenticated";
  if (!cli.installed) cliStatus = "not-installed";
  else if (await detectClaudeCodeKeychain()) cliStatus = "authenticated";
  else cliStatus = "not-authenticated";

  // `mode` reflete o backing efetivamente utilizável agora:
  // - "anthropic" se o Claude Code está autenticado (SDK consegue rodar via CLI);
  // - "bedrock" se Bedrock está configurado e Claude Code não autenticado;
  // - "none" caso contrário.
  // O ROTEAMENTO da UI (qual painel exibir) é dirigido por `settings.claude.authMode`,
  // não por este campo — `mode` aqui é puramente informativo sobre o estado real.
  let mode: "anthropic" | "bedrock" | "none";
  if (cliStatus === "authenticated") mode = "anthropic";
  else if (bedrock) mode = "bedrock";
  else mode = "none";

  return {
    mode,
    anthropic: { cliStatus },
    ...(bedrock ? { bedrock } : {}),
  };
}
```

> Nota: o RPC `claudeGetAuthStatus` já existe e mantém o nome. Apenas a forma do payload muda.

### `installClaudeCli()` — nova

Abre o Terminal.app rodando o instalador oficial:

```ts
export async function installClaudeCli(): Promise<{ ok: boolean; error?: string }> {
  const cmd = `curl -fsSL https://claude.ai/install.sh | bash`;
  const proc = Bun.spawn([
    "osascript",
    "-e", `tell app "Terminal" to do script "${cmd}"`,
    "-e", `tell app "Terminal" to activate`,
  ], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  return code === 0 ? { ok: true } : { ok: false, error: "Falha ao abrir o Terminal" };
}
```

### `openClaudeLogin()` — substitui `loginAnthropicSSO`

```ts
export async function openClaudeLogin(): Promise<{ ok: boolean; error?: string }> {
  const proc = Bun.spawn([
    "osascript",
    "-e", `tell app "Terminal" to do script "claude /login"`,
    "-e", `tell app "Terminal" to activate`,
  ], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  return code === 0 ? { ok: true } : { ok: false, error: "Falha ao abrir o Terminal" };
}
```

### Removido

- `loginAnthropicSSO()` — substituído por `openClaudeLogin()`.
- `saveAnthropicToken()` — nunca foi chamado em produção (não havia OAuth real); o Ptolomeu não armazena tokens próprios.
- `logoutAnthropicSSO()` — não há mais sessão própria. Logout é feito pelo CLI.
- O caminho `~/.ptolomeu/auth/anthropic.json` deixa de ser lido/escrito. (Se existir, é ignorado; não tentamos migrar.)

`AUTH_DIR` continua existindo apenas para `bedrock.json`.

## RPC

Em `src/bun/rpc.ts` (e `src/mainview/providers/rpc.ts` + `src/chatview/rpc.ts`):

| Antes | Depois |
|---|---|
| `claudeLoginSSO` | **`claudeOpenLogin`** — chama `openClaudeLogin()` |
| — | **`claudeInstallCli`** (novo) — chama `installClaudeCli()` |
| `claudeLogoutSSO` | **removido** |
| `claudeGetAuthStatus` | mantido (payload muda) |

`claudeSetBedrock`, `claudeGetBedrock` permanecem inalterados.

## UI — `src/mainview/settings/claude-section.tsx`

### Estado `not-installed`

Card com texto:
> O Claude Code não está instalado. Ele será baixado de `claude.ai/install.sh` e instalado via Terminal.

Botão **"Instalar Claude Code"**. Ao clicar:
- Dispara `rpc.request.claudeInstallCli()`.
- Mostra estado intermediário "Instalando no Terminal..." com spinner.
- Inicia polling do `claudeGetAuthStatus` a cada **5s**, máx **5min** ou até `cliStatus !== "not-installed"`.
- Polling para também se o usuário fechar o `SettingsDialog`.

### Estado `not-authenticated`

Texto:
> Você precisa entrar na sua conta Anthropic pelo Claude Code.

Botão **"Abrir Claude Code para conectar"**. Ao clicar:
- Dispara `rpc.request.claudeOpenLogin()`.
- Mostra "Conclua o login no Terminal aberto."
- Polling a cada **3s**, máx **2min** ou até `cliStatus === "authenticated"`.

### Estado `authenticated`

Badge verde "Conectado via Claude Code" + texto:
> Usando credencial do Claude Code instalado no sistema.

**Sem botão de desconectar** — o gerenciamento de logout é feito pelo CLI. Adicionar texto secundário: _"Para desconectar, rode `claude /logout` no Terminal."_

### Re-detecção em foco

Atualmente `claudeGetAuthStatus` só é chamado no mount do `ClaudeSection`. Adicionar um `useEffect` que re-checa toda vez que o `SettingsDialog` abre, propagando o estado `open` do diálogo até `ClaudeSection` (via prop ou via `SettingsContext`). Quando `open` transita de `false` para `true`, dispara `refreshAuth()`.

## Segurança

- Comandos passados ao `osascript` são literais hard-coded — não há concatenação de input do usuário, sem injeção possível.
- `claude.ai/install.sh` é a fonte oficial conforme [code.claude.com/docs/en/quickstart](https://code.claude.com/docs/en/quickstart). Confiamos em HTTPS + TLS para integridade.
- A instalação roda com o shell e privilégios do usuário; sem `sudo`. O script oficial instala em `~/.local/bin/`.
- A leitura do Keychain via `security` sem `-w` retorna apenas metadados — não exige unlock e não expõe o secret.
- Proxy: o Terminal do usuário herda variáveis de ambiente do shell, então `HTTP_PROXY`/`HTTPS_PROXY` configurados no `.zshrc` são respeitados naturalmente. O `fetchWithProxy` do Ptolomeu não se aplica aqui (o `osascript` não passa pelo nosso fetch).

## Testes

### `src/bun/claude/auth.test.ts` (novo)

- `detectClaudeCli`: três cenários — login shell hit, fallback de path encontra binário, ambos falham.
- `detectClaudeCodeKeychain`: exit 0 → `true`; exit ≠ 0 → `false`.
- `getClaudeAuthStatus`:
  - CLI ausente, sem Bedrock → `cliStatus: "not-installed"`, `mode: "none"`.
  - CLI ausente, com Bedrock → `cliStatus: "not-installed"`, `mode: "bedrock"`, `bedrock` preenchido.
  - CLI presente, Keychain ausente, sem Bedrock → `cliStatus: "not-authenticated"`, `mode: "none"`.
  - CLI presente, Keychain ausente, com Bedrock → `cliStatus: "not-authenticated"`, `mode: "bedrock"`.
  - CLI presente, Keychain presente → `cliStatus: "authenticated"`, `mode: "anthropic"` (independente de Bedrock).
- `installClaudeCli` e `openClaudeLogin`: `Bun.spawn` mockado, validar argumentos passados ao `osascript`.

Mocks: stub global de `Bun.spawn` retornando `{ exited: Promise<number>, stdout: ReadableStream }`. Pattern já existe em `src/bun/net/proxy.test.ts` (verificar antes de duplicar).

### `src/mainview/settings/claude-section.test.tsx` (novo ou estendido)

- Renderiza os três estados a partir de mocks de `rpc.request.claudeGetAuthStatus`.
- Click em "Instalar Claude Code" chama `claudeInstallCli`.
- Click em "Abrir Claude Code para conectar" chama `claudeOpenLogin`.
- Polling — usar `vi.useFakeTimers()` para avançar tempo e validar que o estado transita após sucesso simulado, e que para após `unmount`/timeout.

### `src/bun/rpc.test.ts`

- Atualizar lista de handlers esperados: trocar `claudeLoginSSO`/`claudeLogoutSSO` por `claudeOpenLogin`/`claudeInstallCli`.

## Fora de escopo

- Validar a versão do Claude Code instalado — qualquer versão presente é considerada OK.
- Gerenciamento de atualizações do CLI.
- Mostrar email da conta conectada (exigiria ler o secret do Keychain → diálogo de unlock).
- Bedrock não muda.
- Plataformas além do macOS (o app é macOS-only conforme `electrobun.config.ts`).

## Plano de migração

Como settings do Claude tolera chaves desconhecidas (`src/bun/settings.ts` re-serializa apenas conhecidas), e o tipo `ClaudeAuthStatus` é puramente runtime entre processos do mesmo build, **não há migração de dados**. Usuários com `~/.ptolomeu/auth/anthropic.json` antigo simplesmente terão o arquivo ignorado — opcionalmente, podemos deletá-lo no boot, mas não é necessário.
