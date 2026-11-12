import type ZEngine from "@fukutotojido/z-engine";
import axios from "axios";
import IPCClient from "../handler/IPCClient";
import { banchoReply, isBanchoReply } from "./bancho";
import { decidePick } from "./autopick";
import type CasterHandler from "../handler/CasterHandler";
import TwitchChat, { type TwitchStatus } from "../handler/TwitchChat";
import { avatar, chatBadges } from "../handler/TwitchUsers";
import type { DraftEdit, DraftSnapshot } from "../control/ControlLink";
import type { Beatmap, Data } from "../types";
import { oro, type PoolMap } from "./oro.js";
import { fetchSheetPool, type SheetRow } from "./sheet";
import Sources from "./sources";
import { DRAFT, ROUND, clock, ingest, onEvent, setSource, type MatchState, type Side } from "./stage.js";

// Feeds the Oro broadcast from the live match: tosu for the players, scores,
// map and lobby chat; data.json for the seeds, the Twitch channel and the
// pool (or the Google Sheet it points to); the
// Discord bridge for the casters. Oro does the drawing; this only translates.

type Chat = { team: string; time: string; name: string; messageBody: string };
type PlayerInfo = { seed?: number; countryRank?: number };

const SIDES: Side[] = ["l", "r"];
const TEAM: Record<string, Side> = { left: "l", right: "r" };
const DRAFT_KEY = `draft:${ROUND.key}`;
const TWITCH_KEY = "twitch:channel";
const host = window.location.hostname || "127.0.0.1";
// how long an "!mp map" waits for osu! to load the map before its Bancho line is dropped
const MAP_REPLY_MS = 8000;
// osu!'s menu state while the tournament manager is open
const TOURNEY_STATE = 22;
// a lobby this new (just joined or reconnected) brings its loaded map along:
// that map is no pick unless the referee asked for it
const LOBBY_SETTLE_MS = 3000;
// A lobby line stamped (HH:MM, the client's clock) within the last two
// minutes. Older ones are history, even when tosu only now hands them over.
const recent = (time: string) => {
	const [h, m] = time.split(":").map(Number);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return true;
	const now = new Date();
	const diff = (now.getHours() * 60 + now.getMinutes() - (h * 60 + m) + 1440) % 1440;
	return diff <= 2;
};
const fmtLength = (ms: number) => {
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default class LiveOro {
	private clients: IPCClient[];
	private pool: PoolMap[] = [];
	private players: Record<string, PlayerInfo> = {};
	private stars: Record<Side, number> = { l: 0, r: 0 };
	private time = { current: 0, full: 0 };
	private playing = false;
	// The map clock only counts once it has been seen before the map's end.
	// When a match starts, tosu's first frames can still carry the lobby's
	// song preview, at or past the map's length; read as the map clock, that
	// "ended" the map before a note was played and gave it to the left (0-0).
	private clockArmed = false;
	private mapKey = "";
	private last: MatchState | null = null;

	constructor(
		private engine: ZEngine,
		casters: CasterHandler,
	) {
		this.clients = [...Array(8)].map((_, i) => new IPCClient(engine, i));
		document.querySelector<HTMLElement>(".stage")!.dataset.live = "";
		this.loadDraft();
		this.bindScores();
		this.bindPlayers();
		this.bindMap();
		this.bindLobby();
		this.bindCasters(casters);
		this.bindDraftControls();
		this.loadData();
	}

	// ---------- scores: every frame, from the client of each side ----------

	private client(side: Side) {
		return this.clients.find((c) => TEAM[c.team] === side);
	}

	private bindScores() {
		setSource((state) => {
			this.last = state;
			for (const side of SIDES) {
				const c = this.client(side);
				if (!c) continue;
				ingest(side, {
					score: Number(c.score) || 0,
					combo: Number(c.currentCombo) || 0,
					maxCombo: Number(c.maxCombo) || 0,
					acc: Number(c.accuracy) || 100,
					miss: Number(c.h0) || 0,
					n100: Number(c.h100) || 0,
					n50: Number(c.h50) || 0,
					// tosu's count, else the client's own guess from combo drops
					sb: Number(c.sb) || c.sliderbreaks || 0,
					ur: Number(c.UR) || 0,
				});
			}
			if (this.playing) {
				const { current, full } = this.time;
				if (!this.clockArmed && full > 0 && current < full) this.clockArmed = true;
				if (this.clockArmed) clock(current / 1000, full / 1000);
			}
		});
		this.engine.register("menu.bm.time.current", (_, v: number) => (this.time.current = Number(v) || 0));
		this.engine.register("menu.bm.time.full", (_, v: number) => (this.time.full = Number(v) || 0));
		this.engine.register("tourney.manager.bools.scoreVisible", (_, v: boolean) => {
			this.playing = Boolean(v);
			// a new play starts the clock unarmed again (see clockArmed)
			if (this.playing) this.clockArmed = false;
			// the automatic pick is being played: it stays
			if (this.playing && this.autoPick?.id === this.current.id) this.autoPick = null;
			oro.setChatMode(this.playing ? "playing" : "lobby");
		});
		onEvent((type, side) => type === "end" && this.mapEnded(side as Side));
	}

	// A finished map: its winner takes the pick, the result screen gets the
	// numbers. tosu's stars may not have moved yet, so the winner's is counted.
	private mapEnded(winner: Side) {
		const s = this.last;
		if (!s) return;
		// A tie (0-0 above all: no scores came in) names nobody; the operator
		// marks the winner in the panel instead of the overlay guessing left.
		if (Math.round(s.score.l) === Math.round(s.score.r)) {
			console.warn(`[LiveOro] Map ${DRAFT.current || "?"} ended ${Math.round(s.score.l)}-${Math.round(s.score.r)}: no winner marked`);
			return;
		}
		const slot = DRAFT.current;
		const pick = DRAFT.picks.find((p) => p.id === slot);
		if (pick) pick.won = winner;
		if (slot === "TB") DRAFT.tbWon = winner;
		this.saveDraft();
		oro.draftChanged();
		const numbers = (side: Side) => ({ score: Math.round(s.score[side]), acc: s.acc[side], maxCombo: s.maxCombo[side], miss: s.miss[side] });
		const stars = { ...this.stars, [winner]: this.stars[winner] + 1 };
		oro.setResult({ winner, stars, l: numbers("l"), r: numbers("r") });
	}

	// ---------- players: names, avatars, ranks, seeds, stars ----------

	private bindPlayers() {
		for (const side of SIDES) {
			const team = side === "l" ? "left" : "right";
			this.engine.register(`tourney.manager.teamName.${team}`, (_, name: string) => {
				this.teamName[side] = String(name ?? "").trim();
				this.refreshPlayer(side);
			});
			this.engine.register(`tourney.manager.stars.${team}`, (_, n: number) => {
				this.stars[side] = Number(n) || 0;
				oro.setStars({ ...this.stars });
				this.onUpdate?.();
			});
		}
		for (let i = 0; i < this.clients.length; i++) {
			for (const key of ["team", "spectating.name", "spectating.userID", "spectating.globalRank", "spectating.totalPP"]) {
				this.engine.register(`tourney.ipcClients.${i}.${key}`, (_, __, data) => this.readSpectating(data));
			}
		}
	}

	private spectating: Record<Side, { userID?: number; globalRank?: number; totalPP?: number; country?: string; name?: string }> = { l: {}, r: {} };

	// biome-ignore lint/suspicious/noExplicitAny: tosu payload
	private readSpectating(data: any) {
		for (const client of data?.tourney?.ipcClients ?? []) {
			const side = TEAM[client.team];
			if (!side || !client.spectating) continue;
			const before = JSON.stringify(this.spectating[side]);
			this.spectating[side] = client.spectating;
			if (before !== JSON.stringify(client.spectating)) this.refreshPlayer(side);
		}
	}

	private teamName: Record<Side, string> = { l: "", r: "" };
	names: Record<Side, string> = { l: "", r: "" };

	// The team name the tourney client reads from the lobby's title; when the
	// lobby is not titled "ACR: (A) vs (B)" it is empty, so the name falls
	// back to the player that side's client spectates.
	private refreshPlayer(side: Side) {
		const spec = this.spectating[side];
		const name = this.teamName[side] || (spec.name ?? "").trim();
		const info = this.players[name.toLowerCase()] ?? {};
		if (name && name !== this.names[side]) {
			this.names[side] = name;
			oro.setPerson(side, { name });
			this.onUpdate?.();
		}
		if (spec.userID) oro.setPerson(side, { osuId: spec.userID });
		oro.setPlayerInfo(side, {
			seed: info.seed,
			rank: spec.globalRank,
			countryRank: info.countryRank,
			pp: spec.totalPP,
		});
	}

	// ---------- the map in play ----------

	private bindMap() {
		for (const key of ["menu.state", "tourney.manager.teamName.left", "tourney.manager.teamName.right"]) {
			this.engine.register(key, (_, __, data) => this.readLobby(data));
		}
		for (const key of ["menu.bm.id", "menu.bm.stats.fullSR", "menu.bm.metadata.title", "menu.bm.path.full"]) {
			this.engine.register(key, (_, __, data) => this.readMap(data));
		}
		// the difficulty graph under the vinyl (a new array every frame; oro
		// redraws only when it is a different curve)
		this.engine.register("menu.pp.strains", (_, strains) => oro.setStrains(strains));
	}

	// biome-ignore lint/suspicious/noExplicitAny: tosu payload
	private readMap(data: any) {
		const bm = data?.menu?.bm;
		if (!bm) return;
		const slot = this.pool.find((m) => m.beatmapId === bm.id);
		const map: PoolMap = {
			id: slot?.id ?? "",
			set: bm.set ?? slot?.set ?? 0,
			// pool maps keep their set cover; anything else shows tosu's background
			art: slot ? undefined : bm.path?.full ? `http://${host}:24050/Songs/${encodeURIComponent(bm.path.full)}` : "none",
			artist: bm.metadata?.artist ?? "",
			title: bm.metadata?.title ?? "",
			mapper: bm.metadata?.mapper ?? "",
			diff: bm.metadata?.difficulty ?? "",
			sr: Number(bm.stats?.fullSR) || 0,
			bpm: Number(bm.stats?.BPM?.common ?? bm.stats?.BPM) || 0,
			ar: Number(Number(bm.stats?.AR).toFixed(1)) || 0,
			od: Number(Number(bm.stats?.OD).toFixed(1)) || 0,
			cs: Number(Number(bm.stats?.CS).toFixed(1)) || 0,
			len: fmtLength(Number(bm.time?.full) || 0),
		};
		// The map an "!mp map" asked for, once osu! has it loaded: Bancho's line
		// names the map that really came up, not the one in the command.
		if (bm.id !== this.lastBeatmapId) {
			this.lastBeatmapId = bm.id;
			// A new map disarms the clock too: after an !mp abort tosu keeps
			// scoreVisible on and the old time frozen, which on a shorter map
			// would read as that map already finished.
			this.clockArmed = false;
			const asked = this.pendingMapReply;
			if (asked && Date.now() - asked.at < MAP_REPLY_MS && bm.id) {
				this.pendingMapReply = null;
				oro.chat("BanchoBot", "bot", `Changed beatmap to https://osu.ppy.sh/b/${bm.id} ${map.artist} - ${map.title} [${map.diff}]`, asked.time, true);
			}
		}
		this.readLobby(data);
		// A replay in the showcase is not a pick: it only features its map.
		if (document.body.dataset.scene === "showcase") {
			if (slot) oro.feature(slot.id);
			return;
		}
		const key = JSON.stringify(map);
		if (key === this.mapKey) return;
		this.mapKey = key;
		// A pool map coming up that nobody picked yet is the next picker's pick,
		// but only in a tournament lobby (not a normal osu! browsing songs), and
		// in a lobby just joined only when the referee asked for it.
		const asked = Date.now() - this.mapAskedAt < MAP_REPLY_MS;
		const inLobby = data?.menu?.state === TOURNEY_STATE;
		const settled = Date.now() - this.lobbySince > LOBBY_SETTLE_MS;
		const decided = slot ? decidePick(DRAFT.picks, DRAFT.bans, slot.id, { inLobby, asked, settled, autoPick: this.autoPick, nextPicker: this.nextPicker() }) : null;
		if (decided) {
			DRAFT.picks = decided.picks;
			this.autoPick = decided.autoPick;
			// a picker set by hand was for this pick
			delete DRAFT.next;
			this.saveDraft();
		}
		this.current = { id: map.id, title: map.title };
		oro.setCurrentMap(map);
		oro.draftChanged();
		this.onUpdate?.();
	}

	// The lobby is the menu state and the team names; when it changes, the
	// clock for "just joined" starts. Watched on its own keys too, so a lobby
	// that changed long before a map comes up counts as settled.
	// biome-ignore lint/suspicious/noExplicitAny: tosu payload
	private readLobby(data: any) {
		const manager = data?.tourney?.manager;
		const lobby = `${data?.menu?.state}|${manager?.teamName?.left ?? ""}|${manager?.teamName?.right ?? ""}`;
		if (lobby === this.lobbyKey) return;
		this.lobbyKey = lobby;
		this.lobbySince = Date.now();
	}

	private nextPicker(): Side {
		return DRAFT.next ?? (DRAFT.picks.at(-1)?.by === "l" ? "r" : "l");
	}

	// ---------- lobby chat ----------

	// Read by content, not by position: tosu can insert lines in the middle
	// (turning on SHOW_MP_COMMANDS brings back old !mp lines at their own
	// times) or relabel a line's team for a frame, and neither may show a line
	// twice or replay an old command. What was seen is counted per
	// time|name|message, so the same message twice in a minute still shows twice.
	private chatSeen = new Map<string, number>();
	private chatLoaded = false;
	// real BanchoBot replies, once one turns up the overlay stops writing its own
	private realBancho = false;
	// an "!mp map" waiting for osu! to load the map (see readMap)
	private pendingMapReply: { time: string; at: number } | null = null;
	// when the referee last asked for a map, Bancho replies or not
	private mapAskedAt = 0;
	// the lobby tosu is in (menu state and team names) and since when
	private lobbyKey = "";
	private lobbySince = 0;
	// The last pick the overlay made by itself, until it is played. Another
	// pool map coming up before that replaces it (the picker changed their
	// mind) instead of counting as the other side's pick.
	private autoPick: { id: string; by: Side } | null = null;
	private lastBeatmapId: number | undefined;

	private bindLobby() {
		this.engine.register("tourney.manager.chat", (_, __, data) => this.readChat(data?.tourney?.manager?.chat ?? []));
	}

	private readChat(chat: Chat[]) {
		// a frame without the chat (tosu between reads) says nothing
		if (!chat.length) return;
		const counts = new Map<string, number>();
		const fresh: Chat[] = [];
		for (const line of chat) {
			const key = `${line.time}|${line.name}|${line.messageBody}`;
			const n = (counts.get(key) ?? 0) + 1;
			counts.set(key, n);
			if (n > (this.chatSeen.get(key) ?? 0)) fresh.push(line);
		}
		for (const [key, n] of counts) this.chatSeen.set(key, Math.max(n, this.chatSeen.get(key) ?? 0));
		// The lobby's history on load is shown but not acted on: an old
		// "!mp timer" must not start the clock now.
		const history = !this.chatLoaded;
		this.chatLoaded = true;
		for (const line of fresh) {
			const bot = line.team === "bot" || line.name === "BanchoBot";
			if (bot && isBanchoReply(line.messageBody)) this.realBancho = true;
			const act = !history && recent(line.time);
			oro.chat(line.name, this.chatSide(line, bot), line.messageBody, line.time, act);
			const askedMap = act && !bot && /^!mp\s+map\b/i.test(line.messageBody.trim());
			if (askedMap) this.mapAskedAt = Date.now();
			if (!act || bot || this.realBancho) continue;
			if (askedMap) {
				this.pendingMapReply = { time: line.time, at: Date.now() };
				continue;
			}
			const reply = banchoReply(line.messageBody, (id) => this.mapName(id));
			if (reply) oro.chat("BanchoBot", "bot", reply, line.time, true);
		}
	}

	// tosu marks a line "unknown" for a frame now and then; a line from one of
	// the two players still goes on that player's side.
	private chatSide(line: Chat, bot: boolean): Side | "bot" | "ref" {
		if (TEAM[line.team]) return TEAM[line.team];
		if (bot) return "bot";
		const name = line.name.trim().toLowerCase();
		return SIDES.find((side) => this.names[side].toLowerCase() === name) ?? "ref";
	}

	private mapName(beatmapId: number) {
		const map = this.pool.find((m) => m.beatmapId === beatmapId);
		return map ? `${map.artist} - ${map.title} [${map.diff}]` : undefined;
	}

	// ---------- casters: the first four on the Discord call ----------

	private bindCasters(casters: CasterHandler) {
		casters.onChange((list) => {
			([0, 1, 2, 3] as const).forEach((i) => {
				const caster = list[i];
				oro.showCaster(i, Boolean(caster));
				if (!caster) return;
				oro.setPerson(`c${i}`, { name: caster.name, osuId: caster.osuId, avatar: caster.avatarUrl });
				oro.setTalking(i, caster.isSpeaking);
			});
		});
	}

	// ---------- data.json: pool, seeds, Twitch ----------

	private async loadData() {
		try {
			const json: Data = (await axios.get("./data.json")).data;
			this.players = Object.fromEntries(Object.entries(json.players ?? {}).map(([name, info]) => [name.toLowerCase(), info]));
			for (const side of SIDES) this.refreshPlayer(side);
			this.startTwitch(json.twitch);
			await this.loadPool(json);
		} catch (e) {
			console.error("[LiveOro] Failed to load data.json:", (e as Error).message);
			this.poolStatus = { ok: false, text: `No se pudo cargar el pool: ${(e as Error).message}` };
			this.onUpdate?.();
		}
	}

	// ---------- Twitch: the channel whose chat is on screen ----------
	// data.json lists the channels (the first is the default); ?twitch= adds
	// one and starts on it. The panel switches between them, and the choice
	// survives a source refresh.

	private chat: TwitchChat | null = null;
	twitch: { channels: string[]; channel: string; status: TwitchStatus | "off" } = { channels: [], channel: "", status: "off" };

	private startTwitch(listed: Data["twitch"]) {
		const fromUrl = new URLSearchParams(location.search).get("twitch")?.toLowerCase();
		const channels = [...new Set([...(fromUrl ? [fromUrl] : []), ...[listed ?? []].flat().map((c) => c.trim().toLowerCase())])].filter(Boolean);
		this.twitch.channels = channels;
		if (!channels.length) return;
		let saved = "";
		try {
			saved = localStorage.getItem(TWITCH_KEY) ?? "";
		} catch {}
		const channel = fromUrl || (channels.includes(saved) ? saved : channels[0]);
		oro.twitchChannel(channel);
		this.chat = new TwitchChat(
			channel,
			({ channel: room, who, color, msg, userId, badges, emotes }) => {
				oro.twitchLine(who, color, msg, userId, emotes);
				avatar(userId).then((url) => url && oro.twitchAvatar(userId, url));
				chatBadges(room, badges).then((urls) => this.chat?.current === room && oro.twitchBadges(userId, urls));
			},
			(status, name) => {
				this.twitch = { ...this.twitch, channel: name, status };
				this.onUpdate?.();
			},
		);
	}

	setTwitchChannel(channel: string) {
		if (!this.chat || !this.twitch.channels.includes(channel) || channel === this.chat.current) return;
		try {
			localStorage.setItem(TWITCH_KEY, channel);
		} catch {}
		oro.twitchChannel(channel);
		this.chat.join(channel);
	}

	// The pool: the Google Sheet when data.json names one, else data.json's
	// own mappool, where slots are named by mod and position (NM1, NM2...).
	// A lone TB is just "TB" either way.
	private async loadPool(json: Data) {
		let rows: SheetRow[] = [];
		let from = "data.json";
		if (json.sheet) {
			try {
				rows = await fetchSheetPool({ ...json.sheet, gid: this.poolGid ?? json.sheet.gid });
				from = "la sheet";
			} catch (e) {
				console.error("[LiveOro] Failed to read the mappool sheet:", (e as Error).message);
				this.poolStatus = { ok: false, text: `No se pudo leer la sheet (${(e as Error).message}); uso el mappool de data.json` };
			}
		}
		if (!rows.length) rows = (json.mappool ?? []).flatMap(({ mod, maps }) => maps.map((beatmapId, i) => ({ slot: `${mod}${i + 1}`, beatmapId })));
		const tbs = rows.filter((r) => r.slot.replace(/\d+$/, "") === "TB");
		if (tbs.length === 1) tbs[0].slot = "TB";
		if (!rows.length) {
			this.poolStatus = { ok: false, text: `No hay mapas en ${from}` };
			this.onUpdate?.();
			return;
		}
		const query = new URLSearchParams();
		for (const id of new Set(rows.map((r) => r.beatmapId))) query.append("ids", String(id));
		const res = await axios.get(`https://api.try-z.net/beatmaps?${query}`);
		const beatmaps: Beatmap[] = res.data?.beatmaps ?? [];
		const missing: string[] = [];
		this.pool = rows.flatMap((r) => {
			const b = beatmaps.find((m) => m.id === r.beatmapId);
			if (!b) {
				missing.push(r.slot);
				return [];
			}
			return [
				{
					id: r.slot,
					beatmapId: b.id,
					set: b.beatmapset_id,
					artist: b.beatmapset.artist,
					title: b.beatmapset.title,
					mapper: r.mapper ?? b.beatmapset.creator,
					diff: b.version,
					sr: r.sr ?? b.difficulty_rating,
					bpm: r.bpm ?? b.bpm,
					ar: r.ar ?? b.ar,
					od: r.od ?? b.accuracy,
					cs: r.cs ?? b.cs,
					len: r.len ?? fmtLength(b.total_length * 1000),
				},
			];
		});
		const time = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
		const warn = missing.length ? `; sin datos en osu! para ${missing.join(", ")}` : "";
		if (from === "la sheet" || !json.sheet) this.poolStatus = { ok: !missing.length, text: `${this.pool.length} mapas de ${from} a las ${time}${warn}` };
		oro.setPool(this.pool);
		this.onUpdate?.();
		this.mapKey = "";
		this.readMap(this.engine.cache);
	}

	// The sheet tab the match plays, as picked in the panel (see Sources); until
	// then data.json's gid.
	private poolGid: number | null = Sources.savedPool();

	setPoolTab(gid: number) {
		this.poolGid = gid;
		this.poolStatus = { ok: true, text: "Cargando el pool" };
		this.onUpdate?.();
		this.reloadPool();
	}

	// From the panel: read data.json and the sheet again, keeping the draft.
	async reloadPool() {
		try {
			const json: Data = (await axios.get("./data.json", { params: { t: Date.now() } })).data;
			await this.loadPool(json);
		} catch (e) {
			this.poolStatus = { ok: false, text: `No se pudo recargar el pool: ${(e as Error).message}` };
			this.onUpdate?.();
		}
	}

	poolStatus = { ok: true, text: "Cargando el pool" };

	// ---------- the draft: edited from the control panel ----------
	// Also by clicking the cards in OBS's Interact window: click picks for the
	// left, right click for the right; Shift bans, Alt marks the winner, Ctrl
	// clears.

	editDraft(id: string, side: Side, edit: DraftEdit) {
		// a hand on the draft: the overlay no longer replaces its own pick
		this.autoPick = null;
		// a new pick uses up the picker set by hand
		if (edit === "pick" && !DRAFT.picks.some((p) => p.id === id)) delete DRAFT.next;
		const pick = DRAFT.picks.find((p) => p.id === id);
		if (edit === "clear") {
			delete DRAFT.bans[id];
			DRAFT.picks = DRAFT.picks.filter((p) => p.id !== id);
			if (id === "TB") delete DRAFT.tbWon;
		} else if (edit === "win") {
			if (pick) pick.won = side;
			if (id === "TB") DRAFT.tbWon = side;
		} else if (edit === "ban") {
			DRAFT.picks = DRAFT.picks.filter((p) => p.id !== id);
			DRAFT.bans[id] = side;
		} else if (!pick) {
			delete DRAFT.bans[id];
			DRAFT.picks.push({ id, by: side, won: null });
		} else {
			pick.by = side;
		}
		this.saveDraft();
		oro.draftChanged();
	}

	// The panel's undo: the draft as it was before an edit or a reset. It comes
	// over the wire, so only well-formed sides and slots get in.
	restoreDraft(draft: DraftSnapshot) {
		this.autoPick = null;
		const side = (s: unknown): s is Side => s === "l" || s === "r";
		DRAFT.bans = Object.fromEntries(Object.entries(draft?.bans ?? {}).filter(([, s]) => side(s)));
		DRAFT.picks = (Array.isArray(draft?.picks) ? draft.picks : [])
			.filter((p) => typeof p?.id === "string" && side(p.by))
			.map((p) => ({ id: p.id, by: p.by, won: side(p.won) ? p.won : null }));
		if (side(draft?.tbWon)) DRAFT.tbWon = draft.tbWon;
		else delete DRAFT.tbWon;
		this.saveDraft();
		oro.draftChanged();
	}

	// From the panel: the series by hand. osu!'s own count takes over again
	// the next time it changes.
	setStars(stars: Record<Side, number>) {
		const clamp = (n: unknown) => Math.max(0, Math.min(ROUND.firstTo, Math.round(Number(n)) || 0));
		this.stars = { l: clamp(stars?.l), r: clamp(stars?.r) };
		oro.setStars({ ...this.stars });
		this.onUpdate?.();
	}

	// From the panel: who picks next, for when taking turns gets it wrong.
	setNextPicker(side: Side | null) {
		if (side === "l" || side === "r") DRAFT.next = side;
		else delete DRAFT.next;
		this.saveDraft();
		oro.draftChanged();
	}

	resetDraft() {
		this.autoPick = null;
		DRAFT.bans = {};
		DRAFT.picks = [];
		delete DRAFT.next;
		delete DRAFT.tbWon;
		this.saveDraft();
		oro.draftChanged();
	}

	private bindDraftControls() {
		const grid = document.querySelector<HTMLElement>("#poolGrid")!;
		const act = (event: MouseEvent, side: Side) => {
			const id = (event.target as HTMLElement).closest<HTMLElement>(".card")?.dataset.map;
			if (!id) return;
			event.preventDefault();
			const edit = event.ctrlKey ? "clear" : event.altKey ? "win" : event.shiftKey ? "ban" : "pick";
			this.editDraft(id, side, edit);
		};
		grid.addEventListener("click", (e) => act(e, "l"));
		grid.addEventListener("contextmenu", (e) => act(e, "r"));
	}

	// The draft survives a browser source refresh mid-match.
	private loadDraft() {
		try {
			const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
			if (saved) Object.assign(DRAFT, { bans: saved.bans ?? {}, picks: saved.picks ?? [], tbWon: saved.tbWon, next: saved.next === "l" || saved.next === "r" ? saved.next : undefined });
		} catch {}
	}

	// Every draft change goes through here, so it is also where the control
	// panel hears about it.
	private saveDraft() {
		try {
			localStorage.setItem(DRAFT_KEY, JSON.stringify({ bans: DRAFT.bans, picks: DRAFT.picks, tbWon: DRAFT.tbWon, next: DRAFT.next }));
		} catch {}
		this.onUpdate?.();
	}

	// Called when the draft, the pool or the players change.
	onUpdate?: () => void;

	current = { id: "", title: "" };

	get series(): Record<Side, number> {
		return { ...this.stars };
	}

	get poolMaps(): readonly PoolMap[] {
		return this.pool;
	}
}
