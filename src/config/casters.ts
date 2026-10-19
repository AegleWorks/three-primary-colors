export interface CasterProfileMapping {
	/**
	 * osu! User ID (number or numeric string).
	 * If provided, loads avatar from `https://a.ppy.sh/${osuId}`.
	 */
	osuId?: number | string;

	/**
	 * Display name override (e.g., their official osu! in-game username).
	 */
	osuName?: string;

	/**
	 * Optional custom avatar URL override (takes precedence over Discord and osu!).
	 */
	avatarUrl?: string;
}

/**
 * Mapping of Discord Snowflake IDs -> osu! / Custom Caster Profile.
 *
 * Commentators in Discord voice will automatically have their profile replaced
 * with their osu! identity if listed here. Unmapped commentators will cleanly
 * fall back to their Discord avatar and display name.
 */
export const DISCORD_TO_CASTER_MAP: Record<string, CasterProfileMapping> = {
	// Example:
	// "852623132304998471": { osuName: "hxovc", osuId: 123456 },
};

/**
 * Resolves caster profile considering URL overrides, static configuration, and Discord defaults.
 */
export function resolveCasterProfile(discordUser: {
	id: string;
	username?: string;
	displayName?: string;
	avatarUrl?: string;
}): { name: string; avatarUrl: string; osuId?: string | number } {
	const mapping = DISCORD_TO_CASTER_MAP[discordUser.id];

	// Check for URL overrides: ?osu_<discordId>=<osuId> or ?map_<discordId>=<osuId>
	let urlOsuId: string | null = null;
	let urlOsuName: string | null = null;

	if (typeof window !== "undefined" && window.location) {
		try {
			const params = new URLSearchParams(window.location.search);
			urlOsuId = params.get(`osu_${discordUser.id}`) || params.get(`map_${discordUser.id}`);
			urlOsuName = params.get(`name_${discordUser.id}`);
		} catch {
			// Ignore URL parse errors
		}
	}

	const resolvedOsuId = urlOsuId || mapping?.osuId;
	const resolvedName =
		urlOsuName ||
		mapping?.osuName ||
		discordUser.displayName ||
		discordUser.username ||
		"Commentator";

	let resolvedAvatar = discordUser.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";

	if (mapping?.avatarUrl) {
		resolvedAvatar = mapping.avatarUrl;
	} else if (resolvedOsuId) {
		resolvedAvatar = `https://a.ppy.sh/${resolvedOsuId}`;
	}

	return {
		name: resolvedName,
		avatarUrl: resolvedAvatar,
		osuId: resolvedOsuId,
	};
}
