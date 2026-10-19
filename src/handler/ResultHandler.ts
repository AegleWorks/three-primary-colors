import type ZEngine from "@fukutotojido/z-engine";
import type Test from "../Test";

export default class ResultHandler {
	resultContainer: HTMLElement | null;
	isEnded = false;

	constructor(engine: ZEngine, test?: Test) {
		this.resultContainer = document.querySelector("#resultContainer");

		engine.register("menu.bm.time.current", (_, value, data) => {
			if (test?.testMode) return;
			const fullTime = data.menu?.bm?.time?.full ?? Infinity;
			const isScoreVisible = Boolean(
				data.tourney?.manager?.bools?.scoreVisible,
			);
			this.updateTime(
				typeof value === "number" && value > fullTime && isScoreVisible,
			);
		});
	}

	updateTime(isEnded: boolean) {
		if (isEnded === this.isEnded) return;
		this.isEnded = isEnded;

		if (this.resultContainer === null) return;
		this.resultContainer.style.opacity = isEnded ? "1" : "0";
	}
}
