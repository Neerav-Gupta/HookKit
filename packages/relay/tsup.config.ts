import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts", "src/server-cli.ts", "src/client-cli.ts"],
	format: ["esm"],
	dts: { entry: "src/index.ts" },
	clean: true,
	shims: true,
});
