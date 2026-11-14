import { describe, expect, test } from "bun:test";
import { decidePick, type AutoPickContext, type Pick, type Side } from "../src/oro/autopick";

const ctx = (over: Partial<AutoPickContext> = {}): AutoPickContext => ({ inLobby: true, asked: false, settled: true, autoPick: null, nextPicker: "l", ...over });

describe("decidePick", () => {
	test("a pool map coming up in a settled lobby is the next picker's pick", () => {
		const out = decidePick([], {}, "NM1", ctx({ nextPicker: "r" }));
		expect(out?.picks).toEqual([{ id: "NM1", by: "r", won: null }]);
		expect(out?.autoPick).toEqual({ id: "NM1", by: "r" });
	});

	test("never the TB, a banned map, or one already picked", () => {
		expect(decidePick([], {}, "TB", ctx())).toBeNull();
		expect(decidePick([], { NM1: "l" }, "NM1", ctx())).toBeNull();
		expect(decidePick([{ id: "NM1", by: "l", won: "l" }], {}, "NM1", ctx())).toBeNull();
		expect(decidePick([], {}, "", ctx())).toBeNull();
	});

	test("outside the tourney lobby (song select) nothing is picked", () => {
		expect(decidePick([], {}, "NM1", ctx({ inLobby: false }))).toBeNull();
	});

	test("a lobby just joined brings its own map: no pick unless the referee asked", () => {
		expect(decidePick([], {}, "NM1", ctx({ settled: false }))).toBeNull();
		expect(decidePick([], {}, "NM1", ctx({ settled: false, asked: true }))).not.toBeNull();
	});

	test("the picker changing their mind replaces the automatic pick, same side", () => {
		const first = decidePick([], {}, "NM1", ctx({ nextPicker: "l" }))!;
		const second = decidePick(first.picks, {}, "HD2", ctx({ autoPick: first.autoPick, nextPicker: "r" }))!;
		expect(second.picks).toEqual([{ id: "HD2", by: "l", won: null }]);
	});

	test("an automatic pick that was already won stays", () => {
		const picks: Pick[] = [{ id: "NM1", by: "l", won: "l" }];
		const out = decidePick(picks, {}, "HD2", ctx({ autoPick: { id: "NM1", by: "l" }, nextPicker: "r" }))!;
		expect(out.picks).toEqual([...picks, { id: "HD2", by: "r", won: null }]);
	});

	test("does not mutate the picks it is given", () => {
		const picks: Pick[] = [{ id: "NM1", by: "l", won: null }];
		decidePick(picks, {}, "HD2", ctx({ autoPick: { id: "NM1", by: "l" } }));
		expect(picks).toEqual([{ id: "NM1", by: "l", won: null }]);
	});

	test("property: whatever comes up, the draft keeps its invariants", () => {
		const SLOTS = ["NM1", "NM2", "NM3", "HD1", "HD2", "HR1", "HR2", "DT1", "DT2", "FM1", "TB"];
		const sides: Side[] = ["l", "r"];
		const any = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
		for (let run = 0; run < 500; run++) {
			const bans: Record<string, Side> = { [any(SLOTS)]: any(sides), [any(SLOTS)]: any(sides) };
			let picks: Pick[] = [];
			let autoPick: { id: string; by: Side } | null = null;
			for (let step = 0; step < 40; step++) {
				if (Math.random() < 0.2 && picks.length) picks = picks.map((p, i) => (i === picks.length - 1 ? { ...p, won: any(sides) } : p));
				const out = decidePick(picks, bans, any(SLOTS), ctx({ autoPick, nextPicker: any(sides), settled: Math.random() < 0.8, inLobby: Math.random() < 0.9 }));
				if (!out) continue;
				picks = out.picks;
				autoPick = out.autoPick;
				const ids = picks.map((p) => p.id);
				expect(new Set(ids).size).toBe(ids.length);
				expect(ids).not.toContain("TB");
				for (const id of ids) expect(bans[id]).toBeUndefined();
				// a decided map is never taken back by an automatic pick
				for (const p of picks) expect(p.by === "l" || p.by === "r").toBe(true);
			}
		}
	});

	test("property: a map already won never disappears from the draft", () => {
		const SLOTS = ["NM1", "NM2", "HD1", "HR1", "DT1", "FM1"];
		for (let run = 0; run < 300; run++) {
			let picks: Pick[] = [];
			let autoPick: { id: string; by: Side } | null = null;
			const won = new Set<string>();
			for (let step = 0; step < 30; step++) {
				const out = decidePick(picks, {}, SLOTS[Math.floor(Math.random() * SLOTS.length)], ctx({ autoPick, nextPicker: Math.random() < 0.5 ? "l" : "r" }));
				if (out) [picks, autoPick] = [out.picks, out.autoPick];
				if (picks.length && Math.random() < 0.3) {
					const last = picks[picks.length - 1];
					picks = [...picks.slice(0, -1), { ...last, won: "l" }];
					won.add(last.id);
				}
				for (const id of won) expect(picks.some((p) => p.id === id)).toBe(true);
			}
		}
	});
});
