import { describe, expect, test } from "bun:test";
import { fmtLength, freshLines, isNewMatch, isRecent, num, scoreWinner, seriesAfter, starGain, withMod, type ChatLine } from "../src/oro/match";

const line = (time: string, name: string, messageBody: string, team = "left"): ChatLine => ({ time, name, messageBody, team });

describe("freshLines: tosu sends the whole chat every frame", () => {
	test("a frame sent again brings nothing new", () => {
		const seen = new Map<string, number>();
		const chat = [line("20:01", "A", "gl"), line("20:01", "B", "gl hf")];
		expect(freshLines(seen, chat)).toHaveLength(2);
		expect(freshLines(seen, chat)).toHaveLength(0);
		expect(freshLines(seen, [...chat])).toHaveLength(0);
	});

	test("the same message twice in a minute counts twice, once each", () => {
		const seen = new Map<string, number>();
		freshLines(seen, [line("20:01", "A", "!mp timer")]);
		const fresh = freshLines(seen, [line("20:01", "A", "!mp timer"), line("20:01", "A", "!mp timer")]);
		expect(fresh).toHaveLength(1);
	});

	test("old lines inserted in the middle are not replayed", () => {
		const seen = new Map<string, number>();
		freshLines(seen, [line("20:01", "A", "a"), line("20:03", "B", "b")]);
		const fresh = freshLines(seen, [line("20:01", "A", "a"), line("20:02", "R", "!mp map 1"), line("20:03", "B", "b")]);
		expect(fresh.map((l) => l.messageBody)).toEqual(["!mp map 1"]);
	});

	test("a line relabelled to another team for a frame is not new", () => {
		const seen = new Map<string, number>();
		freshLines(seen, [line("20:01", "A", "gl", "left")]);
		expect(freshLines(seen, [line("20:01", "A", "gl", "unknown")])).toHaveLength(0);
	});

	test("a frame with fewer lines (tosu trimming) doesn't unsee them", () => {
		const seen = new Map<string, number>();
		freshLines(seen, [line("20:01", "A", "x"), line("20:01", "A", "x")]);
		freshLines(seen, [line("20:01", "A", "x")]);
		expect(freshLines(seen, [line("20:01", "A", "x"), line("20:01", "A", "x")])).toHaveLength(0);
	});

	test("fuzz: any order of re-sent frames never yields a line more often than it appears", () => {
		for (let run = 0; run < 200; run++) {
			const seen = new Map<string, number>();
			const pool = Array.from({ length: 12 }, (_, i) => line(`20:0${i % 3}`, `p${i % 4}`, `m${i % 5}`));
			const shown = new Map<string, number>();
			const most = new Map<string, number>();
			for (let frame = 0; frame < 30; frame++) {
				const chat = pool.filter(() => Math.random() < 0.7);
				const counts = new Map<string, number>();
				for (const l of chat) {
					const k = `${l.time}|${l.name}|${l.messageBody}`;
					counts.set(k, (counts.get(k) ?? 0) + 1);
				}
				for (const [k, n] of counts) most.set(k, Math.max(n, most.get(k) ?? 0));
				for (const l of freshLines(seen, chat)) {
					const k = `${l.time}|${l.name}|${l.messageBody}`;
					shown.set(k, (shown.get(k) ?? 0) + 1);
				}
			}
			for (const [k, n] of shown) expect(n).toBeLessThanOrEqual(most.get(k)!);
		}
	});
});

describe("isRecent", () => {
	const at = (h: number, m: number) => new Date(2026, 10, 14, h, m);
	test("within two minutes, also across midnight", () => {
		expect(isRecent("20:00", at(20, 2))).toBe(true);
		expect(isRecent("20:00", at(20, 3))).toBe(false);
		expect(isRecent("23:59", at(0, 1))).toBe(true);
	});
	test("an unreadable stamp is treated as live", () => {
		expect(isRecent("", at(20, 0))).toBe(true);
		expect(isRecent("??", at(20, 0))).toBe(true);
	});
});

describe("starGain: osu!'s stars decide the map", () => {
	test("exactly one more is a map won", () => {
		expect(starGain(2, 3)).toBe(true);
		expect(starGain(0, 1)).toBe(true);
	});
	test("first value, reset, jumps and junk say nothing", () => {
		expect(starGain(undefined, 3)).toBe(false);
		expect(starGain(4, 0)).toBe(false);
		expect(starGain(1, 3)).toBe(false);
		expect(starGain(2, 2)).toBe(false);
		expect(starGain("x", 1)).toBe(false);
		expect(starGain(1.5, 2.5)).toBe(false);
		expect(starGain(null, 1)).toBe(true); // Number(null) is 0: a fresh 0 → 1
	});
});

describe("scoreWinner", () => {
	test("higher score wins; ties and 0-0 decide nothing", () => {
		expect(scoreWinner({ l: 900_000, r: 899_999 })).toBe("l");
		expect(scoreWinner({ l: 1, r: 2 })).toBe("r");
		expect(scoreWinner({ l: 0, r: 0 })).toBeNull();
		expect(scoreWinner({ l: 500.4, r: 500.2 })).toBeNull();
	});
	test("NaN or Infinity never names a winner", () => {
		expect(scoreWinner({ l: Number.NaN, r: 5 })).toBeNull();
		expect(scoreWinner({ l: Number.POSITIVE_INFINITY, r: 5 })).toBeNull();
	});
});

describe("seriesAfter", () => {
	test("adds the map to the series as it was when the map started", () => {
		expect(seriesAfter({ l: 3, r: 2 }, "r", 5)).toEqual({ l: 3, r: 3 });
	});
	test("never past first-to (BO9: 5)", () => {
		expect(seriesAfter({ l: 5, r: 2 }, "l", 5)).toEqual({ l: 5, r: 2 });
	});
	test("does not mutate its input", () => {
		const start = { l: 1, r: 1 };
		seriesAfter(start, "l", 7);
		expect(start).toEqual({ l: 1, r: 1 });
	});
});

describe("num", () => {
	test("a real zero stays zero (0% accuracy is not 100%)", () => {
		expect(num(0, 100)).toBe(0);
		expect(num("0", 100)).toBe(0);
	});
	test("missing or broken values take the fallback", () => {
		for (const v of [undefined, null, "", "abc", Number.NaN, Number.POSITIVE_INFINITY, {}]) expect(num(v, 100)).toBe(100);
	});
});

describe("withMod: osu! difficulty under the slot's mod", () => {
	const base = { bpm: 200, ar: 9, od: 8, cs: 4, seconds: 120 };
	test("DT: AR 9 → 10.3, OD 8 → 9.8, 1.5x BPM and speed", () => {
		expect(withMod("DT1", base)).toEqual({ bpm: 300, ar: 10.3, od: 9.8, cs: 4, seconds: 80 });
	});
	test("NC behaves as DT", () => {
		expect(withMod("NC2", base)).toEqual(withMod("DT1", base));
	});
	test("HR: AR/OD ×1.4 capped at 10, CS ×1.3", () => {
		expect(withMod("HR1", base)).toEqual({ bpm: 200, ar: 10, od: 10, cs: 5.2, seconds: 120 });
		expect(withMod("HR1", { ...base, ar: 6, od: 5 })).toMatchObject({ ar: 8.4, od: 7 });
	});
	test("HT: AR 9 → 7.7, low AR below 5 still right (AR 4 → 0.3)", () => {
		expect(withMod("HT1", base)).toMatchObject({ bpm: 150, ar: 7.7, seconds: 160 });
		expect(withMod("HT1", { ...base, ar: 4 })).toMatchObject({ ar: 0.3 });
	});
	test("EZ halves AR, OD, CS", () => {
		expect(withMod("EZ1", base)).toMatchObject({ ar: 4.5, od: 4, cs: 2 });
	});
	test("NM, HD, FM, TB are untouched", () => {
		for (const slot of ["NM1", "HD3", "FM2", "TB"]) expect(withMod(slot, base)).toEqual({ ...base });
	});
});

describe("fmtLength", () => {
	test("m:ss, and junk is 0:00", () => {
		expect(fmtLength(125_000)).toBe("2:05");
		expect(fmtLength(59_600)).toBe("1:00");
		expect(fmtLength(Number.NaN)).toBe("0:00");
		expect(fmtLength(-5000)).toBe("0:00");
	});
});

describe("isNewMatch: when the draft starts over by itself", () => {
	const draft = ["playera", "playerb", "team a"];
	test("both players replaced: new match", () => {
		expect(isNewMatch(draft, new Set(["playerc", "playerd"]))).toBe(true);
	});
	test("one side changing (a spectator flick, or the new pair half arrived): same match", () => {
		expect(isNewMatch(draft, new Set(["playerc", "playerb"]))).toBe(false);
		expect(isNewMatch(draft, new Set(["someoneelse", "playera", "playerb"]))).toBe(false);
	});
	test("a lobby-title name the draft knows keeps the match", () => {
		expect(isNewMatch(draft, new Set(["team a", "x"]))).toBe(false);
	});
	test("a draft without players (from before this version) never resets by itself", () => {
		expect(isNewMatch([], new Set(["playerc", "playerd"]))).toBe(false);
	});
});
