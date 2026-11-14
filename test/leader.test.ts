import { describe, expect, test } from "bun:test";
import { Leader } from "../src/oro/leader";

describe("Leader: the overlay in OBS runs the match, a browser tab mirrors it", () => {
	test("a tab alone leads", () => {
		const tab = new Leader({ id: "tab", obs: false });
		expect(tab.mirroring(0)).toBe(false);
	});

	test("a tab mirrors as soon as an OBS overlay is heard", () => {
		const tab = new Leader({ id: "tab", obs: false });
		tab.heard({ id: "obs1", obs: true }, 1000);
		expect(tab.mirroring(1000)).toBe(true);
	});

	test("other tabs don't make a tab mirror (nobody is in OBS)", () => {
		const tab = new Leader({ id: "tab", obs: false });
		tab.heard({ id: "tab2", obs: false }, 1000);
		expect(tab.mirroring(1000)).toBe(false);
	});

	test("its own state echoed back never counts", () => {
		const tab = new Leader({ id: "tab", obs: true });
		tab.heard({ id: "tab", obs: true }, 0);
		const other = new Leader({ id: "x", obs: false });
		other.heard({ id: "x", obs: true }, 0);
		expect(other.mirroring(0)).toBe(false);
	});

	test("the OBS overlay never mirrors, not even another OBS overlay", () => {
		const obs = new Leader({ id: "obs1", obs: true });
		obs.heard({ id: "obs2", obs: true }, 0);
		expect(obs.mirroring(0)).toBe(false);
	});

	test("the OBS overlay gone quiet (closed, OBS shut): the tab leads again", () => {
		const tab = new Leader({ id: "tab", obs: false }, 10_000);
		tab.heard({ id: "obs1", obs: true }, 0);
		expect(tab.mirroring(9_000)).toBe(true);
		expect(tab.mirroring(10_001)).toBe(false);
	});

	test("its heartbeat keeps the tab mirroring", () => {
		const tab = new Leader({ id: "tab", obs: false }, 10_000);
		for (let t = 0; t <= 60_000; t += 4_000) {
			tab.heard({ id: "obs1", obs: true }, t);
			expect(tab.mirroring(t + 3_999)).toBe(true);
		}
	});

	test("an OBS overlay reloaded (new id) is followed; the old id expires", () => {
		const tab = new Leader({ id: "tab", obs: false }, 10_000);
		tab.heard({ id: "obsOld", obs: true }, 0);
		tab.heard({ id: "obsNew", obs: true }, 8_000);
		expect(tab.mirroring(15_000)).toBe(true);
		expect(tab.mirroring(18_001)).toBe(false);
	});

	test("the bridge says the OBS overlay is gone: the tab leads at once", () => {
		const tab = new Leader({ id: "tab", obs: false }, 10_000);
		tab.heard({ id: "obs1", obs: true }, 0);
		tab.gone("obs1");
		expect(tab.mirroring(1)).toBe(false);
	});

	test("gone for another overlay leaves the OBS one followed", () => {
		const tab = new Leader({ id: "tab", obs: false }, 10_000);
		tab.heard({ id: "obs1", obs: true }, 0);
		tab.gone("someone-else");
		expect(tab.mirroring(1)).toBe(true);
	});
});
