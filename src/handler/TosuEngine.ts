// tosu's WebSocket, read key by key: the same contract as @fukutotojido/z-engine
// (register(key, cb) runs cb(old, new, data) whenever the value at that dotted
// path changes), plus what z-engine lacks: it reconnects. z-engine opens one
// socket and never tries again, so a tosu restart, a crash or a dropped socket
// left the overlay and the panel frozen on the last frame until someone
// refreshed the browser source.
//
// The cache survives a reconnect, so the first frame afterwards only fires the
// keys that really changed while tosu was away.

// biome-ignore lint/suspicious/noExplicitAny: tosu payload, typed by each callback
export type Callback = (oldValue: any, newValue: any, data: Record<string, any>) => void;

const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 5_000;
// tosu sends many frames a second; this long without one is a dead socket
const SILENT_MS = 15_000;

export default class TosuEngine {
	// biome-ignore lint/suspicious/noExplicitAny: tosu payload
	cache: any = {};
	private entries = new Map<string, Set<Callback>>();
	private ws: WebSocket | null = null;
	private retryMs = RETRY_MIN_MS;
	private lastFrame = 0;
	private watchdog: ReturnType<typeof setInterval> | null = null;
	connected = false;
	// told when the socket opens or closes
	onStatus?: (connected: boolean) => void;
	private frameListeners: (() => void)[] = [];

	// Runs after every frame tosu sends, once the keys have fired. What has to
	// keep up with the match even when nothing is being drawn hangs here, not
	// on requestAnimationFrame: a browser stops animation frames for a page
	// that isn't painted (an OBS source hidden or off the program scene, a
	// covered window), and the scores and the map's end stopped with them.
	onFrame(fn: () => void) {
		this.frameListeners.push(fn);
	}

	constructor(
		private url: string,
		private filters: unknown[] = [],
	) {
		this.connect();
	}

	register<T extends Callback>(key: string, callback: T): T {
		let set = this.entries.get(key);
		if (!set) this.entries.set(key, (set = new Set()));
		set.add(callback);
		return callback;
	}

	unregister(key: string, callback: Callback) {
		const set = this.entries.get(key);
		set?.delete(callback);
		if (set?.size === 0) this.entries.delete(key);
	}

	// biome-ignore lint/suspicious/noExplicitAny: tosu payload
	update(next: any) {
		for (const [key, callbacks] of this.entries) {
			const oldValue = this.search(key, this.cache);
			const newValue = this.search(key, next);
			if (oldValue === newValue) continue;
			for (const callback of callbacks) callback(oldValue, newValue, next);
		}
		this.cache = next;
	}

	// The value at a dotted path; a primitive met on the way is returned as is
	// (z-engine's behaviour, which the callbacks were written against).
	search(key: string, obj: unknown): unknown {
		let curr = obj;
		for (const attr of key.split(".")) {
			if (!(curr instanceof Object)) return curr;
			curr = (curr as Record<string, unknown>)[attr];
		}
		return curr;
	}

	private connect() {
		let ws: WebSocket;
		try {
			ws = new WebSocket(this.url);
		} catch {
			this.retry();
			return;
		}
		this.ws = ws;
		ws.onopen = () => {
			this.retryMs = RETRY_MIN_MS;
			this.lastFrame = Date.now();
			ws.send(`applyFilters:${JSON.stringify(this.filters)}`);
			this.setConnected(true);
			this.startWatchdog(ws);
		};
		ws.onmessage = (event) => {
			this.lastFrame = Date.now();
			let data: unknown;
			try {
				data = JSON.parse(String(event.data));
			} catch {
				return;
			}
			this.update(data);
			for (const fn of this.frameListeners) {
				try {
					fn();
				} catch (e) {
					console.error("[tosu] frame listener failed:", e);
				}
			}
		};
		ws.onerror = () => ws.close();
		ws.onclose = () => {
			if (this.ws !== ws) return;
			this.ws = null;
			this.stopWatchdog();
			this.setConnected(false);
			this.retry();
		};
	}

	private retry() {
		const wait = this.retryMs;
		this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
		setTimeout(() => this.connect(), wait);
	}

	// A socket that stays open but stops talking (tosu hung, osu! closed under
	// it) is closed so it reconnects.
	private startWatchdog(ws: WebSocket) {
		this.stopWatchdog();
		this.watchdog = setInterval(() => {
			if (Date.now() - this.lastFrame > SILENT_MS) ws.close();
		}, SILENT_MS / 2);
	}

	private stopWatchdog() {
		if (this.watchdog) clearInterval(this.watchdog);
		this.watchdog = null;
	}

	private setConnected(connected: boolean) {
		if (connected === this.connected) return;
		this.connected = connected;
		console[connected ? "log" : "warn"](`[tosu] ${connected ? "connected" : "disconnected; retrying"}`);
		this.onStatus?.(connected);
	}
}
