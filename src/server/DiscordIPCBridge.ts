import net from "node:net";
import fs from "node:fs";
import { WebSocketServer, WebSocket } from "ws";

export interface DiscordUser {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string;
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
		if (evt === "VOICE_CHANNEL_SELECT") {
			const channelId = data?.channel_id;
			this.state.currentChannelId = channelId;

			if (!channelId) {
				this.state.users.clear();
				this.broadcast({
					type: "discord_roster",
					connected: true,
					channelId: null,
					users: [],
				});
			} else {
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
				this.broadcast({
					type: "discord_roster",
					connected: true,
					channelId: null,
					users: [],
				});
			}
			return;
		}

		// 6. Voice State Update (Join, Leave, Mute, Deafen)
		if (evt === "VOICE_STATE_UPDATE") {
			const user = data?.user;
			if (!user?.id) return;

			if (data.voice_state?.mute !== undefined || data.mute !== undefined) {
				const existing = this.state.users.get(user.id);
				if (existing) {
					existing.mute = Boolean(data.voice_state?.mute || data.mute);
					existing.deaf = Boolean(data.voice_state?.deaf || data.deaf);
				} else {
					const newUser: DiscordUser = {
						id: user.id,
						username: user.username,
						displayName: data.nick || user.global_name || user.username,
						avatarUrl: this.buildAvatarUrl(user.id, user.avatar, user.discriminator),
						isSpeaking: false,
						mute: Boolean(data.voice_state?.mute || data.mute),
						deaf: Boolean(data.voice_state?.deaf || data.deaf),
					};
					this.state.users.set(user.id, newUser);
				}

				this.broadcast({
					type: "discord_roster",
					connected: true,
					channelId: this.state.currentChannelId,
					users: Array.from(this.state.users.values()),
				});
			}
			return;
		}

		// 7. Speaking Start / Stop events
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

	private subscribeToChannelEvents(channelId: string) {
		if (this.subscribedChannelId === channelId) return;
		this.subscribedChannelId = channelId;

		this.sendIPCFrame(1, {
			cmd: "SUBSCRIBE",
			args: { channel_id: channelId },
			evt: "SPEAKING_START",
			nonce: `sub_speaking_start_${channelId}`,
		});

		this.sendIPCFrame(1, {
			cmd: "SUBSCRIBE",
			args: { channel_id: channelId },
			evt: "SPEAKING_STOP",
			nonce: `sub_speaking_stop_${channelId}`,
		});

		this.sendIPCFrame(1, {
			cmd: "SUBSCRIBE",
			args: { channel_id: channelId },
			evt: "VOICE_STATE_UPDATE",
			nonce: `sub_voice_update_${channelId}`,
		});
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
				mute: Boolean(vs.voice_state?.mute || vs.mute),
				deaf: Boolean(vs.voice_state?.deaf || vs.deaf),
			};

			this.state.users.set(user.id, discordUser);
		}

		this.broadcast({
			type: "discord_roster",
			connected: true,
			channelId: this.state.currentChannelId,
			users: Array.from(this.state.users.values()),
		});
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
