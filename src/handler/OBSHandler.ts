import { OBSWebSocket } from "obs-websocket-js";
import type ZEngine from "@fukutotojido/z-engine";
import TilingEngine, {
	type Rect,
	type TilingLayoutMode,
	type TilingOptions,
} from "./TilingEngine";

// OBS window capture (win-capture): "priority" picks how a lost window is
// found again. TITLE: the title must match; EXE: the title, else any window
// of the same program.
const WINDOW_PRIORITY_TITLE = 1;
const WINDOW_PRIORITY_EXE = 2;
const SYNC_MS = 5000;
const PROBE_INPUT = "rempalago: buscando ventanas";
const REPLAY_INPUT = "osu! replay";
const OVERLAY_INPUT = "Overlay";

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

const captureSettings = (win: OsuWindow, priority: number) => ({ window: win.value, priority, cursor: false, client_area: true });

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
		autoTile: true,
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
				setupStatus.textContent = "Buscando ventanas de osu! y armando la escena…";
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
				runSetup(autoSetupBtn, "Armando…", () => this.autoSetupScene(sceneInput?.value.trim() || this.config.sceneName || "osu! rempalago"));
		}
		if (showcaseBtn) {
			showcaseBtn.onclick = () => runSetup(showcaseBtn, "Armando…", () => this.autoSetupShowcase(showcaseInput?.value.trim() || this.showcaseScene));
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
			dot.title = this.connected ? "Connected" : "Disconnected";
		}

		if (btn) {
			btn.textContent = this.connected ? "Desconectar de OBS" : "Conectar a OBS";
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
		if (!this.connected) return;

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
			if (!this.windowed.has(clientIdx)) {
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
	// Windows only (OBS's window_capture). Captures exist only for osu!
	// windows that are open, and follow them: sync() runs on connect, when
	// tosu's client count changes and every few seconds, showing a capture
	// when its window opens and hiding it when it closes.

	// The overlay's URL for a new browser source; the panel sets it (the
	// overlay sits next to panel.html, with the round in the query).
	overlayUrl = () => "http://127.0.0.1:24050/vcl-overlay/";
	showcaseScene = "Showcase";

	private windowed = new Set<number>();
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
		let probe = [...inputs].find(([, kind]) => kind === "window_capture")?.[0];
		let temporary = false;
		if (!probe) {
			if (!probeScene) return [];
			probe = PROBE_INPUT;
			await this.obs.call("CreateInput", { sceneName: probeScene, inputName: probe, inputKind: "window_capture", inputSettings: {}, sceneItemEnabled: false });
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
		const clients = this.tourneyWindows(windows);
		const inputs = await this.inputNames();
		const { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName });
		const inScene = new Set(sceneItems.map((si) => si.sourceName as string));
		const before = [...this.windowed].join();
		let added = false;
		this.windowed.clear();
		for (const [i, win] of clients.entries()) {
			const name = `osu! ${i + 1}`;
			if (!inputs.has(name)) {
				await this.obs.call("CreateInput", { sceneName, inputName: name, inputKind: "window_capture", inputSettings: captureSettings(win, WINDOW_PRIORITY_TITLE) });
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
		if (tile || added || before !== [...this.windowed].join()) {
			this.activeSceneItemIdMap = await this.discoverSceneItems(sceneName);
			if (tile || this.config.autoTile) await this.applyLayout();
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
		if (!inputs.has(REPLAY_INPUT)) {
			const { sceneItemId } = await this.obs.call("CreateInput", { sceneName, inputName: REPLAY_INPUT, inputKind: "window_capture", inputSettings: captureSettings(win, WINDOW_PRIORITY_EXE) });
			await this.placeReplay(sceneName, sceneItemId);
			await this.ensureOverlay(sceneName);
			return win;
		}
		await this.bindCapture(REPLAY_INPUT, win, WINDOW_PRIORITY_EXE);
		const { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName });
		const item = sceneItems.find((si) => si.sourceName === REPLAY_INPUT);
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

	// Points an existing capture at a window, only when it changed (setting
	// the same window again makes OBS re-hook it, a visible blink).
	private async bindCapture(inputName: string, win: OsuWindow, priority: number) {
		const { inputSettings } = await this.obs.call("GetInputSettings", { inputName });
		if (inputSettings.window === win.value && inputSettings.priority === priority) return;
		await this.obs.call("SetInputSettings", { inputName, inputSettings: captureSettings(win, priority) });
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
		if (!this.connected && !(await this.connect())) return `No se pudo conectar a OBS en ${this.config.url}. Revisa que OBS esté abierto y el servidor WebSocket activo.`;
		const { inputKinds } = await this.obs.call("GetInputKindList");
		if (!inputKinds.includes("window_capture")) return "Este OBS no tiene Captura de ventana; el armado automático necesita OBS en Windows.";
		if (!inputKinds.includes("browser_source")) return "Este OBS no tiene la fuente Navegador; reinstala OBS con el plugin de navegador.";
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
			await this.ensureScene(sceneName);
			const windows = await this.listOsuWindows(sceneName);
			const count = await this.syncGameplay(windows, true);
			const overlay = await this.ensureOverlay(sceneName);
			this.startSync();
			if (!count)
				return {
					success: false,
					message: `La escena "${sceneName}" quedó con el overlay ("${overlay}"), pero no encontré clientes de torneo abiertos. Abre el cliente de torneo: sus ventanas se agregan solas.`,
				};
			return { success: true, message: `Escena "${sceneName}": ${count} ${count === 1 ? "cliente" : "clientes"} de torneo acomodados y el overlay ("${overlay}") encima. Si abres o cierras clientes, se actualiza solo.` };
		} catch (err) {
			console.error("[OBSHandler] autoSetupScene error:", err);
			return { success: false, message: `No se pudo armar la escena: ${(err as Error).message || err}` };
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
					message: `La escena "${sceneName}" quedó con el overlay ("${overlay}"), pero no encontré un osu! abierto aparte del de torneo. Abre osu! (el que va a reproducir la replay): se acomoda solo.`,
				};
			return { success: true, message: `Escena "${sceneName}": "${win.title}" en el hueco de la replay y el overlay ("${overlay}") encima.` };
		} catch (err) {
			console.error("[OBSHandler] autoSetupShowcase error:", err);
			return { success: false, message: `No se pudo armar la escena: ${(err as Error).message || err}` };
		}
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
			await this.syncGameplay(windows, false);
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
