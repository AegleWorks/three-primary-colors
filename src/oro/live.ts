import type ZEngine from "@fukutotojido/z-engine";
import axios from "axios";
import IPCClient from "../handler/IPCClient";
import type CasterHandler from "../handler/CasterHandler";
import TwitchChat from "../handler/TwitchChat";
import type { DraftEdit } from "../control/ControlLink";
import type { Beatmap, Data } from "../types";
import { oro, type PoolMap } from "./oro.js";
import { DRAFT, ROUND, clock, ingest, onEvent, setSource, type MatchState, type Side } from "./stage.js";

// Feeds the Oro broadcast from the live match: tosu for the players, scores,
// map and lobby chat; data.json for the pool, seeds and Twitch channel; the
// Discord bridge for the casters. Oro does the drawing; this only translates.

type Chat = { team: string; time: string; name: string; messageBody: string };
type PlayerInfo = { seed?: number; countryRank?: number };

const SIDES: Side[] = ["l", "r"];
const TEAM: Record<string, Side> = { left: "l", right: "r" };
const DRAFT_KEY = `draft:${ROUND.key}`;
const countryName = new Intl.DisplayNames(["es"], { type: "region" });
const host = window.location.hostname || "127.0.0.1";
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
	private chatCount = 0;
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
				});
			}
			if (this.playing) clock(this.time.current / 1000, this.time.full / 1000);
		});
		this.engine.register("menu.bm.time.current", (_, v: number) => (this.time.current = Number(v) || 0));
		this.engine.register("menu.bm.time.full", (_, v: number) => (this.time.full = Number(v) || 0));
		this.engine.register("tourney.manager.bools.scoreVisible", (_, v: boolean) => {
			this.playing = Boolean(v);
			oro.setChatMode(this.playing ? "playing" : "lobby");
		});
		onEvent((type, side) => type === "end" && this.mapEnded(side as Side));
	}

	// A finished map: its winner takes the pick, the result screen gets the
	// numbers. tosu's stars may not have moved yet, so the winner's is counted.
	private mapEnded(winner: Side) {
		const s = this.last;
		if (!s) return;
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
			for (const key of ["team", "spectating.name", "spectating.userID", "spectating.globalRank", "spectating.totalPP", "spectating.country"]) {
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
			country: spec.country ? (countryName.of(spec.country.toUpperCase()) ?? spec.country) : undefined,
			pp: spec.totalPP,
		});
	}

	// ---------- the map in play ----------

	private bindMap() {
		for (const key of ["menu.bm.id", "menu.bm.stats.fullSR", "menu.bm.metadata.title", "menu.bm.path.full"]) {
			this.engine.register(key, (_, __, data) => this.readMap(data));
		}
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
		const key = JSON.stringify(map);
		if (key === this.mapKey) return;
		this.mapKey = key;
		// A pool map coming up that nobody picked yet is the next picker's pick.
		if (slot && slot.id !== "TB" && !DRAFT.bans[slot.id] && !DRAFT.picks.some((p) => p.id === slot.id)) {
			DRAFT.picks.push({ id: slot.id, by: this.nextPicker(), won: null });
			this.saveDraft();
		}
		this.current = { id: map.id, title: map.title };
		oro.setCurrentMap(map);
		oro.draftChanged();
		this.onUpdate?.();
	}

	private nextPicker(): Side {
		return DRAFT.next ?? (DRAFT.picks.at(-1)?.by === "l" ? "r" : "l");
	}

	// ---------- lobby chat ----------

	private bindLobby() {
		this.engine.register("tourney.manager.chat.length", (_, __, data) => {
			const chat: Chat[] = data?.tourney?.manager?.chat ?? [];
			if (chat.length < this.chatCount) this.chatCount = 0;
			for (const line of chat.slice(this.chatCount)) {
				const side = TEAM[line.team] ?? (line.team === "bot" ? "bot" : "ref");
				oro.chat(line.name, side, line.messageBody, line.time);
			}
			this.chatCount = chat.length;
		});
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
			const channel = new URLSearchParams(location.search).get("twitch") || json.twitch;
			if (channel) new TwitchChat(channel, ({ who, color, msg }) => oro.twitchLine(who, color, msg));
			await this.loadPool(json);
		} catch (e) {
			console.error("[LiveOro] Failed to load data.json:", (e as Error).message);
		}
	}

	// Slots are named by mod and position (NM1, NM2...), a lone TB just "TB".
	private async loadPool(json: Data) {
		const ids = json.mappool.flatMap((mod) => mod.maps);
		if (!ids.length) return;
		const query = new URLSearchParams();
		for (const id of ids) query.append("ids", String(id));
		const res = await axios.get(`https://api.try-z.net/beatmaps?${query}`);
		const beatmaps: Beatmap[] = res.data?.beatmaps ?? [];
		this.pool = json.mappool.flatMap(({ mod, maps }) =>
			maps.flatMap((id, i) => {
				const b = beatmaps.find((m) => m.id === id);
				if (!b) return [];
				return [
					{
						id: mod === "TB" && maps.length === 1 ? "TB" : `${mod}${i + 1}`,
						beatmapId: b.id,
						set: b.beatmapset_id,
						artist: b.beatmapset.artist,
						title: b.beatmapset.title,
						mapper: b.beatmapset.creator,
						diff: b.version,
						sr: b.difficulty_rating,
						bpm: b.bpm,
						ar: b.ar,
						od: b.accuracy,
						cs: b.cs,
						len: fmtLength(b.total_length * 1000),
					},
				];
			}),
		);
		oro.setPool(this.pool);
		this.onUpdate?.();
		this.mapKey = "";
		this.readMap(this.engine.cache);
	}

	// ---------- the draft: edited from the control panel ----------
	// Also by clicking the cards in OBS's Interact window: click picks for the
	// left, right click for the right; Shift bans, Alt marks the winner, Ctrl
	// clears.

	editDraft(id: string, side: Side, edit: DraftEdit) {
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

	resetDraft() {
		DRAFT.bans = {};
		DRAFT.picks = [];
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
			if (saved) Object.assign(DRAFT, { bans: saved.bans ?? {}, picks: saved.picks ?? [], tbWon: saved.tbWon });
		} catch {}
	}

	// Every draft change goes through here, so it is also where the control
	// panel hears about it.
	private saveDraft() {
		try {
			localStorage.setItem(DRAFT_KEY, JSON.stringify({ bans: DRAFT.bans, picks: DRAFT.picks, tbWon: DRAFT.tbWon }));
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
