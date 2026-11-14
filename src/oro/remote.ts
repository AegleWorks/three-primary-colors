import type ControlLink from "../control/ControlLink";
import type Battle from "./battle";
import type LiveOro from "./live";
import { oro } from "./oro.js";
import type Qualifiers from "./qualifiers";
import type Sources from "./sources";
import { DRAFT, LIVE, ROUND, goTo, onEvent } from "./stage.js";

// The overlay's end of the control link: runs the panel's commands and tells
// the panel what the overlay is showing. `live` is null in the ?sim demo,
// which has no draft to edit.
const ID = Math.random().toString(36).slice(2, 10);
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

export default class OverlayRemote {
	constructor(
		private link: ControlLink,
		private live: LiveOro | null,
		private qualifiers: Qualifiers,
		private sources: Sources,
		private battle: Battle,
	) {
		link.onCommand((command) => {
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
		heartbeat(() => this.publish());
		// back in front: say so right away rather than at the next beat
		document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && this.publish());
	}

	private publish() {
		this.link.publish({
			id: ID,
			obs: "obsstudio" in window,
			scene: document.body.dataset.scene ?? "",
			round: ROUND.key,
			live: LIVE,
			names: this.live?.names ?? { l: "", r: "" },
			stars: this.live?.series ?? { l: 0, r: 0 },
			map: this.live?.current ?? { id: "", title: "" },
			pool: (this.live?.poolMaps ?? []).map(({ id, set, title, artist, diff, mapper, sr, bpm, len }) => ({ id, set, title, artist, diff, mapper, sr, bpm, len })),
			draft: DRAFT,
			showcase: oro.featured(),
			poolStatus: this.live?.poolStatus ?? { ok: true, text: "" },
			twitch: this.live?.twitch ?? { channels: [], channel: "", status: "off" },
			sources: this.sources.state,
			qualifiers: { players: this.qualifiers.players.map(({ name, seed }) => ({ name, seed })), index: this.qualifiers.index },
			battle: this.battle.state,
		});
	}
}
