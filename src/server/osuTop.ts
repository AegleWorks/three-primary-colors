import type { IncomingMessage, ServerResponse } from "node:http";

// A player's top three plays, for the qualifiers scene. try-z (the overlay's osu!
// source) has no scores, and osu!'s own site has them but won't answer a page
// served from tosu (no CORS), so the overlay asks the bridge:
//
//   GET http://127.0.0.1:24052/osu/top/<osu id>  ->  TopPlay[] (best first)
//
// Answers are kept for ten minutes, so flipping between players doesn't ask
// osu! again.

export interface TopPlay {
	pp: number;
	accuracy: number;
	rank: string;
	combo: number;
	mapCombo: number | null;
	perfect: boolean;
	mods: string[];
	date: string;
	title: string;
	artist: string;
	mapper: string;
	version: string;
	stars: number;
	length: number;
	bpm: number;
	cover: string;
	url: string;
}

const TTL = 10 * 60_000;
const COUNT = 3;
const cache = new Map<number, { at: number; play: Promise<TopPlay[]> }>();

async function fetchTop(id: number): Promise<TopPlay[]> {
	const res = await fetch(`https://osu.ppy.sh/users/${id}/scores/best?mode=osu&limit=${COUNT}`, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(8_000),
	});
	if (!res.ok) throw new Error(`osu! answered ${res.status}`);
	const scores = (await res.json()) as any[];
	return (Array.isArray(scores) ? scores : []).slice(0, COUNT).map(toPlay);
}

function toPlay(s: any): TopPlay {
	const map = s.beatmap ?? {};
	const set = s.beatmapset ?? {};
	return {
		pp: s.pp ?? 0,
		accuracy: s.accuracy ?? 0,
		rank: s.rank ?? "",
		combo: s.max_combo ?? 0,
		mapCombo: map.max_combo ?? null,
		perfect: Boolean(s.is_perfect_combo ?? s.legacy_perfect),
		// CL is how lazer marks a stable score: not worth showing
		mods: (s.mods ?? []).map((m: any) => m.acronym ?? m).filter((m: string) => m && m !== "CL"),
		date: s.ended_at ?? "",
		title: set.title ?? "",
		artist: set.artist ?? "",
		mapper: set.creator ?? "",
		version: map.version ?? "",
		stars: map.difficulty_rating ?? 0,
		length: map.total_length ?? 0,
		bpm: map.bpm ?? 0,
		cover: set.covers?.["cover@2x"] ?? set.covers?.cover ?? "",
		url: map.id ? `https://osu.ppy.sh/b/${map.id}` : "",
	};
}

// Handles /osu/top/<id>; anything else is left to the caller (false).
export function handleOsuTop(req: IncomingMessage, res: ServerResponse): boolean {
	const match = /^\/osu\/top\/(\d{1,12})\/?$/.exec(new URL(req.url ?? "/", "http://x").pathname);
	if (!match) return false;
	const send = (status: number, body: unknown) => {
		res.writeHead(status, {
			"Content-Type": "application/json; charset=utf-8",
			// the overlay is served by tosu, on another port
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "no-store",
		});
		res.end(JSON.stringify(body));
	};
	if (req.method !== "GET") {
		send(405, { error: "GET only" });
		return true;
	}
	const id = Number(match[1]);
	let hit = cache.get(id);
	if (!hit || Date.now() - hit.at > TTL) {
		hit = { at: Date.now(), play: fetchTop(id) };
		cache.set(id, hit);
		// a failure isn't kept: the next ask tries again
		hit.play.catch(() => cache.delete(id));
	}
	hit.play.then(
		(play) => send(200, play),
		(e) => send(502, { error: (e as Error).message }),
	);
	return true;
}
