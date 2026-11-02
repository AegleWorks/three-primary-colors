import ZEngine from "@fukutotojido/z-engine";
import { version } from "../../package.json";
import type { RemoteStatus } from "../config/remote";
import type ControlLink from "../control/ControlLink";
import type { Command, OverlayState } from "../control/ControlLink";
import OBSHandler from "../handler/OBSHandler";
import SceneSync from "../handler/SceneSync";

// What only the panel on the broadcasting machine can do: reach OBS, and let
// remote operators in. A remote panel never loads this.
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const RELOADED = "rempalago-panel-reloaded";
const OLD_BRIDGE_MS = 5000;

export function startLocal(link: ControlLink, send: (command: Command) => void, state: () => OverlayState | null) {
	const obs = new OBSHandler(new ZEngine("ws://127.0.0.1:24050/ws"));
	// A browser source the setup creates opens the overlay next to this page,
	// in the round the overlay is showing.
	obs.overlayUrl = () => new URL(`./?round=${encodeURIComponent(state()?.round || "f")}`, location.href).href;
	new SceneSync(obs, (scene) => send({ action: "scene", scene }));

	let remote: RemoteStatus | null = null;
	const copy = async (button: HTMLElement, text: string) => {
		const label = button.textContent;
		await navigator.clipboard.writeText(text);
		button.textContent = "Copiado";
		setTimeout(() => (button.textContent = label), 1500);
	};
	$("#remoteToggle").addEventListener("click", () => link.setRemote(!remote?.on));
	$("#remoteCopyCode").addEventListener("click", (e) => copy(e.currentTarget as HTMLElement, remote?.code ?? ""));
	$("#remoteCopyLink").addEventListener("click", (e) => copy(e.currentTarget as HTMLElement, remote?.link ?? ""));

	// A panel left open keeps its old code when the bridge updates (the dock in
	// OBS above all), and a bridge outside tosu's folder updates files tosu doesn't
	// serve. One reload settles the first; the second needs the broadcaster.
	const versionNote = $("#versionWarning");
	const reloaded = (value?: string) => {
		try {
			if (value !== undefined) sessionStorage.setItem(RELOADED, value);
			return sessionStorage.getItem(RELOADED);
		} catch {
			return value ?? null;
		}
	};
	const checkVersion = (bridge: string) => {
		versionNote.textContent = "";
		if (bridge === version) return;
		if (reloaded() !== bridge) {
			reloaded(bridge);
			location.reload();
			return;
		}
		versionNote.textContent = `Panel v${version}, bridge v${bridge}: revisa que rempalago-bridge.exe esté junto a tosu.exe.`;
	};
	// a bridge from before versions were compared says nothing about its own
	setTimeout(() => {
		if (link.connected && !remote) versionNote.textContent = "Hay un bridge anterior abierto: ciérralo y abre el de la carpeta de tosu.";
	}, OLD_BRIDGE_MS);

	link.onRemoteStatus((status) => {
		remote = status;
		checkVersion(status.version);
		$("#remoteBlock").hidden = !status.available;
		$("#remoteOn").hidden = !status.on;
		$("#remoteToggle").textContent = status.on ? "Cortar acceso" : "Activar acceso remoto";
		$("#remoteCodeShown").textContent = status.code;
		$("#remoteState").dataset.state = status.online ? "on" : "wait";
		$("#remoteState").textContent = !status.on
			? ""
			: !status.online
				? "Conectando…"
				: status.panels
					? `${status.panels} ${status.panels === 1 ? "panel conectado" : "paneles conectados"}`
					: "Esperando panel";
	});
}
