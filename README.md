# Overlay de Rempalago 3

El overlay de transmisión del torneo Rempalago 3 de osu!: siete escenas (Ya empezamos, Intro, Showcase, Mappool, Gameplay, Resultado, Campeón) que leen el partido en vivo desde osu!, más un panel de control para quien maneja la transmisión. Funciona en **Windows** con tosu y OBS.

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

1. **Instala tosu.** Descarga `tosu.exe`, ponlo en su propia carpeta (por ejemplo `C:\tosu`), ábrelo una vez y ciérralo. Así crea su carpeta `static`.
2. **Descomprime el zip dentro de la carpeta de tosu.** Si Windows pregunta, acepta combinar las carpetas. Debe quedar así:
   ```
   C:\tosu\
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
6. **Abre el panel** en `http://127.0.0.1:24050/vcl-overlay/panel.html`. Arriba debe aparecer **Bridge** en verde y **Al aire**.

Si todo eso se ve bien, ya puedes transmitir.

## data.json

```json
{
    "sheet": { "id": "1fqjgrT9W8ET8l3vniE3KPU77Qz_e2LtSt7bwkA-Bh9c", "gid": 0 },
    "players": { "Clippy": { "seed": 1, "countryRank": 39 } },
    "twitch": "nombre_del_canal"
}
```

| Campo | Qué es |
|-------|--------|
| `sheet.id` | El código largo de la URL de la Google Sheet del mappool, entre `/d/` y `/edit` |
| `sheet.gid` | La pestaña de la sheet: el número después de `gid=` en la URL (la primera suele ser `0`) |
| `players` | Seed y rank de país por nombre de osu! (tosu no los tiene). Opcional |
| `twitch` | El canal de Twitch cuyo chat sale en pantalla. Opcional |

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
   | Ronda de 64, 32, 16 | `ro64`, `ro32`, `ro16` |
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

Para que el panel vea las escenas, conecta OBS: Herramientas → **Configuración del servidor WebSocket** → activa el servidor y copia la contraseña. En el panel, abre **Conexión con OBS**, pega la contraseña y toca **Conectar a OBS**.

**Dónde van los clientes de osu!** El overlay deja huecos transparentes; los clientes van **debajo** del `Overlay` en la lista de fuentes:

| Escena | Hueco | Qué va ahí |
|--------|-------|------------|
| Gameplay | Franja de y 100 a y 820, todo el ancho | Los dos clientes de torneo. Con el cliente de torneo abierto, **Crear la escena de gameplay en OBS** (en el panel) crea la escena `osu! rempalago` con las capturas ya acomodadas; después agrégale el `Overlay` existente encima |
| Showcase | x 40, y 40, 1280×720 | La captura del osu! que reproduce la replay. Clic derecho → Transformar → Editar transformación → Posición `40, 40`, Tamaño `1280×720` |

## Durante el partido

| Quieres | En el panel |
|---------|-------------|
| Cambiar de escena | Los botones de escena, o deja que siga a OBS |
| Marcar picks, bans y quién ganó | Toca un mapa del draft y usa Pick / Ban / Ganó |
| Arrancar el timer de pick | **Iniciar timer**, o deja que lo arranque el `!mp timer` del referee |
| Elegir el mapa del showcase | Los botones del bloque **Showcase**, o carga el mapa en osu! y se destaca solo |
| Releer la sheet | **Recargar pool** |

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

Todo lo automático se corrige a mano desde el panel: tocas el mapa y usas Pick, Ban, Ganó o **Quitar pick o ban**.

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
- [ ] El panel muestra **Bridge** y **OBS** en verde y **Al aire**
- [ ] El draft muestra el pool completo, con la línea "N mapas de la sheet"
- [ ] Los casters aparecen en "Ya empezamos" y se iluminan al hablar
- [ ] El chat de Twitch se mueve
- [ ] Los clientes se ven en los huecos de Gameplay y Showcase

## Para desarrolladores

Todo lo de arriba es para quien transmite. Para modificar el overlay:

- Instala [Bun](https://bun.sh/docs/installation), clona el repo y corre `bun install` y `bun dev`. Esto levanta el overlay en `http://localhost:5173`, el panel en `/panel.html` y el bridge.
- `?sim` (solo en `bun dev`) corre un partido simulado en lugar del real; `P` muestra un medidor de rendimiento.
- El diseño es **Oro** (`src/oro`, a partir de `propuestas/oro`). El panel está en `src/panel`; el bridge, en `src/server`.
- `bun run build` genera `dist/`. `bun run release` genera `release/Rempalago.zip`, con el overlay en `static/vcl-overlay/`, `rempalago-bridge.exe` compilado para Windows x64 y este README como `LEEME.md`. Ese zip es el que se sube al release de GitHub, con ese mismo nombre, para que el enlace de descarga siga funcionando.

## Créditos

Basado en [vcl-overlay](https://github.com/vncommunityleague/vcl-overlay) de Vietnam Community League, desarrollado por [ANON TOKYO](https://github.com/FukutoTojido), con [Z-Engine](https://www.npmjs.com/package/@fukutotojido/z-engine) para leer tosu.
