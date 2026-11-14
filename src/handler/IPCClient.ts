import type { Callback } from "./TosuEngine";
import type ZEngine from "./TosuEngine";

export default class IPCClient {
	idx: number;
	engine: ZEngine;
	callbacks: {
		key: string,
		callback: Callback
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
	// slider breaks as tosu counts them, and whether tosu sends them at all
	sb = 0;
	hasSb = false;
	mods = 0;

	prevCombo = 0;
	prevH0 = 0;
	sliderbreaks = 0;

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
		["gameplay.hits.sliderBreaks", "sb"],
		["gameplay.mods.num", "mods"]
	]

	constructor(engine: ZEngine, idx: number) {
		this.engine = engine;
		this.idx = idx;

		this.callbacks = IPCClient.VALUE_MAP.map(([ key, id ]) => {
			const fullKey = `tourney.ipcClients.${this.idx}.${key}`;
			// biome-ignore lint/suspicious/noExplicitAny: Var unused
			const callback = (_: any, newValue: string | number | number[], data: any) => this.updateValue(id, newValue, data);
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

	updateValue(key: string, value: string | number | number[], data?: any) {
		if (key === "currentCombo") {
			const combo = Number(value);
			// Slider break: the combo dropped and no miss came with it. The miss
			// count is read from this same frame: tosu's keys are seen one by one
			// and the combo comes before the misses, so comparing with the miss
			// count already stored took every miss for a slider break.
			const misses = Number(data?.tourney?.ipcClients?.[this.idx]?.gameplay?.hits?.[0] ?? this.h0) || 0;
			if (combo < this.prevCombo && this.prevCombo > 0 && misses <= this.prevH0) this.sliderbreaks++;
			this.prevCombo = combo;
			this.prevH0 = misses;
		} else if (key === "sb") {
			this.hasSb = value !== undefined && value !== null;
		} else if (key === "score" && Number(value) === 0) {
			// Map restart or new match reset
			this.sliderbreaks = 0;
			this.prevCombo = 0;
			this.prevH0 = 0;
		}

		(this as unknown as Record<string, unknown>)[key] = value;
	}
}
