#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const packageDirs = [
	"packages/fixtures",
	"packages/core",
	"packages/adapter-express",
	"packages/adapter-fastify",
	"packages/adapter-hono",
	"packages/adapter-nest",
	"packages/adapter-next",
	"packages/inspector",
	"packages/relay",
	"packages/sdk",
	"packages/cli",
];

const dryRun = process.argv.includes("--dry-run");

function fail(message) {
	console.error(message);
	process.exit(1);
}

for (const packageDir of packageDirs) {
	const absoluteDir = resolve(rootDir, packageDir);
	const packageJsonPath = resolve(absoluteDir, "package.json");
	if (!existsSync(packageJsonPath)) {
		fail(`missing package.json: ${packageJsonPath}`);
	}

	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

	const packageName = packageJson.name ?? packageDir;
	const requiredOutputs = ["dist"];
	if (packageJson.files?.includes("dist-ui")) requiredOutputs.push("dist-ui");

	for (const outputDir of requiredOutputs) {
		if (!existsSync(resolve(absoluteDir, outputDir))) {
			fail(`missing build output for ${packageName}: ${outputDir}`);
		}
	}

	const args = ["publish", "--access", "public"];
	if (dryRun) args.push("--dry-run");

	console.log(`\nPublishing ${packageName}${dryRun ? " (dry-run)" : ""}...`);
	const result = spawnSync("npm", args, {
		cwd: absoluteDir,
		stdio: "inherit",
		env: process.env,
	});

	if (result.status !== 0) {
		fail(`publish failed for ${packageName}`);
	}
}

console.log(`\n${dryRun ? "Dry-run complete" : "Publish complete"}.`);
