import { DurableObject } from "cloudflare:workers";

// The relay between a broadcast's bridge and the remote control panels. The
// bridge dials out to its room, so the broadcaster opens no ports. A room is the
// SHA-256 of the access code: the panel hashes the code in the browser and the
// relay never sees it. Only commands go to the bridge and only the overlay's
// state comes back; the bridge has the last word on which commands it runs.
//
//   /room/<hash>?role=host&token=...   the bridge; the first token owns the room
//   /room/<hash>?role=panel            a panel; the room must already exist

interface Env {
	ROOMS: DurableObjectNamespace<Room>;
	ALLOWED_ORIGINS: string;
}

const MAX_PANELS = 4;
const MAX_COMMAND_BYTES = 2048;
// A bridge that drops and never comes back: its room goes after this long.
const ABANDONED_MS = 60 * 60 * 1000;

const CLOSE_NOT_FOUND = 4404;
const CLOSE_FULL = 4409;
const CLOSE_ENDED = 4410;

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const room = url.pathname.match(/^\/room\/([0-9a-f]{64})$/)?.[1];
		if (!room) return new Response("Not found", { status: 404 });
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
		const role = url.searchParams.get("role");
		if (role === "panel") {
			// the bridge isn't a browser and sends no Origin
			const origin = request.headers.get("Origin") ?? "";
			if (!env.ALLOWED_ORIGINS.split(",").includes(origin)) return new Response("Forbidden", { status: 403 });
		} else if (role !== "host") {
			return new Response("Unknown role", { status: 400 });
		}
		return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
	},
};

const sha256 = async (text: string) => {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

export class Room extends DurableObject<Env> {
	private open(tag: string) {
		return this.ctx.getWebSockets(tag).filter((ws) => ws.readyState === WebSocket.OPEN);
	}

	private tellHost() {
		const message = JSON.stringify({ type: "panels", count: this.open("panel").length });
		for (const host of this.open("host")) host.send(message);
	}

	// Refuses with a code the browser can read, which a failed upgrade can't give it.
	private refuse(code: number, reason: string) {
		const { 0: client, 1: server } = new WebSocketPair();
		server.accept();
		server.close(code, reason);
		return new Response(null, { status: 101, webSocket: client });
	}

	async fetch(request: Request) {
		const url = new URL(request.url);
		const owner = await this.ctx.storage.get<string>("owner");
		const { 0: client, 1: server } = new WebSocketPair();

		if (url.searchParams.get("role") === "host") {
			const token = url.searchParams.get("token");
			if (!token) return new Response("Forbidden", { status: 403 });
			const hash = await sha256(token);
			if (owner && owner !== hash) return new Response("Forbidden", { status: 403 });
			if (!owner) await this.ctx.storage.put("owner", hash);
			for (const old of this.open("host")) old.close(1012, "replaced");
			await this.ctx.storage.deleteAlarm();
			this.ctx.acceptWebSocket(server, ["host"]);
			this.tellHost();
			return new Response(null, { status: 101, webSocket: client });
		}

		if (!owner) return this.refuse(CLOSE_NOT_FOUND, "no room");
		if (this.open("panel").length >= MAX_PANELS) return this.refuse(CLOSE_FULL, "full");
		this.ctx.acceptWebSocket(server, ["panel"]);
		this.tellHost();
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== "string") return;
		const fromHost = this.ctx.getTags(ws).includes("host");
		if (!fromHost && message.length > MAX_COMMAND_BYTES) return;
		let type: unknown;
		try {
			type = JSON.parse(message)?.type;
		} catch {
			return;
		}
		if (fromHost) {
			if (type === "end") await this.end();
			else if (type === "overlay_state" || type === "overlay_gone") for (const panel of this.open("panel")) panel.send(message);
		} else if (type === "control") {
			for (const host of this.open("host")) host.send(message);
		}
	}

	async webSocketClose(ws: WebSocket, code: number) {
		try {
			ws.close(code === 1005 || code === 1006 ? 1000 : code);
		} catch {
			// already closed
		}
		if (!this.ctx.getTags(ws).includes("host")) this.tellHost();
		else if (!this.open("host").length && (await this.ctx.storage.get("owner"))) await this.ctx.storage.setAlarm(Date.now() + ABANDONED_MS);
	}

	async alarm() {
		await this.end();
	}

	// The code stops working the moment the room goes: nothing of it is left.
	private async end() {
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.close(CLOSE_ENDED, "ended");
			} catch {
				// already closed
			}
		}
	}
}
