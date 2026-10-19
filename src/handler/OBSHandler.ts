import { OBSWebSocket } from "obs-websocket-js";
import type ZEngine from "@fukutotojido/z-engine";
import TilingEngine, {
	type Rect,
	type TilingLayoutMode,
	type TilingOptions,
} from "./TilingEngine";

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

		if (autoSetupBtn) {
			autoSetupBtn.onclick = async () => {
				if (setupStatus) setupStatus.textContent = "Configurando escena y ventanas...";
				const targetScene = sceneInput?.value.trim() || this.config.sceneName || "osu! rempalago";
				const res = await this.autoSetupScene(targetScene);
				if (setupStatus) {
					setupStatus.textContent = res.message;
					setupStatus.className = res.success ? "text-green-400 text-xs mt-1" : "text-red-400 text-xs mt-1";
				}
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
			dot.className = `w-3 h-3 rounded-full inline-block ${
				this.connected ? "bg-green-500" : "bg-red-500"
			}`;
			dot.title = this.connected ? "Connected" : "Disconnected";
		}

		if (btn) {
			btn.textContent = this.connected ? "Disconnect OBS" : "Connect to OBS";
		}
	}

	private setupEventListeners() {
		this.obs.on("Identified", () => {
			this.connected = true;
			this.updateUIStatus();
			this.log("Connected and Identified with OBS WebSocket");
			this.refreshAndApply();
		});

		this.obs.on("ConnectionClosed", () => {
			this.connected = false;
			this.updateUIStatus();
			this.log("Disconnected from OBS WebSocket");
		});

		this.obs.on("CurrentProgramSceneChanged", (data) => {
			if (!this.config.sceneName) {
				this.log(`Active scene changed to: ${data.sceneName}`);
				this.refreshAndApply();
			}
		});
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
			if (!hasTelemetry) {
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

	/**
	 * Automatically creates/configures the target scene ("osu! rempalago"),
	 * queries open osu! windows, creates sources "osu! 1", "osu! 2", etc.,
	 * adds the overlay browser source, and tiles everything.
	 */
	async autoSetupScene(
		sceneName = this.config.sceneName || "osu! rempalago",
	): Promise<{ success: boolean; message: string }> {
		if (!this.connected) {
			const ok = await this.connect();
			if (!ok) {
				return {
					success: false,
					message: "No se pudo conectar a OBS WebSocket en " + this.config.url,
				};
			}
		}

		try {
			// 1. Ensure scene exists
			const { scenes } = await this.obs.call("GetSceneList");
			const sceneExists = scenes.some(
				(s) => (s.sceneName as string) === sceneName,
			);

			if (!sceneExists) {
				await this.obs.call("CreateScene", { sceneName });
				this.log(`Created scene '${sceneName}'`);
			}

			// Switch to target scene
			await this.obs.call("SetCurrentProgramScene", { sceneName });
			this.config.sceneName = sceneName;

			// 2. Identify window capture input kind supported on the current OS/OBS build
			const { inputKinds } = await this.obs.call("GetInputKindList");
			const preferredKinds = [
				"window_capture",
				"pipewire-screen-capture-source",
				"pipewire-window-capture-source",
				"pipewire-window-capture",
				"xcomposite_input",
				"xshm_input",
				"screen_capture",
			];

			const windowCaptureKind =
				preferredKinds.find((k) => inputKinds.includes(k)) || "image_source";

			this.log(`Selected capture inputKind: ${windowCaptureKind}`);

			// 3. Find existing inputs and probe active osu! windows
			const { inputs } = await this.obs.call("GetInputList");
			const inputNames = new Set(inputs.map((i) => i.inputName as string));

			// Use osu! 1 or create temporary probe to query window list
			const probeInputName = "osu! 1";
			if (!inputNames.has(probeInputName)) {
				await this.obs.call("CreateInput", {
					sceneName,
					inputName: probeInputName,
					inputKind: windowCaptureKind,
					inputSettings: {},
				});
				inputNames.add(probeInputName);
			}

			// Query OBS for available window property items (if supported on this backend)
			let availableWindows: { itemName: string; value: string }[] = [];
			try {
				const props = await this.obs.call("GetInputPropertiesListPropertyItems", {
					inputName: probeInputName,
					propertyName: "window",
				});
				availableWindows =
					(props.propertyItems as { itemName: string; value: string }[]) || [];
			} catch (_err) {
				// Some backends like PipeWire don't expose a 'window' list property
			}

			// Filter osu! windows
			const osuWindows = availableWindows.filter((w) => {
				const val = (w.value || w.itemName || "").toLowerCase();
				return (
					val.includes("osu!") ||
					val.includes("osu.exe") ||
					val.includes("osu!.exe")
				);
			});

			// Filter out manager or unrelated windows
			const clientWindows = osuWindows.filter((w) => {
				const val = (w.value || w.itemName || "").toLowerCase();
				return (
					!val.includes("manager") &&
					!val.includes("discord") &&
					!val.includes("chrome")
				);
			});

			const targetWindows = clientWindows.length > 0 ? clientWindows : osuWindows;
			const clientCount = Math.max(targetWindows.length, 2); // Default to 2 slots if count unknown

			this.log(`Setting up ${clientCount} osu! capture source(s).`);

			// 4. Create/update sources "osu! 1", "osu! 2", etc.
			for (let i = 0; i < clientCount; i++) {
				const name = `osu! ${i + 1}`;
				const winVal = targetWindows[i]?.value;

				const settings: Record<string, any> = {};
				if (windowCaptureKind === "window_capture") {
					settings.priority = 2;
					if (winVal) settings.window = winVal;
				} else if (windowCaptureKind === "xcomposite_input") {
					if (winVal) settings.capture_window = winVal;
				} else if (windowCaptureKind.startsWith("pipewire")) {
					settings.ShowCursor = true;
				}

				if (!inputNames.has(name)) {
					await this.obs.call("CreateInput", {
						sceneName,
						inputName: name,
						inputKind: windowCaptureKind,
						inputSettings: settings,
					});
					inputNames.add(name);
				} else {
					const { sceneItems } = await this.obs.call("GetSceneItemList", {
						sceneName,
					});
					const inScene = sceneItems.some(
						(si) => (si.sourceName as string) === name,
					);
					if (!inScene) {
						await this.obs.call("CreateSceneItem", {
							sceneName,
							sourceName: name,
						});
					}
					if (Object.keys(settings).length > 0) {
						await this.obs.call("SetInputSettings", {
							inputName: name,
							inputSettings: settings,
						});
					}
				}
			}

			// 5. Ensure overlay Browser Source is in the scene
			let browserPluginAvailable = false;
			if (inputKinds.includes("browser_source")) {
				browserPluginAvailable = true;
				const overlaySourceName = "vcl-overlay";
				const overlayUrl =
					typeof window !== "undefined" && window.location?.href
						? window.location.origin + (window.location.pathname || "/vcl-overlay")
						: "http://127.0.0.1:24050/vcl-overlay";

				if (!inputNames.has(overlaySourceName)) {
					try {
						const created = await this.obs.call("CreateInput", {
							sceneName,
							inputName: overlaySourceName,
							inputKind: "browser_source",
							inputSettings: {
								url: overlayUrl,
								width: 1920,
								height: 1080,
								fps: 60,
								reroute_audio: false,
								restart_when_active: false,
								css: "",
							},
						});
						inputNames.add(overlaySourceName);

						// Ensure top-level full 1080p transform for overlay
						if (created.sceneItemId) {
							await this.obs.call("SetSceneItemTransform", {
								sceneName,
								sceneItemId: created.sceneItemId,
								sceneItemTransform: {
									positionX: 0,
									positionY: 0,
									boundsType: "OBS_BOUNDS_STRETCH",
									boundsWidth: 1920,
									boundsHeight: 1080,
									alignment: 5,
								},
							});
						}
					} catch (err) {
						console.warn("[OBSHandler] Could not auto-create browser source:", err);
					}
				} else {
					const { sceneItems } = await this.obs.call("GetSceneItemList", {
						sceneName,
					});
					const item = sceneItems.find(
						(si) => (si.sourceName as string) === overlaySourceName,
					);
					if (!item) {
						await this.obs.call("CreateSceneItem", {
							sceneName,
							sourceName: overlaySourceName,
						});
					}
				}
			}

			// 6. Refresh and apply the layout instantly
			await this.refreshAndApply();

			let msg = `¡Escena '${sceneName}' configurada con ${clientCount} ventanas de osu!`;
			if (browserPluginAvailable) {
				msg += " y Browser Source del overlay agregado!";
			} else {
				msg +=
					" (Nota: Instala 'obs-studio-plugin-browser' en Arch Linux para que OBS soporte agregar el Browser Source automáticamente).";
			}

			this.log(msg);
			return { success: true, message: msg };
		} catch (err: any) {
			console.error("[OBSHandler] autoSetupScene error:", err);
			return {
				success: false,
				message: `Error configurando escena: ${err.message || err}`,
			};
		}
	}

	private log(msg: string) {
		console.log(`[OBSHandler] ${msg}`);
	}
}
