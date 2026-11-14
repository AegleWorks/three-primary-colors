import { beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { clock, goTo, onEvent, setTransition } from "../src/oro/stage.js";
import { installOverlay } from "../src/server/updater";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("map clock: the end of the map is seen once", () => {
	const events: string[] = [];
	onEvent((type: string) => {
		if (type === "end" || type === "start") events.push(type);
	});
	beforeEach(() => {
		events.length = 0;
	});

	test("crossing the length ends the map once, however many frames follow", () => {
		clock(0, 0);
		clock(5, 100);
		clock(99, 100);
		clock(100, 100);
		clock(101, 100);
		clock(150, 100);
		expect(events.filter((e) => e === "end")).toHaveLength(1);
	});

	test("time running back is a new map, which can end again", () => {
		clock(10, 100);
		expect(events).toContain("start");
		clock(100, 100);
		expect(events.filter((e) => e === "end")).toHaveLength(1);
	});
});

describe("goTo: scene changes during the stinger", () => {
	const body = (globalThis as unknown as { document: { body: { dataset: Record<string, string> } } }).document.body;

	test("the latest scene asked for mid-stinger is where it lands", async () => {
		body.dataset.scene = "mappool";
		setTransition(async (swap: () => void) => {
			await wait(50);
			swap();
			await wait(50);
		});
		const first = goTo("gameplay");
		goTo("result");
		goTo("champion");
		await first;
		await wait(250);
		expect(body.dataset.scene).toBe("champion");
	});

	test("a stinger that throws still shows the scene", async () => {
		body.dataset.scene = "mappool";
		const warn = console.warn;
		console.warn = () => {};
		setTransition(async () => {
			throw new Error("animation failed");
		});
		try {
			await goTo("gameplay");
		} finally {
			console.warn = warn;
		}
		expect(body.dataset.scene).toBe("gameplay");
	});

	test("a stinger that never finishes doesn't lock scene changes forever", async () => {
		body.dataset.scene = "mappool";
		setTransition(() => new Promise(() => {}));
		await goTo("gameplay");
		expect(body.dataset.scene).toBe("gameplay");
		setTransition(null);
		await goTo("result");
		expect(body.dataset.scene).toBe("result");
	}, 10_000);
});

describe("updater: the overlay folder is swapped whole", () => {
	const make = (root: string, files: Record<string, string>) => {
		for (const [rel, text] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			fs.writeFileSync(path.join(root, rel), text);
		}
	};
	const read = (p: string) => fs.readFileSync(p, "utf8");

	test("new files in, old assets out, the organiser's data.json and extra files kept", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempalago-"));
		const staged = path.join(root, ".rempalago-update");
		make(root, {
			"static/vcl-overlay/index.html": "old",
			"static/vcl-overlay/assets/old-123.js": "old",
			"static/vcl-overlay/data.json": '{"mine":true}',
			"static/vcl-overlay/notes.txt": "kept",
		});
		make(staged, {
			"static/vcl-overlay/index.html": "new",
			"static/vcl-overlay/assets/new-456.js": "new",
			"static/vcl-overlay/data.json": '{"default":true}',
		});
		installOverlay(root, staged);
		const live = path.join(root, "static", "vcl-overlay");
		expect(read(path.join(live, "index.html"))).toBe("new");
		expect(fs.existsSync(path.join(live, "assets", "new-456.js"))).toBe(true);
		expect(fs.existsSync(path.join(live, "assets", "old-123.js"))).toBe(false);
		expect(read(path.join(live, "data.json"))).toBe('{"mine":true}');
		expect(read(path.join(live, "notes.txt"))).toBe("kept");
		expect(fs.existsSync(path.join(root, "static", "vcl-overlay.old"))).toBe(false);
		expect(fs.existsSync(path.join(root, "static", "vcl-overlay.new"))).toBe(false);
		fs.rmSync(root, { recursive: true, force: true });
	});

	test("a first install takes the zip's data.json", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "rempalago-"));
		const staged = path.join(root, ".rempalago-update");
		make(staged, { "static/vcl-overlay/index.html": "new", "static/vcl-overlay/data.json": '{"default":true}' });
		installOverlay(root, staged);
		expect(read(path.join(root, "static", "vcl-overlay", "data.json"))).toBe('{"default":true}');
		fs.rmSync(root, { recursive: true, force: true });
	});
});
