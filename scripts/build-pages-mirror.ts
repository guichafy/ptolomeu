#!/usr/bin/env bun
import { $ } from "bun";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const PAGES_BASE = "https://guichafy.github.io/ptolomeu";
const MAX_INDEX_ENTRIES = 10;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;

const version = process.argv[2];
const zipArg = process.argv[3];

if (!version || !SEMVER_RE.test(version)) {
	console.error("Usage: bun run scripts/build-pages-mirror.ts <semver> <zipPath>");
	process.exit(1);
}
if (!zipArg) {
	console.error("Missing <zipPath> argument");
	process.exit(1);
}

const root = resolve(import.meta.dir, "..");
const pagesDist = resolve(root, "pages-dist");
const versionDir = resolve(pagesDist, `v${version}`);
const zipName = `ptolomeu-${version}-macos-arm64.zip`;
const zipSrc = resolve(root, zipArg);

if (!(await Bun.file(zipSrc).exists())) {
	console.error(`Zip not found: ${zipSrc}`);
	process.exit(1);
}

await mkdir(versionDir, { recursive: true });
await copyFile(zipSrc, resolve(versionDir, zipName));
console.log(`Staged ${zipName} → pages-dist/v${version}/`);

const priorVersions = await listPriorVersions();
const allVersions = Array.from(new Set([version, ...priorVersions])).sort(compareSemverDesc);
const latestVersion = allVersions.find((v) => !v.includes("-")) ?? allVersions[0];
const latestZip = `ptolomeu-${latestVersion}-macos-arm64.zip`;
const latest = {
	version: latestVersion,
	url: `${PAGES_BASE}/v${latestVersion}/${latestZip}`,
	publishedAt: new Date().toISOString(),
};
await Bun.write(resolve(pagesDist, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`);
console.log(`Wrote latest.json → ${latestVersion}`);

const rows = allVersions
	.slice(0, MAX_INDEX_ENTRIES)
	.map((v) => {
		const zip = `ptolomeu-${v}-macos-arm64.zip`;
		const url = `${PAGES_BASE}/v${v}/${zip}`;
		return `      <tr><td><code>v${escapeHtml(v)}</code></td><td><a href="${escapeHtml(url)}">${escapeHtml(zip)}</a></td></tr>`;
	})
	.join("\n");

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Ptolomeu — Downloads</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 3rem auto; padding: 0 1rem; color: #1a1a1a; }
      h1 { margin-bottom: 0.25rem; }
      p.sub { color: #555; margin-top: 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
      th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee; }
      th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
      a { color: #0366d6; text-decoration: none; }
      a:hover { text-decoration: underline; }
      code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.9em; }
    </style>
  </head>
  <body>
    <h1>Ptolomeu</h1>
    <p class="sub">Mirror de downloads do macOS menu bar app. Fonte oficial: <a href="https://github.com/guichafy/ptolomeu/releases">GitHub Releases</a>.</p>
    <p>Última versão: <a href="${escapeHtml(latest.url)}"><code>v${escapeHtml(latestVersion)}</code></a> · <a href="latest.json">latest.json</a></p>
    <table>
      <thead><tr><th>Versão</th><th>Download</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </body>
</html>
`;

await Bun.write(resolve(pagesDist, "index.html"), html);
console.log(`Wrote index.html with ${Math.min(allVersions.length, MAX_INDEX_ENTRIES)} entries`);

async function listPriorVersions(): Promise<string[]> {
	try {
		await $`git fetch origin gh-pages --depth=1`.quiet();
	} catch {
		console.warn("gh-pages branch not reachable yet — starting with empty version list");
		return [];
	}
	const list = await $`git ls-tree -r --name-only origin/gh-pages`.text();
	const re = /^v(\d+\.\d+\.\d+(?:-[\w.-]+)?)\/ptolomeu-\1-macos-arm64\.zip$/;
	return list
		.split("\n")
		.map((line) => line.match(re))
		.filter((m): m is RegExpMatchArray => m !== null)
		.map((m) => m[1]);
}

function parseSemver(v: string): [number, number, number] {
	const [core] = v.split("-");
	const [maj, min, pat] = core.split(".").map(Number);
	return [maj, min, pat];
}

function compareSemverDesc(a: string, b: string): number {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	for (let i = 0; i < 3; i++) {
		if (pa[i] !== pb[i]) return pb[i] - pa[i];
	}
	const preA = a.split("-")[1] ?? "";
	const preB = b.split("-")[1] ?? "";
	if (!preA && preB) return -1;
	if (preA && !preB) return 1;
	return preB.localeCompare(preA);
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => {
		if (c === "&") return "&amp;";
		if (c === "<") return "&lt;";
		if (c === ">") return "&gt;";
		if (c === '"') return "&quot;";
		return "&#39;";
	});
}
