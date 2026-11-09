import { boot, onTick, onEvent, MATCH, POOL, DRAFT, CHAT, modOf, fmt, fmtTime } from "../shared/stage.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Bulbs: the chiva's roof lights, one per map won.
$$("[data-bulbs]").forEach((el) => {
	const side = el.dataset.bulbs;
	const won = MATCH.stars[side] + Number(el.dataset.plus || 0);
	for (let i = 0; i < MATCH.firstTo; i++) {
		const bulb = document.createElement("i");
		if (i < won) bulb.className = "on";
		if (el.dataset.plus && i === won - 1) bulb.className = "on is-new";
		el.append(bulb);
	}
});

const grid = $("#poolGrid");
for (const mod of [...new Set(POOL.map((m) => modOf(m.id)))]) {
	const col = document.createElement("div");
	col.className = `routes-col routes-col--${mod.toLowerCase()}`;
	col.innerHTML = `<span class="routes-mod">${mod}</span>`;
	for (const map of POOL.filter((m) => modOf(m.id) === mod)) {
		const pick = DRAFT.picks.find((p) => p.id === map.id);
		const ban = DRAFT.bans[map.id];
		const sign = document.createElement("div");
		sign.className = "sign";
		if (ban) sign.classList.add("is-ban");
		if (pick?.won) sign.classList.add(`won-${pick.won}`);
		if (map.id === DRAFT.current) sign.classList.add("is-current");
		const owner = (s) => (s === "l" ? "Clippy" : "Sombrax79");
		const note = ban ? `Vetado por ${owner(ban)}` : pick?.won ? `Gana ${owner(pick.won)}` : map.id === DRAFT.current ? "Sonando" : map.artist;
		sign.innerHTML = `<b class="sign-id">${map.id}</b><span class="sign-title">${map.title}</span><span class="sign-note">${note}</span>`;
		col.append(sign);
	}
	grid.append(col);
}

const chat = $("#chat");
for (const line of CHAT) {
	const p = document.createElement("p");
	p.className = `msg msg--${line.side}`;
	p.innerHTML = `<b>${line.who}</b> ${line.msg}`;
	chat.append(p);
}

const confetti = $("#confetti");
const colors = ["#ffc400", "#1543a6", "#e0262b", "#1c9a55", "#fff3d6"];
for (let i = 0; i < 90; i++) {
	const c = document.createElement("i");
	c.style.left = `${Math.random() * 100}%`;
	c.style.background = colors[i % colors.length];
	c.style.animationDelay = `${-Math.random() * 6}s`;
	c.style.animationDuration = `${4 + Math.random() * 4}s`;
	c.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
	c.style.setProperty("--y", `${Math.random() * 1000}px`);
	confetti.append(c);
}

const score = { l: $('[data-score="l"]'), r: $('[data-score="r"]') };
const clock = $("#clock");
const fill = $("#ropeFill");
const knot = $("#ropeKnot");
const diffEl = $("#ropeDiff");

onTick((s) => {
	score.l.textContent = fmt(s.score.l);
	score.r.textContent = fmt(s.score.r);
	clock.textContent = fmtTime(Math.max(0, s.length - s.t));
	// The knot drifts toward whoever leads; 300k ahead pins it to the end.
	const diff = s.score.l - s.score.r;
	const pos = 50 - Math.max(-1, Math.min(1, diff / 300000)) * 46;
	fill.style.left = `${Math.min(pos, 50)}%`;
	fill.style.right = `${Math.min(100 - pos, 50)}%`;
	fill.className = `rope-fill ${diff >= 0 ? "is-l" : "is-r"}`;
	knot.style.left = `${pos}%`;
	diffEl.textContent = diff === 0 ? "" : `${diff > 0 ? "◀" : ""} ${fmt(Math.abs(diff))} ${diff < 0 ? "▶" : ""}`;
	diffEl.className = `rope-diff ${diff >= 0 ? "is-l" : "is-r"}`;
});

onEvent((type, side, s) => {
	if (type !== "break") return;
	const el = $(`.burst--${side}`);
	$(`[data-break="${side}"]`).textContent = `se rompió un combo de ${s.combo[side]}`;
	el.classList.remove("is-on");
	void el.offsetWidth;
	el.classList.add("is-on");
});

boot("gameplay");
