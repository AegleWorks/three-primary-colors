import * as path from "node:path";
import { DiscordIPCBridge } from "./DiscordIPCBridge";

// Entry point of rempalago-bridge.exe (bun run release), the bridge for people
// who run the broadcast without the repo: double-click it and leave the window
// open. Compiled, it works from its own folder, so the Discord token it saves
// stays next to the exe wherever it was launched from.
const compiled = !/^bun(\.exe)?$/i.test(path.basename(process.execPath));
if (compiled) process.chdir(path.dirname(process.execPath));

console.log(`
  Rempalago bridge
  Conecta el panel de control con el overlay y trae a los casters de Discord.
  Deja esta ventana abierta durante toda la transmisión; ciérrala al terminar.
  La primera vez Discord te pide autorizar la conexión: acéptala.
`);

const bridge = new DiscordIPCBridge();
bridge.start();

process.on("SIGINT", () => {
	bridge.stop();
	process.exit(0);
});
