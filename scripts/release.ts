import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Builds the Windows release: one zip to extract into tosu's folder.
//
//   Rempalago-vX.Y.Z.zip
//   ├── rempalago-bridge.exe       the bridge, no Bun needed
//   ├── LEEME.md                   the setup guide (SETUP.md)
//   └── static/vcl-overlay/        the overlay and the panel (dist)
//
// Run from any OS: the exe is cross-compiled for Windows x64.

const root = path.resolve(import.meta.dirname, "..");
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const out = path.join(root, "release");
const stage = path.join(out, "stage");
const zip = path.join(out, `Rempalago-v${version}.zip`);

function run(cmd: string, args: string[], cwd = root) {
	console.log(`> ${cmd} ${args.join(" ")}`);
	const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
	if (r.status !== 0) process.exit(r.status ?? 1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, "static"), { recursive: true });

run("bun", ["run", "build"]);
fs.cpSync(path.join(root, "dist"), path.join(stage, "static", "vcl-overlay"), { recursive: true });
run("bun", ["build", "--compile", "--minify", "--target=bun-windows-x64", "src/server/bridge.ts", "--outfile", path.join(stage, "rempalago-bridge.exe")]);
fs.copyFileSync(path.join(root, "SETUP.md"), path.join(stage, "LEEME.md"));

// Windows 10+ ships bsdtar as tar.exe, which writes zips; elsewhere, zip.
const entries = ["rempalago-bridge.exe", "LEEME.md", "static"];
if (process.platform === "win32") run("tar", ["-a", "-c", "-f", zip, ...entries], stage);
else run("zip", ["-qr", zip, ...entries], stage);
fs.rmSync(stage, { recursive: true, force: true });
console.log(`\nRelease: ${path.relative(root, zip)}`);
