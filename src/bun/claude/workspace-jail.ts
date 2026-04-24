/**
 * Hard containment for Claude's write tools. `cwd` alone is not enough: the
 * SDK happily accepts absolute `file_path` values that escape the project
 * directory, which defeats per-conversation isolation. This module rejects
 * any Write/Edit/NotebookEdit/Bash invocation whose target path lives
 * outside the workspace *before* the permission gate ever sees it.
 *
 * Scope = creation and mutation. Read tools (Read/Grep/Glob/LS) are left
 * untouched; user's stated goal is "nenhum arquivo seja alterado ou criado
 * fora do workspace".
 */

import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";

export type JailResult = { allowed: true } | { allowed: false; reason: string };

function canonicalWorkspace(workspace: string): string {
	// Resolve symlinks once so comparisons are stable. The project dir is
	// created by ProjectStore.create() before any session starts, so realpath
	// is safe here.
	try {
		return realpathSync(workspace);
	} catch {
		return resolve(workspace);
	}
}

export function isInsideWorkspace(
	workspace: string,
	candidate: string,
): boolean {
	if (!candidate) return false;
	const canonicalWs = canonicalWorkspace(workspace);
	// Candidate may not exist yet (Write creates it), so don't realpath it.
	// `resolve` normalizes `..` against the workspace when candidate is
	// relative, or keeps the absolute form as-is.
	const resolved = resolve(canonicalWs, candidate);
	if (resolved === canonicalWs) return true;
	return resolved.startsWith(canonicalWs + sep);
}

// Patterns that indicate the command is creating/mutating a file or
// invoking an interpreter that could. Paired with extractReferencedPaths,
// any absolute/tilde path referenced by such a command must live inside
// the workspace.
//
// Interpreter entries (python/node/…) are included because `-c`/`-e`
// strings can write anywhere via `open('/…','w')`, `fs.writeFileSync`,
// etc. We cannot statically analyze the interpreter string, so we treat
// *any* absolute path mentioned alongside an interpreter as a potential
// write target and gate it through the workspace check.
const BASH_WRITE_PATTERNS: RegExp[] = [
	/(?:^|\s|;|&&|\|\|)\s*rm\b/,
	/(?:^|\s|;|&&|\|\|)\s*mv\b/,
	/(?:^|\s|;|&&|\|\|)\s*cp\b/,
	/(?:^|\s|;|&&|\|\|)\s*touch\b/,
	/(?:^|\s|;|&&|\|\|)\s*mkdir\b/,
	/(?:^|\s|;|&&|\|\|)\s*rmdir\b/,
	/(?:^|\s|;|&&|\|\|)\s*chmod\b/,
	/(?:^|\s|;|&&|\|\|)\s*chown\b/,
	/(?:^|\s|;|&&|\|\|)\s*ln\b/,
	/(?:^|\s|;|&&|\|\|)\s*truncate\b/,
	/(?:^|\s|;|&&|\|\|)\s*tee\b/,
	/\bsed\b[^|;&]*\s-i\b/,
	/\bawk\b[^|;&]*\s-i\s+inplace\b/,
	/\bdd\b[^|;&]*\bof=/,
	// Interpreters: presence alone suffices; we assume they may write.
	/(?:^|\s|;|&&|\|\|)\s*(?:python3?|perl|node|deno|bun|ruby|php|Rscript)\b/,
	// Output redirection to a file: `>`, `>>`, `>|`, `2>`, `2>>`, `&>`,
	// `&>>`. The trailing char class excludes `&` (to skip `2>&1` dup) and
	// whitespace. We allow the redirect to appear flush against a previous
	// token (`echo x>>/tmp/out`) by making the preceding boundary optional.
	/(?:\d+|&)?>>?\|?\s*[^&\s]/,
];

function isBashWrite(command: string): boolean {
	return BASH_WRITE_PATTERNS.some((re) => re.test(command));
}

/**
 * Expands leading `~` (optionally followed by `/`) to the user's home so
 * downstream path extraction and workspace checks work uniformly. We do
 * NOT try to handle `~user/…` (different user) — those paths are
 * inherently outside our workspace and will be caught by the next pass.
 */
function expandTilde(command: string): string {
	const home = homedir();
	return command.replace(
		// `~` at a token boundary, optionally followed by `/`
		/(?<=^|[\s;|&<>()`"'])~(?=\/|$|[\s;|&<>()`"'])/g,
		home,
	);
}

/**
 * Extracts tokens that look like absolute POSIX paths referenced by the
 * command. Scans both unquoted tokens and the interior of single/double
 * quoted strings so patterns like `open('/etc/passwd','w')` still yield
 * `/etc/passwd`. Good enough to catch common write targets without a full
 * shell parser; over-matching only causes denies, never bypasses.
 */
function extractReferencedPaths(command: string): string[] {
	const paths: string[] = [];
	// Unquoted absolute paths.
	const unquoted = command.match(/(?<![\w/])\/[^\s"'`;|&<>()$]+/g);
	if (unquoted) paths.push(...unquoted);
	// Paths inside single- or double-quoted strings (supports paths with
	// spaces and characters that would otherwise break unquoted tokens).
	const quoted = command.matchAll(/(['"])(\/[^'"\n\r]*)\1/g);
	for (const match of quoted) paths.push(match[2]);
	return paths;
}

function toolRequiresPath(
	toolName: string,
): "file_path" | "notebook_path" | null {
	if (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") {
		return "file_path";
	}
	if (toolName === "NotebookEdit") return "notebook_path";
	return null;
}

export function checkToolInput(
	workspace: string,
	toolName: string,
	input: unknown,
): JailResult {
	const fieldName = toolRequiresPath(toolName);
	if (fieldName) {
		const raw = (input as Record<string, unknown> | null)?.[fieldName];
		if (typeof raw !== "string" || !raw) {
			return {
				allowed: false,
				reason: `${toolName} exige ${fieldName} (string). Workspace: ${workspace}.`,
			};
		}
		if (!isAbsolute(raw)) {
			// Relative paths are resolved against cwd (workspace) by the SDK,
			// so they are contained by construction. Re-check defensively.
			if (!isInsideWorkspace(workspace, raw)) {
				return {
					allowed: false,
					reason: `Caminho "${raw}" escapa do workspace ${workspace}.`,
				};
			}
			return { allowed: true };
		}
		if (!isInsideWorkspace(workspace, raw)) {
			return {
				allowed: false,
				reason: `Caminho "${raw}" está fora do workspace ${workspace}. Use caminhos relativos ou dentro de ${workspace}.`,
			};
		}
		return { allowed: true };
	}

	if (toolName === "Bash") {
		const raw = (input as Record<string, unknown> | null)?.command;
		if (typeof raw !== "string" || !raw) {
			return { allowed: false, reason: "Bash exige command (string)." };
		}
		const command = expandTilde(raw);
		if (!isBashWrite(command)) return { allowed: true };
		for (const p of extractReferencedPaths(command)) {
			if (!isInsideWorkspace(workspace, p)) {
				return {
					allowed: false,
					reason: `Comando toca "${p}" fora do workspace ${workspace}. Mantenha criações/alterações dentro do workspace.`,
				};
			}
		}
		return { allowed: true };
	}

	// Read, Grep, Glob, LS, MCP tools, etc. — not in scope of the jail.
	return { allowed: true };
}
