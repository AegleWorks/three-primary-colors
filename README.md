# Overlay de Rempalago 3

El overlay de transmisión del torneo Rempalago 3 de osu!: ocho escenas (Ya empezamos, Intro, Showcase, Mappool, Gameplay, Resultado, Campeón, Qualifiers) que leen el partido en vivo desde osu!, más un panel de control para quien maneja la transmisión. Funciona en **Windows** con tosu y OBS.

## Descargar

**[⬇ Descargar Rempalago.zip](https://github.com/AegleWorks/three-primary-colors/releases/latest/download/Rempalago.zip)**

No necesitas cuenta de GitHub ni instalar nada más que lo de la tabla de abajo. Para instalarlo, sigue [Instalación](#instalación).

## Lo que necesitas

| Programa | Para qué |
|----------|----------|
| Windows 10 u 11 | Todo corre aquí |
| [tosu](https://github.com/tosuapp/tosu/releases/latest) | Lee osu! y sirve el overlay |
| osu! (stable) con el cliente de torneo | Los jugadores y el lobby |
| [OBS Studio](https://obsproject.com/) 30 o más nuevo | La transmisión |
| Discord de escritorio (no el del navegador) | Los casters y quién está hablando |
| `Rempalago.zip` | El overlay, el panel y el bridge: [descárgalo aquí](https://github.com/AegleWorks/three-primary-colors/releases/latest/download/Rempalago.zip) |

## Instalación

1. **Descarga `rempalago-bridge.exe`** [desde la última release](https://github.com/AegleWorks/three-primary-colors/releases/latest) y ponlo en una carpeta vacía, por ejemplo `C:\Rempalago`. Ábrelo: si falta tosu, pregunta si lo instala ahí (responde **S**). Ese mismo paso descarga el overlay, el panel y el resto. Todo queda en esa carpeta, y las actualizaciones van a esa misma carpeta.
2. **Abre tosu una vez** desde esa carpeta y ciérralo. Así crea su carpeta `static`. Debe quedar así:
   ```
   C:\Rempalago\
   ├── tosu.exe
   ├── rempalago-bridge.exe
   ├── LEEME.md
   └── static\
       └── vcl-overlay\
           ├── index.html
           ├── panel.html
           └── data.json
   ```
3. **Configura `static\vcl-overlay\data.json`** con el Bloc de notas (ver [data.json](#datajson)).
4. **Abre en este orden:** Discord (y entra al canal de voz de los casters), tosu, el cliente de torneo de osu! y por último `rempalago-bridge.exe`.
   - La primera vez Discord muestra una ventana para autorizar la conexión: dale **Autorizar**.
   - Deja abierta la ventana del bridge durante toda la transmisión.
5. **En OBS, agrega el overlay** (ver [OBS](#obs)).
6. **El panel se abre solo** en tu navegador cuando el bridge y tosu están corriendo, salvo que ya lo tengas abierto (por ejemplo, como dock en OBS). Su dirección es `http://127.0.0.1:24050/vcl-overlay/panel.html`. Arriba debe aparecer **Al aire** y las conexiones (Bridge, Overlay, Pool, Chat, OBS) con ✓ verde. Si algo falla, una franja debajo dice qué es y qué hacer.

Si todo eso se ve bien, ya puedes transmitir.

## Actualizaciones

El bridge se actualiza solo. Cada vez que lo abres, revisa si hay una versión nueva y, si la hay, la baja, actualiza el overlay, el panel y a sí mismo, y sigue en la misma ventana. Si algo falla (por ejemplo, no hay internet), te avisa y sigue con la versión que tienes.

- **Tu `data.json` no se toca.** Tampoco tu sesión de Discord.
- Si OBS ya estaba abierto, actualiza el source del overlay (clic derecho → Actualizar) para que cargue la versión nueva. Por eso conviene abrir el bridge antes de empezar a transmitir.
- Para congelar la versión (por ejemplo, durante una final), crea un archivo vacío llamado `no-actualizar.txt` junto a `rempalago-bridge.exe`. Bórralo para volver a actualizar.

## Panel remoto

Otra persona puede manejar el panel desde su navegador, sin instalar nada y sin que abras puertos.

1. En tu panel, ve a **Ajustes** → **Panel remoto** y toca **Activar acceso remoto**.
2. Pásale el enlace o el código a quien vaya a operar. Entra por `https://panel.aegleworks.com`.
3. Para terminar, toca **Cortar acceso**: el código deja de servir al instante y la próxima vez sale otro.

- Puede hacer lo mismo que tu panel: escenas, draft, timer, showcase, pool, chat de Twitch, ronda. Hasta 4 paneles a la vez; si dos tocan lo mismo, gana el último.
- No puede tocar OBS, tu PC ni tu Discord: esas partes solo existen en tu panel.
- Quien tenga el código controla lo que sale al aire, así que pásalo solo a quien corresponda.
- Si se cae el internet o el relay, el bridge reconecta solo con el mismo código, y tu panel local sigue funcionando.

## data.json

```json
{
    "sheet": { "id": "1fqjgrT9W8ET8l3vniE3KPU77Qz_e2LtSt7bwkA-Bh9c", "gid": 0 },
    "players": { "Clippy": { "seed": 1, "countryRank": 39 } },
    "twitch": ["torneorempalago", "torneorempalago_b"]
}
```

| Campo | Qué es |
|-------|--------|
| `sheet.id` | El código largo de la URL de la Google Sheet del mappool, entre `/d/` y `/edit` |
| `sheet.gid` | La pestaña de la sheet: el número después de `gid=` en la URL (la primera suele ser `0`) |
| `players` | Seed y rank de país por nombre de osu! (tosu no los tiene). Opcional |
| `twitch` | Los canales de Twitch cuyo chat puede salir en pantalla. El primero es el de arranque; el panel cambia entre ellos. Opcional |
| `qualifiersSheet` | La hoja que muestra la escena Qualifiers mientras nadie elija otra en el panel (`{ "id": "...", "gid": 642473965 }`). Si falta, se usa la hoja cuyo nombre diga "quali". Opcional |

**Las hojas de la sheet.** El overlay lee qué hojas tiene la sheet (Qualifiers, Pool 1, Pool 2...). En el panel, **Ajustes** → **Hojas de la sheet** las muestra en una tabla: en la columna **Partido** eliges el pool que se juega (draft, mappool, showcase, gameplay) y en **Resultados** el de la escena Qualifiers. Cuando la sheet tenga una hoja nueva, toca **Buscar hojas**. La elección se recuerda aunque se recargue el overlay; nada cambia solo por fecha. `sheet.gid` solo decide el pool del partido hasta que eliges uno.

**La sheet del mappool:**

- Tiene que estar compartida como **"Cualquier persona con el enlace puede ver"**.
- Columnas obligatorias: `Mod` (el slot: `NM1`, `DT2`, `TB`) e `ID` (el beatmap id). Las filas sin ID se ignoran.
- Si llenas `SR`, `BPM`, `Length`, `CS`, `AR`, `OD` y `Mapper`, esos valores reemplazan los de osu!. Escríbelos con el mod ya aplicado: en un DT, el AR y el BPM de DT.
- No renombres los encabezados; el orden de las columnas sí lo puedes cambiar.
- ¿Cambiaste la sheet en pleno partido? En el panel toca **Recargar pool**. El draft no se pierde.

Si cambias cualquier otra cosa de `data.json`, actualiza el source del overlay en OBS (clic derecho → Actualizar).

## OBS

**El overlay: un solo Browser Source para todas las escenas.**

1. En la primera escena: Fuentes → **+** → **Navegador**. Llámalo `Overlay`.
2. URL: `http://127.0.0.1:24050/vcl-overlay/?round=f`. Cambia `f` por la ronda:

   | Ronda | `round=` |
   |-------|----------|
   | Ronda de 48, 32, 16 | `ro48`, `ro32`, `ro16` |
   | Cuartos, semis | `qf`, `sf` |
   | Tercer puesto, final | `third`, `f` |
   | Showmatch del staff | `show` |

3. Ancho `1920`, alto `1080`.
4. En las demás escenas: **+** → **Navegador** → **Agregar existente** → `Overlay`. Así conserva el draft y el estado entre escenas.
5. Transición de escenas: **Corte**. El overlay pone su propia animación entre escenas.

**El panel como dock:** Docks → **Docks de navegador personalizados** → nombre `Panel`, URL `http://127.0.0.1:24050/vcl-overlay/panel.html`.

**Nombres de escena.** Con **Seguir a OBS** activo en el panel, el overlay cambia solo según el nombre de la escena de OBS. Basta con que el nombre contenga una de estas palabras:

| Escena del overlay | El nombre en OBS contiene |
|--------------------|---------------------------|
| Ya empezamos | `empez` o `start` |
| Intro | `intro` o `vs` |
| Showcase | `showcase` |
| Mappool | `mappool` o `pick` |
| Gameplay | `gameplay`, `rempalago` u `osu` |
| Resultado | `result` |
| Campeón | `champ`, `campe` o `ganador` |
| Qualifiers | `qualif` |

Para que el panel vea las escenas, conecta OBS: Herramientas → **Configuración del servidor WebSocket** → activa el servidor y copia la contraseña. En el panel, ve a **Ajustes** → **OBS** (o toca **OBS** arriba), pega la contraseña y toca **Conectar a OBS**. El panel la recuerda y la próxima vez se conecta solo; si tocas **Desconectar de OBS**, la olvida.

**Las escenas de gameplay y showcase se arman solas.** Con OBS conectado, en el panel → **Ajustes** → **OBS** → **Armar escenas**:

| Botón | Qué hace | Antes de tocarlo, abre |
|-------|----------|------------------------|
| **Armar gameplay** | Crea la escena `osu! rempalago` (o la que escribas), captura cada cliente de torneo abierto, los acomoda en la franja del juego (y 100 a y 820) y pone el `Overlay` encima | El cliente de torneo |
| **Armar showcase** | Crea la escena `Showcase`, captura el osu! que reproduce la replay en su hueco (x 40, y 40, 1280×720) y pone el `Overlay` encima | Un osu! aparte del de torneo, el que va a reproducir la replay |

- Reutiliza tu `Overlay`: no crea otro Browser Source si ya tienes uno, así todas las escenas comparten el mismo.
- Solo captura ventanas que estén abiertas. Mientras el panel esté conectado a OBS se mantiene al día: si abres un cliente, aparece y se reacomoda; si lo cierras, su captura se oculta.
- Usa **Captura de juego**, una por cliente, así una ventana tapada se sigue viendo. Si traías capturas de ventana (`osu! 1`, `osu! replay`), las reemplaza solo; una que hayas movido a mano en el showcase vuelve a su lugar.
- Si una captura sale negra: corre OBS como administrador si osu! también corre así, y usa la misma GPU para OBS y osu! (en laptops, Configuración de gráficos de Windows → Alto rendimiento para los dos).
- No cambia la escena que está al aire.
- Si mueves a mano la captura del showcase, no te la vuelve a mover; tocar **Armar showcase** la devuelve a su lugar.
- Los botones se pueden tocar las veces que quieras: arreglan la escena sin duplicar nada.

## Durante el partido

El panel se lee de arriba abajo:

1. **Arriba, el estado.** La escena al aire, la serie y cada conexión con ✓, ! o ✕. Si algo falla, una franja dice qué hacer; toca una conexión para ir a arreglarla.
2. **Ahora.** Lee el partido y dice qué toca: "Le toca banear a…", "Le toca pickear a…", "En juego: NM2", "Ganó…", "Viene el tiebreaker", "¡… gana la serie!". Si el momento pide otra escena, ofrece el botón para pasar a ella, y esa escena aparece marcada como **Sugerida**.
3. **Las pestañas.** Partido, Showcase, Qualifiers, Chat y Ajustes. Cuando la escena al aire es Showcase o Qualifiers, su pestaña se abre sola.

| Quieres | En el panel |
|---------|-------------|
| Cambiar de escena | Los botones de escena o las teclas `1` a `8`, o deja que siga a OBS |
| Marcar picks, bans y quién ganó | Toca un mapa en **Partido**. El botón que más probablemente quieres (el ban o el pick de quien le toca) viene marcado como **sugerido**; **Ganó** solo se activa en un mapa pickeado |
| Corregir un error | Cada cambio del draft muestra **Deshacer** unos segundos (o `Ctrl` + `Z`). **Borrar todo el draft** pide un segundo toque y también se puede deshacer |
| Arrancar el timer de pick | Un toque en **▶ 60 s**, **▶ 90 s** o **▶ 120 s** (u **Otro tiempo**), o deja que lo arranque el `!mp timer` del referee |
| Elegir el mapa del showcase | Pestaña **Showcase**: toca el mapa o usa Anterior / Siguiente (o las flechas ← →). O carga el mapa en osu! y se destaca solo |
| Releer la sheet | **↻ Recargar pool** |
| Cambiar el chat de Twitch que sale en pantalla | Pestaña **Chat**: toca el canal. Cada canal dice si está en vivo |
| Mostrar los qualifiers de un jugador | Pestaña **Qualifiers**: búscalo por nombre o seed, o usa Anterior / Siguiente. Van del último seed al primero: Siguiente se acerca al seed 1 |
| Pasar al pool siguiente, o mostrar sus resultados | **Ajustes** → **Hojas de la sheet**: marca la hoja en **Partido** o en **Resultados** |
| Cambiar la ronda | **Ajustes** → **Ronda**: elígela y confirma con **Cambiar a…** (recarga el overlay) |

## Lo que el overlay hace solo

Estas son las reglas con las que el overlay lleva el partido. Conviene que el referee y quien maneja el panel las conozcan.

| Cuando | El overlay |
|--------|------------|
| tosu carga un mapa del pool que nadie ha pickeado | Lo cuenta como pick del jugador al que le toca |
| Termina un mapa | Marca al ganador en el draft y arma la pantalla de resultado. Las estrellas de la serie las lleva el cliente de torneo |
| Se carga el TB | Activa el modo tiebreaker en gameplay (con su intro) |
| El referee escribe `!mp timer` | Arranca el timer de pick y lo sincroniza con la cuenta de BanchoBot |
| Estás en el showcase y osu! carga un mapa del pool | Lo destaca en el showcase, **sin** contarlo como pick |
| Se recarga el Browser Source | Conserva el draft de esa ronda |
| Cambias la escena en OBS (con el panel abierto, OBS conectado y **Seguir a OBS** activo) | Cambia a la escena del overlay que corresponde |
| Cambias el canal de Twitch en el panel | Vacía el chat en pantalla y lo llena con el del canal nuevo. Recuerda el canal aunque se recargue el source |
| Alguien escribe en el chat | Sale con su foto de Twitch (mientras carga, con su inicial en su color), sus emblemas y sus emotes |

Todo lo automático se corrige a mano desde el panel: tocas el mapa y usas Pick, Ban, Ganó o **Dejar el mapa libre**. Si te equivocas, **Deshacer**.

## Si algo falla

| Ves | Qué hacer |
|-----|-----------|
| Windows dice "Windows protegió su PC" al abrir el bridge | Es porque el exe no está firmado. **Más información** → **Ejecutar de todas formas** |
| El panel dice **Sin bridge** | Abre `rempalago-bridge.exe` y déjalo abierto |
| La ventana del bridge dice que el puerto 24052 está en uso | Ya hay otro bridge abierto. Cierra uno de los dos |
| El panel dice **Esperando al overlay** | El Browser Source no está cargado. Revisa la URL y que tosu esté abierto |
| No salen los casters | Usa Discord de escritorio, en este PC, dentro del canal de voz. Si no apareció la ventana de autorizar, cierra el bridge, borra `.discord_token.json` (junto al exe) y ábrelo de nuevo |
| El panel dice "No se pudo leer la sheet" | Revisa que la sheet esté compartida con "cualquiera con el enlace" y que `sheet.id` sea el correcto. Mientras tanto se usa el `mappool` de `data.json` |
| Un slot aparece en "sin datos en osu!" | El `ID` de esa fila no existe o está mal escrito |
| El overlay se ve negro donde va el juego | El cliente de osu! está encima del overlay en la lista de fuentes. Ponlo debajo |

## Checklist antes de salir al aire

- [ ] tosu, osu! torneo, Discord y el bridge abiertos
- [ ] El panel muestra **Al aire** y, en **Ajustes** → **Antes de salir al aire**, todo con ✓ verde (se revisa solo)
- [ ] El draft muestra el pool completo, con la línea "N mapas de la sheet"
- [ ] Los casters aparecen en "Ya empezamos" y se iluminan al hablar
- [ ] La pestaña **Chat** del panel dice "Leyendo #" con el canal correcto, y el chat se mueve
- [ ] Los clientes se ven en los huecos de Gameplay y Showcase

## Para desarrolladores

Todo lo de arriba es para quien transmite. Para modificar el overlay:

- Instala [Bun](https://bun.sh/docs/installation), clona el repo y corre `bun install` y `bun dev`. Esto levanta el overlay en `http://localhost:5173`, el panel en `/panel.html` y el bridge.
- `?sim` (solo en `bun dev`) corre un partido simulado en lugar del real; `P` muestra un medidor de rendimiento.
- El diseño es **Oro** (`src/oro`, a partir de `propuestas/oro`).
- La escena Qualifiers lee los puntajes de los `.csv` de `tourney-results/` al compilar (`src/oro/sources.ts` y `src/oro/qualifiers.ts`): un archivo nuevo, o uno cambiado, necesita compilar y publicar un release. Al elegir una hoja de resultados se toma el archivo cuyo nombre contiene el de la hoja ("Pool 1" → `... POOL 1 - scores.csv`); en el panel se puede elegir otro. El global y country rank los pide a osu! al mostrar a cada jugador. El panel está en `src/panel`; el bridge, en `src/server`.
- El panel remoto tiene dos piezas: el relay (`relay/`, un Cloudflare Worker con Durable Objects; se publica con `wrangler deploy` y su URL va en `RELAY_URL`, en `src/config/remote.ts`) y la página (`bun run build:remote`, en Vercel con `vercel.json`). Con `RELAY_URL` vacío, el panel no ofrece el acceso remoto. El bridge filtra los comandos remotos en `src/server/RemoteLink.ts`: un comando nuevo no llega de afuera hasta agregarlo ahí.
- `bun run build` genera `dist/`. `bun run release` genera `release/Rempalago.zip`, con el overlay en `static/vcl-overlay/`, `rempalago-bridge.exe` compilado para Windows x64 y este README como `LEEME.md`. Ese zip es el que se sube al release de GitHub, con ese mismo nombre, para que el enlace de descarga siga funcionando. El bridge instalado compara `package.json` con el tag del último release: sube siempre la versión antes de `bun run release`, y el tag debe coincidir. Un release que no sea prerelease le llega a todos al abrir el bridge.

## Créditos

Basado en [vcl-overlay](https://github.com/vncommunityleague/vcl-overlay) de Vietnam Community League, desarrollado por [ANON TOKYO](https://github.com/FukutoTojido), con [Z-Engine](https://www.npmjs.com/package/@fukutotojido/z-engine) para leer tosu.
