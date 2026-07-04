import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts"],
	format: ["esm"],
	dts: { entry: "src/index.ts" },
	clean: true,
	shims: true,
	// Bundle workspace packages so the built CLI runs directly under node
	// (their in-repo entry points are TypeScript source). Fixture files are
	// still read from the real @hookkit-dev/fixtures directory at runtime.
	// The inspector stays external: it ships its own built output and a
	// native SQLite dependency, and is loaded lazily by `hookkit inspect`.
	noExternal: [/^@hookkit-dev\/(core|fixtures)$/],
});
