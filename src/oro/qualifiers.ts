import axios from "axios";
import type { Beatmap } from "../types";
import { fetchSheetPool, parseCsv, type SheetTab } from "./sheet";
import { RESULTS } from "./sources";

// The results scene (named Qualifiers, its first use): one player at a time,
// their seed and ranks on the left, every map's score and placement on the
// right, grouped by mod with the player's seed in that mod.
//
// Sources says which pool it shows: the scores come from that pool's CSV in
// tourney-results/ (bundled at build time), the map names from that pool's
// sheet tab, matched by slot; a slot the tab doesn't have shows as just its
// slot. Global and country rank come from osu! (through try-z, as the
// beatmaps do), fetched when the player comes on screen.

export interface QualifierMap {
	slot: string;
	score: number;
	rank: number;
}

export interface QualifierPlayer {
	name: string;
	country: string;
	seed: number;
	osuId: number;
	modSeeds: Record<string, number>;
	maps: QualifierMap[];
}

type Ranks = { global?: number; country?: number };

const modOf = (slot: string) => slot.replace(/\d+$/, "");
const num = (text: string | undefined) => {
	const n = Number.parseInt((text ?? "").replace(/[^\d-]/g, ""), 10);
	return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => n.toLocaleString("en-US");
const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// The sheet export repeats the slot names: first the scores (NM1..EZ1), then
// Seed and one "<MOD> Seed" per mod, then each map's placement in slot order.
export function parseQualifiers(text: string): QualifierPlayer[] {
	const [header = [], ...rows] = parseCsv(text.trim());
	const h = header.map((c) => c.trim());
	const seedAt = h.indexOf("Seed");
	const idAt = h.findIndex((c) => c.toLowerCase() === "p1 id");
	if (seedAt < 0) throw new Error("the qualifiers CSV needs a Seed column");
	const slots = h.slice(2, seedAt);
	const modSeedCols = h
		.map((c, i) => [c, i] as const)
		.filter(([c, i]) => i > seedAt && /^[A-Z]+ Seed$/.test(c))
		.map(([c, i]) => [c.split(" ")[0], i] as const);
	const rankAt = (modSeedCols.at(-1)?.[1] ?? seedAt) + 1;
	return rows
		.filter((r) => r[0]?.trim())
		.map((r) => ({
			name: r[0].trim(),
			country: (r[1] ?? "").trim().toUpperCase(),
			seed: num(r[seedAt]),
			osuId: idAt < 0 ? 0 : num(r[idAt]),
			modSeeds: Object.fromEntries(modSeedCols.map(([mod, i]) => [mod, num(r[i])])),
			maps: slots.map((slot, i) => ({ slot, score: num(r[2 + i]), rank: num(r[rankAt + i]) })),
		}))
		// a countdown: the last seed first, the top seed last
		.sort((a, b) => b.seed - a.seed);
}

// osu!'s flag art is named by the flag emoji's code points.
const flagUrl = (iso: string) =>
	iso.length === 2
		? `https://osu.ppy.sh/assets/images/flags/${[...iso].map((c) => (0x1f1e6 + c.charCodeAt(0) - 65).toString(16)).join("-")}.svg`
		: "";

export default class Qualifiers {
	players: QualifierPlayer[] = [];
	index = 0;
	private titles: Record<string, string> = {};
	private ranks = new Map<number, Ranks>();
	private root = document.querySelector<HTMLElement>(".quals")!;
	private file = "";
	private sheetKey = "";

	constructor() {
		this.render();
	}

	// The pool to show: its sheet tab (for the map names and the heading) and
	// its scores file. A new file starts over from the last seed.
	setSource(sheet: { id: string; gid: number } | null, tab: SheetTab | null, file: string) {
		this.root.querySelector(".quals-heading")!.textContent = tab?.name || "Qualifiers";
		if (file !== this.file) {
			this.file = file;
			try {
				this.players = file in RESULTS ? parseQualifiers(RESULTS[file]) : [];
			} catch (e) {
				console.error(`[Qualifiers] Failed to read ${file}:`, (e as Error).message);
				this.players = [];
			}
			this.index = 0;
		}
		const key = sheet ? `${sheet.id}:${sheet.gid}` : "";
		if (key !== this.sheetKey) {
			this.sheetKey = key;
			this.titles = {};
			if (sheet) this.loadTitles(sheet);
		}
		this.render();
		this.loadRanks();
		this.onUpdate?.();
	}

	// Called when the shown player changes, so the panel hears about it.
	onUpdate?: () => void;

	show(index: number) {
		if (!this.players.length) return;
		this.index = (index + this.players.length) % this.players.length;
		this.render();
		this.loadRanks();
		this.onUpdate?.();
	}

	private get player() {
		return this.players[this.index];
	}

	private async loadTitles(sheet: { id: string; gid: number }) {
		const key = this.sheetKey;
		try {
			const rows = await fetchSheetPool(sheet);
			const query = new URLSearchParams();
			for (const id of new Set(rows.map((r) => r.beatmapId))) query.append("ids", String(id));
			const beatmaps: Beatmap[] = (await axios.get(`https://api.try-z.net/beatmaps?${query}`)).data?.beatmaps ?? [];
			// another tab was picked while this one loaded
			if (key !== this.sheetKey) return;
			for (const r of rows) {
				const b = beatmaps.find((m) => m.id === r.beatmapId);
				if (b) this.titles[r.slot] = `${b.beatmapset.title} by ${b.beatmapset.artist}`;
			}
			this.render();
		} catch (e) {
			console.error("[Qualifiers] Failed to read the map names:", (e as Error).message);
		}
	}

	private async loadRanks() {
		const p = this.player;
		if (!p?.osuId || this.ranks.has(p.osuId)) return;
		this.ranks.set(p.osuId, {});
		try {
			const user = (await axios.get(`https://api.try-z.net/users/${p.osuId}/osu`)).data;
			this.ranks.set(p.osuId, { global: user?.statistics?.global_rank ?? undefined, country: user?.statistics?.country_rank ?? undefined });
			if (this.player === p) this.renderRanks();
		} catch (e) {
			// let the next showing try again
			this.ranks.delete(p.osuId);
			console.error(`[Qualifiers] Failed to read ${p.name}'s ranks:`, (e as Error).message);
		}
	}

	private renderRanks() {
		const r = this.ranks.get(this.player?.osuId ?? 0);
		// an entry without "global" is still on its way
		const loaded = Boolean(r && "global" in r);
		const set = (key: string, v?: number) => {
			const el = this.root.querySelector<HTMLElement>(`[data-qrank="${key}"]`);
			if (el) el.textContent = !loaded ? "…" : v ? `#${fmt(v)}` : "—";
		};
		if (!r) {
			set("global");
			set("country");
			return;
		}
		set("global", r.global);
		set("country", r.country);
	}

	// Re-rendered whole on every change, so the entrances replay for each player.
	private render() {
		const p = this.player;
		const body = this.root.querySelector<HTMLElement>(".quals-body")!;
		if (!p) {
			body.innerHTML = `<p class="quals-empty label">Sin resultados para esta hoja: elige el archivo en el panel</p>`;
			return;
		}
		const mods = [...new Set(p.maps.map((m) => modOf(m.slot)))];
		const flag = flagUrl(p.country);
		body.innerHTML = `
			<aside class="quals-player">
				<div class="quals-id">
					<span class="pfp quals-pfp">${p.osuId ? `<img src="https://a.ppy.sh/${p.osuId}" alt="">` : esc(p.name[0] ?? "")}</span>
					<div class="quals-who">
						${flag ? `<img class="quals-flag" src="${flag}" alt="${esc(p.country)}">` : ""}
						<h1 class="quals-name">${esc(p.name)}</h1>
					</div>
				</div>
				<dl class="quals-stats">
					<div><dt>Seed</dt><dd>${p.seed}<small> de ${this.players.length}</small></dd></div>
					<div><dt>Global rank</dt><dd data-qrank="global">…</dd></div>
					<div><dt>Country rank</dt><dd data-qrank="country">…</dd></div>
				</dl>
			</aside>
			<div class="quals-maps">
				${mods
					.map(
						(mod, i) => `
					<section class="quals-mod" style="--i:${i}">
						<header><b class="quals-modname mod--${mod.toLowerCase()}">${mod}</b><span class="quals-modseed" title="Seed en ${mod}">#${p.modSeeds[mod] ?? "—"}</span></header>
						${p.maps
							.filter((m) => modOf(m.slot) === mod)
							.map(
								(m) => `
						<div class="quals-row${m.rank === 1 ? " is-top" : m.rank <= 3 ? " is-podium" : ""}">
							<span class="quals-slot">${m.slot}</span>
							<span class="quals-title">${esc(this.titles[m.slot] ?? "")}</span>
							<span class="quals-score">${fmt(m.score)}</span>
							<span class="quals-rank">#${m.rank}</span>
						</div>`,
							)
							.join("")}
					</section>`,
					)
					.join("")}
			</div>`;
		this.renderRanks();
	}
}
