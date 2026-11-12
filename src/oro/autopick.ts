// Whether a pool map that comes up in osu! is a pick, and whose. Pure, so it
// can be checked against what happens in a real lobby (see LiveOro.readMap).

export type Side = "l" | "r";
export type Pick = { id: string; by: Side; won: Side | null };

export interface AutoPickContext {
	// the tournament manager is open (not a normal osu! in song select)
	inLobby: boolean;
	// the referee asked for a map with "!mp map" moments ago
	asked: boolean;
	// the lobby has been there a few seconds (not just joined or reconnected)
	settled: boolean;
	// the overlay's own last pick, while nobody has played it
	autoPick: { id: string; by: Side } | null;
	// who picks next when nothing else says
	nextPicker: Side;
}

// The picks after `slot` came up, and the new automatic pick; null when the
// map is no pick (not in a lobby, the lobby's own map, banned, already picked,
// the TB).
export function decidePick(picks: Pick[], bans: Record<string, Side>, slot: string, ctx: AutoPickContext): { picks: Pick[]; autoPick: { id: string; by: Side } } | null {
	if (!slot || slot === "TB" || bans[slot] || picks.some((p) => p.id === slot)) return null;
	if (!ctx.inLobby || !(ctx.asked || ctx.settled)) return null;
	// an automatic pick nobody played yet gives way to this one, same side
	const auto = ctx.autoPick;
	const prev = auto ? picks.find((p) => p.id === auto.id && p.by === auto.by && !p.won) : undefined;
	const by = prev ? prev.by : ctx.nextPicker;
	return { picks: [...picks.filter((p) => p !== prev), { id: slot, by, won: null }], autoPick: { id: slot, by } };
}
