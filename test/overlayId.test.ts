import { describe, expect, test } from "bun:test";
import { type IdChannel, OverlayId } from "../src/oro/overlayId";

// A browser's BroadcastChannel: what a page posts reaches every other open
// page, never itself, synchronously here.
function bus() {
	const pages = new Set<IdChannel>();
	return {
		open(): IdChannel & { close(): void } {
			const ch: IdChannel & { close(): void } = {
				onmessage: null,
				postMessage(message) {
					for (const other of pages) if (other !== ch) other.onmessage?.({ data: structuredClone(message) });
				},
				close: () => void pages.delete(ch),
			};
			pages.add(ch);
			return ch;
		},
	};
}

// One tab's sessionStorage; a duplicated tab starts with a copy of it.
const storage = (from?: Map<string, string>) => {
	const map = new Map(from);
	return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
};

describe("OverlayId: one overlay keeps one id on the link", () => {
	test("a reload of the same tab or OBS source keeps its id", () => {
		const b = bus();
		const tab = storage();
		const first = b.open();
		const before = new OverlayId(tab, first).id;
		first.close(); // the page unloads
		expect(new OverlayId(tab, b.open()).id).toBe(before);
	});

	test("a duplicated tab (sessionStorage copied) takes an id of its own", () => {
		const b = bus();
		const tab = storage();
		const original = new OverlayId(tab, b.open());
		const copyStore = storage(tab.map);
		const copy = new OverlayId(copyStore, b.open());
		expect(copy.id).not.toBe(original.id);
		// and keeps it across its own reloads
		expect(copyStore.getItem("rempalago-overlay-id")).toBe(copy.id);
		expect(tab.getItem("rempalago-overlay-id")).toBe(original.id);
	});

	test("two separate tabs never share an id", () => {
		const b = bus();
		const ids = new Set(Array.from({ length: 50 }, () => new OverlayId(storage(), b.open()).id));
		expect(ids.size).toBe(50);
	});

	test("no storage, no channel (blocked site data): still an id, a fresh one", () => {
		const blocked = {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {
				throw new Error("SecurityError");
			},
		};
		const id = new OverlayId(blocked, null).id;
		expect(id).toMatch(/^[a-z0-9]+$/);
		expect(new OverlayId(null, null).id).not.toBe(id);
	});

	test("junk on the channel is ignored", () => {
		const b = bus();
		const page = new OverlayId(storage(), b.open());
		const before = page.id;
		const other = b.open();
		for (const junk of [null, 1, "x", {}, { taken: before }, { taken: before, to: "someone else" }]) other.postMessage(junk);
		expect(page.id).toBe(before);
	});
});
