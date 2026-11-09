// Twitch profile pictures, badges and live status without a token, from IVR's
// public API (api.ivr.fi, CORS open). Lookups made within a short window go
// out as one request; answers are cached for the session.
const API = "https://api.ivr.fi/v2/twitch";
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
type IvrBadgeSet = { set_id: string; versions: { id: string; image_url_2x: string }[] };

const toUser = (u: IvrUser): TwitchUser => ({
	id: u.id,
	login: u.login,
	displayName: u.displayName || u.login,
	// the CDN serves the same picture at 70x70, plenty for a chat line
	logo: (u.logo || "").replace(/-\d+x\d+(\.\w+)$/, "-70x70$1"),
	live: Boolean(u.stream),
});

async function fetchUsers(key: "id" | "login", values: string[]): Promise<TwitchUser[]> {
	const res = await fetch(`${API}/user?${key}=${values.map(encodeURIComponent).join(",")}`);
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

const badgeSets = new Map<string, Promise<Map<string, string>>>();

// One badge catalogue, as "set/version" to picture.
function badgeSet(path: string): Promise<Map<string, string>> {
	let known = badgeSets.get(path);
	if (!known) {
		known = fetch(`${API}/badges/${path}`)
			.then(async (res) => {
				if (!res.ok) throw new Error(`IVR ${res.status}`);
				const sets = (await res.json()) as IvrBadgeSet[];
				return new Map(sets.flatMap((set) => set.versions.map((v) => [`${set.set_id}/${v.id}`, v.image_url_2x] as const)));
			})
			.catch(() => {
				// let a later line try again
				badgeSets.delete(path);
				return new Map<string, string>();
			});
		badgeSets.set(path, known);
	}
	return known;
}

// The pictures of a chatter's badges, in the order Twitch sends them. A
// channel's own (sub months, cheers) win over the global ones of the same name.
export async function chatBadges(channel: string, keys: string[]): Promise<string[]> {
	if (!keys.length) return [];
	const [global, own] = await Promise.all([badgeSet("global"), badgeSet(`channel?login=${encodeURIComponent(channel)}`)]);
	return keys.flatMap((key) => own.get(key) ?? global.get(key) ?? []);
}

// Channels by login, for the panel's picker: name, picture, live or not.
export async function channels(logins: string[]): Promise<TwitchUser[]> {
	if (!logins.length) return [];
	return fetchUsers("login", logins);
}
