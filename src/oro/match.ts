// The match's rules as plain functions, apart from the DOM and tosu, so they
// can be tested: which lobby lines are new, who won a map, the series after
// it, and a pool map's numbers with its mod.

export type Side = "l" | "r";
export const SIDES: Side[] = ["l", "r"];

export type ChatLine = { team: string; time: string; name: string; messageBody: string };

// tosu hands over the whole lobby chat every frame and can insert lines in the
// middle or relabel one for a frame. A line is new when its time|name|message
// shows up more times than seen so far, so the same message twice in a minute
// still counts twice and a re-sent history counts zero. `seen` is updated.
export function freshLines<T extends ChatLine>(seen: Map<string, number>, chat: readonly T[]): T[] {
	const counts = new Map<string, number>();
	const fresh: T[] = [];
	for (const line of chat) {
		const key = `${line.time}|${line.name}|${line.messageBody}`;
		const n = (counts.get(key) ?? 0) + 1;
		counts.set(key, n);
		if (n > (seen.get(key) ?? 0)) fresh.push(line);
	}
	for (const [key, n] of counts) seen.set(key, Math.max(n, seen.get(key) ?? 0));
	return fresh;
}

// A lobby line stamped HH:MM (the client's clock) within the last two minutes.
// Older ones are history, even when tosu only now hands them over.
export function isRecent(time: string, now: Date): boolean {
	const [h, m] = String(time).split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return true;
	const diff = (now.getHours() * 60 + now.getMinutes() - (h * 60 + m) + 1440) % 1440;
	return diff <= 2;
}

// A new match: none of the names the draft was started with (each player's
// lobby-title name and spectated name) is among the names on screen now. One
// side changing alone (a client spectating someone else for a moment, or the
// new pair arriving one side at a time) is the same match.
export function isNewMatch(draftPlayers: readonly string[], onScreen: ReadonlySet<string>): boolean {
	return draftPlayers.length > 0 && !draftPlayers.some((n) => onScreen.has(n));
}

// The tourney client's own count of maps won is what decides a map: one side's
// stars going up by exactly one is that side taking the map. A reset (a new
// match), a correction by hand of more than one, or the first value seen say
// nothing about the map just played.
export function starGain(before: unknown, after: unknown): boolean {
	const a = Number(before);
	const b = Number(after);
	return Number.isInteger(a) && Number.isInteger(b) && b === a + 1;
}

// The score that decides a map when the song ends, before osu!'s stars move.
// Equal scores (above all 0-0: nothing came in) decide nothing.
export function scoreWinner(score: Record<Side, number>): Side | null {
	const l = Math.round(Number(score.l));
	const r = Math.round(Number(score.r));
	if (!Number.isFinite(l) || !Number.isFinite(r) || l === r) return null;
	return l > r ? "l" : "r";
}

// The series once `winner` takes the map, from the stars as they were when the
// map started (not as they are now: osu! may already have counted it).
export function seriesAfter(atStart: Record<Side, number>, winner: Side, firstTo: number): Record<Side, number> {
	const next = { ...atStart, [winner]: atStart[winner] + 1 };
	return { l: Math.min(next.l, firstTo), r: Math.min(next.r, firstTo) };
}

// A number from tosu, or the fallback when it is missing, NaN or infinite.
// (`Number(x) || fallback` turned a real 0, a 0% accuracy, into the fallback.)
export function num(value: unknown, fallback = 0): number {
	const n = Number(value);
	return value === null || value === undefined || value === "" || !Number.isFinite(n) ? fallback : n;
}

export const fmtLength = (ms: number) => {
	const s = Math.max(0, Math.round(num(ms) / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// A map's numbers with its slot's mod (HR, DT/NC, EZ, HT); other slots as they are.
const round1 = (n: number) => Math.round(n * 10) / 10;
export function withMod(slot: string, m: { bpm: number; ar: number; od: number; cs: number; seconds: number }) {
	const mod = slot.replace(/\d+$/, "").toUpperCase();
	let { ar, od, cs } = m;
	if (mod === "HR") [ar, od, cs] = [Math.min(10, ar * 1.4), Math.min(10, od * 1.4), Math.min(10, cs * 1.3)];
	if (mod === "EZ") [ar, od, cs] = [ar / 2, od / 2, cs / 2];
	const rate = mod === "DT" || mod === "NC" ? 1.5 : mod === "HT" ? 0.75 : 1;
	if (rate !== 1) {
		// AR and OD by their timing windows, sped up
		const arMs = (ar < 5 ? 1800 - 120 * ar : 1200 - 150 * (ar - 5)) / rate;
		ar = arMs > 1200 ? (1800 - arMs) / 120 : 5 + (1200 - arMs) / 150;
		od = (80 - (80 - 6 * od) / rate) / 6;
	}
	return { bpm: Math.round(m.bpm * rate), ar: round1(ar), od: round1(od), cs: round1(cs), seconds: m.seconds / rate };
}
