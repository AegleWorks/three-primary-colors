import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { DiscordIPCBridge } from "./src/server/DiscordIPCBridge";

function discordBridgePlugin(): Plugin {
	return {
		name: "discord-ipc-bridge-plugin",
		configureServer() {
			const g = globalThis as unknown as { __discordBridge__?: DiscordIPCBridge };
			if (g.__discordBridge__) {
				g.__discordBridge__.stop();
			}
			g.__discordBridge__ = new DiscordIPCBridge(24052);
			g.__discordBridge__.start();
		},
		closeBundle() {
			const g = globalThis as unknown as { __discordBridge__?: DiscordIPCBridge };
			if (g.__discordBridge__) {
				g.__discordBridge__.stop();
				g.__discordBridge__ = undefined;
			}
		},
	};
}

export default defineConfig({
	plugins: [tailwindcss(), discordBridgePlugin()],
	base: "./",
	build: {
		target: "esnext", //browsers can handle the latest ES features,
		rolldownOptions: {
			output: {
				entryFileNames: "assets/[name].js",
				assetFileNames: "assets/[name].[ext]",
				chunkFileNames: "assets/[name].js",
				codeSplitting: {
					groups: [
						{
							name: "deps/vendor",
							test: /node_modules/,
							priority: 20,
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
});
