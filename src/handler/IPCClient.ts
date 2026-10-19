import type ZEngine from "@fukutotojido/z-engine";

export default class IPCClient {
	idx: number;
	engine: ZEngine;
	callbacks: {
		key: string,
		callback: (key: string, value: string | number) => void
	}[] = [];

	team = "";
	name = "";
	score = 0;
	accuracy = 0;
	currentCombo = 0;
	maxCombo = 0;
	h0 = 0;
	h50 = 0;
	h100 = 0;
	h300 = 0;
	grade = "SS";
	UR = 0;
	mods = 0;

	static VALUE_MAP = [
		["team", "team"],
		["gameplay.name", "name"],
		["gameplay.score", "score"],
		["gameplay.accuracy", "accuracy"],
		["gameplay.combo.current", "currentCombo"],
		["gameplay.combo.max", "maxCombo"],
		["gameplay.hits.0", "h0"],
		["gameplay.hits.50", "h50"],
		["gameplay.hits.100", "h100"],
		["gameplay.hits.300", "h300"],
		["gameplay.hits.grade.current", "grade"],
		["gameplay.hits.unstableRate", "UR"],
		["gameplay.mods.num", "mods"]
	]

	constructor(engine: ZEngine, idx: number) {
		this.engine = engine;
		this.idx = idx;

		this.callbacks = IPCClient.VALUE_MAP.map(([ key, id ]) => {
			const fullKey = `tourney.ipcClients.${this.idx}.${key}`;
			// biome-ignore lint/suspicious/noExplicitAny: Var unused
			const callback = (_: any, newValue: string | number) => this.updateValue(id, newValue);
			engine.register(fullKey, callback);

			return {
				key: fullKey,
				callback
			};
		});
	}

	destruct() {
		for (const { key, callback } of this.callbacks) {
			this.engine.unregister(key, callback);
		}
	}

	updateValue(key: string, value: string | number) {
		(this as unknown as Record<string, string | number>)[key] = value;
	}
}
