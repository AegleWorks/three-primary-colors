import { resolveCasterProfile } from "../config/casters";

export interface Caster {
	id: string;
	name: string;
	avatarUrl: string;
	isSpeaking: boolean;
	discordId?: string;
	osuId?: string | number;
}

export default class CasterHandler {
	casters: Caster[] = [];

	private listeners: ((casters: Caster[]) => void)[] = [];
	private discordWs: WebSocket | null = null;
	private isDiscordConnected = false;

	constructor() {
		this.loadFromURLParams();
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

			// Up to four seats: ?c1=Name&c1img=URL ... ?c4=Name&c4img=URL
			for (let n = 1; n <= 4; n++) {
				const name = params.get(`c${n}`) || params.get(`caster${n}`);
				const img = params.get(`c${n}img`) || params.get(`avatar${n}`) || params.get(`c${n}Avatar`);
				if (name && img) {
					this.casters.push({
						id: `caster-${n}`,
						name,
						avatarUrl: img,
						isSpeaking: false,
					});
				}
			}
		} catch (e) {
			console.warn("[CasterHandler] Could not parse query params", e);
		}
	}

	/**
	 * Subscribes to roster and speaking changes. The listener runs once now.
	 */
	onChange(listener: (casters: Caster[]) => void) {
		this.listeners.push(listener);
		listener(this.casters);
	}

	private emit() {
		for (const listener of this.listeners) listener(this.casters);
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

		this.emit();
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
							this.casters = msg.users.map((u: any) => {
								const profile = resolveCasterProfile(u);
								return {
									id: u.id,
									discordId: u.id,
									name: profile.name,
									avatarUrl: profile.avatarUrl,
									osuId: profile.osuId,
									isSpeaking: Boolean(u.isSpeaking),
								};
							});
							this.emit();
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
