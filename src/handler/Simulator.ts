import type ZEngine from "@fukutotojido/z-engine";
import TilingEngine, { type TilingLayoutMode } from "./TilingEngine";
import type OBSHandler from "./OBSHandler";
import type ChokeImpactHandler from "./ChokeImpactHandler";

export interface BeatmapPreset {
	id: number;
	artist: string;
	title: string;
	difficulty: string;
	mapper: string;
	CS: number;
	AR: number;
	OD: number;
	BPM: number;
	fullSR: number;
	lengthMs: number;
	bgUrl?: string;
}

export const BEATMAP_PRESETS: BeatmapPreset[] = [
	{
		id: 4675675,
		artist: "xi",
		title: "FREEDOM DiVE",
		difficulty: "FOUR DIMENSIONS",
		mapper: "Nakagawa-Kanon",
		CS: 4.0,
		AR: 9.0,
		OD: 8.5,
		BPM: 222.2,
		fullSR: 7.54,
		lengthMs: 257000,
	},
	{
		id: 4276777,
		artist: "xi",
		title: "Blue Zenith",
		difficulty: "FOUR DIMENSIONS",
		mapper: "Asphyxia",
		CS: 4.2,
		AR: 9.3,
		OD: 9.0,
		BPM: 200.0,
		fullSR: 7.28,
		lengthMs: 248000,
	},
	{
		id: 4805589,
		artist: "Camellia",
		title: "Galaxy Collapse",
		difficulty: "Galactic",
		mapper: "DoKito",
		CS: 4.0,
		AR: 10.0,
		OD: 9.5,
		BPM: 300.0,
		fullSR: 9.42,
		lengthMs: 312000,
	},
	{
		id: 953586,
		artist: "The Quick Brown Fox",
		title: "The Big Black",
		difficulty: "WHO'S AFRAID OF THE BIG BLACK",
		mapper: "Blue Dragon",
		CS: 4.0,
		AR: 10.0,
		OD: 8.0,
		BPM: 360.3,
		fullSR: 6.95,
		lengthMs: 145000,
	},
];

export default class Simulator {
	engine: ZEngine;
	obsHandler?: OBSHandler;

	isSimulating = false;
	simulationTimer: ReturnType<typeof setInterval> | null = null;
	simElapsedSeconds = 0;
	currentPresetIndex = 0;
	virtualTilingActive = false;
	currentLayoutMode: TilingLayoutMode = "dwindle";

	// Internal state matching tosu WebSocket contract
	chokeImpactHandler?: ChokeImpactHandler;
	mockData: any;

	constructor(
		engine: ZEngine,
		obsHandler?: OBSHandler,
		chokeImpactHandler?: ChokeImpactHandler,
	) {
		this.engine = engine;
		this.obsHandler = obsHandler;
		this.chokeImpactHandler = chokeImpactHandler;
		this.initMockData();
		this.bindUI();

		// Defer initial mock broadcast so all handlers finish mounting
		if (typeof window !== "undefined") {
			setTimeout(() => {
				this.broadcastUpdate();
			}, 150);
		}
	}

	private initMockData() {
		const preset = BEATMAP_PRESETS[0];

		this.mockData = {
			menu: {
				bm: {
					id: preset.id,
					metadata: {
						artist: preset.artist,
						title: preset.title,
						difficulty: preset.difficulty,
						mapper: preset.mapper,
					},
					stats: {
						CS: preset.CS,
						AR: preset.AR,
						OD: preset.OD,
						HP: 6.0,
						BPM: { common: preset.BPM, min: preset.BPM, max: preset.BPM },
						fullSR: preset.fullSR,
						maxCombo: 2450,
						circles: 1820,
						sliders: 450,
						spinners: 2,
					},
					time: {
						firstObject: 12000,
						current: 0,
						full: preset.lengthMs,
						mp3: preset.lengthMs + 5000,
					},
					path: {
						full: "sample-bg.jpg",
					},
				},
			},
			tourney: {
				manager: {
					ipcState: 3,
					bestOF: 9,
					teamName: {
						left: "Team Alpha (COL)",
						right: "Team Omega (VEN)",
					},
					stars: {
						left: 2,
						right: 2,
					},
					bools: {
						scoreVisible: true,
						starsVisible: true,
					},
					chat: [
						{
							team: "bot",
							time: "14:00",
							name: "BanchoBot",
							messageBody: "Match history: https://osu.ppy.sh/mp/11223344",
						},
						{
							team: "left",
							time: "14:01",
							name: "Alpha_Leader",
							messageBody: "gl hf everyone!",
						},
						{
							team: "right",
							time: "14:01",
							name: "Omega_Sniper",
							messageBody: "buena suerte, que gane el mejor!",
						},
					],
					gameplay: {
						score: {
							left: 320000,
							right: 345000,
						},
					},
				},
				ipcClients: [
					{
						team: "left",
						gameplay: {
							name: "Alpha_AimGod",
							score: 165000,
							accuracy: 99.45,
							combo: { current: 480, max: 480 },
							hits: { 0: 0, 50: 0, 100: 3, 300: 477, grade: { current: "S" }, unstableRate: 72.4 },
							mods: { num: 0 },
						},
					},
					{
						team: "left",
						gameplay: {
							name: "Alpha_Speedster",
							score: 155000,
							accuracy: 98.85,
							combo: { current: 420, max: 420 },
							hits: { 0: 1, 50: 1, 100: 7, 300: 412, grade: { current: "A" }, unstableRate: 84.1 },
							mods: { num: 0 },
						},
					},
					{
						team: "right",
						gameplay: {
							name: "Omega_Carry",
							score: 180000,
							accuracy: 99.80,
							combo: { current: 510, max: 510 },
							hits: { 0: 0, 50: 0, 100: 1, 300: 509, grade: { current: "SS" }, unstableRate: 64.2 },
							mods: { num: 0 },
						},
					},
					{
						team: "right",
						gameplay: {
							name: "Omega_Anchor",
							score: 165000,
							accuracy: 99.10,
							combo: { current: 460, max: 460 },
							hits: { 0: 0, 50: 1, 100: 4, 300: 455, grade: { current: "S" }, unstableRate: 76.5 },
							mods: { num: 0 },
						},
					},
				],
			},
		};
	}

	/**
	 * Pushes current mock data into ZEngine, triggering the exact WebSocket updates.
	 */
	broadcastUpdate() {
		// Deep clone snapshot so reference equality checks in z-engine trigger naturally
		const snapshot = JSON.parse(JSON.stringify(this.mockData));
		(this.engine as any).update(snapshot);
		this.renderVirtualTiling();
	}

	/**
	 * Starts a realistic live osu! round simulation with dynamic scores and lead changes.
	 */
	startMatchSimulation() {
		if (this.isSimulating) {
			this.stopMatchSimulation();
			return;
		}

		this.isSimulating = true;
		this.simElapsedSeconds = 0;
		this.mockData.tourney.manager.bools.scoreVisible = true;
		this.mockData.menu.bm.time.current = 0;

		// Initial reset for round start
		this.mockData.tourney.manager.gameplay.score.left = 0;
		this.mockData.tourney.manager.gameplay.score.right = 0;

		const totalDuration = 25; // 25 seconds fast-paced visual demo round
		const tickRateMs = 100; // 10 updates per second

		this.simulationTimer = setInterval(() => {
			this.simElapsedSeconds += tickRateMs / 1000;
			const progress = Math.min(1, this.simElapsedSeconds / totalDuration);

			// Progress in beatmap time
			this.mockData.menu.bm.time.current = Math.floor(
				progress * this.mockData.menu.bm.time.full,
			);

			// Dynamic score curve with alternating clutch lead swaps
			const baseRate = 850000;
			const wobble = Math.sin(this.simElapsedSeconds * 1.5) * 35000;
			const noise = (Math.random() - 0.5) * 8000;

			const scoreLeft = Math.floor(progress * baseRate + wobble + noise);
			const scoreRight = Math.floor(progress * baseRate - wobble - noise);

			this.mockData.tourney.manager.gameplay.score.left = Math.max(0, scoreLeft);
			this.mockData.tourney.manager.gameplay.score.right = Math.max(0, scoreRight);

			// Update individual clients
			if (this.mockData.tourney.ipcClients?.length >= 4) {
				const c0 = this.mockData.tourney.ipcClients[0].gameplay;
				const c1 = this.mockData.tourney.ipcClients[1].gameplay;
				const c2 = this.mockData.tourney.ipcClients[2].gameplay;
				const c3 = this.mockData.tourney.ipcClients[3].gameplay;

				c0.score = Math.floor(scoreLeft * 0.55);
				c1.score = Math.floor(scoreLeft * 0.45);
				c2.score = Math.floor(scoreRight * 0.52);
				c3.score = Math.floor(scoreRight * 0.48);

				c0.combo.current = Math.floor(progress * 1200);
				c2.combo.current = Math.floor(progress * 1350);
			}

			// Simulated commentary triggers
			if (Math.abs(this.simElapsedSeconds - 6.0) < 0.1) {
				this.sendChat("Left team pulls ahead by 30k!", "bot");
			} else if (Math.abs(this.simElapsedSeconds - 14.0) < 0.1) {
				this.sendChat("INCREDIBLE CLUTCH! Right team overtakes!!", "right");
			} else if (Math.abs(this.simElapsedSeconds - 20.0) < 0.1) {
				this.sendChat("NECK AND NECK FINAL STRETCH!", "left");
			}

			this.broadcastUpdate();

			// Finish round
			if (progress >= 1) {
				this.stopMatchSimulation();
				this.mockData.menu.bm.time.current = this.mockData.menu.bm.time.full + 1000;
				this.broadcastUpdate();
			}
		}, tickRateMs);
	}

	stopMatchSimulation() {
		if (this.simulationTimer) {
			clearInterval(this.simulationTimer);
			this.simulationTimer = null;
		}
		this.isSimulating = false;
	}

	/**
	 * Forces a dramatic lead swap between teams.
	 */
	swapLead() {
		const diff = 75000;
		const left = this.mockData.tourney.manager.gameplay.score.left;
		const right = this.mockData.tourney.manager.gameplay.score.right;

		if (left >= right) {
			this.mockData.tourney.manager.gameplay.score.right = left + diff;
		} else {
			this.mockData.tourney.manager.gameplay.score.left = right + diff;
		}
		this.broadcastUpdate();
	}

	/**
	 * Simulates a dramatic heartbreak choke for the specified team.
	 */
	simulateChoke(team: "left" | "right") {
		const clients = this.mockData.tourney.ipcClients ?? [];
		const client =
			clients.find((c: any) => c.team === team) ??
			clients[team === "left" ? 0 : 2];
		if (!client) return;

		const brokenCombo = Math.floor(Math.random() * 350) + 650;
		const playerName =
			client.gameplay.name ||
			(team === "left" ? "Alpha_AimGod" : "Omega_Carry");

		// Drop current combo to 0 and increment miss count
		client.gameplay.combo.current = 0;
		client.gameplay.hits[0] = (client.gameplay.hits[0] || 0) + 1;

		if (this.chokeImpactHandler) {
			this.chokeImpactHandler.triggerImpactFX({
				team,
				playerName,
				comboBroken: brokenCombo,
				isSessionRecord: true,
				missNumber: client.gameplay.hits[0],
			});
		}

		this.sendChat(
			`💔 CHOKE CRÍTICO! ${playerName} acaba de perder su combo de ${brokenCombo}x!`,
			"bot",
		);
		this.broadcastUpdate();
	}

	/**
	 * Increments or decrements score stars.
	 */
	adjustStar(team: "left" | "right", delta: number) {
		const current = this.mockData.tourney.manager.stars[team] ?? 0;
		const bestOf = this.mockData.tourney.manager.bestOF ?? 9;
		const maxPossible = Math.floor((bestOf + 1) / 2);

		const updated = Math.max(0, Math.min(maxPossible, current + delta));
		this.mockData.tourney.manager.stars[team] = updated;
		this.broadcastUpdate();
	}

	/**
	 * Sets up a 4-4 tiebreaker high-stakes scenario.
	 */
	setTiebreaker() {
		this.mockData.tourney.manager.bestOF = 9;
		this.mockData.tourney.manager.stars.left = 4;
		this.mockData.tourney.manager.stars.right = 4;
		this.sendChat("TIEBREAKER MATCH POINT: 4 - 4 (Best of 9)", "bot");
		this.broadcastUpdate();
	}

	/**
	 * Cycles through realistic osu! beatmap presets.
	 */
	cycleBeatmap() {
		this.currentPresetIndex =
			(this.currentPresetIndex + 1) % BEATMAP_PRESETS.length;
		const preset = BEATMAP_PRESETS[this.currentPresetIndex];

		this.mockData.menu.bm.id = preset.id;
		this.mockData.menu.bm.metadata.artist = preset.artist;
		this.mockData.menu.bm.metadata.title = preset.title;
		this.mockData.menu.bm.metadata.difficulty = preset.difficulty;
		this.mockData.menu.bm.metadata.mapper = preset.mapper;

		this.mockData.menu.bm.stats.CS = preset.CS;
		this.mockData.menu.bm.stats.AR = preset.AR;
		this.mockData.menu.bm.stats.OD = preset.OD;
		this.mockData.menu.bm.stats.BPM.common = preset.BPM;
		this.mockData.menu.bm.stats.fullSR = preset.fullSR;
		this.mockData.menu.bm.time.full = preset.lengthMs;
		this.mockData.menu.bm.time.current = 0;

		this.broadcastUpdate();
	}

	/**
	 * Injects a chat message into the overlay chat stream.
	 */
	sendChat(
		message: string,
		team: "left" | "right" | "bot" = "bot",
		name?: string,
	) {
		const senderName =
			name ??
			(team === "bot"
				? "BanchoBot"
				: team === "left"
					? "Alpha_Player"
					: "Omega_Sniper");

		const now = new Date();
		const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
			.getMinutes()
			.toString()
			.padStart(2, "0")}`;

		this.mockData.tourney.manager.chat.push({
			team,
			time: timeStr,
			name: senderName,
			messageBody: message,
		});

		this.broadcastUpdate();
	}

	/**
	 * Toggles score visibility mode.
	 */
	toggleScoreVisible() {
		this.mockData.tourney.manager.bools.scoreVisible =
			!this.mockData.tourney.manager.bools.scoreVisible;
		this.broadcastUpdate();
	}

	/**
	 * Toggles star visibility mode.
	 */
	toggleStarsVisible() {
		this.mockData.tourney.manager.bools.starsVisible =
			!this.mockData.tourney.manager.bools.starsVisible;
		this.broadcastUpdate();
	}

	/**
	 * Toggles between Result Screen and Active Gameplay.
	 */
	toggleResultScreen() {
		if (
			this.mockData.menu.bm.time.current > this.mockData.menu.bm.time.full
		) {
			this.mockData.menu.bm.time.current = 0;
		} else {
			this.mockData.menu.bm.time.current =
				this.mockData.menu.bm.time.full + 5000;
		}
		this.broadcastUpdate();
	}

	/**
	 * Enables or disables the virtual OBS client tiling preview on screen.
	 */
	toggleVirtualTiling() {
		this.virtualTilingActive = !this.virtualTilingActive;
		this.renderVirtualTiling();
	}

	/**
	 * Changes tiling layout mode and updates both OBS handler and virtual preview.
	 */
	setLayoutMode(mode: TilingLayoutMode) {
		this.currentLayoutMode = mode;
		if (this.obsHandler) {
			this.obsHandler.setLayoutMode(mode);
		}
		this.renderVirtualTiling();
	}

	/**
	 * Renders virtual client tiles inside the overlay `#main` area to preview OBS window tiling.
	 */
	private renderVirtualTiling() {
		const container = document.querySelector<HTMLElement>("#virtualTilingCanvas");
		if (!container) return;

		if (!this.virtualTilingActive) {
			container.innerHTML = "";
			container.style.opacity = "0";
			return;
		}

		container.style.opacity = "1";

		const clients = this.mockData.tourney.ipcClients ?? [];
		const clientCount = clients.length;
		if (clientCount === 0) {
			container.innerHTML = "";
			return;
		}

		// Calculate rectangles based on current layout mode
		const rects = TilingEngine.calculateLayout(clientCount, this.currentLayoutMode, {
			container: { x: 0, y: 0, width: 1920, height: 720 },
			gap: 12,
			keepAspectRatio: false,
		});

		// Build or reconcile virtual windows
		let tileWrapper = container.querySelector<HTMLElement>("#virtualTileWrapper");
		if (!tileWrapper) {
			tileWrapper = document.createElement("div");
			tileWrapper.id = "virtualTileWrapper";
			tileWrapper.className = "relative w-full h-full";
			container.appendChild(tileWrapper);
		}

		// Ensure tile count matches client count
		while (tileWrapper.children.length > clientCount) {
			tileWrapper.removeChild(tileWrapper.lastChild!);
		}
		while (tileWrapper.children.length < clientCount) {
			const tile = document.createElement("div");
			tile.className =
				"absolute rounded-2xl border-2 border-surface-1 shadow-2xl flex flex-col justify-between p-4 overflow-hidden backdrop-blur-sm transition-all duration-300 ease-out";
			tileWrapper.appendChild(tile);
		}

		// Update each tile's geometry and telemetry
		for (let i = 0; i < clientCount; i++) {
			const tile = tileWrapper.children[i] as HTMLElement;
			const rect = rects[i];
			const client = clients[i];
			if (!rect || !client) continue;

			const isLeft = client.team === "left";
			const teamBorder = isLeft ? "border-amber-400/80" : "border-blue-500/80";
			const teamGlow = isLeft ? "bg-amber-500/10" : "bg-blue-600/10";
			const teamBadge = isLeft ? "bg-[#FFCD00] text-black" : "bg-[#003087] text-white";

			tile.style.left = `${rect.x}px`;
			tile.style.top = `${rect.y}px`;
			tile.style.width = `${rect.width}px`;
			tile.style.height = `${rect.height}px`;

			tile.innerHTML = `
				<div class="absolute inset-0 ${teamGlow} pointer-events-none"></div>
				<div class="flex items-center justify-between z-10">
					<div class="flex items-center gap-2">
						<span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${teamBadge}">
							${isLeft ? "Team Left" : "Team Right"}
						</span>
						<span class="font-bold text-white text-base truncate">${client.gameplay.name}</span>
					</div>
					<div class="text-xs text-white/70 font-mono bg-black/40 px-2 py-0.5 rounded">
						Window #${i + 1}
					</div>
				</div>
				<div class="flex items-end justify-between z-10 text-white">
					<div>
						<div class="text-xs text-white/60">Score</div>
						<div class="text-xl font-bold font-mono tracking-tight">${client.gameplay.score.toLocaleString()}</div>
					</div>
					<div class="text-right">
						<div class="text-xs text-white/60">Combo / Acc</div>
						<div class="text-sm font-semibold">${client.gameplay.combo.current}x <span class="text-white/40">|</span> ${client.gameplay.accuracy.toFixed(2)}%</div>
					</div>
				</div>
			`;
			tile.className = `absolute rounded-2xl border-2 ${teamBorder} shadow-2xl flex flex-col justify-between p-4 overflow-hidden backdrop-blur-sm transition-all duration-300 ease-out`;
		}
	}

	/**
	 * Binds DOM buttons and interactive controls to simulator functions.
	 */
	bindUI() {
		if (typeof document === "undefined") return;

		const playBtn = document.querySelector<HTMLButtonElement>("#simPlayBtn");
		const debugPlayBtn =
			document.querySelector<HTMLButtonElement>("#debugSimPlayBtn");
		const playIcon = document.querySelector<HTMLElement>("#simPlayIcon");
		const playText = document.querySelector<HTMLElement>("#simPlayText");
		const swapLeadBtn =
			document.querySelector<HTMLButtonElement>("#simSwapLeadBtn");
		const debugSwapLeadBtn =
			document.querySelector<HTMLButtonElement>("#debugSimSwapLeadBtn");
		const starLeftBtn =
			document.querySelector<HTMLButtonElement>("#simStarLeftBtn");
		const starRightBtn =
			document.querySelector<HTMLButtonElement>("#simStarRightBtn");
		const tiebreakerBtn =
			document.querySelector<HTMLButtonElement>("#simTiebreakerBtn");
		const debugTiebreakerBtn =
			document.querySelector<HTMLButtonElement>("#debugSimTiebreakerBtn");
		const nextMapBtn =
			document.querySelector<HTMLButtonElement>("#simNextMapBtn");
		const debugNextMapBtn =
			document.querySelector<HTMLButtonElement>("#debugSimNextMapBtn");
		const sendChatBtn =
			document.querySelector<HTMLButtonElement>("#simSendChatBtn");
		const debugSendChatBtn =
			document.querySelector<HTMLButtonElement>("#debugSimSendChatBtn");
		const toggleTilingBtn = document.querySelector<HTMLButtonElement>(
			"#simToggleTilingBtn",
		);
		const debugToggleTilingBtn = document.querySelector<HTMLButtonElement>(
			"#debugSimToggleTilingBtn",
		);
		const toggleResultBtn = document.querySelector<HTMLButtonElement>(
			"#simToggleResultBtn",
		);
		const resetBtn = document.querySelector<HTMLButtonElement>("#simResetBtn");

		const chokeLeftBtn =
			document.querySelector<HTMLButtonElement>("#simChokeLeftBtn");
		const chokeRightBtn =
			document.querySelector<HTMLButtonElement>("#simChokeRightBtn");
		const debugChokeLeftBtn = document.querySelector<HTMLButtonElement>(
			"#debugSimChokeLeftBtn",
		);
		const debugChokeRightBtn = document.querySelector<HTMLButtonElement>(
			"#debugSimChokeRightBtn",
		);

		const collapseBtn =
			document.querySelector<HTMLButtonElement>("#simCollapseBtn");
		const expandBtn =
			document.querySelector<HTMLButtonElement>("#simExpandBtn");
		const toolbar = document.querySelector<HTMLElement>("#simToolbar");

		const obsLayoutMode =
			document.querySelector<HTMLSelectElement>("#obsLayoutMode");

		const handleTogglePlay = () => {
			if (this.isSimulating) {
				this.stopMatchSimulation();
				if (playIcon) playIcon.textContent = "▶️";
				if (playText) playText.textContent = "Simular Partida (25s)";
				if (playBtn) playBtn.classList.replace("bg-red-600", "bg-blue-600");
				if (debugPlayBtn) debugPlayBtn.textContent = "▶️ Simular Partida";
			} else {
				this.startMatchSimulation();
				if (playIcon) playIcon.textContent = "⏹️";
				if (playText) playText.textContent = "Detener Simulación";
				if (playBtn) playBtn.classList.replace("bg-blue-600", "bg-red-600");
				if (debugPlayBtn) debugPlayBtn.textContent = "⏹️ Detener";
			}
		};

		if (playBtn) playBtn.onclick = handleTogglePlay;
		if (debugPlayBtn) debugPlayBtn.onclick = handleTogglePlay;

		if (swapLeadBtn) swapLeadBtn.onclick = () => this.swapLead();
		if (debugSwapLeadBtn) debugSwapLeadBtn.onclick = () => this.swapLead();

		if (starLeftBtn) starLeftBtn.onclick = () => this.adjustStar("left", 1);
		if (starRightBtn)
			starRightBtn.onclick = () => this.adjustStar("right", 1);

		if (tiebreakerBtn) tiebreakerBtn.onclick = () => this.setTiebreaker();
		if (debugTiebreakerBtn)
			debugTiebreakerBtn.onclick = () => this.setTiebreaker();

		if (nextMapBtn) nextMapBtn.onclick = () => this.cycleBeatmap();
		if (debugNextMapBtn) debugNextMapBtn.onclick = () => this.cycleBeatmap();

		const sampleChats = [
			{
				msg: "¡QUÉ AIM POR DIOS! 🔥",
				team: "left" as const,
				name: "Alpha_AimGod",
			},
			{
				msg: "se le trabó la tableta noooo",
				team: "right" as const,
				name: "Omega_Anchor",
			},
			{
				msg: "MATCH POINT TIEBREAKER!!",
				team: "bot" as const,
				name: "BanchoBot",
			},
			{
				msg: "Aegleworks overlay on top fr fr",
				team: "left" as const,
				name: "Viewer1337",
			},
			{
				msg: "VAMOS COLOMBIAAA 🇨🇴",
				team: "left" as const,
				name: "Alpha_Fan",
			},
			{
				msg: "CLUTCH GOD! 500 combo reverse!",
				team: "right" as const,
				name: "Omega_Carry",
			},
		];
		let chatIndex = 0;

		const handleSendChat = () => {
			const item = sampleChats[chatIndex % sampleChats.length];
			chatIndex++;
			this.sendChat(item.msg, item.team, item.name);
		};

		if (sendChatBtn) sendChatBtn.onclick = handleSendChat;
		if (debugSendChatBtn) debugSendChatBtn.onclick = handleSendChat;

		const handleToggleTiling = () => {
			this.toggleVirtualTiling();
			const label = this.virtualTilingActive
				? "🪟 Ocultar Tiling"
				: "🪟 Ver Tiling";
			if (toggleTilingBtn) toggleTilingBtn.textContent = label;
			if (debugToggleTilingBtn) debugToggleTilingBtn.textContent = label;
		};

		if (toggleTilingBtn) toggleTilingBtn.onclick = handleToggleTiling;
		if (debugToggleTilingBtn) debugToggleTilingBtn.onclick = handleToggleTiling;

		if (toggleResultBtn) {
			toggleResultBtn.onclick = () => this.toggleResultScreen();
		}

		if (chokeLeftBtn) chokeLeftBtn.onclick = () => this.simulateChoke("left");
		if (chokeRightBtn)
			chokeRightBtn.onclick = () => this.simulateChoke("right");
		if (debugChokeLeftBtn)
			debugChokeLeftBtn.onclick = () => this.simulateChoke("left");
		if (debugChokeRightBtn)
			debugChokeRightBtn.onclick = () => this.simulateChoke("right");

		if (resetBtn) {
			resetBtn.onclick = () => {
				this.resetAll();
				if (playIcon) playIcon.textContent = "▶️";
				if (playText) playText.textContent = "Simular Partida (25s)";
				if (playBtn) playBtn.classList.replace("bg-red-600", "bg-blue-600");
			};
		}

		if (collapseBtn && expandBtn && toolbar) {
			collapseBtn.onclick = () => {
				toolbar.classList.add("hidden");
				expandBtn.classList.remove("hidden");
			};
			expandBtn.onclick = () => {
				toolbar.classList.remove("hidden");
				expandBtn.classList.add("hidden");
			};
		}

		if (obsLayoutMode) {
			obsLayoutMode.addEventListener("change", () => {
				this.setLayoutMode(obsLayoutMode.value as TilingLayoutMode);
			});
		}
	}

	/**
	 * Resets all parameters to initial clean state.
	 */
	resetAll() {
		this.stopMatchSimulation();
		this.initMockData();
		this.broadcastUpdate();
	}
}
