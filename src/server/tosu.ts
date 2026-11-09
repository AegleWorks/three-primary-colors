import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";

// tosu's latest Windows release is a zip with tosu.exe at its root. The bridge
// only installs it into its own folder, so everything sits in one place and the
// updater keeps working next to it.
const LATEST = "https://api.github.com/repos/tosuapp/tosu/releases/latest";
const ASSET = /^tosu-windows-.*\.zip$/;
const CHECK_MS = 8_000;
const DOWNLOAD_MS = 300_000;
const MANUAL = "https://github.com/tosuapp/tosu/releases/latest";

async function ask(question: string): Promise<boolean> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = (await rl.question(question)).trim().toLowerCase();
		return answer === "" || answer === "s" || answer === "si" || answer === "sí" || answer === "y" || answer === "yes";
	} finally {
		rl.close();
	}
}

async function install(root: string) {
	const res = await fetch(LATEST, { headers: { Accept: "application/vnd.github+json", "User-Agent": "rempalago-bridge" }, signal: AbortSignal.timeout(CHECK_MS) });
	if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
	const release = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
	const asset = release.assets.find((a) => ASSET.test(a.name));
	if (!asset) throw new Error("la última release de tosu no trae el zip de Windows");

	console.log(`  Descargando tosu ${release.tag_name}…`);
	const dl = await fetch(asset.browser_download_url, { headers: { "User-Agent": "rempalago-bridge" }, signal: AbortSignal.timeout(DOWNLOAD_MS) });
	if (!dl.ok) throw new Error(`la descarga respondió ${dl.status}`);

	const staging = path.join(root, ".tosu-install");
	fs.rmSync(staging, { recursive: true, force: true });
	fs.mkdirSync(staging);
	try {
		const zip = path.join(staging, "tosu.zip");
		fs.writeFileSync(zip, Buffer.from(await dl.arrayBuffer()));
		const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
		const { status } = spawnSync(tar, ["-xf", zip, "-C", staging], { stdio: "ignore" });
		const exe = path.join(staging, "tosu.exe");
		if (status !== 0 || !fs.existsSync(exe)) throw new Error("no pude descomprimir el zip de tosu");
		fs.renameSync(exe, path.join(root, "tosu.exe"));
	} finally {
		fs.rmSync(staging, { recursive: true, force: true });
	}
	console.log("  tosu instalado en esta carpeta. Ábrelo una vez para que cree su carpeta static.\n");
}

// Compiled bridge only. If tosu.exe isn't next to the bridge, offers to install
// tosu here. Failures say what to do by hand and don't stop the bridge.
export async function ensureTosu(root: string): Promise<void> {
	if (fs.existsSync(path.join(root, "tosu.exe"))) return;
	const yes = await ask("  No encontré tosu.exe en esta carpeta. ¿Lo instalo aquí? (S/n) ");
	if (!yes) {
		console.warn(`  Sin tosu no hay overlay. Ponlo en esta carpeta o descárgalo de ${MANUAL}\n`);
		return;
	}
	try {
		await install(root);
	} catch (err) {
		console.error(`  No se pudo instalar tosu: ${(err as Error).message}.\n  Descárgalo a mano de ${MANUAL} y ponlo en esta carpeta.\n`);
	}
}
