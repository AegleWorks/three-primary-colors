import ZEngine from "@fukutotojido/z-engine";
import ControlLink from "./control/ControlLink";
import CasterHandler from "./handler/CasterHandler";
import LiveOro from "./oro/live";
import OverlayRemote from "./oro/remote";
import { LIVE } from "./oro/stage.js";
import "./oro/oro.js";

// The overlay: the browser source in OBS. The control panel (panel.html)
// drives it through the bridge server.
const engine = new ZEngine("ws://127.0.0.1:24050/ws");
// ?sim plays the scripted demo match instead of the live one.
const live = LIVE ? new LiveOro(engine, new CasterHandler()) : null;
new OverlayRemote(new ControlLink(), live);
