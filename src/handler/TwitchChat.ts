// Read-only Twitch chat over the IRC WebSocket, joined as an anonymous viewer
// (a "justinfan" nick), so the overlay needs no token. One socket; switching
// channels parts the old one and joins the new. Reconnects on drop.
export type TwitchEmote = { id: string; start: number; end: number };
export type TwitchMessage = {
	channel: string;
	who: string;
	color: string;
	msg: string;
	userId: string;
	badges: string[];
	emotes: TwitchEmote[];
};
export type TwitchStatus = "connecting" | "joined";

// emotes=25:0-4,12-16/1902:6-10 is each emote and the characters it replaces;
// back in the order they appear in the message.
const parseEmotes = (tag = ""): TwitchEmote[] =>
	tag
		.split("/")
		.filter(Boolean)
		.flatMap((emote) => {
			const [id, spots] = emote.split(":");
			return spots.split(",").map((spot) => {
				const [start, end] = spot.split("-").map(Number);
				return { id, start, end };
			});
		})
		.sort((a, b) => a.start - b.start);

export default class TwitchChat {
	private ws: WebSocket | null = null;

	constructor(
		private channel: string,
		private onMessage: (message: TwitchMessage) => void,
		private onStatus: (status: TwitchStatus, channel: string) => void = () => {},
	) {
		this.connect();
	}

	get current() {
		return this.channel;
	}

	join(channel: string) {
		channel = channel.toLowerCase();
		if (channel === this.channel) return;
		const ws = this.ws;
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(`PART #${this.channel}`);
			ws.send(`JOIN #${channel}`);
		}
		this.channel = channel;
		this.onStatus("connecting", channel);
	}

	private connect() {
		this.channel = this.channel.toLowerCase();
		this.onStatus("connecting", this.channel);
		const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
		this.ws = ws;
		ws.onopen = () => {
			ws.send("CAP REQ :twitch.tv/tags");
			ws.send("PASS SCHMOOPIIE");
			ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
			ws.send(`JOIN #${this.channel}`);
		};
		ws.onmessage = (event) => {
			for (const line of String(event.data).split("\r\n")) {
				if (line.startsWith("PING")) ws.send(line.replace("PING", "PONG"));
				else this.parse(line);
			}
		};
		ws.onclose = () => {
			if (this.ws !== ws) return;
			this.onStatus("connecting", this.channel);
			setTimeout(() => this.connect(), 5000);
		};
		ws.onerror = () => ws.close();
	}

	// :justinfan123!justinfan123@justinfan123.tmi.twitch.tv JOIN #channel
	// @tags :nick!nick@nick.tmi.twitch.tv PRIVMSG #channel :message
	private parse(line: string) {
		const joined = line.match(/^:justinfan\d+!\S+ JOIN #(\S+)$/);
		if (joined) {
			if (joined[1] === this.channel) this.onStatus("joined", this.channel);
			return;
		}
		const match = line.match(/^@(\S+) :([^!]+)!\S+ PRIVMSG #(\S+) :(.*)$/);
		// lines from the channel just left can still arrive after a switch
		if (!match || match[3] !== this.channel) return;
		const [, rawTags, nick, , raw] = match;
		const tags = Object.fromEntries(rawTags.split(";").map((pair) => pair.split("=") as [string, string]));
		// a /me line is wrapped in \x01ACTION ...\x01; emote positions skip the wrapper
		const msg = raw.match(/^\x01ACTION (.*)\x01$/)?.[1] ?? raw;
		this.onMessage({
			channel: this.channel,
			who: tags["display-name"] || nick,
			color: tags.color || "",
			msg,
			userId: tags["user-id"] || "",
			badges: tags.badges?.split(",").filter(Boolean) ?? [],
			emotes: parseEmotes(tags.emotes),
		});
	}
}
