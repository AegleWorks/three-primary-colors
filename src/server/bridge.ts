import { spawn } from "node:child_process";
import * as path from "node:path";
import { version } from "../../package.json";
import { DiscordIPCBridge } from "./DiscordIPCBridge";
import { runUpdated, update } from "./updater";

// Entry point of rempalago-bridge.exe (bun run release), the bridge for people
// who run the broadcast without the repo: double-click it and leave the window
// open. Compiled, it works from its own folder, so the Discord token it saves
// stays next to the exe wherever it was launched from.
const compiled = !/^bun(\.exe)?$/i.test(path.basename(process.execPath));
if (compiled) process.chdir(path.dirname(process.execPath));

const PANEL = "http://127.0.0.1:24050/vcl-overlay/panel.html";
// A panel already open (a tab, or the dock in OBS) reconnects within ControlLink's 2s.
const PANEL_GRACE_MS = 4_000;
const TOSU_POLL_MS = 3_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const tosuUp = () => fetch(PANEL, { signal: AbortSignal.timeout(2_000) }).then((res) => res.ok, () => false);

// Opens the panel in the default browser once tosu serves it, whatever order
// the two started in, unless one turns up on its own.
async function openPanel(bridge: DiscordIPCBridge) {
	await wait(PANEL_GRACE_MS);
	while (!bridge.panelOpen) {
		if (await tosuUp()) {
			spawn("rundll32", ["url.dll,FileProtocolHandler", PANEL], { detached: true, stdio: "ignore" }).unref();
			return;
		}
		await wait(TOSU_POLL_MS);
	}
}

console.log(`
  Rempalago bridge v${version}
  Conecta el panel de control con el overlay y trae a los casters de Discord.
  Deja esta ventana abierta durante toda la transmisión; ciérrala al terminar.
  La primera vez Discord te pide autorizar la conexión: acéptala.
`);

if (compiled && (await update(process.cwd()))) runUpdated();

const bridge = new DiscordIPCBridge();
bridge.start();
if (compiled) openPanel(bridge);

process.on("SIGINT", () => {
	bridge.stop();
	process.exit(0);
});
