import { describe, expect, test } from "bun:test";
import { banchoReply, isBanchoReply } from "../src/oro/bancho";
import { http } from "../src/oro/http";
import { fetchSheetPool, parseCsv } from "../src/oro/sheet";
import { allowed } from "../src/server/RemoteLink";
import { imageName, listenerPids } from "../src/server/singleton";
import { isNewer } from "../src/server/updater";

describe("Bancho's replies, worded as Bancho does", () => {
	const name = (id: number) => (id === 123 ? "xi - FREEDOM DiVE [FOUR DIMENSIONS]" : undefined);
	test("timer, map, mods, start", () => {
		expect(banchoReply("!mp timer 90", name)).toBe("Countdown ends in 1 minute and 30 seconds");
		expect(banchoReply("!mp timer", name)).toBe("Countdown ends in 30 seconds");
		expect(banchoReply("!mp map 123", name)).toBe("Changed beatmap to xi - FREEDOM DiVE [FOUR DIMENSIONS]");
		expect(banchoReply("!mp map 999", name)).toBe("Changed beatmap to https://osu.ppy.sh/b/999");
		expect(banchoReply("!mp mods HD HR", name)).toBe("Enabled Hidden, HardRock, disabled FreeMod");
		expect(banchoReply("!mp mods freemod", name)).toBe("Enabled FreeMod");
		expect(banchoReply("!mp start", name)).toBe("The match has started!");
	});
	test("each synthetic reply is recognised as a reply (so a real one stops them)", () => {
		for (const cmd of ["!mp timer 30", "!mp map 123", "!mp mods HR", "!mp start", "!mp abort", "!mp lock"]) {
			expect(isBanchoReply(banchoReply(cmd, name)!)).toBe(true);
		}
	});
	test("junk and chat get no reply", () => {
		for (const text of ["gl hf", "!mp", "!mp map", "!mp map abc", "!mp set 9", "", "!mp unknowncmd"]) expect(banchoReply(text, name)).toBeNull();
	});
});

describe("CSV from the Google Sheet", () => {
	test("quoted commas, quotes, newlines and CRLF", () => {
		expect(parseCsv('a,"b,c","d ""e"""\r\n1,"x\ny",3\n')).toEqual([
			["a", "b,c", 'd "e"'],
			["1", "x\ny", "3"],
		]);
	});
	test("the pool by header name, decimal commas, empty rows, a map with no id", async () => {
		const csv = [
			"Map,,Mod,ID,SR,BPM,Length",
			",xi - FREEDOM DiVE [FOUR DIMENSIONS],nm1,129891,\"7,12\",222,04:18",
			",,,,,,",
			",Camellia - Ghost [Spectre],TB,,7.55,220,1:05:30",
		].join("\n");
		const get = http.get;
		http.get = (async () => ({ data: csv })) as typeof http.get;
		try {
			const rows = await fetchSheetPool({ id: "x" });
			expect(rows).toHaveLength(2);
			expect(rows[0]).toMatchObject({ slot: "NM1", beatmapId: 129891, artist: "xi", title: "FREEDOM DiVE", diff: "FOUR DIMENSIONS", sr: 7.12, bpm: 222, len: "4:18" });
			expect(rows[1]).toMatchObject({ slot: "TB", beatmapId: 0, title: "Ghost", len: "65:30" });
		} finally {
			http.get = get;
		}
	});
	test("a sheet without Mod and ID columns is an error, not an empty pool", async () => {
		const get = http.get;
		http.get = (async () => ({ data: "Title,Artist\nx,y" })) as typeof http.get;
		try {
			await expect(fetchSheetPool({ id: "x" })).rejects.toThrow();
		} finally {
			http.get = get;
		}
	});
});

describe("remote commands: only what a control panel may send gets to the overlay", () => {
	test("panel commands pass", () => {
		expect(allowed(JSON.stringify({ type: "control", action: "scene", scene: "gameplay" }))).toBe(true);
		expect(allowed(JSON.stringify({ type: "control", action: "key", key: "t" }))).toBe(true);
	});
	test("everything else is dropped", () => {
		for (const raw of [
			"not json",
			"null",
			JSON.stringify({ type: "overlay_state" }),
			JSON.stringify({ type: "remote", on: true }),
			JSON.stringify({ type: "control", action: "eval" }),
			JSON.stringify({ type: "control", action: "key", key: "F5" }),
			JSON.stringify({ type: "control" }),
			JSON.stringify({ type: "control", action: "__proto__" }),
		]) {
			expect(allowed(raw)).toBe(false);
		}
	});
});

describe("bridge helpers", () => {
	test("finds the PIDs listening on the bridge port in netstat's output", () => {
		const out = [
			"  Proto  Local Address          Foreign Address        State           PID",
			"  TCP    127.0.0.1:24052        0.0.0.0:0              LISTENING       4412",
			"  TCP    127.0.0.1:24052        127.0.0.1:50000        ESTABLISHED     4412",
			"  TCP    0.0.0.0:24052          0.0.0.0:0              LISTENING       99",
			"  TCP    127.0.0.1:240520       0.0.0.0:0              LISTENING       7",
		].join("\r\n");
		expect(listenerPids(out, 24052)).toEqual([4412]);
		expect(imageName('"rempalago-bridge.exe","4412","Console","1","50,000 K"')).toBe("rempalago-bridge.exe");
	});
	test("version comparison for the updater", () => {
		expect(isNewer("v99.0.0")).toBe(true);
		expect(isNewer("v0.0.1")).toBe(false);
		expect(isNewer("v1.0.9")).toBe(false);
	});
});
