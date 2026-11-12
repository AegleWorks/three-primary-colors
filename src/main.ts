import ZEngine from "@fukutotojido/z-engine";
import ControlLink from "./control/ControlLink";
import CasterHandler from "./handler/CasterHandler";
import { guardEngine } from "./handler/guardEngine";
import LiveOro from "./oro/live";
import Qualifiers from "./oro/qualifiers";
import OverlayRemote from "./oro/remote";
import Sources from "./oro/sources";
import { LIVE } from "./oro/stage.js";
import "./oro/oro.js";

// The overlay: the browser source in OBS. The control panel (panel.html)
// drives it through the bridge server.
// guarded: one callback that throws must not stop the map and the chat
const engine = guardEngine(new ZEngine("ws://127.0.0.1:24050/ws"), "overlay");
// ?sim plays the scripted demo match instead of the live one.
const live = LIVE ? new LiveOro(engine, new CasterHandler()) : null;
// Which sheet tab the match and the results scene read; picked in the panel.
const qualifiers = new Qualifiers();
const sources = new Sources();
sources.onPool = ({ gid }) => live?.setPoolTab(gid);
sources.onResults = (sheet, tab, file) => qualifiers.setSource(sheet, tab, file);
new OverlayRemote(new ControlLink(), live, qualifiers, sources);
