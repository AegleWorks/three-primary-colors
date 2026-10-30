export interface Round {
	name: string;
	// "la final": the round inside a sentence
	the: string;
	bestOf: number;
	bans: number;
	next?: string;
	title?: string;
	short?: string;
	exhibition?: boolean;
}

// The tournament's rounds. Plain data in a module of its own, so the control
// panel can list them without pulling in the overlay (stage.js boots the
// broadcast on import, and the bundler would ship it to the panel too).
export const ROUNDS: Record<string, Round> = {
	ro64: { name: "Ronda de 64", the: "la ronda de 64", bestOf: 9, bans: 1, next: "ro32" },
	ro32: { name: "Ronda de 32", the: "la ronda de 32", bestOf: 9, bans: 1, next: "ro16" },
	ro16: { name: "Octavos de final", the: "los octavos de final", bestOf: 11, bans: 2, next: "qf" },
	qf: { name: "Cuartos de final", the: "los cuartos de final", bestOf: 11, bans: 2, next: "sf" },
	sf: { name: "Semifinal", the: "la semifinal", bestOf: 13, bans: 2, next: "f" },
	third: { name: "Tercer puesto", the: "el tercer puesto", bestOf: 13, bans: 2, title: "Tercer puesto de Rempalago 3", short: "Tercer puesto" },
	f: { name: "Final", the: "la final", bestOf: 13, bans: 2, title: "Campeón de Rempalago 3", short: "Campeón" },
	show: { name: "Showmatch del staff", the: "el showmatch del staff", bestOf: 9, bans: 0, title: "Gana el showmatch del staff", short: "Showmatch", exhibition: true },
};
