// BanchoBot's replies to the referee's !mp commands. The tournament client's
// #multiplayer channel (what tosu reads) has the referee's commands but not
// BanchoBot's answers, so the overlay writes them itself, worded as Bancho
// does. It stops as soon as a real reply turns up (see LiveOro.readChat).

export type MapLookup = (beatmapId: number) => string | undefined;

const MODS: Record<string, string> = {
	nf: "NoFail",
	ez: "Easy",
	td: "TouchDevice",
	hd: "Hidden",
	hr: "HardRock",
	sd: "SuddenDeath",
	dt: "DoubleTime",
	rx: "Relax",
	ht: "HalfTime",
	nc: "Nightcore",
	fl: "Flashlight",
	so: "SpunOut",
	ap: "Autopilot",
	pf: "Perfect",
	v2: "ScoreV2",
};

// "2 minutes", "1 minute and 30 seconds", "45 seconds"
function duration(sec: number) {
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	const parts = [m ? `${m} minute${m === 1 ? "" : "s"}` : "", s ? `${s} second${s === 1 ? "" : "s"}` : ""].filter(Boolean);
	return parts.join(" and ") || "0 seconds";
}

// The reply to one line, or null when it isn't an !mp command Bancho answers.
export function banchoReply(line: string, mapName: MapLookup): string | null {
	const m = /^!mp\s+(\w+)\s*(.*)$/i.exec(line.trim());
	if (!m) return null;
	const command = m[1].toLowerCase();
	const args = m[2].trim();
	switch (command) {
		case "timer": {
			const sec = Number.parseInt(args, 10);
			return `Countdown ends in ${duration(Number.isFinite(sec) && sec > 0 ? sec : 30)}`;
		}
		case "aborttimer":
			return "Countdown aborted";
		case "map": {
			const id = Number.parseInt(args, 10);
			if (!Number.isFinite(id)) return null;
			return `Changed beatmap to ${mapName(id) ?? `https://osu.ppy.sh/b/${id}`}`;
		}
		case "mods": {
			const list = args.toLowerCase().split(/[\s,]+/).filter(Boolean);
			const free = list.includes("freemod");
			const names = list.filter((x) => x !== "freemod").map((x) => MODS[x]).filter(Boolean);
			if (!names.length && !free) return "Disabled all mods, disabled FreeMod";
			const text = [names.length ? `Enabled ${names.join(", ")}` : "", free ? "enabled FreeMod" : "disabled FreeMod"].filter(Boolean).join(", ");
			return text[0].toUpperCase() + text.slice(1);
		}
		case "start": {
			const sec = Number.parseInt(args, 10);
			return Number.isFinite(sec) && sec > 0 ? `Queued the match to start in ${duration(sec)}` : "The match has started!";
		}
		case "abort":
			return "Aborted the match";
		case "close":
			return "Closed the match";
		case "invite":
			return args ? `Invited ${args} to the room` : null;
		case "kick":
			return args ? `Kicked ${args} from the match.` : null;
		case "host":
			return args ? `Changed match host to ${args}` : null;
		case "set": {
			// !mp set <teammode> [<scoremode>] [<size>]
			const [team, score, size] = args.split(/\s+/).map((x) => Number.parseInt(x, 10));
			const TEAM_MODES = ["HeadToHead", "TagCoop", "TeamVs", "TagTeamVs"];
			const SCORE_MODES = ["Score", "Accuracy", "Combo", "ScoreV2"];
			if (!TEAM_MODES[team]) return null;
			const parts = [Number.isFinite(size) ? `${size} slots` : "", TEAM_MODES[team], SCORE_MODES[score] ?? ""].filter(Boolean);
			return `Changed match settings to ${parts.join(", ")}`;
		}
		case "addref":
			return args ? `Added ${args} to the match referees` : null;
		case "removeref":
			return args ? `Removed ${args} from the match referees` : null;
		case "clearhost":
			return "Cleared match host";
		case "password":
			return args ? "Changed the match password" : "Removed the match password";
		case "lock":
			return "Locked the match";
		case "unlock":
			return "Unlocked the match";
		default:
			return null;
	}
}

// A real BanchoBot answer to a command, as opposed to its "Match history" line.
export const isBanchoReply = (text: string) =>
	/^(countdown|changed beatmap|enabled |disabled all mods|queued the match|the match has|aborted the match|closed the match|(un)?locked the match|invited |kicked |added .* to the match referees|removed .* from the match referees|changed match host|changed match settings|cleared match host|(changed|removed) the match password)/i.test(text.trim());
