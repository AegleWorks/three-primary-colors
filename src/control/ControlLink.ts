import type { Draft, SceneName, Side } from "../oro/stage.js";

// The wire between the control panel and the overlay, relayed by the bridge
// server (src/server/DiscordIPCBridge.ts). Reconnects on drop.

export type DraftEdit = "pick" | "ban" | "win" | "clear";

export type Command =
	| { action: "scene"; scene: SceneName }
	| { action: "key"; key: string }
	| { action: "timer"; seconds: number | null }
	| { action: "draft"; id: string; side: Side; edit: DraftEdit }
	| { action: "draftReset" }
	| { action: "showcase"; id: string }
	| { action: "poolReload" }
	| { action: "round"; round: string };

export interface OverlayState {
	// one per overlay page load; several overlays can be open at once
	id: string;
	// true inside an OBS browser source
	obs: boolean;
	scene: string;
	round: string;
	live: boolean;
	names: Record<Side, string>;
	stars: Record<Side, number>;
	// the map in play: its pool slot ("" outside the pool) and title
	map: { id: string; title: string };
	pool: { id: string; set: number; title: string; artist: string; diff: string; mapper: string; sr: number; bpm: number; len: string }[];
	draft: Draft;
	// the pool slot the showcase features
	showcase: string;
	// where the pool came from, or what went wrong loading it
	poolStatus: { ok: boolean; text: string };
}

type Message = ({ type: "control" } & Command) | ({ type: "overlay_state" } & OverlayState);

export default class ControlLink {
	private ws: WebSocket | null = null;
	private handlers: ((message: Message) => void)[] = [];

	constructor(private url = "ws://127.0.0.1:24052") {
		this.connect();
	}

	get connected() {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	send(command: Command) {
		this.raw({ type: "control", ...command });
	}

	publish(state: OverlayState) {
		this.raw({ type: "overlay_state", ...state });
	}

	onCommand(fn: (command: Command) => void) {
		this.handlers.push((m) => m.type === "control" && fn(m));
	}

	onState(fn: (state: OverlayState) => void) {
		this.handlers.push((m) => m.type === "overlay_state" && fn(m));
	}

	onStatus?: (connected: boolean) => void;

	private raw(message: Message) {
		if (this.connected) this.ws!.send(JSON.stringify(message));
	}

	private connect() {
		const ws = new WebSocket(this.url);
		this.ws = ws;
		ws.onopen = () => this.onStatus?.(true);
		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				for (const handler of this.handlers) handler(message);
			} catch {}
		};
		ws.onclose = () => {
			this.onStatus?.(false);
			setTimeout(() => this.connect(), 2000);
		};
		ws.onerror = () => ws.close();
	}
}
