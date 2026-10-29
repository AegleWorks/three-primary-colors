import type OBSHandler from "./OBSHandler";
import type { SceneName } from "../oro/stage.js";

// OBS scene name -> overlay scene. The overlay is one browser source shared by
// every OBS scene, so switching scenes in OBS plays the stinger and lands on
// the matching overlay scene. Names are matched by keyword, first rule wins;
// scenes that match nothing (cameras, a break screen) leave the overlay alone.
const RULES: [RegExp, SceneName][] = [
	[/empez|starting|start/i, "starting"],
	[/showcase/i, "showcase"],
	[/intro|versus|\bvs\b/i, "intro"],
	[/mappool|pool|pick|ban/i, "mappool"],
	[/result/i, "result"],
	[/champ|campe|winner|ganador/i, "champion"],
	[/gameplay|partida|rempalago|osu/i, "gameplay"],
];

export function sceneFor(obsScene: string): SceneName | null {
	for (const [rule, scene] of RULES) if (rule.test(obsScene)) return scene;
	return null;
}

export default class SceneSync {
	private follow: HTMLInputElement | null = document.querySelector("#sceneFollowObs");
	private status: HTMLElement | null = document.querySelector("#sceneObsStatus");

	constructor(
		obs: OBSHandler,
		private goTo: (scene: SceneName) => void,
	) {
		obs.onProgramScene((name) => this.apply(name));
	}

	private apply(obsScene: string) {
		const scene = sceneFor(obsScene);
		if (this.status) {
			this.status.textContent = scene
				? `OBS: "${obsScene}" → ${scene}`
				: `OBS: "${obsScene}" (sin escena del overlay)`;
		}
		if (scene && this.follow?.checked !== false) this.goTo(scene);
	}
}
