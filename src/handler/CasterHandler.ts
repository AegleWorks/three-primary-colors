export interface Caster {
	id: string;
	name: string;
	avatarUrl: string;
	isSpeaking: boolean;
	discordId?: string;
}

export default class CasterHandler {
	casters: Caster[] = [
		{
			id: "caster-1",
			name: "Caster Alpha",
			avatarUrl: "https://a.ppy.sh/2", // Peppy / default iconic avatar fallback
			isSpeaking: false,
		},
		{
			id: "caster-2",
			name: "Caster Omega",
			avatarUrl: "https://a.ppy.sh/3", // BanchoBot / caster fallback
			isSpeaking: false,
		},
	];

	private container: HTMLElement | null = null;
	private micStream: MediaStream | null = null;
	private audioCtx: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private vadActiveCasterId: string | null = null;
	private vadAnimationId: number | null = null;

	private autoSpeechTimer: ReturnType<typeof setInterval> | null = null;

	constructor(containerSelector = "#commentatorDeck") {
		this.container = document.querySelector<HTMLElement>(containerSelector);
		this.loadFromURLParams();
		this.render();
		this.bindControls();
	}

	/**
	 * Reads URL parameters to allow quick configuration via OBS Browser Source URL:
	 * e.g., ?c1=Aegle&c1img=https://...&c2=Peppy&c2img=https://...
	 */
	private loadFromURLParams() {
		if (typeof window === "undefined" || !window.location) return;

		try {
			const params = new URLSearchParams(window.location.search);

			const c1Name = params.get("c1") || params.get("caster1");
			const c1Img = params.get("c1img") || params.get("avatar1") || params.get("c1Avatar");
			const c2Name = params.get("c2") || params.get("caster2");
			const c2Img = params.get("c2img") || params.get("avatar2") || params.get("c2Avatar");

			if (c1Name && this.casters[0]) this.casters[0].name = c1Name;
			if (c1Img && this.casters[0]) this.casters[0].avatarUrl = c1Img;
			if (c2Name && this.casters[1]) this.casters[1].name = c2Name;
			if (c2Img && this.casters[1]) this.casters[1].avatarUrl = c2Img;
		} catch (e) {
			console.warn("[CasterHandler] Could not parse query params", e);
		}
	}

	/**
	 * Renders caster cards into the DOM.
	 */
	render() {
		if (!this.container) return;

		this.container.innerHTML = "";

		for (const caster of this.casters) {
			const card = document.createElement("div");
			card.id = `caster-${caster.id}`;
			card.className =
				"flex flex-col items-center gap-1.5 transition-transform duration-150 cursor-pointer select-none group";
			card.title = `${caster.name} - Click para alternar voz | Doble click para editar`;

			const ringClasses = caster.isSpeaking
				? "border-emerald-400 ring-4 ring-emerald-500/60 shadow-[0_0_22px_rgba(16,185,129,0.9)] scale-105"
				: "border-surface-1/80 ring-0 shadow-none scale-100 opacity-85 group-hover:opacity-100";

			card.innerHTML = `
				<div class="relative">
					<img src="${caster.avatarUrl}" alt="${caster.name}"
						class="caster-avatar w-11 h-11 rounded-full object-cover border-2 transition-all duration-150 ${ringClasses}"
						onerror="this.src='https://a.ppy.sh/2'"
					/>
					<span class="caster-indicator absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-base transition-colors duration-150 ${
						caster.isSpeaking ? "bg-emerald-400 shadow-sm shadow-emerald-400" : "bg-surface-1"
					}"></span>
				</div>
				<span class="caster-name px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-[11px] font-semibold text-white/90 border border-white/10 tracking-wide truncate max-w-[110px]">
					${caster.name}
				</span>
			`;

			// Click avatar card to toggle speaking
			card.onclick = (e) => {
				e.stopPropagation();
				this.setSpeaking(caster.id, !caster.isSpeaking);
			};

			// Double-click to customize commentator name and avatar
			card.ondblclick = (e) => {
				e.stopPropagation();
				const newName = window.prompt(`Nombre para ${caster.name}:`, caster.name);
				if (newName !== null && newName.trim() !== "") {
					caster.name = newName.trim();
				}
				const newAvatar = window.prompt(
					`URL de avatar para ${caster.name} (Discord CDN o imagen web):`,
					caster.avatarUrl,
				);
				if (newAvatar !== null && newAvatar.trim() !== "") {
					caster.avatarUrl = newAvatar.trim();
				}
				this.render();
			};

			this.container.appendChild(card);
		}
	}

	/**
	 * Updates the speaking state of a specific commentator.
	 */
	setSpeaking(casterId: string, isSpeaking: boolean) {
		const caster = this.casters.find((c) => c.id === casterId);
		if (!caster) return;

		if (caster.isSpeaking === isSpeaking) return;
		caster.isSpeaking = isSpeaking;

		this.updateCasterDOM(caster);
	}

	private updateCasterDOM(caster: Caster) {
		const card = this.container?.querySelector(`#caster-${caster.id}`);
		if (!card) return;

		const avatar = card.querySelector<HTMLElement>(".caster-avatar");
		const indicator = card.querySelector<HTMLElement>(".caster-indicator");

		if (avatar) {
			if (caster.isSpeaking) {
				avatar.classList.remove("border-surface-1/80", "ring-0", "shadow-none", "scale-100", "opacity-85");
				avatar.classList.add(
					"border-emerald-400",
					"ring-4",
					"ring-emerald-500/60",
					"shadow-[0_0_22px_rgba(16,185,129,0.9)]",
					"scale-105",
					"opacity-100",
				);
			} else {
				avatar.classList.remove(
					"border-emerald-400",
					"ring-4",
					"ring-emerald-500/60",
					"shadow-[0_0_22px_rgba(16,185,129,0.9)]",
					"scale-105",
					"opacity-100",
				);
				avatar.classList.add("border-surface-1/80", "ring-0", "shadow-none", "scale-100", "opacity-85");
			}
		}

		if (indicator) {
			if (caster.isSpeaking) {
				indicator.classList.remove("bg-surface-1");
				indicator.classList.add("bg-emerald-400", "shadow-sm", "shadow-emerald-400");
			} else {
				indicator.classList.remove("bg-emerald-400", "shadow-sm", "shadow-emerald-400");
				indicator.classList.add("bg-surface-1");
			}
		}
	}

	/**
	 * Connects a physical microphone to drive a commentator's green speaking ring via Web Audio VAD.
	 */
	async startMicVAD(casterId = "caster-1"): Promise<boolean> {
		if (this.vadActiveCasterId) {
			this.stopMicVAD();
		}

		try {
			if (!navigator?.mediaDevices?.getUserMedia) {
				console.warn("[CasterHandler] MediaDevices API not supported.");
				return false;
			}

			this.micStream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: false,
			});

			const AudioContextClass =
				window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			this.audioCtx = new AudioContextClass();
			const source = this.audioCtx.createMediaStreamSource(this.micStream);

			this.analyser = this.audioCtx.createAnalyser();
			this.analyser.fftSize = 512;
			source.connect(this.analyser);

			this.vadActiveCasterId = casterId;

			const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
			const threshold = 18; // Voice energy threshold

			const checkAudio = () => {
				if (!this.analyser || !this.vadActiveCasterId) return;

				this.analyser.getByteFrequencyData(dataArray);

				let sum = 0;
				for (let i = 0; i < dataArray.length; i++) {
					sum += dataArray[i];
				}
				const avg = sum / dataArray.length;

				const isTalking = avg > threshold;
				this.setSpeaking(this.vadActiveCasterId, isTalking);

				this.vadAnimationId = requestAnimationFrame(checkAudio);
			};

			checkAudio();
			return true;
		} catch (err) {
			console.warn("[CasterHandler] Failed to initialize mic VAD:", err);
			this.stopMicVAD();
			return false;
		}
	}

	stopMicVAD() {
		if (this.vadAnimationId) {
			cancelAnimationFrame(this.vadAnimationId);
			this.vadAnimationId = null;
		}

		if (this.micStream) {
			for (const track of this.micStream.getTracks()) {
				track.stop();
			}
			this.micStream = null;
		}

		if (this.audioCtx) {
			this.audioCtx.close().catch(() => {});
			this.audioCtx = null;
		}

		if (this.vadActiveCasterId) {
			this.setSpeaking(this.vadActiveCasterId, false);
			this.vadActiveCasterId = null;
		}
	}

	toggleMicVAD(casterId = "caster-1"): Promise<boolean> {
		if (this.vadActiveCasterId) {
			this.stopMicVAD();
			return Promise.resolve(false);
		}
		return this.startMicVAD(casterId);
	}

	/**
	 * Simulates commentary back-and-forth speech for demos.
	 */
	toggleAutoSpeechSimulation(): boolean {
		if (this.autoSpeechTimer) {
			clearInterval(this.autoSpeechTimer);
			this.autoSpeechTimer = null;
			this.setSpeaking("caster-1", false);
			this.setSpeaking("caster-2", false);
			return false;
		}

		let turn = 0;
		this.autoSpeechTimer = setInterval(() => {
			turn++;
			const cycle = turn % 6;

			if (cycle === 0 || cycle === 1) {
				// Caster 1 talks
				this.setSpeaking("caster-1", true);
				this.setSpeaking("caster-2", false);
			} else if (cycle === 2) {
				// Brief pause
				this.setSpeaking("caster-1", false);
				this.setSpeaking("caster-2", false);
			} else if (cycle === 3 || cycle === 4) {
				// Caster 2 responds
				this.setSpeaking("caster-1", false);
				this.setSpeaking("caster-2", true);
			} else {
				// Both silent or laughing
				this.setSpeaking("caster-1", false);
				this.setSpeaking("caster-2", false);
			}
		}, 1400);

		return true;
	}

	private bindControls() {
		if (typeof document === "undefined") return;

		const c1Btn = document.querySelector<HTMLButtonElement>("#simTalkCaster1Btn");
		const c2Btn = document.querySelector<HTMLButtonElement>("#simTalkCaster2Btn");
		const autoCasterBtn = document.querySelector<HTMLButtonElement>("#simAutoCasterBtn");
		const micCasterBtn = document.querySelector<HTMLButtonElement>("#simMicCasterBtn");

		const debugC1Btn = document.querySelector<HTMLButtonElement>("#debugSimTalkC1Btn");
		const debugC2Btn = document.querySelector<HTMLButtonElement>("#debugSimTalkC2Btn");
		const debugAutoCasterBtn = document.querySelector<HTMLButtonElement>("#debugSimAutoCasterBtn");

		const handleC1 = () => {
			const current = this.casters.find((c) => c.id === "caster-1")?.isSpeaking;
			this.setSpeaking("caster-1", !current);
		};

		const handleC2 = () => {
			const current = this.casters.find((c) => c.id === "caster-2")?.isSpeaking;
			this.setSpeaking("caster-2", !current);
		};

		const handleAuto = () => {
			const active = this.toggleAutoSpeechSimulation();
			if (autoCasterBtn) {
				autoCasterBtn.textContent = active ? "⏹️ Detener Charla" : "🎙️ Auto Casters";
				autoCasterBtn.classList.toggle("bg-emerald-600", active);
			}
			if (debugAutoCasterBtn) {
				debugAutoCasterBtn.textContent = active ? "⏹️ Detener Charla" : "🎙️ Simular Charla Casters";
				debugAutoCasterBtn.classList.toggle("bg-emerald-600", active);
			}
		};

		if (c1Btn) c1Btn.onclick = handleC1;
		if (debugC1Btn) debugC1Btn.onclick = handleC1;

		if (c2Btn) c2Btn.onclick = handleC2;
		if (debugC2Btn) debugC2Btn.onclick = handleC2;

		if (autoCasterBtn) autoCasterBtn.onclick = handleAuto;
		if (debugAutoCasterBtn) debugAutoCasterBtn.onclick = handleAuto;

		if (micCasterBtn) {
			micCasterBtn.onclick = async () => {
				const active = await this.toggleMicVAD("caster-1");
				micCasterBtn.textContent = active ? "🔴 Mic Activo (C1)" : "🎤 Probar Mic VAD";
				micCasterBtn.classList.toggle("bg-red-600", active);
			};
		}
	}
}
