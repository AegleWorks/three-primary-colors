import type ZEngine from "@fukutotojido/z-engine";

export interface ClientRunState {
	index: number;
	team: "left" | "right" | "";
	name: string;
	currentCombo: number;
	prevCombo: number;
	peakComboThisMap: number;
	h0: number;
	prevH0: number;
}

export interface ChokeTriggerData {
	team: "left" | "right";
	playerName: string;
	comboBroken: number;
	isSessionRecord: boolean;
	missNumber: number;
}

export default class ChokeImpactHandler {
	engine: ZEngine;

	// Tracks highest combo achieved across the tournament session for 1v1
	sessionBestCombo = {
		left: 0,
		right: 0,
	};

	private clientStates: Map<number, ClientRunState> = new Map();
	private lastChokeTimestamp = {
		left: 0,
		right: 0,
	};

	// Audio context for procedural sound effects (no external files needed)
	private audioCtx: AudioContext | null = null;

	constructor(engine: ZEngine) {
		this.engine = engine;
		this.initListeners();
	}

	private initListeners() {
		// Listen for client length and dynamically bind slots
		this.engine.register("tourney.ipcClients.length", (_, length: number) => {
			for (let i = 0; i < length; i++) {
				if (!this.clientStates.has(i)) {
					this.registerClientSlot(i);
				}
			}
		});

		// Check first 8 possible 1v1 client slots
		for (let i = 0; i < 8; i++) {
			this.registerClientSlot(i);
		}
	}

	private registerClientSlot(idx: number) {
		const state: ClientRunState = {
			index: idx,
			team: "",
			name: "",
			currentCombo: 0,
			prevCombo: 0,
			peakComboThisMap: 0,
			h0: 0,
			prevH0: 0,
		};
		this.clientStates.set(idx, state);

		this.engine.register(`tourney.ipcClients.${idx}.team`, (_, team: string) => {
			const c = this.clientStates.get(idx);
			if (c && (team === "left" || team === "right")) {
				c.team = team;
			}
		});

		this.engine.register(
			`tourney.ipcClients.${idx}.gameplay.name`,
			(_, name: string) => {
				const c = this.clientStates.get(idx);
				if (c) c.name = name ?? "";
			},
		);

		this.engine.register(
			`tourney.ipcClients.${idx}.gameplay.hits.0`,
			(_, h0: number) => {
				const c = this.clientStates.get(idx);
				if (!c || typeof h0 !== "number") return;

				const prevH0 = c.h0;
				c.prevH0 = prevH0;
				c.h0 = h0;

				// If misses increased while player was on a strong streak
				if (h0 > prevH0 && c.prevCombo >= 100 && c.team) {
					this.evaluatePotentialChoke(c, c.prevCombo, h0);
				}
			},
		);

		this.engine.register(
			`tourney.ipcClients.${idx}.gameplay.combo.current`,
			(_, newCombo: number) => {
				const c = this.clientStates.get(idx);
				if (!c || typeof newCombo !== "number") return;

				const prevCombo = c.currentCombo;
				c.prevCombo = prevCombo;
				c.currentCombo = newCombo;

				// Update peak combos
				if (newCombo > c.peakComboThisMap) {
					c.peakComboThisMap = newCombo;
				}

				if (c.team && (c.team === "left" || c.team === "right")) {
					if (newCombo > this.sessionBestCombo[c.team]) {
						this.sessionBestCombo[c.team] = newCombo;
					}
				}

				// Check combo break: suddenly dropped from a significant streak down to 0
				if (prevCombo >= 100 && newCombo < Math.floor(prevCombo * 0.2)) {
					this.evaluatePotentialChoke(c, prevCombo, c.h0);
				}
			},
		);
	}

	/**
	 * Evaluates whether a drop qualifies as a session-defining heartbreak choke.
	 */
	private evaluatePotentialChoke(
		client: ClientRunState,
		brokenCombo: number,
		missCount: number,
	) {
		const team = client.team;
		if (team !== "left" && team !== "right") return;

		// 4-second cooldown per team to prevent alert spam
		const now = Date.now();
		if (now - this.lastChokeTimestamp[team] < 4000) return;

		const sessionRecord = this.sessionBestCombo[team] || 150;
		// A "run bastante buena": >= 120x and close to or surpassing session best
		const isGoodRun =
			brokenCombo >= 120 &&
			(brokenCombo >= sessionRecord * 0.75 || brokenCombo >= 200);

		if (!isGoodRun) return;

		const isSessionRecord = brokenCombo >= sessionRecord;
		this.lastChokeTimestamp[team] = now;

		this.triggerImpactFX({
			team,
			playerName: client.name || (team === "left" ? "Team Left" : "Team Right"),
			comboBroken: brokenCombo,
			isSessionRecord,
			missNumber: missCount,
		});
	}

	/**
	 * Triggers the cinematic impact banner, side vignette shockwave, and procedural sound.
	 */
	triggerImpactFX(data: ChokeTriggerData) {
		this.playProceduralImpactSound();

		const side = data.team;
		const isLeft = side === "left";

		const vignette = document.querySelector<HTMLElement>(
			isLeft ? "#chokeVignetteLeft" : "#chokeVignetteRight",
		);
		const card = document.querySelector<HTMLElement>(
			isLeft ? "#chokeCardLeft" : "#chokeCardRight",
		);

		// 1. Trigger side red vignette pulse
		if (vignette) {
			vignette.classList.remove("animate-choke-vignette", "hidden");
			// Force reflow
			void vignette.offsetWidth;
			vignette.classList.add("animate-choke-vignette");
		}

		// 2. Populate and display dramatic Choke Card
		if (card) {
			const badge = card.querySelector<HTMLElement>(".choke-badge");
			const title = card.querySelector<HTMLElement>(".choke-title");
			const playerSpan = card.querySelector<HTMLElement>(".choke-player");
			const streakSpan = card.querySelector<HTMLElement>(".choke-streak");
			const glowBg = card.querySelector<HTMLElement>(".choke-glow");

			if (badge) {
				badge.textContent = data.isSessionRecord
					? "🏆 SESSION BEST RUN SHATTERED"
					: "💔 HEARTBREAK CHOKE";
				badge.className = `choke-badge text-[11px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
					data.isSessionRecord
						? "bg-amber-400 text-black shadow-lg shadow-amber-400/40"
						: "bg-red-600 text-white shadow-lg shadow-red-600/40"
				}`;
			}

			if (title) {
				title.textContent = data.isSessionRecord
					? "CATASTROPHIC CHOKE!"
					: "COMBO BREAK!";
			}

			if (playerSpan) playerSpan.textContent = data.playerName;
			if (streakSpan) streakSpan.textContent = `${data.comboBroken}x`;

			if (glowBg) {
				glowBg.className = `choke-glow absolute inset-0 rounded-2xl pointer-events-none ${
					data.isSessionRecord
						? "bg-amber-500/20 border-2 border-amber-400/60"
						: "bg-red-600/25 border-2 border-red-500/70"
				}`;
			}

			// Show card with impact shake animation
			card.classList.remove("hidden", "opacity-0", "translate-y-4");
			card.classList.add("animate-choke-shake", "opacity-100", "translate-y-0");

			// Smooth auto-dismiss after 3.2s
			setTimeout(() => {
				card.classList.remove("animate-choke-shake");
				card.classList.add("opacity-0", "translate-y-4");
				setTimeout(() => {
					card.classList.add("hidden");
				}, 400);
			}, 3200);
		}
	}

	/**
	 * Plays a procedural synthesizer boom/shatter effect via native Web Audio.
	 */
	private playProceduralImpactSound() {
		try {
			if (!this.audioCtx) {
				const AudioCtxClass =
					window.AudioContext || (window as any).webkitAudioContext;
				if (AudioCtxClass) {
					this.audioCtx = new AudioCtxClass();
				}
			}

			if (!this.audioCtx || this.audioCtx.state === "suspended") {
				this.audioCtx?.resume();
			}

			if (!this.audioCtx) return;

			const now = this.audioCtx.currentTime;

			// Low frequency sine boom
			const osc = this.audioCtx.createOscillator();
			const gain = this.audioCtx.createGain();

			osc.type = "sine";
			osc.frequency.setValueAtTime(120, now);
			osc.frequency.exponentialRampToValueAtTime(28, now + 0.35);

			gain.gain.setValueAtTime(0.4, now);
			gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

			osc.connect(gain);
			gain.connect(this.audioCtx.destination);

			osc.start(now);
			osc.stop(now + 0.45);
		} catch (_err) {
			// Audio is non-blocking and safe if audio policy restricts
		}
	}
}
