import { http } from "./http";

// The mappool from a Google Sheet shared as "anyone with the link can view".
// Columns are found by their header, so they can move: Mod (the slot: NM1,
// DT2, TB), ID (the beatmap id), and optionally Map ("Artist - Title [Diff]"),
// SR, BPM, Length, CS, AR, OD and Mapper, which win over the osu! API's
// values (the sheet's numbers come with the mod applied, and its mapper
// credits guest difficulties). A row without an ID is a map not uploaded to
// osu!: it is shown from its own cells.

export interface SheetRef {
	id: string;
	gid?: number;
}

export interface SheetRow {
	slot: string;
	// 0 for a map not uploaded to osu!: the row's own cells describe it
	beatmapId: number;
	// "Artist - Title [Difficulty]" from the Map column, split
	artist?: string;
	title?: string;
	diff?: string;
	sr?: number;
	bpm?: number;
	len?: string;
	cs?: number;
	ar?: number;
	od?: number;
	mapper?: string;
}

const COLUMNS = ["mod", "id", "sr", "bpm", "length", "cs", "ar", "od", "mapper"] as const;

export async function fetchSheetPool({ id, gid = 0 }: SheetRef): Promise<SheetRow[]> {
	const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${gid}`;
	// no-cache: a reload from the panel must see the sheet's latest edits
	const csv: string = (await http.get(url, { responseType: "text", params: { t: Date.now() } })).data;
	const [header = [], ...rows] = parseCsv(csv);
	const at = Object.fromEntries(COLUMNS.map((name) => [name, header.findIndex((h) => h.trim().toLowerCase() === name)]));
	if (at.mod < 0 || at.id < 0) throw new Error("the sheet needs a Mod and an ID column");
	const cell = (row: string[], name: (typeof COLUMNS)[number]) => (at[name] < 0 ? "" : (row[at[name]] ?? "").trim());
	// The Map column: its cell, or the unnamed one next to it (the sheet
	// merges the header over the picture and the name).
	const mapAt = header.findIndex((h) => h.trim().toLowerCase() === "map");
	const mapName = (row: string[]) => {
		if (mapAt < 0) return "";
		const own = (row[mapAt] ?? "").trim();
		if (own) return own;
		return header[mapAt + 1]?.trim() === "" ? (row[mapAt + 1] ?? "").trim() : "";
	};
	const num = (row: string[], name: (typeof COLUMNS)[number]) => {
		const n = Number.parseFloat(cell(row, name).replace(",", "."));
		return Number.isFinite(n) ? n : undefined;
	};
	return rows.flatMap((row) => {
		const slot = cell(row, "mod").toUpperCase().replace(/\s+/g, "");
		const id = Number.parseInt(cell(row, "id"), 10);
		const name = splitName(mapName(row));
		// no id and no name: an empty row
		if (!slot || (!Number.isFinite(id) && !name.title)) return [];
		return [
			{
				slot,
				beatmapId: Number.isFinite(id) ? id : 0,
				...name,
				sr: num(row, "sr"),
				bpm: num(row, "bpm"),
				len: length(cell(row, "length")),
				cs: num(row, "cs"),
				ar: num(row, "ar"),
				od: num(row, "od"),
				mapper: cell(row, "mapper") || undefined,
			},
		];
	});
}

// "Artist - Title [Difficulty]" -> its parts; without " - " it is all title.
function splitName(text: string): { artist?: string; title?: string; diff?: string } {
	if (!text) return {};
	const m = /^(.*?)\s+-\s+(.*?)(?:\s*\[([^\]]*)\])?\s*$/.exec(text);
	if (m) return { artist: m[1], title: m[2], diff: m[3] ?? "" };
	const d = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(text);
	return d ? { artist: "", title: d[1], diff: d[2] } : { artist: "", title: text, diff: "" };
}

export interface SheetTab {
	name: string;
	gid: number;
}

// The sheet's tabs, in their order, from its public HTML view (the CSV export
// only serves one tab at a time and doesn't list them). Each tab shows up there
// as {name: "Pool 1", pageUrl: "...", gid: "0"}, with JavaScript escapes.
export async function fetchSheetTabs(id: string): Promise<SheetTab[]> {
	const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/htmlview`;
	const html: string = (await http.get(url, { responseType: "text", params: { t: Date.now() } })).data;
	const unescape = (s: string) =>
		s.replace(/\\x([0-9a-f]{2})|\\u([0-9a-f]{4})|\\(.)/gi, (_, x, u, c) => (x || u ? String.fromCharCode(Number.parseInt(x || u, 16)) : c));
	const tabs: SheetTab[] = [];
	for (const m of html.matchAll(/\{name:\s*"((?:[^"\\]|\\.)*)"[^{}]*?gid:\s*"(\d+)"/g)) {
		const gid = Number(m[2]);
		if (!tabs.some((t) => t.gid === gid)) tabs.push({ name: unescape(m[1]).trim(), gid });
	}
	if (!tabs.length) throw new Error("no tabs found (is the sheet shared?)");
	return tabs;
}

// "00:45" or "1:05:30" as the overlay writes lengths: "0:45", "65:30".
function length(text: string) {
	const parts = text.split(":").map((p) => Number.parseInt(p, 10));
	if (parts.length < 2 || parts.some((p) => !Number.isFinite(p))) return undefined;
	const s = parts.reduce((total, p) => total * 60 + p, 0);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// RFC 4180: quoted fields may hold commas, newlines and doubled quotes.
export function parseCsv(text: string) {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field || row.length) rows.push([...row, field]);
	return rows;
}
