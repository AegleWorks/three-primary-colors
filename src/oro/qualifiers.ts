import axios from "axios";
import type { TopPlay } from "../server/osuTop";
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
// slot. Global and country rank, playcount, play time, playcount by month and
// the profile banner come from osu! (through try-z, as the beatmaps do); the
// top three plays come from osu!'s site through the bridge (server/osuTop.ts). Both
// are fetched when the player comes on screen.

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

type Ranks = {
	global?: number;
	country?: number;
	plays?: number;
	hours?: number;
	cover?: string;
	// one entry per month from the first month played, months without plays as 0
	monthly?: { year: number; month: number; count: number }[];
};

const BRIDGE = "http://127.0.0.1:24052";
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const modOf = (slot: string) => slot.replace(/\d+$/, "");
const num = (text: string | undefined) => {
	const n = Number.parseInt((text ?? "").replace(/[^\d-]/g, ""), 10);
	return Number.isFinite(n) ? n : 0;
};
const fmt = (n: number) => n.toLocaleString("en-US");

// osu! lists only the months with plays; fill the gaps so the chart's x axis
// is time.
function monthly(list: { start_date: string; count: number }[] | undefined) {
	const counts = new Map<number, number>();
	for (const m of list ?? []) {
		const [y, mo] = m.start_date.split("-").map(Number);
		if (y && mo) counts.set(y * 12 + mo - 1, m.count);
	}
	if (!counts.size) return [];
	const keys = [...counts.keys()];
	const out = [];
	for (let k = Math.min(...keys); k <= Math.max(...keys); k++) out.push({ year: Math.floor(k / 12), month: k % 12, count: counts.get(k) ?? 0 });
	return out;
}
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

export default class Qualifiers {
	players: QualifierPlayer[] = [];
	index = 0;
	private titles: Record<string, string> = {};
	private ranks = new Map<number, Ranks>();
	// not there: not asked yet; empty: asked, nothing (yet) to show
	private tops = new Map<number, TopPlay[]>();
	private root = document.querySelector<HTMLElement>(".quals")!;
	private file = "";
	private sheetKey = "";

	constructor() {
		this.render();
		// an off-screen scene has no layout to measure, so fit the name again
		// once the scene comes on
		new MutationObserver(() => {
			if (this.root.hasAttribute("data-active")) this.fitName();
		}).observe(this.root, { attributes: true, attributeFilter: ["data-active"] });
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
		this.loadTop();
		this.onUpdate?.();
	}

	// Called when the shown player changes, so the panel hears about it.
	onUpdate?: () => void;

	show(index: number) {
		if (!this.players.length) return;
		this.index = (index + this.players.length) % this.players.length;
		this.render();
		this.loadRanks();
		this.loadTop();
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
			const stats = user?.statistics;
			this.ranks.set(p.osuId, {
				global: stats?.global_rank ?? undefined,
				country: stats?.country_rank ?? undefined,
				plays: stats?.play_count ?? undefined,
				// osu! gives play time in seconds
				hours: stats?.play_time ? Math.round(stats.play_time / 3600) : undefined,
				cover: user?.cover?.url ?? user?.cover_url ?? undefined,
				monthly: monthly(user?.monthly_playcounts),
			});
			if (this.player === p) this.renderRanks();
		} catch (e) {
			// let the next showing try again
			this.ranks.delete(p.osuId);
			console.error(`[Qualifiers] Failed to read ${p.name}'s ranks:`, (e as Error).message);
		}
	}

	private async loadTop() {
		const p = this.player;
		if (!p?.osuId || this.tops.has(p.osuId)) {
			this.renderTop();
			return;
		}
		this.tops.set(p.osuId, []);
		try {
			const plays: unknown = (await axios.get(`${BRIDGE}/osu/top/${p.osuId}`, { timeout: 10_000 })).data;
			// an older bridge answers nothing useful here
			this.tops.set(p.osuId, Array.isArray(plays) ? plays : []);
			if (this.player === p) this.renderTop();
		} catch (e) {
			// the bridge may be closed: let the next showing try again
			this.tops.delete(p.osuId);
			console.error(`[Qualifiers] Failed to read ${p.name}'s top plays:`, (e as Error).message);
		}
	}

	// Up to three small rows, each fainter than the one above.
	private renderTop() {
		const el = this.root.querySelector<HTMLElement>("[data-qtop]");
		const plays = this.tops.get(this.player?.osuId ?? 0) ?? [];
		if (!el) return;
		el.hidden = !plays.length;
		if (!plays.length) return;
		el.innerHTML = `
			<header>Top plays</header>
			${plays
				.map(
					(t, i) => `
			<div class="quals-top-row" style="--cover:url(&quot;${esc(t.cover)}&quot;);--i:${i}">
				<div class="quals-top-main">
					<b class="quals-top-title">${esc(t.title)}</b>
					<span class="quals-top-diff">${esc(t.artist)} · <i>${esc(t.version)}</i> · ★${t.stars.toFixed(2)} · ${esc(t.mapper)}</span>
				</div>
				<div class="quals-top-score">
					<b class="quals-top-pp">${fmt(Math.round(t.pp))}<small>pp</small></b>
					<span class="quals-top-acc"><span class="quals-top-grade grade--${esc(t.rank.toLowerCase())}">${esc(t.rank.replace("H", "").replace("X", "SS"))}</span> ${(t.accuracy * 100).toFixed(2)}%${t.mods.length ? ` +${t.mods.map(esc).join("")}` : ""}</span>
				</div>
			</div>`,
				)
				.join("")}`;
	}

	// Playcount by month as an area, the busiest month marked with its count.
	private renderChart(r?: Ranks) {
		const plot = this.root.querySelector<HTMLElement>("[data-qchart]");
		if (!plot) return;
		const months = r?.monthly ?? [];
		const range = this.root.querySelector<HTMLElement>("[data-qrange]");
		if (months.length < 2) {
			plot.innerHTML = `<span class="quals-chart-empty">${r && "global" in r ? "Sin historial" : "…"}</span>`;
			if (range) range.textContent = "";
			return;
		}
		const W = 400;
		const H = 76;
		// room above the line for the peak's tag
		const TOP = 30;
		const max = Math.max(...months.map((m) => m.count)) || 1;
		const peakAt = months.findIndex((m) => m.count === max);
		const x = (i: number) => (i / (months.length - 1)) * W;
		const y = (c: number) => H - 1 - (c / max) * (H - TOP);
		const line = months.map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m.count).toFixed(1)}`).join("");
		const peak = months[peakAt];
		const px = x(peakAt);
		// the tag stays inside the plot even for a peak at either end
		const tagX = Math.min(Math.max(px, 70), W - 70);
		plot.innerHTML = `
			<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
				<defs>
					<linearGradient id="quals-area" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stop-color="var(--gold)" stop-opacity="0.45"/>
						<stop offset="1" stop-color="var(--gold)" stop-opacity="0"/>
					</linearGradient>
				</defs>
				<path d="${line}L${W},${H}L0,${H}Z" fill="url(#quals-area)"/>
				<path d="${line}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linejoin="round"/>
				<line x1="${px}" y1="${y(max)}" x2="${px}" y2="${H}" stroke="var(--gold-hi)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>
				<circle cx="${px}" cy="${y(max)}" r="4.5" fill="var(--gold-hi)" stroke="#0c0a06" stroke-width="2"/>
			</svg>
			<span class="quals-peak" style="left:${tagX}px"><b>${fmt(peak.count)}</b> ${MONTHS[peak.month]} ${peak.year}</span>`;
		if (range) range.textContent = `${months[0].year} – ${months.at(-1)!.year}`;
	}

	private renderRanks() {
		const r = this.ranks.get(this.player?.osuId ?? 0);
		// an entry without "global" is still on its way
		const loaded = Boolean(r && "global" in r);
		const set = (key: string, v?: number, show = (n: number) => `#${fmt(n)}`) => {
			const el = this.root.querySelector<HTMLElement>(`[data-qrank="${key}"]`);
			if (el) el.textContent = !loaded ? "…" : v ? show(v) : "—";
		};
		set("global", r?.global);
		set("country", r?.country);
		set("plays", r?.plays, fmt);
		set("hours", r?.hours, (n) => `${fmt(n)} h`);
		this.renderChart(r);
		const card = this.root.querySelector<HTMLElement>(".quals-id");
		if (card && r?.cover) {
			card.style.setProperty("--banner", `url("${r.cover.replace(/"/g, "%22")}")`);
			card.classList.add("has-banner");
		}
	}

	// The name as big as fits on one line in the card, down to a floor; a name
	// too long even then wraps. Measured once the scene's fonts are in.
	private fitName() {
		const el = this.root.querySelector<HTMLElement>(".quals-name");
		if (!el) return;
		el.style.fontSize = "";
		el.classList.remove("is-wrapped");
		if (!el.clientWidth) return;
		const max = Number.parseFloat(getComputedStyle(el).fontSize);
		let size = max;
		while (el.scrollWidth > el.clientWidth && size > 22) {
			size -= 1;
			el.style.fontSize = `${size}px`;
		}
		if (el.scrollWidth > el.clientWidth) el.classList.add("is-wrapped");
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
		body.innerHTML = `
			<aside class="quals-player">
				<div class="quals-id">
					<span class="pfp quals-pfp">${p.osuId ? `<img src="https://a.ppy.sh/${p.osuId}" alt="">` : esc(p.name[0] ?? "")}</span>
					<div class="quals-who">
						<h1 class="quals-name">${esc(p.name)}</h1>
					</div>
				</div>
				<dl class="quals-stats">
					<div><dt>Seed</dt><dd class="quals-seed${p.seed > 48 ? " is-out" : ""}">${p.seed}<small> de ${this.players.length}</small></dd></div>
					<div><dt>Global rank</dt><dd data-qrank="global">…</dd></div>
					<div><dt>Country rank</dt><dd data-qrank="country">…</dd></div>
				</dl>
				<dl class="quals-mini">
					<div><dt>Playcount</dt><dd data-qrank="plays">…</dd></div>
					<div><dt>Horas jugadas</dt><dd data-qrank="hours">…</dd></div>
				</dl>
				<section class="quals-chart">
					<header><span>Playcount por mes</span><span data-qrange></span></header>
					<div class="quals-chart-plot" data-qchart></div>
				</section>
				<section class="quals-top" data-qtop hidden></section>
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
		this.renderTop();
		this.fitName();
		document.fonts.ready.then(() => {
			if (this.player === p) this.fitName();
		});
	}
}
