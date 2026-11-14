import type ZEngine from "@fukutotojido/z-engine";
import axios from "axios";
import type { Beatmap, Data } from "../types";
import { fetchSheetPool, fetchSheetTabs, type SheetRow } from "./sheet";
import { LIVE, fmt, goTo, onEvent, type BattleScene } from "./stage.js";

// Battle Royale: a one-off event, apart from the 1v1 matches. Three scenes of
// its own:
//
//   br-lobby     "Ya empezamos" with everyone in the osu! lobby, a card each
//                (avatar, banner, rank, pp), updated as players come and go
//   br-gameplay  the tourney client's window with nothing over it: no names,
//                scores or judgements; the Rempalago background around it,
//                and over the window too while the client is down (it is
//                restarted often to seat new players)
//   br-winner    the winner, picked in the panel from the players in the room
//   br-pool      the event's own mappool (the sheet's "Pool BR" tab), with
//                the lobby and Twitch chats and the casters; no picks by
//                player: the map in play, the one coming up and the ones
//                played, all in one neutral colour
//
// Who is in the room comes from tosu: the players the tourney client
// spectates, and BanchoBot's lines in the lobby chat ("X joined in slot N",
// "X left the game", "!mp settings" slots with their profile links). The
// panel can add or take out a player by hand. Profiles come from osu!
// through try-z, as the rest of the overlay; a player osu! doesn't know
// (banned) is shown by name.

export type BattleCover = "auto" | "cover" | "open";

export interface BattlePlayer {
	name: string;
	id?: number;
	rank?: number;
	countryRank?: number;
	country?: string;
	pp?: number;
	cover?: string;
	// osu! has no such player (banned, renamed)
	unknown?: boolean;
}

export interface BattleMap {
	id: string;
	beatmapId: number;
	set: number;
	title: string;
	artist: string;
	diff: string;
	mapper: string;
	sr: number;
	bpm: number;
	len: string;
}

export interface BattlePool {
	maps: BattleMap[];
	// the map loaded in osu! now, the one coming up (set in the panel), the
	// ones already played; all by slot
	current: string | null;
	next: string | null;
	played: string[];
	status: { ok: boolean; text: string };
}

export interface BattleState {
	players: BattlePlayer[];
	winner: string | null;
	cover: BattleCover;
	// the tourney client is up (tosu sees its players)
	clientsUp: boolean;
	pool: BattlePool;
}

type Chat = { team: string; time: string; name: string; messageBody: string };
type Profile = Omit<BattlePlayer, "name"> & { name?: string };

const SIM = import.meta.env.DEV && !LIVE;
const MAX = 16;
const KEY = "battle:v1";
const host = window.location.hostname || "127.0.0.1";
const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mmss = (ms: number) => {
	const s = Math.max(0, Math.round(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// The simulation's room: players come in one by one.
const SIM_PLAYERS = ["Clippy", "Sombrax79", "hlv", "hxovc", "Kuervo", "yukipo15", "la_mona", "pipe_aim", "mafe_dt", "calilove", "osu_bogota", "rempa_fan", "daniel_hr", "nico_tapper"];
const SIM_SETS = [21936, 2572601, 738828, 587295, 557118, 86022, 21797, 1738131, 84386, 218712, 2598214, 847043, 616902, 329354];

export default class Battle {
	// in order of arrival; key: lower-case name
	private room = new Map<string, { name: string; id?: number }>();
	// seen leaving: not shown again from the client's list until they rejoin
	private gone = new Set<string>();
	// the players the tourney client spectates now
	private spectated: { name: string; id?: number }[] = [];
	private profiles = new Map<string, Profile | null>();
	private chatSeen = new Map<string, number>();
	private chatLoaded = false;
	private winner: string | null = null;
	private winnerData: BattlePlayer | null = null;
	private coverMode: BattleCover = "auto";
	private clientsUp = false;
	private map = { title: "", artist: "", diff: "", mapper: "", sr: 0, bpm: 0, full: 0, art: "" };
	private pool: BattlePool = { maps: [], current: null, next: null, played: [], status: { ok: true, text: "Cargando el pool BR" } };
	private playing = false;

	onUpdate?: () => void;

	constructor(engine: ZEngine | null) {
		this.load();
		if (engine && LIVE) this.bind(engine);
		if (SIM) this.simulate();
		this.loadPool();
		this.followObs();
		onEvent((type, name) => {
			if (type !== "scene") return;
			if (name === "br-winner") confetti();
			if (name === "br-lobby") this.renderLobby(true);
		});
		this.renderAll();
	}

	// ---------- OBS ----------

	// The overlay in OBS hears OBS's own scene changes. A Battle Royale scene
	// on air ("TRC BR", "BR Sala"...) with the overlay still on a match scene
	// would put the match's hit panel and scores over the sixteen clients:
	// the overlay goes to the BR scene by itself, whatever the panel's
	// "Seguir a OBS". A BR scene the operator picked is left as it is.
	private followObs() {
		window.addEventListener("obsSceneChanged", (event) => {
			const name = String((event as CustomEvent<{ name?: string }>).detail?.name ?? "");
			const scene = battleSceneFor(name);
			if (!scene || document.body.dataset.scene?.startsWith("br-")) return;
			goTo(scene);
		});
	}

	// ---------- the panel ----------

	get state(): BattleState {
		return { players: this.players(), winner: this.winner, cover: this.coverMode, clientsUp: this.clientsUp, pool: { ...this.pool, played: [...this.pool.played] } };
	}

	setWinner(name: string | null) {
		this.winner = name ? String(name).trim() || null : null;
		this.winnerData = this.winner ? (this.players().find((p) => p.name.toLowerCase() === this.winner!.toLowerCase()) ?? { name: this.winner }) : null;
		if (this.winner && !this.profiles.has(this.winner.toLowerCase())) this.fetchProfile(this.winner);
		this.save();
		this.renderWinner();
		this.onUpdate?.();
	}

	setCover(mode: BattleCover) {
		if (mode !== "auto" && mode !== "cover" && mode !== "open") return;
		this.coverMode = mode;
		this.save();
		this.renderCover();
		this.onUpdate?.();
	}

	addPlayer(name: string) {
		const clean = String(name ?? "").trim();
		if (!clean) return;
		const key = clean.toLowerCase();
		this.gone.delete(key);
		if (!this.room.has(key)) this.room.set(key, { name: clean });
		this.changed();
	}

	removePlayer(name: string) {
		const key = String(name ?? "").trim().toLowerCase();
		if (!key) return;
		this.room.delete(key);
		this.gone.add(key);
		this.changed();
	}

	// The map coming up, from the panel (null: none). It clears itself once
	// osu! loads it.
	setNext(id: string | null) {
		this.pool.next = id && this.pool.maps.some((m) => m.id === id) ? id : null;
		this.poolChanged();
	}

	// marks a map played or not, by hand
	togglePlayed(id: string) {
		const played = new Set(this.pool.played);
		if (played.has(id)) played.delete(id);
		else if (this.pool.maps.some((m) => m.id === id)) played.add(id);
		this.pool.played = [...played];
		this.poolChanged();
	}

	// every map back to unplayed, nothing coming up
	resetPool() {
		this.pool.played = [];
		this.pool.next = null;
		this.poolChanged();
	}

	private poolChanged() {
		this.save();
		this.renderPool();
		this.onUpdate?.();
	}

	// The sheet's "Pool BR" tab (data.json's battleSheet, or the tab of that
	// name in the match's sheet). Rows as the match's pool: slot, id and the
	// numbers with the mod applied; a row without an id is shown from its cells.
	async loadPool() {
		try {
			const json: Data & { battleSheet?: { id: string; gid?: number } } = (await axios.get("./data.json", { params: { t: Date.now() } })).data;
			const id = json.battleSheet?.id ?? json.sheet?.id;
			if (!id) throw new Error("data.json no tiene sheet");
			let gid = json.battleSheet?.gid;
			if (gid === undefined) {
				const tab = (await fetchSheetTabs(id)).find((t) => /pool\s*br|br\s*pool|battle/i.test(t.name));
				if (!tab) throw new Error('la sheet no tiene una pestaña "Pool BR"');
				gid = tab.gid;
			}
			const rows: SheetRow[] = await fetchSheetPool({ id, gid });
			const query = new URLSearchParams();
			for (const b of new Set(rows.map((r) => r.beatmapId).filter(Boolean))) query.append("ids", String(b));
			const beatmaps: Beatmap[] = query.size ? ((await axios.get(`https://api.try-z.net/beatmaps?${query}`)).data?.beatmaps ?? []) : [];
			this.pool.maps = rows.flatMap((r) => {
				const b = r.beatmapId ? beatmaps.find((m) => m.id === r.beatmapId) : undefined;
				if (!b && !r.title) return [];
				return [
					{
						id: r.slot,
						beatmapId: r.beatmapId || 0,
						set: b?.beatmapset_id ?? 0,
						title: r.title || b?.beatmapset.title || "",
						artist: r.artist || b?.beatmapset.artist || "",
						diff: r.diff || b?.version || "",
						mapper: r.mapper ?? b?.beatmapset.creator ?? "",
						sr: r.sr ?? b?.difficulty_rating ?? 0,
						bpm: r.bpm ?? b?.bpm ?? 0,
						len: r.len ?? (b ? mmss(b.total_length * 1000) : "0:00"),
					},
				];
			});
			const slots = new Set(this.pool.maps.map((m) => m.id));
			this.pool.played = this.pool.played.filter((p) => slots.has(p));
			if (this.pool.next && !slots.has(this.pool.next)) this.pool.next = null;
			const time = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
			this.pool.status = { ok: true, text: `${this.pool.maps.length} mapas de Pool BR a las ${time}` };
			this.poolShape = "";
			this.matchCurrent();
			if (SIM && !this.pool.played.length) {
				this.pool.played = this.pool.maps.slice(0, 2).map((m) => m.id);
				this.pool.current = this.pool.maps[3]?.id ?? null;
				this.pool.next = this.pool.maps[7]?.id ?? null;
			}
		} catch (e) {
			console.error("[Battle] Failed to load the BR pool:", (e as Error).message);
			this.pool.status = { ok: false, text: `No se pudo cargar el pool BR: ${(e as Error).message}` };
		}
		this.renderPool();
		this.onUpdate?.();
	}

	// a new event: the room empties and the winner goes
	reset() {
		this.room.clear();
		this.gone.clear();
		this.winner = null;
		this.winnerData = null;
		this.changed();
		this.renderWinner();
	}

	// ---------- who is in the room ----------

	private players(): BattlePlayer[] {
		return [...this.room.values()].map((p) => {
			const prof = this.profiles.get(p.name.toLowerCase()) ?? (p.id ? this.profiles.get(String(p.id)) : undefined);
			return { ...prof, name: prof?.name || p.name, id: prof?.id ?? p.id };
		});
	}

	private changed() {
		for (const p of this.players()) {
			const key = p.id ? String(p.id) : p.name.toLowerCase();
			if (!this.profiles.has(key) && !this.profiles.has(p.name.toLowerCase())) this.fetchProfile(p.id ? String(p.id) : p.name, p.name);
		}
		this.save();
		this.renderLobby();
		this.renderCount();
		this.renderWinner();
		this.onUpdate?.();
	}

	private async fetchProfile(who: string, name = who) {
		const key = who.toLowerCase();
		this.profiles.set(key, null);
		if (SIM) return;
		try {
			const user = (await axios.get(`https://api.try-z.net/users/${encodeURIComponent(who)}/osu`)).data;
			const stats = user?.statistics;
			const prof: Profile = {
				id: user?.id ?? undefined,
				name: user?.username ?? undefined,
				country: user?.country_code ?? undefined,
				rank: stats?.global_rank ?? undefined,
				countryRank: stats?.country_rank ?? undefined,
				pp: stats?.pp ?? undefined,
				cover: user?.cover?.url ?? user?.cover_url ?? undefined,
			};
			this.profiles.set(key, prof);
			this.profiles.set(name.toLowerCase(), prof);
		} catch (e) {
			if (axios.isAxiosError(e) && e.response?.status === 404) {
				this.profiles.set(key, { unknown: true });
				this.profiles.set(name.toLowerCase(), { unknown: true });
			} else {
				this.profiles.delete(key);
				console.error(`[Battle] Failed to read ${name}'s osu! profile:`, (e as Error).message);
				return;
			}
		}
		if (this.winner && this.winner.toLowerCase() === name.toLowerCase()) {
			this.winnerData = this.players().find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? { ...this.profiles.get(key), name };
			this.renderWinner();
		}
		this.renderLobby();
		this.onUpdate?.();
	}

	// ---------- tosu ----------

	private bind(engine: ZEngine) {
		for (let i = 0; i < MAX; i++) {
			for (const key of ["spectating.name", "spectating.userID", "team"]) {
				engine.register(`tourney.ipcClients.${i}.${key}`, (_, __, data) => this.readClients(data));
			}
		}
		engine.register("menu.state", (_, __, data) => this.readClients(data));
		engine.register("tourney.manager.chat", (_, __, data) => this.readChat(data?.tourney?.manager?.chat ?? []));
		for (const key of ["menu.bm.id", "menu.bm.metadata.title", "menu.bm.stats.fullSR", "menu.bm.path.full"]) {
			engine.register(key, (_, __, data) => this.readMap(data));
		}
		engine.register("menu.bm.time.current", (_, v: number) => this.renderTime(Number(v) || 0));
		// a map being played: the lobby chat folds away and Twitch takes its room
		const playing = (data: any) => {
			const m = data?.tourney?.manager;
			this.setPlaying(Boolean(m?.bools?.scoreVisible) || Number(m?.ipcState) === 3);
		};
		engine.register("tourney.manager.bools.scoreVisible", (_, __, data) => playing(data));
		engine.register("tourney.manager.ipcState", (_, __, data) => playing(data));
	}

	// biome-ignore lint/suspicious/noExplicitAny: tosu payload
	private readClients(data: any) {
		const clients: any[] = data?.tourney?.ipcClients ?? [];
		const now = clients
			.map((c) => ({ name: String(c?.spectating?.name ?? "").trim(), id: Number(c?.spectating?.userID) || undefined }))
			.filter((p) => p.name);
		const up = now.length > 0;
		const key = JSON.stringify(now);
		if (key === JSON.stringify(this.spectated) && up === this.clientsUp) return;
		this.spectated = now;
		// Seen in the client once, in the room until BanchoBot says they left
		// (or the panel takes them out): the client is restarted all the time
		// and comes back with other players, which doesn't empty the room.
		for (const p of now) {
			const k = p.name.toLowerCase();
			if (this.gone.has(k)) continue;
			const was = this.room.get(k);
			if (!was) this.room.set(k, p);
			else if (p.id && !was.id) was.id = p.id;
		}
		if (up !== this.clientsUp) {
			this.clientsUp = up;
			this.renderCover();
		}
		this.changed();
	}

	private readChat(chat: Chat[]) {
		if (!chat.length) return;
		const counts = new Map<string, number>();
		let touched = false;
		// the lobby's history on load: it rebuilds the room, but doesn't bring
		// back someone the panel took out
		const history = !this.chatLoaded;
		this.chatLoaded = true;
		for (const line of chat) {
			const k = `${line.time}|${line.name}|${line.messageBody}`;
			const n = (counts.get(k) ?? 0) + 1;
			counts.set(k, n);
			if (n <= (this.chatSeen.get(k) ?? 0)) continue;
			if (line.team !== "bot" && line.name !== "BanchoBot") continue;
			touched = this.bancho(line.messageBody.trim(), history) || touched;
		}
		for (const [k, n] of counts) this.chatSeen.set(k, Math.max(n, this.chatSeen.get(k) ?? 0));
		if (touched) this.changed();
	}

	// BanchoBot's lines about who is in the room; true when the room changed
	private bancho(msg: string, history = false) {
		let m = /^(.+?) joined in slot \d+/.exec(msg);
		if (m) {
			const key = m[1].toLowerCase();
			if (history && this.gone.has(key)) return false;
			this.gone.delete(key);
			if (!this.room.has(key)) this.room.set(key, { name: m[1] });
			return true;
		}
		m = /^(.+?) left the game\.?$/.exec(msg);
		if (m) {
			this.room.delete(m[1].toLowerCase());
			this.gone.add(m[1].toLowerCase());
			return true;
		}
		// !mp settings: "Slot 1  Not Ready https://osu.ppy.sh/u/123 Name   [Host / Team Red]"
		m = /^Slot \d+\s+.*?https?:\/\/osu\.ppy\.sh\/u\/(\d+)\s+(.+?)(?:\s{2,}\[.*\])?\s*$/.exec(msg);
		if (m) {
			const name = m[2].trim();
			const key = name.toLowerCase();
			if (history && this.gone.has(key)) return false;
			this.gone.delete(key);
			this.room.set(key, { name, id: Number(m[1]) });
			return true;
		}
		return false;
	}

	// biome-ignore lint/suspicious/noExplicitAny: tosu payload
	private readMap(data: any) {
		const bm = data?.menu?.bm;
		if (!bm) return;
		this.map = {
			title: bm.metadata?.title ?? "",
			artist: bm.metadata?.artist ?? "",
			diff: bm.metadata?.difficulty ?? "",
			mapper: bm.metadata?.mapper ?? "",
			sr: Number(bm.stats?.fullSR) || 0,
			bpm: Number(bm.stats?.BPM?.common ?? bm.stats?.BPM) || 0,
			full: Number(bm.time?.full) || 0,
			art: bm.path?.full ? `http://${host}:24050/Songs/${encodeURIComponent(bm.path.full)}` : bm.set ? `https://assets.ppy.sh/beatmaps/${bm.set}/covers/cover.jpg` : "",
		};
		this.renderMap();
		this.lastBm = bm;
		this.matchCurrent();
	}

	// biome-ignore lint/suspicious/noExplicitAny: tosu payload
	private lastBm: any = null;

	// The pool map osu! has loaded (by id, or by title and difficulty for one
	// not uploaded). Again once the pool loads: the map may have come first.
	private matchCurrent() {
		const bm = this.lastBm;
		if (!bm) return;
		const same = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
		const slot =
			this.pool.maps.find((m) => m.beatmapId && m.beatmapId === bm.id) ??
			this.pool.maps.find((m) => !m.beatmapId && same(m.title, bm.metadata?.title) && same(m.diff, bm.metadata?.difficulty));
		const current = slot?.id ?? null;
		if (current !== this.pool.current) {
			this.pool.current = current;
			if (current && this.pool.next === current) this.pool.next = null;
			if (current && this.playing) this.markPlayed(current);
			this.poolChanged();
		}
	}

	private setPlaying(on: boolean) {
		this.playing = on;
		const deck = document.querySelector<HTMLElement>("#brDeck");
		if (deck) deck.dataset.mode = on ? "playing" : "lobby";
		// a map that starts being played counts as played
		if (on && this.pool.current) this.markPlayed(this.pool.current);
	}

	private markPlayed(id: string) {
		if (this.pool.played.includes(id)) return;
		this.pool.played = [...this.pool.played, id];
		this.poolChanged();
	}

	// ---------- drawing ----------

	// ---------- the BR mappool ----------

	private poolShape = "";

	private renderPool() {
		const grid = document.querySelector<HTMLElement>("#brPoolGrid");
		if (!grid) return;
		const maps = this.pool.maps;
		const modOf = (id: string) => id.replace(/\d+$/, "");
		const mods = [...new Set(maps.map((m) => modOf(m.id)))];
		const shape = maps.map((m) => `${m.id}|${m.set}|${m.title}|${m.sr}`).join(",");
		// the cards are built once per pool; states only touch their classes
		if (shape !== this.poolShape) {
			this.poolShape = shape;
			grid.innerHTML = "";
			grid.style.setProperty("--cols", String(Math.max(1, ...mods.map((mod) => maps.filter((m) => modOf(m.id) === mod).length))));
			grid.style.setProperty("--rows", String(Math.max(1, mods.length)));
			let i = 0;
			for (const mod of mods) {
				const row = document.createElement("div");
				row.className = "pool-row";
				row.innerHTML = `<span class="pool-mod mod--${mod.toLowerCase()}">${esc(mod)}</span>`;
				for (const m of maps.filter((x) => modOf(x.id) === mod)) {
					const card = document.createElement("article");
					card.className = "card";
					card.dataset.map = m.id;
					card.style.setProperty("--i", String(i++));
					const art = m.set ? `url('https://assets.ppy.sh/beatmaps/${m.set}/covers/cover.jpg')` : "none";
					card.innerHTML = `<div class="card-art" style="background-image:${art}"></div>
						<div class="card-body">
							<div class="card-top"><b class="card-id">${esc(m.id)}</b><span class="card-state"></span></div>
							<span class="card-title">${esc(m.title)}</span>
							<span class="card-artist">${esc(m.artist)} · ${m.sr.toFixed(2)}★</span>
						</div>`;
					row.append(card);
				}
				grid.append(row);
			}
			if (!maps.length) grid.innerHTML = `<p class="brp-empty">${esc(this.pool.status.text)}</p>`;
		}
		const played = new Set(this.pool.played);
		for (const card of grid.querySelectorAll<HTMLElement>(".card")) {
			const id = card.dataset.map!;
			const state = id === this.pool.current ? "live" : id === this.pool.next ? "next" : played.has(id) ? "played" : "";
			if (card.dataset.state === state) continue;
			const was = card.dataset.state;
			card.dataset.state = state;
			card.querySelector(".card-state")!.textContent = state === "live" ? "En juego" : state === "next" ? "Sigue" : state === "played" ? "Jugado" : "";
			if (was !== undefined && state)
				card.animate([{ filter: "brightness(1.9)", transform: "scale(1.04)" }, { filter: "brightness(1)", transform: "scale(1)" }], { duration: 550, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
		}
		// the head: the map coming up, else the one in play
		const focus = this.pool.maps.find((m) => m.id === (this.pool.next ?? this.pool.current));
		const head = document.querySelector<HTMLElement>("#brPoolNext");
		if (head) {
			head.hidden = !focus;
			if (focus) {
				head.querySelector(".brp-next-kicker")!.textContent = focus.id === this.pool.next ? "Mapa que viene" : "En juego";
				head.querySelector(".brp-next-id")!.textContent = focus.id;
				head.querySelector(".brp-next-title")!.textContent = focus.title;
				head.querySelector(".brp-next-sub")!.textContent = `${focus.artist} · ${focus.sr.toFixed(2)}★ · ${focus.len}`;
				head.querySelector<HTMLElement>(".brp-next-art")!.style.backgroundImage = focus.set ? `url('https://assets.ppy.sh/beatmaps/${focus.set}/covers/cover.jpg')` : "";
			}
		}
		const count = document.querySelector("#brPoolPlayed");
		if (count) count.textContent = `${played.size} / ${maps.length}`;
	}

	private renderAll() {
		this.renderPool();
		this.renderLobby();
		this.renderCount();
		this.renderCover();
		this.renderMap();
		this.renderWinner();
	}

	private cardHtml(p: BattlePlayer, i: number) {
		const stats = p.unknown
			? `<span class="br-stat br-stat--muted">Sin perfil en osu!</span>`
			: [p.rank ? `<span class="br-stat"><b>#${fmt(p.rank)}</b></span>` : "", p.pp ? `<span class="br-stat"><b>${fmt(p.pp)}</b>pp</span>` : ""].join("");
		const pfp = p.id ? `<img src="https://a.ppy.sh/${p.id}" alt="" decoding="async" onerror="this.remove()">` : "";
		return `<i class="br-banner"${p.cover ? ` style="background-image:url('${esc(p.cover)}')"` : ""}></i>
			<span class="br-n">${i + 1}</span>
			<span class="br-pfp"><b>${esc((p.name[0] || "?").toUpperCase())}</b>${pfp}</span>
			<span class="br-text"><b class="br-name">${esc(p.name)}</b><span class="br-stats">${stats}</span></span>`;
	}

	// Cards stay put as players come: only a new one plays its entrance.
	private renderLobby(entrance = false) {
		const grid = document.querySelector<HTMLElement>("#brGrid");
		if (!grid) return;
		const players = this.players().slice(0, MAX);
		const have = new Map([...grid.querySelectorAll<HTMLElement>(".br-card")].map((el) => [el.dataset.key!, el]));
		const keep = new Set<string>();
		players.forEach((p, i) => {
			const key = p.name.toLowerCase();
			keep.add(key);
			const html = this.cardHtml(p, i);
			let el = have.get(key);
			if (!el) {
				el = document.createElement("li");
				el.className = "br-card";
				el.dataset.key = key;
				el.classList.add("is-new");
				setTimeout(() => el!.classList.remove("is-new"), 900);
			}
			if (el.dataset.html !== html) {
				el.dataset.html = html;
				el.innerHTML = html;
				el.toggleAttribute("data-has-banner", Boolean(p.cover));
			}
			// in arrival order
			if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] ?? null);
		});
		for (const [key, el] of have) if (!keep.has(key)) el.remove();
		// empty seats up to 16
		grid.querySelectorAll(".br-seat").forEach((el) => el.remove());
		for (let i = players.length; i < MAX; i++) {
			const seat = document.createElement("li");
			seat.className = "br-seat";
			seat.innerHTML = `<span>${i + 1}</span>`;
			grid.append(seat);
		}
		if (entrance) grid.querySelectorAll<HTMLElement>(".br-card, .br-seat").forEach((el, i) => el.style.setProperty("--i", String(i)));
	}

	private renderCount() {
		const n = String(Math.min(this.players().length, MAX));
		for (const el of document.querySelectorAll<HTMLElement>("[data-br-count]")) el.textContent = n;
	}

	private renderCover() {
		const stage = document.querySelector<HTMLElement>(".stage")!;
		const covered = this.coverMode === "cover" || (this.coverMode === "auto" && LIVE && !this.clientsUp);
		stage.toggleAttribute("data-br-cover", covered);
	}

	private renderMap() {
		const m = SIM ? { title: "FREEDOM DiVE", artist: "xi", diff: "FOUR DIMENSIONS", mapper: "Felistas", sr: 7.12, bpm: 222, full: 258000, art: "https://assets.ppy.sh/beatmaps/21936/covers/cover.jpg" } : this.map;
		const el = document.querySelector("#brTitle");
		if (!el) return;
		el.textContent = m.title || "Esperando mapa";
		$("#brArtist").textContent = m.artist ? `${m.artist} — ${m.mapper}` : "";
		$("#brDiff").textContent = m.diff ? `[${m.diff}]` : "";
		$("#brArt").style.backgroundImage = m.art ? `url("${m.art}")` : "";
		$("#brStats").innerHTML = m.title
			? [
					["SR", `${m.sr.toFixed(2)}★`],
					["BPM", String(Math.round(m.bpm))],
					["Duración", mmss(m.full)],
				]
					.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
					.join("")
			: "";
		$("#brLen").textContent = mmss(m.full);
		this.renderTime(0);
	}

	private renderTime(ms: number) {
		const full = SIM ? 258000 : this.map.full;
		const el = document.querySelector<HTMLElement>("#brClock");
		if (!el) return;
		el.textContent = mmss(Math.min(ms, full || ms));
		const part = full ? Math.min(1, Math.max(0, ms / full)) : 0;
		$("#brBar").style.transform = `scaleX(${part})`;
		$("#brPlayed").style.clipPath = `inset(0 ${(100 - part * 100).toFixed(2)}% 0 0)`;
	}

	private renderWinner() {
		const p = this.winnerData;
		const name = $("#brwName");
		if (!name) return;
		name.textContent = p?.name ?? "—";
		name.dataset.text = p?.name ?? "";
		$("#brwBanner").style.backgroundImage = p?.cover ? `url("${p.cover}")` : "";
		$("#brwPfp").innerHTML = `<b>${esc((p?.name?.[0] || "?").toUpperCase())}</b>${p?.id ? `<img src="https://a.ppy.sh/${p.id}" alt="" onerror="this.remove()">` : ""}`;
		$("#brwStats").innerHTML = p
			? [p.rank ? `<b>#${fmt(p.rank)}</b> global` : "", p.countryRank ? `<b>#${fmt(p.countryRank)}</b> ${esc(p.country || "país")}` : "", p.pp ? `<b>${fmt(p.pp)}</b>pp` : ""]
					.filter(Boolean)
					.join("<i>·</i>")
			: "";
		$("#brwSub").textContent = `Rempalago 3 · entre ${Math.max(this.players().length, 2)} jugadores`;
	}

	// ---------- kept across a source refresh ----------

	private save() {
		// the simulation's made-up room is never kept
		if (SIM) return;
		try {
			localStorage.setItem(KEY, JSON.stringify({ room: [...this.room.values()], gone: [...this.gone], winner: this.winner, cover: this.coverMode, played: this.pool.played, next: this.pool.next }));
		} catch {}
	}

	private load() {
		if (SIM) return;
		try {
			const saved = JSON.parse(localStorage.getItem(KEY) || "null");
			if (!saved) return;
			for (const p of saved.room ?? []) if (p?.name) this.room.set(String(p.name).toLowerCase(), { name: String(p.name), id: Number(p.id) || undefined });
			for (const g of saved.gone ?? []) this.gone.add(String(g));
			if (["auto", "cover", "open"].includes(saved.cover)) this.coverMode = saved.cover;
			if (Array.isArray(saved.played)) this.pool.played = saved.played.map(String);
			if (typeof saved.next === "string") this.pool.next = saved.next;
			if (saved.winner) {
				this.winner = String(saved.winner);
				this.winnerData = { name: this.winner };
				this.fetchProfile(this.winner);
			}
			this.changed();
		} catch {}
	}

	// ---------- the simulation ----------

	private simulate() {
		const add = (i: number) => {
			const name = SIM_PLAYERS[i];
			const key = name.toLowerCase();
			this.profiles.set(
				key,
				name === "yukipo15" ? { unknown: true } : { rank: 1500 + ((i * 7919) % 90000), pp: 4200 + ((i * 1777) % 6000), countryRank: 5 + i * 3, country: "CO", cover: `https://assets.ppy.sh/beatmaps/${SIM_SETS[i]}/covers/cover.jpg` },
			);
			this.room.set(key, { name });
			this.changed();
		};
		for (let i = 0; i < 9; i++) add(i);
		const t0 = performance.now();
		setInterval(() => this.renderTime((performance.now() - t0) % 258000), 500);
		window.addEventListener("keydown", (e) => {
			if (e.key.toLowerCase() !== "g") return;
			const deck = document.querySelector<HTMLElement>("#brDeck");
			this.setPlaying(deck?.dataset.mode !== "playing");
		});
		let next = 9;
		const timer = setInterval(() => {
			if (next >= SIM_PLAYERS.length) return clearInterval(timer);
			add(next++);
		}, 3500);
		this.setWinner("Clippy");
	}
}

// An OBS scene name -> the Battle Royale scene it shows, or null when it is
// not a BR scene. As the panel's SceneSync.
export function battleSceneFor(obsScene: string): BattleScene | null {
	if (!/battle|royale|\bbr\b/i.test(obsScene)) return null;
	if (/champ|campe|winner|ganador/i.test(obsScene)) return "br-winner";
	if (/sala|lobby|empez|start|jugadores/i.test(obsScene)) return "br-lobby";
	if (/pool|mapas|maps/i.test(obsScene)) return "br-pool";
	return "br-gameplay";
}

// ---------- the winner's confetti ----------
// A short burst from both sides, in the tricolour and gold.
function confetti() {
	const canvas = document.querySelector<HTMLCanvasElement>("#brFx");
	if (!canvas) return;
	const ctx = canvas.getContext("2d")!;
	const colors = ["#fcd116", "#003893", "#ce1126", "#e2b866", "#ffe3a3", "#ffffff"];
	type Bit = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string };
	const bits: Bit[] = [];
	const burst = (x: number, dir: number) => {
		for (let i = 0; i < 110; i++) {
			const a = (-60 - Math.random() * 35) * (Math.PI / 180);
			const v = 900 + Math.random() * 900;
			bits.push({ x, y: 1080, vx: Math.cos(a) * v * dir, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, w: 8 + Math.random() * 8, h: 4 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0] });
		}
	};
	let started = 0;
	let last = 0;
	const step = (now: number) => {
		if (document.body.dataset.scene !== "br-winner") return ctx.clearRect(0, 0, 1920, 1080);
		if (!started) {
			started = now;
			last = now;
			burst(-20, 1);
			burst(1940, -1);
		}
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		ctx.clearRect(0, 0, 1920, 1080);
		for (const b of bits) {
			b.vy += 1500 * dt;
			b.vx *= 0.985;
			b.vy *= 0.985;
			b.x += b.vx * dt;
			b.y += b.vy * dt;
			b.r += b.vr * dt;
			ctx.save();
			ctx.translate(b.x, b.y);
			ctx.rotate(b.r);
			ctx.fillStyle = b.c;
			ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
			ctx.restore();
		}
		if (now - started < 6000) requestAnimationFrame(step);
		else ctx.clearRect(0, 0, 1920, 1080);
	};
	// once the stinger lets go of the scene, as the card slams in
	const stage = document.querySelector(".stage")!;
	const wait = () => (stage.classList.contains("hold") ? requestAnimationFrame(wait) : setTimeout(() => requestAnimationFrame(step), 900));
	wait();
}
