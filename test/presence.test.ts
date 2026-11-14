import { describe, expect, test } from "bun:test";
import { OverlayPresence } from "../src/server/presence";

describe("OverlayPresence: the bridge knows at once when an overlay goes", () => {
	test("an overlay's socket closing names that overlay", () => {
		const p = new OverlayPresence<string>();
		p.stated("s1", "obs1", "{a}");
		expect(p.closed("s1")).toBe("obs1");
		expect(p.states()).toEqual([]);
	});

	test("a socket that never sent a state (a panel) names nobody", () => {
		const p = new OverlayPresence<string>();
		expect(p.closed("panel")).toBeNull();
	});

	test("a reload whose new page spoke before the old socket closed: not gone", () => {
		const p = new OverlayPresence<string>();
		p.stated("old", "tab", "{1}");
		p.stated("new", "tab", "{2}");
		expect(p.closed("old")).toBeNull();
		expect(p.states()).toEqual(["{2}"]);
		expect(p.closed("new")).toBe("tab");
	});

	test("a late panel gets every overlay connected now, each once, latest state", () => {
		const p = new OverlayPresence<string>();
		p.stated("s1", "obs", "{obs 1}");
		p.stated("s2", "tab", "{tab 1}");
		p.stated("s1", "obs", "{obs 2}");
		expect(p.states().sort()).toEqual(["{obs 2}", "{tab 1}"]);
		p.closed("s2");
		expect(p.states()).toEqual(["{obs 2}"]);
	});

	test("a state without an id is not tracked", () => {
		const p = new OverlayPresence<string>();
		p.stated("s1", "", "{x}");
		expect(p.closed("s1")).toBeNull();
	});

	test("closing twice names it once", () => {
		const p = new OverlayPresence<string>();
		p.stated("s1", "obs", "{x}");
		expect(p.closed("s1")).toBe("obs");
		expect(p.closed("s1")).toBeNull();
	});
});

describe("OverlayPresence.forget: a tab that became a mirror", () => {
	test("its last state is no longer handed to a late panel", () => {
		const p = new OverlayPresence<string>();
		p.stated("obs", "obs1", "{obs}");
		p.stated("tab", "tab1", "{tab}");
		p.forget("tab");
		expect(p.states()).toEqual(["{obs}"]);
		// and its socket closing later names nobody: it was already retired
		expect(p.closed("tab")).toBeNull();
	});

	test("leading again, it is back", () => {
		const p = new OverlayPresence<string>();
		p.stated("tab", "tab1", "{1}");
		p.forget("tab");
		p.stated("tab", "tab1", "{2}");
		expect(p.states()).toEqual(["{2}"]);
	});
});
