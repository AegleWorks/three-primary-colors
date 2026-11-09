import { createHash, randomBytes, randomInt } from "node:crypto";
import { WebSocket } from "ws";
import { version } from "../../package.json";
import { normalizeCode, PANEL_URL, relayRoom, RELAY_URL, type RemoteStatus } from "../config/remote";

// The bridge's line to the relay (relay/ in this repo), off until the panel
// turns it on. It dials out, so the broadcaster opens no ports. The overlay's
// state goes out; commands come in, and only the ones a control panel can send
// get through. Discord's data and OBS never leave this machine.
const RELAY = process.env.REMPALAGO_RELAY || RELAY_URL;
// no 0/O, 1/I/L or U/V: a code gets read out over voice
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
const CODE_LENGTH = 12;
const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 30_000;
const KEEPALIVE_MS = 30_000;

const ACTIONS = new Set(["scene", "key", "timer", "draft", "draftReset", "draftRestore", "showcase", "poolReload", "twitch", "round", "qualifier", "sources"]);
// the overlay's shortcuts a panel offers in a release build
const KEYS = new Set(["t", "g", "m"]);

function allowed(raw: string) {
	try {
		const message = JSON.parse(raw);
		return message?.type === "control" && ACTIONS.has(message.action) && (message.action !== "key" || KEYS.has(message.key));
	} catch {
		return false;
	}
}

function newCode() {
	const chars = Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
	return chars.match(/.{4}/g)!.join("-");
}

export default class RemoteLink {
	private ws: WebSocket | null = null;
	private code = "";
	private token = "";
	private panels = 0;
	private retryMs = RETRY_MIN_MS;
	private retry: ReturnType<typeof setTimeout> | null = null;
	private keepalive: ReturnType<typeof setInterval> | null = null;

	constructor(
		private onCommand: (raw: string) => void,
		private onChange: (status: RemoteStatus) => void,
		private latestState: () => string | null,
	) {}

	get status(): RemoteStatus {
		const on = Boolean(this.code);
		return {
			type: "remote_status",
			version,
			available: Boolean(RELAY),
			on,
			online: this.ws?.readyState === WebSocket.OPEN,
			code: this.code,
			link: on ? `${PANEL_URL}/#${this.code}` : "",
			panels: this.panels,
		};
	}

	// Each time it turns on there's a new code, so an old one is worth nothing.
	start() {
		if (!RELAY || this.code) return;
		this.code = newCode();
		this.token = randomBytes(32).toString("hex");
		this.connect();
		this.onChange(this.status);
		console.log(`[Remote] Acceso remoto activado. Código: ${this.code}`);
	}

	stop() {
		if (!this.code) return;
		const ws = this.ws;
		this.ws = null;
		this.clearTimers();
		this.code = this.token = "";
		this.panels = 0;
		if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "end" }));
		ws?.close();
		this.onChange(this.status);
		console.log("[Remote] Acceso remoto cortado.");
	}

	forward(raw: string) {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(raw);
	}

	private clearTimers() {
		if (this.retry) clearTimeout(this.retry);
		if (this.keepalive) clearInterval(this.keepalive);
		this.retry = this.keepalive = null;
	}

	private connect() {
		const room = createHash("sha256").update(normalizeCode(this.code)).digest("hex");
		const ws = new WebSocket(`${relayRoom(RELAY, room)}?role=host&token=${this.token}`);
		this.ws = ws;
		ws.on("open", () => {
			this.retryMs = RETRY_MIN_MS;
			this.keepalive = setInterval(() => ws.ping(), KEEPALIVE_MS);
			const state = this.latestState();
			if (state) ws.send(state);
			this.onChange(this.status);
		});
		ws.on("message", (data) => this.receive(String(data)));
		ws.on("close", () => {
			if (this.ws !== ws) return;
			this.clearTimers();
			this.panels = 0;
			this.onChange(this.status);
			this.retry = setTimeout(() => this.connect(), this.retryMs);
			this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
		});
		ws.on("error", (err) => console.warn(`[Remote] Sin conexión con el relay: ${err.message}`));
	}

	private receive(raw: string) {
		if (allowed(raw)) return this.onCommand(raw);
		try {
			const message = JSON.parse(raw);
			if (message?.type !== "panels") return;
			// a panel that just joined shouldn't wait for the next heartbeat
			const state = message.count > this.panels ? this.latestState() : null;
			this.panels = Number(message.count) || 0;
			if (state) this.forward(state);
			this.onChange(this.status);
		} catch {}
	}
}
