import type { RemoteStatus } from "../config/remote";
import type { SourcesState } from "../oro/sources";
import type { BattleCover, BattleState } from "../oro/battle";
import type { Draft, SceneName, Side } from "../oro/stage.js";

// The wire between the control panel and the overlay, relayed by the bridge
// server (src/server/DiscordIPCBridge.ts). Reconnects on drop.

export type DraftEdit = "pick" | "ban" | "win" | "clear";
// what a draft is made of, without what osu! decides (the map in play)
export type DraftSnapshot = Pick<Draft, "bans" | "picks" | "tbWon">;

export type Command =
	| { action: "scene"; scene: SceneName }
	| { action: "key"; key: string }
	| { action: "timer"; seconds: number | null }
	| { action: "draft"; id: string; side: Side; edit: DraftEdit }
	| { action: "draftReset" }
	// the series by hand, when osu!'s stars came out wrong
	| { action: "stars"; stars: Record<Side, number> }
	// who picks next, by hand; null goes back to taking turns
	| { action: "nextPicker"; side: Side | null }
	// both players' numbers to 0 once the song is over (tosu keeps the last play's)
	| { action: "clearScores" }
	// puts the whole draft back as it was: the panel's undo
	| { action: "draftRestore"; draft: DraftSnapshot }
	| { action: "showcase"; id: string }
	| { action: "poolReload" }
	| { action: "twitch"; channel: string }
	| { action: "round"; round: string }
	// the qualifiers scene's player, by position in the countdown (last seed first)
	| { action: "qualifier"; index: number }
	// which sheet tab the match plays and the results scene shows, by gid, and
	// the results scene's scores file; refresh looks for new tabs
	| { action: "sources"; pool?: number; results?: number; file?: string; refresh?: boolean }
	// the Battle Royale event: the winner, the window cover, the room by hand
	| {
			action: "battle";
			winner?: string | null;
			cover?: BattleCover;
			add?: string;
			remove?: string;
			reset?: boolean;
			// the BR mappool: the map coming up, a map played or not by hand,
			// all unplayed again, the sheet read again
			next?: string | null;
			played?: string;
			poolReset?: boolean;
			poolReload?: boolean;
	  };

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
	// the Twitch channels the overlay can read, the one it reads, and whether
	// it has joined it yet
	twitch: { channels: string[]; channel: string; status: "off" | "connecting" | "joined" };
	// the qualifiers scene: every player in seed order and the one it shows
	qualifiers: { players: { name: string; seed: number }[]; index: number };
	// the sheet's tabs and which one each part reads
	sources: SourcesState;
	// the Battle Royale event (absent from overlays older than it)
	battle?: BattleState;
}

// overlay_gone: the bridge saw that overlay's socket close (bridges older than
// it never say so, and the ten-second timeout covers it)
type Message = ({ type: "control" } & Command) | ({ type: "overlay_state" } & OverlayState) | { type: "overlay_gone"; id: string } | RemoteStatus | { type: "remote"; on: boolean };

export default class ControlLink {
	private ws: WebSocket | null = null;
	private handlers: ((message: Message) => void)[] = [];
	// the bridge says it once on connecting, maybe before anyone is listening
	private remoteStatus: RemoteStatus | null = null;

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

	onGone(fn: (id: string) => void) {
		this.handlers.push((m) => m.type === "overlay_gone" && typeof m.id === "string" && fn(m.id));
	}

	onRemoteStatus(fn: (status: RemoteStatus) => void) {
		if (this.remoteStatus) fn(this.remoteStatus);
		this.handlers.push((m) => m.type === "remote_status" && fn(m));
	}

	setRemote(on: boolean) {
		this.raw({ type: "remote", on });
	}

	onStatus?: (connected: boolean) => void;
	// The relay turned this link away for good (a 44xx close): retrying won't help.
	onRefused?: (code: number) => void;

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
				if (message.type === "remote_status") this.remoteStatus = message;
				for (const handler of this.handlers) handler(message);
			} catch {}
		};
		ws.onclose = ({ code }) => {
			this.onStatus?.(false);
			if (code >= 4400 && code < 4500) this.onRefused?.(code);
			else setTimeout(() => this.connect(), 2000);
		};
		ws.onerror = () => ws.close();
	}
}
