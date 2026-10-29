import axios from "axios";

// The mappool from a Google Sheet shared as "anyone with the link can view".
// Columns are found by their header, so they can move: Mod (the slot: NM1,
// DT2, TB), ID (the beatmap id), and optionally SR, BPM, Length, CS, AR, OD
// and Mapper, which win over the osu! API's values (the sheet's numbers come
// with the mod applied, and its mapper credits guest difficulties). Rows
// without an ID are skipped.

export interface SheetRef {
	id: string;
	gid?: number;
}

export interface SheetRow {
	slot: string;
	beatmapId: number;
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
	const csv: string = (await axios.get(url, { responseType: "text", params: { t: Date.now() } })).data;
	const [header = [], ...rows] = parseCsv(csv);
	const at = Object.fromEntries(COLUMNS.map((name) => [name, header.findIndex((h) => h.trim().toLowerCase() === name)]));
	if (at.mod < 0 || at.id < 0) throw new Error("the sheet needs a Mod and an ID column");
	const cell = (row: string[], name: (typeof COLUMNS)[number]) => (at[name] < 0 ? "" : (row[at[name]] ?? "").trim());
	const num = (row: string[], name: (typeof COLUMNS)[number]) => {
		const n = Number.parseFloat(cell(row, name).replace(",", "."));
		return Number.isFinite(n) ? n : undefined;
	};
	return rows.flatMap((row) => {
		const slot = cell(row, "mod").toUpperCase().replace(/\s+/g, "");
		const beatmapId = Number.parseInt(cell(row, "id"), 10);
		if (!slot || !Number.isFinite(beatmapId)) return [];
		return [
			{
				slot,
				beatmapId,
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

// "00:45" or "1:05:30" as the overlay writes lengths: "0:45", "65:30".
function length(text: string) {
	const parts = text.split(":").map((p) => Number.parseInt(p, 10));
	if (parts.length < 2 || parts.some((p) => !Number.isFinite(p))) return undefined;
	const s = parts.reduce((total, p) => total * 60 + p, 0);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// RFC 4180: quoted fields may hold commas, newlines and doubled quotes.
function parseCsv(text: string) {
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
