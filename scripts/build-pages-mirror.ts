#!/usr/bin/env bun
import { $ } from "bun";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const PAGES_BASE = "https://guichafy.github.io/ptolomeu";
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
