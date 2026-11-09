import axios from "axios";
import type { Data } from "../types";
import { fetchSheetTabs, type SheetTab } from "./sheet";

// Which tab of the Google Sheet each part of the overlay reads, found by
// looking at the sheet rather than by date: the tournament adds a tab per
// pool ("Qualifiers", "Pool 1"...) and whoever runs the broadcast picks, in
// the panel, the one the match plays (draft, mappool, showcase) and the one
// the results scene shows. The results scene also needs that pool's scores: a
// CSV in tourney-results/, matched to the tab by name ("Pool 1" finds
// "... POOL 1 - scores.csv") and also pickable by hand.
//
// Choices survive a source refresh. Until someone picks, the match plays
// data.json's `sheet.gid` and the results scene shows `qualifiersSheet`, else
// the tab whose name says "quali".

const FILES = import.meta.glob<string>("../../tourney-results/*.csv", { query: "?raw", import: "default", eager: true });
const fileName = (path: string) => path.split("/").pop() ?? path;
export const RESULTS: Record<string, string> = Object.fromEntries(Object.entries(FILES).map(([path, text]) => [fileName(path), text]));

const KEY = { pool: "sources:pool", results: "sources:results", file: "sources:file" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const load = (key: string) => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};
const save = (key: string, value: string) => {
	try {
		localStorage.setItem(key, value);
	} catch {}
};

// The results file for a tab: the one whose name holds the tab's name, not
// followed by another digit, so "Pool 1" doesn't take "Pool 10"'s file.
export function fileFor(tab: SheetTab | undefined) {
	const want = tab ? norm(tab.name) : "";
	if (!want) return "";
	const rule = new RegExp(`${want}(?!\\d)`);
	return Object.keys(RESULTS).find((f) => rule.test(norm(f))) ?? "";
}

export interface SourcesState {
	sheet: string;
	tabs: SheetTab[];
	pool: number | null;
	results: number | null;
	files: string[];
	file: string;
	status: { ok: boolean; text: string };
}

export default class Sources {
	private sheetId = "";
	private tabs: SheetTab[] = [];
	pool: number | null = null;
	results: number | null = null;
	file = "";
	private status = { ok: true, text: "Buscando las hojas de la sheet" };

	// The match's tab changed: reload the pool from it.
	onPool?: (sheet: { id: string; gid: number }) => void;
	// The results scene's tab or file changed.
	onResults?: (sheet: { id: string; gid: number } | null, tab: SheetTab | null, file: string) => void;
	// Anything changed, for the panel.
	onUpdate?: () => void;

	constructor() {
		const saved = Number.parseInt(load(KEY.pool) ?? "", 10);
		if (Number.isFinite(saved)) this.pool = saved;
		const savedResults = Number.parseInt(load(KEY.results) ?? "", 10);
		if (Number.isFinite(savedResults)) this.results = savedResults;
		this.file = load(KEY.file) ?? "";
		this.discover();
	}

	// The match's pool tab as remembered, before the sheet has been read.
	static savedPool(): number | null {
		const n = Number.parseInt(load(KEY.pool) ?? "", 10);
		return Number.isFinite(n) ? n : null;
	}

	get state(): SourcesState {
		return { sheet: this.sheetId, tabs: this.tabs, pool: this.pool, results: this.results, files: Object.keys(RESULTS), file: this.file, status: this.status };
	}

	private tab(gid: number | null) {
		return this.tabs.find((t) => t.gid === gid);
	}

	// Read data.json and the sheet's tabs again; keep each choice that still
	// names a tab, fill in the rest.
	async discover() {
		try {
			const json: Data = (await axios.get("./data.json", { params: { t: Date.now() } })).data;
			this.sheetId = json.sheet?.id ?? json.qualifiersSheet?.id ?? "";
			if (!this.sheetId) {
				this.status = { ok: false, text: "data.json no tiene sheet" };
				this.emitResults();
				return this.onUpdate?.();
			}
			this.tabs = await fetchSheetTabs(this.sheetId);
			// what the match loaded on its own at start (see LiveOro.loadPool)
			const loaded = this.pool ?? json.sheet?.gid ?? 0;
			if (!this.tab(this.pool)) this.pool = this.tab(json.sheet?.gid ?? 0)?.gid ?? this.tabs.find((t) => !/quali/i.test(t.name))?.gid ?? this.tabs[0].gid;
			if (!this.tab(this.results)) {
				const fromJson = json.qualifiersSheet && json.qualifiersSheet.id === this.sheetId ? this.tab(json.qualifiersSheet.gid ?? 0) : undefined;
				this.results = (fromJson ?? this.tabs.find((t) => /quali/i.test(t.name)) ?? this.tab(this.pool))!.gid;
			}
			if (!(this.file in RESULTS)) this.file = fileFor(this.tab(this.results)) || Object.keys(RESULTS)[0] || "";
			const time = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
			this.status = { ok: true, text: `${this.tabs.length} hojas en la sheet a las ${time}` };
			if (this.pool !== loaded) this.onPool?.({ id: this.sheetId, gid: this.pool! });
		} catch (e) {
			console.error("[Sources] Failed to read the sheet's tabs:", (e as Error).message);
			this.status = { ok: false, text: `No se pudieron leer las hojas de la sheet: ${(e as Error).message}` };
			if (!(this.file in RESULTS)) this.file = Object.keys(RESULTS)[0] ?? "";
		}
		this.emitResults();
		this.onUpdate?.();
	}

	private emitResults() {
		const tab = this.tab(this.results) ?? null;
		this.onResults?.(tab && this.sheetId ? { id: this.sheetId, gid: tab.gid } : null, tab, this.file);
	}

	setPool(gid: number) {
		if (!this.tab(gid) || gid === this.pool) return;
		this.pool = gid;
		save(KEY.pool, String(gid));
		this.onPool?.({ id: this.sheetId, gid });
		this.onUpdate?.();
	}

	// A new results tab brings its own scores file when one matches its name.
	setResults(gid: number) {
		const tab = this.tab(gid);
		if (!tab || gid === this.results) return;
		this.results = gid;
		save(KEY.results, String(gid));
		const match = fileFor(tab);
		if (match) {
			this.file = match;
			save(KEY.file, match);
		}
		this.emitResults();
		this.onUpdate?.();
	}

	setFile(file: string) {
		if (!(file in RESULTS) || file === this.file) return;
		this.file = file;
		save(KEY.file, file);
		this.emitResults();
		this.onUpdate?.();
	}
}
