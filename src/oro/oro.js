import { boot, onTick, onEvent, goTo, setTransition, trigger, setDirector, setSpeed, getSpeed, restart as restartMatch, LIVE, MATCH, ROUND, DRAFT, CHAT, modOf, fmt, fmtTime } from "./stage.js";

// Real beatmapsets so the mock carries real cover art. In the live overlay the
// art comes from tosu (/files/beatmap/background) instead of assets.ppy.sh.
// The scripted demo (?sim) exists only in development; in a production build
// `SIM` is constant false and everything behind it is dropped.
const SIM = import.meta.env.DEV && !LIVE;
const POOL = !SIM ? [] : [
	{ id: "NM1", set: 21936, artist: "xi", title: "FREEDOM DiVE", mapper: "Felistas", diff: "FOUR DIMENSIONS", sr: 7.12, bpm: 222, ar: 9.6, od: 9, cs: 4, len: "4:18" },
	{ id: "NM2", set: 2572601, artist: "Kurokotei", title: "Galaxy Collapse", mapper: "SISKAN", diff: "Cataclysmic Hypernova", sr: 6.84, bpm: 269, ar: 9.8, od: 9, cs: 4, len: "5:38" },
	{ id: "NM3", set: 738828, artist: "Feryquitous", title: "Quon", mapper: "Fia-Desu", diff: "Extreme", sr: 6.51, bpm: 180, ar: 9.4, od: 8.8, cs: 4, len: "2:47" },
	{ id: "NM4", set: 587295, artist: "LeaF", title: "Aleph-0", mapper: "katacheh", diff: "Infinity", sr: 6.7, bpm: 250, ar: 9.5, od: 9, cs: 4, len: "2:13" },
	{ id: "NM5", set: 557118, artist: "Yui Hanasaka", title: "Harumachi Clover", mapper: "Rizia", diff: "Swing", sr: 6.12, bpm: 140, ar: 9.3, od: 8.5, cs: 4.2, len: "1:58" },
	{ id: "HD1", set: 86022, artist: "xi", title: "Blue Zenith", mapper: "Foxxer", diff: "Zenith", sr: 6.92, bpm: 200, ar: 9.4, od: 8.7, cs: 4, len: "2:59" },
	{ id: "HD2", set: 21797, artist: "DragonForce", title: "Through The Fire And Flames", mapper: "fwmaker", diff: "Legend", sr: 6.4, bpm: 200, ar: 9, od: 8, cs: 4, len: "7:21" },
	{ id: "HD3", set: 1738131, artist: "BiSH", title: "PAiNT it BLACK", mapper: "Seabird", diff: "Stream Practice", sr: 6.05, bpm: 186, ar: 9.2, od: 8.6, cs: 4, len: "3:05" },
	{ id: "HR1", set: 84386, artist: "The Quick Brown Fox", title: "The Big Black", mapper: "Blue Dragon", diff: "WHO'S AFRAID OF THE BIG BLACK", sr: 6.58, bpm: 360.3, ar: 10, od: 9.8, cs: 5.2, len: "2:18" },
	{ id: "HR2", set: 218712, artist: "Halozy", title: "Genryuu Kaiko", mapper: "samplefish", diff: "Higan Torrent", sr: 6.27, bpm: 180, ar: 10, od: 10, cs: 5.2, len: "4:02" },
	{ id: "HR3", set: 2598214, artist: "Okazaki Taiiku", title: "Kimi no Bouken", mapper: "goodgain4", diff: "Odyssey", sr: 6.05, bpm: 210, ar: 10, od: 10, cs: 5.2, len: "1:32" },
	{ id: "DT1", set: 847043, artist: "Camellia", title: "GALAXY BURST", mapper: "un-plugged", diff: "Supernova", sr: 7.4, bpm: 240, ar: 10.3, od: 10.1, cs: 4, len: "1:47" },
	{ id: "DT2", set: 616902, artist: "Imperial Circus Dead Decadence", title: "Shinbatsu o Tadori Kyoukotsu ni Itaru", mapper: "Vulkin", diff: "Shoukan", sr: 7.02, bpm: 292, ar: 10.3, od: 10.1, cs: 4, len: "1:43" },
	{ id: "DT3", set: 329354, artist: "t+pazolite", title: "Oshama Scramble!", mapper: "R i n g o", diff: "Scramble", sr: 6.88, bpm: 285, ar: 10.3, od: 10, cs: 4, len: "1:23" },
	{ id: "FM1", set: 1095104, artist: "Bliizit", title: "Team Magma & Aqua Leader Battle Theme", mapper: "Tyler osu", diff: "Primal", sr: 6.2, bpm: 186, ar: 9.5, od: 9, cs: 4, len: "2:59" },
	{ id: "FM2", set: 839503, artist: "Silentroom", title: "Nhelv", mapper: "Nick Wilde", diff: "Extra", sr: 6.45, bpm: 200, ar: 9.5, od: 9, cs: 4, len: "4:11" },
	{ id: "FM3", set: 2528614, artist: "Laur", title: "Sound Chimera", mapper: "ytGrapeFrootZ34", diff: "Chimera", sr: 6.66, bpm: 230, ar: 9.6, od: 9, cs: 4, len: "3:01" },
	{ id: "FM4", set: 550213, artist: "sakuzyo", title: "After Altale", mapper: "milr_", diff: "Insane", sr: 6.3, bpm: 156, ar: 9.4, od: 8.5, cs: 4, len: "4:47" },
	{ id: "TB", set: 532822, artist: "Camellia", title: "GHOST", mapper: "Scarsnic", diff: "Spectre", sr: 7.55, bpm: 220, ar: 9.8, od: 9.2, cs: 4, len: "5:12" },
];

// Live, the pool comes from data.json (setPool) and the map in play from tosu.
const BLANK = { id: "", set: 0, art: "none", artist: "", title: "", mapper: "", diff: "", sr: 0, bpm: 0, ar: 0, od: 0, cs: 0, len: "0:00" };

// How the series ended, map by map, for the winner screen: the winner takes
// firstTo maps, the other two fewer (5-3 in BO9, 6-4 in BO11, 7-5 in BO13).
const ROAD_WINNERS = { 5: "lrlrllrl", 6: "lrlrllrrll", 7: "lrlrllrrlrll" };
const ROAD_MAPS = ["NM1", "HD2", "DT1", "FM3", "HR1", "DT2", "HR2", "FM2", "NM3", "HD1", "FM1", "NM4"];
// Live, the road is the draft's decided picks, in order.
const roadOf = () =>
	!SIM
		? [...DRAFT.picks.filter((p) => p.won).map((p) => [p.id, p.won]), ...(DRAFT.tbWon ? [["TB", DRAFT.tbWon]] : [])]
		: [...ROAD_WINNERS[MATCH.firstTo]].map((won, i) => [ROAD_MAPS[i], won]);

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
// A map's art: its set's cover, or the background tosu serves for a map
// outside the pool.
const cover = (map) => (map.art === "none" ? "none" : `url("${map.art || `https://assets.ppy.sh/beatmaps/${map.set}/covers/cover.jpg`}")`);
const owner = (s) => PEOPLE[s].name;
const byId = (id) => POOL.find((m) => m.id === id);
let current = byId(DRAFT.current) || BLANK;
const shot = import.meta.env.DEV && new URLSearchParams(location.search).has("shot");
const stage = $(".stage");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const query = new URLSearchParams(location.search);
stage.dataset.round = ROUND.key;

// Profile pictures: the osu! avatar (a.ppy.sh/ID) when the ID is known,
// otherwise a monogram in the player's colour. Every [data-pfp] slot is
// filled from here; preview real avatars with ?pfp_l=ID, ?pfp_r=ID,
// ?pfp_c0=ID and ?pfp_c1=ID (the casters).
const PEOPLE = {
	l: { name: MATCH.players.l.name },
	r: { name: MATCH.players.r.name },
	c0: { name: MATCH.casters[0] },
	c1: { name: MATCH.casters[1] },
	c2: { name: "" },
	c3: { name: "" },
};
const pfpTag = (key) => `<span class="pfp" data-pfp="${key}"></span>`;
function renderPfps(scope = document) {
	$$("[data-pfp]", scope).forEach((el) => {
		const key = el.dataset.pfp;
		const who = PEOPLE[key];
		const id = query.get(`pfp_${key}`) || who.osuId;
		const url = who.avatar || (id ? `https://a.ppy.sh/${id}` : "");
		const tag = `${who.name}|${url}`;
		if (el._pfp === tag) return;
		el._pfp = tag;
		el.dataset.side = key[0] === "c" ? "c" : key;
		el.innerHTML = `<b>${(who.name[0] || "?").toUpperCase()}</b>`;
		if (!url) return;
		const img = new Image();
		img.alt = "";
		img.decoding = "async";
		img.onload = () => el.append(img);
		img.src = url;
	});
}

// Who is who: names into every [data-name] slot, avatars into every
// [data-pfp] slot. Live data calls this whenever a player or caster changes.
function setPerson(key, { name = PEOPLE[key].name, osuId = PEOPLE[key].osuId, avatar = PEOPLE[key].avatar } = {}) {
	const was = PEOPLE[key];
	if (was.name === name && was.osuId === osuId && was.avatar === avatar) return;
	PEOPLE[key] = { ...was, name, osuId, avatar };
	$$(`[data-name="${key}"]`).forEach((el) => (el.textContent = name));
	$$("[data-text]").forEach((el) => (el.dataset.text = el.textContent.trim()));
	renderPfps();
	window.fitAll?.();
}

// Torus has proportional digits only, so live numbers are drawn into
// fixed-width cells; otherwise a rolling score shimmies sideways.
function setNum(el, text) {
	if (el._text === text) return;
	el._text = text;
	if (!el._cells || el._cells.length !== text.length) {
		el.dataset.cells = "";
		el.textContent = "";
		el._cells = [...text].map(() => {
			const cell = el.appendChild(document.createElement("span"));
			cell.append("");
			return cell;
		});
	}
	// edit each cell's text node in place: replacing nodes (textContent) or
	// rewriting classes would invalidate more style than the digit itself
	[...text].forEach((ch, i) => {
		const cell = el._cells[i];
		const node = cell.firstChild;
		if (node.data === ch) return;
		node.data = ch;
		const cls = /\d/.test(ch) ? "d" : "p";
		if (cell.className !== cls) cell.className = cls;
	});
}

// Stars: four-point sparks, one per map won, like a seed card. Series pips:
// slim bars, nearest the centre first. Both are re-rendered when the
// tiebreaker sets the series to (firstTo - 1) each.
function renderSeries(stars, scope = document) {
	$$("[data-stars]", scope).forEach((el) => {
		const side = el.dataset.stars;
		el.innerHTML = "";
		for (let i = 0; i < MATCH.firstTo; i++) {
			el.insertAdjacentHTML("beforeend", `<svg class="${i < stars[side] ? "on" : ""}"><use href="#spark" /></svg>`);
		}
	});
	$$("[data-pips]", scope).forEach((el) => {
		const side = el.dataset.pips;
		const won = stars[side] + Number(el.dataset.plus || 0);
		el.innerHTML = "";
		for (let i = 0; i < MATCH.firstTo; i++) {
			const pip = document.createElement("i");
			if (i < won) pip.className = el.dataset.plus && i === won - 1 ? "on is-new" : "on";
			el.append(pip);
		}
	});
	$$(".series-n", scope).forEach((el) => {
		if (!el.closest(".result")) el.innerHTML = `${stars.l} <i>—</i> ${stars.r}`;
	});
}
renderSeries(MATCH.stars);

// Map in play: gameplay card, disc, client stand-ins and the result screen.
function showMap(map, { slot = map.id, by = DRAFT.picks.find((p) => p.id === map.id)?.by, pick } = {}) {
	for (const id of ["discArt", "mapBg", "resultBg"]) $(`#${id}`).style.backgroundImage = cover(map);
	// Stand-in for the playfield background the tournament clients would show.
	$$(".gp .client").forEach((c) => (c.style.backgroundImage = `linear-gradient(rgba(0,0,0,.6), rgba(0,0,0,.6)), ${cover(map)}`));
	$("#mapSlot").textContent = slot;
	const pickEl = $(".map-pick");
	pickEl.innerHTML = pick ?? (by ? `Pick de ${pfpTag(by)}<b>${owner(by)}</b>` : "");
	pickEl.dataset.side = pick || !by ? "" : by;
	renderPfps(pickEl);
	$("#mapLen").textContent = map.len;
	$("#mapTitle").textContent = map.title;
	$("#mapArtist").textContent = `${map.artist} — ${map.mapper}`;
	$("#mapDiff").textContent = map.diff ? `[${map.diff}]` : "";
	$("#resultMap").textContent = `${map.id} · ${map.title}`;
	$("#mapStats").innerHTML = [
		["SR", map.sr.toFixed(2), "sr"],
		["BPM", Math.round(map.bpm), "bpm"],
		["AR", map.ar, "ar"],
		["OD", map.od, "od"],
		["CS", map.cs, "cs"],
	]
		.map(([k, v, c]) => `<div class="stat stat--${c}"><dt>${k}</dt><dd data-count="${v}" data-fmt="dec">${v}</dd></div>`)
		.join("");
}
showMap(current);

// Mappool: one row per mod, one card per map, then the pick order. Picks wear
// the picker's colour (frame and title) and the winner's along the bottom
// edge; bans wear the banner's, darkened.
const grid = $("#poolGrid");
const order = $("#pickOrder");
function renderPool() {
	grid.innerHTML = "";
	let cardIndex = 0;
	for (const mod of [...new Set(POOL.map((m) => modOf(m.id)))]) {
		const row = document.createElement("div");
		row.className = "pool-row";
		row.innerHTML = `<span class="pool-mod mod--${mod.toLowerCase()}">${mod}</span>`;
		for (const map of POOL.filter((m) => modOf(m.id) === mod)) {
			const pick = DRAFT.picks.find((p) => p.id === map.id);
			const ban = DRAFT.bans[map.id];
			const card = document.createElement("article");
			card.className = "card";
			card.dataset.map = map.id;
			card.style.setProperty("--i", cardIndex++);
			let state = "";
			if (ban) {
				card.classList.add("is-ban", `by-${ban}`);
				state = `<span class="card-state">${pfpTag(ban)}Ban</span>`;
			} else if (pick && map.id === DRAFT.current && !pick.won) {
				card.classList.add("is-live", `by-${pick.by}`);
				state = `<span class="card-state">${pfpTag(pick.by)}En juego</span>`;
			} else if (pick?.won) {
				card.classList.add("is-pick", `by-${pick.by}`, `won-${pick.won}`);
				state = `<span class="card-state">Gana ${pfpTag(pick.won)}</span>`;
			} else if (pick) {
				card.classList.add("is-live", `by-${pick.by}`);
				state = `<span class="card-state">${pfpTag(pick.by)}Pick</span>`;
			}
			card.innerHTML = `
				<div class="card-art" style='background-image:${cover(map)}'></div>
				<div class="card-body">
					<div class="card-top"><b class="card-id">${map.id}</b>${state}</div>
					<span class="card-title">${map.title}</span>
					<span class="card-artist">${map.artist} · ${map.sr.toFixed(2)}★</span>
				</div>`;
			row.append(card);
		}
		grid.append(row);
	}
	order.innerHTML = "";
	DRAFT.picks.forEach((p, i) => {
		const li = document.createElement("li");
		li.className = `by-${p.by}${p.won ? ` won-${p.won}` : " is-live"}`;
		li.style.setProperty("--i", i);
		li.innerHTML = `<b>${String(i + 1).padStart(2, "0")}</b>${pfpTag(p.by)}${p.id}`;
		order.append(li);
	});
	// The picker is whoever did not pick last; the first pick is the left's
	// until the referee's roll is known.
	const next = DRAFT.next || (DRAFT.picks.at(-1)?.by === "l" ? "r" : "l");
	const turn = $(".pool-turn");
	turn.dataset.side = next;
	turn.innerHTML = `${pfpTag(next)}<b data-name="${next}">${owner(next)}</b> está eligiendo`;
	$("#pickTimer").dataset.side = next;
	renderPfps(grid.parentElement);
	window.fitAll?.();
}
renderPool();

// Round copy: the final crowns a champion, every other round sends the
// winner on to the next one.
// "de" + "el tercer puesto" contracts to "del tercer puesto".
const de = (the) => (the.startsWith("el ") ? `del ${the.slice(3)}` : `de ${the}`);
const prize = ROUND.isTitle ? "del título" : ROUND.isFinal ? de(ROUND.the) : de(ROUND.next.the);
$(".champ").classList.toggle("is-advance", !ROUND.isFinal);

// Series copy, the result screen's match point line and the winner screen's
// road. `stars` is the series after the last map, `last` that map's winner.
const road = $("#road");
function renderSeriesCopy(stars = MATCH.stars, last = "l") {
	const ROAD = roadOf();
	const champ = stars.l >= stars.r ? "l" : "r";
	const BIND = {
		round: ROUND.name,
		format: ROUND.exhibition ? `Exhibición · best of ${ROUND.bestOf} · sin bans` : `Best of ${ROUND.bestOf} · primero a ${ROUND.firstTo} mapas`,
		crown: ROUND.isFinal ? ROUND.title : `Avanza a ${ROUND.next.the}`,
		won: LIVE ? stars[champ] : ROAD.filter(([, w]) => w === "l").length,
		lost: LIVE ? stars[champ === "l" ? "r" : "l"] : ROAD.filter(([, w]) => w === "r").length,
	};
	$$("[data-bind]").forEach((el) => (el.textContent = BIND[el.dataset.bind]));
	const toGo = ROUND.firstTo - stars[last];
	const who = owner(last);
	$("#matchpoint").textContent =
		toGo <= 0 ? `${who} se lleva la serie` : toGo === 1 ? `Match point · ${who} está a un mapa ${prize}` : `${who} está a ${toGo} mapas ${prize}`;
	for (const el of $$("[data-name=win]")) el.textContent = owner(champ);
	for (const el of $$("[data-name=lose]")) el.textContent = owner(champ === "l" ? "r" : "l");
	$$(".champ [data-pfp]").forEach((el) => (el.dataset.pfp = champ));

	// Winner screen: the road through the series, one tile per map played.
	// The tiles narrow to fit up to a BO13; past nine they drop the map number.
	road.innerHTML = "";
	const roadGap = ROAD.length > 9 ? 10 : 12;
	road.style.setProperty("--tile", `${Math.min(178, Math.floor((1680 - roadGap * (ROAD.length - 1)) / Math.max(ROAD.length, 1)))}px`);
	road.style.gap = `${roadGap}px`;
	road.classList.toggle("is-dense", ROAD.length > 9);
	road.setAttribute("aria-label", ROUND.isTitle ? "Camino al título" : ROUND.isFinal ? "Camino a la victoria" : "Camino al pase");
	const tally = { l: 0, r: 0 };
	ROAD.forEach(([id, won], i) => {
		const map = byId(id);
		if (!map) return;
		const final = i === ROAD.length - 1;
		tally[won]++;
		const li = document.createElement("li");
		li.className = `won-${won}${final ? " is-final" : ""}`;
		li.style.setProperty("--i", i);
		li.innerHTML = `
			<div class="road-card">
				<i class="road-art" style='background-image:${cover(map)}'></i>
				<div class="road-top">
					<span class="road-n">${final ? (ROUND.isTitle ? "Mapa del título" : ROUND.isFinal ? "Mapa decisivo" : "Mapa del pase") : `Mapa ${i + 1}`}</span>
					<span class="road-tally"><b class="${won === "l" ? "is-up" : ""}">${tally.l}</b><i></i><b class="${won === "r" ? "is-up" : ""}">${tally.r}</b></span>
				</div>
				<span class="road-id mod--${modOf(id).toLowerCase()}">${id}${final ? `<svg><use href="#spark" /></svg>` : ""}</span>
				<span class="road-title">${map.title}</span>
				<span class="road-who">${owner(won)}</span>
			</div>
			<i class="road-node"></i>`;
		road.append(li);
	});
	// The champion name's extrusion layer repeats the visible text.
	$$("[data-text]").forEach((el) => (el.dataset.text = el.textContent.trim()));
	$$(".champ [data-pfp]").forEach((el) => (el._pfp = null));
	renderPfps($(".champ"));
	window.fitAll?.();
}
renderSeriesCopy(LIVE ? MATCH.stars : { l: 4, r: 2 });

// ---------- chats: the lobby (osu! multiplayer) and Twitch ----------
// Newest at the bottom; old lines are dropped once they scroll out.
const CHAT_KEEP = 24;
const feed = $("#chat");
const twitchFeeds = $$("[data-twitch]");
let lobbyClock = 6 * 60;
const keep = (el) => {
	while (el.children.length > CHAT_KEEP) el.firstElementChild.remove();
};
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function lobbyLine(who, side, msg, time) {
	const p = document.createElement("p");
	p.className = `msg msg--${side}`;
	const t = lobbyClock++;
	p.innerHTML = `<time>${time ?? `12:${String(Math.floor(t / 60) % 60).padStart(2, "0")}`}</time><b>${esc(who)}</b>${esc(msg)}`;
	feed.append(p);
	keep(feed);
}
CHAT.forEach((line) => lobbyLine(line.who, line.side, line.msg));

// Twitch stand-in. Live, this is the channel's IRC (tmi) feed.
const TWITCH = !SIM ? [] : [
	["juanchopp", "#ff7eb6", "CLIPPY NO ME FALLES"],
	["la_mona_osu", "#7ee0ff", "ese stream de la mitad fue ilegal"],
	["kuervofan22", "#ffd166", "Kuervo narrando como en el mundial"],
	["sombra_army", "#4c7dff", "VAMOS SOMBRAX"],
	["pipe_aim", "#9cff8a", "ese aim no es humano"],
	["mafe.dt", "#c39bff", "DT2 es injugable, qué pick tan duro"],
	["calilove", "#ff9f5a", "saludos desde Cali"],
	["osu_bogota", "#5af0c8", "acc de 98 en DT, qué locura"],
	["rempa_fan", "#ffb3c7", "PogChamp PogChamp"],
	["daniel_hr", "#ff6b6b", "se viene la remontada"],
	["nico_tapper", "#8ab4ff", "el combo, cuidado con el combo"],
	["vale_osu", "#f7a8ff", "KEKW ese slider"],
	["andres7k", "#ffe08a", "esto se va a tiebreaker, apuesto"],
	["medellin_clicks", "#72f2a0", "hxovc qué análisis tan bueno"],
];
let twitchIndex = 0;
// Chatters' pictures by user id, as they arrive; until then (or without one)
// the line wears the chatter's initial in their colour.
const twitchPfps = new Map();
const pfpStyle = (url) => (url ? `background-image:url('${esc(url)}')` : "");
function twitchLine([who, color, msg, userId = ""] = TWITCH[twitchIndex++ % TWITCH.length]) {
	const tint = esc(color || "#b58cff");
	for (const el of twitchFeeds) {
		const p = document.createElement("p");
		p.className = "msg msg--tw";
		const url = twitchPfps.get(userId);
		p.innerHTML = `<span class="tw-pfp${url ? " has-pic" : ""}" data-tw="${esc(userId)}" style="--tint:${tint};${pfpStyle(url)}">${esc([...who][0] || "?")}</span><b style="color:${tint}">${esc(who)}</b>${esc(msg)}`;
		el.append(p);
		keep(el);
	}
}
function twitchAvatar(userId, url) {
	if (!userId || !url) return;
	twitchPfps.set(userId, url);
	for (const el of $$(`[data-tw="${CSS.escape(userId)}"]`)) {
		el.style.backgroundImage = `url('${url}')`;
		el.classList.add("has-pic");
	}
}
// The chat heads name the channel being read.
function twitchChannel(name) {
	for (const el of $$("[data-twitch-channel]")) el.textContent = name ? `#${name}` : "chat en vivo";
	for (const el of twitchFeeds) el.innerHTML = "";
}
if (SIM) for (let i = 0; i < 9; i++) twitchLine();
if (SIM && !shot) (function chatter() {
	twitchLine();
	setTimeout(chatter, 900 + Math.random() * 1800);
})();

// Lobby chat while the players get ready; once the map starts it folds away
// and Twitch takes the whole box. Live this follows tosu (scores visible
// means a map is being played); the demo "starts" the map a few seconds after
// the scene opens. G toggles it.
const chats = $("#chats");
let chatTimer = 0;
const setChatMode = (mode) => (chats.dataset.mode = mode);
function lobbyThenPlay(ms = 6000) {
	clearTimeout(chatTimer);
	setChatMode("lobby");
	if (shot) return;
	chatTimer = setTimeout(() => {
		lobbyLine("BanchoBot", "bot", "The match has started!");
		setChatMode("playing");
	}, ms);
}
if (query.get("chat") === "playing") setChatMode("playing");
window.addEventListener("keydown", (e) => {
	if (e.key.toLowerCase() !== "g") return;
	clearTimeout(chatTimer);
	setChatMode(chats.dataset.mode === "lobby" ? "playing" : "lobby");
});
onEvent((type, side) => {
	if (LIVE) return;
	if (type === "scene" && side === "gameplay" && query.get("chat") !== "playing") lobbyThenPlay();
	if (type === "end" && document.body.dataset.scene === "gameplay") {
		lobbyLine("BanchoBot", "bot", "The match has finished!");
		lobbyLine(owner(side), side, "gg");
		lobbyThenPlay(8000);
	}
});

// ---------- casters: up to four seats ----------
// The masthead splits the casters around its pill, first half on the left;
// the booths on the starting scene regroup by count (CSS). When someone joins
// or leaves the call, everyone already seated glides to their new place
// (FLIP: measure, move, animate from the old spot) and the newcomer pops in.
const seatOn = [true, true, false, false];
const casterSides = { l: $(".casters-side--l"), r: $(".casters-side--r") };
let seated = seatOn.join();
let seatQueued = false;
const calm = matchMedia("(prefers-reduced-motion: reduce)");
function seatCasters() {
	seatQueued = false;
	if (seatOn.join() === seated) return;
	seated = seatOn.join();
	const seats = $$(".casters [data-caster], .start-casters [data-caster], .show-casters [data-caster]");
	const rect = (el) => el.getBoundingClientRect();
	const before = new Map(seats.filter((el) => !el.hidden).map((el) => [el, rect(el)]));
	const shown = [0, 1, 2, 3].filter((i) => seatOn[i]);
	const left = Math.ceil(shown.length / 2);
	shown.forEach((i, n) => casterSides[n < left ? "l" : "r"].append($(`.casters [data-caster="${i}"]`)));
	for (const el of seats) el.hidden = !seatOn[Number(el.dataset.caster)];
	for (const box of [$(".casters"), $(".start-casters"), $(".show-casters")]) box.dataset.count = shown.length;
	if (shot || calm.matches) return;
	// rects are in screen px; the stage may be scaled (preview), transforms are not
	const k = stage.getBoundingClientRect().width / 1920 || 1;
	for (const el of seats) {
		if (el.hidden) continue;
		const now = rect(el);
		if (!now.width) continue; // in a hidden scene: nothing to see move
		const was = before.get(el);
		if (!was?.width) {
			el.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }], { duration: 460, delay: 120, easing: "cubic-bezier(0.3, 1.5, 0.5, 1)", fill: "backwards" });
			continue;
		}
		const dx = (was.left - now.left) / k;
		const dy = (was.top - now.top) / k;
		const sx = was.width / now.width;
		const sy = was.height / now.height;
		if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01) continue;
		el.animate([{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: "0 0", transform: "none" }], { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
	}
}
// Several seats change in one roster update; lay them out once.
function showCaster(i, on) {
	seatOn[i] = on;
	if (!seatQueued) {
		seatQueued = true;
		queueMicrotask(seatCasters);
	}
}

// ---------- casters: voice activity ----------
// Stand-in for Discord's speaking events: each caster talks in bursts.
function setTalking(i, on) {
	$$(`[data-caster="${i}"]`).forEach((el) => el.classList.toggle("is-talking", on));
}
if (SIM) setTalking(0, true);
if (SIM && !shot) [0, 1].forEach((i) => {
	let on = i === 0;
	const flipTalk = () => {
		on = !on;
		setTalking(i, on);
		setTimeout(flipTalk, on ? 1400 + Math.random() * 3600 : 900 + Math.random() * 3000);
	};
	setTimeout(flipTalk, 1500 + i * 1700);
});

// ---------- pick timer ----------
// The time a player has to pick. Manual: set the length in the bar below
// (or ?timer=SECONDS) and press R or Iniciar. When the referee runs
// "!mp timer N" in the lobby, the timer starts on its own and then follows
// BanchoBot's "Countdown ends in ..." lines, so it never drifts from the
// lobby. window.bancho(line) feeds it a raw IRC line.
const pickTimer = (() => {
	const el = $("#pickTimer");
	const num = $("#pickTimerN");
	const bar = $("#pickTimerFill");
	const src = $("#pickTimerSrc");
	let total = Number(query.get("timer")) || 120;
	let endAt = 0;
	let raf = 0;
	const show = (sec) => setNum(num, fmtTime(Math.max(0, Math.ceil(sec))));
	show(total);
	const frame = (now) => {
		const left = (endAt - now) / 1000;
		show(left);
		bar.style.transform = `scaleX(${Math.min(Math.max(left / total, 0), 1)})`;
		const state = left <= 0 ? "done" : left <= 10 ? "urgent" : "run";
		if (el.dataset.state !== state) el.dataset.state = state;
		if (left > 0) raf = requestAnimationFrame(frame);
		else src.textContent = "Se acabó el tiempo";
	};
	function start(sec = total, source = "Timer manual") {
		total = sec;
		endAt = performance.now() + sec * 1000;
		src.textContent = source;
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(frame);
	}
	// BanchoBot's countdown is the source of truth: re-anchor to it.
	function sync(sec) {
		if (el.dataset.state === "idle" || el.dataset.state === "done") return start(sec, "BanchoBot");
		endAt = performance.now() + sec * 1000;
	}
	function stop() {
		cancelAnimationFrame(raf);
		el.dataset.state = "idle";
		src.textContent = "Timer detenido";
		bar.style.transform = "";
		show(total);
	}
	function bancho(line) {
		let m;
		if ((m = line.match(/^!mp timer(?:\s+(\d+))?\s*$/i))) return start(Number(m[1] || 30), `!mp timer ${m[1] || 30}`);
		if (/^!mp aborttimer/i.test(line) || /countdown aborted/i.test(line)) return stop();
		if ((m = line.match(/countdown ends in (?:(\d+) minutes?)?(?:\s*and\s*)?(?:(\d+) seconds?)?/i)) && (m[1] || m[2]))
			return sync(Number(m[1] || 0) * 60 + Number(m[2] || 0));
		if (/countdown finished/i.test(line)) endAt = performance.now();
	}
	return {
		start,
		stop,
		bancho,
		get total() {
			return total;
		},
		set total(v) {
			total = v;
			if (el.dataset.state === "idle") show(v);
		},
	};
})();
// One IRC line from the lobby: shown in the lobby chat and read by the timer.
function ircLine(who, side, msg) {
	lobbyLine(who, side, msg);
	pickTimer.bancho(msg);
}
window.bancho = (line) => ircLine("BanchoBot", "bot", line);
// The referee starts the clock the way they would in the lobby.
function refTimer(sec = pickTimer.total) {
	ircLine("Referee", "ref", `!mp timer ${sec}`);
	const m = Math.floor(sec / 60);
	const r = sec % 60;
	const parts = [m && `${m} minute${m > 1 ? "s" : ""}`, r && `${r} second${r > 1 ? "s" : ""}`].filter(Boolean).join(" and ");
	setTimeout(() => window.bancho(`Countdown ends in ${parts}`), 400);
}
window.addEventListener("keydown", (e) => {
	if (e.key.toLowerCase() === "r") refTimer();
	if (e.key.toLowerCase() === "e") pickTimer.stop();
});

// ---------- scene stinger: the bolt ----------
// Bolt silhouette measured from the reference art (1000px canvas, offset to
// its bounding box: 395 x 689). The facet line splits it into two tones.
const BOLT = [[212, 0], [395, 0], [270, 256], [355, 256], [0, 689], [122, 382], [24, 382]];
const FACET = [[365, 63], [270, 256], [355, 256], [0, 689], [122, 382], [68, 382]];
const TIP = 4; // index of the bottom point in BOLT
// Zoom pivot: on the facet line, ~75px from the nearest edge, so at 18x the
// screen sits fully inside the bolt with the two-tone cut across it.
const CORE = [195, 246];
const AXIS = [0.5, -0.866]; // bolt points down-left; it travels along this axis
const STINGER_MS = 3200;
// Beats in ms; the covered hold (920-2420) is long enough to read the title
// card. CSS keyframes in oro.css use the same times as percentages of 3.2s.
const BEAT_MS = { charge: 200, impact: 440, recoil: 540, zoom: 680, crackleEnd: 720, covered: 920, swap: 1000, release: 2420, shoot: 2900 };
const BEAT = Object.fromEntries(Object.entries(BEAT_MS).map(([k, ms]) => [k, ms / STINGER_MS]));
// [offset, scale, travel along axis (px, + = up-right), easing into next]
// The screen stays fully covered at 18x for any travel in [+2200, -4400].
const BOLT_KEYS = [
	[0, 0.9, 2300, "linear"], // charging, off-screen
	[BEAT.charge, 0.9, 2300, "cubic-bezier(0.55, 0, 1, 0.45)"], // strike: accelerates into impact
	[BEAT.impact, 1, 0, "cubic-bezier(0.2, 0.8, 0.3, 1)"],
	[BEAT.recoil, 1.12, 0, "ease-in-out"], // recoil pop
	[BEAT.zoom, 1.04, 0, "cubic-bezier(0.7, 0, 0.9, 0.4)"],
	[BEAT.covered, 18, 0, "linear"], // covered; drift so the two-tone cut keeps moving
	[BEAT.release, 18, -1700, "cubic-bezier(0.3, 0.6, 0.3, 1)"], // shrink: reveal around the whole silhouette
	[BEAT.shoot, 1.1, 0, "cubic-bezier(0.6, 0, 0.9, 0.5)"], // then shoot off down-left
	[1, 0.6, -2600, "linear"],
];

// CSS easing strings evaluated in JS, so the canvas can follow the bolt.
function easing(spec) {
	if (spec === "linear") return (t) => t;
	if (spec === "ease-in-out") spec = "cubic-bezier(0.42, 0, 0.58, 1)";
	const [x1, y1, x2, y2] = spec.match(/[\d.]+/g).map(Number);
	const bz = (u, a, b) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
	return (t) => {
		let lo = 0;
		let hi = 1;
		let u = t;
		for (let i = 0; i < 24; i++) {
			const x = bz(u, x1, x2);
			if (Math.abs(x - t) < 1e-5) break;
			if (x < t) lo = u;
			else hi = u;
			u = (lo + hi) / 2;
		}
		return bz(u, y1, y2);
	};
}
const KEY_EASE = BOLT_KEYS.map((k) => easing(k[3]));
function boltAt(p) {
	p = Math.min(Math.max(p, 0), 1);
	let i = 0;
	while (i < BOLT_KEYS.length - 2 && p >= BOLT_KEYS[i + 1][0]) i++;
	const [o0, s0, t0] = BOLT_KEYS[i];
	const [o1, s1, t1] = BOLT_KEYS[i + 1];
	const e = KEY_EASE[i]((p - o0) / (o1 - o0));
	return { scale: s0 + (s1 - s0) * e, travel: t0 + (t1 - t0) * e };
}
const boltPoints = (pts, scale, travel, nudge = [0, 0]) =>
	pts.map(([x, y]) => [
		960 + (x - CORE[0]) * scale + AXIS[0] * travel + nudge[0],
		540 + (y - CORE[1]) * scale + AXIS[1] * travel + nudge[1],
	]);
const boltPolygon = (pts, scale, travel, nudge) =>
	`polygon(${boltPoints(pts, scale, travel, nudge)
		.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`)
		.join(", ")})`;
const boltFrames = (pts, nudge) =>
	BOLT_KEYS.map(([offset, scale, travel, ease]) => ({ offset, easing: ease, clipPath: boltPolygon(pts, scale, travel, nudge) }));
const BOLT_LAYERS = [
	// echoes run late: they trail the strike and halo the shrink
	...$$(".bolt--ghost").map((el, i) => [el, BOLT, [0, 0], [130, 85, 45][i]]),
	[$(".bolt--rim"), BOLT, [7, -7], 0], // offset copy behind: a hot bevel on the leading edges
	[$(".bolt--fill"), BOLT, [0, 0], 0],
	[$(".bolt--facet"), FACET, [0, 0], 0],
].map(([el, pts, nudge, delay]) => ({ el, frames: boltFrames(pts, nudge), delay }));

// ---------- bolt FX: speed lines, electric arcs, sparks ----------
const boltFx = (() => {
	const canvas = $(".stinger-fx");
	const ctx = canvas.getContext("2d");
	const rnd = (a, b) => a + Math.random() * (b - a);
	let t0 = 0;
	let raf = 0;
	let sparks = [];
	let arcs = [];
	let arcAt = -1;
	let burst = false;
	let lines = [];
	let lastMs = 0;

	// Midpoint displacement: a jagged path from a to b.
	function jag(a, b, disp, depth, out = [a]) {
		if (depth === 0) {
			out.push(b);
			return out;
		}
		const mid = [(a[0] + b[0]) / 2 + rnd(-disp, disp), (a[1] + b[1]) / 2 + rnd(-disp, disp)];
		jag(a, mid, disp / 2, depth - 1, out);
		return jag(mid, b, disp / 2, depth - 1, out);
	}
	function pointOnOutline(pts) {
		const k = Math.floor(Math.random() * pts.length);
		const [x1, y1] = pts[k];
		const [x2, y2] = pts[(k + 1) % pts.length];
		const u = Math.random();
		return [x1 + (x2 - x1) * u, y1 + (y2 - y1) * u];
	}
	function makeArcs(pts) {
		const out = [];
		for (let i = 0; i < 6; i++) {
			const a = pointOnOutline(pts);
			const ang = Math.atan2(a[1] - 540, a[0] - 960) + rnd(-0.9, 0.9);
			const len = rnd(90, 320);
			const b = [a[0] + Math.cos(ang) * len, a[1] + Math.sin(ang) * len];
			const path = jag(a, b, len * 0.35, 6);
			out.push(path);
			// a fork off the main arc
			if (Math.random() < 0.6) {
				const from = path[Math.floor(path.length * rnd(0.3, 0.7))];
				const fa = ang + rnd(-1, 1);
				const fl = len * rnd(0.3, 0.6);
				out.push(jag(from, [from[0] + Math.cos(fa) * fl, from[1] + Math.sin(fa) * fl], fl * 0.35, 5));
			}
		}
		return out;
	}
	function spark(x, y, ang, speed, life, w) {
		sparks.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life, age: 0, w });
	}
	function impactBurst() {
		const pts = boltPoints(BOLT, 1, 0);
		for (let i = 0; i < 220; i++) {
			const [x, y] = pointOnOutline(pts);
			spark(x, y, Math.atan2(y - 540, x - 960) + rnd(-0.7, 0.7), rnd(350, 1500), rnd(0.35, 0.8), rnd(1, 2.8));
		}
		// a hot cone out of the tip, along the strike direction
		const [tx, ty] = pts[TIP];
		for (let i = 0; i < 60; i++) spark(tx, ty, Math.atan2(-AXIS[1], -AXIS[0]) + rnd(-0.5, 0.5), rnd(500, 1800), rnd(0.4, 0.9), rnd(1.5, 3));
	}
	function strokePath(path, width, color, blur) {
		ctx.lineWidth = width;
		ctx.strokeStyle = color;
		ctx.shadowBlur = blur;
		ctx.shadowColor = "rgba(255, 200, 110, 0.9)";
		ctx.beginPath();
		ctx.moveTo(path[0][0], path[0][1]);
		for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
		ctx.stroke();
	}
	function frame() {
		const ms = performance.now() - t0;
		const p = ms / STINGER_MS;
		// real elapsed time, so sparks keep their speed at any frame rate
		const dt = Math.min(Math.max((ms - lastMs) / 1000, 0), 1 / 20);
		lastMs = ms;
		ctx.clearRect(0, 0, 1920, 1080);
		ctx.globalCompositeOperation = "lighter";
		ctx.lineCap = "round";

		// charge: streaks converge on the strike point
		if (p < BEAT.impact) {
			const q = p / BEAT.impact;
			for (const l of lines) {
				const r = 70 + l.r0 * (1 - q * q);
				const len = l.len * (1 - q * 0.6);
				const c = Math.cos(l.ang);
				const s = Math.sin(l.ang);
				ctx.lineWidth = l.w;
				ctx.strokeStyle = `rgba(255, 228, 170, ${0.15 + 0.65 * q})`;
				ctx.shadowBlur = 0;
				ctx.beginPath();
				ctx.moveTo(960 + c * r, 540 + s * r);
				ctx.lineTo(960 + c * (r + len), 540 + s * (r + len));
				ctx.stroke();
			}
		}
		if (!burst && p >= BEAT.impact) {
			burst = true;
			impactBurst();
		}
		// crackle: arcs jump off the bolt's edges, re-rolled every ~45ms
		if (p >= BEAT.impact && p < BEAT.crackleEnd) {
			if (ms - arcAt > 45) {
				arcAt = ms;
				const { scale, travel } = boltAt(p);
				arcs = makeArcs(boltPoints(BOLT, scale, travel));
			}
			const fade = 1 - Math.max(0, (p - (BEAT.crackleEnd - 0.04)) / 0.04);
			for (const path of arcs) {
				strokePath(path, 7, `rgba(255, 196, 96, ${0.28 * fade})`, 22);
				strokePath(path, 1.6, `rgba(255, 252, 238, ${0.95 * fade})`, 0);
			}
		}
		// zoom: radial streaks rush outward as the bolt fills the screen
		if (p >= BEAT.zoom && p < BEAT.covered) {
			const q = (p - BEAT.zoom) / (BEAT.covered - BEAT.zoom);
			ctx.shadowBlur = 0;
			for (const l of lines) {
				const r = 90 + q * q * 1500 * l.k;
				const len = 120 + q * 700;
				const c = Math.cos(l.ang);
				const s = Math.sin(l.ang);
				ctx.lineWidth = l.w * 1.6;
				ctx.strokeStyle = `rgba(255, 240, 205, ${0.55 * (1 - q)})`;
				ctx.beginPath();
				ctx.moveTo(960 + c * r, 540 + s * r);
				ctx.lineTo(960 + c * (r + len), 540 + s * (r + len));
				ctx.stroke();
			}
		}
		// shoot: the tip sheds sparks as it leaves
		if (p >= BEAT.shoot && p < 1) {
			const { scale, travel } = boltAt(p);
			const [tx, ty] = boltPoints(BOLT, scale, travel)[TIP];
			for (let i = 0; i < 6; i++) spark(tx, ty, Math.atan2(-AXIS[1], -AXIS[0]) + Math.PI + rnd(-0.6, 0.6), rnd(120, 520), rnd(0.3, 0.7), rnd(1, 2.2));
		}

		// sparks: streaks with drag and gravity, white-hot to amber as they die.
		// Once gold covers the screen, impact sparks would read as scratches
		// on the title card, so they are gone by then.
		ctx.shadowBlur = 0;
		if (p >= BEAT.covered && p < BEAT.shoot) sparks = [];
		sparks = sparks.filter((s) => (s.age += dt) < s.life);
		for (const s of sparks) {
			const k = Math.pow(0.08, dt);
			s.vx *= k;
			s.vy = s.vy * k + 1100 * dt;
			s.x += s.vx * dt;
			s.y += s.vy * dt;
			const life = 1 - s.age / s.life;
			ctx.lineWidth = s.w * (0.4 + 0.6 * life);
			ctx.strokeStyle = `rgba(255, ${Math.round(170 + 85 * life)}, ${Math.round(70 + 170 * life * life)}, ${life})`;
			ctx.beginPath();
			ctx.moveTo(s.x, s.y);
			ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
			ctx.stroke();
		}

		if (ms < STINGER_MS + 700) raf = requestAnimationFrame(frame);
		else ctx.clearRect(0, 0, 1920, 1080);
	}
	return {
		start() {
			cancelAnimationFrame(raf);
			t0 = performance.now();
			lastMs = 0;
			sparks = [];
			arcs = [];
			arcAt = -1;
			burst = false;
			lines = Array.from({ length: 90 }, () => ({ ang: rnd(0, Math.PI * 2), r0: rnd(700, 1300), len: rnd(80, 300), w: rnd(0.8, 2.4), k: rnd(0.6, 1.2) }));
			raf = requestAnimationFrame(frame);
		},
	};
})();

// ---------- sound: synthesised, no audio files ----------
// Bolt: charge whoosh, thunder crack with a sub thump, zoom rush, exit sweep.
// Champion: a brass-like D major swell with bells on the slam, firework pops.
// Choke: tape stop, glass and a racing heart.
// The browser only allows audio after a gesture (a key press counts); OBS
// browser sources play it directly. M toggles it, ?mute starts muted.
const sfx = (() => {
	let ac = null;
	let muted = new URLSearchParams(location.search).has("mute");
	const ready = () => {
		ac ??= new AudioContext();
		if (ac.state === "suspended") ac.resume();
		return ac;
	};
	window.addEventListener("keydown", (e) => {
		if (e.key.toLowerCase() === "m") muted = !muted;
		ready();
	});
	function noise(a, seconds, brown = false) {
		const buf = a.createBuffer(1, Math.ceil(a.sampleRate * seconds), a.sampleRate);
		const d = buf.getChannelData(0);
		let last = 0;
		for (let i = 0; i < d.length; i++) {
			const w = Math.random() * 2 - 1;
			last = brown ? (last + 0.02 * w) / 1.02 : w;
			d[i] = brown ? last * 3.5 : w;
		}
		const src = a.createBufferSource();
		src.buffer = buf;
		return src;
	}
	function env(a, at, peak, attack, release) {
		const g = a.createGain();
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(peak, at + attack);
		g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
		return g;
	}
	function sweep(a, out, at, dur, f0, f1, peak, q = 1.4) {
		const src = noise(a, dur + 0.1);
		const bp = a.createBiquadFilter();
		bp.type = "bandpass";
		bp.Q.value = q;
		bp.frequency.setValueAtTime(f0, at);
		bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
		const g = env(a, at, peak, dur * 0.8, dur * 0.35);
		src.connect(bp).connect(g).connect(out);
		src.start(at);
	}
	function thunder(a, out, at) {
		// crack
		const crack = noise(a, 0.2);
		const hp = a.createBiquadFilter();
		hp.type = "highpass";
		hp.frequency.value = 1400;
		crack.connect(hp).connect(env(a, at, 0.9, 0.004, 0.12)).connect(out);
		crack.start(at);
		// sub thump
		const osc = a.createOscillator();
		osc.frequency.setValueAtTime(110, at);
		osc.frequency.exponentialRampToValueAtTime(36, at + 0.35);
		osc.connect(env(a, at, 0.9, 0.006, 0.45)).connect(out);
		osc.start(at);
		osc.stop(at + 0.6);
		// rumble tail
		const rumble = noise(a, 2, true);
		const lp = a.createBiquadFilter();
		lp.type = "lowpass";
		lp.frequency.value = 220;
		rumble.connect(lp).connect(env(a, at + 0.02, 0.7, 0.05, 1.6)).connect(out);
		rumble.start(at);
	}
	// A compressed output bus, or null while muted.
	function bus(level = 0.55) {
		if (muted) return null;
		const a = ready();
		const comp = a.createDynamicsCompressor();
		const out = a.createGain();
		out.gain.value = level;
		comp.connect(out).connect(a.destination);
		return { a, comp, t: a.currentTime + 0.02 };
	}
	function voice(a, out, at, freq, type, peak, attack, hold, release, detune = 0) {
		const osc = a.createOscillator();
		osc.type = type;
		osc.frequency.value = freq;
		osc.detune.value = detune;
		const g = a.createGain();
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(peak, at + attack);
		g.gain.setValueAtTime(peak, at + attack + hold);
		g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
		osc.connect(g).connect(out);
		osc.start(at);
		osc.stop(at + attack + hold + release + 0.05);
	}
	const D_MAJOR = [73.42, 146.83, 220, 293.66, 369.99, 440, 587.33];
	const D_MINOR = [73.42, 146.83, 174.61, 220, 293.66];
	const BELLS = [1174.66, 1479.98, 1760, 2349.32, 1760, 2959.96];
	return {
		// full: the final's brass swell and shimmer; otherwise strike and bells
		fanfare(full = true) {
			const b = bus(0.5);
			if (!b) return;
			const { a, comp, t } = b;
			thunder(a, comp, t);
			BELLS.forEach((f, i) => {
				const at = t + 0.12 + i * 0.075;
				voice(a, comp, at, f, "sine", 0.12, 0.004, 0.02, 1.6);
				voice(a, comp, at, f * 2.76, "sine", 0.03, 0.002, 0, 0.5);
			});
			if (!full) return;
			// brass: detuned saws through a filter that opens as the swell grows
			const lp = a.createBiquadFilter();
			lp.type = "lowpass";
			lp.Q.value = 2;
			lp.frequency.setValueAtTime(380, t);
			lp.frequency.exponentialRampToValueAtTime(3400, t + 0.7);
			lp.frequency.exponentialRampToValueAtTime(1400, t + 3.2);
			lp.connect(comp);
			for (const f of D_MAJOR) for (const cents of [-9, 9]) voice(a, lp, t, f, "sawtooth", 0.05, 0.12, 1.1, 2.4, cents);
			sweep(a, comp, t + 0.02, 1.4, 5200, 9000, 0.1, 0.6); // shimmer
		},
		pop(pan = 0) {
			const b = bus(0.32);
			if (!b) return;
			const { a, comp, t } = b;
			const p = a.createStereoPanner();
			p.pan.value = pan;
			p.connect(comp);
			const n = noise(a, 0.3);
			const bp = a.createBiquadFilter();
			bp.type = "bandpass";
			bp.frequency.value = 900;
			n.connect(bp).connect(env(a, t, 0.5, 0.003, 0.22)).connect(p);
			n.start(t);
			// crackle tail
			for (let i = 0; i < 9; i++) {
				const at = t + 0.18 + Math.random() * 0.5;
				const c = noise(a, 0.03);
				const hp = a.createBiquadFilter();
				hp.type = "highpass";
				hp.frequency.value = 3000;
				c.connect(hp).connect(env(a, at, 0.12 + Math.random() * 0.12, 0.001, 0.025)).connect(p);
				c.start(at);
			}
		},
		// FC choke: a tape-stop drop, glass on the cut, a racing heart, then
		// silence while the monitor flatlines.
		choke(pan = 0) {
			const b = bus(0.6);
			if (!b) return;
			const { a, comp, t } = b;
			const p = a.createStereoPanner();
			p.pan.value = pan;
			p.connect(comp);
			// impact + tape stop
			const crack = noise(a, 0.25);
			const hp = a.createBiquadFilter();
			hp.type = "highpass";
			hp.frequency.value = 900;
			crack.connect(hp).connect(env(a, t, 0.7, 0.003, 0.18)).connect(p);
			crack.start(t);
			const tape = a.createOscillator();
			tape.type = "sawtooth";
			tape.frequency.setValueAtTime(240, t);
			tape.frequency.exponentialRampToValueAtTime(28, t + 0.8);
			const tlp = a.createBiquadFilter();
			tlp.type = "lowpass";
			tlp.frequency.setValueAtTime(1600, t);
			tlp.frequency.exponentialRampToValueAtTime(160, t + 0.8);
			tape.connect(tlp).connect(env(a, t, 0.32, 0.01, 0.85)).connect(p);
			tape.start(t);
			tape.stop(t + 1);
			voice(a, p, t, 55, "sine", 0.7, 0.005, 0.05, 0.6);
			// glass on the cut
			const cut = t + 0.54;
			const glass = noise(a, 0.5);
			const ghp = a.createBiquadFilter();
			ghp.type = "highpass";
			ghp.frequency.value = 2600;
			glass.connect(ghp).connect(env(a, cut, 0.5, 0.002, 0.4)).connect(p);
			glass.start(cut);
			for (let i = 0; i < 8; i++) voice(a, p, cut + Math.random() * 0.25, 2200 + Math.random() * 4800, "sine", 0.05, 0.001, 0, 0.25 + Math.random() * 0.3);
			// heart: lub-dub, faster each time
			for (const at of [0.3, 0.62, 0.86, 1.05]) {
				voice(a, p, t + at, 62, "sine", 0.55, 0.008, 0.02, 0.16);
				voice(a, p, t + at + 0.13, 52, "sine", 0.35, 0.008, 0.02, 0.14);
			}
		},
		// Tiebreaker intro: a riser into the halves' impact (0.9s), a dark
		// brass stab when the word locks (2.1s), a whoosh as they part (3.9s).
		tbIntro() {
			const b = bus(0.55);
			if (!b) return;
			const { a, comp, t } = b;
			sweep(a, comp, t, 0.9, 200, 5200, 0.35, 0.8);
			const rise = a.createOscillator();
			rise.type = "sawtooth";
			rise.frequency.setValueAtTime(55, t);
			rise.frequency.exponentialRampToValueAtTime(220, t + 0.9);
			const rlp = a.createBiquadFilter();
			rlp.type = "lowpass";
			rlp.frequency.setValueAtTime(300, t);
			rlp.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
			rise.connect(rlp).connect(env(a, t, 0.18, 0.85, 0.06)).connect(comp);
			rise.start(t);
			rise.stop(t + 1);
			thunder(a, comp, t + 0.9);
			const lock = t + 2.1;
			thunder(a, comp, lock);
			const lp = a.createBiquadFilter();
			lp.type = "lowpass";
			lp.Q.value = 3;
			lp.frequency.setValueAtTime(2600, lock);
			lp.frequency.exponentialRampToValueAtTime(400, lock + 1.4);
			lp.connect(comp);
			for (const f of D_MINOR) for (const cents of [-12, 12]) voice(a, lp, lock, f, "sawtooth", 0.06, 0.01, 0.25, 1.2, cents);
			sweep(a, comp, t + 3.9, 0.6, 3200, 300, 0.3, 0.9);
		},
		// A clash begins: two heartbeats under a low swell.
		tbClash() {
			const b = bus(0.45);
			if (!b) return;
			const { a, comp, t } = b;
			for (const at of [0, 0.42]) {
				voice(a, comp, t + at, 62, "sine", 0.6, 0.008, 0.02, 0.16);
				voice(a, comp, t + at + 0.13, 52, "sine", 0.4, 0.008, 0.02, 0.14);
			}
			const n = noise(a, 1.2, true);
			const lp = a.createBiquadFilter();
			lp.type = "lowpass";
			lp.frequency.value = 300;
			n.connect(lp).connect(env(a, t, 0.5, 0.6, 0.5)).connect(comp);
			n.start(t);
		},
		// Someone takes over: a whoosh towards their side.
		tbLead(pan = 0) {
			const b = bus(0.4);
			if (!b) return;
			const { a, comp, t } = b;
			const p = a.createStereoPanner();
			p.pan.value = pan;
			p.connect(comp);
			sweep(a, p, t, 0.4, 500, 3200, 0.35, 1.2);
			voice(a, p, t + 0.3, 70, "sine", 0.4, 0.01, 0.05, 0.4);
		},
		// The last stretch opens with a strike.
		tbFinal() {
			const b = bus(0.45);
			if (!b) return;
			const { a, comp, t } = b;
			thunder(a, comp, t);
			sweep(a, comp, t, 1.2, 4000, 600, 0.2, 0.8);
		},
		// Last ten seconds, one per second; the last three hit harder.
		tick(strong = false) {
			const b = bus(strong ? 0.5 : 0.35);
			if (!b) return;
			const { a, comp, t } = b;
			voice(a, comp, t, strong ? 110 : 150, "sine", 0.6, 0.004, 0.02, strong ? 0.35 : 0.18);
			const c = noise(a, 0.03);
			const hp = a.createBiquadFilter();
			hp.type = "highpass";
			hp.frequency.value = 2500;
			c.connect(hp).connect(env(a, t, 0.25, 0.001, 0.03)).connect(comp);
			c.start(t);
		},
		bolt() {
			const b = bus();
			if (!b) return;
			const { a, comp, t } = b;
			const T = STINGER_MS / 1000;
			sweep(a, comp, t, T * BEAT.impact, 260, 2600, 0.32); // charge
			thunder(a, comp, t + T * BEAT.impact); // strike
			sweep(a, comp, t + T * BEAT.zoom, T * (BEAT.covered - BEAT.zoom), 500, 6000, 0.42, 0.9); // zoom rush
			sweep(a, comp, t + T * BEAT.release, T * (BEAT.shoot - BEAT.release), 3200, 280, 0.28, 0.9); // shrink
			sweep(a, comp, t + T * BEAT.shoot, T * (1 - BEAT.shoot) + 0.1, 900, 4200, 0.3, 2); // shoot off
		},
	};
})();

const stinger = $("#stinger");
const boltVideo = $(".bolt-video");
const STINGER_LABEL = {
	starting: "Ya empezamos",
	intro: ROUND.name,
	showcase: "Mappool showcase",
	mappool: "Mappool",
	gameplay: LIVE ? "Gameplay" : `Mapa 6 · ${current.id}`,
	result: "Resultado del mapa",
	champion: ROUND.short || "Ganador",
};
function shake() {
	stage.classList.remove("shake");
	void stage.offsetWidth;
	stage.classList.add("shake");
	setTimeout(() => stage.classList.remove("shake"), 450);
}
setTransition(async (swap, name) => {
	$(".stinger-sub").textContent = STINGER_LABEL[name] || "Operación Tricolor";
	boltVideo.play().catch(() => {});
	stinger.classList.remove("run");
	void stinger.offsetWidth;
	stinger.classList.add("run");
	const runs = BOLT_LAYERS.map(({ el, frames, delay }) => el.animate(frames, { duration: STINGER_MS, delay, fill: "both" }));
	boltFx.start();
	sfx.bolt();
	await wait(STINGER_MS * BEAT.impact);
	shake();
	// Swap mid-cover; release the new scene's entrances as the bolt shrinks.
	await wait(STINGER_MS * (BEAT.swap - BEAT.impact));
	stage.classList.add("hold");
	swap();
	await wait(STINGER_MS * (BEAT.release - BEAT.swap));
	stage.classList.remove("hold");
	await Promise.all(runs.map((a) => a.finished));
	runs.forEach((a) => a.cancel());
	stinger.classList.remove("run");
	boltVideo.pause();
});

// ---------- count-ups ----------
const ease = (t) => 1 - Math.pow(1 - t, 4);
function countUp(el, to, { delay = 0, dur = 1100, format = "int", pre = "" } = {}) {
	const dp = (String(to).split(".")[1] || "").length;
	const f = {
		int: (v) => pre + fmt(v),
		pct: (v) => `${v.toFixed(2)}%`,
		x: (v) => `${Math.round(v)}x`,
		dec: (v) => v.toFixed(dp),
	}[format];
	if (shot) return setNum(el, f(to));
	setNum(el, f(0));
	const start = performance.now() + delay;
	const step = (now) => {
		const t = Math.min(Math.max((now - start) / dur, 0), 1);
		setNum(el, f(format === "int" || format === "x" ? Math.round(to * ease(t)) : to * ease(t)));
		if (t < 1) requestAnimationFrame(step);
	};
	requestAnimationFrame(step);
}
const countAll = (sel, base, gap, dur) =>
	$$(sel).forEach((el, i) =>
		countUp(el, Number(el.dataset.count), { delay: base + i * gap, dur, format: el.dataset.fmt || "int", pre: el.dataset.pre || "" }),
	);

onEvent((type, name) => {
	if (type !== "scene") return;
	const base = shot ? 0 : 420;
	if (name === "intro") countAll(".tape dd", base + 1200, 90, 1000);
	if (name === "gameplay") countAll(".map-stats dd", base + 350, 70, 800);
	if (name === "result") {
		$$(".compare td[data-count]").forEach((td, i) => {
			countUp(td, Number(td.dataset.count), { delay: base + 500 + Math.floor(i / 2) * 140, format: td.dataset.fmt || "int" });
		});
	}
});

// ---------- champion: slam burst, confetti cannons, fireworks ----------
// Clocked from the moment the scene is uncovered (the stinger holds the
// incoming scene at frame 0), so it lands with the CSS --slam beat.
const SLAM_MS = 1300;
const champFx = (() => {
	const canvas = $(".champ-fx");
	const ctx = canvas.getContext("2d");
	const rnd = (a, b) => a + Math.random() * (b - a);
	const pick = (list) => list[Math.floor(Math.random() * list.length)];
	const GOLD = [[255, 236, 190], [255, 214, 130], [240, 190, 96], [255, 248, 228]];
	const FLAG = [[245, 196, 49], [76, 125, 255], [239, 51, 71]];
	let sparks = [];
	let paper = [];
	let rockets = [];
	let raf = 0;
	let run = 0;
	let nextRocket = 0;
	let clock = 0;

	function spark(x, y, ang, speed, life, w, c, drag = 0.2, grav = 300, glitter = false) {
		sparks.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life, age: 0, w, c, drag, grav, glitter });
	}
	// The slam: a ring of streaks off the name and a hot horizontal spray.
	function slam(cx, cy) {
		for (let i = 0; i < 260; i++) {
			const ang = rnd(0, Math.PI * 2);
			spark(cx + Math.cos(ang) * rnd(40, 260), cy + Math.sin(ang) * rnd(20, 90), ang, rnd(500, 1900), rnd(0.5, 1.2), rnd(1.2, 3.2), pick(GOLD), 0.08, 700);
		}
		for (const dir of [0, Math.PI]) for (let i = 0; i < 70; i++) spark(cx, cy, dir + rnd(-0.12, 0.12), rnd(900, 2600), rnd(0.3, 0.7), rnd(1, 2.4), [255, 250, 235], 0.05, 200);
	}
	// Confetti cannons from the bottom corners: gold leaf with the flag mixed in.
	function cannon(x, dir, n) {
		for (let i = 0; i < n; i++) {
			const ang = -Math.PI / 2 + dir * rnd(0.25, 0.75);
			const v = rnd(1300, 2600);
			const flag = Math.random() < 0.35;
			paper.push({
				x, y: 1090, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, w: rnd(9, 17), h: rnd(4, 8), rot: rnd(0, Math.PI),
				spin: rnd(-9, 9), flip: rnd(0, Math.PI * 2), fs: rnd(5, 12), sway: rnd(0, Math.PI * 2), c: flag ? pick(FLAG) : pick(GOLD), age: 0,
			});
		}
	}
	function launch() {
		const x = rnd(220, 1700);
		rockets.push({ x, y: 1100, vx: rnd(-60, 60), vy: -rnd(1050, 1350), top: rnd(110, 380), c: Math.random() < 0.3 ? pick(FLAG) : pick(GOLD) });
	}
	function explode(r) {
		const n = Math.round(rnd(110, 160));
		const speed = rnd(520, 760);
		const twin = Math.random() < 0.45 ? pick(GOLD) : null;
		for (let i = 0; i < n; i++) {
			const ang = (i / n) * Math.PI * 2 + rnd(-0.04, 0.04);
			const c = twin && i % 2 ? twin : r.c;
			spark(r.x, r.y, ang, speed * rnd(0.82, 1.04), rnd(1.1, 1.8), rnd(1.2, 2.2), c, 0.32, 160, Math.random() < 0.5);
		}
		// a bright core
		for (let i = 0; i < 24; i++) spark(r.x, r.y, rnd(0, Math.PI * 2), rnd(40, 180), rnd(0.3, 0.6), 3, [255, 252, 240], 0.2, 0);
		if (!shot) sfx.pop((r.x - 960) / 960);
	}

	function step(dt) {
		clock += dt;
		if (clock * 1000 >= nextRocket && nextRocket > 0) {
			launch();
			if (Math.random() < 0.35) launch();
			nextRocket = clock * 1000 + rnd(650, 1500);
		}
		rockets = rockets.filter((r) => {
			r.x += r.vx * dt;
			r.y += r.vy * dt;
			r.vy += 520 * dt;
			if (Math.random() < 0.9) spark(r.x, r.y, Math.PI / 2 + rnd(-0.3, 0.3), rnd(30, 110), rnd(0.25, 0.5), 1.4, [255, 220, 150], 0.3, 120);
			if (r.y <= r.top || r.vy >= 0) {
				explode(r);
				return false;
			}
			return true;
		});
		sparks = sparks.filter((s) => (s.age += dt) < s.life);
		for (const s of sparks) {
			const k = Math.pow(s.drag, dt);
			s.vx *= k;
			s.vy = s.vy * k + s.grav * dt;
			s.x += s.vx * dt;
			s.y += s.vy * dt;
		}
		paper = paper.filter((p) => (p.age += dt) < 9 && p.y < 1120);
		for (const p of paper) {
			const k = Math.pow(0.3, dt);
			p.vx *= k;
			p.vy = p.vy * k + 1100 * dt;
			if (p.vy > 150) p.vy = 150; // leaf drag: it flutters down
			p.sway += dt * 3;
			p.x += (p.vx + Math.sin(p.sway) * 40) * dt;
			p.y += p.vy * dt;
			p.rot += p.spin * dt;
			p.flip += p.fs * dt;
		}
	}
	function draw() {
		ctx.clearRect(0, 0, 1920, 1080);
		ctx.globalCompositeOperation = "lighter";
		ctx.lineCap = "round";
		for (const s of sparks) {
			const life = 1 - s.age / s.life;
			// glitter blinks as it burns out
			if (s.glitter && life < 0.45 && Math.random() < 0.5) continue;
			const [r, g, b] = s.c;
			ctx.lineWidth = s.w * (0.4 + 0.6 * life);
			ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, life * 1.4)})`;
			ctx.beginPath();
			ctx.moveTo(s.x, s.y);
			ctx.lineTo(s.x - s.vx * 0.035, s.y - s.vy * 0.035);
			ctx.stroke();
		}
		for (const r of rockets) {
			ctx.fillStyle = "rgba(255, 246, 225, 0.95)";
			ctx.beginPath();
			ctx.arc(r.x, r.y, 2.6, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalCompositeOperation = "source-over";
		for (const p of paper) {
			const c = Math.cos(p.flip);
			const light = 0.55 + 0.45 * c;
			const [r, g, b] = p.c;
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rot);
			ctx.scale(1, Math.max(Math.abs(c), 0.1));
			ctx.fillStyle = `rgb(${Math.round(r * light)}, ${Math.round(g * light)}, ${Math.round(b * light)})`;
			ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
			ctx.restore();
		}
	}
	// Name centre in stage pixels (the stage itself is scaled to the window).
	function nameCentre() {
		const s = stage.getBoundingClientRect();
		const r = $(".champ-name span").getBoundingClientRect();
		const k = 1920 / s.width;
		return [(r.left + r.width / 2 - s.left) * k, (r.top + r.height * 0.42 - s.top) * k];
	}
	function fire() {
		const [cx, cy] = nameCentre();
		slam(cx, cy);
		// the final gets the full show; a round win gets a shorter burst
		const paper = ROUND.isFinal ? 170 : 80;
		cannon(-20, 1, paper);
		cannon(1940, -1, paper);
		if (ROUND.isFinal) nextRocket = clock * 1000 + 1100;
	}
	return {
		async start() {
			const id = ++run;
			cancelAnimationFrame(raf);
			sparks = [];
			paper = [];
			rockets = [];
			nextRocket = 0;
			clock = 0;
			if (shot) {
				// a still from the middle of the celebration
				fire();
				for (let i = 0; i < 150; i++) step(1 / 60);
				if (ROUND.isFinal) {
					launch();
					rockets[rockets.length - 1].y = rockets[rockets.length - 1].top;
				}
				for (let i = 0; i < 40; i++) step(1 / 60);
				draw();
				return;
			}
			// wait for the stinger to let go of the scene
			while (stage.classList.contains("hold")) await new Promise(requestAnimationFrame);
			if (id !== run) return;
			let last = performance.now();
			let fired = false;
			const loop = () => {
				if (id !== run || document.body.dataset.scene !== "champion") return ctx.clearRect(0, 0, 1920, 1080);
				const now = performance.now();
				const dt = Math.min((now - last) / 1000, 0.05);
				last = now;
				if (!fired && clock * 1000 >= SLAM_MS) {
					fired = true;
					fire();
					sfx.fanfare(ROUND.isFinal);
				}
				step(dt);
				draw();
				raf = requestAnimationFrame(loop);
			};
			raf = requestAnimationFrame(loop);
		},
	};
})();
onEvent((type, name) => type === "scene" && name === "champion" && champFx.start());

// ---------- gold dust ----------
function dust(canvas) {
	const ctx = canvas.getContext("2d");
	const mode = canvas.dataset.dust;
	const scene = canvas.closest("[data-scene]").dataset.scene;
	const W = canvas.width;
	const H = canvas.height;
	const rnd = (a, b) => a + Math.random() * (b - a);
	const motes = Array.from({ length: mode === "fall" ? 90 : 140 }, () => ({
		x: rnd(0, W), y: rnd(0, H), r: rnd(0.6, 2.4), v: rnd(8, 34), sway: rnd(0, Math.PI * 2), tw: rnd(0, Math.PI * 2),
	}));
	const flakes = mode === "fall" ? Array.from({ length: 160 }, () => ({
		x: rnd(0, W), y: rnd(-H, H), w: rnd(7, 14), h: rnd(3, 6), v: rnd(70, 170), rot: rnd(0, Math.PI), spin: rnd(-3, 3), flip: rnd(0, Math.PI * 2), fs: rnd(3, 7), drift: rnd(-20, 20),
	})) : [];
	const draw = (dt) => {
		ctx.clearRect(0, 0, W, H);
		ctx.globalCompositeOperation = "lighter";
		for (const m of motes) {
			m.y -= m.v * dt;
			m.sway += dt * 0.8;
			m.tw += dt * 2.2;
			if (m.y < -10) (m.y = H + 10), (m.x = rnd(0, W));
			const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(m.tw));
			ctx.fillStyle = `rgba(255, 226, 160, ${a})`;
			ctx.beginPath();
			ctx.arc(m.x + Math.sin(m.sway) * 14, m.y, m.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalCompositeOperation = "source-over";
		for (const f of flakes) {
			f.y += f.v * dt;
			f.x += f.drift * dt;
			f.rot += f.spin * dt;
			f.flip += f.fs * dt;
			if (f.y > H + 20) (f.y = -20), (f.x = rnd(0, W));
			const c = Math.cos(f.flip);
			const light = 0.5 + 0.5 * c;
			ctx.save();
			ctx.translate(f.x, f.y);
			ctx.rotate(f.rot);
			ctx.scale(1, Math.max(Math.abs(c), 0.12));
			ctx.fillStyle = `rgb(${Math.round(150 + 105 * light)}, ${Math.round(105 + 120 * light)}, ${Math.round(40 + 120 * light)})`;
			ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
			ctx.restore();
		}
	};
	if (shot) {
		for (let i = 0; i < 60; i++) draw(1 / 60);
		return;
	}
	let last = performance.now();
	const loop = (now) => {
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		if (document.body.dataset.scene === scene) draw(dt);
		requestAnimationFrame(loop);
	};
	requestAnimationFrame(loop);
}
$$("canvas[data-dust]").forEach(dust);

// ---------- autoplay showcase ----------
const SHOW = [["starting", 7000], ["intro", 7000], ["showcase", 13000], ["mappool", 6500], ["gameplay", 15000], ["result", 8000], ["champion", 10000]];
let showing = false;
async function showcase() {
	showing = !showing;
	while (showing) {
		for (const [scene, ms] of SHOW) {
			if (!showing) return;
			await goTo(scene);
			if (scene === "gameplay") setTimeout(() => showing && forceChokeOn(Math.random() < 0.5 ? "l" : "r"), 7000);
			if (scene === "mappool") setTimeout(() => showing && refTimer(), 900);
			await wait(ms);
		}
	}
}
if (SIM) window.addEventListener("keydown", (e) => e.key.toLowerCase() === "a" && showcase());

// ---------- live gameplay ----------
const score = { l: $('[data-score="l"]'), r: $('[data-score="r"]') };
const acc = { l: $('[data-acc="l"]'), r: $('[data-acc="r"]') };
const combo = { l: $('[data-combo="l"]'), r: $('[data-combo="r"]') };
const diffEl = $("#diff");
const fill = $("#trackFill");
const trackPos = $("#trackPos");
const clock = $("#clock");
const progress = $("#discProgress");
const flip = $("#flip");
const deck = $(".deck");
let leader = null;
const hitEls = Object.fromEntries(
	["l", "r"].map((side) => [side, Object.fromEntries(["100", "50", "miss"].map((k) => [k, Object.assign($(`[data-hit="${k}"][data-side="${side}"]`), { n: 0 })]))]),
);
const restart = (el, cls) => {
	el.classList.remove(cls);
	void el.offsetWidth;
	el.classList.add(cls);
};

// Hidden scenes stay in layout (visibility: hidden), so live numbers are
// only written while the gameplay scene is on screen.
const playing = () => document.body.dataset.scene === "gameplay";

onTick((s) => {
	if (!playing()) return;
	for (const side of ["l", "r"]) {
		setNum(score[side], fmt(s.score[side]));
		setNum(acc[side], `${s.acc[side].toFixed(2)}%`);
		setNum(combo[side], `${Math.round(s.combo[side])}x`);
		for (const k of ["100", "50", "miss"]) {
			const n = k === "miss" ? s.miss[side] : s[`n${k}`][side];
			const el = hitEls[side][k];
			if (n === el.n) continue;
			const chip = el.parentElement;
			if (n > el.n) restart(chip, "is-pop");
			if (k === "miss") {
				if (el.n === 0 && n > 0) restart(chip, "is-broke");
				chip.classList.toggle("is-fc", n === 0);
			}
			el.n = n;
			el.textContent = n;
		}
	}
	const diff = s.score.l - s.score.r;
	// fill and marker move by transform only (no layout); share is % of track
	const share = Math.min(Math.abs(diff) / 300000, 1) * 50;
	const lead = diff >= 0 ? "l" : "r";
	const x = lead === "l" ? -share : share;
	fill.style.transform = `translateX(${x / 2}%) scaleX(${share / 100})`;
	trackPos.style.transform = `translateX(${x}%)`;
	if (fill.dataset.lead !== lead) fill.dataset.lead = trackPos.dataset.lead = lead;
	tb.share = x;
	setNum(diffEl, diff === 0 ? "" : fmt(Math.abs(diff)));
	diffEl.dataset.lead = lead;
	if (leader && lead !== leader && Math.abs(diff) > 2500 && s.t > 4) {
		flip.dataset.lead = lead;
		deck.dataset.flip = lead;
		for (const el of [flip, deck]) {
			el.classList.remove("is-flip");
			void el.offsetWidth;
			el.classList.add("is-flip");
		}
	}
	if (Math.abs(diff) > 2500 || !leader) leader = lead;
	score.l.classList.toggle("is-lead", diff > 0);
	score.r.classList.toggle("is-lead", diff < 0);
	setNum(clock, fmtTime(Math.max(0, s.length - s.t)));
	progress.style.strokeDasharray = `${(s.t / s.length) * 100} 100`;
});

onEvent((type, side, s) => {
	if (type !== "break") return;
	const choke = forceChoke || (s.score[side] >= CHOKE_MIN_SCORE && s.miss[side] === 0);
	if (choke && document.body.dataset.scene === "gameplay") return playChoke(side, s);
	const el = $(`[data-break="${side}"]`);
	el.querySelector("span").textContent = `${s.combo[side]}x`;
	el.parentElement.classList.remove("is-broken");
	void el.offsetWidth;
	el.parentElement.classList.add("is-broken");
});

// ---------- Bancho ghost miss ----------
// Bancho sometimes reports a miss that never happened and corrects it a moment
// later: the combo comes back and the miss count drops. Neither can happen in
// a real play (a combo grows a few notes per frame, a miss is never taken
// back), so either one marks the break the casters just saw as Bancho's,
// and a small cue on that player's client says so.
const ghostSeen = { l: { combo: 0, miss: 0, t: -1 }, r: { combo: 0, miss: 0, t: -1 } };
const GHOST_JUMP = 20;
function ghostCue(side, comboNow) {
	const tag = $(`[data-ghost="${side}"]`);
	tag.querySelector("span").textContent = `volvió el combo · ${comboNow}x`;
	tag.parentElement.classList.remove("is-broken");
	restart(tag.parentElement, "is-ghost");
	restart($(`[data-miss="${side}"]`), "is-ghost");
	lobbyLine("Overlay", "bot", `Miss fantasma de Bancho en ${owner(side)}: el combo volvió`);
}
onTick((s) => {
	for (const side of ["l", "r"]) {
		const seen = ghostSeen[side];
		const c = Math.round(s.combo[side]);
		const m = s.miss[side];
		// compare consecutive frames only: a seek or a stall is not a desync
		const fresh = s.t > seen.t && s.t - seen.t < 0.25;
		if (fresh && playing() && (m < seen.miss || c - seen.combo > GHOST_JUMP)) ghostCue(side, c);
		seen.combo = c;
		seen.miss = m;
		seen.t = s.t;
	}
});
onEvent((type) => {
	if (type !== "start") return;
	for (const side of ["l", "r"]) ghostSeen[side] = { combo: 0, miss: 0, t: -1 };
});
if (SIM) window.addEventListener("keydown", (e) => {
	if (e.key.toLowerCase() === "q") trigger("ghost", "l");
	if (e.key.toLowerCase() === "w") trigger("ghost", "r");
});

// ---------- mappool showcase ----------
// One map at a time over its replay. The panel, the arrows or the map tosu
// loads choose the featured one; only the demo steps through on its own.
const FEATURE_MS = 6500;
const MOD_NAME = { NM: "No Mod", HD: "Hidden", HR: "Hard Rock", DT: "Double Time", FM: "Free Mod", TB: "Tiebreaker" };
// AR and OD top out near 11 with DT, so every meter shares that scale.
const METER_MAX = 11;
const showLine = $("#showLine");
const sheet = $("#sheet");
const num1 = (v) => String(Number(Number(v).toFixed(1)));
function renderShowLine() {
	showLine.innerHTML = "";
	for (const mod of [...new Set(POOL.map((m) => modOf(m.id)))]) {
		const maps = POOL.filter((m) => modOf(m.id) === mod);
		const group = document.createElement("li");
		group.className = "line-mod";
		group.dataset.mod = mod.toLowerCase();
		group.style.setProperty("--n", maps.length);
		// a lone slot (TB) names its mod itself
		group.innerHTML = `${maps.length === 1 && maps[0].id === mod ? "" : `<b class="line-head">${mod}</b>`}<ol class="line-maps"></ol>`;
		for (const m of maps) {
			const li = document.createElement("li");
			li.className = "line-map";
			li.dataset.id = m.id;
			li.innerHTML = `<b class="line-n num"></b><span class="line-title"></span>`;
			$(".line-n", li).textContent = m.id === mod ? mod : m.id.slice(mod.length);
			$(".line-title", li).textContent = m.title;
			$(".line-maps", group).append(li);
		}
		showLine.append(group);
	}
	if (POOL.length) featureMap(Math.min(featured, POOL.length - 1), false);
}
let featured = 0;
let featureTimer = 0;
function featureMap(i, animate = true) {
	if (!POOL.length) return;
	featured = (i + POOL.length) % POOL.length;
	const m = POOL[featured];
	const mod = modOf(m.id);
	sheet.dataset.mod = mod.toLowerCase();
	$("#replay").dataset.mod = mod.toLowerCase();
	$("#replayStand").style.backgroundImage = cover(m);
	$("#sheetId").textContent = m.id;
	$("#sheetMod").textContent = MOD_NAME[mod] || mod;
	$("#sheetTitle").textContent = m.title;
	$("#sheetArtist").textContent = m.artist;
	$("#sheetDiff").textContent = `[${m.diff}]`;
	$("#sheetMapper").textContent = m.mapper;
	$("#sheetKey").innerHTML = [
		["SR", m.sr.toFixed(2), "sr", "★"],
		["BPM", Math.round(m.bpm), "bpm", ""],
		["Duración", m.len, "len", ""],
	]
		.map(([k, v, c, unit]) => `<div class="key key--${c}"><dt>${k}</dt><dd class="num">${v}${unit ? `<i>${unit}</i>` : ""}</dd></div>`)
		.join("");
	$("#sheetMeters").innerHTML = [
		["CS", m.cs],
		["AR", m.ar],
		["OD", m.od],
	]
		.map(([k, v]) => `<div class="meter" style="--v:${Math.min(v / METER_MAX, 1)}"><dt>${k}</dt><dd class="num">${num1(v)}</dd><i class="meter-bar"><i></i></i></div>`)
		.join("");
	const ids = POOL.map((p) => p.id);
	$$(".line-map", showLine).forEach((li) => {
		const n = ids.indexOf(li.dataset.id);
		li.dataset.state = n < featured ? "past" : n === featured ? "now" : "next";
	});
	$$(".line-mod", showLine).forEach((g) => g.toggleAttribute("data-now", g.dataset.mod === mod.toLowerCase()));
	if (animate && !shot) restart(sheet, "is-in");
	oro.onFeatured?.();
}
function featureId(id) {
	const i = POOL.findIndex((m) => m.id === id);
	if (i < 0 || (i === featured && sheet.dataset.mod)) return;
	featureMap(i);
}
const autoStep = () => {
	clearInterval(featureTimer);
	if (SIM && !shot && document.body.dataset.scene === "showcase") featureTimer = setInterval(() => featureMap(featured + 1), FEATURE_MS);
};
onEvent((type, name) => {
	if (type !== "scene") return;
	clearInterval(featureTimer);
	if (name !== "showcase") return;
	// live, the operator may have lined up a map before cutting here
	featureMap(SIM ? 0 : featured);
	autoStep();
});
window.addEventListener("keydown", (e) => {
	if (document.body.dataset.scene !== "showcase") return;
	if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
	featureMap(featured + (e.key === "ArrowRight" ? 1 : -1));
	autoStep();
});

// ---------- FC choke: shards off the cut, a heart monitor that flatlines ----------
// Timed with the .choke keyframes in oro.css (3.6s, cut at 540ms).
const CHOKE_MS = 3600;
const CHOKE_CUT_MS = 540;
const CHOKE_BEATS = [0.3, 0.62, 0.86, 1.05]; // seconds, as in sfx.choke
const CHOKE_FLAT = 1.25;
const chokeFx = (() => {
	const canvas = $(".choke-fx");
	const ctx = canvas.getContext("2d");
	const W = canvas.width;
	const H = canvas.height;
	const rnd = (a, b) => a + Math.random() * (b - a);
	let shards = [];
	let embers = [];
	let trace = [];
	let raf = 0;
	let t0 = 0;
	let last = 0;
	let cut = false;
	let slash = { x0: 0, x1: W, y: H / 2, ang: 0 };
	let ekgY = H / 2 + 190;

	// One heartbeat (P, QRS, T) as a function of time since the beat.
	function beat(u) {
		const g = (c, w, h) => h * Math.exp(-(((u - c) / w) ** 2));
		return g(0.02, 0.018, -10) + g(0.07, 0.008, 18) + g(0.085, 0.009, -95) + g(0.1, 0.009, 40) + g(0.2, 0.03, -14);
	}
	// Panic: the beats bunch up and grow, then nothing.
	function wave(t) {
		if (t >= CHOKE_FLAT) return 0;
		let y = 0;
		CHOKE_BEATS.forEach((b, i) => {
			if (t >= b - 0.05 && t < b + 0.3) y += beat(t - b + 0.05) * (1 + i * 0.25);
		});
		return y + Math.sin(t * 90) * 1.2;
	}
	const penX = (t) => (t - 0.15) * 520;

	// Local stage coordinates of the slash line, from the layout.
	function measure() {
		const k = W / canvas.getBoundingClientRect().width;
		const c = canvas.getBoundingClientRect();
		const num = $(".choke-num").getBoundingClientRect();
		const sub = $(".choke-sub").getBoundingClientRect();
		slash = { x0: (num.left - c.left) * k, x1: (num.right - c.left) * k, y: (num.top + num.height / 2 - c.top) * k, ang: (-3.6 * Math.PI) / 180 };
		ekgY = (sub.bottom - c.top) * k + 70;
	}
	function shatter() {
		const { x0, x1, y, ang } = slash;
		for (let i = 0; i < 110; i++) {
			const x = rnd(x0, x1);
			const yy = y + (x - (x0 + x1) / 2) * Math.tan(ang);
			const side = Math.random() < 0.5 ? -1 : 1;
			const a = (-Math.PI / 2) * side + rnd(-0.9, 0.9); // above the cut flies up, below falls away
			const v = rnd(150, 720);
			const r = rnd(4, 20);
			shards.push({
				x, y: yy, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v, rot: rnd(0, 6), spin: rnd(-10, 10), age: 0, life: rnd(0.9, 1.7),
				pts: [0, 1, 2].map((j) => [Math.cos(j * 2.1 + rnd(-0.5, 0.5)) * r * rnd(0.5, 1), Math.sin(j * 2.1 + rnd(-0.5, 0.5)) * r * rnd(0.5, 1)]),
				hot: Math.random() < 0.4,
			});
		}
	}
	function frame() {
		const ms = performance.now() - t0;
		const t = ms / 1000;
		const dt = Math.min(Math.max(t - last, 0), 0.05);
		// sample the monitor between the previous and current pen position
		for (let u = last; u < t; u += 0.002) if (u >= 0.15 && penX(u) <= W + 4) trace.push([penX(u), ekgY - wave(u), u]);
		last = t;
		if (!cut && ms >= CHOKE_CUT_MS) {
			cut = true;
			shatter();
		}
		if (Math.random() < 0.6 && t < 2.8) embers.push({ x: rnd(0, W), y: H + 6, vy: -rnd(30, 90), sway: rnd(0, 6), r: rnd(0.8, 2.2), age: 0, life: rnd(1.6, 2.8) });

		ctx.clearRect(0, 0, W, H);
		// fade everything out with the card
		const out = 1 - Math.min(Math.max((ms - 2950) / 450, 0), 1);
		ctx.globalAlpha = out;

		ctx.globalCompositeOperation = "lighter";
		embers = embers.filter((e) => (e.age += dt) < e.life);
		for (const e of embers) {
			e.y += e.vy * dt;
			e.sway += dt * 2;
			const a = Math.sin((e.age / e.life) * Math.PI) * 0.7;
			ctx.fillStyle = `rgba(255, 90, 100, ${a})`;
			ctx.beginPath();
			ctx.arc(e.x + Math.sin(e.sway) * 10, e.y, e.r, 0, Math.PI * 2);
			ctx.fill();
		}

		// monitor: a sweeping pen with a glowing head and a fading tail
		if (trace.length > 1) {
			ctx.lineJoin = "round";
			ctx.lineCap = "round";
			// chunks of 16 samples share one alpha; the glow is a wide faint
			// stroke under a thin bright one (shadowBlur per chunk is too slow)
			for (let i = 1; i < trace.length; i += 16) {
				const u0 = trace[i - 1][2];
				const a = Math.max(0, 1 - (t - u0) / 1.6);
				const alpha = u0 >= CHOKE_FLAT ? Math.max(a, 0.35) : a;
				if (alpha <= 0) continue;
				ctx.beginPath();
				ctx.moveTo(trace[i - 1][0], trace[i - 1][1]);
				for (let j = i; j < Math.min(i + 16, trace.length); j++) ctx.lineTo(trace[j][0], trace[j][1]);
				ctx.strokeStyle = `rgba(255, 50, 70, ${alpha * 0.28})`;
				ctx.lineWidth = 10;
				ctx.stroke();
				ctx.strokeStyle = `rgba(255, 120, 130, ${alpha})`;
				ctx.lineWidth = 2.6;
				ctx.stroke();
			}
			const [hx, hy] = trace[trace.length - 1];
			if (hx < W) {
				ctx.shadowBlur = 24;
				ctx.fillStyle = "#fff";
				ctx.beginPath();
				ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.shadowBlur = 0;
		}

		ctx.globalCompositeOperation = "source-over";
		shards = shards.filter((s) => (s.age += dt) < s.life);
		for (const s of shards) {
			const k = Math.pow(0.4, dt);
			s.vx *= k;
			s.vy = s.vy * k + 900 * dt;
			s.x += s.vx * dt;
			s.y += s.vy * dt;
			s.rot += s.spin * dt;
			const a = 1 - s.age / s.life;
			ctx.save();
			ctx.translate(s.x, s.y);
			ctx.rotate(s.rot);
			ctx.fillStyle = s.hot ? `rgba(255, 120, 130, ${a * 0.9})` : `rgba(255, 255, 255, ${a * 0.85})`;
			ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(...s.pts[0]);
			ctx.lineTo(...s.pts[1]);
			ctx.lineTo(...s.pts[2]);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}
		ctx.globalAlpha = 1;

		if (ms < CHOKE_MS) raf = requestAnimationFrame(frame);
		else ctx.clearRect(0, 0, W, H);
	}
	return {
		start() {
			cancelAnimationFrame(raf);
			measure();
			t0 = performance.now();
			last = 0;
			cut = false;
			shards = [];
			embers = [];
			trace = [];
			raf = requestAnimationFrame(frame);
		},
	};
})();

// A break is a choke when it ends a full-combo run deep into the map.
// C forces one on alternating sides for the demo.
const CHOKE_MIN_SCORE = 700000;
const chokeEl = $(".choke");
const gp = $(".gp");
let forceChoke = false;
let chokeSide = "l";
let chokeTimer = 0;
function playChoke(side, s) {
	const combo = `${fmt(s.combo[side])}x`;
	const num = $(".choke-num");
	num.style.fontSize = `${Math.min(200, Math.floor(880 / (0.62 * combo.length + 0.5)))}px`;
	$$('[data-choke="combo"]').forEach((el) => (el.textContent = combo));
	$('[data-choke="name"]').textContent = owner(side);
	$('[data-choke="score"]').textContent = fmt(s.score[side]);
	chokeEl.dataset.side = side;
	const duel = $(`.duel-side--${side}`);
	for (const [el, cls] of [[chokeEl, "run"], [gp, "is-choking"], [$(".duel-side--l"), "is-choked"], [$(".duel-side--r"), "is-choked"]]) el.classList.remove(cls);
	void chokeEl.offsetWidth;
	chokeEl.classList.add("run");
	gp.classList.add("is-choking");
	duel.classList.add("is-choked");
	chokeFx.start();
	sfx.choke(side === "l" ? -0.45 : 0.45);
	clearTimeout(chokeTimer);
	chokeTimer = setTimeout(() => {
		chokeEl.classList.remove("run");
		gp.classList.remove("is-choking");
		duel.classList.remove("is-choked");
	}, CHOKE_MS + 100);
}
function forceChokeOn(side) {
	forceChoke = true;
	trigger("break", side);
	forceChoke = false;
}
if (SIM) window.addEventListener("keydown", (e) => {
	if (e.key.toLowerCase() !== "c") return;
	forceChokeOn(chokeSide);
	chokeSide = chokeSide === "l" ? "r" : "l";
});

// ---------- tiebreaker: the whole gameplay scene in godmode ----------
// T toggles it (or ?tb). The series goes to (firstTo - 1) each and the TB
// map comes up behind a 5s intro. From there the scene escalates with the
// map: intensity rises with progress and peaks in the last stretch, and
// the mode follows the scores: a clear lead lights the leader's side, close
// scores turn into a clash at the seam between the clients.
let TB_MAP = byId("TB") || BLANK;
const TB_INTRO_MS = 5000;
const TB_FINAL = 0.86; // progress where the last stretch begins
const TB_CLASH = 0.02; // relative gap under which it is a clash
const TB_LEAD = 0.045; // relative gap over which someone leads
const tbStateEl = $("#tbState");
const tbClockBox = $(".tb-clock");
const tbClock = $("#tbClock");
const tbiEl = $(".tbi");
const tbeEl = $(".tbe");
const backdropVideo = $(".backdrop-video");
const tbWord = $("#tbiWord");
tbWord.innerHTML = [...tbWord.textContent].map((ch, k) => `<span style="--k:${k}">${ch}</span>`).join("");
$("#tbiMap").textContent = `${TB_MAP.title} · ${TB_MAP.artist} · ${TB_MAP.sr.toFixed(2)}★ · ${TB_MAP.len}`;

// Scripted demo: the ratio of Clippy's score to Sombrax79's across the map.
// Even start, Sombrax79 pulls away, Clippy claws back into a long clash,
// takes over as the last stretch opens, gets caught, and edges it at the
// line.
const TB_SCRIPT = [[0, 1], [0.1, 1], [0.3, 0.93], [0.5, 0.925], [0.62, 1], [0.8, 1], [0.87, 1.065], [0.93, 1.065], [0.965, 1], [1, 1.012]];
function tbTarget(p) {
	for (let i = 1; i < TB_SCRIPT.length; i++) {
		const [p1, v1] = TB_SCRIPT[i];
		const [p0, v0] = TB_SCRIPT[i - 1];
		if (p <= p1) {
			const v = v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
			// in the clash the lead keeps swapping
			return p > 0.62 && p < 0.8 ? v + 0.007 * Math.sin(p * 70) : v;
		}
	}
	return TB_SCRIPT[TB_SCRIPT.length - 1][1];
}
// Steers Clippy's gain so the running ratio follows the script: it cancels
// the combo multipliers (a break would otherwise swing it by 20x) and
// corrects the remaining error.
const tbDirector = (s) => {
	const target = tbTarget(s.t / s.length);
	const ratio = (s.score.l + 4000) / (s.score.r + 4000);
	const combo = (1 + s.combo.r / 25) / (1 + s.combo.l / 25);
	return { l: Math.min(Math.max(target * (1 + 6 * (target - ratio)) * combo, 0.05), 30), r: 1 };
};

const tbSweep = $(".tb-sweep");
const tbLayer = $(".tb");
// The tiebreaker's variables are written only onto the elements that read
// them, and only when the value changes: on .stage they would inherit into
// every element and restyle the whole overlay each frame.
// --ti changes slowly and many things read it; --beat changes every frame,
// so it goes only to the few that pulse.
const TB_READERS = [".tb", ".gp .masthead .pill--gold", ".gp .crest", ".tb-clock-n", "#tbState", '[data-score="l"]', '[data-score="r"]', ".gp .track", ".gp .rule i", ".backdrop-grade"];
const TB_BEAT_READERS = [".gp .crest", "#tbState", '[data-score="l"]', '[data-score="r"]', ".gp .track"];
let tbReaders = null;
let tbBeatReaders = null;
const tbVals = new Map();
function tbVar(name, value, only) {
	tbReaders ??= TB_READERS.flatMap((q) => $$(q));
	tbBeatReaders ??= TB_BEAT_READERS.flatMap((q) => $$(q));
	const targets = only ? [only] : name === "--beat" ? tbBeatReaders : tbReaders;
	for (const el of targets) {
		if (tbVals.get(el)?.[name] === value) continue;
		el.style.setProperty(name, value);
		tbVals.set(el, { ...tbVals.get(el), [name]: value });
	}
}
const tb = { on: false, leader: null, sweptAt: -9, mode: "calm", cand: "calm", candAt: 0, ti: 0, beat: 0, pulse: 0, final: false, sec: null, p: 0 };
const TB_STATE = { calm: () => "Tiebreaker", clash: () => "Cabeza a cabeza", "lead-l": () => `Domina ${owner("l")}`, "lead-r": () => `Domina ${owner("r")}` };

function tbSetMode(mode, quiet = false) {
	tb.mode = mode;
	stage.dataset.tbMode = mode;
	tbStateEl.textContent = TB_STATE[mode]();
	restart(tbStateEl, "is-new");
	if (quiet) return;
	if (mode === "clash") sfx.tbClash();
	else if (mode.startsWith("lead")) sfx.tbLead(mode === "lead-l" ? -0.5 : 0.5);
}
function tbReset() {
	tb.cand = "calm";
	tb.leader = null;
	tb.sweptAt = -9;
	tb.final = false;
	tb.sec = null;
	delete stage.dataset.tbFinal;
	delete stage.dataset.tbTen;
	tbSetMode("calm", true);
}
function tbEnter({ intro = true } = {}) {
	tb.on = true;
	stage.dataset.tb = "";
	if (SIM) setDirector(tbDirector);
	renderSeries({ l: MATCH.firstTo - 1, r: MATCH.firstTo - 1 }, $(".gp"));
	renderSeries({ l: MATCH.firstTo - 1, r: MATCH.firstTo - 1 }, $(".pool"));
	$$("[data-tbi]").forEach((el) => (el.textContent = MATCH.firstTo - 1));
	showMap(TB_MAP, { slot: "TB", pick: "Tiebreaker" });
	$(".gp .pill--gold").textContent = "Tiebreaker";
	STINGER_LABEL.gameplay = "Tiebreaker";
	restartMatch();
	tbReset();
	tbFx.start();
	if (!intro || shot) return;
	// hold the map until the intro has played
	const speed = getSpeed() || 1;
	setSpeed(0);
	restart(tbiEl, "run");
	tbiFx.start();
	sfx.tbIntro();
	setTimeout(() => {
		tbiEl.classList.remove("run");
		if (tb.on) setSpeed(speed);
	}, TB_INTRO_MS);
}
function tbExit() {
	tb.on = false;
	delete stage.dataset.tb;
	tbReset();
	delete stage.dataset.tbMode;
	setDirector(null);
	renderSeries(MATCH.stars);
	showMap(current);
	$(".gp .pill--gold").textContent = ROUND.name;
	STINGER_LABEL.gameplay = LIVE ? mapLabel() : `Mapa 6 · ${current.id}`;
	for (const el of tbReaders || []) for (const v of ["--ti", "--beat", "--gl", "--gr"]) el.style.removeProperty(v);
	tbVals.clear();
	tbiEl.classList.remove("run");
	if (!getSpeed()) setSpeed(1);
	restartMatch();
}
if (SIM) window.addEventListener("keydown", (e) => {
	if (e.key.toLowerCase() === "f" && getSpeed()) setSpeed(getSpeed() === 1 ? 4 : 1);
});
window.addEventListener("keydown", (e) => {
	if (e.key.toLowerCase() !== "t" || document.body.dataset.scene !== "gameplay") return;
	if (tb.on) tbExit();
	else tbEnter();
});

onTick((s) => {
	if (!tb.on || !playing()) return;
	const p = Math.min(s.t / s.length, 1);
	tb.p = p;
	tb.ti = p >= TB_FINAL ? 1 : 0.12 + 0.88 * Math.pow(p / TB_FINAL, 1.4);
	// mode, with a short dwell so a single frame can't flip it
	const hi = Math.max(s.score.l, s.score.r, 1);
	const rel = Math.abs(s.score.l - s.score.r) / hi;
	const lead = s.score.l >= s.score.r ? "l" : "r";
	let next = tb.mode;
	if (p < 0.05) next = "calm";
	else if (rel < TB_CLASH) next = "clash";
	else if (rel > TB_LEAD) next = `lead-${lead}`;
	// between the two thresholds, keep the current mode (once out of calm)
	else if (tb.mode === "calm") next = rel < (TB_CLASH + TB_LEAD) / 2 ? "clash" : `lead-${lead}`;
	if (next !== tb.cand) {
		tb.cand = next;
		tb.candAt = s.t;
	}
	if (tb.cand !== tb.mode && s.t - tb.candAt > 0.8) tbSetMode(tb.cand);
	// a new leader gets a sweep across the HUD (not more than every 2.5s)
	if (p > 0.05 && rel > 0.004 && lead !== tb.leader) {
		if (tb.leader && s.t - tb.sweptAt > 2.5) {
			tbSweep.dataset.side = lead;
			restart(tbSweep, "run");
			tb.sweptAt = s.t;
		}
		tb.leader = lead;
	}
	// pulse on every other beat of the map, so it reads as a heartbeat
	const beats = (s.t * TB_MAP.bpm) / 120;
	tb.pulse = Math.floor(beats);
	tb.beat = Math.pow(1 - (beats % 1), 3);
	const { ti, beat, mode } = tb;
	let gl = 0.25 * ti;
	let gr = 0.25 * ti;
	if (mode === "lead-l") (gl = ti * (0.65 + 0.35 * beat)), (gr = 0.1 * ti);
	if (mode === "lead-r") (gr = ti * (0.65 + 0.35 * beat)), (gl = 0.1 * ti);
	if (mode === "clash") {
		// tug of war: the pulse alternates sides
		const even = tb.pulse % 2 === 0;
		gl = ti * (0.45 + 0.55 * beat * (even ? 1 : 0.25));
		gr = ti * (0.45 + 0.55 * beat * (even ? 0.25 : 1));
	}
	tbVar("--ti", ti.toFixed(2));
	tbVar("--beat", beat.toFixed(2));
	tbVar("--gl", gl.toFixed(2), tbLayer);
	tbVar("--gr", gr.toFixed(2), tbLayer);
	// (the backdrop video stays at 1x: speeding up a 60fps loop means decoding
	// more frames than the screen shows, which drops frames on older GPUs)
	// last stretch and the countdown
	if (p >= TB_FINAL && !tb.final) {
		tb.final = true;
		stage.dataset.tbFinal = "";
		sfx.tbFinal();
	}
	if (tb.final) {
		const left = Math.max(0, Math.floor(s.length - s.t));
		setNum(tbClock, fmtTime(left));
		if (left <= 10 && !("tbTen" in stage.dataset)) stage.dataset.tbTen = "";
		if (left <= 10 && left > 0 && left !== tb.sec) {
			restart(tbClockBox, "is-tick");
			restart(tbLayer, "tb-tick");
			sfx.tick(left <= 3);
		}
		tb.sec = left;
	}
});
onEvent((type, side, s) => {
	if (!tb.on) return;
	if (type === "end") {
		tbeEl.dataset.side = side;
		$("#tbeName").textContent = owner(side);
		restart(tbeEl, "run");
		sfx.fanfare(false);
	}
	if (type === "start") tbReset();
});

// Canvas, redrawn every frame from smooth functions of time (nothing is
// re-rolled, so it never stutters):
// - the seam: two energy ribbons, one per player, twisting round each other.
//   Their size follows each side's glow: calm both faint, a lead makes the
//   leader's ribbon big and the other a thread, a clash makes both big and
//   fast, with sparks where they cross.
// - comets racing round the leader's frame.
// - on the deck's diff track: each player's power beam pushing against the
//   marker, which burns as an orb; in a clash both beams meet there.
// - motes up the seam, embers off the deck in the last stretch.
const tbFx = (() => {
	const canvas = $(".tb-fx");
	const ctx = canvas.getContext("2d");
	const rnd = (a, b) => a + Math.random() * (b - a);
	const FRAMES = { l: [0, 100, 956, 720], r: [964, 100, 956, 720] };
	const COL = { l: [255, 77, 94], r: [76, 125, 255] };
	const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;
	const track = $(".track");
	// track geometry in stage pixels, measured once (and on resize) instead
	// of reading layout every frame
	let trackBox = null;
	const measureTrack = () => (trackBox = toStage(track.getBoundingClientRect()));
	window.addEventListener("resize", () => (trackBox = null));
	let idle = false;
	let raf = 0;
	let last = 0;
	let clock = 0;
	let sparks = [];
	let motes = [];
	let comet = 0;
	let gl = 0;
	let gr = 0;
	// a point u px along the frame's perimeter, clockwise from top-left
	function perim([x, y, w, h], u) {
		const P = 2 * (w + h);
		u = ((u % P) + P) % P;
		if (u < w) return [x + u, y];
		if (u < w + h) return [x + w, y + u - w];
		if (u < 2 * w + h) return [x + w - (u - w - h), y + h];
		return [x, y + h - (u - 2 * w - h)];
	}
	const K = 0.017; // ribbon wavelength along the seam
	const ribbonX = (y, amp, phase) => 960 + amp * Math.sin(y * K + phase) * Math.sqrt(Math.sin((Math.PI * (y - 100)) / 720));
	function ribbon(side, amp, alpha, phase) {
		if (alpha <= 0.01) return;
		ctx.beginPath();
		for (let y = 100; y <= 820; y += 5) {
			const x = ribbonX(y, amp, phase);
			if (y === 100) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.strokeStyle = rgba(COL[side], alpha * 0.22);
		ctx.lineWidth = 12;
		ctx.stroke();
		ctx.strokeStyle = rgba(COL[side], alpha * 0.8);
		ctx.lineWidth = 3.5;
		ctx.stroke();
		ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
		ctx.lineWidth = 1.2;
		ctx.stroke();
	}
	// stage pixels from a DOM rect
	function toStage(r) {
		const s = stage.getBoundingClientRect();
		const k = 1920 / s.width;
		return { x: (r.left - s.left) * k, y: (r.top - s.top) * k, w: r.width * k, h: r.height * k };
	}
	function beam(x0, x1, y, side, a) {
		const g = ctx.createLinearGradient(x0, 0, x1, 0);
		g.addColorStop(0, rgba(COL[side], 0));
		g.addColorStop(1, rgba(COL[side], a));
		ctx.strokeStyle = g;
		ctx.lineWidth = 10;
		ctx.beginPath();
		ctx.moveTo(x0, y);
		ctx.lineTo(x1, y);
		ctx.stroke();
		ctx.lineWidth = 3;
		ctx.stroke();
	}
	function frame() {
		if (!tb.on) return ctx.clearRect(0, 0, 1920, 1080);
		raf = requestAnimationFrame(frame);
		const now = performance.now();
		const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
		last = now;
		if (document.body.dataset.scene !== "gameplay") {
			if (!idle) ctx.clearRect(0, 0, 1920, 1080);
			idle = true;
			return;
		}
		idle = false;
		ctx.clearRect(0, 0, 1920, 1080);
		const { ti, beat, mode } = tb;
		// ease the per-side strength so mode changes glide instead of cut
		const tl = mode === "lead-l" || mode === "clash" ? 1 : mode === "lead-r" ? 0.15 : 0.3;
		const tr = mode === "lead-r" || mode === "clash" ? 1 : mode === "lead-l" ? 0.15 : 0.3;
		const ease = 1 - Math.pow(0.02, dt);
		gl += (tl - gl) * ease;
		gr += (tr - gr) * ease;
		const clash = mode === "clash";
		clock += dt * (1.5 + (clash ? 7 : 3) * ti);
		ctx.globalCompositeOperation = "lighter";
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		// seam ribbons, opposite phase so they braid
		const ampL = (3 + 19 * ti) * gl * (0.85 + 0.15 * beat);
		const ampR = (3 + 19 * ti) * gr * (0.85 + 0.15 * beat);
		ribbon("l", ampL, (0.3 + 0.7 * ti) * (0.35 + 0.65 * gl), clock);
		ribbon("r", ampR, (0.3 + 0.7 * ti) * (0.35 + 0.65 * gr), clock + Math.PI);
		// where they cross (both sines at zero), throw sparks
		if (clash) {
			for (let n = Math.ceil((100 * K + clock) / Math.PI); ; n++) {
				const y = (n * Math.PI - clock) / K;
				if (y > 820) break;
				if (y > 110 && Math.random() < 0.25 + 0.5 * ti) {
					const dir = Math.random() < 0.5 ? -1 : 1;
					sparks.push({ x: 960, y, vx: dir * rnd(120, 420), vy: rnd(-160, 60), age: 0, life: rnd(0.2, 0.45), c: dir < 0 ? COL.l : COL.r });
				}
			}
		}

		// motes up the seam; embers off the deck in the last stretch
		if (Math.random() < 0.3 + ti) motes.push({ x: 960 + rnd(-12, 12), y: 820, vy: -rnd(60, 200) * (0.5 + ti), age: 0, life: rnd(1, 2.5), r: rnd(0.8, 2), c: [255, 226, 160] });
		if (tb.final) for (let i = 0; i < 3; i++) motes.push({ x: rnd(0, 1920), y: 822, vy: -rnd(40, 160), age: 0, life: rnd(0.8, 1.8), r: rnd(0.8, 2.2), c: [255, 110, 80] });
		motes = motes.filter((m) => (m.age += dt) < m.life);
		for (const m of motes) {
			m.y += m.vy * dt;
			ctx.fillStyle = rgba(m.c, Math.sin((m.age / m.life) * Math.PI) * (0.4 + 0.6 * ti));
			ctx.beginPath();
			ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
			ctx.fill();
		}

		// comets round the leader's frame
		if (mode === "lead-l" || mode === "lead-r") {
			const side = mode.slice(-1);
			const f = FRAMES[side];
			const P = 2 * (f[2] + f[3]);
			const n = Math.round(2 + 6 * ti);
			comet += dt * (500 + 1300 * ti);
			for (let k = 0; k < n; k++) {
				const head = comet + (k * P) / n;
				ctx.beginPath();
				ctx.moveTo(...perim(f, head));
				for (let j = 1; j <= 14; j++) ctx.lineTo(...perim(f, head - j * 16 * (0.6 + ti)));
				ctx.strokeStyle = rgba(COL[side], 0.3 + 0.3 * ti);
				ctx.lineWidth = 3 + 3 * ti;
				ctx.stroke();
				ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + 0.4 * beat})`;
				ctx.beginPath();
				ctx.arc(...perim(f, head), 2.5 + 2 * ti, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		// deck: power beams into the marker on the diff track
		const t = trackBox || measureTrack();
		const lead = (tb.share || 0) <= 0 ? "l" : "r";
		const mx = t.x + t.w * (0.5 + (tb.share || 0) / 100);
		const my = t.y + t.h / 2;
		const power = 0.35 + 0.65 * ti;
		if (gl > 0.2) beam(t.x, mx, my, "l", power * gl);
		if (gr > 0.2) beam(t.x + t.w, mx, my, "r", power * gr);
		const orb = 5 + 5 * ti + 4 * beat;
		const og = ctx.createRadialGradient(mx, my, 0, mx, my, orb * 4);
		const oc = clash ? [255, 120, 110] : COL[lead];
		og.addColorStop(0, "rgba(255, 255, 255, 1)");
		og.addColorStop(0.25, rgba(oc, 0.9 * power));
		og.addColorStop(1, rgba(oc, 0));
		ctx.fillStyle = og;
		ctx.beginPath();
		ctx.arc(mx, my, orb * 4, 0, Math.PI * 2);
		ctx.fill();
		if (clash && Math.random() < 0.6 * ti + 0.2) {
			for (let i = 0; i < 2; i++) {
				const a = rnd(0, Math.PI * 2);
				sparks.push({ x: mx, y: my, vx: Math.cos(a) * rnd(80, 260), vy: Math.sin(a) * rnd(80, 260) - 80, age: 0, life: rnd(0.2, 0.4), c: Math.random() < 0.5 ? COL.l : COL.r });
			}
		}

		sparks = sparks.filter((p) => (p.age += dt) < p.life);
		ctx.lineWidth = 1.6;
		for (const p of sparks) {
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vy += 700 * dt;
			ctx.strokeStyle = rgba(p.c, 1 - p.age / p.life);
			ctx.beginPath();
			ctx.moveTo(p.x, p.y);
			ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
			ctx.stroke();
		}
	}
	return {
		start() {
			cancelAnimationFrame(raf);
			last = performance.now();
			raf = requestAnimationFrame(frame);
		},
	};
})();

// Intro FX: sparks off the diagonal when the halves meet (900ms), a burst
// round the word when it locks (2.1s), embers throughout; the scene shakes
// on both hits.
const tbiFx = (() => {
	const canvas = $(".tbi-fx");
	const ctx = canvas.getContext("2d");
	const rnd = (a, b) => a + Math.random() * (b - a);
	let raf = 0;
	let t0 = 0;
	let last = 0;
	let parts = [];
	let hits = 0;
	// the diagonal runs from (54%, 0) to (46%, 100%)
	const diagX = (y) => 1036.8 - (153.6 * y) / 1080;
	function frame() {
		const now = performance.now();
		const ms = now - t0;
		const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
		last = now;
		if (hits === 0 && ms >= 900) {
			hits = 1;
			shake();
			for (let i = 0; i < 260; i++) {
				const y = rnd(0, 1080);
				const dir = Math.random() < 0.5 ? -1 : 1;
				parts.push({ x: diagX(y), y, vx: dir * rnd(300, 1600), vy: rnd(-500, 300), age: 0, life: rnd(0.4, 1), c: dir < 0 ? [255, 77, 94] : [76, 125, 255], w: rnd(1.2, 3), g: 600 });
			}
		}
		if (hits === 1 && ms >= 2100) {
			hits = 2;
			shake();
			for (let i = 0; i < 220; i++) {
				const a = rnd(0, Math.PI * 2);
				parts.push({ x: 960 + Math.cos(a) * rnd(100, 640), y: 545 + Math.sin(a) * rnd(30, 100), vx: Math.cos(a) * rnd(300, 1400), vy: Math.sin(a) * rnd(200, 900), age: 0, life: rnd(0.5, 1.1), c: Math.random() < 0.5 ? [255, 210, 120] : [255, 90, 70], w: rnd(1.2, 3), g: 500 });
			}
		}
		if (ms < 4200 && Math.random() < 0.9) parts.push({ x: rnd(0, 1920), y: 1090, vx: rnd(-20, 20), vy: -rnd(80, 260), age: 0, life: rnd(1.5, 3), c: [255, 150, 90], w: rnd(1, 2.4), g: -20, ember: true });
		ctx.clearRect(0, 0, 1920, 1080);
		ctx.globalCompositeOperation = "lighter";
		ctx.lineCap = "round";
		parts = parts.filter((p) => (p.age += dt) < p.life);
		for (const p of parts) {
			const k = Math.pow(p.ember ? 0.9 : 0.15, dt);
			p.vx *= k;
			p.vy = p.vy * k + p.g * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			const a = p.ember ? Math.sin((p.age / p.life) * Math.PI) * 0.8 : 1 - p.age / p.life;
			const [r, g, b] = p.c;
			ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
			ctx.lineWidth = p.w;
			ctx.beginPath();
			ctx.moveTo(p.x, p.y);
			ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03 + (p.ember ? 4 : 0));
			ctx.stroke();
		}
		if (ms < TB_INTRO_MS) raf = requestAnimationFrame(frame);
		else ctx.clearRect(0, 0, 1920, 1080);
	}
	return {
		start() {
			cancelAnimationFrame(raf);
			t0 = last = performance.now();
			parts = [];
			hits = 0;
			raf = requestAnimationFrame(frame);
		},
	};
})();
if (new URLSearchParams(location.search).has("tb")) tbEnter({ intro: false });

// ---------- fit-to-slot ----------
// Names and titles come from live data and vary wildly in length; instead of
// clipping or ellipsing them, shrink the type until it fits its slot.
// [selector, max width in px (0 = the element's own box), min font px, multi-line]
const FIT = [
	[".corner-name", 520, 16],
	[".tag-name", 880, 26],
	[".tally-name", 520, 16],
	[".duelist h1", 520, 48],
	[".result-winner", 1600, 80],
	[".champ-name", 1760, 100],
	[".card-title", 0, 14],
	[".map-title", 0, 18, true],
	[".road-title", 0, 9, true],
	[".tbi-name", 0, 40],
	[".tbe-name", 1800, 80],
	[".intro-title", 1600, 60],
	[".start-player b", 360, 26],
];
function fit(el, max, min, multi) {
	// Refit only when the text changed: measuring stops the element's
	// animation, and turning it back on replays its entrance from the start.
	// A slot inside a hidden scene has no layout yet; it fits when shown.
	if (el._fit === el.textContent) return;
	if (!el.offsetWidth && !el.offsetHeight) return;
	el._fit = el.textContent;
	// Measure at rest: entrance animations change letter-spacing mid-flight.
	el.style.animation = "none";
	el.style.fontSize = "";
	let size = parseFloat(getComputedStyle(el).fontSize);
	// Real text width in layout px (the stage itself is scaled), so sub-pixel
	// overflow that scrollWidth rounds away still counts.
	const textWidth = () => {
		const range = document.createRange();
		range.selectNodeContents(el);
		return (range.getBoundingClientRect().width * el.offsetWidth) / el.getBoundingClientRect().width;
	};
	const over = () =>
		multi ? el.scrollHeight > el.clientHeight + 1 : max ? el.scrollWidth > max : textWidth() > el.clientWidth - 0.5;
	while (over() && size > min) {
		size -= 1;
		el.style.fontSize = `${size}px`;
	}
	el.style.animation = "";
}
window.fitAll = () => FIT.forEach(([sel, max, min, multi]) => $$(sel).forEach((el) => fit(el, max, min, multi)));
document.fonts.ready.then(window.fitAll);
onEvent((type) => type === "scene" && window.fitAll());

// ---------- performance meter (P, or ?perf) ----------
// Frame rate, the slow frames and the background video's dropped frames,
// read where it matters: inside OBS. Turns red under 55 fps. Development
// builds only.
if (import.meta.env.DEV) (() => {
	const el = document.createElement("output");
	el.className = "perf";
	document.body.append(el);
	let on = false;
	let times = [];
	let shownAt = 0;
	let base = null;
	const loop = (now) => {
		if (!on) return;
		times.push(now);
		while (now - times[0] > 2000) times.shift();
		if (now - shownAt > 500 && times.length > 10) {
			shownAt = now;
			const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
			const fps = (times.length - 1) / ((times.at(-1) - times[0]) / 1000);
			const q = backdropVideo.getVideoPlaybackQuality();
			base ??= q;
			const dropped = q.droppedVideoFrames - base.droppedVideoFrames;
			const total = q.totalVideoFrames - base.totalVideoFrames;
			const codec = (backdropVideo.currentSrc.match(/\.(h264|av1|vp9)\./) || [, "?"])[1];
			el.textContent = `${fps.toFixed(0)} fps   p95 ${gaps[Math.floor(gaps.length * 0.95)].toFixed(1)} ms   peor ${gaps.at(-1).toFixed(0)} ms\nvideo ${codec}: ${dropped} de ${total} frames perdidos`;
			el.toggleAttribute("data-bad", fps < 55);
		}
		requestAnimationFrame(loop);
	};
	const toggle = (v = !on) => {
		on = v;
		el.classList.toggle("on", on);
		times = [];
		base = null;
		if (on) requestAnimationFrame(loop);
	};
	window.addEventListener("keydown", (e) => e.key.toLowerCase() === "p" && toggle());
	if (new URLSearchParams(location.search).has("perf")) toggle(true);
	return { toggle };
})();


// ---------- live data ----------
// Entry points for the live source (src/oro/live.ts); the demo never calls
// them. Each one redraws only what its data feeds.
let lastWin = "l";
function mapLabel() {
	if (!current.id) return "Gameplay";
	const n = DRAFT.picks.findIndex((p) => p.id === current.id);
	return `Mapa ${(n < 0 ? DRAFT.picks.length : n) + 1} · ${current.id}`;
}
const fmtRank = (n) => (n ? `#${fmt(n)}` : "—");
export const oro = {
	setPerson,
	setTalking,
	// The pick timer from the control panel: seconds to start it, null to stop.
	timer: (seconds) => (seconds ? refTimer(seconds) : pickTimer.stop()),
	// Seat a caster (0-3) or free the seat; the rest rearrange around it.
	showCaster,
	setChatMode,
	twitchLine: (who, color, msg, userId) => twitchLine([who, color, msg, userId]),
	twitchAvatar,
	// A new channel: its name in the chat heads, and the old lines go.
	twitchChannel,
	// One lobby line from tosu: into the lobby chat and the pick timer.
	chat(who, side, msg, time) {
		lobbyLine(who, side, msg, time);
		pickTimer.bancho(msg);
	},
	// Seed from data.json; ranks and pp from the player's osu! profile.
	setPlayerInfo(side, { seed, rank, countryRank, country = "Colombia", pp }) {
		const seedText = seed ? `Seed ${seed}` : "";
		$$(`.duelist--${side} .duelist-seed, .start-player--${side} .label`).forEach((el) => (el.textContent = seedText));
		const tape = $$(`.duelist--${side} .tape div`);
		[
			["Global", rank, "#"],
			[country, countryRank, "#"],
			["PP", pp ? Math.round(pp) : 0, ""],
		].forEach(([label, value, pre], i) => {
			const [dt, dd] = [$("dt", tape[i]), $("dd", tape[i])];
			dt.textContent = label;
			dd.dataset.count = value || 0;
			dd.dataset.pre = pre;
			dd.textContent = value ? pre + fmt(value) : "—";
		});
		// "#39 Colombia · Seed 1" on the left, mirrored on the right; what is
		// not known is left out
		const meta = $(`.corner--${side} .corner-meta`);
		const parts = [country, seedText].filter(Boolean).join(" · ");
		const rankTag = countryRank ? `<b>${fmtRank(countryRank)}</b>` : "";
		meta.innerHTML = (side === "l" ? [rankTag, parts] : [parts, rankTag]).filter(Boolean).join(" ");
	},
	// The pool, in data.json order, as cards: { id, set, artist, title, ... }.
	setPool(maps) {
		POOL.splice(0, POOL.length, ...maps);
		TB_MAP = byId("TB") || BLANK;
		$("#tbiMap").textContent = TB_MAP.id ? `${TB_MAP.title} · ${TB_MAP.artist} · ${TB_MAP.sr.toFixed(2)}★ · ${TB_MAP.len}` : "";
		renderPool();
		renderShowLine();
	},
	// Picks, bans and winners changed (DRAFT is edited in place).
	draftChanged() {
		renderPool();
		renderSeriesCopy(MATCH.stars, lastWin);
		STINGER_LABEL.gameplay = mapLabel();
	},
	// The showcase's featured map, by pool slot; read back with featured().
	feature: (id) => featureId(id),
	featured: () => POOL[featured]?.id ?? "",
	// Set by the control link: told whenever the featured map changes.
	onFeatured: null,
	setCurrentMap(map) {
		current = map;
		DRAFT.current = map.id || null;
		if (!tb.on) showMap(map);
		STINGER_LABEL.gameplay = mapLabel();
		renderPool();
		// The tiebreaker map brings the tiebreaker scene with it.
		if (map.id === "TB" && !tb.on) tbEnter();
		if (map.id !== "TB" && tb.on) tbExit();
	},
	setStars(stars) {
		MATCH.stars = stars;
		if (!tb.on) for (const scope of [".gp", ".pool"]) renderSeries(stars, $(scope));
		renderSeriesCopy(stars, lastWin);
	},
	// A finished map: { winner, stars, l: { score, acc, maxCombo, miss }, r }.
	setResult({ winner, stars, l, r }) {
		lastWin = winner;
		const rows = [
			["score", "Score", (v) => v, "int", 1],
			["acc", "Accuracy", (v) => v.toFixed(2), "pct", 1],
			["maxCombo", "Max combo", (v) => v, "x", 1],
			["miss", "Miss", (v) => v, null, -1],
		];
		$(".compare tbody").innerHTML = rows
			.map(([k, label, val, f, dir]) => {
				const win = Math.sign((l[k] - r[k]) * dir);
				const td = (v, on) => `<td class="${on ? "is-win" : ""}"${f ? ` data-count="${val(v)}" data-fmt="${f}"` : ""}>${f === "pct" ? `${val(v)}%` : f === "x" ? `${v}x` : f === "int" ? fmt(v) : v}</td>`;
				return `<tr>${td(l[k], win > 0)}<th>${label}</th>${td(r[k], win < 0)}</tr>`;
			})
			.join("");
		const n = DRAFT.picks.findIndex((p) => p.id === current.id);
		$(".result-sub").textContent = `gana el mapa ${(n < 0 ? DRAFT.picks.filter((p) => p.won).length : n) + 1}`;
		$(".result").dataset.win = winner;
		$("[data-result-pfp]").dataset.pfp = winner;
		$("[data-result-pfp]")._pfp = null;
		// the series pips on the result screen light the map just won
		$$(".result [data-pips]").forEach((el) => {
			if (el.dataset.pips === winner) el.dataset.plus = "1";
			else delete el.dataset.plus;
		});
		const before = { ...stars, [winner]: Math.max(0, stars[winner] - 1) };
		renderSeries(before, $(".result"));
		$(".result .series-n").innerHTML = `${stars.l} <i>—</i> ${stars.r}`;
		renderSeriesCopy(stars, winner);
		renderPfps($(".result"));
	},
};

// The demo pool is there from the start; live, setPool draws the line.
renderShowLine();

// Live, nothing from the demo shows while tosu's first data is on its way:
// the sample names and the sample result table go blank.
if (!SIM) {
	for (const key of ["l", "r"]) setPerson(key, { name: "" });
	$(".compare tbody").innerHTML = "";
}
renderPfps();
boot("gameplay", {
	switcher: !LIVE,
	scenes: ["starting", "intro", "showcase", "mappool", "gameplay", "result", "champion"],
	labels: { starting: "Ya empezamos", showcase: "Showcase" },
	hint: "<kbd>T</kbd> TB · <kbd>Q</kbd><kbd>W</kbd> bancho · <kbd>G</kbd> chats · <kbd>R</kbd><kbd>E</kbd> timer · <kbd>F</kbd> ×4 · <kbd>C</kbd> choke · <kbd>A</kbd> demo · <kbd>M</kbd> sonido · <kbd>P</kbd> perf",
});
if ($('[data-goto="champion"]')) $('[data-goto="champion"]').lastChild.textContent = ROUND.short || "Ganador";

// Pick timer setup, in the switcher: length in seconds, start and stop.
const timerCtl = document.createElement("span");
timerCtl.className = "switcher-timer";
timerCtl.innerHTML = `<label>Timer <input type="number" min="5" max="600" step="5" value="${pickTimer.total}"> s</label><button type="button" data-timer="start">Iniciar</button><button type="button" data-timer="stop">Parar</button>`;
const timerInput = $("input", timerCtl);
const timerSec = () => Math.max(5, Number(timerInput.value) || 120);
timerInput.addEventListener("keydown", (e) => e.stopPropagation());
timerInput.addEventListener("change", () => (pickTimer.total = timerSec()));
$('[data-timer="start"]', timerCtl).addEventListener("click", () => refTimer(timerSec()));
$('[data-timer="stop"]', timerCtl).addEventListener("click", () => window.bancho("Countdown aborted"));
$(".switcher-round")?.before(timerCtl);
if (SIM && query.has("demo")) showcase();
