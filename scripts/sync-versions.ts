#!/usr/bin/env bun
import { resolve } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
	console.error("Usage: bun run scripts/sync-versions.ts <semver>");
	process.exit(1);
}

const root = resolve(import.meta.dir, "..");

const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(await Bun.file(pkgPath).text());
pkg.version = version;
await Bun.write(pkgPath, `${JSON.stringify(pkg, null, "\t")}\n`);
console.log(`Updated package.json → ${version}`);

const cfgPath = resolve(root, "electrobun.config.ts");
const cfg = await Bun.file(cfgPath).text();
const next = cfg.replace(/(version:\s*)"[^"]*"/, `$1"${version}"`);
if (next === cfg) {
	console.error(`No version field updated in electrobun.config.ts`);
	process.exit(1);
}
await Bun.write(cfgPath, next);
console.log(`Updated electrobun.config.ts → ${version}`);
