// The live entry points of the Oro broadcast (oro.js builds it on import).
import type { Side } from "./stage.js";

export interface PoolMap {
	id: string;
	beatmapId?: number;
	set: number;
	art?: string;
	artist: string;
	title: string;
	mapper: string;
	diff: string;
	sr: number;
	bpm: number;
	ar: number;
	od: number;
	cs: number;
	len: string;
}

export interface MapResult {
	score: number;
	acc: number;
	maxCombo: number;
	miss: number;
}

export type PersonKey = Side | "c0" | "c1" | "c2" | "c3";

export const oro: {
	setPerson(key: PersonKey, person: { name?: string; osuId?: number | string; avatar?: string }): void;
	setTalking(caster: number, on: boolean): void;
	timer(seconds: number | null): void;
	showCaster(caster: number, on: boolean): void;
	setChatMode(mode: "lobby" | "playing"): void;
	twitchLine(who: string, color: string, msg: string): void;
	chat(who: string, side: Side | "bot" | "ref", msg: string, time: string): void;
	setPlayerInfo(side: Side, info: { seed?: number; rank?: number; countryRank?: number; country?: string; pp?: number }): void;
	setPool(maps: PoolMap[]): void;
	draftChanged(): void;
	setCurrentMap(map: PoolMap): void;
	setStars(stars: Record<Side, number>): void;
	setResult(result: { winner: Side; stars: Record<Side, number>; l: MapResult; r: MapResult }): void;
};
