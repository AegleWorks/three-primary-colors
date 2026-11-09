import { spawnSync } from "node:child_process";

// Windows: before a new bridge starts, it closes an older rempalago-bridge.exe
// still holding the bridge port. Anything else on that port is only reported.
const EXE = "rempalago-bridge.exe";

// PIDs listening on 127.0.0.1:port, from `netstat -ano -p TCP` output.
export function listenerPids(netstat: string, port: number): number[] {
	const pids = new Set<number>();
	for (const line of netstat.split(/\r?\n/)) {
		const cols = line.trim().split(/\s+/);
		if (cols.length < 5 || cols[0] !== "TCP" || cols[3] !== "LISTENING") continue;
		if (cols[1] !== `127.0.0.1:${port}`) continue;
		const pid = Number(cols[4]);
		if (Number.isInteger(pid) && pid > 0) pids.add(pid);
	}
	return [...pids];
}

// Image name from one `tasklist /FO CSV /NH` line: "rempalago-bridge.exe","1234",...
export function imageName(csvLine: string): string {
	return (csvLine.split(",")[0] ?? "").replace(/^"|"$/g, "").toLowerCase();
}

// Closes the older bridges on the port and returns the PIDs it closed.
export function stopOldBridges(port: number, self = process.pid): number[] {
	const netstat = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout ?? "";
	const closed: number[] = [];
	for (const pid of listenerPids(netstat, port)) {
		if (pid === self) continue;
		const task = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).stdout ?? "";
		if (imageName(task.trim().split(/\r?\n/)[0] ?? "") !== EXE) {
			console.warn(`  Otro programa usa el puerto ${port} (PID ${pid}). No lo cierro.\n`);
			continue;
		}
		console.log(`  Cerrando un bridge anterior abierto (PID ${pid}).`);
		spawnSync("taskkill", ["/PID", String(pid), "/F"], { stdio: "ignore" });
		closed.push(pid);
	}
	return closed;
}
