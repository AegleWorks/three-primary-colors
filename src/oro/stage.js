import { ROUNDS } from "../config/rounds";
// Shared runtime for the overlay proposals.
// Scales a fixed 1920x1080 stage to the window, switches scenes with the
// keyboard and simulates a live 1v1 map so every direction reacts to the same
// game events instead of hover or scroll.

// Rempalago 3 is single elimination; the pool sets best-of and bans
// (Pool #1 Ro64/Ro32 BO9 1 ban, Pool #2 Ro16/QF BO11 2 bans, Pool #3 SF/F
// BO13 2 bans). The semifinal losers play for third place on the final's
// pool, and the staff showmatch is an exhibition with no bans. `the` is the
// round's name with its article, for copy like "avanza a los cuartos de
// final"; `next` is the round the winner moves on to, `title` what a
// terminal round crowns. Preview another round with ?round=KEY.
export { ROUNDS };
// Live (the default) reads the match from tosu; ?sim runs the scripted
// demo match the proposal was designed against. The demo exists only in
// development: everything behind `import.meta.env.DEV && !LIVE` is constant
// false in a production build, so the bundler drops it.
export const LIVE = !(import.meta.env.DEV && new URLSearchParams(location.search).has("sim"));
const SIM = import.meta.env.DEV && !LIVE;
const roundParam = new URLSearchParams(location.search).get("round");
const roundKey = ROUNDS[roundParam] ? roundParam : "f";
export const ROUND = {
	key: roundKey,
	...ROUNDS[roundKey],
	firstTo: Math.ceil(ROUNDS[roundKey].bestOf / 2),
	next: ROUNDS[ROUNDS[roundKey].next] || null,
	// a round with nothing after it crowns its winner instead of advancing them
	isFinal: !ROUNDS[roundKey].next,
	isTitle: roundKey === "f",
};

export const MATCH = {
	round: ROUND.name,
	bestOf: ROUND.bestOf,
	firstTo: ROUND.firstTo,
	stars: SIM ? { l: 3, r: 2 } : { l: 0, r: 0 },
	players: {
		l: { name: "Clippy", rank: 39, seed: 1, country: "Colombia" },
		r: { name: "Sombrax79", rank: 112, seed: 4, country: "Colombia" },
	},
	casters: ["hxovc", "Kuervo"],
};

export const POOL = !import.meta.env.DEV ? [] : [
	{ id: "NM1", artist: "xi", title: "FREEDOM DiVE", mapper: "Nakagawa-Kanon", sr: 7.12, bpm: 222, len: "4:18" },
	{ id: "NM2", artist: "Camellia", title: "Galaxy Collapse", mapper: "DoKito", sr: 6.84, bpm: 198, len: "5:38" },
	{ id: "NM3", artist: "Feryquitous", title: "Quon", mapper: "Ryuusei Aika", sr: 6.51, bpm: 180, len: "2:47" },
	{ id: "NM4", artist: "Sakuzyo", title: "Altale", mapper: "Mazzerin", sr: 6.33, bpm: 141, len: "3:30" },
	{ id: "NM5", artist: "LeaF", title: "Aleph-0", mapper: "Asphyxia", sr: 6.70, bpm: 250, len: "2:13" },
	{ id: "HD1", artist: "xi", title: "Blue Zenith", mapper: "Asphyxia", sr: 6.92, bpm: 200, len: "2:59" },
	{ id: "HD2", artist: "DragonForce", title: "Through the Fire", mapper: "ztrot", sr: 6.40, bpm: 200, len: "7:21" },
	{ id: "HD3", artist: "Getty", title: "Hikari", mapper: "Monstrata", sr: 6.12, bpm: 175, len: "3:05" },
	{ id: "HR1", artist: "The Quick Brown Fox", title: "The Big Black", mapper: "Blue Dragon", sr: 6.58, bpm: 360, len: "2:18" },
	{ id: "HR2", artist: "Halozy", title: "Genryuu Kaiko", mapper: "Hollow Wings", sr: 6.27, bpm: 180, len: "4:02" },
	{ id: "HR3", artist: "MAX", title: "Love Me Like You Do", mapper: "Sotarks", sr: 6.05, bpm: 150, len: "3:12" },
	{ id: "DT1", artist: "Kurokotei", title: "Galaxy Burst", mapper: "Doomsday", sr: 7.40, bpm: 240, len: "2:41" },
	{ id: "DT2", artist: "nekodex", title: "Grand Dad", mapper: "Okoratu", sr: 7.02, bpm: 195, len: "2:34" },
	{ id: "DT3", artist: "t+pazolite", title: "Oshama Scramble", mapper: "Fycho", sr: 6.88, bpm: 190, len: "2:05" },
	{ id: "FM1", artist: "ARForest", title: "Ignis Danse", mapper: "Shiirn", sr: 6.20, bpm: 186, len: "2:59" },
	{ id: "FM2", artist: "Silentroom", title: "Nhelv", mapper: "Asphyxia", sr: 6.45, bpm: 200, len: "4:11" },
	{ id: "FM3", artist: "Laur", title: "Sound Chimera", mapper: "Kroytz", sr: 6.66, bpm: 230, len: "3:01" },
	{ id: "FM4", artist: "Camellia", title: "Exit This Earth's Atomosphere", mapper: "ProfessionalBox", sr: 6.30, bpm: 156, len: "4:47" },
	{ id: "TB", artist: "Camellia", title: "Ghost", mapper: "Nathan", sr: 7.55, bpm: 220, len: "5:12" },
];

// Match history: who banned or picked what, and who took each picked map.
// Bans are listed in ban order; a one-ban pool keeps each player's first.
const BANS = [["NM2", "l"], ["HR3", "r"], ["FM4", "l"], ["DT3", "r"]].slice(0, ROUND.bans * 2);
export const DRAFT = !SIM ? { bans: {}, picks: [], current: null } : {
	bans: Object.fromEntries(BANS),
	picks: [
		{ id: "NM1", by: "l", won: "l" },
		{ id: "HD2", by: "r", won: "r" },
		{ id: "DT1", by: "l", won: "l" },
		{ id: "FM3", by: "r", won: "r" },
		{ id: "HR1", by: "l", won: "l" },
		{ id: "DT2", by: "r", won: null },
	],
	current: "DT2",
};

export const CHAT = !SIM ? [] : [
	{ who: "BanchoBot", side: "bot", msg: "Sombrax79 eligió DT2." },
	{ who: "Clippy", side: "l", msg: "gl" },
	{ who: "Sombrax79", side: "r", msg: "gl hf" },
	{ who: "BanchoBot", side: "bot", msg: "Todos listos. Arranca el mapa." },
];

export const mapById = (id) => POOL.find((m) => m.id === id);
export const modOf = (id) => id.replace(/\d+$/, "");
export const fmt = (n) => Math.round(n).toLocaleString("en-US");
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const SCENES = ["intro", "mappool", "gameplay", "result", "champion"];
// A direction can add scenes of its own: boot({ scenes, labels }).
let scenes = SCENES;
const LABELS = { intro: "Intro", mappool: "Mappool", gameplay: "Gameplay", result: "Resultado", champion: "Campeón" };
const LENGTH = 154;

const state = {
	t: 0,
	length: SIM ? LENGTH : 0,
	score: { l: 0, r: 0 },
	combo: { l: 0, r: 0 },
	// fractional notes carried between frames, so combo grows at any frame rate
	carry: { l: 0, r: 0 },
	maxCombo: { l: 0, r: 0 },
	acc: { l: 100, r: 100 },
	miss: { l: 0, r: 0 },
	n300: { l: 0, r: 0 },
	n100: { l: 0, r: 0 },
	n50: { l: 0, r: 0 },
	hits: { l: 0, r: 0 },
	ghost: { l: null, r: null },
	paused: false,
};

const tickHandlers = [];
const eventHandlers = [];

export const onTick = (fn) => tickHandlers.push(fn);
export const onEvent = (fn) => eventHandlers.push(fn);
const emit = (type, side) => eventHandlers.forEach((fn) => fn(type, side, state));

export function trigger(type, side) {
	if (type === "break") {
		if (state.combo[side] > 30) emit("break", side);
		state.combo[side] = 0;
		state.miss[side] += 1;
		state.acc[side] = accuracy(side);
	}
	// Bancho desync: the client reports a miss that never happened, then a
	// second later the combo and the miss count snap back. The overlay only
	// sees the numbers, exactly as it would from tosu.
	if (type === "ghost" && !state.ghost[side]) {
		const saved = { combo: state.combo[side], miss: state.miss[side] };
		if (saved.combo > 30) emit("break", side);
		state.ghost[side] = saved;
		state.combo[side] = 0;
		state.miss[side] += 1;
		state.acc[side] = accuracy(side);
		setTimeout(() => {
			if (state.ghost[side] !== saved) return;
			state.combo[side] += saved.combo;
			state.miss[side] = saved.miss;
			state.acc[side] = accuracy(side);
			state.ghost[side] = null;
		}, 1100);
	}
}

// osu! standard accuracy from the judgement counts.
function accuracy(side) {
	const total = state.n300[side] + state.n100[side] + state.n50[side] + state.miss[side];
	if (!total) return 100;
	return ((300 * state.n300[side] + 100 * state.n100[side] + 50 * state.n50[side]) / (300 * total)) * 100;
}

// A direction can steer the simulated match (a scripted tiebreaker, say):
// the director returns each player's skill for the current state.
let director = null;
export const setDirector = (fn) => (director = fn);
// Demo fast-forward.
let speed = 1;
export const setSpeed = (v) => (speed = v);
export const getSpeed = () => speed;
export const restart = () => reset();

function reset() {
	state.t = 0;
	for (const s of ["l", "r"]) {
		state.score[s] = 0;
		state.combo[s] = 0;
		state.carry[s] = 0;
		state.maxCombo[s] = 0;
		state.acc[s] = 100;
		state.miss[s] = 0;
		state.n300[s] = 0;
		state.n100[s] = 0;
		state.n50[s] = 0;
		state.hits[s] = 0;
		state.ghost[s] = null;
	}
	emit("start");
}

// Live data: a source fills the state each frame in place of the simulation.
let source = null;
export const setSource = (fn) => (source = fn);

// One player's numbers from the live source. A combo that falls while the
// miss count rises is a break; listeners hear it while the state still
// shows the combo that was lost, as they do in the simulation.
export function ingest(side, v) {
	if (v.miss > state.miss[side] && v.combo < state.combo[side] && state.combo[side] > 30) emit("break", side);
	state.score[side] = v.score;
	state.combo[side] = v.combo;
	state.maxCombo[side] = v.maxCombo;
	state.acc[side] = v.acc;
	state.miss[side] = v.miss;
	state.n100[side] = v.n100;
	state.n50[side] = v.n50;
}

// The map clock, in seconds. Time running backwards is a new map; crossing
// the map's length is its end.
export function clock(t, length) {
	if (t < state.t - 2) emit("start");
	const ended = length > 0 && state.t < state.length && t >= length;
	state.t = t;
	state.length = length || state.length;
	if (ended) emit("end", state.score.l >= state.score.r ? "l" : "r");
}

function step(dt) {
	if (source) return source(state);
	if (!SIM || state.paused) return;
	state.t += dt;
	if (state.t >= state.length) {
		emit("end", state.score.l >= state.score.r ? "l" : "r");
		reset();
		return;
	}
	// Right player is slightly stronger at the start, left catches up late.
	const skill = director ? director(state) : { l: 0.97 + Math.min(state.t / state.length, 1) * 0.06, r: 1.0 };
	for (const s of ["l", "r"]) {
		const notes = 6 * dt * (0.8 + Math.random() * 0.4);
		state.hits[s] += notes;
		state.carry[s] += notes;
		const whole = Math.floor(state.carry[s]);
		state.carry[s] -= whole;
		state.combo[s] += whole;
		// judge each whole note: mostly 300s, the odd 100 and the rare 50
		for (let i = 0; i < whole; i++) {
			const r = Math.random();
			if (r < 0.0025) state.n50[s] += 1;
			else if (r < 0.017) state.n100[s] += 1;
			else state.n300[s] += 1;
		}
		state.maxCombo[s] = Math.max(state.maxCombo[s], state.combo[s]);
		state.score[s] += notes * 300 * (1 + state.combo[s] / 25) * skill[s] * 0.62;
		state.acc[s] = accuracy(s);
		// about one break per 40s per player, independent of frame rate
		if (Math.random() < dt * 0.025) trigger("break", s);
	}
}

function fitStage() {
	const stage = document.querySelector(".stage");
	if (!stage) return;
	const scale = Math.min(window.innerWidth / 1920, (window.innerHeight - 44) / 1080);
	stage.style.setProperty("--fit", String(scale));
}

export function setScene(name) {
	document.querySelectorAll("[data-scene]").forEach((el) => {
		el.toggleAttribute("data-active", el.dataset.scene === name);
	});
	document.querySelectorAll("[data-goto]").forEach((el) => {
		el.setAttribute("aria-current", String(el.dataset.goto === name));
	});
	document.body.dataset.scene = name;
	try {
		localStorage.setItem(`scene:${location.pathname}`, name);
	} catch {}
	emit("scene", name);
}

// Optional scene transition. A direction registers fn(swap) and calls swap()
// once the outgoing scene is covered; without one, scenes cut instantly.
let transition = null;
let transitioning = false;
export const setTransition = (fn) => (transition = fn);

export async function goTo(name) {
	if (transitioning || document.body.dataset.scene === name) return;
	if (!transition || document.documentElement.classList.contains("shot")) return setScene(name);
	transitioning = true;
	try {
		await transition(() => setScene(name), name);
	} finally {
		transitioning = false;
	}
}

function buildSwitcher(extraHint, labels) {
	const bar = document.createElement("nav");
	bar.className = "switcher";
	bar.setAttribute("aria-label", "Escenas");
	scenes.forEach((s, i) => {
		const b = document.createElement("button");
		b.type = "button";
		b.dataset.goto = s;
		b.innerHTML = `<kbd>${i + 1}</kbd>${labels[s]}`;
		b.addEventListener("click", () => goTo(s));
		bar.append(b);
	});
	const hint = document.createElement("span");
	hint.className = "switcher-hint";
	hint.innerHTML = "<kbd>Z</kbd><kbd>X</kbd> romper combo · <kbd>Espacio</kbd> pausa";
	if (extraHint) hint.insertAdjacentHTML("afterbegin", `${extraHint} · `);
	// Round preview: reloads with ?round=KEY, keeping the current scene.
	const round = document.createElement("select");
	round.className = "switcher-round";
	round.setAttribute("aria-label", "Ronda");
	for (const [key, r] of Object.entries(ROUNDS)) round.add(new Option(`${r.name} · BO${r.bestOf}`, key, false, key === ROUND.key));
	round.addEventListener("change", () => {
		const url = new URL(location.href);
		url.searchParams.set("round", round.value);
		url.searchParams.set("scene", document.body.dataset.scene);
		location.href = url;
	});
	bar.append(round, hint);
	document.body.append(bar);
}

// The overlay as a browser source has no switcher: a separate control panel
// drives it (switcher: false).
export function boot(initial = "gameplay", { hint, scenes: own, labels, switcher = true } = {}) {
	if (import.meta.env.DEV && new URLSearchParams(location.search).has("shot")) document.documentElement.classList.add("shot");
	if (own) scenes = own;
	if (switcher) buildSwitcher(hint, { ...LABELS, ...labels });
	fitStage();
	window.addEventListener("resize", fitStage);
	window.addEventListener("keydown", (e) => {
		if (e.target.closest?.("input, textarea")) return;
		const n = Number(e.key);
		if (n >= 1 && n <= scenes.length) goTo(scenes[n - 1]);
		if (!SIM) return;
		if (e.key.toLowerCase() === "z") trigger("break", "l");
		if (e.key.toLowerCase() === "x") trigger("break", "r");
		if (e.key === " ") {
			state.paused = !state.paused;
			e.preventDefault();
		}
	});
	let saved = null;
	try {
		saved = localStorage.getItem(`scene:${location.pathname}`);
	} catch {}
	const query = new URLSearchParams(location.search).get("scene");
	setScene(query || (scenes.includes(saved) ? saved : initial));
	// Screenshots pass ?t=SECONDS to land mid-map with numbers on screen.
	if (SIM) {
		const seek = Number(new URLSearchParams(location.search).get("t") || 0);
		for (let i = 0; i < seek * 10; i++) step(0.1);
	}
	let last = performance.now();
	const loop = (now) => {
		const dt = Math.min((now - last) / 1000, 0.1);
		last = now;
		step(dt * speed);
		tickHandlers.forEach((fn) => fn(state));
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
	// ?go=SCENE plays the transition into SCENE shortly after load (for review).
	const go = import.meta.env.DEV && new URLSearchParams(location.search).get("go");
	if (scenes.includes(go)) setTimeout(() => goTo(go), 200);
}
