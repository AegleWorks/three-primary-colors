import net from "node:net";
import fs from "node:fs";
import { WebSocketServer, WebSocket } from "ws";

export interface DiscordUser {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string;
	osuId?: string;
	osuAvatarUrl?: string;
	isSpeaking: boolean;
	mute: boolean;
	deaf: boolean;
}

export interface DiscordBridgeState {
	connectedToDiscord: boolean;
	currentChannelId: string | null;
	users: Map<string, DiscordUser>;
}

export class DiscordIPCBridge {
	private port: number;
	private wss: WebSocketServer | null = null;
	private ipcSocket: net.Socket | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private isConnecting = false;

	private state: DiscordBridgeState = {
		connectedToDiscord: false,
		currentChannelId: null,
		users: new Map(),
	};

	private subscribedChannelId: string | null = null;
	private osuCache = new Map<string, { osuId: string; avatarUrl: string } | null>();

	private extractPotentialUsernames(rawName: string): string[] {
		const names: string[] = [];
		const clean = rawName.trim();
		if (!clean) return names;
		names.push(clean);

		// Remove clan tag brackets: [XYZ] Name or (XYZ) Name
		const strippedBrackets = clean.replace(/^\[[^\]]+\]\s*/, "").replace(/^\([^\)]+\)\s*/, "").trim();
		if (strippedBrackets && !names.includes(strippedBrackets)) names.push(strippedBrackets);

		// Remove pipe prefix: XYZ | Name
		const strippedPipe = clean.replace(/^[^|]+\|\s*/, "").trim();
		if (strippedPipe && !names.includes(strippedPipe)) names.push(strippedPipe);

		// Remove trailing role info: Name (Caster) or Name [Caster]
		const strippedSuffix = clean.replace(/\s*(\[[^\]]+\]|\([^\)]+\))$/, "").trim();
		if (strippedSuffix && !names.includes(strippedSuffix)) names.push(strippedSuffix);

		return names;
	}

	private async resolveOsuProfile(nickname: string): Promise<{ osuId: string; avatarUrl: string } | null> {
		const candidates = this.extractPotentialUsernames(nickname);
		for (const candidate of candidates) {
			const key = candidate.toLowerCase();
			if (this.osuCache.has(key)) {
				const cached = this.osuCache.get(key);
				if (cached) return cached;
				continue;
			}

			try {
				const res = await fetch(`https://osu.ppy.sh/users/${encodeURIComponent(candidate)}`, {
					method: "HEAD",
					redirect: "manual",
					headers: { "User-Agent": "Mozilla/5.0 (VCL-Overlay/1.0)" },
				});

				const location = res.headers.get("location");
				if (location) {
					const match = location.match(/\/users\/(\d+)/);
					if (match && match[1]) {
						const osuId = match[1];
						const result = {
							osuId,
							avatarUrl: `https://a.ppy.sh/${osuId}`,
						};
						this.osuCache.set(key, result);
						return result;
					}
				}

				this.osuCache.set(key, null);
			} catch (err) {
				console.warn(`[DiscordBridge] Error checking osu user "${candidate}":`, err);
			}
		}

		return null;
	}

	private async enrichUserWithOsu(user: DiscordUser) {
		const targetId = user.id;
		const targetNick = user.displayName;
		const profile = await this.resolveOsuProfile(targetNick);

		const current = this.state.users.get(targetId);
		if (!current || current.displayName !== targetNick) return;

		if (profile) {
			current.osuId = profile.osuId;
			current.osuAvatarUrl = profile.avatarUrl;
			this.broadcastRoster();
		}
	}

	constructor(port = 24052) {
		this.port = port;
	}

	start() {
		this.initWebSocketServer();
		this.connectToDiscordIPC();
	}

	stop() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ipcSocket) {
			this.ipcSocket.destroy();
			this.ipcSocket = null;
		}

		if (this.wss) {
			this.wss.close();
			this.wss = null;
		}
	}

	private initWebSocketServer() {
		try {
			this.wss = new WebSocketServer({ port: this.port });

			this.wss.on("error", (err: any) => {
				if (err?.code === "EADDRINUSE") {
					console.warn(`[DiscordBridge] Port ${this.port} is already in use, reusing existing listener.`);
				} else {
					console.warn(`[DiscordBridge] WebSocket error:`, err);
				}
			});

			this.wss.on("listening", () => {
				console.log(`[DiscordBridge] WebSocket broadcast server listening on ws://127.0.0.1:${this.port}`);
			});

			this.wss.on("connection", (ws: WebSocket) => {
				// Send immediate current state
				this.sendToClient(ws, {
					type: "discord_roster",
					connected: this.state.connectedToDiscord,
					channelId: this.state.currentChannelId,
					users: Array.from(this.state.users.values()),
				});
			});
		} catch (err) {
			console.warn(`[DiscordBridge] Could not start WebSocketServer on port ${this.port}:`, err);
		}
	}

	private broadcast(payload: unknown) {
		if (!this.wss) return;
		const msg = JSON.stringify(payload);
		for (const client of this.wss.clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(msg);
			}
		}
	}

	private sendToClient(ws: WebSocket, payload: unknown) {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(payload));
		}
	}

	/**
	 * Scans candidate paths for the Discord local IPC socket.
	 */
	private findDiscordIPCSocket(): string | null {
		const isWin = process.platform === "win32";
		if (isWin) {
			return "\\\\.\\pipe\\discord-ipc-0";
		}

		const uid = process.getuid ? process.getuid() : 1000;
		const candidates: string[] = [];

		for (let i = 0; i < 10; i++) {
			candidates.push(`/run/user/${uid}/discord-ipc-${i}`);
			candidates.push(`/tmp/discord-ipc-${i}`);
			if (process.env.XDG_RUNTIME_DIR) {
				candidates.push(`${process.env.XDG_RUNTIME_DIR}/discord-ipc-${i}`);
			}
		}

		for (const p of candidates) {
			try {
				if (fs.existsSync(p)) {
					return p;
				}
			} catch {}
		}

		return null;
	}

	private sendIPCFrame(opcode: number, obj: unknown) {
		if (!this.ipcSocket || this.ipcSocket.destroyed) return;
		try {
			const payload = JSON.stringify(obj);
			const header = Buffer.alloc(8);
			header.writeInt32LE(opcode, 0);
			header.writeInt32LE(Buffer.byteLength(payload), 4);
			this.ipcSocket.write(Buffer.concat([header, Buffer.from(payload)]));
		} catch (err) {
			console.warn("[DiscordBridge] Failed to write IPC frame:", err);
		}
	}

	private scheduleReconnect() {
		if (this.reconnectTimer) return;
		this.state.connectedToDiscord = false;
		this.state.users.clear();
		this.broadcast({
			type: "discord_status",
			connected: false,
			message: "Connecting to Discord desktop client...",
		});

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connectToDiscordIPC();
		}, 3500);
	}

	private connectToDiscordIPC() {
		if (this.isConnecting) return;
		const socketPath = this.findDiscordIPCSocket();
		if (!socketPath) {
			this.scheduleReconnect();
			return;
		}

		this.isConnecting = true;
		const socket = net.createConnection(socketPath);
		this.ipcSocket = socket;

		socket.on("connect", () => {
			this.isConnecting = false;
			this.state.connectedToDiscord = true;
			console.log(`[DiscordBridge] Connected to Discord IPC via ${socketPath}`);

			// Opcode 0: Handshake with StreamKit client ID
			this.sendIPCFrame(0, {
				v: 1,
				client_id: "207646673902501888",
			});
		});

		let incomingBuffer = Buffer.alloc(0);

		socket.on("data", async (chunk: Buffer) => {
			incomingBuffer = Buffer.concat([incomingBuffer, chunk]);

			while (incomingBuffer.length >= 8) {
				const length = incomingBuffer.readInt32LE(4);

				if (incomingBuffer.length < 8 + length) {
					break;
				}

				const bodyStr = incomingBuffer.subarray(8, 8 + length).toString("utf8");
				incomingBuffer = incomingBuffer.subarray(8 + length);

				try {
					const body = JSON.parse(bodyStr);
					await this.handleIPCMessage(body);
				} catch (err) {
					console.warn("[DiscordBridge] Error parsing IPC frame:", err);
				}
			}
		});

		socket.on("error", (err) => {
			console.warn("[DiscordBridge] Discord IPC socket error:", err.message);
			this.isConnecting = false;
		});

		socket.on("close", () => {
			console.log("[DiscordBridge] Discord IPC socket closed");
			this.ipcSocket = null;
			this.isConnecting = false;
			this.scheduleReconnect();
		});
	}

	private async handleIPCMessage(body: any) {
		const { cmd, evt, data } = body;

		// 1. Initial Handshake ready -> Authorize StreamKit
		if (evt === "READY") {
			this.sendIPCFrame(1, {
				cmd: "AUTHORIZE",
				args: {
					client_id: "207646673902501888",
					scopes: ["rpc", "identify", "rpc.voice.read"],
				},
				nonce: "auth_init",
			});
			return;
		}

		// 2. Authorize response -> Exchange code for token
		if (cmd === "AUTHORIZE" && data?.code) {
			try {
				const res = await fetch("https://streamkit.discord.com/overlay/token", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ code: data.code }),
				});
				const tokenRes = (await res.json()) as { access_token?: string };

				if (tokenRes?.access_token) {
					this.sendIPCFrame(1, {
						cmd: "AUTHENTICATE",
						args: {
							access_token: tokenRes.access_token,
						},
						nonce: "auth_token_confirm",
					});
				}
			} catch (err) {
				console.warn("[DiscordBridge] Token exchange error:", err);
			}
			return;
		}

		// 3. Authenticated -> Subscribe to voice channel selection and fetch current channel
		if (cmd === "AUTHENTICATE") {
			console.log("[DiscordBridge] Successfully authenticated with Discord client.");

			this.sendIPCFrame(1, {
				cmd: "SUBSCRIBE",
				args: {},
				evt: "VOICE_CHANNEL_SELECT",
				nonce: "sub_voice_select",
			});

			this.sendIPCFrame(1, {
				cmd: "GET_SELECTED_VOICE_CHANNEL",
				args: {},
				nonce: "get_selected_voice",
			});
			return;
		}

		// 4. Voice Channel Selected / Changed
		// 4. Voice Channel Selected / Changed
		if (evt === "VOICE_CHANNEL_SELECT") {
			const channelId = data?.channel_id || null;

			if (this.state.currentChannelId !== channelId) {
				if (this.subscribedChannelId) {
					this.unsubscribeFromChannelEvents(this.subscribedChannelId);
					this.subscribedChannelId = null;
				}

				this.state.currentChannelId = channelId;
				this.state.users.clear();
				this.broadcastRoster();
			}

			if (channelId) {
				this.sendIPCFrame(1, {
					cmd: "GET_SELECTED_VOICE_CHANNEL",
					args: {},
					nonce: "refresh_selected_voice",
				});
			}
			return;
		}

		// 5. Selected voice channel details received
		if (cmd === "GET_SELECTED_VOICE_CHANNEL") {
			const channelId = data?.id;
			this.state.currentChannelId = channelId || null;

			if (channelId) {
				this.subscribeToChannelEvents(channelId);
				this.updateRosterFromVoiceStates(data?.voice_states || []);
			} else {
				this.state.users.clear();
				this.broadcastRoster();
			}
			return;
		}

		// 6. Voice State Create (User joined channel)
		if (evt === "VOICE_STATE_CREATE") {
			const user = data?.user;
			if (user?.id) {
				const newUser: DiscordUser = {
					id: user.id,
					username: user.username,
					displayName: data.nick || user.global_name || user.username,
					avatarUrl: this.buildAvatarUrl(user.id, user.avatar, user.discriminator),
					isSpeaking: false,
					mute: Boolean(data.voice_state?.mute ?? data.mute),
					deaf: Boolean(data.voice_state?.deaf ?? data.deaf),
				};
				this.state.users.set(user.id, newUser);
				this.broadcastRoster();
				this.enrichUserWithOsu(newUser);
			}
			return;
		}

		// 7. Voice State Delete (User left channel)
		if (evt === "VOICE_STATE_DELETE") {
			const userId = data?.user?.id || data?.user_id || data?.id;
			if (userId) {
				this.state.users.delete(userId);
				this.broadcastRoster();
			}
			return;
		}

		// 8. Voice State Update (Mute, Deafen, or Channel Switch)
		if (evt === "VOICE_STATE_UPDATE") {
			const user = data?.user;
			const userId = user?.id || data?.user_id;
			if (!userId) return;

			// If user has moved to another channel or left
			if (data.channel_id && data.channel_id !== this.state.currentChannelId) {
				this.state.users.delete(userId);
				this.broadcastRoster();
				return;
			}

			const existing = this.state.users.get(userId);
			if (existing) {
				const prevNick = existing.displayName;
				if (data.nick) existing.displayName = data.nick;
				if (data.voice_state?.mute !== undefined || data.mute !== undefined) {
					existing.mute = Boolean(data.voice_state?.mute ?? data.mute);
					existing.deaf = Boolean(data.voice_state?.deaf ?? data.deaf);
				}
				this.broadcastRoster();
				if (data.nick && data.nick !== prevNick) {
					this.enrichUserWithOsu(existing);
				}
			} else if (user) {
				const newUser: DiscordUser = {
					id: user.id,
					username: user.username,
					displayName: data.nick || user.global_name || user.username,
					avatarUrl: this.buildAvatarUrl(user.id, user.avatar, user.discriminator),
					isSpeaking: false,
					mute: Boolean(data.voice_state?.mute ?? data.mute),
					deaf: Boolean(data.voice_state?.deaf ?? data.deaf),
				};
				this.state.users.set(user.id, newUser);
				this.broadcastRoster();
				this.enrichUserWithOsu(newUser);
			}
			return;
		}

		// 9. Speaking Start / Stop events
		if (evt === "SPEAKING_START" || evt === "SPEAKING_STOP") {
			const userId = data?.user_id;
			const isSpeaking = evt === "SPEAKING_START";

			if (userId) {
				const user = this.state.users.get(userId);
				if (user) {
					user.isSpeaking = isSpeaking;
				}

				this.broadcast({
					type: "discord_speaking",
					userId,
					isSpeaking,
				});
			}
		}
	}

	private broadcastRoster() {
		this.broadcast({
			type: "discord_roster",
			connected: true,
			channelId: this.state.currentChannelId,
			users: Array.from(this.state.users.values()),
		});
	}

	private unsubscribeFromChannelEvents(channelId: string) {
		const events = [
			"SPEAKING_START",
			"SPEAKING_STOP",
			"VOICE_STATE_CREATE",
			"VOICE_STATE_UPDATE",
			"VOICE_STATE_DELETE",
		];
		for (const evt of events) {
			this.sendIPCFrame(1, {
				cmd: "UNSUBSCRIBE",
				args: { channel_id: channelId },
				evt,
				nonce: `unsub_${evt}_${channelId}`,
			});
		}
	}

	private subscribeToChannelEvents(channelId: string) {
		if (this.subscribedChannelId === channelId) return;

		if (this.subscribedChannelId) {
			this.unsubscribeFromChannelEvents(this.subscribedChannelId);
		}

		this.subscribedChannelId = channelId;

		const events = [
			"SPEAKING_START",
			"SPEAKING_STOP",
			"VOICE_STATE_CREATE",
			"VOICE_STATE_UPDATE",
			"VOICE_STATE_DELETE",
		];
		for (const evt of events) {
			this.sendIPCFrame(1, {
				cmd: "SUBSCRIBE",
				args: { channel_id: channelId },
				evt,
				nonce: `sub_${evt}_${channelId}`,
			});
		}
	}

	private updateRosterFromVoiceStates(voiceStates: any[]) {
		this.state.users.clear();

		for (const vs of voiceStates) {
			const user = vs.user;
			if (!user?.id) continue;

			const discordUser: DiscordUser = {
				id: user.id,
				username: user.username,
				displayName: vs.nick || user.global_name || user.username,
				avatarUrl: this.buildAvatarUrl(user.id, user.avatar, user.discriminator),
				isSpeaking: false,
				mute: Boolean(vs.voice_state?.mute ?? vs.mute),
				deaf: Boolean(vs.voice_state?.deaf ?? vs.deaf),
			};

			this.state.users.set(user.id, discordUser);
			this.enrichUserWithOsu(discordUser);
		}

		this.broadcastRoster();
	}

	private buildAvatarUrl(userId: string, avatarHash?: string, discriminator = "0"): string {
		if (avatarHash) {
			const ext = avatarHash.startsWith("a_") ? "gif" : "png";
			return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=128`;
		}
		const index = parseInt(discriminator, 10) % 5 || 0;
		return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
	}
}

// Standalone execution support
if (process.argv[1] && process.argv[1].includes("DiscordIPCBridge")) {
	const bridge = new DiscordIPCBridge();
	bridge.start();

	process.on("SIGINT", () => {
		bridge.stop();
		process.exit(0);
	});
}
