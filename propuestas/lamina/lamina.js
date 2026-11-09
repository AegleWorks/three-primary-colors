import { boot, onTick, onEvent, MATCH, POOL, DRAFT, CHAT, modOf, fmt, fmtTime } from "../shared/stage.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Sticker slots: one per map needed to win, filled with a mini sticker per map won.
$$("[data-slots]").forEach((el) => {
	const side = el.dataset.slots;
	const won = MATCH.stars[side] + Number(el.dataset.plus || 0);
	for (let i = 0; i < MATCH.firstTo; i++) {
		const slot = document.createElement("i");
		if (i < won) slot.className = "on";
		if (el.dataset.plus && i === won - 1) slot.className = "on is-new";
		el.append(slot);
	}
});

const owner = (s) => (s === "l" ? "Clippy" : "Sombrax79");
const grid = $("#poolGrid");
for (const mod of [...new Set(POOL.map((m) => modOf(m.id)))]) {
	const group = document.createElement("div");
	group.className = `group group--${mod.toLowerCase()}`;
	group.innerHTML = `<span class="group-mod">${mod}</span>`;
	const row = document.createElement("div");
	row.className = "group-slots";
	for (const map of POOL.filter((m) => modOf(m.id) === mod)) {
		const pick = DRAFT.picks.find((p) => p.id === map.id);
		const ban = DRAFT.bans[map.id];
		const slot = document.createElement("div");
		slot.className = "slot";
		// Small deterministic tilt so placed stickers look hand-applied.
		slot.style.setProperty("--tilt", `${((map.id.charCodeAt(2) * 7) % 7) - 3}deg`);
		if (ban) {
			slot.classList.add("is-ban");
			slot.innerHTML = `<span class="slot-id">${map.id}</span><span class="slot-title">${map.title}</span><span class="slot-stamp">Vetada</span><span class="slot-by">por ${owner(ban)}</span>`;
		} else if (pick?.won || map.id === DRAFT.current) {
			const cls = map.id === DRAFT.current ? "sticker is-foil" : `sticker won-${pick.won}`;
			const foot = map.id === DRAFT.current ? "Se está jugando" : `De ${owner(pick.won)}`;
			slot.innerHTML = `<div class="${cls}"><span class="sticker-id">${map.id}</span><span class="sticker-title">${map.title}</span><span class="sticker-foot">${foot}</span></div>`;
		} else {
			slot.innerHTML = `<span class="slot-id">${map.id}</span><span class="slot-title">${map.title}</span><span class="slot-artist">${map.artist}</span>`;
		}
		row.append(slot);
	}
	group.append(row);
	grid.append(group);
}

const chat = $("#chat");
for (const line of CHAT) {
	const p = document.createElement("p");
	p.className = `msg msg--${line.side}`;
	p.innerHTML = `<b>${line.who}</b> ${line.msg}`;
	chat.append(p);
}

const score = { l: $('[data-score="l"]'), r: $('[data-score="r"]') };
const lead = { l: $('[data-lead="l"]'), r: $('[data-lead="r"]') };
const clock = $("#clock");

onTick((s) => {
	for (const side of ["l", "r"]) {
		score[side].textContent = fmt(s.score[side]);
		const diff = s.score[side] - s.score[side === "l" ? "r" : "l"];
		lead[side].textContent = diff > 0 ? `+${fmt(diff)}` : "";
		lead[side].hidden = diff <= 0;
	}
	clock.textContent = fmtTime(Math.max(0, s.length - s.t));
});

onEvent((type, side, s) => {
	if (type !== "break") return;
	const el = $(`.stamp--${side}`);
	$(`[data-break="${side}"]`).textContent = `${s.combo[side]}x`;
	el.classList.remove("is-on");
	void el.offsetWidth;
	el.classList.add("is-on");
});

boot("gameplay");
