/**
 * Config resolution, in priority order: flags → hookkit.config.* → env.
 * Secrets are only ever held in memory; they are never logged or written.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface HookkitConfig {
	/** Per-provider webhook secrets, e.g. { stripe: "whsec_…" }. */
	secrets?: Record<string, string>;
	/** Default delivery target URL for trigger/replay. */
	target?: string;
}

const CONFIG_FILES = [
	"hookkit.config.js",
	"hookkit.config.mjs",
	"hookkit.config.json",
	// .ts works on Node versions with type stripping (>= 22.6 with the flag,
	// >= 23 by default); otherwise use a .js/.mjs/.json config.
	"hookkit.config.ts",
];

export async function loadConfig(
	cwd: string = process.cwd(),
): Promise<HookkitConfig> {
	for (const name of CONFIG_FILES) {
		const path = join(cwd, name);
		if (!existsSync(path)) continue;
		if (name.endsWith(".json")) {
			const { readFileSync } = await import("node:fs");
			return JSON.parse(readFileSync(path, "utf8")) as HookkitConfig;
		}
		const mod = (await import(pathToFileURL(path).href)) as {
			default?: HookkitConfig;
		};
		return mod.default ?? (mod as HookkitConfig);
	}
	return {};
}

/**
 * Resolve the signing secret: --secret flag → config file → provider env var
 * (HOOKKIT_STRIPE_SECRET) → generic env var (HOOKKIT_SECRET).
 */
export function resolveSecret(
	provider: string,
	flag: string | undefined,
	config: HookkitConfig,
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	const envKey = `HOOKKIT_${provider.toUpperCase().replaceAll("-", "_")}_SECRET`;
	return (
		flag ?? config.secrets?.[provider] ?? env[envKey] ?? env.HOOKKIT_SECRET
	);
}

export function resolveTarget(
	flag: string | undefined,
	config: HookkitConfig,
	env: NodeJS.ProcessEnv = process.env,
): string | undefined {
	return flag ?? config.target ?? env.HOOKKIT_TARGET;
}
