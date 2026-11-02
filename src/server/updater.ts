import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { version } from "../../package.json";

// rempalago-bridge.exe updates the whole install when it starts: the overlay,
// the panel, LEEME.md and itself, from the latest GitHub release. A running exe
// can't be overwritten on Windows but can be renamed, so the old one steps aside
// and the caller runs the new one. Anything that goes wrong leaves the bridge
// running on the version it has: a broadcast never waits on an update.
const LATEST = "https://api.github.com/repos/AegleWorks/three-primary-colors/releases/latest";
const ZIP = "Rempalago.zip";
const STAGING = ".rempalago-update";
// The file that freezes the version, for a final or anything else that must not move.
const OPT_OUT = "no-actualizar.txt";
// The organiser's own settings: the zip's copy is only for a first install.
const USER_FILE = path.join("static", "vcl-overlay", "data.json");
const CHECK_MS = 8_000;
const DOWNLOAD_MS = 180_000;

type Release = { tag_name: string; assets: { name: string; browser_download_url: string; digest?: string }[] };

function isNewer(tag: string) {
	const parts = (text: string) => text.replace(/^v/, "").split(".").map(Number);
	const [next, now] = [parts(tag), parts(version)];
	for (let i = 0; i < Math.max(next.length, now.length); i++) {
		if ((next[i] ?? 0) !== (now[i] ?? 0)) return (next[i] ?? 0) > (now[i] ?? 0);
	}
	return false;
}

async function latestRelease(): Promise<Release> {
	const res = await fetch(LATEST, { headers: { Accept: "application/vnd.github+json", "User-Agent": "rempalago-bridge" }, signal: AbortSignal.timeout(CHECK_MS) });
	if (!res.ok) throw new Error(`GitHub ${res.status}`);
	return (await res.json()) as Release;
}

async function download(release: Release, to: string) {
	const asset = release.assets.find((a) => a.name === ZIP);
	if (!asset?.digest) throw new Error(`el release no tiene ${ZIP} con su huella`);
	const res = await fetch(asset.browser_download_url, { headers: { "User-Agent": "rempalago-bridge" }, signal: AbortSignal.timeout(DOWNLOAD_MS) });
	if (!res.ok) throw new Error(`descarga ${res.status}`);
	const zip = Buffer.from(await res.arrayBuffer());
	const digest = `sha256:${createHash("sha256").update(zip).digest("hex")}`;
	if (digest !== asset.digest) throw new Error("el zip descargado no coincide con su huella");
	fs.writeFileSync(to, zip);
}

// Windows 10+ ships bsdtar as tar.exe, which reads zips.
function extract(zip: string, into: string) {
	const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
	const { status } = spawnSync(tar, ["-xf", zip, "-C", into], { stdio: "ignore" });
	if (status !== 0) throw new Error("no se pudo descomprimir el zip");
}

function install(root: string, staged: string) {
	const exe = process.execPath;
	const fresh = path.join(staged, "rempalago-bridge.exe");
	const overlay = path.join(staged, "static", "vcl-overlay", "index.html");
	if (!fs.existsSync(fresh) || !fs.existsSync(overlay)) throw new Error("al zip le faltan archivos");

	const userFile = path.join(root, USER_FILE);
	fs.cpSync(path.join(staged, "static"), path.join(root, "static"), {
		recursive: true,
		force: true,
		filter: (_, to) => !(path.resolve(to) === path.resolve(userFile) && fs.existsSync(userFile)),
	});
	fs.copyFileSync(path.join(staged, "LEEME.md"), path.join(root, "LEEME.md"));

	// last, so a failure above leaves this version to try again next start
	fs.rmSync(`${exe}.old`, { force: true });
	fs.renameSync(exe, `${exe}.old`);
	try {
		fs.renameSync(fresh, exe);
	} catch (err) {
		fs.renameSync(`${exe}.old`, exe);
		throw err;
	}
}

// True when a new version was installed and the caller should hand over to it.
export async function update(root: string): Promise<boolean> {
	const staged = path.join(root, STAGING);
	try {
		fs.rmSync(`${process.execPath}.old`, { force: true });
	} catch {
		// still running: the bridge that just updated us; the next start clears it
	}
	if (process.env.REMPALAGO_UPDATED || fs.existsSync(path.join(root, OPT_OUT))) return false;
	try {
		const release = await latestRelease();
		if (!isNewer(release.tag_name)) return false;
		console.log(`  Hay una versión nueva (${release.tag_name}; tienes v${version}). Actualizando…`);
		fs.rmSync(staged, { recursive: true, force: true });
		fs.mkdirSync(staged);
		const zip = path.join(staged, ZIP);
		await download(release, zip);
		extract(zip, staged);
		install(root, staged);
		console.log(`  Listo: ${release.tag_name}. Si OBS ya estaba abierto, actualiza el source del overlay.\n`);
		return true;
	} catch (err) {
		console.warn(`  No se pudo actualizar (${(err as Error).message}); sigo con la v${version}.\n`);
		return false;
	} finally {
		fs.rmSync(staged, { recursive: true, force: true });
	}
}

// Runs the exe that update() just put in place, in this same window, until it ends.
export function runUpdated(): never {
	const { status } = spawnSync(process.execPath, process.argv.slice(2), { stdio: "inherit", env: { ...process.env, REMPALAGO_UPDATED: "1" } });
	process.exit(status ?? 0);
}
