import { afterEach, describe, expect, test } from "bun:test";
import IPCClient from "../src/handler/IPCClient";
import TosuEngine from "../src/handler/TosuEngine";
import { guardEngine } from "../src/handler/guardEngine";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A stand-in tosu: a WebSocket server that sends what the test tells it to.
function fakeTosu(port: number) {
	const sockets = new Set<import("bun").ServerWebSocket<unknown>>();
	const server = Bun.serve({
		port,
		fetch(req, srv) {
			return srv.upgrade(req) ? undefined : new Response("no", { status: 400 });
		},
		websocket: {
			open: (ws) => void sockets.add(ws),
			close: (ws) => void sockets.delete(ws),
			message() {},
		},
	});
	return {
		send: (data: unknown) => {
			for (const ws of sockets) ws.send(typeof data === "string" ? data : JSON.stringify(data));
		},
		clients: () => sockets.size,
		stop: () => server.stop(true),
	};
}

const servers: { stop: () => void }[] = [];
afterEach(() => {
	for (const s of servers.splice(0)) s.stop();
});

describe("TosuEngine", () => {
	test("fires a key only when its value changes, with (old, new, data)", () => {
		const engine = Object.create(TosuEngine.prototype) as TosuEngine;
		Object.assign(engine, { cache: {}, entries: new Map() });
		const calls: unknown[][] = [];
		engine.register("menu.bm.id", (...args) => calls.push(args));
		engine.update({ menu: { bm: { id: 1 } } });
		engine.update({ menu: { bm: { id: 1 } } });
		engine.update({ menu: { bm: { id: 2 } } });
		expect(calls.map((c) => [c[0], c[1]])).toEqual([
			[undefined, 1],
			[1, 2],
		]);
	});

	test("junk payloads (null, arrays, primitives, missing branches) never throw", () => {
		const engine = Object.create(TosuEngine.prototype) as TosuEngine;
		Object.assign(engine, { cache: {}, entries: new Map() });
		engine.register("tourney.ipcClients.0.gameplay.score", () => {});
		engine.register("menu.bm.time.current", () => {});
		for (const junk of [null, undefined, 0, "", [], [1, 2], { menu: null }, { menu: { bm: 5 } }, { tourney: { ipcClients: null } }, { tourney: { ipcClients: [null] } }]) {
			expect(() => engine.update(junk)).not.toThrow();
		}
	});

	test("reconnects after tosu dies, without doubling its listeners", async () => {
		const port = 24991;
		let tosu = fakeTosu(port);
		servers.push(tosu);
		const engine = new TosuEngine(`ws://127.0.0.1:${port}/ws`);
		const seen: number[] = [];
		engine.register("menu.bm.id", (_, v) => seen.push(v));
		await wait(300);
		tosu.send({ menu: { bm: { id: 1 } } });
		await wait(100);
		tosu.stop();
		await wait(300);
		expect(engine.connected).toBe(false);
		tosu = fakeTosu(port);
		servers.push(tosu);
		await wait(2500);
		expect(engine.connected).toBe(true);
		expect(tosu.clients()).toBe(1);
		tosu.send({ menu: { bm: { id: 2 } } });
		tosu.send({ menu: { bm: { id: 2 } } });
		await wait(100);
		// one callback per change: the reconnect didn't add a second socket or listener
		expect(seen).toEqual([1, 2]);
	}, 10_000);

	test("a malformed frame is skipped and the next one still lands", async () => {
		const port = 24992;
		const tosu = fakeTosu(port);
		servers.push(tosu);
		const engine = new TosuEngine(`ws://127.0.0.1:${port}/ws`);
		const seen: number[] = [];
		engine.register("menu.bm.id", (_, v) => seen.push(v));
		await wait(300);
		tosu.send("{not json");
		tosu.send({ menu: { bm: { id: 7 } } });
		await wait(100);
		expect(seen).toEqual([7]);
		expect(engine.connected).toBe(true);
	});

	test("starting before tosu is up: connects once tosu appears", async () => {
		const port = 24993;
		const engine = new TosuEngine(`ws://127.0.0.1:${port}/ws`);
		await wait(800);
		expect(engine.connected).toBe(false);
		const tosu = fakeTosu(port);
		servers.push(tosu);
		await wait(3000);
		expect(engine.connected).toBe(true);
	}, 10_000);
});

describe("guardEngine: one failing callback must not deafen the rest", () => {
	test("later keys still fire and the cache still moves on", () => {
		const engine = Object.create(TosuEngine.prototype) as TosuEngine;
		Object.assign(engine, { cache: {}, entries: new Map() });
		guardEngine(engine, "test");
		const seen: number[] = [];
		const error = console.error;
		console.error = () => {};
		try {
			engine.register("a", () => {
				throw new Error("bad value");
			});
			engine.register("b", (_, v) => seen.push(v));
			engine.update({ a: 1, b: 1 });
			engine.update({ a: 2, b: 2 });
		} finally {
			console.error = error;
		}
		expect(seen).toEqual([1, 2]);
		expect(engine.cache).toEqual({ a: 2, b: 2 });
	});

	test("unregister removes the guarded callback", () => {
		const engine = Object.create(TosuEngine.prototype) as TosuEngine;
		Object.assign(engine, { cache: {}, entries: new Map() });
		guardEngine(engine);
		const seen: number[] = [];
		const cb = (_: unknown, v: number) => seen.push(v);
		engine.register("a", cb);
		engine.update({ a: 1 });
		engine.unregister("a", cb);
		engine.update({ a: 2 });
		expect(seen).toEqual([1]);
	});
});

describe("stress: a long map of score frames", () => {
	test("1,000 frames for two clients end on the last values, fast", () => {
		const engine = Object.create(TosuEngine.prototype) as TosuEngine;
		Object.assign(engine, { cache: {}, entries: new Map() });
		const clients = [0, 1].map((i) => new IPCClient(engine, i));
		const t0 = performance.now();
		for (let f = 1; f <= 1000; f++) {
			engine.update({
				tourney: {
					ipcClients: [0, 1].map((i) => ({
						team: i ? "right" : "left",
						gameplay: { score: f * 1000 + i, accuracy: 99 - i, combo: { current: f, max: f }, hits: { 0: 0, 50: 0, 100: i, 300: f } },
					})),
				},
			});
		}
		const ms = performance.now() - t0;
		expect(clients[0].score).toBe(1_000_000);
		expect(clients[1].score).toBe(1_000_001);
		expect(clients[1].maxCombo).toBe(1000);
		expect(clients[0].team).toBe("left");
		// 1,000 frames is ~16 s of tosu at 60 fps; this must be far below a frame each
		expect(ms).toBeLessThan(500);
		console.log(`    1,000 frames x 2 clients: ${ms.toFixed(1)} ms`);
	});

	test("a slider break is counted once, a miss is not a slider break", () => {
		const engine = Object.create(TosuEngine.prototype) as TosuEngine;
		Object.assign(engine, { cache: {}, entries: new Map() });
		const c = new IPCClient(engine, 0);
		const frame = (combo: number, miss: number, score: number) =>
			engine.update({ tourney: { ipcClients: [{ gameplay: { score, combo: { current: combo }, hits: { 0: miss } } }] } });
		frame(50, 0, 1000);
		frame(0, 0, 1100); // combo lost, no miss: slider break
		frame(10, 0, 1200);
		frame(0, 1, 1300); // combo lost with a miss
		expect(c.sliderbreaks).toBe(1);
	});

	test("tosu's own slider-break count, 0 included, is known as sent", () => {
		const engine = Object.create(TosuEngine.prototype) as TosuEngine;
		Object.assign(engine, { cache: {}, entries: new Map() });
		const c = new IPCClient(engine, 0);
		expect(c.hasSb).toBe(false);
		engine.update({ tourney: { ipcClients: [{ gameplay: { hits: { sliderBreaks: 0 } } }] } });
		expect(c.hasSb).toBe(true);
		expect(c.sb).toBe(0);
	});
});
