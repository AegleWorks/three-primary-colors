// Twitch profile pictures and live status without a token, from IVR's public
// API (api.ivr.fi, CORS open). Lookups made within a short window go out as
// one request; answers are cached for the session.
const API = "https://api.ivr.fi/v2/twitch/user";
const BATCH_MS = 300;
const BATCH_MAX = 50;

export interface TwitchUser {
	id: string;
	login: string;
	displayName: string;
	logo: string;
	live: boolean;
}

type IvrUser = { id: string; login: string; displayName: string; logo: string; stream: unknown };

const toUser = (u: IvrUser): TwitchUser => ({
	id: u.id,
	login: u.login,
	displayName: u.displayName || u.login,
	// the CDN serves the same picture at 70x70, plenty for a chat line
	logo: (u.logo || "").replace(/-\d+x\d+(\.\w+)$/, "-70x70$1"),
	live: Boolean(u.stream),
});

async function fetchUsers(key: "id" | "login", values: string[]): Promise<TwitchUser[]> {
	const res = await fetch(`${API}?${key}=${values.map(encodeURIComponent).join(",")}`);
	if (!res.ok) throw new Error(`IVR ${res.status}`);
	return ((await res.json()) as IvrUser[]).map(toUser);
}

const avatars = new Map<string, Promise<string | null>>();
const queue = new Map<string, (logo: string | null) => void>();
let timer = 0;

// A chatter's picture by user id, or null when there is none to show.
export function avatar(userId: string): Promise<string | null> {
	if (!userId) return Promise.resolve(null);
	let known = avatars.get(userId);
	if (!known) {
		known = new Promise((resolve) => queue.set(userId, resolve));
		avatars.set(userId, known);
		if (!timer) timer = window.setTimeout(flush, BATCH_MS);
	}
	return known;
}

async function flush() {
	timer = 0;
	const batch = [...queue].slice(0, BATCH_MAX);
	for (const [id] of batch) queue.delete(id);
	if (queue.size) timer = window.setTimeout(flush, BATCH_MS);
	let users: TwitchUser[] = [];
	try {
		users = await fetchUsers("id", batch.map(([id]) => id));
	} catch {
		// let a later line try again
		for (const [id] of batch) avatars.delete(id);
	}
	for (const [id, resolve] of batch) resolve(users.find((u) => u.id === id)?.logo || null);
}

// Channels by login, for the panel's picker: name, picture, live or not.
export async function channels(logins: string[]): Promise<TwitchUser[]> {
	if (!logins.length) return [];
	return fetchUsers("login", logins);
}
