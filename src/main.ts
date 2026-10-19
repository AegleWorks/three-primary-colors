import ZEngine from "@fukutotojido/z-engine";
import BeatmapHandler from "./handler/BeatmapHandler";
import ChatHandler from "./handler/ChatHandler";
import GameStateHandler from "./handler/GameStateHandler";
import MappoolHandler from "./handler/MappoolHandler";
import ScoreHandler from "./handler/ScoreHandler";
import TeamHandler from "./handler/TeamHandler";
import OBSHandler from "./handler/OBSHandler";
import ResultHandler from "./handler/ResultHandler";
import Test from "./Test";

const engine = new ZEngine("ws://127.0.0.1:24050/ws");
const test = new Test(engine);

const beatmapHandler = new BeatmapHandler(engine, test);
const chatHandler = new ChatHandler(engine, test);
const teamHandler = new TeamHandler(engine, test);
const scoreHandler = new ScoreHandler(engine, test);
const gameStateHandler = new GameStateHandler(engine, test);
const obsHandler = new OBSHandler(engine);
const resultHandler = new ResultHandler(engine, test);
new MappoolHandler(beatmapHandler);

test.assign({
	beatmapHandler,
	chatHandler,
	teamHandler,
	scoreHandler,
	gameStateHandler,
	obsHandler,
	resultHandler,
});

if (typeof window !== "undefined") {
	(window as unknown as Record<string, unknown>).__overlayTest__ = test;
	(window as unknown as Record<string, unknown>).__obsHandler__ = obsHandler;
}
