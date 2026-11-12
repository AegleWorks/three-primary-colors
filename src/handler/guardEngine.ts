import type ZEngine from "@fukutotojido/z-engine";

// z-engine runs every registered callback in one loop with no try/catch, and
// only saves the new data once the loop is done. A callback that throws cuts
// the loop short (the keys after it, such as the map and the lobby chat, are
// never seen) and leaves the cache as it was, so the same callback throws
// again on every message: one bad value from tosu leaves the whole overlay
// deaf. This wraps each callback so a failure stays with its own key.
//
// Each key's error is logged once, and again only if a different error turns
// up, so a value that keeps failing doesn't flood the console (OBS writes
// every console error to its log).
export function guardEngine(engine: ZEngine, name = "tosu"): ZEngine {
	const wrapped = new WeakMap<object, (...args: unknown[]) => void>();
	const reported = new Map<string, string>();
	const register = engine.register.bind(engine);
	const unregister = engine.unregister.bind(engine);

	engine.register = ((key: string, callback: (...args: unknown[]) => void) => {
		const safe = (...args: unknown[]) => {
			try {
				callback(...args);
			} catch (e) {
				const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
				if (reported.get(key) === text) return;
				reported.set(key, text);
				console.error(`[${name}] "${key}" failed; the rest keeps going:`, e);
			}
		};
		wrapped.set(callback, safe);
		register(key, safe);
		return callback;
	}) as ZEngine["register"];

	engine.unregister = ((key: string, callback: (...args: unknown[]) => void) => {
		unregister(key, wrapped.get(callback) ?? callback);
		wrapped.delete(callback);
	}) as ZEngine["unregister"];

	return engine;
}
