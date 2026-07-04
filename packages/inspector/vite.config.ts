import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	root: "ui",
	plugins: [react(), tailwindcss()],
	build: {
		outDir: "../dist-ui",
		emptyOutDir: true,
	},
	server: {
		// Dev-mode proxy to a locally running inspector API.
		proxy: {
			"/api": "http://127.0.0.1:4000",
			"/events": "http://127.0.0.1:4000",
			"/in": "http://127.0.0.1:4000",
		},
	},
});
