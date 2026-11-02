// Where remote control lives. An empty RELAY_URL means no relay, and the panel
// doesn't offer it. The relay is relay/ in this repo.
export const RELAY_URL = "wss://rempalago-relay.rempalago-relay.workers.dev";
export const PANEL_URL = "https://panel.aegleworks.com";

export const relayRoom = (relay: string, room: string) => `${relay}/room/${room}`;
// The form of an access code that gets hashed into its room.
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, "");

export interface RemoteStatus {
	type: "remote_status";
	// the bridge's own, for the panel to compare with its own
	version: string;
	// false when this build has no relay to talk to
	available: boolean;
	on: boolean;
	// the bridge is talking to the relay right now
	online: boolean;
	code: string;
	link: string;
	panels: number;
}
