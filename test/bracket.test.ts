import { describe, expect, test } from "bun:test";
import { findMatch, parseBracket, roundOf } from "../src/oro/bracket";
import { parseCsv } from "../src/oro/sheet";

// The main sheet's "Horarios Bracket" tab as Google exports it: a title, blank
// columns, the round only on its block's first row, slots still waiting on a
// match, a block with no players yet.
const CSV = `,,,,,,,,,,,,,,,
,,,,Horarios Bracket,,,,,,,,,,,
,,,,ID,Fecha,Hora,Referee,Jugador 1,Score,,Jugador2,Streamer,Comentaristas,MP Link,VOD
,,,,,,,,,,,,,,,
,Mappool #1 (BO9),Round of 48,,1,"Sat, Nov 14",14:00,Ref,Alpha,,,Bravo,,,,
,,,,2,"Sun, Nov 15",14:00,,Charlie,,,Delta,,,,
,,,,3,"Fri, Nov 13",20:00,Ref,- Z e r o -,5,0,Echo,Mick,"a, b",122159102,
,,Round of 32,,17,"Sun, Nov 15",20:00,Ref,Foxtrot,,,Ganador de 1,,,,
,,,,18,"Sun, Nov 15",20:00,Ref,Golf,,,Ganador de 2,,,,
,,,,19,"Sun, Nov 15",21:00,Ref,Hotel,,,- Z e r o -,,,,
,,,,,,,,,,,,,,,
,Mappool #2 (BO11),Round of 16,,,,,,,,,,,,,
,,,,25,,,,Ganador de 17,,,Ganador de 18,,,,
,,,,,,,,,,,,,,,
,Mappool #3 (BO11),Quarterfinals,,,,,,,,,,,,,
,Mappool #4 (BO13),Semifinals,,,,,,,,,,,,,
,,Grand Finals,,30,,,,Ganador de 25,,,Ganador de 26,,,,
`;
const matches = parseBracket(parseCsv(CSV));
const round = (l: string[], r: string[]) => findMatch(matches, [l, r])?.round ?? null;

describe("parseBracket: the schedule as people lay it out", () => {
	test("reads every match with players, its round carried down the block", () => {
		expect(matches.map((m) => `${m.id}:${m.round}`)).toEqual(["1:ro48", "2:ro48", "3:ro48", "17:ro32", "18:ro32", "19:ro32", "25:ro16", "30:f"]);
		expect(matches[2]).toMatchObject({ p1: "- Z e r o -", p2: "Echo", date: "Fri, Nov 13", time: "20:00" });
	});

	test("a sheet without the header row reads as nothing (never a guess)", () => {
		expect(parseBracket(parseCsv("a,b,c\n1,2,3\n"))).toEqual([]);
		expect(parseBracket([])).toEqual([]);
	});
});

describe("roundOf: the sheet's labels", () => {
	test("each round, in English or Spanish; semis and quarters aren't the final", () => {
		expect(roundOf("Round of 48")).toBe("ro48");
		expect(roundOf("Ronda de 32")).toBe("ro32");
		expect(roundOf("Octavos de final")).toBe("ro16");
		expect(roundOf("Quarterfinals")).toBe("qf");
		expect(roundOf("Semifinals")).toBe("sf");
		expect(roundOf("Third place")).toBe("third");
		expect(roundOf("Grand Finals")).toBe("f");
		expect(roundOf("Final")).toBe("f");
		expect(roundOf("Mappool #2 (BO11)")).toBeNull();
		expect(roundOf("")).toBeNull();
	});
});

describe("findMatch: the round of the two players on screen", () => {
	test("both players named, either side", () => {
		expect(round(["Alpha"], ["Bravo"])).toBe("ro48");
		expect(round(["bravo"], ["ALPHA"])).toBe("ro48");
	});

	test("names as osu! spells them: spaces and case don't matter", () => {
		expect(round(["-  z e r o  -"], ["echo"])).toBe("ro48");
	});

	test("a slot waiting on a match: the player from that match fills it", () => {
		expect(round(["Foxtrot"], ["Bravo"])).toBe("ro32");
		// Delta played match 2, not 1: not this slot, but they can meet in the 16
		expect(findMatch(matches, [["Foxtrot"], ["Delta"]])?.id).toBe("25");
		// Echo's match feeds no slot (Zero is named in the 32): they can't meet
		expect(round(["Foxtrot"], ["Echo"])).toBeNull();
	});

	test("both slots waiting, followed back through earlier rounds", () => {
		expect(round(["Alpha"], ["Golf"])).toBe("ro16");
	});

	test("a player met again later: the filled slot wins over a waiting one", () => {
		// Zero played Echo in the 48 and is named against Hotel in the 32
		expect(round(["- Z e r o -"], ["Hotel"])).toBe("ro32");
	});

	test("the lobby title's name or the spectated one, whichever matches", () => {
		expect(round(["Team A", "Alpha"], ["", "Bravo"])).toBe("ro48");
	});

	test("nobody on screen, one side only, or strangers: no match", () => {
		expect(round([], ["Alpha"])).toBeNull();
		expect(round([""], [""])).toBeNull();
		expect(round(["Alpha"], ["Alpha"])).toBeNull();
		expect(round(["playera"], ["playerb"])).toBeNull();
	});
});
