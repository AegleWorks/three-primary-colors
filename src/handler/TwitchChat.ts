// Read-only Twitch chat over the IRC WebSocket, joined as an anonymous viewer
// (a "justinfan" nick), so the overlay needs no token. Reconnects on drop.
export type TwitchMessage = { who: string; color: string; msg: string };

export default class TwitchChat {
	constructor(
		private channel: string,
		private onMessage: (message: TwitchMessage) => void,
	) {
		this.connect();
	}

	private connect() {
		const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
		ws.onopen = () => {
			ws.send("CAP REQ :twitch.tv/tags");
			ws.send("PASS SCHMOOPIIE");
			ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
			ws.send(`JOIN #${this.channel.toLowerCase()}`);
		};
		ws.onmessage = (event) => {
			for (const line of String(event.data).split("\r\n")) {
				if (line.startsWith("PING")) ws.send(line.replace("PING", "PONG"));
				else this.parse(line);
			}
		};
		ws.onclose = () => setTimeout(() => this.connect(), 5000);
		ws.onerror = () => ws.close();
	}

	// @tags :nick!nick@nick.tmi.twitch.tv PRIVMSG #channel :message
	private parse(line: string) {
		const match = line.match(/^@(\S+) :([^!]+)!\S+ PRIVMSG #\S+ :(.*)$/);
		if (!match) return;
		const [, rawTags, nick, msg] = match;
		const tags = Object.fromEntries(rawTags.split(";").map((pair) => pair.split("=") as [string, string]));
		this.onMessage({ who: tags["display-name"] || nick, color: tags.color || "", msg });
	}
}
