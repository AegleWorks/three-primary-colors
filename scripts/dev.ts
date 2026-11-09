import { spawn } from "node:child_process";

console.log("[DevRunner] Starting Discord IPC Bridge and Vite dev server...");

const isWin = process.platform === "win32";

const bridge = spawn("bun", ["src/server/bridge.ts"], {
	stdio: "inherit",
	env: process.env,
	shell: isWin,
});

const vite = spawn("bun", ["x", "vite"], {
	stdio: "inherit",
	env: process.env,
	shell: isWin,
});

function cleanup() {
	if (!bridge.killed) bridge.kill();
	if (!vite.killed) vite.kill();
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

bridge.on("exit", (code) => {
	if (code !== 0 && code !== null) {
		console.warn(`[DevRunner] Discord Bridge exited with code ${code}`);
	}
});

vite.on("exit", (code) => {
	if (!bridge.killed) bridge.kill();
	process.exit(code ?? 0);
});
