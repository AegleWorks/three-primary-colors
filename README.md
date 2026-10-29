# Vietnam Community League - Tournament Overlay
A complete rework of [vcl-tournament-overlay-tosu](https://github.com/vncommunityleague/vcl-tournament-overlay-tosu), using [Z-Engine](https://www.npmjs.com/package/@fukutotojido/z-engine) as value change listener. Developed by [ANON TOKYO](https://github.com/FukutoTojido).

## Why this thing exist?
- You hate configuring Lazer but still prefer the design of its tournament overlay
- You prefer using an open-source and highly customizable (if you know how to) solution

## Setup
- Install [tosu](https://github.com/tosuapp/tosu/releases/latest)
- Download the latest release from the [Release](https://github.com/vncommunityleague/vcl-overlay/releases/latest) page of this repository
- Extract the downloaded zip file to `static` folder of tosu.
- Your file structure should be like this
```
static/
└── vcl-overlay/
    ├── assets/
    ├── check.svg
    ├── data.json
    ├── index.html
    └── vcl.svg
```
- Update data in `data.json` file (example is provided in the file)

## Usage
The broadcast is the **Oro** design for Rempalago 3 (`src/oro`, from `propuestas/oro`): seven scenes (Ya empezamos, Intro, Showcase, Mappool, Gameplay, Resultado, Campeón) in a single browser source, with a stinger between them.

- Add **one** Browser Source in OBS and reuse it in every overlay scene (Add > Existing source), so it keeps its state:
  - URL: `http://127.0.0.1:24050/vcl-overlay/?round=f` (`ro64`, `ro32`, `ro16`, `qf`, `sf`, `third`, `f`, `show`)
  - Width: `1920`, Height: `1080`
- Set the OBS scene transition to **Cut**: the overlay plays its own stinger
- The **control panel** is a separate page, `panel.html` (`http://127.0.0.1:24050/vcl-overlay/panel.html`). Open it in a browser tab, or inside OBS as a dock (Docks > Custom Browser Docks). It talks to the overlay through the bridge server (`bun dev` starts it, on `ws://127.0.0.1:24052`), so the bridge must be running for the panel to work
- From the panel: switch scenes (or let them follow OBS: connect to OBS and keep **Seguir la escena de OBS** on; scene names are matched by keyword: `empez`/`start`, `intro`/`vs`, `showcase`, `mappool`/`pick`, `result`, `champ`/`campe`/`ganador`, `gameplay`/`rempalago`/`osu`), start the pick timer, change the round, edit the draft and set up the OBS auto-tiling
- During gameplay the client band (y 100–820) is transparent: the tournament clients are OBS sources under the overlay
- **Draft**: Pick, Ban and Gana for each player, and Quitar, per map. A pool map that tosu loads without a pick counts as the next picker's pick, and its winner is set when the map ends. The draft survives a source refresh. Clicking the cards in OBS's Interact window also works (click: left, right click: right, Shift: ban, Alt: winner, Ctrl: clear)
- **Pick timer**: starts on its own with the referee's `!mp timer` and follows BanchoBot's countdown; the panel starts it by hand
- Casters come from the Discord IPC bridge; Twitch chat is read anonymously from the channel in `data.json`
- In development (`bun dev`) only, `?sim` plays the scripted demo match instead of the live one and `P` shows a performance meter. A production build (`bun run build`) leaves both out entirely

### data.json
```json
{
    "mappool": [{ "mod": "NM", "icon": "assets/mods/NM.png", "maps": [4675675] }],
    "players": { "Clippy": { "seed": 1, "countryRank": 39 } },
    "twitch": "channel_name"
}
```
`players` (seed and country rank, which tosu does not have) and `twitch` (also `?twitch=`) are optional.

## Development
Just as a head-up, since this overlay is completely reworked on Vite, you cannot directly change the HTML, CSS and JS directly just like the old overlay but rather spin up a development server on your local machine and work with it for modification. After you have done everything, you should build the overlay and paste the files in the `dist` folder to tosu folder again.

- Install [Bun](https://bun.sh/docs/installation)
- Clone the repository and start developing
```
git clone https://github.com/vncommunityleague/vcl-overlay.git
bun install
bun dev
```
- Your overlay should be available at `http://localhost:5173`

## Build
- Build the overlay
```
bun run build
```

## FAQs
**Does this support accuracy?**
- Not only by accuracy but also by max combo or miss count.

**Does this support automatic pick?**
- Removed in this version, old one still has it. 

**Who should I contact to get support?**
- For additional support, DM `itsmehoaq` on Discord (or ping in osu! Tournament Hub) - note that any requests regarding modifying overlay design or functionality will be ignored.
- If you are using this overlay, please make a fork so we know which tournament this is being used for :D

## Screenshots
<img width="1917" height="1075" alt="image" src="https://github.com/user-attachments/assets/69908ac5-8f5e-48dc-9150-da6b44a98e9a" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/2b1055a6-647c-46a2-b00a-50e4116d8c29" />

