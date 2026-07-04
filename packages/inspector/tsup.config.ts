import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/standalone.ts"],
	format: ["esm"],
	dts: { entry: "src/index.ts" },
	clean: true,
	shims: true,
	// Bundle workspace deps (their in-repo entries are TS source); keep the
	// native module and the tiny runtime deps external.
	noExternal: [/^@hookkit-dev\//],
	external: ["better-sqlite3"],
});
