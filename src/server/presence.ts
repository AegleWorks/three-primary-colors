// Which overlays are connected to the bridge, by their socket. A socket that
// closes (the page reloaded or closed, OBS shut, the source removed) is that
// overlay gone, said at once to the panels and the other overlays, instead of
// each of them waiting ten seconds without its heartbeat. The ten seconds stay
// for what closes no socket: a frozen page, a machine that hung.

export class OverlayPresence<Socket> {
	private bySocket = new Map<Socket, { id: string; raw: string }>();

	// An overlay's state came over this socket.
	stated(socket: Socket, id: string, raw: string) {
		if (!id) return;
		this.bySocket.set(socket, { id, raw });
	}

	// The socket closed: the id of the overlay that is gone with it, or null
	// when it wasn't an overlay, or when the same overlay is still connected
	// on another socket (a reload whose new page spoke before the old socket
	// finished closing).
	closed(socket: Socket): string | null {
		const was = this.bySocket.get(socket);
		this.bySocket.delete(socket);
		if (!was) return null;
		for (const other of this.bySocket.values()) if (other.id === was.id) return null;
		return was.id;
	}

	// The last state of every overlay connected now, for a panel that joins:
	// all of them, so it knows at once there are two, and none that is gone.
	states(): string[] {
		const latest = new Map<string, string>();
		for (const { id, raw } of this.bySocket.values()) latest.set(id, raw);
		return [...latest.values()];
	}
}
