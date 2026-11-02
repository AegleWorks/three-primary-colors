import { normalizeCode, relayRoom, RELAY_URL } from "../config/remote";

// The panel as a remote operator gets it (vite --mode remote, published at
// PANEL_URL): the same panel, reaching the overlay through the relay. It asks
// for the access code first. The link the bridge hands out carries the code
// after the #, which never reaches a server.
export const REMOTE = import.meta.env.MODE === "remote";
const RELAY = import.meta.env.VITE_RELAY_URL || RELAY_URL;
const SAVED = "rempalago-remote-code";
const REFUSED = "rempalago-remote-refused";

const MESSAGES: Record<number, string> = {
	4404: "Ese código no existe o ya no sirve. Pídele uno nuevo a quien transmite.",
	4409: "Ya hay demasiados paneles conectados.",
	4410: "Quien transmite cortó el acceso remoto.",
};

async function roomOf(code: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeCode(code)));
	const room = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
	return `${relayRoom(RELAY, room)}?role=panel`;
}

function saved(key: string, value?: string | null) {
	try {
		if (value === null) sessionStorage.removeItem(key);
		else if (value !== undefined) sessionStorage.setItem(key, value);
		return sessionStorage.getItem(key) ?? "";
	} catch {
		return "";
	}
}

// Back to the code screen, saying why.
export function refused(code: number) {
	saved(SAVED, null);
	saved(REFUSED, String(code));
	location.reload();
}

// The address of the room, once there's a code for it.
export function askForRoom(): Promise<string> {
	const gate = document.querySelector<HTMLFormElement>("#remoteGate")!;
	const input = document.querySelector<HTMLInputElement>("#remoteCode")!;
	document.body.dataset.gate = "";
	const fromLink = decodeURIComponent(location.hash.slice(1));
	if (fromLink) {
		saved(SAVED, fromLink);
		history.replaceState(null, "", location.pathname);
	}
	const code = saved(SAVED);
	const open = (value: string) => {
		delete document.body.dataset.gate;
		return roomOf(value);
	};
	if (code) return open(code);

	// the link pasted into this same tab: a new # doesn't reload the page by itself
	window.addEventListener("hashchange", () => location.reload());
	const why = Number(saved(REFUSED));
	saved(REFUSED, null);
	document.querySelector("#remoteError")!.textContent = MESSAGES[why] ?? "";
	input.focus();
	return new Promise((resolve) => {
		gate.addEventListener("submit", (event) => {
			event.preventDefault();
			if (normalizeCode(input.value).length < 12) return;
			saved(SAVED, input.value);
			resolve(open(input.value));
		});
	});
}
