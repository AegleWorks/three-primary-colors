import ZEngine from "@fukutotojido/z-engine";
import ControlLink, { type Command, type DraftEdit, type OverlayState } from "../control/ControlLink";
import OBSHandler from "../handler/OBSHandler";
import SceneSync from "../handler/SceneSync";
import { ROUNDS, type SceneName, type Side } from "../oro/stage.js";

// The control panel. Everything it does is a command to the overlay; what it
// shows (scene, series, map, pool, draft) is the state the overlay publishes
// back, so the panel never guesses.

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const link = new ControlLink();
const send = (command: Command) => link.send(command);
let state: OverlayState | null = null;
// Every overlay that has spoken lately, by id, in the order they were first
// heard. The panel follows the one in OBS, or else the first one, so that
// heartbeats from two overlays do not make it flip between them.
const overlays = new Map<string, { state: OverlayState; at: number }>();
const GONE_MS = 10000;
let selected: string | null = null;

const SCENES: [SceneName, string][] = [
	["starting", "Ya empezamos"],
	["intro", "Intro"],
	["showcase", "Showcase"],
	["mappool", "Mappool"],
	["gameplay", "Gameplay"],
	["result", "Resultado"],
	["champion", "Campeón"],
];
const sceneName = (scene: string) => SCENES.find(([s]) => s === scene)?.[1] ?? "—";
const KEYS: [string, string][] = [
	["t", "Tiebreaker"],
	["g", "Chat lobby o Twitch"],
	["m", "Sonido"],
	// the meter, like the demo, exists only in development builds
	...(import.meta.env.DEV ? [["p", "Medidor de rendimiento"] as [string, string]] : []),
];
const SIM_KEYS: [string, string][] = [
	["a", "Demo automática"],
	["f", "Velocidad ×4"],
	["c", "Choke"],
	[" ", "Pausar"],
	["z", "Romper combo izq."],
	["x", "Romper combo der."],
	["q", "Miss de Bancho izq."],
	["w", "Miss de Bancho der."],
];
const PRESETS = [60, 90, 120];

function button(label: string, onClick: () => void, className = "btn") {
	const b = document.createElement("button");
	b.type = "button";
	b.className = className;
	b.textContent = label;
	b.addEventListener("click", onClick);
	return b;
}

const name = (side: Side) => state?.names[side] || (side === "l" ? "Izquierda" : "Derecha");
const other = (side: Side): Side => (side === "l" ? "r" : "l");
const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------- links ----------
link.onStatus = (connected) => {
	$("#linkDot").dataset.on = String(connected);
	if (!connected) renderOnAir();
};

// ---------- scenes ----------
for (const [scene, label] of SCENES) {
	const b = button(label, () => send({ action: "scene", scene }));
	b.dataset.scene = scene;
	$("#scenes").append(b);
}
const obs = new OBSHandler(new ZEngine("ws://127.0.0.1:24050/ws"));
new SceneSync(obs, (scene) => send({ action: "scene", scene }));

// ---------- timer ----------
const secondsInput = $<HTMLInputElement>("#timerSeconds");
const seconds = () => Math.max(5, Number(secondsInput.value) || 120);
function markPreset() {
	for (const b of $("#timerPresets").children) b.setAttribute("aria-pressed", String(Number((b as HTMLElement).dataset.seconds) === seconds()));
}
for (const s of PRESETS) {
	const b = button(`${s}s`, () => {
		secondsInput.value = String(s);
		markPreset();
	});
	b.dataset.seconds = String(s);
	$("#timerPresets").append(b);
}
secondsInput.addEventListener("input", markPreset);
markPreset();
$("#timerStart").addEventListener("click", () => send({ action: "timer", seconds: seconds() }));
$("#timerStop").addEventListener("click", () => send({ action: "timer", seconds: null }));

// ---------- tools ----------
const round = $<HTMLSelectElement>("#round");
for (const [key, r] of Object.entries(ROUNDS)) round.add(new Option(`${r.name} (BO${r.bestOf})`, key));
round.addEventListener("change", () => send({ action: "round", round: round.value }));
for (const [key, label] of KEYS) $("#keys").append(button(label, () => send({ action: "key", key })));
if (import.meta.env.DEV) for (const [key, label] of SIM_KEYS) $("#simKeys").append(button(label, () => send({ action: "key", key })));
else $("#simBlock").remove();

// ---------- draft ----------
$("#draftReset").addEventListener("click", () => {
	if (confirmReset()) send({ action: "draftReset" });
});
// A second press within three seconds confirms; no browser dialog in a dock.
let resetArmed = 0;
function confirmReset() {
	const b = $("#draftReset");
	if (Date.now() - resetArmed < 3000) {
		b.textContent = "Reiniciar draft";
		return true;
	}
	resetArmed = Date.now();
	b.textContent = "¿Seguro? Toca otra vez";
	setTimeout(() => (b.textContent = "Reiniciar draft"), 3000);
	return false;
}

function mapState(id: string) {
	const draft = state!.draft;
	const pick = draft.picks.find((p) => p.id === id);
	return { pick, ban: draft.bans[id], won: id === "TB" ? draft.tbWon : pick?.won, current: draft.current === id };
}

function stateText(id: string, short = false) {
	const { pick, ban, won, current } = mapState(id);
	if (ban) return short ? "Ban" : `Baneado por ${name(ban)}`;
	if (won) return short ? `Ganó ${name(won)}` : `${pick ? `Pick de ${name(pick.by)}, ` : ""}lo ganó ${name(won)}`;
	if (current) return short ? "En juego" : `En juego${pick ? `, pick de ${name(pick.by)}` : ""}`;
	if (pick) return short ? "Pick" : `Pick de ${name(pick.by)}`;
	return short ? "" : "Libre";
}

function renderDraft() {
	const box = $("#draft");
	box.innerHTML = "";
	if (!state) {
		box.innerHTML = `<p class="note">Esperando al overlay. Ábrelo (en OBS o en una pestaña) con el bridge corriendo.</p>`;
		return;
	}
	if (!state.live) {
		box.innerHTML = `<p class="note">La demo no tiene draft. Abre el overlay sin <code>?sim</code> para editarlo.</p>`;
		return;
	}
	if (!state.pool.length) {
		box.innerHTML = `<p class="note">Cargando el pool desde data.json.</p>`;
		return;
	}
	const mods = [...new Set(state.pool.map((m) => m.id.replace(/\d+$/, "")))];
	for (const mod of mods) {
		const row = document.createElement("div");
		row.className = "mod";
		row.dataset.mod = mod.toLowerCase();
		row.innerHTML = `<b class="mod-name">${mod}</b><div class="mod-cards"></div>`;
		for (const map of state.pool.filter((m) => m.id.replace(/\d+$/, "") === mod)) {
			const { pick, ban, won, current } = mapState(map.id);
			const card = document.createElement("button");
			card.type = "button";
			card.className = "card";
			if (pick) card.dataset.by = pick.by;
			if (won) card.dataset.won = won;
			if (ban) card.dataset.ban = ban;
			if (current) card.dataset.current = "";
			card.setAttribute("aria-pressed", String(selected === map.id));
			card.title = `${map.artist} - ${map.title} [${map.diff}]`;
			const badge = stateText(map.id, true);
			const tone = ban ?? won ?? pick?.by ?? "";
			card.innerHTML = `
				<i class="card-art" style="background-image:url('https://assets.ppy.sh/beatmaps/${map.set}/covers/card.jpg')"></i>
				<span class="card-top"><b class="card-slot">${map.id}</b>${badge ? `<span class="card-state" data-tone="${tone}">${esc(badge)}</span>` : ""}</span>
				<span class="card-title">${esc(map.title)}</span>
				<span class="card-artist">${esc(map.artist)}</span>
				<span class="card-diff">[${esc(map.diff)}] · ${esc(map.mapper)}</span>
				<span class="card-stats"><b>${map.sr.toFixed(2)}★</b><span>${Math.round(map.bpm)} BPM</span><span>${map.len}</span></span>`;
			card.addEventListener("click", () => {
				selected = selected === map.id ? null : map.id;
				renderDraft();
				renderSelected();
			});
			row.lastElementChild!.append(card);
		}
		box.append(row);
	}
}

function renderSelected() {
	const map = state?.live ? state.pool.find((m) => m.id === selected) : undefined;
	$("#selectedEmpty").hidden = Boolean(map);
	$("#selectedBody").hidden = !map;
	if (!map) return;
	const { pick, ban, won } = mapState(map.id);
	const art = $("#selectedArt");
	art.style.backgroundImage = `linear-gradient(90deg, rgba(12, 10, 7, 0.92) 30%, rgba(12, 10, 7, 0.45)), url('https://assets.ppy.sh/beatmaps/${map.set}/covers/cover.jpg')`;
	art.dataset.mod = map.id.replace(/\d+$/, "").toLowerCase();
	$("#selectedSlot").textContent = map.id;
	$("#selectedTitle").textContent = map.title;
	$("#selectedMeta").textContent = `${map.artist} · [${map.diff}] · ${map.sr.toFixed(2)}★ · ${Math.round(map.bpm)} BPM · ${map.len}`;
	$("#selectedState").textContent = stateText(map.id);
	$("#selNameL").textContent = name("l");
	$("#selNameR").textContent = name("r");
	for (const b of document.querySelectorAll<HTMLElement>("#selected [data-side]")) {
		const side = b.dataset.side as Side;
		const on = { pick: pick?.by === side, ban: ban === side, win: won === side }[b.dataset.edit as "pick" | "ban" | "win"];
		b.setAttribute("aria-pressed", String(on));
	}
}

for (const b of document.querySelectorAll<HTMLElement>("#selected [data-edit]")) {
	b.addEventListener("click", () => {
		if (!selected) return;
		send({ action: "draft", id: selected, side: (b.dataset.side as Side) ?? "l", edit: b.dataset.edit as DraftEdit });
	});
}

// ---------- on air ----------
function renderOnAir() {
	const onAir = $("#onair");
	onAir.dataset.live = String(Boolean(state && link.connected));
	if (!state || !link.connected) {
		$("#onairLabel").textContent = link.connected ? "Esperando al overlay" : "Sin bridge: corre bun dev";
		$("#onairScene").textContent = "—";
		return;
	}
	$("#onairLabel").textContent = state.live ? "Al aire" : "Al aire, demo";
	$("#onairScene").textContent = sceneName(state.scene);
	$("#seriesNameL").textContent = name("l");
	$("#seriesNameR").textContent = name("r");
	$("#seriesL").textContent = String(state.stars.l);
	$("#seriesR").textContent = String(state.stars.r);
	$("#onairMap").textContent = state.map.title ? `${state.map.id ? `${state.map.id}: ` : ""}${state.map.title}` : "Sin mapa cargado";
	const last = state.draft.picks.at(-1)?.by;
	const next = state.draft.next ?? (last ? other(last) : "l");
	$("#onairTurn").innerHTML = state.live ? `Pickea <b class="who--${next}">${esc(name(next))}</b>` : "";
	$("#roundBadge").textContent = ROUNDS[state.round]?.name ?? state.round;
	for (const b of document.querySelectorAll<HTMLElement>("#scenes [data-scene]")) b.setAttribute("aria-current", String(b.dataset.scene === state.scene));
}

function follow() {
	const now = Date.now();
	for (const [id, o] of overlays) if (now - o.at > GONE_MS) overlays.delete(id);
	const all = [...overlays.values()];
	const chosen = all.find((o) => o.state.obs) ?? all[0];
	const count = overlays.size;
	$("#overlayCount").textContent =
		count > 1 ? `${count} overlays abiertos: sigo ${chosen.state.obs ? "el de OBS" : "el primero que se abrió"}. Todos reciben los comandos.` : "";
	return chosen?.state ?? null;
}
setInterval(() => {
	const had = overlays.size;
	follow();
	if (had && !overlays.size) {
		state = null;
		renderOnAir();
		renderDraft();
		renderSelected();
	}
}, 2000);

link.onState((incoming) => {
	const known = overlays.get(incoming.id);
	if (known) Object.assign(known, { state: incoming, at: Date.now() });
	else overlays.set(incoming.id, { state: incoming, at: Date.now() });
	const next = follow();
	if (!next) return;
	state = next;
	round.value = next.round;
	if (import.meta.env.DEV) $("#simBlock").hidden = next.live;
	renderOnAir();
	renderDraft();
	renderSelected();
});
renderOnAir();
renderDraft();
