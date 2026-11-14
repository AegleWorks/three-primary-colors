import { ROUNDS } from "../config/rounds";
import { http } from "./http";
import { parseCsv, type SheetRef } from "./sheet";

// The tournament's schedule ("Horarios Bracket" in the main sheet): which
// round each match is in. The overlay finds the match whose two players are
// the ones on screen and so knows its round without anyone picking it.
//
// The tab is laid out for people, not machines: a title, blank columns, the
// round written only on the first row of its block, players still to be
// decided as "Ganador de 12". This reads it by its header row ("Jugador 1",
// "Jugador 2") and carries each round label down its block. Anything it
// can't read is left out: no match found means the round stays as it is,
// never a guess.

export const BRACKET_SHEET: SheetRef = { id: "1OAA1dw1JQE8zKlnQgOtwv-Iz_3DEdOwPzG1UVZ8T3Ho", gid: 1071664154 };

export interface BracketMatch {
	id: string;
	round: string;
	p1: string;
	p2: string;
	date: string;
	time: string;
}

// A round label as the sheet writes it -> its key. The longer names first:
// "Semifinals" and "Quarterfinals" contain "finals".
const LABELS: [RegExp, string][] = [
	[/round of 48|ronda de 48|\bro48\b/i, "ro48"],
	[/round of 32|ronda de 32|\bro32\b/i, "ro32"],
	[/round of 16|ronda de 16|octavos|\bro16\b/i, "ro16"],
	[/quarter|cuartos|\bqf\b/i, "qf"],
	[/semi|\bsf\b/i, "sf"],
	[/third|tercer|3rd|bronze/i, "third"],
	[/show ?match/i, "show"],
	[/grand final|\bfinals?\b|\bfinal\b/i, "f"],
];

export function roundOf(label: string): string | null {
	const text = label.trim();
	if (!text) return null;
	for (const [re, key] of LABELS) if (re.test(text) && ROUNDS[key]) return key;
	return null;
}

const norm = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export function parseBracket(rows: string[][]): BracketMatch[] {
	const head = rows.findIndex((r) => r.some((c) => /^jugador\s*1$/i.test(c.trim())) && r.some((c) => /^jugador\s*2$/i.test(c.trim())));
	if (head < 0) return [];
	const cols = rows[head].map((c) => c.trim().toLowerCase());
	const col = (re: RegExp) => cols.findIndex((c) => re.test(c));
	const at = { id: col(/^id$/), p1: col(/^jugador\s*1$/), p2: col(/^jugador\s*2$/), date: col(/^fecha|^date/), time: col(/^hora|^time/) };
	// the round labels sit left of the match's own columns
	const labelsUntil = Math.min(...[at.id, at.p1].filter((i) => i >= 0));
	const matches: BracketMatch[] = [];
	let round: string | null = null;
	for (const row of rows.slice(head + 1)) {
		for (const cell of row.slice(0, labelsUntil)) round = roundOf(cell) ?? round;
		const p1 = (row[at.p1] ?? "").trim();
		const p2 = (row[at.p2] ?? "").trim();
		if (!round || !p1 || !p2) continue;
		matches.push({ id: (row[at.id] ?? "").trim(), round, p1, p2, date: (row[at.date] ?? "").trim(), time: (row[at.time] ?? "").trim() });
	}
	return matches;
}

// "Ganador de 12" / "Winner of 12" / "Perdedor de 12": the match it waits on.
const PLACEHOLDER = /^(?:ganador|winner|perdedor|loser)\s+(?:de|of)\s+(?:match\s*)?#?\s*(\S+)$/i;

// Each side's names on screen (the lobby title's name, the spectated
// player's): the match of those two players, or null when none is found or
// two rounds would fit (then a person decides).
export function findMatch(matches: readonly BracketMatch[], sides: [readonly string[], readonly string[]]): BracketMatch | null {
	const [l, r] = sides.map((names) => new Set(names.map(norm).filter(Boolean)));
	if (!l.size || !r.size) return null;
	const byId = new Map(matches.map((m) => [m.id, m]));
	// a slot is a side's player when it names them, or waits on a match they
	// played (followed back a few matches, for slots that wait on slots)
	const holds = (slot: string, side: Set<string>, depth = 0): boolean => {
		if (side.has(norm(slot))) return true;
		const wait = PLACEHOLDER.exec(slot.trim());
		const from = wait && byId.get(wait[1]);
		return Boolean(from && depth < 4 && (holds(from.p1, side, depth + 1) || holds(from.p2, side, depth + 1)));
	};
	const fits = matches.filter((m) => (holds(m.p1, l) && holds(m.p2, r)) || (holds(m.p1, r) && holds(m.p2, l)));
	// the same pair may meet again later (a rematch): a slot already filled
	// beats one still waiting, and two different rounds left over are a tie
	const named = fits.filter((m) => [m.p1, m.p2].every((p) => !PLACEHOLDER.test(p.trim())));
	const best = named.length ? named : fits;
	const rounds = new Set(best.map((m) => m.round));
	return rounds.size === 1 ? best[best.length - 1] : null;
}

export async function fetchBracket({ id, gid = 0 }: SheetRef): Promise<BracketMatch[]> {
	const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${gid}`;
	const text: string = (await http.get(url, { responseType: "text", params: { t: Date.now() } })).data;
	return parseBracket(parseCsv(text));
}
