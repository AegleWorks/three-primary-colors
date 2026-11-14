import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
	plugins: [tailwindcss()],
	base: "./",
	build: {
		target: "esnext", //browsers can handle the latest ES features,
		rolldownOptions: {
			// The overlay (OBS browser source) and the control panel (tab or dock).
			input: {
				// the remote panel is published on its own, without the overlay
				...(mode === "remote" ? {} : { index: path.resolve(import.meta.dirname, "index.html") }),
				// Battle Royale: the background that goes under the tourney client in OBS
				...(mode === "remote" ? {} : { "br-fondo": path.resolve(import.meta.dirname, "br-fondo.html") }),
				panel: path.resolve(import.meta.dirname, "panel.html"),
			},
			output: {
				// A hash in every name: tosu sends no cache headers, so a browser
				// (Firefox above all) kept running last version's scripts under the
				// same names after an update. Only the .html pages keep fixed names,
				// and they point at the new files.
				entryFileNames: "assets/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash].[ext]",
				chunkFileNames: "assets/[name]-[hash].js",
				codeSplitting: {
					groups: [
						{
							name: "deps/vendor",
							test: /node_modules/,
							priority: 20,
						},
						// package.json (the version) is read by both the overlay and the
						// panel. Left to itself it lands in the overlay's entry chunk, and
						// the panel then runs the whole overlay just to read the version:
						// it throws on the missing .stage and takes local.ts (OBS) with it.
						{
							name: "version",
							test: /package\.json$/,
							priority: 30,
						},
						{
							name: (moduleId) => {
								const module = path
									.relative(process.cwd(), moduleId)
									.replace(".ts", "");

								return module;
							},
							test: /src\/*/,
						},
						{
							name: "deps/polyfill",
							test: /vite(\/*)?/,
						},
					],
				},
				minifyInternalExports: false,
			},
		},
		cssCodeSplit: true,
		minify: false,
	},
}));
