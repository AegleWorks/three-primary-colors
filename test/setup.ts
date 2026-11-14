// The few browser globals the overlay's plain modules touch on import or in
// the functions under test. Not a DOM: anything that renders is tested in OBS.
const store = new Map<string, string>();
const storage = {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => void store.set(k, String(v)),
	removeItem: (k: string) => void store.delete(k),
	clear: () => store.clear(),
};
const body = { dataset: {} as Record<string, string> };
Object.assign(globalThis, {
	location: { search: "", pathname: "/", href: "http://127.0.0.1:24050/vcl-overlay/" },
	localStorage: storage,
	sessionStorage: storage,
	document: {
		body,
		documentElement: { classList: { contains: () => false, add() {} } },
		querySelector: () => null,
		querySelectorAll: () => [],
	},
});
