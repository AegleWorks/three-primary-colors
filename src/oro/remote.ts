import { version } from "../../package.json";
import type ControlLink from "../control/ControlLink";
import type { Command } from "../control/ControlLink";
import { Leader } from "./leader";
import { OverlayId } from "./overlayId";
import type Battle from "./battle";
import type LiveOro from "./live";
import { oro } from "./oro.js";
import type Qualifiers from "./qualifiers";
import type Sources from "./sources";
import { DRAFT, LIVE, ROUND, ROUNDS, goTo, onEvent, saveRound } from "./stage.js";

// The overlay's end of the control link: runs the panel's commands and tells
// the panel what the overlay is showing. `live` is null in the ?sim demo,
// which has no draft to edit.
// Kept across a reload of this page (see overlayId.ts).
const ID = new OverlayId();
const IN_OBS = "obsstudio" in window;
const BOOT_MS = 15_000;
// Re-sent this often so the panel can tell which overlays are still open.
const HEARTBEAT_MS = 4000;

// A browser tab in the background gets its timers slowed to about one a
// minute, so the panel would think the overlay closed. A worker's timers
// keep their pace, so the beat comes from one; where workers aren't allowed,
// a plain interval.
function heartbeat(beat: () => void) {
	try {
		const code = `setInterval(() => postMessage(0), ${HEARTBEAT_MS});`;
		const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
		worker.onmessage = beat;
	} catch {
		setInterval(beat, HEARTBEAT_MS);
	}
}

// Once per bridge version, so a bridge that can't update the files tosu serves
// (it lives in another folder) doesn't reload the overlay in a loop.
const RELOADED = "rempalago-overlay-reloaded";
function reloadFor(bridge: string) {
	if (!bridge || bridge === version) return;
	try {
		if (sessionStorage.getItem(RELOADED) === bridge) return;
		sessionStorage.setItem(RELOADED, bridge);
	} catch {
		return;
	}
	console.warn(`[OverlayRemote] Overlay v${version}, bridge v${bridge}: reloading`);
	location.reload();
}

// What a mirror leaves to the OBS overlay: everything that writes the draft,
// the series or the Battle Royale's room and pool. The mirror gets the result
// from the OBS overlay's state instead.
const LEADER_ONLY = new Set<Command["action"]>(["draft", "draftReset", "stars", "nextPicker", "draftRestore", "battle"]);

export default class OverlayRemote {
	private leader = new Leader({
		get id() {
			return ID.id;
		},
		obs: IN_OBS,
	});
	private mirroring = false;
	// the first seconds of this overlay: a tab's state heard then is weighed
	// against what this one loaded (see LiveOro.adoptFrom)
	private bootUntil = Date.now() + BOOT_MS;

	constructor(
		private link: ControlLink,
		private live: LiveOro | null,
		private qualifiers: Qualifiers,
		private sources: Sources,
		private battle: Battle,
	) {
		link.onCommand((command) => {
			if (this.mirroring && LEADER_ONLY.has(command.action)) return;
			switch (command.action) {
				case "scene":
					goTo(command.scene);
					break;
				// Shortcuts the overlay already answers to (T tiebreaker, G chats...).
				case "key":
					window.dispatchEvent(new KeyboardEvent("keydown", { key: command.key }));
					break;
				case "timer":
					oro.timer(command.seconds);
					break;
				case "draft":
					this.live?.editDraft(command.id, command.side, command.edit);
					break;
				case "draftReset":
					this.live?.resetDraft();
					break;
				case "stars":
					this.live?.setStars(command.stars);
					break;
				case "nextPicker":
					this.live?.setNextPicker(command.side);
					break;
				case "clearScores":
					this.live?.clearScores();
					break;
				case "draftRestore":
					this.live?.restoreDraft(command.draft);
					break;
				case "twitch":
					this.live?.setTwitchChannel(command.channel);
					break;
				case "poolReload":
					this.live?.reloadPool();
					break;
				case "showcase":
					oro.feature(command.id);
					break;
				case "qualifier":
					qualifiers.show(Number(command.index) || 0);
					break;
				case "sources":
					if (command.refresh) sources.discover();
					if (command.pool !== undefined) sources.setPool(Number(command.pool));
					if (command.results !== undefined) sources.setResults(Number(command.results));
					if (command.file !== undefined) sources.setFile(String(command.file));
					break;
				case "battle":
					if (command.reset) this.battle.reset();
					if (command.add) this.battle.addPlayer(command.add);
					if (command.remove) this.battle.removePlayer(command.remove);
					if (command.cover) this.battle.setCover(command.cover);
					if (command.winner !== undefined) this.battle.setWinner(command.winner);
					if (command.next !== undefined) this.battle.setNext(command.next);
					if (command.played) this.battle.togglePlayed(command.played);
					if (command.poolReset) this.battle.resetPool();
					if (command.poolReload) this.battle.loadPool();
					break;
				case "round": {
					if (!ROUNDS[command.round]) break;
					saveRound(command.round);
					const url = new URL(location.href);
					url.searchParams.set("round", command.round);
					location.href = url.toString();
					break;
				}
			}
		});
		onEvent((type) => type === "scene" && this.publish());
		if (live) live.onUpdate = () => this.publish();
		oro.onFeatured = () => this.publish();
		qualifiers.onUpdate = () => this.publish();
		sources.onUpdate = () => this.publish();
		battle.onUpdate = () => this.publish();
		link.onStatus = (connected) => connected && this.publish();
		// The bridge updates the overlay's files when it starts, but OBS keeps
		// running the code it loaded: a bridge on another version reloads this
		// page once, so overlay, panel and bridge speak the same version.
		link.onRemoteStatus((status) => reloadFor(status.version));
		// Other overlays' states: an OBS overlay among them makes this one (if
		// it isn't in OBS) a mirror of it; see leader.ts.
		link.onState((other) => {
			// In OBS: a tab speaking is a tab leading (a mirror stays quiet), so it
			// ran the match while OBS was closed. What it has newer comes back.
			if (IN_OBS && !other.obs && other.id !== ID.id) {
				const boot = Date.now() < this.bootUntil;
				const draft = this.live?.adoptFrom(other, boot) ?? false;
				const room = this.battle.adoptFrom(other.battle, boot);
				if (draft || room) this.publish();
				return;
			}
			this.leader.heard(other, Date.now());
			this.updateMirror();
			if (!this.mirroring || !other.obs) return;
			this.live?.mirrorFrom(other);
			this.battle.mirrorFrom(other.battle);
		});
		link.onGone((id) => {
			this.leader.gone(id);
			this.updateMirror();
		});
		heartbeat(() => {
			this.updateMirror();
			this.publish();
		});
		// back in front: say so right away rather than at the next beat
		document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && this.publish());
	}

	private updateMirror() {
		const on = this.leader.mirroring(Date.now());
		if (on === this.mirroring) return;
		this.mirroring = on;
		this.live?.setMirror(on);
		this.battle.setMirror(on);
		console.info(on ? "[OverlayRemote] An overlay in OBS is open: this one mirrors it" : "[OverlayRemote] No overlay in OBS any more: this one runs the match");
		// leading again: the panel hears this one now, not at the next beat;
		// a mirror: the panels stop counting it as an open overlay
		if (on) this.link.retire(ID.id);
		else this.publish();
	}

	private publish() {
		// a mirror stays off the wire: the panel, the remote panels and the
		// bridge's last-state cache only hear the OBS overlay
		if (this.mirroring) return;
		this.link.publish({
			id: ID.id,
			obs: IN_OBS,
			scene: document.body.dataset.scene ?? "",
			round: ROUND.key,
			live: LIVE,
			names: this.live?.names ?? { l: "", r: "" },
			stars: this.live?.series ?? { l: 0, r: 0 },
			map: this.live?.current ?? { id: "", title: "" },
			pool: (this.live?.poolMaps ?? []).map(({ id, set, title, artist, diff, mapper, sr, bpm, len }) => ({ id, set, title, artist, diff, mapper, sr, bpm, len })),
			draft: DRAFT,
			draftAt: this.live?.draftState.at,
			draftPlayers: this.live?.draftState.players,
			showcase: oro.featured(),
			poolStatus: this.live?.poolStatus ?? { ok: true, text: "" },
			twitch: this.live?.twitch ?? { channels: [], channel: "", status: "off" },
			sources: this.sources.state,
			qualifiers: { players: this.qualifiers.players.map(({ name, seed }) => ({ name, seed })), index: this.qualifiers.index },
			battle: this.battle.state,
		});
	}
}
