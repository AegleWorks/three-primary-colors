// Which overlay runs the match when more than one is open. The one in OBS is
// what goes on air, so it always leads. An overlay outside OBS (a browser tab:
// the overlay opened from tosu's dashboard, or its URL pasted) leads only while
// no OBS overlay is around; once one is heard on the bridge, the tab becomes a
// mirror of it: it shows the OBS overlay's draft and series, makes no picks,
// marks no winners, saves nothing and stays off the wire, so the panel, the
// remote panels and the bridge only ever see the OBS overlay's state.
//
// Two overlays in OBS are both leaders: OBS can't tell which one is on air
// (the panel warns about that case).

export interface Heard {
	id: string;
	obs: boolean;
}

// An OBS overlay sends its state at least every 4 s (its heartbeat); this long
// without one, it is gone and the tab leads again. The bridge says so sooner
// when the overlay's socket closes (closed, OBS shut): see gone(). The timeout
// is for what closes no socket (a frozen page, a machine that hung).
export const LEADER_GONE_MS = 10_000;

export class Leader {
	private obsSeen = new Map<string, number>();

	constructor(
		private self: Heard,
		private goneMs = LEADER_GONE_MS,
	) {}

	// Another overlay's state came over the bridge.
	heard(other: Heard, now: number) {
		if (other.id === this.self.id || !other.obs) return;
		this.obsSeen.set(other.id, now);
	}

	// The bridge saw that overlay's socket close: gone now, not in ten seconds.
	gone(id: string) {
		this.obsSeen.delete(id);
	}

	// True while this overlay should mirror an OBS overlay instead of leading.
	mirroring(now: number): boolean {
		if (this.self.obs) return false;
		for (const [id, at] of this.obsSeen) if (now - at > this.goneMs) this.obsSeen.delete(id);
		return this.obsSeen.size > 0;
	}
}
