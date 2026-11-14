import { describe, expect, test } from "bun:test";
// test/setup.ts: no ?round in the URL, nothing saved
import { ROUND } from "../src/oro/stage.js";

describe("ROUND: no round picked", () => {
	test("is not the final (a fresh source showed 'Campeón' on a round of 32)", () => {
		expect(ROUND.key).toBe("");
		expect(ROUND.unset).toBe(true);
		expect(ROUND.isTitle).toBe(false);
		expect(ROUND.name).toBe("Rempalago 3");
	});

	test("never cuts a real series short: first to the longest (BO13)", () => {
		expect(ROUND.firstTo).toBe(7);
	});
});
