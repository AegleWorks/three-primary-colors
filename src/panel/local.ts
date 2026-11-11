import ZEngine from "@fukutotojido/z-engine";
import { version } from "../../package.json";
import type { RemoteStatus } from "../config/remote";
import type ControlLink from "../control/ControlLink";
import type { Command, OverlayState } from "../control/ControlLink";
import OBSHandler from "../handler/OBSHandler";
import SceneSync from "../handler/SceneSync";
import { t } from "./i18n";

// What only the panel on the broadcasting machine can do: reach OBS, and let
// remote operators in. A remote panel never loads this.
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const RELOADED = "rempalago-panel-reloaded";
const OBS_SAVED = "rempalago-obs";
const OLD_BRIDGE_MS = 5000;

const stored = (key: string, value?: string | null) => {
	try {
		if (value === null) localStorage.removeItem(key);
		else if (value !== undefined) localStorage.setItem(key, value);
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};

// `changed` tells the panel that something its status bar shows (OBS, the
// version check, remote access) moved.
export function startLocal(link: ControlLink, send: (command: Command) => void, state: () => OverlayState | null, changed: () => void) {
	const obs = new OBSHandler(new ZEngine("ws://127.0.0.1:24050/ws"));
	// A browser source the setup creates opens the overlay next to this page,
	// in the round the overlay is showing.
	obs.overlayUrl = () => new URL(`./?round=${encodeURIComponent(state()?.round || "f")}`, location.href).href;
	new SceneSync(obs, (scene) => send({ action: "scene", scene }));
	new MutationObserver(changed).observe($("#obsStatusDot"), { attributes: true });

	// OBS: connect once and the panel remembers it, so the next time it
	// connects by itself. A failed try says why instead of doing nothing.
	const url = $<HTMLInputElement>("#obsUrl");
	const pass = $<HTMLInputElement>("#obsPassword");
	const note = $("#obsConnectNote");
	const connect = async (quiet = false) => {
		const button = $<HTMLButtonElement>("#obsConnectBtn");
		button.disabled = true;
		button.textContent = t.obsConnecting;
		note.textContent = "";
		const ok = await obs.connect(url.value.trim() || "ws://127.0.0.1:4455", pass.value);
		button.disabled = false;
		if (ok) stored(OBS_SAVED, JSON.stringify({ url: url.value.trim(), password: pass.value }));
		else {
			button.textContent = t.obsConnect;
			if (!quiet) {
				note.dataset.ok = "false";
				note.textContent = t.obsConnectFailed;
			}
		}
		changed();
	};
	$("#obsConnectBtn").onclick = () => {
		if (obs.connected) {
			// disconnecting on purpose: don't come back on the next load
			stored(OBS_SAVED, null);
			obs.disconnect();
		} else connect();
	};
	try {
		const saved = JSON.parse(stored(OBS_SAVED) ?? "null");
		if (saved) {
			url.value = saved.url || url.value;
			pass.value = saved.password ?? "";
			connect(true);
		}
	} catch {}

	// Follow OBS: remembered across reloads.
	const follow = $<HTMLInputElement>("#sceneFollowObs");
	follow.checked = stored("rempalago-follow-obs") !== "false";
	follow.addEventListener("change", () => stored("rempalago-follow-obs", String(follow.checked)));

	let remote: RemoteStatus | null = null;
	const copy = async (button: HTMLElement, text: string) => {
		const label = button.textContent;
		try {
			await navigator.clipboard.writeText(text);
			button.textContent = t.copied;
		} catch {
			button.textContent = t.copyFailed;
		}
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
		versionNote.textContent = t.versionPanelBridge(version, bridge);
	};
	// a bridge from before versions were compared says nothing about its own
	setTimeout(() => {
		if (link.connected && !remote) {
			versionNote.textContent = t.versionOldBridge;
			changed();
		}
	}, OLD_BRIDGE_MS);

	link.onRemoteStatus((status) => {
		remote = status;
		checkVersion(status.version);
		$("#remoteBlock").hidden = !status.available;
		$("#remoteOn").hidden = !status.on;
		$("#remoteToggle").textContent = status.on ? t.remoteOff : t.remoteOn;
		$("#remoteToggle").className = status.on ? "btn btn--danger btn--wide" : "btn btn--gold btn--wide";
		$("#remoteCodeShown").textContent = status.code;
		$("#remoteState").dataset.state = !status.on ? "off" : status.online ? "ok" : "wait";
		$("#remoteState").textContent = !status.on ? t.remoteStateOff : !status.online ? t.remoteStateConnecting : status.panels ? t.remotePanels(status.panels) : t.remoteWaiting;
		changed();
	});
}
