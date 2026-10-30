import * as fs from "node:fs";
import * as http from "node:http";
import * as net from "node:net";
import * as path from "node:path";
import { WebSocket, WebSocketServer } from "ws";

export interface DiscordUser {
	id: string;
	username: string;
	displayName: string;
	avatarUrl: string;
	isSpeaking: boolean;
	mute: boolean;
	deaf: boolean;
	osuId?: string;
	osuAvatarUrl?: string;
}

export interface DiscordVoiceState {
	connectedToDiscord: boolean;
	currentChannelId: string | null;
	users: Map<string, DiscordUser>;
}

/**
 * Handles individual IPC Unix/named pipe socket connection to a Discord client instance.
 * Discord on Linux/Electron can spawn multiple sockets (e.g. discord-ipc-0, discord-ipc-1)
 * when multiple processes, windows, or profiles exist.
 */
class IPCSocketSession {
	readonly path: string;
	readonly bridge: DiscordIPCBridge;
	socket: net.Socket | null = null;
	isConnected = false;
	isAuthenticated = false;
	currentChannelId: string | null = null;
	subscribedChannelId: string | null = null;
	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private incomingBuffer = Buffer.alloc(0);
	destroyed = false;

	constructor(socketPath: string, bridge: DiscordIPCBridge) {
		this.path = socketPath;
		this.bridge = bridge;
	}

	connect() {
		if (this.destroyed) return;
		try {
			const socket = net.createConnection(this.path);
			this.socket = socket;

			socket.on("connect", () => {
				this.isConnected = true;
				console.log(`[DiscordBridge] Connected to IPC socket: ${this.path}`);
				// Handshake opcode 0
				this.sendFrame(0, {
					v: 1,
					client_id: "207646673902501888",
				});
			});

			socket.on("data", async (chunk: Buffer) => {
				this.incomingBuffer = Buffer.concat([this.incomingBuffer, chunk]);

				while (this.incomingBuffer.length >= 8) {
					const length = this.incomingBuffer.readInt32LE(4);
					if (this.incomingBuffer.length < 8 + length) {
						break;
					}

					const bodyStr = this.incomingBuffer.subarray(8, 8 + length).toString("utf8");
					this.incomingBuffer = this.incomingBuffer.subarray(8 + length);

					try {
						const body = JSON.parse(bodyStr);
						await this.handleMessage(body);
					} catch (err) {
						console.warn(`[DiscordBridge] [${this.path}] Error parsing IPC frame:`, err);
					}
				}
			});

			socket.on("error", () => {
				// Socket unreachable or closed; quietly clean up
			});

			socket.on("close", () => {
				this.cleanup();
				this.bridge.onSessionClosed(this);
			});
		} catch {
			this.cleanup();
			this.bridge.onSessionClosed(this);
		}
	}

	sendFrame(opcode: number, obj: unknown) {
		if (!this.socket || this.socket.destroyed) return;
		try {
			const payload = JSON.stringify(obj);
			const header = Buffer.alloc(8);
			header.writeInt32LE(opcode, 0);
			header.writeInt32LE(Buffer.byteLength(payload), 4);
			this.socket.write(Buffer.concat([header, Buffer.from(payload)]));
		} catch (err) {
			console.warn(`[DiscordBridge] [${this.path}] Failed to write IPC frame:`, err);
		}
	}

	private async handleMessage(body: any) {
		const { cmd, evt, data } = body;

		if (body.nonce !== "heartbeat_voice_poll" && evt !== "SPEAKING_START" && evt !== "SPEAKING_STOP") {
			console.log(`[DiscordBridge] [${this.path}] IPC -> cmd: ${cmd || "-"}, evt: ${evt || "-"}, data:`, JSON.stringify(data)?.slice(0, 110));
		}

		// 0. Handle OAuth error (token expired or revoked)
		if (evt === "ERROR") {
			if (body.nonce === "auth_cached_token" || cmd === "AUTHENTICATE") {
				console.log(`[DiscordBridge] [${this.path}] Cached OAuth token expired. Requesting fresh authorization...`);
				this.bridge.saveCachedToken(null);
				this.requestAuthorization();
				return;
			}
		}

		// 1. Initial Handshake ready -> Authenticate with cached token or Authorize
		if (evt === "READY") {
			const cachedToken = this.bridge.getCachedToken();
			if (cachedToken) {
				this.sendFrame(1, {
					cmd: "AUTHENTICATE",
					args: { access_token: cachedToken },
					nonce: "auth_cached_token",
				});
			} else {
				this.requestAuthorization();
			}
			return;
		}

		// 2. Authorize response -> Exchange code for token and save
		if (cmd === "AUTHORIZE" && data?.code) {
			await this.bridge.exchangeAndSaveToken(data.code, this);
			return;
		}

		// 3. Authenticated -> Subscribe to voice channel selection & query current channel
		if (cmd === "AUTHENTICATE") {
			this.isAuthenticated = true;
			console.log(`[DiscordBridge] [${this.path}] Successfully authenticated.`);

			this.sendFrame(1, {
				cmd: "SUBSCRIBE",
				args: {},
				evt: "VOICE_CHANNEL_SELECT",
				nonce: "sub_voice_select",
			});

			this.sendFrame(1, {
				cmd: "SUBSCRIBE",
				args: {},
				evt: "VOICE_CONNECTION_STATUS",
				nonce: "sub_voice_status",
			});

			this.queryVoiceChannel();
			this.startPolling();
			this.bridge.onSessionReady(this);
			return;
		}

		// 4. Voice Connection Status changed
		if (evt === "VOICE_CONNECTION_STATUS") {
			if (data?.state === "CONNECTED" || data?.state === "VOICE_CONNECTED") {
				this.queryVoiceChannel();
			}
			return;
		}

		// 5. Voice Channel Selected / Changed
		if (evt === "VOICE_CHANNEL_SELECT") {
			const channelId = data?.channel_id || null;
			this.handleChannelChange(channelId);
			if (channelId) {
				this.queryVoiceChannel();
			} else {
				this.bridge.onSessionVoiceChannel(this, null, []);
			}
			return;
		}

		// 6. Selected voice channel details received
		if (cmd === "GET_SELECTED_VOICE_CHANNEL") {
			const channelId = data?.id || null;
			this.handleChannelChange(channelId);
			const voiceStates = channelId && Array.isArray(data?.voice_states) ? data.voice_states : [];
			this.bridge.onSessionVoiceChannel(this, channelId, voiceStates);
			return;
		}

		// 7. Voice state events (joined, left, muted/deafened)
		if (evt === "VOICE_STATE_CREATE" || evt === "VOICE_STATE_DELETE" || evt === "VOICE_STATE_UPDATE") {
			this.bridge.onSessionVoiceState(this, evt, data);
			return;
		}

		// 8. Speaking Start / Stop
		if (evt === "SPEAKING_START" || evt === "SPEAKING_STOP") {
			const userId = data?.user_id;
			if (userId) {
				this.bridge.onSessionSpeaking(this, userId, evt === "SPEAKING_START");
			}
		}
	}

	private handleChannelChange(newChannelId: string | null) {
		if (this.currentChannelId !== newChannelId) {
			console.log(`[DiscordBridge] [${this.path}] Voice channel updated: ${this.currentChannelId} -> ${newChannelId}`);
			if (this.subscribedChannelId) {
				this.unsubscribeChannel(this.subscribedChannelId);
				this.subscribedChannelId = null;
			}
			this.currentChannelId = newChannelId;
			if (newChannelId) {
				this.subscribeChannel(newChannelId);
			}
		}
	}

	queryVoiceChannel() {
		this.sendFrame(1, {
			cmd: "GET_SELECTED_VOICE_CHANNEL",
			args: {},
			nonce: "heartbeat_voice_poll",
		});
	}

	private startPolling() {
		if (this.pollTimer) return;
		this.pollTimer = setInterval(() => {
			if (this.isConnected && this.isAuthenticated && this.socket && !this.socket.destroyed) {
				this.queryVoiceChannel();
			}
		}, 1200);
	}

	private subscribeChannel(channelId: string) {
		if (this.subscribedChannelId === channelId) return;
		this.subscribedChannelId = channelId;
		const events = ["SPEAKING_START", "SPEAKING_STOP", "VOICE_STATE_CREATE", "VOICE_STATE_UPDATE", "VOICE_STATE_DELETE"];
		for (const evt of events) {
			this.sendFrame(1, {
				cmd: "SUBSCRIBE",
				args: { channel_id: channelId },
				evt,
				nonce: `sub_${evt}_${channelId}`,
			});
		}
	}

	private unsubscribeChannel(channelId: string) {
		const events = ["SPEAKING_START", "SPEAKING_STOP", "VOICE_STATE_CREATE", "VOICE_STATE_UPDATE", "VOICE_STATE_DELETE"];
		for (const evt of events) {
			this.sendFrame(1, {
				cmd: "UNSUBSCRIBE",
				args: { channel_id: channelId },
				evt,
				nonce: `unsub_${evt}_${channelId}`,
			});
		}
	}

	private requestAuthorization() {
		this.sendFrame(1, {
			cmd: "AUTHORIZE",
			args: {
				client_id: "207646673902501888",
				scopes: ["rpc", "identify", "rpc.voice.read"],
			},
			nonce: "auth_init",
		});
	}

	cleanup() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
		this.isConnected = false;
		this.isAuthenticated = false;
	}

	destroy() {
		this.destroyed = true;
		this.cleanup();
	}
}

/**
 * Robust Zero-Bot Discord IPC Bridge with Multi-Socket Pooling.
 *
 * Scans all available `/run/user/{uid}/discord-ipc-*` (or named pipe) sockets simultaneously.
 * Automatically discovers which socket is connected to the active voice session (server or DM),
 * updates commentator rosters in real-time, queries osu! profile avatars asynchronously,
 * and broadcasts speaking events with zero external bot requirement.
 */
export class DiscordIPCBridge {
	private port: number;
	private wss: WebSocketServer | null = null;
	private httpServer: http.Server | null = null;

	private sessions = new Map<string, IPCSocketSession>();
	private activeSession: IPCSocketSession | null = null;
	private scanTimer: ReturnType<typeof setInterval> | null = null;

	private tokenFilePath = path.join(process.cwd(), ".discord_token.json");
	private osuCache = new Map<string, { osuId: string; avatarUrl: string } | null>();
	private failedPipes = new Map<string, number>();

	/**
	 * Feature flag: whether to automatically scrape/resolve osu! avatars
	 * by matching the user's Discord nickname to their osu! profile.
	 * Kept in codebase but disabled by default.
	 */
	public enableOsuAvatarResolution = process.env.ENABLE_OSU_AVATAR_RESOLUTION === "true";

	readonly state: DiscordVoiceState = {
		connectedToDiscord: false,
		currentChannelId: null,
		users: new Map(),
	};

	constructor(port = 24052) {
		this.port = port;
	}

	start() {
		this.initWebSocketServer();
		this.scanAndConnectSockets();

		// Rescan periodically for newly opened Discord instances or socket increments
		this.scanTimer = setInterval(() => {
			this.scanAndConnectSockets();
		}, 3000);
	}

	stop(cb?: () => void) {
		if (this.scanTimer) {
			clearInterval(this.scanTimer);
			this.scanTimer = null;
		}

		for (const session of this.sessions.values()) {
			session.destroy();
		}
		this.sessions.clear();
		this.activeSession = null;

		if (this.wss) {
			this.wss.close();
			this.wss = null;
		}

		if (this.httpServer) {
			const server = this.httpServer;
			this.httpServer = null;
			server.close(() => {
				cb?.();
			});
		} else {
			cb?.();
		}
	}

	getCachedToken(): string | null {
		try {
			if (fs.existsSync(this.tokenFilePath)) {
				const content = fs.readFileSync(this.tokenFilePath, "utf8");
				const json = JSON.parse(content);
				return json?.access_token || null;
			}
		} catch {}
		return null;
	}

	saveCachedToken(token: string | null) {
		try {
			if (token) {
				fs.writeFileSync(this.tokenFilePath, JSON.stringify({ access_token: token }, null, 2), "utf8");
			} else if (fs.existsSync(this.tokenFilePath)) {
				fs.unlinkSync(this.tokenFilePath);
			}
		} catch (err) {
			console.warn("[DiscordBridge] Failed to update token cache:", err);
		}
	}

	async exchangeAndSaveToken(code: string, _originSession: IPCSocketSession) {
		try {
			const res = await fetch("https://streamkit.discord.com/overlay/token", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code }),
			});
			const tokenRes = (await res.json()) as { access_token?: string };

			if (tokenRes?.access_token) {
				this.saveCachedToken(tokenRes.access_token);
				// Authenticate all active sessions
				for (const session of this.sessions.values()) {
					session.sendFrame(1, {
						cmd: "AUTHENTICATE",
						args: { access_token: tokenRes.access_token },
						nonce: "auth_token_confirm",
					});
				}
			}
		} catch (err) {
			console.warn("[DiscordBridge] Token exchange error:", err);
		}
	}

	private getCandidateSockets(): string[] {
		const isWin = process.platform === "win32";
		if (isWin) {
			const now = Date.now();
			const pipes: string[] = [];
			for (let i = 0; i < 10; i++) {
				const p = `\\\\.\\pipe\\discord-ipc-${i}`;
				const lastFailed = this.failedPipes.get(p) ?? 0;
				// On Windows, keep discord-ipc-0 and 1 responsive; back off higher index pipes
				if (i <= 1 || now - lastFailed > 15000) {
					pipes.push(p);
				}
			}
			return pipes;
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

		const existing = new Set<string>();
		for (const p of candidates) {
			try {
				if (fs.existsSync(p)) {
					existing.add(p);
				}
			} catch {}
		}

		return Array.from(existing);
	}

	private scanAndConnectSockets() {
		const candidatePaths = this.getCandidateSockets();

		for (const p of candidatePaths) {
			if (!this.sessions.has(p)) {
				const session = new IPCSocketSession(p, this);
				this.sessions.set(p, session);
				session.connect();
			}
		}

		// Clean up removed sockets
		for (const [p, session] of Array.from(this.sessions.entries())) {
			if (!candidatePaths.includes(p) || session.destroyed) {
				session.destroy();
				this.sessions.delete(p);
				if (this.activeSession === session) {
					this.activeSession = null;
					this.recalculateActiveSession();
				}
			}
		}
	}

	onSessionReady(session: IPCSocketSession) {
		this.failedPipes.delete(session.path);
		this.state.connectedToDiscord = true;
	}

	onSessionClosed(session: IPCSocketSession) {
		this.failedPipes.set(session.path, Date.now());
		this.sessions.delete(session.path);
		if (this.activeSession === session) {
			this.activeSession = null;
			this.recalculateActiveSession();
		}
		this.state.connectedToDiscord = Array.from(this.sessions.values()).some((s) => s.isConnected);
	}

	onSessionVoiceChannel(session: IPCSocketSession, channelId: string | null, voiceStates: any[]) {
		if (channelId) {
			if (this.activeSession !== session) {
				console.log(`[DiscordBridge] Active voice session routed to: ${session.path} (Channel ${channelId})`);
				this.activeSession = session;
			}
			this.state.currentChannelId = channelId;
			this.state.connectedToDiscord = true;
			this.updateRosterFromVoiceStates(voiceStates);
		} else if (this.activeSession === session) {
			// Current active session left voice; check if another session has an active voice channel
			const otherWithVoice = Array.from(this.sessions.values()).find(
				(s) => s !== session && s.currentChannelId !== null,
			);

			if (otherWithVoice) {
				console.log(`[DiscordBridge] Active voice session switching to: ${otherWithVoice.path}`);
				this.activeSession = otherWithVoice;
				this.state.currentChannelId = otherWithVoice.currentChannelId;
				otherWithVoice.queryVoiceChannel();
			} else {
				this.activeSession = null;
				this.state.currentChannelId = null;
				this.state.users.clear();
				this.broadcastRoster();
			}
		}
	}

	private recalculateActiveSession() {
		const withVoice = Array.from(this.sessions.values()).find((s) => s.currentChannelId !== null);
		if (withVoice) {
			this.activeSession = withVoice;
			this.state.currentChannelId = withVoice.currentChannelId;
			withVoice.queryVoiceChannel();
		} else {
			this.activeSession = null;
			this.state.currentChannelId = null;
			this.state.users.clear();
			this.broadcastRoster();
		}
	}

	onSessionSpeaking(session: IPCSocketSession, userId: string, isSpeaking: boolean) {
		if (this.activeSession === session || (!this.activeSession && session.currentChannelId)) {
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

	onSessionVoiceState(session: IPCSocketSession, evt: string, data: any) {
		if (this.activeSession !== session && this.activeSession !== null) {
			return;
		}

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

		if (evt === "VOICE_STATE_DELETE") {
			const userId = data?.user?.id || data?.user_id || data?.id;
			if (userId) {
				this.state.users.delete(userId);
				this.broadcastRoster();
			}
			return;
		}

		if (evt === "VOICE_STATE_UPDATE") {
			const user = data?.user;
			const userId = user?.id || data?.user_id;
			if (!userId) return;

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
		}
	}

	private updateRosterFromVoiceStates(voiceStates: any[]) {
		const newIds = new Set<string>();
		let rosterChanged = false;

		for (const vs of voiceStates) {
			const user = vs.user;
			if (!user?.id) continue;
			newIds.add(user.id);

			const existing = this.state.users.get(user.id);
			if (existing) {
				const nick = vs.nick || user.global_name || user.username;
				if (existing.displayName !== nick) {
					existing.displayName = nick;
					rosterChanged = true;
					this.enrichUserWithOsu(existing);
				}
				const newMute = Boolean(vs.voice_state?.mute ?? vs.mute);
				const newDeaf = Boolean(vs.voice_state?.deaf ?? vs.deaf);
				if (existing.mute !== newMute || existing.deaf !== newDeaf) {
					existing.mute = newMute;
					existing.deaf = newDeaf;
					rosterChanged = true;
				}
			} else {
				const newUser: DiscordUser = {
					id: user.id,
					username: user.username,
					displayName: vs.nick || user.global_name || user.username,
					avatarUrl: this.buildAvatarUrl(user.id, user.avatar, user.discriminator),
					isSpeaking: false,
					mute: Boolean(vs.voice_state?.mute ?? vs.mute),
					deaf: Boolean(vs.voice_state?.deaf ?? vs.deaf),
				};
				this.state.users.set(user.id, newUser);
				rosterChanged = true;
				this.enrichUserWithOsu(newUser);
			}
		}

		// Prune users that are no longer in this channel
		for (const id of Array.from(this.state.users.keys())) {
			if (!newIds.has(id)) {
				this.state.users.delete(id);
				rosterChanged = true;
			}
		}

		if (rosterChanged) {
			this.broadcastRoster();
		}
	}

	private async resolveOsuProfile(displayName: string): Promise<{ osuId: string; avatarUrl: string } | null> {
		const key = displayName.toLowerCase().trim();
		if (this.osuCache.has(key)) {
			return this.osuCache.get(key) || null;
		}

		const candidates = [
			displayName.trim(),
			displayName.replace(/^[\[\(][^\]\)]+[\]\)]\s*/, "").trim(),
			displayName.replace(/\s*\|.+$/, "").trim(),
			displayName.replace(/[^\w\s\-\[\]]/gi, "").trim(),
		];

		const uniqueCandidates = Array.from(new Set(candidates.filter((c) => c.length >= 2)));

		for (const candidate of uniqueCandidates) {
			try {
				const res = await fetch(`https://osu.ppy.sh/users/${encodeURIComponent(candidate)}`, {
					method: "HEAD",
					redirect: "manual",
				});

				const location = res.headers.get("location");
				if (location) {
					const match = location.match(/\/users\/(\d+)/);
					if (match && match[1]) {
						const result = {
							osuId: match[1],
							avatarUrl: `https://a.ppy.sh/${match[1]}`,
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
		// Auto-resolution by nickname is disabled by default; function remains preserved in codebase.
		if (!this.enableOsuAvatarResolution) {
			return;
		}

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

	private initWebSocketServer(retries = 10) {
		const server = http.createServer();
		this.httpServer = server;

		server.on("error", (err: any) => {
			if (err?.code === "EADDRINUSE") {
				if (retries > 0) {
					console.warn(`[DiscordBridge] Port ${this.port} is busy, retrying in 300ms... (${retries} attempts left)`);
					setTimeout(() => {
						this.initWebSocketServer(retries - 1);
					}, 300);
				} else {
					console.warn(`[DiscordBridge] Port ${this.port} is already in use: another bridge is probably open already.`);
				}
			} else {
				console.warn(`[DiscordBridge] Server error:`, err);
			}
		});

		// Loopback only: the overlay and the panel are on this machine, and on
		// Windows it keeps the firewall prompt away.
		server.listen(this.port, "127.0.0.1", () => {
			console.log(`[DiscordBridge] WebSocket broadcast server listening on ws://127.0.0.1:${this.port}`);
			const wss = new WebSocketServer({ server });
			this.wss = wss;

			wss.on("connection", (ws: WebSocket) => {
				console.log(`[DiscordBridge] Overlay client connected to WebSocket broadcast`);
				this.sendToClient(ws, {
					type: "discord_roster",
					connected: this.state.connectedToDiscord,
					channelId: this.state.currentChannelId,
					users: Array.from(this.state.users.values()),
				});
				// A control panel that joins late gets the overlay's last state.
				if (this.overlayState) ws.send(this.overlayState);
				ws.on("message", (data) => this.relay(ws, String(data)));
			});
		});
	}

	// Control relay: the control panel (a browser tab or an OBS dock) and the
	// overlay (an OBS browser source) run in different browsers, so they talk
	// through this server. Panel commands go to every other client; the
	// overlay's state goes to every other client and is kept for late joiners.
	private overlayState: string | null = null;

	private relay(from: WebSocket, raw: string) {
		let type: unknown;
		try {
			type = JSON.parse(raw)?.type;
		} catch {
			return;
		}
		if (type !== "control" && type !== "overlay_state") return;
		if (type === "overlay_state") this.overlayState = raw;
		if (!this.wss) return;
		for (const client of this.wss.clients) {
			if (client !== from && client.readyState === WebSocket.OPEN) client.send(raw);
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

	private broadcastRoster() {
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
