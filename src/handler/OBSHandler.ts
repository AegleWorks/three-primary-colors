import { OBSWebSocket } from "obs-websocket-js";
import type ZEngine from "@fukutotojido/z-engine";
import TilingEngine, {
	type Rect,
	type TilingLayoutMode,
	type TilingOptions,
} from "./TilingEngine";
import { t } from "../panel/i18n";

// OBS game capture (win-capture): it hooks the osu! process, one per tournament
// client, so a covered window still shows. "priority" picks how a lost window
// is found again. TITLE: the title must match; EXE: the title, else any window
// of the same program.
const CAPTURE_KIND = "game_capture";
const OLD_CAPTURE_KIND = "window_capture";
const WINDOW_PRIORITY_TITLE = 1;
const WINDOW_PRIORITY_EXE = 2;
// OBS drops the hook while a source is off screen and hooks again when it
// shows, so a scene change waits on this.
const HOOK_RATE_FASTEST = 3;
const SYNC_MS = 5000;
const PROBE_INPUT = "rempalago: buscando ventanas";
const REPLAY_INPUT = "osu! replay";
const OVERLAY_INPUT = "Overlay";
// The match is 1v1: its scene holds two clients ("osu! 1" and "osu! 2") and
// never more, even when the Battle Royale's sixteen are open.
const MATCH_CLIENTS = 2;
// Battle Royale: its scene and the background page that goes under the clients
export const BATTLE_SCENE = "TRC BR";
const BATTLE_BACK_INPUT = "BR fondo";
const BATTLE_GAP = 6;
// the BR's captures, apart from the match scene's "osu! 1"...: building one
// scene never rebinds or moves the other's sources
const BATTLE_INPUT_PREFIX = "BR osu! ";
const BATTLE_MODE_KEY = "rempalago-obs-battle";

// The Battle Royale grid: one tile per player, rounded up to an even number
// (2 to 16), filling the clients' band (x 0, y 100, 1920x720) as much as it
// can. osu!'s playfield is 4:3 in the middle of a 16:9 window, so a tile may
// be anywhere from 16:9 down to 4:3: the window's empty sides are cropped
// away and the playfield gets bigger (1v1: two 957x718 tiles instead of
// 957x538). Rows and columns are whichever shape gives the biggest playfield;
// a full grid wins when its playfield is nearly as big.
export function battleGrid(players: number, box = { x: 0, y: 100, width: 1920, height: 720 }, gap = BATTLE_GAP) {
	const count = Math.min(16, Math.max(2, Math.ceil(players / 2) * 2));
	const shapes = Array.from({ length: count }, (_, i) => {
		const cols = i + 1;
		const rows = Math.ceil(count / cols);
		const cellW = (box.width - gap * (cols - 1)) / cols;
		const cellH = (box.height - gap * (rows - 1)) / rows;
		// no taller than 4:3 (that would crop the playfield), no wider than 16:9
		const h = Math.floor(Math.min(cellH, (cellW * 3) / 4));
		const w = Math.floor(Math.min(cellW, (h * 16) / 9));
		return { cols, rows, w, h, full: cols * rows === count };
	});
	const biggest = shapes.reduce((a, b) => (b.h > a.h ? b : a));
	const full = shapes.filter((x) => x.full).reduce((a, b) => (b.h > a.h ? b : a));
	const best = full.h >= biggest.h * 0.88 ? full : biggest;
	const gridW = best.cols * best.w + gap * (best.cols - 1);
	const gridH = best.rows * best.h + gap * (best.rows - 1);
	const left = box.x + (box.width - gridW) / 2;
	const top = box.y + (box.height - gridH) / 2;
	const rects = Array.from({ length: count }, (_, i) => {
		const row = Math.floor(i / best.cols);
		// a short last row is centred too
		const inRow = row === best.rows - 1 ? count - row * best.cols : best.cols;
		const rowLeft = left + ((best.cols - inRow) * (best.w + gap)) / 2;
		return { x: Math.round(rowLeft + (i % best.cols) * (best.w + gap)), y: Math.round(top + row * (best.h + gap)), width: best.w, height: best.h };
	});
	return { count, cols: best.cols, rows: best.rows, rects };
}

// A capture covering its tile: scaled to fill it, the overflow cropped
// evenly (the window's empty sides, around the playfield). Without the
// window's size yet (not hooked), fitted inside the tile instead.
function coverTransform(rect: { x: number; y: number; width: number; height: number }, source: { width: number; height: number }): Record<string, string | number> {
	if (!(source.width > 0 && source.height > 0))
		return { positionX: rect.x, positionY: rect.y, alignment: 5, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsAlignment: 0, boundsWidth: rect.width, boundsHeight: rect.height, cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 };
	const scale = Math.max(rect.width / source.width, rect.height / source.height);
	const cropX = Math.max(0, Math.floor((source.width - rect.width / scale) / 2));
	const cropY = Math.max(0, Math.floor((source.height - rect.height / scale) / 2));
	return { positionX: rect.x, positionY: rect.y, alignment: 5, boundsType: "OBS_BOUNDS_NONE", scaleX: scale, scaleY: scale, cropLeft: cropX, cropRight: cropX, cropTop: cropY, cropBottom: cropY };
}

interface OsuWindow {
	// OBS's window id, "title:class:exe" with ':' written as "#3A"
	value: string;
	title: string;
	exe: string;
	// the tournament client's number, from a title like "Tournament Client 0"
	client: number | null;
	manager: boolean;
}

const decode = (text: string) => text.replace(/#3A/g, ":").replace(/#22/g, "#");

function parseWindow(value: string): OsuWindow | null {
	const [title, , exe] = value.split(":").map(decode);
	if (!title || !exe) return null;
	const client = title.match(/client\s*#?(\d+)/i);
	return { value, title, exe, client: client ? Number(client[1]) : null, manager: /manager/i.test(title) };
}

const captureSettings = (win: OsuWindow, priority: number) => ({ capture_mode: "window", window: win.value, priority, capture_cursor: false, hook_rate: HOOK_RATE_FASTEST });

export interface OBSHandlerConfig {
	url?: string;
	password?: string;
	sceneName?: string;
	sourceNamePattern?: string; // e.g. "osu! {i}" or "Client {i}" or "osu!_{i}"
	layoutMode?: TilingLayoutMode;
	container?: Rect;
	gap?: number;
	keepAspectRatio?: boolean;
	autoTile?: boolean;
}

export interface ClientSlotState {
	index: number;
	name: string;
	team: string;
	isActive: boolean;
}

export default class OBSHandler {
	obs: OBSWebSocket;
	engine?: ZEngine;
	connected = false;

	config: Required<OBSHandlerConfig> = {
		url: "ws://127.0.0.1:4455",
		password: "",
		sceneName: "osu! rempalago",
		sourceNamePattern: "osu! {i}",
		layoutMode: "dwindle",
		container: { x: 0, y: 100, width: 1920, height: 720 },
		gap: 8,
		keepAspectRatio: false,
		// Opening or closing a client never moves the match scene by itself;
		// "Acomodar ahora" or building the scene does.
		autoTile: false,
	};

	clientStates: Map<number, ClientSlotState> = new Map();
	// Called with the program scene's name on connect and on every change.
	private programSceneListeners: ((sceneName: string) => void)[] = [];
	private activeSceneItemIdMap: Map<number, number> = new Map(); // clientIndex -> sceneItemId

	constructor(engine?: ZEngine, config?: Partial<OBSHandlerConfig>) {
		this.obs = new OBSWebSocket();
		this.engine = engine;
		if (config) {
			this.config = { ...this.config, ...config };
		}

		this.setupEventListeners();
		this.bindUI();
		if (engine) {
			this.bindZEngine(engine);
		}
	}

	private bindUI() {
		if (typeof document === "undefined") return;

		const connectBtn = document.querySelector<HTMLButtonElement>("#obsConnectBtn");
		const applyBtn = document.querySelector<HTMLButtonElement>("#obsApplyBtn");
		const autoSetupBtn = document.querySelector<HTMLButtonElement>("#obsAutoSetupBtn");
		const urlInput = document.querySelector<HTMLInputElement>("#obsUrl");
		const passInput = document.querySelector<HTMLInputElement>("#obsPassword");
		const sceneInput = document.querySelector<HTMLInputElement>("#obsSceneName");
		const modeSelect = document.querySelector<HTMLSelectElement>("#obsLayoutMode");
		const gapInput = document.querySelector<HTMLInputElement>("#obsGap");
		const autoTileCheckbox = document.querySelector<HTMLInputElement>("#obsAutoTile");
		const setupStatus = document.querySelector<HTMLElement>("#obsSetupStatus");

		if (connectBtn) {
			connectBtn.onclick = () => {
				if (this.connected) {
					this.disconnect();
				} else {
					const url = urlInput?.value || this.config.url;
					const pass = passInput?.value || this.config.password;
					this.connect(url, pass);
				}
			};
		}

		const showcaseBtn = document.querySelector<HTMLButtonElement>("#obsShowcaseBtn");
		const showcaseInput = document.querySelector<HTMLInputElement>("#obsShowcaseName");
		// One setup at a time; the status says what happened, or what to do.
		const runSetup = async (button: HTMLButtonElement, label: string, setup: () => Promise<{ success: boolean; message: string }>) => {
			const buttons = [autoSetupBtn, showcaseBtn].filter(Boolean) as HTMLButtonElement[];
			for (const b of buttons) b.disabled = true;
			const text = button.textContent;
			button.textContent = label;
			if (setupStatus) {
				setupStatus.textContent = t.obsSearching;
				setupStatus.dataset.busy = "";
				delete setupStatus.dataset.ok;
			}
			const res = await setup();
			for (const b of buttons) b.disabled = false;
			button.textContent = text;
			if (setupStatus) {
				delete setupStatus.dataset.busy;
				setupStatus.textContent = res.message;
				setupStatus.dataset.ok = String(res.success);
			}
		};
		if (autoSetupBtn) {
			autoSetupBtn.onclick = () =>
				runSetup(autoSetupBtn, t.obsBuilding, () => this.autoSetupScene(sceneInput?.value.trim() || this.config.sceneName || "osu! rempalago"));
		}
		if (showcaseBtn) {
			showcaseBtn.onclick = () => runSetup(showcaseBtn, t.obsBuilding, () => this.autoSetupShowcase(showcaseInput?.value.trim() || this.showcaseScene));
		}
		if (showcaseInput) {
			showcaseInput.onchange = () => {
				this.showcaseScene = showcaseInput.value.trim() || "Showcase";
			};
		}

		if (applyBtn) {
			applyBtn.onclick = () => {
				this.refreshAndApply();
			};
		}

		if (sceneInput) {
			sceneInput.onchange = () => {
				this.config.sceneName = sceneInput.value.trim();
			};
		}

		if (modeSelect) {
			modeSelect.onchange = () => {
				this.setLayoutMode(modeSelect.value as TilingLayoutMode);
			};
		}

		if (gapInput) {
			gapInput.onchange = () => {
				this.setGap(Number(gapInput.value) || 8);
			};
		}

		if (autoTileCheckbox) {
			autoTileCheckbox.onchange = () => {
				this.config.autoTile = autoTileCheckbox.checked;
			};
		}
	}

	private updateUIStatus() {
		if (typeof document === "undefined") return;

		const dot = document.querySelector<HTMLElement>("#obsStatusDot");
		const btn = document.querySelector<HTMLButtonElement>("#obsConnectBtn");

		if (dot) {
			dot.dataset.on = String(this.connected);
			dot.title = this.connected ? t.obsDotOn : t.obsDotOff;
		}

		if (btn) {
			btn.textContent = this.connected ? t.obsDisconnect : t.obsConnect;
		}
	}

	private setupEventListeners() {
		this.obs.on("Identified", async () => {
			this.connected = true;
			this.updateUIStatus();
			this.log("Connected and Identified with OBS WebSocket");
			await this.sync();
			this.startSync();
			try {
				const { currentProgramSceneName } = await this.obs.call("GetCurrentProgramScene");
				this.emitProgramScene(currentProgramSceneName);
			} catch (err) {
				console.warn("[OBSHandler] Could not read the program scene:", err);
			}
		});

		this.obs.on("ConnectionClosed", () => {
			this.connected = false;
			this.stopSync();
			this.updateUIStatus();
			this.log("Disconnected from OBS WebSocket");
		});

		this.obs.on("CurrentProgramSceneChanged", (data) => {
			if (data.sceneName === BATTLE_SCENE) this.setBattleMode(true);
			else if (data.sceneName === this.config.sceneName) this.setBattleMode(false);
			this.emitProgramScene(data.sceneName);
			if (!this.config.sceneName) {
				this.log(`Active scene changed to: ${data.sceneName}`);
				this.refreshAndApply();
			}
		});
	}

	onProgramScene(listener: (sceneName: string) => void) {
		this.programSceneListeners.push(listener);
	}

	private emitProgramScene(sceneName: string) {
		for (const listener of this.programSceneListeners) listener(sceneName);
	}

	/**
	 * Connect to OBS Studio WebSocket server.
	 */
	async connect(url = this.config.url, password = this.config.password): Promise<boolean> {
		this.config.url = url;
		this.config.password = password;

		try {
			await this.obs.connect(url, password || undefined);
			return true;
		} catch (err) {
			console.warn("[OBSHandler] Failed to connect to OBS WebSocket:", err);
			this.connected = false;
			return false;
		}
	}

	/**
	 * Disconnect from OBS.
	 */
	async disconnect() {
		if (this.connected) {
			await this.obs.disconnect();
		}
	}

	/**
	 * Binds listeners to tosu ZEngine to track player/client active states.
	 */
	private bindZEngine(engine: ZEngine) {
		// Listen for client length
		engine.register("tourney.ipcClients.length", (_, length: number) => {
			const changed = (Number(length) || 0) !== this.tourneyClients;
			this.tourneyClients = Number(length) || 0;
			if (changed) this.sync(true);
			for (let i = 0; i < length; i++) {
				if (!this.clientStates.has(i)) {
					this.registerClient(i);
				}
			}
		});

		// Check initial 16 potential clients
		for (let i = 0; i < 16; i++) {
			this.registerClient(i);
		}
	}

	private registerClient(idx: number) {
		const state: ClientSlotState = {
			index: idx,
			name: "",
			team: "",
			isActive: false,
		};
		this.clientStates.set(idx, state);

		if (!this.engine) return;

		this.engine.register(`tourney.ipcClients.${idx}.gameplay.name`, (_, name: string) => {
			const current = this.clientStates.get(idx);
			if (current) {
				const wasActive = current.isActive;
				current.name = name ?? "";
				current.isActive = Boolean(name && name.trim().length > 0);

				if (wasActive !== current.isActive && this.config.autoTile) {
					this.applyLayout();
				}
			}
		});

		this.engine.register(`tourney.ipcClients.${idx}.team`, (_, team: string) => {
			const current = this.clientStates.get(idx);
			if (current) {
				current.team = team ?? "";
			}
		});
	}

	/**
	 * Gets the current scene name to operate on.
	 */
	private async getTargetSceneName(): Promise<string> {
		if (this.config.sceneName) return this.config.sceneName;

		try {
			const currentScene = await this.obs.call("GetCurrentProgramScene");
			return currentScene.currentProgramSceneName;
		} catch (err) {
			console.error("[OBSHandler] Could not get current program scene:", err);
			return "";
		}
	}

	/**
	 * Scans the current scene for scene items matching client pattern (e.g. 'osu! 1', 'osu! 2' or 'Client 1').
	 */
	async discoverSceneItems(sceneName: string): Promise<Map<number, number>> {
		const mapping = new Map<number, number>();
		try {
			const { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName });

			for (const item of sceneItems) {
				const itemName = (item.sourceName as string).trim().toLowerCase();

				// Try multiple common naming patterns:
				// Pattern 1: User configured pattern e.g. "osu! 1" -> matches {i}
				// Pattern 2: "osu! {i}", "osu {i}", "client {i}", "player {i}", "c{i}"
				for (let i = 0; i < 16; i++) {
					const idx1Based = (i + 1).toString();
					const idx0Based = i.toString();

					const configured1 = this.config.sourceNamePattern
						.replace("{i}", idx1Based)
						.toLowerCase();
					const configured0 = this.config.sourceNamePattern
						.replace("{i}", idx0Based)
						.toLowerCase();

					const patterns = [
						configured1,
						configured0,
						`osu! ${idx1Based}`,
						`osu! ${idx0Based}`,
						`osu!_${idx1Based}`,
						`osu ${idx1Based}`,
						`client ${idx1Based}`,
						`client_${idx1Based}`,
						`player ${idx1Based}`,
					];

					if (patterns.includes(itemName)) {
						mapping.set(i, item.sceneItemId as number);
						break;
					}
				}
			}
		} catch (err) {
			console.error("[OBSHandler] Failed to get scene items:", err);
		}

		return mapping;
	}

	/**
	 * Refreshes scene item references and applies the tiling layout.
	 */
	async refreshAndApply() {
		if (!this.connected) return;

		const targetScene = await this.getTargetSceneName();
		if (!targetScene) return;

		this.activeSceneItemIdMap = await this.discoverSceneItems(targetScene);
		await this.applyLayout();
	}

	/**
	 * Computes dynamic tiling transforms and updates OBS scene items.
	 */
	async applyLayout() {
		if (!this.connected || this.battleMode) return;

		const targetScene = await this.getTargetSceneName();
		if (!targetScene) return;

		if (this.activeSceneItemIdMap.size === 0) {
			this.activeSceneItemIdMap = await this.discoverSceneItems(targetScene);
		}

		// Determine active clients
		const activeClients: number[] = [];
		const inactiveClients: number[] = [];

		// If no clients tracked yet from ZEngine, treat all mapped scene items as active
		const hasTelemetry = Array.from(this.clientStates.values()).some((c) => c.name.length > 0);

		for (const clientIdx of this.activeSceneItemIdMap.keys()) {
			if (clientIdx >= MATCH_CLIENTS) {
				inactiveClients.push(clientIdx);
			} else if (!this.windowed.has(clientIdx)) {
				inactiveClients.push(clientIdx);
			} else if (!hasTelemetry) {
				activeClients.push(clientIdx);
			} else {
				const state = this.clientStates.get(clientIdx);
				if (state && state.isActive) {
					activeClients.push(clientIdx);
				} else {
					inactiveClients.push(clientIdx);
				}
			}
		}

		// Sort active clients in deterministic order
		activeClients.sort((a, b) => a - b);

		// Calculate tiling rectangles
		const tilingOptions: TilingOptions = {
			container: this.config.container,
			gap: this.config.gap,
			keepAspectRatio: this.config.keepAspectRatio,
			aspectRatio: 16 / 9,
		};

		const rects = TilingEngine.calculateLayout(
			activeClients.length,
			this.config.layoutMode,
			tilingOptions,
		);

		// 1. Hide inactive clients
		for (const inactiveIdx of inactiveClients) {
			const sceneItemId = this.activeSceneItemIdMap.get(inactiveIdx);
			if (sceneItemId) {
				try {
					await this.obs.call("SetSceneItemEnabled", {
						sceneName: targetScene,
						sceneItemId,
						sceneItemEnabled: false,
					});
				} catch (err) {
					console.warn(`[OBSHandler] Could not disable item ${sceneItemId}:`, err);
				}
			}
		}

		// 2. Position and show active clients
		for (let i = 0; i < activeClients.length; i++) {
			const clientIdx = activeClients[i];
			const rect = rects[i];
			const sceneItemId = this.activeSceneItemIdMap.get(clientIdx);

			if (!sceneItemId || !rect) continue;

			try {
				// Enable item
				await this.obs.call("SetSceneItemEnabled", {
					sceneName: targetScene,
					sceneItemId,
					sceneItemEnabled: true,
				});

				// Set transform with bounded box (OBS scales source contents automatically)
				await this.obs.call("SetSceneItemTransform", {
					sceneName: targetScene,
					sceneItemId,
					sceneItemTransform: {
						positionX: rect.x,
						positionY: rect.y,
						boundsType: "OBS_BOUNDS_STRETCH", // Fits cleanly in the computed box
						boundsWidth: rect.width,
						boundsHeight: rect.height,
						alignment: 5, // Top-Left alignment in OBS
					},
				});
			} catch (err) {
				console.warn(`[OBSHandler] Failed to transform item ${sceneItemId}:`, err);
			}
		}

		this.log(`Applied ${this.config.layoutMode} layout for ${activeClients.length} clients`);
	}

	setLayoutMode(mode: TilingLayoutMode) {
		this.config.layoutMode = mode;
		if (this.config.autoTile) {
			this.applyLayout();
		}
	}

	setGap(gap: number) {
		this.config.gap = gap;
		if (this.config.autoTile) {
			this.applyLayout();
		}
	}

	// ---------- scene setup: gameplay and showcase ----------
	// Windows only (OBS's game_capture). Captures exist only for osu!
	// windows that are open, and follow them: sync() runs on connect, when
	// tosu's client count changes and every few seconds, showing a capture
	// when its window opens and hiding it when it closes.

	// The overlay's URL for a new browser source; the panel sets it (the
	// overlay sits next to panel.html, with the round in the query).
	overlayUrl = () => "http://127.0.0.1:24050/vcl-overlay/";
	showcaseScene = "Showcase";

	private windowed = new Set<number>();
	// The Battle Royale is on (its scene built or on air): the match scene's
	// sync and tiling stay still, so the BR's sixteen clients never land in
	// it. Building the match scene, or putting it on air, turns it off.
	private battleMode = (() => {
		try {
			return localStorage.getItem(BATTLE_MODE_KEY) === "1";
		} catch {
			return false;
		}
	})();

	private setBattleMode(on: boolean) {
		if (on === this.battleMode) return;
		this.battleMode = on;
		try {
			localStorage.setItem(BATTLE_MODE_KEY, on ? "1" : "0");
		} catch {}
		this.log(`Battle Royale mode ${on ? "on" : "off"}`);
	}
	private tourneyClients = 0;
	private syncTimer = 0;
	private syncing = false;

	private async inputNames() {
		const { inputs } = await this.obs.call("GetInputList");
		return new Map(inputs.map((i) => [i.inputName as string, i.inputKind as string]));
	}

	private async sceneExists(sceneName: string) {
		const { scenes } = await this.obs.call("GetSceneList");
		return scenes.some((s) => s.sceneName === sceneName);
	}

	// Every osu! window OBS can see, from the window list of a capture that
	// already exists; with none, from a throwaway capture made for the asking.
	private async listOsuWindows(probeScene?: string): Promise<OsuWindow[]> {
		const inputs = await this.inputNames();
		let probe = [...inputs].find(([, kind]) => kind === CAPTURE_KIND || kind === OLD_CAPTURE_KIND)?.[0];
		let temporary = false;
		if (!probe) {
			if (!probeScene) return [];
			probe = PROBE_INPUT;
			await this.obs.call("CreateInput", { sceneName: probeScene, inputName: probe, inputKind: CAPTURE_KIND, inputSettings: {}, sceneItemEnabled: false });
			temporary = true;
		}
		try {
			const { propertyItems } = await this.obs.call("GetInputPropertiesListPropertyItems", { inputName: probe, propertyName: "window" });
			return (propertyItems as { itemValue?: string }[]).flatMap(({ itemValue }) => {
				const win = parseWindow(itemValue ?? "");
				return win && win.exe.toLowerCase() === "osu!.exe" ? [win] : [];
			});
		} finally {
			if (temporary) await this.obs.call("RemoveInput", { inputName: probe });
		}
	}

	// The tournament clients, in client order. Their windows are named after
	// the client ("Tournament Client 0"...); if they are not, and tosu says a
	// tournament is on, every osu! window but the manager counts.
	private tourneyWindows(windows: OsuWindow[]) {
		const numbered = windows.filter((w) => w.client !== null).sort((a, b) => a.client! - b.client!);
		if (numbered.length) return numbered;
		return this.tourneyClients ? windows.filter((w) => !w.manager) : [];
	}

	// The osu! that plays the showcase replay: any osu! window that is not a
	// tournament client or the manager.
	private replayWindow(windows: OsuWindow[]) {
		const tourney = new Set(this.tourneyWindows(windows));
		return windows.find((w) => !w.manager && !tourney.has(w)) ?? null;
	}

	// One capture per open client ("osu! 1" for client 0...), each locked to
	// its window's title so it never wanders onto another client.
	// The scene must exist (the setup button makes it); in it, a client that
	// opens gets its capture and one that closes is hidden.
	private async syncGameplay(windows: OsuWindow[], tile: boolean) {
		const sceneName = this.config.sceneName;
		if (!sceneName || !(await this.sceneExists(sceneName))) return 0;
		const clients = this.tourneyWindows(windows).slice(0, MATCH_CLIENTS);
		const inputs = await this.inputNames();
		const { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName });
		const inScene = new Set(sceneItems.map((si) => si.sourceName as string));
		// captures past the two (an older version made one per client): hidden
		for (const si of sceneItems) {
			const m = /^osu! (\d+)$/.exec(String(si.sourceName));
			if (m && Number(m[1]) > MATCH_CLIENTS && si.sceneItemEnabled) await this.obs.call("SetSceneItemEnabled", { sceneName, sceneItemId: si.sceneItemId as number, sceneItemEnabled: false });
		}
		const before = [...this.windowed].join();
		let added = false;
		this.windowed.clear();
		for (const [i, win] of clients.entries()) {
			const name = `osu! ${i + 1}`;
			await this.retireWindowCapture(inputs, name);
			if (!inputs.has(name)) {
				await this.obs.call("CreateInput", { sceneName, inputName: name, inputKind: CAPTURE_KIND, inputSettings: captureSettings(win, WINDOW_PRIORITY_TITLE) });
				added = true;
			} else {
				await this.bindCapture(name, win, WINDOW_PRIORITY_TITLE);
				if (!inScene.has(name)) {
					await this.obs.call("CreateSceneItem", { sceneName, sourceName: name });
					added = true;
				}
			}
			this.windowed.add(i);
		}
		// a new capture lands on top: the overlay goes back above it
		if (added) await this.ensureOverlay(sceneName);
		// Placed only when asked (the setup button) or when a capture was just
		// made; a client opening or closing leaves everything where it is.
		if (tile || added || (this.config.autoTile && before !== [...this.windowed].join())) {
			this.activeSceneItemIdMap = await this.discoverSceneItems(sceneName);
			await this.applyLayout();
		}
		return clients.length;
	}

	// The replay capture at the showcase's window (x 40, y 40, 1280x720),
	// scaled to fit without stretching. It follows osu! when it reopens.
	// Placed when it is created or added; afterwards only by the setup
	// button (place), so a hand adjustment is not undone every few seconds.
	private async syncShowcase(windows: OsuWindow[], place: boolean) {
		const sceneName = this.showcaseScene;
		if (!(await this.sceneExists(sceneName))) return null;
		const win = this.replayWindow(windows);
		if (!win) return null;
		const inputs = await this.inputNames();
		await this.retireWindowCapture(inputs, REPLAY_INPUT);
		if (!inputs.has(REPLAY_INPUT)) {
			const { sceneItemId } = await this.obs.call("CreateInput", { sceneName, inputName: REPLAY_INPUT, inputKind: CAPTURE_KIND, inputSettings: captureSettings(win, WINDOW_PRIORITY_EXE) });
			await this.placeReplay(sceneName, sceneItemId);
			await this.ensureOverlay(sceneName);
			return win;
		}
		const { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName });
		const item = sceneItems.find((si) => si.sourceName === REPLAY_INPUT);
		// the replay's title changes with every map; a hooked capture has its window
		const hooked = Number((item?.sceneItemTransform as { sourceWidth?: number } | undefined)?.sourceWidth) > 0;
		await this.bindCapture(REPLAY_INPUT, win, WINDOW_PRIORITY_EXE, hooked);
		if (!item) {
			await this.placeReplay(sceneName, (await this.obs.call("CreateSceneItem", { sceneName, sourceName: REPLAY_INPUT })).sceneItemId);
			await this.ensureOverlay(sceneName);
		}
		else if (place) await this.placeReplay(sceneName, item.sceneItemId as number);
		return win;
	}

	private async placeReplay(sceneName: string, sceneItemId: number) {
		await this.obs.call("SetSceneItemTransform", {
			sceneName,
			sceneItemId,
			sceneItemTransform: { positionX: 40, positionY: 40, alignment: 5, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsAlignment: 0, boundsWidth: 1280, boundsHeight: 720 },
		});
	}

	// Points an existing capture at a window, only when it changed (a new
	// window makes OBS drop the hook and find it again, a visible blink).
	private async bindCapture(inputName: string, win: OsuWindow, priority: number, hooked = false) {
		const { inputSettings } = await this.obs.call("GetInputSettings", { inputName });
		const set = inputSettings.capture_mode === "window" && inputSettings.priority === priority;
		if (set && (hooked || inputSettings.window === win.value)) return;
		await this.obs.call("SetInputSettings", { inputName, inputSettings: captureSettings(win, priority) });
	}

	// A source can't change kind, so a window capture from an earlier version
	// makes way for a game capture. Renamed first: OBS may hold on to the name
	// for a moment after removing it.
	private async retireWindowCapture(inputs: Map<string, string>, inputName: string) {
		if (inputs.get(inputName) !== OLD_CAPTURE_KIND) return;
		const retired = `${inputName} (${Date.now()})`;
		await this.obs.call("SetInputName", { inputName, newInputName: retired });
		await this.obs.call("RemoveInput", { inputName: retired });
		inputs.delete(inputName);
	}

	// The overlay goes on top of the captures. An overlay browser source that
	// already exists is reused (one source shared by every scene keeps its
	// state); one is created only when there is none. The panel's own page is
	// never taken for it.
	private async ensureOverlay(sceneName: string) {
		const inputs = await this.inputNames();
		let overlay: string | null = null;
		for (const [name, kind] of inputs) {
			if (kind !== "browser_source") continue;
			const { inputSettings } = await this.obs.call("GetInputSettings", { inputName: name });
			const url = String(inputSettings.url ?? "");
			if (/vcl-overlay/i.test(url) && !/panel\.html/i.test(url)) {
				overlay = name;
				break;
			}
		}
		let { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName });
		let item = overlay ? sceneItems.find((si) => si.sourceName === overlay) : undefined;
		if (!overlay) {
			overlay = inputs.has(OVERLAY_INPUT) ? `${OVERLAY_INPUT} (Rempalago)` : OVERLAY_INPUT;
			await this.obs.call("CreateInput", {
				sceneName,
				inputName: overlay,
				inputKind: "browser_source",
				inputSettings: { url: this.overlayUrl(), width: 1920, height: 1080, fps: 60, reroute_audio: false, restart_when_active: false, shutdown: false },
			});
		} else if (!item) {
			await this.obs.call("CreateSceneItem", { sceneName, sourceName: overlay });
		}
		({ sceneItems } = await this.obs.call("GetSceneItemList", { sceneName }));
		item = sceneItems.find((si) => si.sourceName === overlay);
		if (item) {
			await this.obs.call("SetSceneItemTransform", {
				sceneName,
				sceneItemId: item.sceneItemId as number,
				sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: "OBS_BOUNDS_NONE", scaleX: 1, scaleY: 1 },
			});
			await this.obs.call("SetSceneItemIndex", { sceneName, sceneItemId: item.sceneItemId as number, sceneItemIndex: sceneItems.length - 1 });
		}
		return overlay;
	}

	private async ensureScene(sceneName: string) {
		if (!(await this.sceneExists(sceneName))) await this.obs.call("CreateScene", { sceneName });
	}

	private async ready(): Promise<string | null> {
		if (!this.connected && !(await this.connect())) return t.obsCantConnect(this.config.url);
		const { inputKinds } = await this.obs.call("GetInputKindList");
		if (!inputKinds.includes(CAPTURE_KIND)) return t.obsNoCapture;
		if (!inputKinds.includes("browser_source")) return t.obsNoBrowser;
		return null;
	}

	// Builds (or fixes) the gameplay scene: the open tournament clients
	// tiled into the client band, the overlay on top. The scene on air is
	// left alone.
	async autoSetupScene(sceneName = this.config.sceneName || "osu! rempalago"): Promise<{ success: boolean; message: string }> {
		try {
			const problem = await this.ready();
			if (problem) return { success: false, message: problem };
			this.config.sceneName = sceneName;
			this.setBattleMode(false);
			await this.ensureScene(sceneName);
			const windows = await this.listOsuWindows(sceneName);
			const count = await this.syncGameplay(windows, true);
			const overlay = await this.ensureOverlay(sceneName);
			this.startSync();
			if (!count)
				return {
					success: false,
					message: t.obsNoClients(sceneName, overlay),
				};
			return { success: true, message: t.obsGameplayDone(sceneName, count, overlay) };
		} catch (err) {
			console.error("[OBSHandler] autoSetupScene error:", err);
			return { success: false, message: t.obsSetupFailed(String((err as Error).message || err)) };
		}
	}

	// Builds (or fixes) the showcase scene: the osu! playing the replay in the
	// showcase's window, the overlay on top.
	async autoSetupShowcase(sceneName = this.showcaseScene): Promise<{ success: boolean; message: string }> {
		try {
			const problem = await this.ready();
			if (problem) return { success: false, message: problem };
			this.showcaseScene = sceneName;
			await this.ensureScene(sceneName);
			const windows = await this.listOsuWindows(sceneName);
			const win = await this.syncShowcase(windows, true);
			const overlay = await this.ensureOverlay(sceneName);
			this.startSync();
			if (!win)
				return {
					success: false,
					message: t.obsNoReplayClient(sceneName, overlay),
				};
			return { success: true, message: t.obsShowcaseDone(sceneName, win.title, overlay) };
		} catch (err) {
			console.error("[OBSHandler] autoSetupShowcase error:", err);
			return { success: false, message: t.obsSetupFailed(String((err as Error).message || err)) };
		}
	}

	// Builds (or rebuilds) the Battle Royale scene, "TRC BR": the background
	// page at the bottom, the tournament clients on a grid for the players in
	// the lobby (an even number of tiles), the overlay on top. Each client is
	// the same capture as in the match's scene ("osu! 1"...), placed again
	// here; clients past the grid are hidden. The scene on air is left alone.
	async autoSetupBattle(players: number, sceneName = BATTLE_SCENE): Promise<{ success: boolean; message: string }> {
		try {
			const problem = await this.ready();
			if (problem) return { success: false, message: problem };
			this.setBattleMode(true);
			await this.ensureScene(sceneName);
			const { clients, grid } = await this.placeBattleClients(sceneName, players);
			const inputs = await this.inputNames();
			const { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName });
			const itemOf = (name: string) => sceneItems.find((si) => si.sourceName === name)?.sceneItemId as number | undefined;
			// the background page under everything
			const backUrl = new URL("br-fondo.html", this.overlayUrl()).href;
			let backId = itemOf(BATTLE_BACK_INPUT);
			if (!inputs.has(BATTLE_BACK_INPUT)) {
				backId = (
					await this.obs.call("CreateInput", {
						sceneName,
						inputName: BATTLE_BACK_INPUT,
						inputKind: "browser_source",
						inputSettings: { url: backUrl, width: 1920, height: 1080, fps: 30, reroute_audio: false, restart_when_active: false, shutdown: false },
					})
				).sceneItemId;
			} else {
				await this.obs.call("SetInputSettings", { inputName: BATTLE_BACK_INPUT, inputSettings: { url: backUrl, width: 1920, height: 1080 } });
				if (backId === undefined) backId = (await this.obs.call("CreateSceneItem", { sceneName, sourceName: BATTLE_BACK_INPUT })).sceneItemId;
			}
			await this.obs.call("SetSceneItemTransform", { sceneName, sceneItemId: backId, sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: "OBS_BOUNDS_NONE", scaleX: 1, scaleY: 1 } });
			await this.obs.call("SetSceneItemIndex", { sceneName, sceneItemId: backId, sceneItemIndex: 0 });
			const overlay = await this.ensureOverlay(sceneName);
			if (!clients.length) return { success: false, message: t.obsBattleNoClients(sceneName, overlay) };
			return { success: true, message: t.obsBattleDone(sceneName, Math.min(clients.length, grid.count), grid.count, `${grid.cols}×${grid.rows}`, overlay) };
		} catch (err) {
			console.error("[OBSHandler] autoSetupBattle error:", err);
			return { success: false, message: t.obsSetupFailed(String((err as Error).message || err)) };
		}
	}

	// Only the clients, in a TRC BR scene already built: for after the
	// tourney client restarts (new windows) or the room changes size.
	async arrangeBattle(players: number, sceneName = BATTLE_SCENE): Promise<{ success: boolean; message: string }> {
		try {
			const problem = await this.ready();
			if (problem) return { success: false, message: problem };
			if (!(await this.sceneExists(sceneName))) return { success: false, message: t.obsBattleNoScene(sceneName) };
			this.setBattleMode(true);
			const { clients, grid } = await this.placeBattleClients(sceneName, players);
			// new captures land on top: the overlay goes back above them
			await this.ensureOverlay(sceneName);
			if (!clients.length) return { success: false, message: t.obsBattleNoClientsArrange };
			return { success: true, message: t.obsBattleArranged(Math.min(clients.length, grid.count), grid.count, `${grid.cols}×${grid.rows}`) };
		} catch (err) {
			console.error("[OBSHandler] arrangeBattle error:", err);
			return { success: false, message: t.obsSetupFailed(String((err as Error).message || err)) };
		}
	}

	async hasBattleScene(sceneName = BATTLE_SCENE) {
		return this.connected && (await this.sceneExists(sceneName).catch(() => false));
	}

	// Every open tournament client on the grid for the players in the room;
	// the ones past the grid hidden. Each is the match scene's own capture
	// ("osu! 1"...), placed again here.
	private async placeBattleClients(sceneName: string, players: number) {
		const windows = await this.listOsuWindows(sceneName);
		const clients = this.tourneyWindows(windows);
		const grid = battleGrid(players || clients.length);
		const inputs = await this.inputNames();
		const { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName });
		const itemOf = (name: string) => sceneItems.find((si) => si.sourceName === name)?.sceneItemId as number | undefined;
		for (const [i, win] of clients.entries()) {
			const name = `${BATTLE_INPUT_PREFIX}${i + 1}`;
			let id = itemOf(name);
			if (!inputs.has(name)) id = (await this.obs.call("CreateInput", { sceneName, inputName: name, inputKind: CAPTURE_KIND, inputSettings: captureSettings(win, WINDOW_PRIORITY_TITLE) })).sceneItemId;
			else {
				await this.bindCapture(name, win, WINDOW_PRIORITY_TITLE);
				if (id === undefined) id = (await this.obs.call("CreateSceneItem", { sceneName, sourceName: name })).sceneItemId;
			}
			const rect = grid.rects[i];
			await this.obs.call("SetSceneItemEnabled", { sceneName, sceneItemId: id, sceneItemEnabled: Boolean(rect) });
			if (!rect) continue;
			const { sceneItemTransform } = await this.obs.call("GetSceneItemTransform", { sceneName, sceneItemId: id });
			const t = sceneItemTransform as { sourceWidth?: number; sourceHeight?: number };
			await this.obs.call("SetSceneItemTransform", {
				sceneName,
				sceneItemId: id,
				sceneItemTransform: coverTransform(rect, { width: Number(t.sourceWidth) || 0, height: Number(t.sourceHeight) || 0 }),
			});
		}
		// clients that closed, and the match's own captures if an older
		// version put them here: off the grid
		for (const si of sceneItems) {
			const name = String(si.sourceName);
			const mine = name.startsWith(BATTLE_INPUT_PREFIX) ? Number(name.slice(BATTLE_INPUT_PREFIX.length)) : null;
			if ((mine !== null && mine > clients.length) || /^osu! \d+$/.test(name)) await this.obs.call("SetSceneItemEnabled", { sceneName, sceneItemId: si.sceneItemId as number, sceneItemEnabled: false });
		}
		return { clients, grid };
	}

	// Keeps both scenes in step with the windows that are open. The window
	// list comes from a capture that exists; with none yet, only a change in
	// tosu's client count (probe) makes a throwaway one to look.
	async sync(probe = false) {
		if (!this.connected || this.syncing) return;
		this.syncing = true;
		try {
			const scene = this.config.sceneName;
			const windows = await this.listOsuWindows(probe && scene && (await this.sceneExists(scene)) ? scene : undefined);
			if (!this.battleMode) await this.syncGameplay(windows, false);
			await this.syncShowcase(windows, false);
		} catch (err) {
			console.warn("[OBSHandler] sync failed:", err);
		} finally {
			this.syncing = false;
		}
	}

	private startSync() {
		window.clearInterval(this.syncTimer);
		this.syncTimer = window.setInterval(() => this.sync(), SYNC_MS);
	}

	private stopSync() {
		window.clearInterval(this.syncTimer);
		this.syncTimer = 0;
	}

	private log(msg: string) {
		console.log(`[OBSHandler] ${msg}`);
	}
}
