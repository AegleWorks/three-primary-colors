import { boot, onTick, onEvent, MATCH, POOL, DRAFT, CHAT, modOf, fmt } from "../shared/stage.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Round pips: filled diamonds for maps won, nearest to the centre first.
$$("[data-pips]").forEach((el) => {
	const side = el.dataset.pips;
	const won = MATCH.stars[side] + Number(el.dataset.plus || 0);
	for (let i = 0; i < MATCH.firstTo; i++) {
		const pip = document.createElement("i");
		if (i < won) pip.className = "on";
		if (el.dataset.plus && i === won - 1) pip.className = "on is-new";
		el.append(pip);
	}
});

const grid = $("#poolGrid");
const mods = [...new Set(POOL.map((m) => modOf(m.id)))];
for (const mod of mods) {
	const row = document.createElement("div");
	row.className = `select-row select-row--${mod.toLowerCase()}`;
	row.innerHTML = `<span class="select-mod">${mod}</span>`;
	for (const map of POOL.filter((m) => modOf(m.id) === mod)) {
		const pick = DRAFT.picks.find((p) => p.id === map.id);
		const ban = DRAFT.bans[map.id];
		const tile = document.createElement("div");
		tile.className = "tile";
		if (ban) tile.classList.add("is-ban", `by-${ban}`);
		if (pick) tile.classList.add("is-pick", `by-${pick.by}`);
		if (pick?.won) tile.classList.add(`won-${pick.won}`);
		if (map.id === DRAFT.current) tile.classList.add("is-current");
		const tag = ban ? "Ban" : pick ? (pick.won ? (pick.won === "l" ? "Clippy" : "Sombrax79") : "En juego") : "";
		tile.innerHTML = `
			<span class="tile-id">${map.id}</span>
			<span class="tile-title">${map.title}</span>
			<span class="tile-artist">${map.artist}</span>
			${tag ? `<span class="tile-tag">${tag}</span>` : ""}`;
		row.append(tile);
	}
	grid.append(row);
}

const order = $("#pickOrder");
DRAFT.picks.forEach((p, i) => {
	const li = document.createElement("li");
	li.className = `by-${p.by}${p.won ? ` won-${p.won}` : " is-live"}`;
	li.innerHTML = `<b>${i + 1}</b><span>${p.id}</span>`;
	order.append(li);
});

const chat = $("#chat");
for (const line of CHAT) {
	const p = document.createElement("p");
	p.className = `msg msg--${line.side}`;
	p.innerHTML = `<b>${line.who}</b> ${line.msg}`;
	chat.append(p);
}

const fill = { l: $(".side--l .bar-fill"), r: $(".side--r .bar-fill") };
const trail = { l: $(".side--l .bar-trail"), r: $(".side--r .bar-trail") };
const score = { l: $('[data-score="l"]'), r: $('[data-score="r"]') };
const lead = { l: $('[data-lead="l"]'), r: $('[data-lead="r"]') };
const clock = $("#clock");

onTick((s) => {
	const top = Math.max(s.score.l, s.score.r, 1);
	for (const side of ["l", "r"]) {
		const share = s.score[side] / top;
		fill[side].style.transform = `scaleX(${share})`;
		trail[side].style.transform = `scaleX(${share})`;
		score[side].textContent = fmt(s.score[side]);
		const diff = s.score[side] - s.score[side === "l" ? "r" : "l"];
		lead[side].textContent = diff > 0 ? `+${fmt(diff)}` : "";
	}
	clock.textContent = String(Math.ceil(s.length - s.t));
	clock.classList.toggle("is-low", s.length - s.t <= 10);
});

onEvent((type, side, s) => {
	if (type !== "break") return;
	const el = $(`.break--${side}`);
	$(`[data-break="${side}"]`).textContent = `${s.combo[side]}x perdido`;
	el.classList.remove("is-on");
	void el.offsetWidth;
	el.classList.add("is-on");
});

boot("gameplay");
