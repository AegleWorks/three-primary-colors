export interface Caster {
	id: string;
	name: string;
	avatarUrl: string;
	isSpeaking: boolean;
	discordId?: string;
}

export default class CasterHandler {
	casters: Caster[] = [];

	private container: HTMLElement | null = null;
	private discordWs: WebSocket | null = null;
	private isDiscordConnected = false;

	constructor(containerSelector = "#commentatorDeck") {
		this.container = document.querySelector<HTMLElement>(containerSelector);
		this.loadFromURLParams();
		this.render();
		this.initDiscordBridge();
	}

	/**
	 * Reads URL parameters to allow optional manual overrides via OBS Browser Source URL:
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

			if (c1Name && c1Img) {
				this.casters.push({
					id: "caster-1",
					name: c1Name,
					avatarUrl: c1Img,
					isSpeaking: false,
				});
			}
			if (c2Name && c2Img) {
				this.casters.push({
					id: "caster-2",
					name: c2Name,
					avatarUrl: c2Img,
					isSpeaking: false,
				});
			}
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
		if (this.casters.length === 0) return;

		for (const caster of this.casters) {
			const card = document.createElement("div");
			card.id = `caster-${caster.id}`;
			card.className =
				"flex flex-col items-center gap-1.5 transition-transform duration-150 select-none pointer-events-none";

			const ringClasses = caster.isSpeaking
				? "border-emerald-400 ring-4 ring-emerald-500/60 shadow-[0_0_22px_rgba(16,185,129,0.9)] scale-105"
				: "border-surface-1/80 ring-0 shadow-none scale-100 opacity-85";

			card.innerHTML = `
				<div class="relative">
					<img src="${caster.avatarUrl}" alt="${caster.name}"
						class="caster-avatar w-11 h-11 rounded-full object-cover border-2 transition-all duration-150 ${ringClasses}"
						onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"
					/>
				</div>
				<span class="caster-name px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-[11px] font-semibold text-white/90 border border-white/10 tracking-wide truncate max-w-[110px]">
					${caster.name}
				</span>
			`;

			this.container.appendChild(card);
		}
	}

	/**
	 * Updates the speaking state of a specific commentator.
	 */
	setSpeaking(casterId: string, isSpeaking: boolean) {
		const caster = this.casters.find(
			(c) => c.id === casterId || c.discordId === casterId,
		);
		if (!caster) return;

		if (caster.isSpeaking === isSpeaking) return;
		caster.isSpeaking = isSpeaking;

		this.updateCasterDOM(caster);
	}

	private updateCasterDOM(caster: Caster) {
		const safeId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(caster.id) : caster.id;
		const card = this.container?.querySelector(`#caster-${safeId}`);
		if (!card) return;

		const avatar = card.querySelector<HTMLElement>(".caster-avatar");

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
	}

	/**
	 * Connects to the local Discord IPC Bridge WebSocket to receive real commentator
	 * Discord avatars and speaking events with zero external bot requirement.
	 */
	private initDiscordBridge(wsUrl = "ws://127.0.0.1:24052") {
		if (typeof window === "undefined") return;

		let retryTimeout: ReturnType<typeof setTimeout> | null = null;

		const connect = () => {
			try {
				const ws = new WebSocket(wsUrl);
				this.discordWs = ws;

				ws.onopen = () => {
					this.isDiscordConnected = true;
					console.log("[CasterHandler] Connected to Discord IPC Bridge");
				};

				ws.onmessage = (event) => {
					try {
						const msg = JSON.parse(event.data);
						if (msg.type === "discord_roster" && Array.isArray(msg.users)) {
							this.casters = msg.users.map((u: any) => ({
								id: u.id,
								discordId: u.id,
								name: u.displayName || u.username,
								avatarUrl: u.avatarUrl,
								isSpeaking: Boolean(u.isSpeaking),
							}));
							this.render();
						} else if (msg.type === "discord_speaking") {
							this.setSpeaking(msg.userId, Boolean(msg.isSpeaking));
						}
					} catch (e) {
						console.warn("[CasterHandler] Discord message parse error:", e);
					}
				};

				ws.onclose = () => {
					this.isDiscordConnected = false;
					if (!retryTimeout) {
						retryTimeout = setTimeout(() => {
							retryTimeout = null;
							connect();
						}, 3500);
					}
				};

				ws.onerror = () => {
					ws.close();
				};
			} catch {
				if (!retryTimeout) {
					retryTimeout = setTimeout(() => {
						retryTimeout = null;
						connect();
					}, 3500);
				}
			}
		};

		connect();
	}

	disconnectDiscordBridge() {
		if (this.discordWs) {
			this.discordWs.close();
			this.discordWs = null;
		}
		this.isDiscordConnected = false;
	}

	get hasDiscordBridgeActive(): boolean {
		return this.isDiscordConnected;
	}
}
