// The overlay's id on the control link. It is kept across a reload of the same
// page (an OBS source refreshed, the reload after a bridge update): a fresh id
// on every load made the panel count the page twice for ten seconds ("2
// overlays are open") and a mirror follow an OBS overlay that no longer
// existed.
//
// sessionStorage is per tab or source and survives a reload, but Chrome copies
// it into a duplicated tab. The pages of one browser compare ids over a
// BroadcastChannel: a page that loads with an id another open page already
// uses takes a new one.

const KEY = "rempalago-overlay-id";
const CHANNEL = "rempalago-overlay-id";

type Store = Pick<Storage, "getItem" | "setItem">;
export type IdChannel = { postMessage(message: unknown): void; onmessage: ((event: { data: unknown }) => void) | null };
// claim: "I just loaded with this id"; taken: "that id is mine", to the claimant
type Message = { claim: string; from: string } | { taken: string; to: string };

const fresh = () => Math.random().toString(36).slice(2, 10);

export class OverlayId {
	id: string;
	// this page load, apart from the id it may share with a copy
	private load = fresh();

	constructor(
		private store: Store | null = safeSessionStorage(),
		channel: IdChannel | null = safeChannel(),
	) {
		let saved: string | null = null;
		try {
			saved = store?.getItem(KEY) ?? null;
		} catch {}
		this.id = saved || fresh();
		this.save();
		if (!channel) return;
		channel.onmessage = ({ data }) => {
			const m = data as Message;
			if (!m || typeof m !== "object") return;
			if ("claim" in m && m.claim === this.id && m.from !== this.load) channel.postMessage({ taken: this.id, to: m.from });
			if ("taken" in m && m.taken === this.id && m.to === this.load) {
				this.id = fresh();
				this.save();
			}
		};
		channel.postMessage({ claim: this.id, from: this.load });
	}

	private save() {
		try {
			this.store?.setItem(KEY, this.id);
		} catch {}
	}
}

function safeSessionStorage(): Store | null {
	try {
		return typeof sessionStorage === "undefined" ? null : sessionStorage;
	} catch {
		return null;
	}
}

function safeChannel(): IdChannel | null {
	try {
		return typeof BroadcastChannel === "undefined" ? null : (new BroadcastChannel(CHANNEL) as unknown as IdChannel);
	} catch {
		return null;
	}
}
