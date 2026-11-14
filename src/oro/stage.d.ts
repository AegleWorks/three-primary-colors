// Types for the parts of the Oro runtime (stage.js) used from TypeScript.

export type SceneName = "starting" | "intro" | "showcase" | "mappool" | "gameplay" | "result" | "champion" | "qualifiers" | BattleScene;
// the Battle Royale event's own scenes (battle.ts)
export type BattleScene = "br-lobby" | "br-pool" | "br-gameplay" | "br-winner";
export type Side = "l" | "r";

export interface Pick {
	id: string;
	by: Side;
	won: Side | null;
}

export interface Draft {
	bans: Record<string, Side>;
	picks: Pick[];
	current: string | null;
	next?: Side;
	// winner of the tiebreaker, which nobody picks
	tbWon?: Side;
}

export interface PlayerNumbers {
	score: number;
	combo: number;
	maxCombo: number;
	acc: number;
	miss: number;
	n100: number;
	n50: number;
	sb?: number;
	ur?: number;
	// hit errors in ms (+ late), newest last
	errors?: number[];
}

export interface MatchState {
	t: number;
	length: number;
	score: Record<Side, number>;
	acc: Record<Side, number>;
	maxCombo: Record<Side, number>;
	miss: Record<Side, number>;
}

export const LIVE: boolean;
export const ROUNDS: Record<string, { name: string; bestOf: number }>;
// key "" and unset: no round picked yet (round-neutral copy on air)
export const ROUND: { key: string; name: string; bestOf: number; firstTo: number; unset: boolean };
export const MATCH: { stars: Record<Side, number>; firstTo: number };
export const DRAFT: Draft;

export function fmt(n: number): string;
export function goTo(name: SceneName): Promise<void>;
// keeps the round picked in the panel across reloads (see stage.js)
export function saveRound(key: string): void;
export function onEvent(fn: (type: string, arg?: unknown) => void): void;
export function setSource(fn: (state: MatchState) => void): void;
export function liveState(): MatchState;
export function ingest(side: Side, numbers: PlayerNumbers): void;
export function clock(seconds: number, length: number): void;
