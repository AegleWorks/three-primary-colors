import ControlLink, { type Command, type DraftEdit, type DraftSnapshot, type OverlayState } from "../control/ControlLink";
import { channels as twitchChannels, type TwitchUser } from "../handler/TwitchUsers";
import { ROUNDS } from "../config/rounds";
import type { SceneName, Side } from "../oro/stage.js";
import { applyStatic, overlayText, roundLabel, sceneLabel, t } from "./i18n";
import { askForRoom, refused, REMOTE } from "./remote";

// The control panel. Everything it does is a command to the overlay; what it
// shows (scene, series, map, pool, draft) is the state the overlay publishes
// back, so the panel never guesses about what is on screen.
//
// It is built so that whoever runs it doesn't have to keep the match in their
// head: the status bar says whether everything is working (and, when not,
// what to do about it), the "Ahora" card reads the match and says what comes
// next with a button for it, the map sheet puts the likely action first and
// greys out the ones that make no sense, and every draft change can be undone
// for a few seconds instead of asking "¿seguro?" first.

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
// the fixed text in the panel's language, before anything shows (the remote code screen too)
applyStatic();
// ?panel tells the bridge a panel is open, so it doesn't open another
if (REMOTE) document.body.dataset.remote = "";
const link = new ControlLink(REMOTE ? await askForRoom() : "ws://127.0.0.1:24052/?panel");
link.onRefused = refused;
const send = (command: Command) => link.send(command);
let state: OverlayState | null = null;
// Every overlay that has spoken lately, by id, in the order they were first
// heard. The panel follows the one in OBS, or else the first one, so that
// heartbeats from two overlays do not make it flip between them.
const overlays = new Map<string, { state: OverlayState; at: number }>();
const GONE_MS = 10000;
let selected: string | null = null;

const SCENES: SceneName[] = ["starting", "intro", "showcase", "mappool", "gameplay", "result", "champion", "qualifiers"];
const sceneName = (scene: string) => sceneLabel(scene);
// the meter, like the demo, exists only in development builds
const KEYS = ["t", "g", "m", ...(import.meta.env.DEV ? ["p"] : [])].map((key) => [key, ...t.keys[key]] as [string, string, string]);
const SIM_KEYS = ["a", "f", "c", " ", "z", "x", "q", "w"].map((key) => [key, t.simKeys[key]] as [string, string]);
const PRESETS = [60, 90, 120];

function button(label: string, onClick: () => void, className = "btn") {
	const b = document.createElement("button");
	b.type = "button";
	b.className = className;
	b.textContent = label;
	b.addEventListener("click", onClick);
	return b;
}

const name = (side: Side) => state?.names[side] || (side === "l" ? t.left : t.right);
const other = (side: Side): Side => (side === "l" ? "r" : "l");
const esc = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const modOf = (id: string) => id.replace(/\d+$/, "");
const typing = () => {
	const el = document.activeElement as HTMLElement | null;
	return Boolean(el && (el.matches("input, select, textarea") || el.isContentEditable));
};

function stored(key: string, value?: string) {
	try {
		if (value !== undefined) localStorage.setItem(key, value);
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

// ======================================================================
// The match, read from the overlay's state
// ======================================================================

interface Match {
	firstTo: number;
	bestOf: number;
	bansLeft: number;
	// who should ban next, when it can be told from the bans so far
	banner: Side | null;
	phase: "bans" | "picks";
	next: Side;
	winner: Side | null;
	tiebreaker: boolean;
}

function readMatch(s: OverlayState): Match {
	const round = ROUNDS[s.round];
	const bestOf = round?.bestOf ?? 13;
	const firstTo = Math.ceil(bestOf / 2);
	const perSide = round?.bans ?? 0;
	// bans keep the order they were made in (object keys are slot names)
	const bans = Object.values(s.draft.bans);
	const count = (side: Side) => bans.filter((b) => b === side).length;
	const bansLeft = Math.max(0, 2 * perSide - bans.length);
	let banner: Side | null = null;
	if (bansLeft) {
		const last = bans.at(-1);
		if (last && count(other(last)) < perSide) banner = other(last);
		else if (count("l") < perSide && count("r") >= perSide) banner = "l";
		else if (count("r") < perSide && count("l") >= perSide) banner = "r";
	}
	const last = s.draft.picks.at(-1);
	const winner: Side | null = s.stars.l >= firstTo ? "l" : s.stars.r >= firstTo ? "r" : (s.draft.tbWon ?? null);
	return {
		firstTo,
		bestOf,
		bansLeft,
		banner,
		phase: bansLeft && !s.draft.picks.length ? "bans" : "picks",
		// the same rule the overlay uses for a map nobody marked
		next: s.draft.next ?? (last ? other(last.by) : "l"),
		winner,
		tiebreaker: !winner && s.stars.l === firstTo - 1 && s.stars.r === firstTo - 1,
	};
}

function mapState(id: string) {
	const draft = state!.draft;
	const pick = draft.picks.find((p) => p.id === id);
	return {
		pick,
		order: pick ? draft.picks.indexOf(pick) + 1 : 0,
		ban: draft.bans[id],
		won: id === "TB" ? draft.tbWon : (pick?.won ?? undefined),
		current: draft.current === id,
	};
}

function stateText(id: string) {
	const { pick, ban, won, current } = mapState(id);
	if (ban) return t.stateBanned(name(ban));
	if (won) return t.stateWon(pick ? name(pick.by) : null, name(won));
	if (current) return t.statePlaying(pick ? name(pick.by) : null);
	if (pick) return t.statePicked(name(pick.by));
	return t.stateFree;
}

// ======================================================================
// 1. Is everything working?
// ======================================================================

type Level = "ok" | "wait" | "warn" | "bad" | "off";
interface Check {
	id: string;
	label: string;
	level: Level;
	text: string;
	// what to do about it, in plain words
	fix?: string;
	action?: { label: string; run: () => void };
}
const ICON: Record<Level, string> = { ok: "✓", wait: "…", warn: "!", bad: "✕", off: "–" };

let quiet = false;
let overlayCountNote = "";

function checks(): Check[] {
	const list: Check[] = [];
	const connected = link.connected;
	list.push(
		connected
			? { id: "bridge", label: REMOTE ? t.checkConnection : t.checkBridge, level: "ok", text: t.connected }
			: {
					id: "bridge",
					label: REMOTE ? t.checkConnection : t.checkBridge,
					level: "bad",
					text: t.noConnection,
					fix: REMOTE ? t.fixRemoteLink : t.fixBridge,
				},
	);
	if (!connected) list.push({ id: "overlay", label: "Overlay", level: "off", text: t.noBridge });
	else if (!state)
		list.push({
			id: "overlay",
			label: "Overlay",
			level: "bad",
			text: t.overlayMissing,
			fix: t.fixOverlayMissing,
		});
	else if (quiet)
		list.push({
			id: "overlay",
			label: "Overlay",
			level: "warn",
			text: t.overlayQuiet,
			fix: t.fixOverlayQuiet,
		});
	else list.push({ id: "overlay", label: "Overlay", level: "ok", text: state.live ? t.overlayAnswering : t.overlayDemo });

	if (state?.live) {
		const pool = state.poolStatus;
		if (!state.pool.length) list.push({ id: "pool", label: "Pool", level: "wait", text: t.loading });
		else if (!pool.ok)
			list.push({
				id: "pool",
				label: "Pool",
				level: "warn",
				text: t.poolTrouble,
				fix: t.fixPool(overlayText(pool.text)),
				action: { label: t.reloadPool, run: reloadPool },
			});
		else list.push({ id: "pool", label: "Pool", level: "ok", text: t.maps(state.pool.length) });

		const tw = state.twitch;
		if (!tw.channels.length) list.push({ id: "chat", label: "Chat", level: "off", text: t.noChannels, fix: t.fixChannels });
		else if (tw.status === "joined") list.push({ id: "chat", label: "Chat", level: "ok", text: `#${tw.channel}` });
		else list.push({ id: "chat", label: "Chat", level: "wait", text: t.connecting });
	}

	if (!REMOTE) {
		const obsOn = document.querySelector<HTMLElement>("#obsStatusDot")?.dataset.on === "true";
		list.push(
			obsOn
				? { id: "obs", label: "OBS", level: "ok", text: t.connected }
				: {
						id: "obs",
						label: "OBS",
						level: "warn",
						text: t.notConnected,
						fix: t.fixObs,
						action: { label: t.connectObs, run: () => openSetup("#obsBlock") },
					},
		);
	}
	return list;
}

// The one thing that most needs doing, if any.
function topIssue(list: Check[]): Check | null {
	const version = $("#versionWarning").textContent;
	const order = ["bridge", "overlay"];
	for (const id of order) {
		const c = list.find((x) => x.id === id && (x.level === "bad" || x.level === "warn"));
		if (c) return c;
	}
	if (version) return { id: "version", label: t.checkVersion, level: "warn", text: t.versionMismatch, fix: version };
	const pool = list.find((x) => x.id === "pool" && x.level === "warn");
	if (pool) return pool;
	if (overlayCountNote) return { id: "overlays", label: t.checkOverlays, level: "wait", text: t.manyOverlays, fix: overlayCountNote };
	return null;
}

let healthDrawn = "";
function renderHealth() {
	const list = checks();
	const issue = topIssue(list);
	// heartbeats that change nothing leave the DOM (and the focus) alone
	const key = JSON.stringify([list, issue]);
	if (key === healthDrawn) return;
	healthDrawn = key;
	const box = $("#health");
	box.innerHTML = "";
	for (const c of list) {
		const li = document.createElement("li");
		const b = button("", () => (c.action ? c.action.run() : openSetup("#checkTitle")), "chip");
		b.dataset.level = c.level;
		b.title = `${c.label}: ${c.text}${c.fix ? `. ${c.fix}` : ""}`;
		b.innerHTML = `<i aria-hidden="true">${ICON[c.level]}</i><span class="chip-label">${esc(c.label)}</span><span class="chip-text">${esc(c.text)}</span>`;
		li.append(b);
		box.append(li);
	}

	const alert = $("#alert");
	alert.hidden = !issue;
	if (issue) {
		alert.dataset.level = issue.level;
		$("#alertIcon").textContent = ICON[issue.level];
		$("#alertTitle").textContent = `${issue.label}: ${issue.text}. `;
		$("#alertFix").textContent = issue.fix ?? "";
		const action = $<HTMLButtonElement>("#alertAction");
		action.hidden = !issue.action;
		if (issue.action) {
			action.textContent = issue.action.label;
			action.onclick = issue.action.run;
		}
	}

	// the same checks, as the list in Ajustes
	const checklist = $("#checklist");
	checklist.innerHTML = "";
	for (const c of list) {
		const li = document.createElement("li");
		li.dataset.level = c.level;
		li.innerHTML = `<i aria-hidden="true">${ICON[c.level]}</i><span><b>${esc(c.label)}</b> · ${esc(c.text)}${c.fix && c.level !== "ok" ? `<small>${esc(c.fix)}</small>` : ""}</span>`;
		if (c.action && c.level !== "ok") li.append(button(c.action.label, c.action.run, "btn btn--small"));
		checklist.append(li);
	}
	const problems = list.filter((c) => c.level === "bad" || c.level === "warn").length;
	$("#tab-setup").dataset.badge = problems ? String(problems) : "";
}

function renderBar() {
	const tally = $("#tally");
	const live = Boolean(state && link.connected);
	tally.dataset.state = !live ? "off" : quiet ? "warn" : state!.live ? "live" : "demo";
	$("#tallyLabel").textContent = !link.connected ? (REMOTE ? t.tallyReconnecting : t.tallyNoBridge) : !state ? t.tallyWaiting : quiet ? t.tallyQuiet : state.live ? t.tallyLive : t.tallyDemo;
	$("#tallyScene").textContent = state && link.connected ? sceneName(state.scene) : "—";

	$("#series").hidden = !state;
	if (!state) return;
	const m = readMatch(state);
	$("#seriesNameL").textContent = name("l");
	$("#seriesNameR").textContent = name("r");
	$("#seriesL").textContent = String(state.stars.l);
	$("#seriesR").textContent = String(state.stars.r);
	const round = ROUNDS[state.round];
	$("#seriesFormat").textContent = t.seriesFormat(roundLabel(state.round, round?.name), m.bestOf, m.firstTo);
	$("#legendL").textContent = name("l");
	$("#legendR").textContent = name("r");
}

// ======================================================================
// 2. What happens now?
// ======================================================================

interface Moment {
	tone: "idle" | "live" | "bans" | "picks" | "done" | "warn" | "tb";
	kicker: string;
	title: string;
	detail: string;
	// the scene this moment calls for
	scene?: SceneName;
	actions?: { label: string; run: () => void; primary?: boolean; disabled?: boolean }[];
}

const PRESHOW: SceneName[] = ["starting", "intro"];

function moment(): Moment {
	if (!link.connected)
		return {
			tone: "warn",
			kicker: t.nowNoLink,
			title: REMOTE ? t.nowReconnecting : t.nowOpenBridge,
			detail: REMOTE ? t.nowLostRemote : t.nowOpenBridgeDetail,
		};
	if (!state)
		return {
			tone: "warn",
			kicker: t.nowNoOverlay,
			title: t.nowWaitingOverlay,
			detail: t.nowWaitingOverlayDetail,
		};
	const s = state;
	if (s.scene === "showcase") {
		const map = s.pool.find((m) => m.id === s.showcase);
		return {
			tone: "live",
			kicker: t.nowShowcase,
			title: map ? `${map.id} · ${map.title}` : t.nowPickMap,
			detail: map ? t.nowShowcaseDetail(map.artist, map.diff) : t.nowShowcaseEmpty,
			actions: [
				{ label: t.prev, run: () => stepShowcase(-1), disabled: !s.pool.length },
				{ label: t.next, run: () => stepShowcase(1), primary: true, disabled: !s.pool.length },
			],
		};
	}
	if (s.scene === "qualifiers") {
		const q = s.qualifiers;
		const p = q?.players[q.index];
		return {
			tone: "live",
			kicker: t.nowQuals,
			title: p ? `#${p.seed} · ${p.name}` : t.noPlayers,
			detail: p ? t.nowQualsDetail(q.index + 1, q.players.length) : t.pickResultsSheet,
			actions: p
				? [
						{ label: t.prev, run: () => stepQuals(-1), disabled: q.index <= 0 },
						{ label: t.next, run: () => stepQuals(1), primary: true, disabled: q.index >= q.players.length - 1 },
					]
				: [{ label: t.chooseSheet, run: () => openSetup("#sourcesTitle"), primary: true }],
		};
	}
	if (!s.live)
		return { tone: "idle", kicker: t.nowDemo, title: t.nowDemoTitle, detail: t.nowDemoDetail };
	if (!s.pool.length) return { tone: "idle", kicker: t.nowPreparing, title: t.nowLoadingPool, detail: t.nowLoadingPoolDetail };

	const m = readMatch(s);
	const toPool = { label: t.markInPool, run: () => showTab("match", true) };

	if (m.winner) {
		const round = ROUNDS[s.round];
		const scene: SceneName = round?.title ? "champion" : "result";
		return {
			tone: "done",
			kicker: t.nowSeriesOver,
			title: t.nowSeriesWinner(name(m.winner)),
			detail: t.nowSeriesDetail(s.stars.l, s.stars.r, Boolean(round?.title)),
			scene,
		};
	}

	const cur = s.draft.current;
	if (cur) {
		const map = s.pool.find((x) => x.id === cur);
		const { pick, ban, won } = mapState(cur);
		if (cur === "TB" && !won)
			return { tone: "tb", kicker: t.tiebreaker, title: t.nowTbPlaying(map?.title ?? ""), detail: t.nowTbDetail, scene: "gameplay" };
		if (won)
			return {
				tone: "picks",
				kicker: t.nowMapDone,
				title: t.nowMapWon(name(won), cur),
				detail: m.tiebreaker ? t.nowScoreTb(s.stars.l, s.stars.r) : t.nowScoreNext(s.stars.l, s.stars.r, name(m.next)),
				scene: "result",
				actions: [toPool],
			};
		if (ban)
			return {
				tone: "warn",
				kicker: t.nowHeadsUp,
				title: t.nowBannedLoaded(cur),
				detail: t.nowBannedDetail,
				actions: [{ label: t.openMap(cur), run: () => select(cur), primary: true }],
			};
		return {
			tone: "live",
			kicker: t.nowPlayingKicker(pick ? String(mapState(cur).order) : "?"),
			title: `${cur}${map ? ` · ${map.title}` : ""}`,
			detail: pick ? t.nowPlayingPick(name(pick.by)) : t.nowPlaying,
			scene: "gameplay",
			actions: [{ label: t.openMap(cur), run: () => select(cur) }],
		};
	}

	if (m.tiebreaker) return { tone: "tb", kicker: t.tiebreaker, title: t.nowTie(s.stars.l, s.stars.r), detail: t.nowTieDetail, scene: "gameplay" };

	const fresh = !s.draft.picks.length && !Object.keys(s.draft.bans).length && !s.stars.l && !s.stars.r;
	if (fresh && (PRESHOW.includes(s.scene as SceneName) || !s.scene)) {
		const problems = checks().filter((c) => c.level === "bad" || c.level === "warn");
		const next: SceneName = s.scene === "starting" ? "intro" : "mappool";
		return {
			tone: "idle",
			kicker: t.nowBeforeMatch,
			title: t.vs(name("l"), name("r")),
			detail: problems.length ? t.nowCheckFirst(problems.length, problems.map((p) => p.label).join(", ")) : t.nowAllSet(sceneName(next)),
			scene: next,
		};
	}

	if (m.phase === "bans") {
		const done = 2 * (ROUNDS[s.round]?.bans ?? 0) - m.bansLeft;
		return {
			tone: "bans",
			kicker: t.nowBans(done, done + m.bansLeft),
			title: m.banner ? t.nowBanTurn(name(m.banner)) : t.nowBanPhase,
			detail: t.nowBanDetail,
			scene: "mappool",
			actions: [{ ...toPool, primary: true }],
		};
	}

	const first = !s.draft.picks.length;
	return {
		tone: "picks",
		kicker: t.nowPicks(s.draft.picks.length + 1),
		title: t.nowPickTurn(name(m.next)),
		detail: first ? t.nowFirstPick(name(m.next), name(other(m.next))) : t.nowNextPick,
		scene: "mappool",
		actions: [toPool],
	};
}

let current: Moment | null = null;
let nowDrawn = "";
function renderNow() {
	const mo = moment();
	current = mo;
	renderScenes();
	const key = JSON.stringify([mo, state?.scene]);
	if (key === nowDrawn) return;
	nowDrawn = key;
	const box = $("#now");
	box.dataset.tone = mo.tone;
	$("#nowKicker").textContent = mo.kicker;
	$("#nowTitle").textContent = mo.title;
	$("#nowDetail").textContent = mo.detail;
	const actions = $("#nowActions");
	actions.innerHTML = "";
	if (mo.scene && state && state.scene !== mo.scene) {
		const go = mo.scene;
		actions.append(button(t.goToScene(sceneName(go)), () => goScene(go), "btn btn--gold"));
	}
	for (const a of mo.actions ?? []) {
		const b = button(a.label, a.run, `btn${a.primary && !actions.querySelector(".btn--gold") ? " btn--gold" : ""}`);
		b.disabled = Boolean(a.disabled);
		actions.append(b);
	}
	actions.hidden = !actions.children.length;
}

// ======================================================================
// Scenes
// ======================================================================

let scenePending: SceneName | null = null;
let sceneTimer = 0;
function goScene(scene: SceneName) {
	if (!link.connected) return toast(t.sceneNoLink, { tone: "warn" });
	send({ action: "scene", scene });
	scenePending = scene;
	clearTimeout(sceneTimer);
	sceneTimer = window.setTimeout(() => {
		if (scenePending !== scene) return;
		scenePending = null;
		renderScenes();
		toast(t.sceneDidntChange(sceneName(scene)), { tone: "warn" });
	}, 5000);
	renderScenes();
}

SCENES.forEach((scene, i) => {
	const b = button("", () => goScene(scene), "scene");
	b.dataset.scene = scene;
	b.innerHTML = `<kbd>${i + 1}</kbd><span class="scene-name">${esc(sceneName(scene))}</span><em class="scene-tag"></em>`;
	b.setAttribute("aria-keyshortcuts", String(i + 1));
	$("#scenes").append(b);
});

function renderScenes() {
	if (scenePending && state?.scene === scenePending) scenePending = null;
	const suggest = current?.scene;
	for (const b of document.querySelectorAll<HTMLElement>("#scenes [data-scene]")) {
		const scene = b.dataset.scene;
		const on = scene === state?.scene && link.connected;
		const tag = on ? t.sceneOnAir : scene === scenePending ? t.sceneChanging : scene === suggest ? t.sceneSuggested : "";
		b.dataset.mode = on ? "on" : scene === scenePending ? "pending" : scene === suggest ? "suggest" : "";
		b.setAttribute("aria-current", String(on));
		b.querySelector(".scene-tag")!.textContent = tag;
	}
}

// ======================================================================
// Tabs
// ======================================================================

type Tab = "match" | "showcase" | "quals" | "battle" | "chat" | "setup";
const TABS: Tab[] = ["match", "showcase", "quals", "battle", "chat", "setup"];
let tab: Tab = (TABS as string[]).includes(stored("rempalago-tab") ?? "") ? (stored("rempalago-tab") as Tab) : "match";

function showTab(next: Tab, focusContent = false) {
	tab = next;
	stored("rempalago-tab", next);
	for (const t of TABS) {
		const on = t === next;
		const b = $(`#tab-${t}`);
		b.setAttribute("aria-selected", String(on));
		b.tabIndex = on ? 0 : -1;
		$(`#pane-${t}`).hidden = !on;
	}
	if (focusContent) $(`#pane-${next}`).scrollIntoView({ behavior: "smooth", block: "start" });
}
for (const t of TABS) {
	const b = $(`#tab-${t}`);
	b.addEventListener("click", () => showTab(t));
	b.addEventListener("keydown", (e) => {
		const i = TABS.indexOf(t);
		const to = e.key === "ArrowRight" ? TABS[(i + 1) % TABS.length] : e.key === "ArrowLeft" ? TABS[(i - 1 + TABS.length) % TABS.length] : null;
		if (!to) return;
		e.preventDefault();
		showTab(to);
		$(`#tab-${to}`).focus();
	});
}
showTab(tab);

function openSetup(target: string) {
	showTab("setup");
	const el = $(target);
	if (el instanceof HTMLDetailsElement) el.open = true;
	requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
}

// When the scene on air changes, the tab for it comes forward, unless the
// operator is busy in Chat or Ajustes.
const SCENE_TAB: Partial<Record<SceneName, Tab>> = {
	intro: "match",
	mappool: "match",
	gameplay: "match",
	result: "match",
	champion: "match",
	showcase: "showcase",
	qualifiers: "quals",
	"br-lobby": "battle",
	"br-pool": "battle",
	"br-gameplay": "battle",
	"br-winner": "battle",
};
let lastScene = "";
function followScene() {
	if (!state || state.scene === lastScene) return;
	lastScene = state.scene;
	const to = SCENE_TAB[state.scene as SceneName];
	if (to && to !== tab && (tab === "match" || tab === "showcase" || tab === "quals" || tab === "battle")) showTab(to);
	$("#tab-showcase").dataset.live = String(state.scene === "showcase");
	$("#tab-quals").dataset.live = String(state.scene === "qualifiers");
	$("#tab-battle").dataset.live = String(state.scene.startsWith("br-"));
}

// ======================================================================
// Toast, with undo
// ======================================================================

let toastTimer = 0;
let undo: (() => void) | null = null;
function toast(text: string, opts: { undo?: () => void; tone?: "ok" | "warn" } = {}) {
	const box = $("#toast");
	const ms = opts.undo ? 8000 : 3500;
	undo = opts.undo ?? null;
	$("#toastText").textContent = text;
	$("#toastUndo").hidden = !undo;
	box.dataset.tone = opts.tone ?? "ok";
	box.hidden = false;
	// restart the countdown bar
	const clock = $("#toastClock");
	clock.style.animation = "none";
	void clock.offsetWidth;
	clock.style.animation = `toast-clock ${ms}ms linear forwards`;
	clearTimeout(toastTimer);
	toastTimer = window.setTimeout(() => {
		box.hidden = true;
		undo = null;
	}, ms);
}
$("#toastUndo").addEventListener("click", () => runUndo());
function runUndo() {
	if (!undo) return;
	const fn = undo;
	undo = null;
	fn();
	toast(t.undone);
}

// ======================================================================
// Draft
// ======================================================================

function snapshot(): DraftSnapshot {
	const d = state!.draft;
	return structuredClone({ bans: d.bans, picks: d.picks, ...(d.tbWon ? { tbWon: d.tbWon } : {}) });
}

function reloadPool() {
	$("#poolStatus").textContent = t.poolReloading;
	delete $("#poolStatus").dataset.ok;
	send({ action: "poolReload" });
	toast(t.poolReloadToast);
}
$("#poolReload").addEventListener("click", reloadPool);

// Borrar todo: a second tap within four seconds does it, and it can still be
// undone. Two buttons do it: the one at the top (Limpiar picks y bans) and
// the one at the bottom of the draft.
function armedReset(id: string, label: () => string) {
	let armed = 0;
	$(id).addEventListener("click", () => {
		const b = $(id);
		if (!state?.live) return;
		if (Date.now() - armed > 4000) {
			armed = Date.now();
			b.textContent = t.resetConfirm;
			b.dataset.armed = "";
			setTimeout(() => {
				b.textContent = label();
				delete b.dataset.armed;
			}, 4000);
			return;
		}
		armed = 0;
		b.textContent = label();
		delete b.dataset.armed;
		const before = snapshot();
		send({ action: "draftReset" });
		toast(t.draftCleared, { undo: () => send({ action: "draftRestore", draft: before }) });
	});
}
armedReset("#draftReset", () => t.resetDraft);
armedReset("#poolClear", () => t.poolClear);

// ======================================================================
// By hand: the series and who picks next
// ======================================================================

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-star]")) {
	b.addEventListener("click", () => {
		if (!state?.live) return;
		const side = b.dataset.star as Side;
		const { firstTo } = readMatch(state);
		const before = { ...state.stars };
		const stars = { ...before, [side]: Math.max(0, Math.min(firstTo, before[side] + Number(b.dataset.delta))) };
		if (stars[side] === before[side]) return;
		send({ action: "stars", stars });
		toast(t.starsSet(stars.l, stars.r), { undo: () => send({ action: "stars", stars: before }) });
	});
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-next]")) {
	b.addEventListener("click", () => {
		if (!state?.live) return;
		const v = b.dataset.next;
		const side: Side | null = v === "l" || v === "r" ? v : null;
		if ((state.draft.next ?? null) === side) return;
		send({ action: "nextPicker", side });
		toast(side ? t.nextSet(name(side)) : t.nextAutoSet);
	});
}

$<HTMLButtonElement>("#clearScores").addEventListener("click", () => {
	if (!state?.live) return;
	send({ action: "clearScores" });
	toast(t.scoresCleared);
});

let ctlDrawn = "";
function renderMatchCtl() {
	const live = Boolean(state?.live);
	const stars = state?.stars ?? { l: 0, r: 0 };
	const firstTo = state ? readMatch(state).firstTo : 0;
	const last = state?.draft.picks.at(-1);
	// whose turn it is by taking turns, what "Auto" would pick
	const turn: Side = last ? other(last.by) : "l";
	const chosen = state?.draft.next ?? "auto";
	$<HTMLButtonElement>("#clearScores").disabled = !live;
	const key = JSON.stringify([live, stars, firstTo, chosen, turn, state?.names]);
	if (key === ctlDrawn) return;
	ctlDrawn = key;
	$("#starsL").textContent = String(stars.l);
	$("#starsR").textContent = String(stars.r);
	$("#starsNameL").textContent = name("l");
	$("#starsNameR").textContent = name("r");
	for (const b of document.querySelectorAll<HTMLButtonElement>("[data-star]")) {
		const n = stars[b.dataset.star as Side];
		b.disabled = !live || (Number(b.dataset.delta) < 0 ? n <= 0 : n >= firstTo);
	}
	$("#nextAuto").textContent = t.nextAuto(name(turn));
	$("#nextL").textContent = name("l");
	$("#nextR").textContent = name("r");
	for (const b of document.querySelectorAll<HTMLButtonElement>("[data-next]")) {
		b.disabled = !live;
		b.setAttribute("aria-checked", String(b.dataset.next === chosen));
	}
}

function edit(id: string, side: Side, kind: DraftEdit) {
	if (!state?.live) return;
	const before = snapshot();
	send({ action: "draft", id, side, edit: kind });
	const text = {
		pick: t.editPick(id, name(side)),
		ban: t.editBan(id, name(side)),
		win: t.editWin(id, name(side)),
		clear: t.editClear(id),
	}[kind];
	toast(text, { undo: () => send({ action: "draftRestore", draft: before }) });
	select(null);
}

function select(id: string | null) {
	selected = id;
	if (id) showTab("match");
	renderDraft();
	renderSheet();
	if (id) {
		requestAnimationFrame(() => {
			$("#sheet").scrollIntoView({ behavior: "smooth", block: "nearest" });
			// put the keyboard on the action the sheet suggests
			($("#sheet").querySelector<HTMLElement>(".act[data-suggest]:not(:disabled)") ?? $("#sheetClose")).focus({ preventScroll: true });
		});
	}
}

let draftDrawn = "";
function renderDraft() {
	const status = $("#poolStatus");
	status.hidden = !state?.live || !state.poolStatus?.text;
	if (state?.poolStatus) {
		status.textContent = overlayText(state.poolStatus.text);
		status.dataset.ok = String(state.poolStatus.ok);
	}
	const key = JSON.stringify([Boolean(state), state?.live, state?.pool, state?.draft, state?.names, selected]);
	if (key === draftDrawn) return;
	draftDrawn = key;
	const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("#draft [data-id]")?.dataset.id;
	const box = $("#draft");
	box.innerHTML = "";
	$("#draftReset").toggleAttribute("disabled", !state?.live);
	$("#poolClear").toggleAttribute("disabled", !state?.live || (!state.draft.picks.length && !Object.keys(state.draft.bans).length));
	if (!state) {
		box.innerHTML = `<div class="empty"><b>${t.emptyWaiting}</b><span>${t.emptyWaitingDetail}</span></div>`;
		return;
	}
	if (!state.live) {
		box.innerHTML = `<div class="empty"><b>${t.emptyDemo}</b><span>${t.emptyDemoDetail}</span></div>`;
		return;
	}
	if (!state.pool.length) {
		box.innerHTML = `<div class="empty"><b>${t.emptyLoading}</b><span>${t.emptyLoadingDetail}</span></div>`;
		return;
	}
	for (const mod of [...new Set(state.pool.map((m) => modOf(m.id)))]) {
		const row = document.createElement("div");
		row.className = "mod";
		row.dataset.mod = mod.toLowerCase();
		row.innerHTML = `<b class="mod-name">${esc(mod)}</b><div class="mod-maps"></div>`;
		for (const map of state.pool.filter((m) => modOf(m.id) === mod)) {
			const { pick, order, ban, won, current } = mapState(map.id);
			const card = document.createElement("button");
			card.type = "button";
			card.className = "map";
			card.dataset.id = map.id;
			const kind = ban ? "ban" : won ? "won" : current ? "play" : pick ? "pick" : "free";
			card.dataset.state = kind;
			const side = ban ?? won ?? pick?.by;
			if (side) card.dataset.side = side;
			if (pick) card.dataset.by = pick.by;
			card.setAttribute("aria-pressed", String(selected === map.id));
			const badge = {
				ban: t.badgeBan(name(ban!)),
				won: t.badgeWon(name(won!)),
				play: t.inPlay,
				pick: t.badgePick(name(pick?.by ?? "l")),
				free: "",
			}[kind];
			card.setAttribute("aria-label", `${map.id}, ${map.title}. ${stateText(map.id)}`);
			card.innerHTML = `
				<i class="map-art" style="background-image:url('https://assets.ppy.sh/beatmaps/${Number(map.set)}/covers/card.jpg')"></i>
				<span class="map-top"><b class="map-slot">${esc(map.id)}</b>${order ? `<span class="map-order" title="${t.pickOrder}">#${order}</span>` : ""}${badge ? `<span class="map-badge">${esc(badge)}</span>` : ""}</span>
				<span class="map-title">${esc(map.title)}</span>
				<span class="map-sub">${esc(map.artist)} · [${esc(map.diff)}]</span>
				<span class="map-stats"><b>${map.sr.toFixed(2)}★</b><span>${Math.round(map.bpm)} BPM</span><span>${esc(map.len)}</span></span>`;
			card.addEventListener("click", () => select(selected === map.id ? null : map.id));
			row.lastElementChild!.append(card);
		}
		box.append(row);
	}
	if (focused) box.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

// The likely action for a map: the one the sheet lights up.
function suggestion(id: string): { edit: DraftEdit; side: Side } | null {
	if (!state?.live || id === "TB") return null;
	const { pick, ban, won } = mapState(id);
	if (ban || won || pick) return null;
	const m = readMatch(state);
	if (m.phase === "bans") return m.banner ? { edit: "ban", side: m.banner } : null;
	return { edit: "pick", side: m.next };
}

function renderSheet() {
	const map = state?.live ? state.pool.find((m) => m.id === selected) : undefined;
	const sheet = $("#sheet");
	sheet.hidden = !map;
	if (!map) return;
	const { pick, ban, won } = mapState(map.id);
	const art = $("#sheetArt");
	art.style.backgroundImage = `linear-gradient(90deg, rgba(12, 10, 7, 0.94) 35%, rgba(12, 10, 7, 0.5)), url('https://assets.ppy.sh/beatmaps/${Number(map.set)}/covers/cover.jpg')`;
	art.dataset.mod = modOf(map.id).toLowerCase();
	$("#sheetSlot").textContent = map.id;
	$("#sheetTitle").textContent = map.title;
	$("#sheetMeta").textContent = `${map.artist} · [${map.diff}] · ${map.sr.toFixed(2)}★ · ${Math.round(map.bpm)} BPM · ${map.len}`;
	$("#sheetState").textContent = stateText(map.id);
	$("#sheetNameL").textContent = name("l");
	$("#sheetNameR").textContent = name("r");
	const tip = suggestion(map.id);
	const tb = map.id === "TB";
	for (const b of document.querySelectorAll<HTMLButtonElement>("#sheet .act")) {
		const side = b.dataset.side as Side;
		const kind = b.dataset.edit as "pick" | "ban" | "win";
		const on = { pick: pick?.by === side, ban: ban === side, win: won === side }[kind];
		b.setAttribute("aria-pressed", String(on));
		// The TB isn't picked or banned, and a map nobody picked can't be won.
		b.hidden = tb && kind !== "win";
		b.disabled = on || (kind === "win" && !pick && !tb);
		b.title = kind === "win" && !pick && !tb ? t.pickFirst : "";
		const label = { pick: t.pick, ban: t.ban, win: t.won }[kind];
		b.textContent = on ? `✓ ${label}` : label;
		b.toggleAttribute("data-suggest", tip?.edit === kind && tip.side === side);
	}
	$("#sheetClear").hidden = !pick && !ban && !won;
}

for (const b of document.querySelectorAll<HTMLElement>("#sheet [data-edit]")) {
	b.addEventListener("click", () => {
		if (!selected) return;
		edit(selected, (b.dataset.side as Side) ?? "l", b.dataset.edit as DraftEdit);
	});
}
$("#sheetClose").addEventListener("click", () => select(null));

// ======================================================================
// Timer
// ======================================================================

const secondsInput = $<HTMLInputElement>("#timerSeconds");
secondsInput.value = stored("rempalago-timer") ?? secondsInput.value;
let timerEnd = 0;
let timerTick = 0;
function startTimer(seconds: number) {
	seconds = Math.min(600, Math.max(5, Math.round(seconds) || 120));
	send({ action: "timer", seconds });
	timerEnd = Date.now() + seconds * 1000;
	clearInterval(timerTick);
	timerTick = window.setInterval(renderTimer, 250);
	renderTimer();
	toast(t.timerOn(seconds));
}
function renderTimer() {
	const el = $("#timerRun");
	if (!timerEnd) {
		el.textContent = "";
		return;
	}
	const left = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
	el.textContent = left ? `▶ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : t.timerDone;
	el.dataset.ending = String(left <= 10);
	if (!left) {
		clearInterval(timerTick);
		setTimeout(() => {
			if (timerEnd && Date.now() > timerEnd) {
				timerEnd = 0;
				renderTimer();
			}
		}, 4000);
	}
}
for (const s of PRESETS) {
	const b = button(`▶ ${s} s`, () => startTimer(s), "btn btn--preset");
	b.setAttribute("aria-label", t.timerPresetLabel(s));
	$("#timerStop").before(b);
}
$("#timerStart").addEventListener("click", () => {
	stored("rempalago-timer", secondsInput.value);
	startTimer(Number(secondsInput.value));
});
$("#timerStop").addEventListener("click", () => {
	send({ action: "timer", seconds: null });
	timerEnd = 0;
	clearInterval(timerTick);
	renderTimer();
	toast(t.timerStopped);
});

// ======================================================================
// Overlay shortcuts, round, demo
// ======================================================================

for (const [key, label, title] of KEYS) {
	const b = button(label, () => {
		send({ action: "key", key });
		toast(t.keyDone(label));
	});
	b.title = t.keyTitle(title, key.toUpperCase());
	$("#keys").append(b);
}
if (import.meta.env.DEV) for (const [key, label] of SIM_KEYS) $("#simKeys").append(button(label, () => send({ action: "key", key })));
else $("#simBlock").remove();

const round = $<HTMLSelectElement>("#round");
for (const [key, r] of Object.entries(ROUNDS)) round.add(new Option(`${roundLabel(key, r.name)} · BO${r.bestOf}`, key));
// Changing the round reloads the overlay: picking one only offers it, the
// button does it.
function renderRound() {
	const changing = Boolean(state && round.value !== state.round);
	const apply = $<HTMLButtonElement>("#roundApply");
	apply.hidden = !changing;
	apply.textContent = t.roundApplyTo(roundLabel(round.value, ROUNDS[round.value]?.name));
	$("#roundHint").dataset.warn = String(changing);
	$("#roundHint").innerHTML = changing ? t.roundHintChanging : t.roundHint;
}
round.addEventListener("change", renderRound);
$("#roundApply").addEventListener("click", () => {
	send({ action: "round", round: round.value });
	toast(t.roundChanging(roundLabel(round.value, ROUNDS[round.value]?.name)));
	$("#roundApply").hidden = true;
});

// ======================================================================
// Showcase
// ======================================================================

function stepShowcase(by: number) {
	if (!state?.pool.length) return;
	const ids = state.pool.map((m) => m.id);
	const i = Math.max(0, ids.indexOf(state.showcase));
	send({ action: "showcase", id: ids[(i + by + ids.length) % ids.length] });
}
$("#showcasePrev").addEventListener("click", () => stepShowcase(-1));
$("#showcaseNext").addEventListener("click", () => stepShowcase(1));

let showcaseDrawn = "";
function renderShowcase() {
	const pool = state?.pool ?? [];
	const key = JSON.stringify([pool.map((m) => m.id), state?.showcase]);
	if (key === showcaseDrawn) return;
	showcaseDrawn = key;
	const focused = (document.activeElement as HTMLElement | null)?.dataset.slot;
	const box = $("#showcaseLine");
	box.innerHTML = "";
	for (const b of [$("#showcasePrev"), $("#showcaseNext")]) (b as HTMLButtonElement).disabled = !pool.length;
	const now = pool.find((m) => m.id === state?.showcase);
	$("#showcaseNow").innerHTML = now
		? `<i class="feature-art" style="background-image:url('https://assets.ppy.sh/beatmaps/${Number(now.set)}/covers/cover.jpg')"></i>
			<span class="feature-kicker">${t.inShowcase}</span>
			<b class="feature-title"><span class="map-slot" data-mod="${esc(modOf(now.id).toLowerCase())}">${esc(now.id)}</span> ${esc(now.title)}</b>
			<span class="feature-sub">${esc(now.artist)} · [${esc(now.diff)}] · ${esc(now.mapper)}</span>`
		: `<span class="feature-kicker">${t.inShowcase}</span><b class="feature-title">${pool.length ? t.noMapYet : t.noPool}</b><span class="feature-sub">${pool.length ? t.tapOneBelow : t.waitingPool}</span>`;
	for (const mod of [...new Set(pool.map((m) => modOf(m.id)))]) {
		const row = document.createElement("div");
		row.className = "mod showcase-mod";
		row.dataset.mod = mod.toLowerCase();
		row.innerHTML = `<b class="mod-name">${esc(mod)}</b><div class="showcase-slots"></div>`;
		for (const map of pool.filter((m) => modOf(m.id) === mod)) {
			const b = button("", () => send({ action: "showcase", id: map.id }), "showcase-slot");
			b.dataset.slot = map.id;
			b.innerHTML = `<b>${esc(map.id)}</b><span>${esc(map.title)}</span>`;
			b.title = `${map.id}: ${map.artist} - ${map.title} [${map.diff}]`;
			b.setAttribute("aria-pressed", String(state!.showcase === map.id));
			row.lastElementChild!.append(b);
		}
		box.append(row);
	}
	if (focused) box.querySelector<HTMLElement>(`[data-slot="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

// ======================================================================
// Qualifiers
// ======================================================================

function stepQuals(by: number) {
	const q = state?.qualifiers;
	if (!q?.players.length) return;
	const index = Math.min(q.players.length - 1, Math.max(0, q.index + by));
	if (index !== q.index) send({ action: "qualifier", index });
}
$("#qualsPrev").addEventListener("click", () => stepQuals(-1));
$("#qualsNext").addEventListener("click", () => stepQuals(1));
const qualsSearch = $<HTMLInputElement>("#qualsSearch");
qualsSearch.addEventListener("input", () => {
	qualsDrawn = "";
	renderQualifiers();
});
qualsSearch.addEventListener("keydown", (e) => {
	// Enter shows the first match
	if (e.key !== "Enter") return;
	$("#qualsList").querySelector<HTMLElement>("[data-index]")?.click();
});
let qualsDrawn = "";

function renderQualifiers() {
	const q = state?.qualifiers;
	const players = q?.players ?? [];
	$<HTMLButtonElement>("#qualsPrev").disabled = !players.length || q!.index <= 0;
	$<HTMLButtonElement>("#qualsNext").disabled = !players.length || q!.index >= players.length - 1;
	qualsSearch.disabled = !players.length;
	const key = JSON.stringify([players, q?.index, qualsSearch.value]);
	if (key === qualsDrawn) return;
	qualsDrawn = key;
	const p = q ? players[q.index] : undefined;
	$("#qualsNow").innerHTML = p
		? `<span class="feature-kicker">${t.inQuals(q!.index + 1, players.length)}</span><b class="feature-title">#${p.seed} · ${esc(p.name)}</b><span class="feature-sub">${t.nextTowardSeed1}</span>`
		: `<span class="feature-kicker">Qualifiers</span><b class="feature-title">${t.noPlayers}</b><span class="feature-sub">${t.pickResultsSheet}</span>`;
	const focused = (document.activeElement as HTMLElement | null)?.dataset.index;
	const box = $("#qualsList");
	box.innerHTML = "";
	const find = qualsSearch.value.trim().toLowerCase().replace(/^#/, "");
	players.forEach((pl, i) => {
		if (find && !pl.name.toLowerCase().includes(find) && String(pl.seed) !== find) return;
		const b = button("", () => send({ action: "qualifier", index: i }), "player");
		b.dataset.index = String(i);
		b.setAttribute("role", "option");
		b.setAttribute("aria-selected", String(i === q!.index));
		b.innerHTML = `<b>#${pl.seed}</b><span>${esc(pl.name)}</span>`;
		box.append(b);
	});
	if (players.length && !box.children.length) box.innerHTML = `<p class="hint">${esc(t.noMatch(qualsSearch.value))}</p>`;
	if (focused) box.querySelector<HTMLElement>(`[data-index="${focused}"]`)?.focus({ preventScroll: true });
}

// ======================================================================
// Battle Royale: a special event with its own scenes and room
// ======================================================================

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-br-scene]")) {
	b.addEventListener("click", () => goScene(b.dataset.brScene as SceneName));
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-br-cover]")) {
	b.addEventListener("click", () => send({ action: "battle", cover: b.dataset.brCover as "auto" | "cover" | "open" }));
}
$("#brAdd").addEventListener("submit", (e) => {
	e.preventDefault();
	const input = $<HTMLInputElement>("#brAddName");
	const who = input.value.trim();
	if (!who) return;
	send({ action: "battle", add: who });
	input.value = "";
	toast(t.brAdded(who));
});
$("#brShowWinner").addEventListener("click", () => {
	if (!state?.battle?.winner) return toast(t.brPickFirst, { tone: "warn" });
	goScene("br-winner");
});
$("#brReset").addEventListener("click", () => {
	const b = $<HTMLButtonElement>("#brReset");
	// two taps: the room and the winner go
	if (!b.dataset.armed) {
		b.dataset.armed = "1";
		b.textContent = t.brResetSure;
		setTimeout(() => {
			delete b.dataset.armed;
			b.textContent = t.brReset;
		}, 3000);
		return;
	}
	delete b.dataset.armed;
	b.textContent = t.brReset;
	send({ action: "battle", reset: true });
	toast(t.brCleared);
});
$("#brPoolReload").addEventListener("click", () => send({ action: "battle", poolReload: true }));
$("#brPoolReset").addEventListener("click", () => {
	const before = state?.battle?.pool.played ?? [];
	send({ action: "battle", poolReset: true });
	toast(t.brPoolCleared, { undo: () => before.forEach((id) => send({ action: "battle", played: id })) });
});
let brPoolDrawn = "";

function renderBattlePool() {
	const pool = state?.battle?.pool;
	const key = JSON.stringify(pool ?? null);
	if (key === brPoolDrawn) return;
	brPoolDrawn = key;
	$("#brPoolStatus").textContent = pool?.status.text ?? "";
	$("#brPoolStatus").dataset.ok = String(pool?.status.ok ?? true);
	const box = $("#brPool");
	box.innerHTML = "";
	const played = new Set(pool?.played ?? []);
	for (const m of pool?.maps ?? []) {
		const st = m.id === pool!.current ? "live" : m.id === pool!.next ? "next" : played.has(m.id) ? "played" : "";
		const row = document.createElement("div");
		row.className = "br-map";
		row.dataset.state = st;
		row.dataset.mod = modOf(m.id).toLowerCase();
		const pick = button("", () => {
			const next = pool!.next === m.id ? null : m.id;
			send({ action: "battle", next });
			toast(next ? t.brPoolNextSet(m.id) : t.brPoolNextOff);
		}, "br-map-pick");
		pick.innerHTML = `<i class="map-art" style="background-image:url('https://assets.ppy.sh/beatmaps/${Number(m.set)}/covers/card.jpg')"></i><b>${esc(m.id)}</b><span>${esc(m.title)}</span><small>${st === "live" ? "En juego" : st === "next" ? "Sigue" : st === "played" ? "Jugado" : `${m.sr.toFixed(2)}★`}</small>`;
		const tick = button("✓", () => send({ action: "battle", played: m.id }), "btn btn--small br-map-tick");
		tick.setAttribute("aria-pressed", String(played.has(m.id)));
		tick.setAttribute("aria-label", t.brPoolPlayedLabel(m.id));
		row.append(pick, tick);
		box.append(row);
	}
	if (!pool?.maps.length) box.innerHTML = `<p class="hint">${esc(pool?.status.text ?? t.brNoOverlay)}</p>`;
}

let battleDrawn = "";

function renderBattle() {
	renderBattlePool();
	const br = state?.battle;
	const live = Boolean(state && br);
	for (const b of document.querySelectorAll<HTMLButtonElement>("[data-br-scene]")) {
		b.disabled = !live;
		b.setAttribute("aria-current", String(state?.scene === b.dataset.brScene));
	}
	for (const b of document.querySelectorAll<HTMLButtonElement>("[data-br-cover]")) {
		b.disabled = !live;
		b.setAttribute("aria-checked", String(br?.cover === b.dataset.brCover));
	}
	$<HTMLButtonElement>("#brShowWinner").disabled = !br?.winner;
	$("#brClient").textContent = !br ? t.brNoOverlay : br.clientsUp ? t.brClientUp : t.brClientDown;
	$("#brClient").dataset.tone = !br ? "" : br.clientsUp ? "ok" : "warn";
	const key = JSON.stringify([br?.players, br?.winner]);
	if (key === battleDrawn) return;
	battleDrawn = key;
	const players = br?.players ?? [];
	$("#brRoomN").textContent = String(players.length);
	const box = $("#brRoom");
	box.innerHTML = "";
	for (const p of players) {
		const on = br?.winner?.toLowerCase() === p.name.toLowerCase();
		const row = document.createElement("div");
		row.className = "br-player";
		const pick = button("", () => send({ action: "battle", winner: on ? null : p.name }), "player");
		pick.setAttribute("role", "option");
		pick.setAttribute("aria-selected", String(on));
		pick.innerHTML = `<b>${on ? "★" : ""}</b><span>${esc(p.name)}</span><small>${p.unknown ? esc(t.brNoProfile) : p.rank ? `#${p.rank.toLocaleString("en-US")}` : ""}</small>`;
		const out = button("×", () => {
			send({ action: "battle", remove: p.name });
			toast(t.brRemoved(p.name), { undo: () => send({ action: "battle", add: p.name }) });
		}, "btn btn--small br-out");
		out.setAttribute("aria-label", t.brRemoveLabel(p.name));
		row.append(pick, out);
		box.append(row);
	}
	if (!players.length) box.innerHTML = `<p class="hint">${esc(t.brEmpty)}</p>`;
	const w = players.find((p) => p.name.toLowerCase() === br?.winner?.toLowerCase());
	$("#brWinnerNow").innerHTML = br?.winner
		? `${w?.cover ? `<i class="feature-art" style="background-image:url('${esc(w.cover)}')"></i>` : ""}<span class="feature-kicker">${esc(t.brWinner)}</span><b class="feature-title">${esc(br.winner)}</b><span class="feature-sub">${esc(t.brWinnerSub)}</span>`
		: `<span class="feature-kicker">${esc(t.brWinner)}</span><b class="feature-title">${esc(t.brNoWinner)}</b><span class="feature-sub">${esc(t.brPickFirst)}</span>`;
}

// ======================================================================
// Sources: which sheet tab each part reads
// ======================================================================

const sourcesFile = $<HTMLSelectElement>("#sourcesFile");
$("#sourcesRefresh").addEventListener("click", () => {
	$("#sourcesStatus").textContent = t.sourcesSearching;
	delete $("#sourcesStatus").dataset.ok;
	// redraw on the answer even if nothing changed
	sourcesDrawn = "";
	send({ action: "sources", refresh: true });
});
sourcesFile.addEventListener("change", () => send({ action: "sources", file: sourcesFile.value }));
let sourcesDrawn = "";

function renderSources() {
	const src = state?.sources;
	const key = JSON.stringify(src ?? null);
	if (key === sourcesDrawn) return;
	sourcesDrawn = key;
	const status = $("#sourcesStatus");
	status.textContent = overlayText(src?.status.text ?? "");
	status.hidden = !src?.status.text;
	if (src) status.dataset.ok = String(src.status.ok);
	const box = $("#sourcesTable");
	if (!src) {
		box.innerHTML = `<p class="hint">${t.sourcesWaiting}</p>`;
		sourcesFile.innerHTML = "";
		sourcesFile.add(new Option(t.sourcesNoOverlay, ""));
		sourcesFile.disabled = true;
		return;
	}
	box.innerHTML = src.tabs.length
		? `<table><thead><tr><th>${t.sheetTab}</th><th>${t.tabMatch}</th><th>${t.results}</th></tr></thead><tbody>${src.tabs
				.map(
					(tab) => `<tr${tab.gid === src.pool || tab.gid === src.results ? ' class="is-used"' : ""}>
						<td>${esc(tab.name)}</td>
						<td><label class="radio"><input type="radio" name="sourcePool" value="${tab.gid}" aria-label="${esc(t.tabForMatch(tab.name))}"${tab.gid === src.pool ? " checked" : ""}><i></i></label></td>
						<td><label class="radio"><input type="radio" name="sourceResults" value="${tab.gid}" aria-label="${esc(t.tabForResults(tab.name))}"${tab.gid === src.results ? " checked" : ""}><i></i></label></td>
					</tr>`,
				)
				.join("")}</tbody></table>`
		: "";
	for (const input of box.querySelectorAll<HTMLInputElement>("input[name=sourcePool]"))
		input.addEventListener("change", () => {
			send({ action: "sources", pool: Number(input.value) });
			toast(t.loadingTabPool);
		});
	for (const input of box.querySelectorAll<HTMLInputElement>("input[name=sourceResults]")) input.addEventListener("change", () => send({ action: "sources", results: Number(input.value) }));
	sourcesFile.innerHTML = "";
	if (!src.files.length) sourcesFile.add(new Option(t.sourcesNoFiles, ""));
	for (const f of src.files) sourcesFile.add(new Option(f, f, false, f === src.file));
	sourcesFile.disabled = !src.files.length;
}

// ======================================================================
// Twitch: which channel's chat is on screen
// ======================================================================

// Names, pictures and live status come from IVR, refreshed every minute; the
// channel list and the one in use come from the overlay.
const TWITCH_REFRESH_MS = 60000;
let channelInfo = new Map<string, TwitchUser>();
let infoFor = "";
let infoAt = 0;
// the channel just picked, shown as chosen until the overlay confirms it
let pending: string | null = null;
let pendingTimer = 0;
// what the picker last drew: heartbeats redraw nothing, so focus stays put
let drawn = "";

async function loadChannelInfo(logins: string[]) {
	infoFor = logins.join();
	infoAt = Date.now();
	try {
		const users = await twitchChannels(logins);
		channelInfo = new Map(users.map((u) => [u.login, u]));
	} catch {
		// keep what we had; names still show without pictures
	}
	renderTwitch();
}
setInterval(() => {
	const logins = state?.twitch?.channels ?? [];
	if (logins.length) loadChannelInfo(logins);
}, TWITCH_REFRESH_MS);

function renderTwitch() {
	const box = $("#twitchChannels");
	const status = $("#twitchState");
	const tw = state?.live ? state.twitch : undefined;
	const logins = tw?.channels ?? [];
	if (logins.length && (logins.join() !== infoFor || Date.now() - infoAt > TWITCH_REFRESH_MS)) loadChannelInfo(logins);
	if (pending && tw?.channel === pending) pending = null;
	const chosen = pending ?? tw?.channel ?? "";
	const key = JSON.stringify([Boolean(state), state?.live, logins, chosen, pending, tw?.status, [...channelInfo.values()]]);
	if (key === drawn) return;
	drawn = key;
	const focused = (document.activeElement as HTMLInputElement | null)?.name === "twitchChannel" ? (document.activeElement as HTMLInputElement).value : null;
	box.innerHTML = "";
	status.textContent = "";
	delete status.dataset.state;
	if (!state) {
		box.innerHTML = `<div class="empty"><b>${t.emptyWaiting}</b></div>`;
		return;
	}
	if (!state.live) {
		box.innerHTML = `<div class="empty"><b>${t.chatDemo}</b></div>`;
		return;
	}
	if (!logins.length) {
		box.innerHTML = `<div class="empty"><b>${t.chatNone}</b><span>${t.chatNoneDetail}</span></div>`;
		return;
	}
	const joined = !pending && tw?.status === "joined";
	status.dataset.state = joined ? "ok" : "wait";
	status.textContent = joined ? t.chatReading(tw!.channel) : t.chatConnecting;
	for (const login of logins) {
		const info = channelInfo.get(login);
		const label = document.createElement("label");
		label.className = "channel";
		const on = login === chosen;
		label.innerHTML = `
			<input type="radio" name="twitchChannel" value="${esc(login)}"${on ? " checked" : ""}>
			<span class="channel-pfp"${info?.logo ? ` style="background-image:url('${esc(info.logo)}')"` : ""}>${info?.logo ? "" : esc(login[0].toUpperCase())}</span>
			<span class="channel-text">
				<b>${esc(info?.displayName ?? login)}</b>
				<span>twitch.tv/${esc(login)}</span>
			</span>
			<span class="channel-live" data-live="${info?.live ?? false}">${info ? (info.live ? t.live : t.offline) : ""}</span>
			<span class="channel-on">${on ? t.onScreen : ""}</span>`;
		const input = label.querySelector("input")!;
		input.addEventListener("change", () => {
			pending = login;
			clearTimeout(pendingTimer);
			// no answer from the overlay: show what it really reads again
			pendingTimer = window.setTimeout(() => {
				pending = null;
				renderTwitch();
				toast(t.chatDidntChange, { tone: "warn" });
			}, 8000);
			send({ action: "twitch", channel: login });
			renderTwitch();
		});
		box.append(label);
		if (focused === login) input.focus();
	}
}

// ======================================================================
// Keyboard
// ======================================================================

document.addEventListener("keydown", (e) => {
	if (document.body.hasAttribute("data-gate")) return;
	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing()) {
		if (undo) {
			e.preventDefault();
			runUndo();
		}
		return;
	}
	if (e.key === "Escape" && selected) {
		select(null);
		return;
	}
	if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
	const n = Number(e.key);
	if (n >= 1 && n <= SCENES.length) {
		e.preventDefault();
		goScene(SCENES[n - 1]);
		return;
	}
	if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !(document.activeElement as HTMLElement | null)?.closest("[role=tablist]")) {
		const by = e.key === "ArrowLeft" ? -1 : 1;
		if (tab === "showcase") stepShowcase(by);
		else if (tab === "quals") stepQuals(by);
		else return;
		e.preventDefault();
	}
});

// ======================================================================
// Following the overlay
// ======================================================================

// An overlay that goes quiet (a browser tab in the background, frozen to
// save memory) is dropped only while another one is talking. When none is,
// the panel keeps the last one heard, says it's not answering, and goes on
// working: commands still go out and the overlay catches up when it wakes.
function follow() {
	const now = Date.now();
	const fresh = (o: { at: number }) => now - o.at <= GONE_MS;
	if ([...overlays.values()].some(fresh)) for (const [id, o] of overlays) if (!fresh(o)) overlays.delete(id);
	const all = [...overlays.values()];
	const live = all.filter(fresh);
	quiet = all.length > 0 && !live.length;
	const chosen = live.find((o) => o.state.obs) ?? live[0] ?? all.sort((a, b) => b.at - a.at)[0];
	const count = live.length;
	overlayCountNote =
		count > 1 ? t.manyOverlaysFix(count, Boolean(chosen.state.obs)) : "";
	return chosen?.state ?? null;
}

function renderAll() {
	renderHealth();
	renderBar();
	renderNow();
	followScene();
	renderDraft();
	renderMatchCtl();
	renderSheet();
	renderShowcase();
	renderQualifiers();
	renderBattle();
	renderSources();
	renderTwitch();
}

setInterval(() => {
	const was = quiet;
	const note = overlayCountNote;
	follow();
	if (quiet !== was || note !== overlayCountNote) renderAll();
}, 2000);

link.onStatus = () => renderAll();

link.onState((incoming) => {
	const known = overlays.get(incoming.id);
	if (known) Object.assign(known, { state: incoming, at: Date.now() });
	else overlays.set(incoming.id, { state: incoming, at: Date.now() });
	const next = follow();
	if (!next) return;
	const firstState = !state;
	state = next;
	// the round picker shows the overlay's round unless someone is choosing
	if (firstState || ($("#roundApply").hidden && document.activeElement !== round)) round.value = next.round;
	renderRound();
	if (import.meta.env.DEV) $("#simBlock").hidden = next.live;
	// a map that left the pool can't stay selected
	if (selected && !next.pool.some((m) => m.id === selected)) selected = null;
	renderAll();
});

// spelled out so the build drops OBS from the remote panel altogether
if (import.meta.env.MODE !== "remote") import("./local").then(({ startLocal }) => startLocal(link, send, () => state, renderAll));

renderAll();
