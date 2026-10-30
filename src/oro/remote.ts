import type ControlLink from "../control/ControlLink";
import type LiveOro from "./live";
import { oro } from "./oro.js";
import { DRAFT, LIVE, ROUND, goTo, onEvent } from "./stage.js";

// The overlay's end of the control link: runs the panel's commands and tells
// the panel what the overlay is showing. `live` is null in the ?sim demo,
// which has no draft to edit.
const ID = Math.random().toString(36).slice(2, 10);
// Re-sent this often so the panel can tell which overlays are still open.
const HEARTBEAT_MS = 4000;

export default class OverlayRemote {
	constructor(
		private link: ControlLink,
		private live: LiveOro | null,
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
				case "twitch":
					this.live?.setTwitchChannel(command.channel);
					break;
				case "poolReload":
					this.live?.reloadPool();
					break;
				case "showcase":
					oro.feature(command.id);
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
		link.onStatus = (connected) => connected && this.publish();
		setInterval(() => this.publish(), HEARTBEAT_MS);
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
		});
	}
}
