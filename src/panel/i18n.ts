// The control panel's languages: Spanish and English, for the panel on the
// broadcasting machine and the remote one alike (the overlay stays in Spanish).
//
// The language is the one picked last on this browser, or else the browser's
// own (Spanish for any "es-*", English for the rest). Switching reloads the
// panel: everything it draws is drawn again in the new language, and nothing
// is lost (the remote code lives in sessionStorage, the rest comes back from
// the overlay).
//
// panel.html marks its fixed text with data-i18n="key" (text),
// data-i18n-html="key" (text with markup) and data-i18n-<attribute>="key"
// (placeholder, title, aria-label); applyStatic() fills them in.

export type Lang = "es" | "en";

const KEY = "rempalago-lang";

function pick(): Lang {
	try {
		const saved = localStorage.getItem(KEY);
		if (saved === "es" || saved === "en") return saved;
	} catch {}
	return /^es\b/i.test(navigator.language || "") ? "es" : "en";
}

export const lang: Lang = pick();

export function setLang(next: Lang) {
	if (next === lang) return;
	try {
		localStorage.setItem(KEY, next);
	} catch {}
	location.reload();
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const es = {
	// ---------- language switch
	langLabel: "Idioma",

	// ---------- remote gate
	gateTitle: "Panel remoto",
	gateNote: "Escribe el código que te pasó quien transmite.",
	gateCode: "Código",
	gateEnter: "Entrar",
	refused4404: "Ese código no existe o ya no sirve. Pídele uno nuevo a quien transmite.",
	refused4409: "Ya hay demasiados paneles conectados.",
	refused4410: "Quien transmite cortó el acceso remoto.",

	// ---------- sides
	left: "Izquierda",
	right: "Derecha",

	// ---------- status bar
	healthLabel: "Estado de las conexiones",
	tallyNoOverlay: "Sin overlay",
	tallyReconnecting: "Reconectando",
	tallyNoBridge: "Sin bridge",
	tallyWaiting: "Esperando al overlay",
	tallyQuiet: "No responde",
	tallyLive: "Al aire",
	tallyDemo: "Al aire · demo",
	seriesFormat: (round: string, bestOf: number, firstTo: number) => `${round} · BO${bestOf} · a ${firstTo}`,

	// ---------- checks
	checkConnection: "Conexión",
	checkBridge: "Bridge",
	connected: "Conectado",
	noConnection: "Sin conexión",
	fixRemoteLink: "Reconectando con quien transmite. Si no vuelve, pídele que revise su internet.",
	fixBridge: "Abre rempalago-bridge.exe y déjalo abierto. El panel se conecta solo.",
	noBridge: "Sin bridge",
	overlayMissing: "No aparece",
	fixOverlayMissing: "Abre OBS con el Browser Source del overlay (con tosu abierto). Si ya está, clic derecho en el source → Actualizar.",
	overlayQuiet: "No responde",
	fixOverlayQuiet: "Si el overlay está en una pestaña del navegador, tráela al frente. En OBS: clic derecho en el source → Actualizar.",
	overlayAnswering: "Respondiendo",
	overlayDemo: "Demo (?sim)",
	loading: "Cargando",
	poolTrouble: "Con problemas",
	fixPool: (problem: string) => `${problem}. Revisa la sheet (compartida con "cualquiera con el enlace") y recarga.`,
	reloadPool: "Recargar pool",
	maps: (n: number) => plural(n, "mapa", "mapas"),
	noChannels: "Sin canales",
	fixChannels: 'Agrega los canales en data.json: "twitch": ["canal"].',
	connecting: "Conectando",
	notConnected: "Sin conectar",
	fixObs: "Sin OBS, el panel no sigue tus escenas ni arma las de gameplay y showcase.",
	connectObs: "Conectar OBS",
	checkVersion: "Versión",
	versionMismatch: "Bridge y panel no coinciden",
	checkOverlays: "Overlays",
	manyOverlays: "Hay más de un overlay abierto",
	manyOverlaysFix: (count: number, obs: boolean) =>
		`Hay ${count} overlays abiertos; el panel sigue ${obs ? "el de OBS" : "el primero que se abrió"} y todos reciben los comandos. Cierra los que sobren (por ejemplo, una pestaña del navegador).`,

	// ---------- now
	nowKicker: "Ahora",
	nowConnecting: "Conectando…",
	nowNoLink: "Sin conexión",
	nowReconnecting: "Reconectando…",
	nowOpenBridge: "Abre el bridge",
	nowLostRemote: "Se perdió la conexión con quien transmite. El panel vuelve solo.",
	nowOpenBridgeDetail: "Abre rempalago-bridge.exe y déjalo abierto: el panel se conecta solo.",
	nowNoOverlay: "Falta el overlay",
	nowWaitingOverlay: "Esperando al overlay",
	nowWaitingOverlayDetail: "Abre OBS con el Browser Source del overlay (y tosu abierto). Aparece aquí en cuanto cargue.",
	nowShowcase: "Showcase en pantalla",
	nowPickMap: "Elige un mapa",
	nowShowcaseDetail: (artist: string, diff: string) => `${artist} · [${diff}]. Pasa al siguiente cuando termine la replay.`,
	nowShowcaseEmpty: "Toca un mapa en la pestaña Showcase.",
	prev: "◀ Anterior",
	next: "Siguiente ▶",
	nowQuals: "Qualifiers en pantalla",
	noPlayers: "Sin jugadores",
	nowQualsDetail: (i: number, total: number) => `Jugador ${i} de ${total}. Siguiente se acerca al seed 1.`,
	pickResultsSheet: "Elige la hoja de resultados en Ajustes → Hojas de la sheet.",
	chooseSheet: "Elegir hoja",
	nowDemo: "Demo",
	nowDemoTitle: "Partido simulado",
	nowDemoDetail: "El overlay corre la demo (?sim): no hay draft que editar. Los controles de la demo están en Ajustes.",
	nowPreparing: "Preparando",
	nowLoadingPool: "Cargando el pool",
	nowLoadingPoolDetail: "El overlay está leyendo la sheet del mappool.",
	markInPool: "Marcar en el pool",
	nowSeriesOver: "Serie terminada",
	nowSeriesWinner: (who: string) => `¡${who} gana la serie!`,
	nowSeriesDetail: (l: number, r: number, title: boolean) =>
		`Queda ${l}–${r}. ${title ? "Es momento de la escena Campeón." : "Muestra el resultado y cierra la transmisión."}`,
	tiebreaker: "Tiebreaker",
	nowTbPlaying: (title: string) => `En juego: TB${title ? ` · ${title}` : ""}`,
	nowTbDetail: "El mapa decisivo. El ganador de la serie se marca solo al terminar.",
	nowMapDone: "Mapa terminado",
	nowMapWon: (who: string, map: string) => `${who} ganó ${map}`,
	nowScoreTb: (l: number, r: number) => `Va ${l}–${r}: viene el tiebreaker.`,
	nowScoreNext: (l: number, r: number, who: string) => `Va ${l}–${r}. Ahora pickea ${who}: cuando el referee cargue su mapa, se marca solo.`,
	nowHeadsUp: "Ojo",
	nowBannedLoaded: (map: string) => `osu! cargó ${map}, que está baneado`,
	nowBannedDetail: "Si fue un error del referee, no hagas nada. Si el ban estaba mal marcado, abre el mapa y quítalo.",
	openMap: (map: string) => `Abrir ${map}`,
	nowPlayingKicker: (order: string) => `En juego · mapa ${order}`,
	nowPlayingPick: (who: string) => `Pick de ${who}. El ganador se marca solo cuando termina. ¿El pick es del otro? Toca el mapa y cámbialo.`,
	nowPlaying: "Se está jugando.",
	nowTie: (l: number, r: number) => `Empate ${l}–${r}: viene el TB`,
	nowTieDetail: "Cuando el referee cargue el TB, el overlay activa el modo tiebreaker solo.",
	nowBeforeMatch: "Antes del partido",
	vs: (l: string, r: string) => `${l} vs ${r}`,
	nowCheckFirst: (n: number, labels: string) => `Antes de empezar, revisa ${n === 1 ? "1 cosa" : `${n} cosas`} arriba (${labels}).`,
	nowAllSet: (scene: string) => `Todo listo. Cuando arranque, pasa a ${scene}.`,
	nowBans: (done: number, total: number) => `Bans · ${done} de ${total}`,
	nowBanTurn: (who: string) => `Le toca banear a ${who}`,
	nowBanPhase: "Fase de bans",
	nowBanDetail: "Toca en el pool el mapa que banearon y elige quién lo baneó.",
	nowPicks: (n: number) => `Picks · mapa ${n}`,
	nowPickTurn: (who: string) => `Le toca pickear a ${who}`,
	nowFirstPick: (who: string, other: string) => `Cuando el referee cargue el mapa, se marca solo como pick de ${who}. Si pickeó ${other}, márcalo tú antes.`,
	nowNextPick: "Cuando el referee cargue el mapa, se marca solo. Arranca el timer si hace falta.",
	goToScene: (scene: string) => `Pasar a ${scene}`,

	// ---------- scenes
	scenes: {
		starting: "Ya empezamos",
		intro: "Intro",
		showcase: "Showcase",
		mappool: "Mappool",
		gameplay: "Gameplay",
		result: "Resultado",
		champion: "Campeón",
		qualifiers: "Qualifiers",
	} as Record<string, string>,
	scenesTitle: "Escena en pantalla",
	followObsTitle: "Cuando cambias de escena en OBS, el overlay cambia a la que corresponde",
	followObs: "Seguir a OBS",
	sceneOnAir: "Al aire",
	sceneChanging: "Cambiando…",
	sceneSuggested: "Sugerida",
	sceneNoLink: "Sin conexión: no se pudo cambiar la escena",
	sceneDidntChange: (scene: string) => `El overlay no pasó a ${scene}. ¿Está abierto?`,
	obsSceneMatch: (obs: string, scene: string) => `OBS: "${obs}" → ${scene}`,
	obsSceneNone: (obs: string) => `OBS: "${obs}" (sin escena del overlay)`,

	// ---------- tabs
	tabsLabel: "Partes del show",
	tabMatch: "Partido",
	tabShowcase: "Showcase",
	tabQuals: "Qualifiers",
	tabChat: "Chat",
	tabSetup: "Ajustes",

	// ---------- toast
	undo: "Deshacer",
	undone: "Deshecho",

	// ---------- draft
	draft: "Draft",
	poolReload: "↻ Recargar pool",
	poolReloadTitle: "Vuelve a leer data.json y la sheet del mappool; el draft se mantiene",
	poolReloading: "Recargando el pool…",
	poolReloadToast: "Recargando el pool. El draft se mantiene.",
	ban: "Ban",
	inPlay: "En juego",
	pick: "Pick",
	won: "Ganó",
	close: "Cerrar (Esc)",
	clearMap: "Dejar el mapa libre",
	overlayKeys: "Atajos del overlay",
	resetDraft: "Borrar todo el draft",
	resetConfirm: "¿Borrar todo? Toca otra vez",
	canUndo: "Se puede deshacer.",
	draftCleared: "Draft borrado",
	editPick: (id: string, who: string) => `${id}: pick de ${who}`,
	editBan: (id: string, who: string) => `${id}: ban de ${who}`,
	editWin: (id: string, who: string) => `${id}: lo ganó ${who}`,
	editClear: (id: string) => `${id} quedó libre`,
	stateBanned: (who: string) => `Baneado por ${who}`,
	stateWon: (picker: string | null, who: string) => `${picker ? `Pick de ${picker}, ` : ""}lo ganó ${who}`,
	statePlaying: (picker: string | null) => `Se está jugando${picker ? `, pick de ${picker}` : ""}. El ganador se marca solo al terminar.`,
	statePicked: (who: string) => `Pick de ${who}, todavía sin ganador`,
	stateFree: "Libre: nadie lo ha pickeado ni baneado",
	badgeBan: (who: string) => `Ban · ${who}`,
	badgeWon: (who: string) => `Ganó ${who}`,
	badgePick: (who: string) => `Pick · ${who}`,
	pickOrder: "Orden de pick",
	pickFirst: "Primero márcalo como pick de alguien",
	emptyWaiting: "Esperando al overlay",
	emptyWaitingDetail: "Ábrelo en OBS (o en una pestaña) con tosu y el bridge abiertos. El pool aparece aquí solo.",
	emptyDemo: "La demo no tiene draft",
	emptyDemoDetail: "Abre el overlay sin <code>?sim</code> para editarlo.",
	emptyLoading: "Cargando el pool…",
	emptyLoadingDetail: "Si tarda, revisa la sheet en Ajustes.",

	// ---------- timer
	timerTitle: "Timer de pick",
	timerStop: "■ Parar",
	timerStopLabel: "Parar el timer",
	timerOther: "Otro tiempo",
	seconds: "Segundos",
	timerStart: "Iniciar",
	timerHint: "Un toque y arranca. También arranca solo con el <code>!mp timer</code> del referee.",
	timerOn: (s: number) => `Timer de ${s} s en pantalla`,
	timerDone: "Terminó",
	timerPresetLabel: (s: number) => `Iniciar timer de ${s} segundos`,
	timerStopped: "Timer detenido",

	// ---------- overlay keys
	keys: {
		t: ["Tiebreaker", "Activa o quita el modo tiebreaker"],
		g: ["Chat: lobby ↔ Twitch", "Cambia el chat en pantalla entre el del lobby y el de Twitch"],
		m: ["Sonido", "Silencia o activa el sonido del overlay"],
		p: ["Medidor", "Medidor de rendimiento"],
	} as Record<string, [string, string]>,
	simKeys: {
		a: "Demo automática",
		f: "Velocidad ×4",
		c: "Choke",
		" ": "Pausar",
		z: "Romper combo izq.",
		x: "Romper combo der.",
		q: "Miss de Bancho izq.",
		w: "Miss de Bancho der.",
	} as Record<string, string>,
	keyDone: (label: string) => `${label}: listo`,
	keyTitle: (title: string, key: string) => `${title} (tecla ${key} en el overlay)`,

	// ---------- round
	roundTitle: "Ronda",
	roundField: "Ronda del partido",
	roundApply: "Cambiar",
	roundApplyTo: (round: string) => `Cambiar a ${round}`,
	roundHint: "Cambiar la ronda recarga el overlay. Para dejarla fija, ponla en la URL del source: <code>?round=sf</code>.",
	roundHintChanging: "Al cambiar, el overlay se recarga (el draft de cada ronda se guarda aparte). Si fue sin querer, vuelve a elegir la ronda actual.",
	roundChanging: (round: string) => `Cambiando a ${round}: el overlay se recarga`,
	rounds: {
		ro64: "Ronda de 64",
		ro32: "Ronda de 32",
		ro16: "Octavos de final",
		qf: "Cuartos de final",
		sf: "Semifinal",
		third: "Tercer puesto",
		f: "Final",
		show: "Showmatch del staff",
	} as Record<string, string>,

	// ---------- showcase
	showcaseHint: "Toca un mapa para destacarlo. Si osu! carga un mapa del pool durante el showcase, se destaca solo y no cuenta como pick.",
	inShowcase: "En el showcase",
	noMapYet: "Ningún mapa todavía",
	noPool: "Sin pool",
	tapOneBelow: "Toca uno de abajo.",
	waitingPool: "Esperando el pool del overlay.",

	// ---------- qualifiers
	qualsHint: "El jugador cuyos resultados muestra la escena Qualifiers. Van del último seed al primero.",
	searchPlayer: "Buscar jugador",
	searchPlaceholder: "Buscar jugador o seed…",
	players: "Jugadores",
	inQuals: (i: number, total: number) => `En la escena Qualifiers · ${i} de ${total}`,
	nextTowardSeed1: "Siguiente se acerca al seed 1.",
	noMatch: (q: string) => `Nadie coincide con “${q}”.`,

	// ---------- chat
	chatTitle: "Chat de Twitch",
	chatHint: "El chat que sale en pantalla. Al cambiar de canal se vacía y se llena con el del canal nuevo.",
	chatChannel: "Canal de Twitch",
	chatDemo: "La demo no lee Twitch",
	chatNone: "No hay canales",
	chatNoneDetail: 'Agrégalos en <code>data.json</code>: <code>"twitch": ["canal_a", "canal_b"]</code>.',
	chatReading: (channel: string) => `Leyendo #${channel}`,
	chatConnecting: "Conectando…",
	live: "● En vivo",
	offline: "Offline",
	onScreen: "En pantalla",
	chatDidntChange: "El overlay no cambió de canal. ¿Está abierto?",

	// ---------- setup: checklist
	checkTitle: "Antes de salir al aire",
	checkHint: "Se revisa solo. Cuando todo esté en verde, puedes transmitir.",

	// ---------- setup: sources
	sourcesTitle: "Hojas de la sheet",
	sourcesRefresh: "↻ Buscar hojas",
	sourcesSearching: "Buscando hojas…",
	sourcesFile: "Archivo de puntajes de la escena Qualifiers",
	sourcesHint: "<b>Partido</b>: el pool del draft, el mappool, el showcase y el gameplay. <b>Resultados</b>: el pool de la escena Qualifiers; el archivo de puntajes se elige solo por el nombre de la hoja.",
	sourcesWaiting: "Esperando al overlay.",
	sourcesNoOverlay: "Sin overlay: abre el overlay para ver los archivos",
	sourcesNoFiles: "El overlay no ve ningún CSV de tourney-results/: actualiza la fuente en OBS (caché) y confirma que es la versión nueva",
	sheetTab: "Hoja",
	results: "Resultados",
	tabForMatch: (tab: string) => `${tab} para el partido`,
	tabForResults: (tab: string) => `${tab} para resultados`,
	loadingTabPool: "Cargando el pool de esa hoja. El draft se mantiene.",

	// ---------- setup: OBS
	obsConnectLegend: "1 · Conectar",
	obsConnectHint: "En OBS: Herramientas → Configuración del servidor WebSocket → activa el servidor y copia la contraseña. El panel la recuerda y se conecta solo la próxima vez.",
	obsPassword: "Contraseña",
	obsPasswordPlaceholder: "La de OBS (opcional)",
	obsAddress: "Dirección",
	obsConnect: "Conectar a OBS",
	obsDisconnect: "Desconectar de OBS",
	obsConnecting: "Conectando…",
	obsConnectFailed: "No se pudo conectar. Revisa que OBS esté abierto, que el servidor WebSocket esté activado y que la contraseña sea la de OBS.",
	obsScenesLegend: "2 · Armar escenas",
	obsScenesHint: "Crea la escena si no existe, captura las ventanas de osu! abiertas y pone el overlay encima. No cambia la escena al aire y se puede tocar las veces que quieras.",
	obsGameplayScene: "Escena de gameplay",
	obsBuildGameplay: "Armar gameplay",
	obsGameplayBefore: "Antes, abre el cliente de torneo.",
	obsShowcaseScene: "Escena del showcase",
	obsBuildShowcase: "Armar showcase",
	obsShowcaseBefore: "Antes, abre el osu! que reproduce la replay (no el de torneo).",
	obsBuilding: "Armando…",
	obsSearching: "Buscando ventanas de osu! y armando la escena…",
	obsTiling: "Acomodo de clientes (avanzado)",
	obsLayout: "Distribución",
	obsLayoutDwindle: "Dwindle (Hyprland)",
	obsLayoutGrid: "Cuadrícula",
	obsLayoutMaster: "Principal y pila",
	obsLayoutTeams: "Por equipo (izquierda / derecha)",
	obsGap: "Espacio",
	obsAutoTile: "Acomodar al abrir o cerrar clientes",
	obsTileNow: "Acomodar ahora",
	obsCantConnect: (url: string) => `No se pudo conectar a OBS en ${url}. Revisa que OBS esté abierto y el servidor WebSocket activo.`,
	obsNoCapture: "Este OBS no tiene Captura de juego; el armado automático necesita OBS en Windows.",
	obsNoBrowser: "Este OBS no tiene la fuente Navegador; reinstala OBS con el plugin de navegador.",
	obsNoClients: (scene: string, overlay: string) =>
		`La escena "${scene}" quedó con el overlay ("${overlay}"), pero no encontré clientes de torneo abiertos. Abre el cliente de torneo: sus ventanas se agregan solas.`,
	obsGameplayDone: (scene: string, count: number, overlay: string) =>
		`Escena "${scene}": ${plural(count, "cliente", "clientes")} de torneo acomodados y el overlay ("${overlay}") encima. Si abres o cierras clientes, se actualiza solo.`,
	obsSetupFailed: (why: string) => `No se pudo armar la escena: ${why}`,
	obsNoReplayClient: (scene: string, overlay: string) =>
		`La escena "${scene}" quedó con el overlay ("${overlay}"), pero no encontré un osu! abierto aparte del de torneo. Abre osu! (el que va a reproducir la replay): se acomoda solo.`,
	obsShowcaseDone: (scene: string, window: string, overlay: string) => `Escena "${scene}": "${window}" en el hueco de la replay y el overlay ("${overlay}") encima.`,
	obsDotOn: "Conectado",
	obsDotOff: "Sin conectar",

	// ---------- setup: remote access
	remoteTitle: "Panel remoto",
	remoteHint: "Deja que otra persona maneje este panel desde su navegador. No puede tocar OBS ni tu PC.",
	remoteCopyCode: "Copiar código",
	remoteCopyLink: "Copiar enlace",
	remoteShareHint: "Pásalo solo a quien vaya a operar: quien lo tenga controla lo que sale al aire.",
	remoteOn: "Activar acceso remoto",
	remoteOff: "Cortar acceso",
	copied: "¡Copiado!",
	copyFailed: "No se pudo copiar",
	remoteStateOff: "Apagado",
	remoteStateConnecting: "Conectando…",
	remotePanels: (n: number) => plural(n, "panel conectado", "paneles conectados"),
	remoteWaiting: "Esperando a alguien",
	versionPanelBridge: (panel: string, bridge: string) => `El panel es v${panel} y el bridge v${bridge}. Revisa que rempalago-bridge.exe esté junto a tosu.exe.`,
	versionOldBridge: "Hay un bridge viejo abierto. Ciérralo y abre el que está en la carpeta de tosu.",

	// ---------- setup: demo, keyboard
	demoTitle: "Demo",
	demoHint: "El overlay está corriendo el partido simulado (<code>?sim</code>).",
	keysTitle: "Atajos de teclado",
	keySwitchScene: "Cambiar de escena",
	keyUndo: "Deshacer el último cambio del draft",
	keyClose: "Cerrar el mapa elegido",
	keyStep: "Anterior / siguiente en Showcase y Qualifiers",
};

export type Dict = typeof es;

const en: Dict = {
	langLabel: "Language",

	gateTitle: "Remote panel",
	gateNote: "Type the code the broadcaster gave you.",
	gateCode: "Code",
	gateEnter: "Enter",
	refused4404: "That code doesn't exist or no longer works. Ask the broadcaster for a new one.",
	refused4409: "Too many panels are already connected.",
	refused4410: "The broadcaster turned remote access off.",

	left: "Left",
	right: "Right",

	healthLabel: "Connection status",
	tallyNoOverlay: "No overlay",
	tallyReconnecting: "Reconnecting",
	tallyNoBridge: "No bridge",
	tallyWaiting: "Waiting for the overlay",
	tallyQuiet: "Not answering",
	tallyLive: "On air",
	tallyDemo: "On air · demo",
	seriesFormat: (round, bestOf, firstTo) => `${round} · BO${bestOf} · first to ${firstTo}`,

	checkConnection: "Connection",
	checkBridge: "Bridge",
	connected: "Connected",
	noConnection: "No connection",
	fixRemoteLink: "Reconnecting to the broadcaster. If it doesn't come back, ask them to check their internet.",
	fixBridge: "Open rempalago-bridge.exe and leave it open. The panel connects by itself.",
	noBridge: "No bridge",
	overlayMissing: "Not showing up",
	fixOverlayMissing: "Open OBS with the overlay's Browser Source (with tosu open). If it's already there, right-click the source → Refresh.",
	overlayQuiet: "Not answering",
	fixOverlayQuiet: "If the overlay is in a browser tab, bring it to the front. In OBS: right-click the source → Refresh.",
	overlayAnswering: "Answering",
	overlayDemo: "Demo (?sim)",
	loading: "Loading",
	poolTrouble: "Having trouble",
	fixPool: (problem) => `${problem}. Check the sheet (shared with "anyone with the link") and reload.`,
	reloadPool: "Reload pool",
	maps: (n) => plural(n, "map", "maps"),
	noChannels: "No channels",
	fixChannels: 'Add the channels in data.json: "twitch": ["channel"].',
	connecting: "Connecting",
	notConnected: "Not connected",
	fixObs: "Without OBS, the panel doesn't follow your scenes or build the gameplay and showcase ones.",
	connectObs: "Connect OBS",
	checkVersion: "Version",
	versionMismatch: "Bridge and panel don't match",
	checkOverlays: "Overlays",
	manyOverlays: "More than one overlay is open",
	manyOverlaysFix: (count, obs) =>
		`${count} overlays are open; the panel follows ${obs ? "the one in OBS" : "the first one opened"} and they all get the commands. Close the extra ones (a browser tab, for example).`,

	nowKicker: "Now",
	nowConnecting: "Connecting…",
	nowNoLink: "No connection",
	nowReconnecting: "Reconnecting…",
	nowOpenBridge: "Open the bridge",
	nowLostRemote: "Lost the connection to the broadcaster. The panel comes back by itself.",
	nowOpenBridgeDetail: "Open rempalago-bridge.exe and leave it open: the panel connects by itself.",
	nowNoOverlay: "Overlay missing",
	nowWaitingOverlay: "Waiting for the overlay",
	nowWaitingOverlayDetail: "Open OBS with the overlay's Browser Source (and tosu open). It shows up here as soon as it loads.",
	nowShowcase: "Showcase on screen",
	nowPickMap: "Pick a map",
	nowShowcaseDetail: (artist, diff) => `${artist} · [${diff}]. Go to the next one when the replay ends.`,
	nowShowcaseEmpty: "Tap a map in the Showcase tab.",
	prev: "◀ Previous",
	next: "Next ▶",
	nowQuals: "Qualifiers on screen",
	noPlayers: "No players",
	nowQualsDetail: (i, total) => `Player ${i} of ${total}. Next moves toward seed 1.`,
	pickResultsSheet: "Pick the results tab in Settings → Sheet tabs.",
	chooseSheet: "Pick tab",
	nowDemo: "Demo",
	nowDemoTitle: "Simulated match",
	nowDemoDetail: "The overlay is running the demo (?sim): there's no draft to edit. The demo controls are in Settings.",
	nowPreparing: "Getting ready",
	nowLoadingPool: "Loading the pool",
	nowLoadingPoolDetail: "The overlay is reading the mappool sheet.",
	markInPool: "Mark in the pool",
	nowSeriesOver: "Series over",
	nowSeriesWinner: (who) => `${who} wins the series!`,
	nowSeriesDetail: (l, r, title) => `Final score ${l}–${r}. ${title ? "Time for the Champion scene." : "Show the result and wrap up the stream."}`,
	tiebreaker: "Tiebreaker",
	nowTbPlaying: (title) => `Playing: TB${title ? ` · ${title}` : ""}`,
	nowTbDetail: "The deciding map. The series winner is marked by itself when it ends.",
	nowMapDone: "Map finished",
	nowMapWon: (who, map) => `${who} won ${map}`,
	nowScoreTb: (l, r) => `It's ${l}–${r}: tiebreaker up next.`,
	nowScoreNext: (l, r, who) => `It's ${l}–${r}. ${who} picks now: when the referee loads their map, it's marked by itself.`,
	nowHeadsUp: "Heads up",
	nowBannedLoaded: (map) => `osu! loaded ${map}, which is banned`,
	nowBannedDetail: "If it was the referee's mistake, do nothing. If the ban was marked wrong, open the map and remove it.",
	openMap: (map) => `Open ${map}`,
	nowPlayingKicker: (order) => `Playing · map ${order}`,
	nowPlayingPick: (who) => `${who}'s pick. The winner is marked by itself when it ends. Was it the other side's pick? Tap the map and change it.`,
	nowPlaying: "Being played.",
	nowTie: (l, r) => `Tied ${l}–${r}: TB up next`,
	nowTieDetail: "When the referee loads the TB, the overlay turns on tiebreaker mode by itself.",
	nowBeforeMatch: "Before the match",
	vs: (l, r) => `${l} vs ${r}`,
	nowCheckFirst: (n, labels) => `Before starting, check ${n === 1 ? "1 thing" : `${n} things`} above (${labels}).`,
	nowAllSet: (scene) => `All set. When it starts, go to ${scene}.`,
	nowBans: (done, total) => `Bans · ${done} of ${total}`,
	nowBanTurn: (who) => `${who} bans next`,
	nowBanPhase: "Ban phase",
	nowBanDetail: "Tap the banned map in the pool and pick who banned it.",
	nowPicks: (n) => `Picks · map ${n}`,
	nowPickTurn: (who) => `${who} picks next`,
	nowFirstPick: (who, other) => `When the referee loads the map, it's marked as ${who}'s pick by itself. If ${other} picked, mark it yourself first.`,
	nowNextPick: "When the referee loads the map, it's marked by itself. Start the timer if needed.",
	goToScene: (scene) => `Go to ${scene}`,

	scenes: {
		starting: "Starting soon",
		intro: "Intro",
		showcase: "Showcase",
		mappool: "Mappool",
		gameplay: "Gameplay",
		result: "Result",
		champion: "Champion",
		qualifiers: "Qualifiers",
	},
	scenesTitle: "Scene on screen",
	followObsTitle: "When you switch scenes in OBS, the overlay switches to the matching one",
	followObs: "Follow OBS",
	sceneOnAir: "On air",
	sceneChanging: "Switching…",
	sceneSuggested: "Suggested",
	sceneNoLink: "No connection: couldn't switch the scene",
	sceneDidntChange: (scene) => `The overlay didn't switch to ${scene}. Is it open?`,
	obsSceneMatch: (obs, scene) => `OBS: "${obs}" → ${scene}`,
	obsSceneNone: (obs) => `OBS: "${obs}" (no overlay scene)`,

	tabsLabel: "Parts of the show",
	tabMatch: "Match",
	tabShowcase: "Showcase",
	tabQuals: "Qualifiers",
	tabChat: "Chat",
	tabSetup: "Settings",

	undo: "Undo",
	undone: "Undone",

	draft: "Draft",
	poolReload: "↻ Reload pool",
	poolReloadTitle: "Reads data.json and the mappool sheet again; the draft stays",
	poolReloading: "Reloading the pool…",
	poolReloadToast: "Reloading the pool. The draft stays.",
	ban: "Ban",
	inPlay: "Playing",
	pick: "Pick",
	won: "Won",
	close: "Close (Esc)",
	clearMap: "Set the map free",
	overlayKeys: "Overlay shortcuts",
	resetDraft: "Clear the whole draft",
	resetConfirm: "Clear everything? Tap again",
	canUndo: "It can be undone.",
	draftCleared: "Draft cleared",
	editPick: (id, who) => `${id}: picked by ${who}`,
	editBan: (id, who) => `${id}: banned by ${who}`,
	editWin: (id, who) => `${id}: won by ${who}`,
	editClear: (id) => `${id} is free`,
	stateBanned: (who) => `Banned by ${who}`,
	stateWon: (picker, who) => `${picker ? `Picked by ${picker}, ` : ""}won by ${who}`,
	statePlaying: (picker) => `Being played${picker ? `, picked by ${picker}` : ""}. The winner is marked by itself when it ends.`,
	statePicked: (who) => `Picked by ${who}, no winner yet`,
	stateFree: "Free: nobody has picked or banned it",
	badgeBan: (who) => `Ban · ${who}`,
	badgeWon: (who) => `Won by ${who}`,
	badgePick: (who) => `Pick · ${who}`,
	pickOrder: "Pick order",
	pickFirst: "Mark it as someone's pick first",
	emptyWaiting: "Waiting for the overlay",
	emptyWaitingDetail: "Open it in OBS (or in a tab) with tosu and the bridge running. The pool shows up here by itself.",
	emptyDemo: "The demo has no draft",
	emptyDemoDetail: "Open the overlay without <code>?sim</code> to edit it.",
	emptyLoading: "Loading the pool…",
	emptyLoadingDetail: "If it takes a while, check the sheet in Settings.",

	timerTitle: "Pick timer",
	timerStop: "■ Stop",
	timerStopLabel: "Stop the timer",
	timerOther: "Other time",
	seconds: "Seconds",
	timerStart: "Start",
	timerHint: "One tap and it starts. It also starts by itself with the referee's <code>!mp timer</code>.",
	timerOn: (s) => `${s} s timer on screen`,
	timerDone: "Done",
	timerPresetLabel: (s) => `Start a ${s} second timer`,
	timerStopped: "Timer stopped",

	keys: {
		t: ["Tiebreaker", "Turns tiebreaker mode on or off"],
		g: ["Chat: lobby ↔ Twitch", "Switches the on-screen chat between the lobby's and Twitch's"],
		m: ["Sound", "Mutes or unmutes the overlay"],
		p: ["Meter", "Performance meter"],
	},
	simKeys: {
		a: "Auto demo",
		f: "Speed ×4",
		c: "Choke",
		" ": "Pause",
		z: "Break left combo",
		x: "Break right combo",
		q: "Bancho miss left",
		w: "Bancho miss right",
	},
	keyDone: (label) => `${label}: done`,
	keyTitle: (title, key) => `${title} (key ${key} on the overlay)`,

	roundTitle: "Round",
	roundField: "Match round",
	roundApply: "Change",
	roundApplyTo: (round) => `Change to ${round}`,
	roundHint: "Changing the round reloads the overlay. To pin it, put it in the source's URL: <code>?round=sf</code>.",
	roundHintChanging: "Changing it reloads the overlay (each round's draft is kept separately). If it was a mistake, pick the current round again.",
	roundChanging: (round) => `Changing to ${round}: the overlay reloads`,
	rounds: {
		ro64: "Round of 64",
		ro32: "Round of 32",
		ro16: "Round of 16",
		qf: "Quarterfinals",
		sf: "Semifinals",
		third: "Third place",
		f: "Finals",
		show: "Staff showmatch",
	},

	showcaseHint: "Tap a map to feature it. If osu! loads a pool map during the showcase, it's featured by itself and doesn't count as a pick.",
	inShowcase: "In the showcase",
	noMapYet: "No map yet",
	noPool: "No pool",
	tapOneBelow: "Tap one below.",
	waitingPool: "Waiting for the overlay's pool.",

	qualsHint: "The player whose results the Qualifiers scene shows. They go from the last seed to the first.",
	searchPlayer: "Search player",
	searchPlaceholder: "Search player or seed…",
	players: "Players",
	inQuals: (i, total) => `In the Qualifiers scene · ${i} of ${total}`,
	nextTowardSeed1: "Next moves toward seed 1.",
	noMatch: (q) => `Nobody matches “${q}”.`,

	chatTitle: "Twitch chat",
	chatHint: "The chat shown on screen. Switching channels empties it and fills it with the new channel's.",
	chatChannel: "Twitch channel",
	chatDemo: "The demo doesn't read Twitch",
	chatNone: "No channels",
	chatNoneDetail: 'Add them in <code>data.json</code>: <code>"twitch": ["channel_a", "channel_b"]</code>.',
	chatReading: (channel) => `Reading #${channel}`,
	chatConnecting: "Connecting…",
	live: "● Live",
	offline: "Offline",
	onScreen: "On screen",
	chatDidntChange: "The overlay didn't switch channels. Is it open?",

	checkTitle: "Before going live",
	checkHint: "It checks itself. When everything is green, you can stream.",

	sourcesTitle: "Sheet tabs",
	sourcesRefresh: "↻ Find tabs",
	sourcesSearching: "Looking for tabs…",
	sourcesFile: "Qualifiers scene score file",
	sourcesHint: "<b>Match</b>: the pool for the draft, the mappool, the showcase and gameplay. <b>Results</b>: the Qualifiers scene's pool; the score file is picked by itself from the tab's name.",
	sourcesWaiting: "Waiting for the overlay.",
	sourcesNoOverlay: "No overlay: open the overlay to see the files",
	sourcesNoFiles: "The overlay doesn't see any CSV in tourney-results/: refresh the source in OBS (cache) and make sure it's the new version",
	sheetTab: "Tab",
	results: "Results",
	tabForMatch: (tab) => `${tab} for the match`,
	tabForResults: (tab) => `${tab} for results`,
	loadingTabPool: "Loading that tab's pool. The draft stays.",

	obsConnectLegend: "1 · Connect",
	obsConnectHint: "In OBS: Tools → WebSocket Server Settings → enable the server and copy the password. The panel remembers it and connects by itself next time.",
	obsPassword: "Password",
	obsPasswordPlaceholder: "OBS's (optional)",
	obsAddress: "Address",
	obsConnect: "Connect to OBS",
	obsDisconnect: "Disconnect from OBS",
	obsConnecting: "Connecting…",
	obsConnectFailed: "Couldn't connect. Check that OBS is open, the WebSocket server is enabled and the password is OBS's.",
	obsScenesLegend: "2 · Build scenes",
	obsScenesHint: "Creates the scene if it doesn't exist, captures the open osu! windows and puts the overlay on top. It doesn't change the scene on air and you can run it as often as you like.",
	obsGameplayScene: "Gameplay scene",
	obsBuildGameplay: "Build gameplay",
	obsGameplayBefore: "Open the tournament client first.",
	obsShowcaseScene: "Showcase scene",
	obsBuildShowcase: "Build showcase",
	obsShowcaseBefore: "Open the osu! that plays the replay first (not the tournament one).",
	obsBuilding: "Building…",
	obsSearching: "Looking for osu! windows and building the scene…",
	obsTiling: "Client layout (advanced)",
	obsLayout: "Layout",
	obsLayoutDwindle: "Dwindle (Hyprland)",
	obsLayoutGrid: "Grid",
	obsLayoutMaster: "Main and stack",
	obsLayoutTeams: "By team (left / right)",
	obsGap: "Gap",
	obsAutoTile: "Rearrange when clients open or close",
	obsTileNow: "Arrange now",
	obsCantConnect: (url) => `Couldn't connect to OBS at ${url}. Check that OBS is open and the WebSocket server is enabled.`,
	obsNoCapture: "This OBS has no Game Capture; automatic setup needs OBS on Windows.",
	obsNoBrowser: "This OBS has no Browser source; reinstall OBS with the browser plugin.",
	obsNoClients: (scene, overlay) =>
		`The scene "${scene}" has the overlay ("${overlay}"), but I found no open tournament clients. Open the tournament client: its windows are added by themselves.`,
	obsGameplayDone: (scene, count, overlay) =>
		`Scene "${scene}": ${plural(count, "tournament client", "tournament clients")} arranged and the overlay ("${overlay}") on top. If you open or close clients, it updates by itself.`,
	obsSetupFailed: (why) => `Couldn't build the scene: ${why}`,
	obsNoReplayClient: (scene, overlay) =>
		`The scene "${scene}" has the overlay ("${overlay}"), but I found no osu! open besides the tournament one. Open osu! (the one that plays the replay): it's placed by itself.`,
	obsShowcaseDone: (scene, window, overlay) => `Scene "${scene}": "${window}" in the replay slot and the overlay ("${overlay}") on top.`,
	obsDotOn: "Connected",
	obsDotOff: "Not connected",

	remoteTitle: "Remote panel",
	remoteHint: "Lets someone else run this panel from their browser. They can't touch OBS or your PC.",
	remoteCopyCode: "Copy code",
	remoteCopyLink: "Copy link",
	remoteShareHint: "Only give it to whoever will operate: anyone who has it controls what goes on air.",
	remoteOn: "Turn on remote access",
	remoteOff: "Cut access",
	copied: "Copied!",
	copyFailed: "Couldn't copy",
	remoteStateOff: "Off",
	remoteStateConnecting: "Connecting…",
	remotePanels: (n) => plural(n, "panel connected", "panels connected"),
	remoteWaiting: "Waiting for someone",
	versionPanelBridge: (panel, bridge) => `The panel is v${panel} and the bridge v${bridge}. Check that rempalago-bridge.exe is next to tosu.exe.`,
	versionOldBridge: "An old bridge is open. Close it and open the one in tosu's folder.",

	demoTitle: "Demo",
	demoHint: "The overlay is running the simulated match (<code>?sim</code>).",
	keysTitle: "Keyboard shortcuts",
	keySwitchScene: "Switch scene",
	keyUndo: "Undo the last draft change",
	keyClose: "Close the selected map",
	keyStep: "Previous / next in Showcase and Qualifiers",
};

export const t: Dict = lang === "en" ? en : es;

// Status lines the overlay writes (in Spanish) about the pool and the sheet,
// in the panel's language. One the panel doesn't know shows as it came.
const OVERLAY_TEXT: [RegExp, (...m: string[]) => string][] = [
	[/^Buscando las hojas de la sheet$/, () => "Looking for the sheet's tabs"],
	[/^data\.json no tiene sheet$/, () => "data.json has no sheet"],
	[/^(\d+) hojas en la sheet a las (.+)$/, (n, time) => `${n} tabs in the sheet as of ${time}`],
	[/^No se pudieron leer las hojas de la sheet: (.*)$/s, (why) => `Couldn't read the sheet's tabs: ${why}`],
	[/^No se pudo cargar el pool: (.*)$/s, (why) => `Couldn't load the pool: ${why}`],
	[/^No se pudo recargar el pool: (.*)$/s, (why) => `Couldn't reload the pool: ${why}`],
	[/^No se pudo leer la sheet \((.*)\); uso el mappool de data\.json$/s, (why) => `Couldn't read the sheet (${why}); using data.json's mappool`],
	[/^No hay mapas en (la sheet|data\.json)$/, (from) => `No maps in ${from === "la sheet" ? "the sheet" : from}`],
	[
		/^(\d+) mapas de (la sheet|data\.json) a las ([^;]+?)(?:; sin datos en osu! para (.+))?$/s,
		(n, from, time, missing) => `${n} maps from ${from === "la sheet" ? "the sheet" : from} as of ${time}${missing ? `; no osu! data for ${missing}` : ""}`,
	],
	[/^Cargando el pool$/, () => "Loading the pool"],
];

export function overlayText(text: string) {
	if (lang === "es" || !text) return text;
	for (const [rule, say] of OVERLAY_TEXT) {
		const m = rule.exec(text);
		if (m) return say(...m.slice(1));
	}
	return text;
}

export const sceneLabel = (scene: string) => t.scenes[scene] ?? "—";
export const roundLabel = (key: string, fallback?: string) => t.rounds[key] ?? fallback ?? key;


// The fixed text in panel.html.
export function applyStatic(root: ParentNode = document) {
	document.documentElement.lang = lang;
	const text = (key: string) => {
		const value = (t as Record<string, unknown>)[key];
		if (typeof value !== "string") {
			console.warn(`[i18n] no text for "${key}"`);
			return null;
		}
		return value;
	};
	for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
		const v = text(el.dataset.i18n!);
		if (v !== null) el.textContent = v;
	}
	for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-html]")) {
		const v = text(el.dataset.i18nHtml!);
		if (v !== null) el.innerHTML = v;
	}
	for (const attr of ["placeholder", "title", "aria-label"]) {
		const data = `data-i18n-${attr}`;
		for (const el of root.querySelectorAll<HTMLElement>(`[${data}]`)) {
			const v = text(el.getAttribute(data)!);
			if (v !== null) el.setAttribute(attr, v);
		}
	}
	// the ES / EN buttons, wherever the page has a spot for them
	for (const box of root.querySelectorAll<HTMLElement>("[data-lang-switch]")) {
		box.setAttribute("role", "group");
		box.setAttribute("aria-label", t.langLabel);
		box.innerHTML = "";
		for (const code of ["es", "en"] as Lang[]) {
			const b = document.createElement("button");
			b.type = "button";
			b.textContent = code.toUpperCase();
			b.lang = code;
			b.title = code === "es" ? "Español" : "English";
			b.setAttribute("aria-pressed", String(code === lang));
			b.addEventListener("click", () => setLang(code));
			box.append(b);
		}
	}
}
