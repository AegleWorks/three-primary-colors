/* ══════════════════════════════════════════════════════════════
   REMPALAGO 3 · PROPUESTA — interacciones del estudio
   Sin dependencias. Todo corre en el navegador.
   ══════════════════════════════════════════════════════════════ */

(() => {
	'use strict';

	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

	const stage = $('#stage');
	const stageWrap = $('#stageWrap');
	const stageShell = $('#stageShell');
	const caption = $('#stageCaption');
	const chokeLayer = $('#chokeLayer');
	const chokeTitle = $('#chokeTitle');
	const chokePlayer = $('#chokePlayer');
	const chokeCombo = $('#chokeCombo');
	const chokeTag = $('#chokeTag');
	const matchPointBtn = $('#matchPointBtn');
	const sfxBtn = $('#sfxBtn');
	const navAudio = $('#navAudio');
	const navTime = $('#navTime');
	const sectorLabel = $('#sectorLabel');
	const sceneWipe = $('#sceneWipe');
	const wipeLabel = $('#wipeLabel');
	const stageToast = $('#stageToast');
	const crtBtn = $('#crtBtn');
	const playBtn = $('#playBtn');
	const fsBtn = $('#fsBtn');
	const hero = $('.hero');
	const heroCanvas = $('#heroParticles');
	const versus = $('.versus');

	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	if (!stage || !stageWrap) return;

	/* ── escalado 1920×1080 → ancho disponible ────────────────── */
	function fitStage() {
		const width = stageWrap.clientWidth;
		if (!width) return;
		stage.style.transform = `scale(${width / 1920})`;
	}

	fitStage();
	if ('ResizeObserver' in window) {
		new ResizeObserver(fitStage).observe(stageWrap);
	}
	window.addEventListener('resize', fitStage);
	document.addEventListener('fullscreenchange', () => setTimeout(fitStage, 60));

	/* ── escenas ──────────────────────────────────────────────── */
	const captions = {
		intro: 'El reto: dos cartas gigantes, rank, top play y mapa firma. Entra con un slash tricolor y sale con un wipe al mapa.',
		draft: 'La mesa: pool completo, turnos, timer, bans y protects. La última acción queda siempre a la vista.',
		gameplay: 'El duelo: series, momentum, statcast y mapa en una sola franja. El gameplay queda libre y todo se lee de un vistazo.',
		result: 'El veredicto: MVP del mapa, progresión de score, stat line y contexto de la serie. Se cierra con historia.',
		champion: 'La ceremonia: bracket, confeti, trofeo y créditos. El último plano del torneo también es parte del show.',
	};

	const sceneNames = Object.keys(captions);
	const sceneLabels = {
		intro: '01 // INTRO',
		draft: '02 // DRAFT',
		gameplay: '03 // GAMEPLAY',
		result: '04 // RESULTADO',
		champion: '05 // CAMPEÓN',
	};
	let currentScene = 'gameplay';
	let wipeTimer = null;
	let toastTimer = null;

	function triggerWipe(name) {
		if (!sceneWipe || !wipeLabel) return;
		wipeLabel.textContent = sceneLabels[name] || name.toUpperCase();
		sceneWipe.classList.remove('is-on');
		void sceneWipe.offsetWidth;
		sceneWipe.classList.add('is-on');

		if (wipeTimer) window.clearTimeout(wipeTimer);
		wipeTimer = window.setTimeout(() => {
			sceneWipe.classList.remove('is-on');
			wipeTimer = null;
		}, 720);
	}

	function showToast(text) {
		if (!stageToast) return;
		stageToast.textContent = text;
		stageToast.classList.add('is-on');
		if (toastTimer) window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => {
			stageToast.classList.remove('is-on');
			toastTimer = null;
		}, 1800);
	}

	function setScene(name, { scroll = false, wipe = true } = {}) {
		if (!sceneNames.includes(name)) return;
		const previous = currentScene;
		currentScene = name;
		stage.dataset.scene = name;
		if (wipe && previous !== name) triggerWipe(name);

		$$('.scene', stage).forEach((scene) => {
			scene.classList.toggle('is-active', scene.dataset.scene === name);
		});
		$$('[data-scene-btn]').forEach((btn) => {
			const active = btn.dataset.sceneBtn === name;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-selected', active ? 'true' : 'false');
		});

		if (caption) caption.textContent = captions[name];

		if (name !== 'gameplay') {
			clearChoke();
			stopSim();
		} else {
			startSim();
		}

		if (name === 'champion') startConfetti();
		else stopConfetti();

		if (scroll) {
			$('#estudio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	$$('[data-scene-btn]').forEach((btn) => {
		btn.addEventListener('click', () => setScene(btn.dataset.sceneBtn));
	});

	$$('[data-open-scene]').forEach((el) => {
		el.addEventListener('click', () => {
			setScene(el.dataset.openScene, { scroll: true });
		});
	});

	$$('[data-choke]').forEach((btn) => {
		btn.addEventListener('click', (event) => {
			event.stopPropagation();
			const side = btn.dataset.choke;
			setScene('gameplay', { scroll: true });
			window.setTimeout(() => triggerChoke(side), 900);
		});
	});

	// Watermark de star rating en las cartas del draft, sin duplicar markup.
	$$('.mapcard').forEach((card) => {
		const sr = card.querySelector('.mc-foot span');
		if (sr) card.dataset.sr = sr.textContent.trim();
	});

	/* ── pieles ───────────────────────────────────────────────── */
	const themeLabels = { broadcast: 'BROADCAST', neon: 'NEÓN', gala: 'GALA' };

	function setTheme(name, { toast = true } = {}) {
		stage.dataset.theme = name;
		$$('[data-theme-btn]').forEach((btn) => {
			const active = btn.dataset.themeBtn === name;
			btn.classList.toggle('is-active', active);
			btn.setAttribute('aria-pressed', active ? 'true' : 'false');
		});
		if (toast) showToast(`PIEL // ${themeLabels[name] || name.toUpperCase()}`);
	}

	$$('[data-theme-btn]').forEach((btn) => {
		btn.addEventListener('click', () => setTheme(btn.dataset.themeBtn));
	});

	$$('[data-theme-jump]').forEach((btn) => {
		btn.addEventListener('click', () => {
			setTheme(btn.dataset.themeJump);
			setScene('gameplay', { scroll: true });
		});
	});

	/* ── selector de build / loadout ──────────────────────────── */
	$$('.choice[data-choice-group]').forEach((btn) => {
		btn.setAttribute('aria-pressed', btn.classList.contains('is-selected') ? 'true' : 'false');
		btn.addEventListener('click', () => {
			const group = btn.dataset.choiceGroup;
			$$(`.choice[data-choice-group="${group}"]`).forEach((option) => {
				const on = option === btn;
				option.classList.toggle('is-selected', on);
				option.setAttribute('aria-pressed', on ? 'true' : 'false');
			});

			const slot = $(`.loadout-slots [data-slot="${group}"]`);
			if (slot) slot.textContent = btn.dataset.choiceValue;
		});
	});

	function themeForSkin(skin) {
		if (skin === 'Neón') return 'neon';
		if (skin === 'Gala') return 'gala';
		return 'broadcast';
	}

	$('#buildBtn')?.addEventListener('click', () => {
		const selectedSkin = $('.choice[data-choice-group="skin"].is-selected')?.dataset.choiceValue || 'Híbrido';
		setTheme(themeForSkin(selectedSkin), { toast: false });
		setScene('gameplay', { scroll: true });
		window.setTimeout(() => showToast(`BUILD // ${selectedSkin.toUpperCase()} · HUD FIRST`), 900);
	});

	$('#toTop')?.addEventListener('click', () => {
		window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
	});

	/* ── simulación de partida ────────────────────────────────── */
	const sim = {
		left: 812345,
		right: 798120,
		comboL: 842,
		comboR: 731,
		missL: 0,
		missR: 1,
		accL: 99.32,
		accR: 98.91,
		urL: 71.4,
		urR: 76.8,
		sbR: 0,
	};

	const els = {
		scoreL: $('#scoreL'),
		scoreR: $('#scoreR'),
		diff: $('#scoreDiff'),
		barL: $('#barL'),
		barR: $('#barR'),
		comboL: $('#comboL'),
		comboR: $('#comboR'),
		accL: $('#accL'),
		accR: $('#accR'),
		urL: $('#urL'),
		urR: $('#urR'),
		missL: $('#missL'),
		missR: $('#missR'),
		fcL: $('#fcL'),
		sbR: $('#sbR'),
	};

	const format = (n) => Math.round(n).toLocaleString('es-CO').replace(/\./g, ' ');
	let simTimer = null;

	function render() {
		const diff = sim.left - sim.right;
		const share = sim.left + sim.right > 0 ? (sim.left / (sim.left + sim.right)) * 100 : 50;

		if (els.scoreL) els.scoreL.textContent = format(sim.left);
		if (els.scoreR) els.scoreR.textContent = format(sim.right);
		if (els.diff) {
			const abs = format(Math.abs(diff));
			els.diff.textContent = `${diff >= 0 ? '+' : '−'}${abs}`;
			els.diff.classList.toggle('is-right', diff < 0);
		}
		if (els.barL) els.barL.style.width = `${share.toFixed(2)}%`;
		if (els.barR) els.barR.style.width = `${(100 - share).toFixed(2)}%`;

		if (els.comboL) els.comboL.textContent = format(sim.comboL);
		if (els.comboR) els.comboR.textContent = format(sim.comboR);
		if (els.accL) els.accL.textContent = `${sim.accL.toFixed(2)}%`;
		if (els.accR) els.accR.textContent = `${sim.accR.toFixed(2)}%`;
		if (els.urL) els.urL.textContent = sim.urL.toFixed(1);
		if (els.urR) els.urR.textContent = sim.urR.toFixed(1);
		if (els.missL) els.missL.textContent = String(sim.missL);
		if (els.missR) els.missR.textContent = String(sim.missR);

		if (els.fcL) {
			els.fcL.textContent = sim.missL === 0 ? 'FC' : 'NO FC';
			els.fcL.style.opacity = sim.missL === 0 ? '1' : '.7';
		}

		if (els.sbR) {
			els.sbR.textContent = `${sim.sbR} SB`;
			els.sbR.style.display = sim.sbR > 0 ? 'inline-block' : 'none';
		}
	}

	function startSim() {
		if (simTimer) return;
		simTimer = window.setInterval(() => {
			const pace = 4300 + Math.random() * 2400;
			sim.left += Math.round(pace * (0.88 + Math.random() * 0.3));
			sim.right += Math.round(pace * (0.88 + Math.random() * 0.3));

			if (Math.random() < 0.7) sim.comboL += 1;
			if (Math.random() < 0.7) sim.comboR += 1;

			render();
		}, 160);
	}

	function stopSim() {
		if (!simTimer) return;
		window.clearInterval(simTimer);
		simTimer = null;
	}

	render();

	// La simulación solo corre cuando el escenario está a la vista.
	if ('IntersectionObserver' in window) {
		const studioObserver = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting && currentScene === 'gameplay') startSim();
			else stopSim();
		}, { threshold: 0.12 });
		studioObserver.observe(stageShell);
	}

	/* ── chokes ───────────────────────────────────────────────── */
	let chokeTimer = null;

	function clearChoke() {
		if (!chokeLayer) return;
		chokeLayer.classList.remove('is-on');
		chokeLayer.setAttribute('aria-hidden', 'true');
		stage.classList.remove('is-shaking');
		if (chokeTimer) {
			window.clearTimeout(chokeTimer);
			chokeTimer = null;
		}
	}

	function triggerChoke(side) {
		if (!chokeLayer || !chokeTitle || !chokePlayer || !chokeCombo || !chokeTag) return;

		const isLeft = side === 'left';
		const combo = Math.max(isLeft ? sim.comboL : sim.comboR, 480);

		if (isLeft) {
			sim.comboL = 0;
			sim.missL += 1;
			sim.accL = Math.max(90, sim.accL - 0.42);
		} else {
			sim.comboR = 0;
			sim.missR += 1;
			sim.accR = Math.max(90, sim.accR - 0.45);
			sim.sbR += Math.random() > 0.5 ? 1 : 0;
		}
		render();

		chokePlayer.textContent = isLeft ? 'CLIPPY' : 'SOMBRAX79';
		chokeCombo.textContent = `${format(combo)}x`;
		const isRecord = Math.random() > 0.45;
		chokeTag.textContent = isRecord ? 'SESSION BEST SHATTERED' : 'HEARTBREAK CHOKE';
		chokeTitle.textContent = isRecord ? 'CATASTROPHIC CHOKE' : 'COMBO BREAK';
		chokeTitle.dataset.text = chokeTitle.textContent;

		chokeLayer.classList.add('is-on');
		chokeLayer.setAttribute('aria-hidden', 'false');
		stage.classList.add('is-shaking');
		playBoom();

		if (chokeTimer) window.clearTimeout(chokeTimer);
		chokeTimer = window.setTimeout(clearChoke, 2400);
	}

	$('#chokeL')?.addEventListener('click', () => triggerChoke('left'));
	$('#chokeR')?.addEventListener('click', () => triggerChoke('right'));

	/* ── match point ──────────────────────────────────────────── */
	let matchPoint = false;
	matchPointBtn?.addEventListener('click', () => {
		matchPoint = !matchPoint;
		stage.classList.toggle('is-matchpoint', matchPoint);
		matchPointBtn.classList.toggle('is-active', matchPoint);
		matchPointBtn.setAttribute('aria-pressed', String(matchPoint));
		matchPointBtn.textContent = matchPoint ? '★ Quitar match point' : '★ Match point';
		showToast(matchPoint ? 'MATCH POINT // CLIPPY' : 'SERIE // 3—2');

		const series = $$('.gp-series b', stage);
		if (series.length === 2) {
			series[0].textContent = matchPoint ? '4' : '3';
			series[1].textContent = matchPoint ? '3' : '2';
		}

		const leftPips = $$('.gp-side--l .pips i', stage);
		const rightPips = $$('.gp-side--r .pips i', stage);
		leftPips.forEach((pip, i) => pip.classList.toggle('is-on', i < (matchPoint ? 4 : 3)));
		rightPips.forEach((pip, i) => pip.classList.toggle('is-on', i < (matchPoint ? 3 : 2)));

		if (matchPoint) playChime();
		render();
	});

	/* ── sonido procedural (opt-in) ───────────────────────────── */
	let sfxOn = false;
	let audioCtx = null;

	function ensureAudio() {
		if (!audioCtx) {
			const Ctx = window.AudioContext || window.webkitAudioContext;
			if (!Ctx) return null;
			audioCtx = new Ctx();
		}
		if (audioCtx.state === 'suspended') audioCtx.resume();
		return audioCtx;
	}

	function playBoom() {
		if (!sfxOn) return;
		const ctx = ensureAudio();
		if (!ctx) return;
		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(130, now);
		osc.frequency.exponentialRampToValueAtTime(26, now + 0.4);
		gain.gain.setValueAtTime(0.35, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
		osc.connect(gain).connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.5);
	}

	function playChime() {
		if (!sfxOn) return;
		const ctx = ensureAudio();
		if (!ctx) return;
		const now = ctx.currentTime;
		[523.25, 659.25, 783.99].forEach((freq, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'triangle';
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0.0001, now + i * 0.06);
			gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.06 + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.3);
			osc.connect(gain).connect(ctx.destination);
			osc.start(now + i * 0.06);
			osc.stop(now + i * 0.06 + 0.35);
		});
	}

	function setSfx(on) {
		sfxOn = on;
		if (sfxBtn) {
			sfxBtn.setAttribute('aria-pressed', String(sfxOn));
			sfxBtn.textContent = sfxOn ? '🔊 SFX' : '🔇 SFX';
		}
		if (navAudio) {
			navAudio.setAttribute('aria-pressed', String(sfxOn));
			navAudio.classList.toggle('is-on', sfxOn);
			navAudio.innerHTML = `<span>◉</span> AUDIO ${sfxOn ? 'ON' : 'OFF'}`;
		}
		if (sfxOn) playChime();
	}

	sfxBtn?.addEventListener('click', () => setSfx(!sfxOn));
	navAudio?.addEventListener('click', () => setSfx(!sfxOn));

	/* ── pantalla completa ────────────────────────────────────── */
	function toggleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen?.();
			return;
		}
		const request = stageShell?.requestFullscreen?.();
		if (request && typeof request.catch === 'function') request.catch(() => {});
	}

	function syncFullscreenButton() {
		const isFull = Boolean(document.fullscreenElement);
		if (playBtn) {
			playBtn.textContent = isFull ? '⛶ EXIT' : '⛶ PLAY';
			playBtn.setAttribute('aria-pressed', String(isFull));
		}
		fsBtn?.setAttribute('aria-pressed', String(isFull));
		window.setTimeout(fitStage, 60);
	}

	fsBtn?.addEventListener('click', toggleFullscreen);
	playBtn?.addEventListener('click', toggleFullscreen);
	document.addEventListener('fullscreenchange', syncFullscreenButton);

	/* ── filtro CRT ───────────────────────────────────────────── */
	let crtOn = false;
	crtBtn?.addEventListener('click', () => {
		crtOn = !crtOn;
		stage.classList.toggle('is-crt', crtOn);
		crtBtn.textContent = crtOn ? 'CRT ON' : 'CRT OFF';
		crtBtn.classList.toggle('is-active', crtOn);
		crtBtn.setAttribute('aria-pressed', String(crtOn));
		showToast(crtOn ? 'CRT FILTER // ON' : 'CRT FILTER // OFF');
	});

	/* ── atajos de cabina ─────────────────────────────────────── */
	const sceneKeys = { '1': 'intro', '2': 'draft', '3': 'gameplay', '4': 'result', '5': 'champion' };
	const themeKeys = { q: 'broadcast', w: 'neon', e: 'gala' };

	function chokeFromKey(side) {
		if (currentScene === 'gameplay') {
			triggerChoke(side);
			return;
		}
		setScene('gameplay', { scroll: true });
		window.setTimeout(() => triggerChoke(side), 720);
	}

	document.addEventListener('keydown', (event) => {
		if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target;
		const tag = target?.tagName?.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;

		const key = event.key.toLowerCase();
		if (sceneKeys[key]) {
			event.preventDefault();
			setScene(sceneKeys[key], { scroll: true });
			return;
		}
		if (themeKeys[key]) {
			event.preventDefault();
			setTheme(themeKeys[key]);
			return;
		}
		if (key === 'c' || key === 'v') {
			event.preventDefault();
			chokeFromKey(key === 'c' ? 'left' : 'right');
			return;
		}
		if (key === 'm') {
			event.preventDefault();
			if (currentScene !== 'gameplay') setScene('gameplay', { scroll: true });
			matchPointBtn?.click();
			return;
		}
		if (key === 'f') {
			event.preventDefault();
			toggleFullscreen();
		}
	});

	/* ── confeti ──────────────────────────────────────────────── */
	const canvas = $('#confetti');
	let confettiRaf = null;
	let particles = [];
	let confettiCtx = null;

	const confettiColors = ['#ffd23f', '#3f7bff', '#ff4d5e', '#e8c37a', '#f4f2ec', '#46e6a0'];

	function makeParticle(initial = false) {
		return {
			x: Math.random() * 1920,
			y: initial ? Math.random() * 1080 : -20 - Math.random() * 90,
			w: 5 + Math.random() * 9,
			h: 10 + Math.random() * 16,
			vx: -1.4 + Math.random() * 2.8,
			vy: 2.2 + Math.random() * 4.4,
			rot: Math.random() * Math.PI,
			vr: -0.08 + Math.random() * 0.16,
			color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
		};
	}

	function drawConfetti() {
		if (!confettiCtx) return;
		confettiCtx.clearRect(0, 0, 1920, 1080);

		for (const p of particles) {
			p.x += p.vx;
			p.y += p.vy;
			p.rot += p.vr;

			if (p.y > 1100) {
				Object.assign(p, makeParticle(false));
			}
			if (p.x < -20) p.x = 1940;
			if (p.x > 1940) p.x = -20;

			confettiCtx.save();
			confettiCtx.translate(p.x, p.y);
			confettiCtx.rotate(p.rot);
			confettiCtx.fillStyle = p.color;
			confettiCtx.globalAlpha = 0.92;
			confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
			confettiCtx.restore();
		}

		confettiRaf = window.requestAnimationFrame(drawConfetti);
	}

	function startConfetti() {
		if (reduceMotion || !canvas) return;
		confettiCtx = canvas.getContext('2d');
		if (!confettiCtx) return;
		particles = Array.from({ length: 170 }, () => makeParticle(true));
		if (!confettiRaf) drawConfetti();
	}

	function stopConfetti() {
		if (confettiRaf) {
			window.cancelAnimationFrame(confettiRaf);
			confettiRaf = null;
		}
		particles = [];
		confettiCtx?.clearRect(0, 0, 1920, 1080);
	}

	/* ── reloj de la transmisión ──────────────────────────────── */
	function updateClock() {
		const now = new Date();
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		const ss = String(now.getSeconds()).padStart(2, '0');
		if (navTime) navTime.textContent = `${hh}:${mm}:${ss}`;
	}
	updateClock();
	window.setInterval(updateClock, 1000);

	/* ── riel de capítulos + sector ───────────────────────────── */
	const chapterLinks = $$('.chapter-rail a');
	const chapterSections = chapterLinks
		.map((link) => ({ link, section: document.getElementById(link.dataset.chapter) }))
		.filter((item) => item.section);

	function updateChapter() {
		const marker = window.innerHeight * 0.36;
		let active = null;

		for (const item of chapterSections) {
			const rect = item.section.getBoundingClientRect();
			if (rect.top <= marker && rect.bottom > marker) {
				active = item.link;
				break;
			}
		}

		if (!active) {
			const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
			if (atBottom) active = chapterSections[chapterSections.length - 1]?.link ?? null;
		}

		chapterLinks.forEach((link) => {
			const on = link === active;
			link.classList.toggle('is-active', on);
			if (on) link.setAttribute('aria-current', 'location');
			else link.removeAttribute('aria-current');
		});

		if (!sectorLabel) return;
		if (active) {
			const num = active.querySelector('b')?.textContent?.trim() || '00';
			const name = active.querySelector('span')?.textContent?.trim() || 'NORTE';
			sectorLabel.textContent = `SECTOR ${num} // ${name}`;
		} else {
			sectorLabel.textContent = 'SECTOR 00 // ARENA';
		}
	}

	/* ── partículas del hero ──────────────────────────────────── */
	let heroRaf = null;
	let heroCtx = null;
	let heroW = 0;
	let heroH = 0;
	let heroPoints = [];

	function resizeHeroParticles() {
		if (!heroCanvas || !hero || reduceMotion) return;
		heroCtx = heroCtx || heroCanvas.getContext('2d');
		if (!heroCtx) return;

		heroW = hero.clientWidth;
		heroH = hero.clientHeight;
		if (!heroW || !heroH) return;

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		heroCanvas.width = Math.round(heroW * dpr);
		heroCanvas.height = Math.round(heroH * dpr);
		heroCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const palette = ['255, 210, 63', '63, 123, 255', '255, 77, 94', '244, 242, 236'];
		const count = Math.min(56, Math.max(18, Math.round(heroW / 26)));
		heroPoints = Array.from({ length: count }, () => ({
			x: Math.random() * heroW,
			y: Math.random() * heroH,
			r: 0.6 + Math.random() * 1.8,
			vx: -0.08 + Math.random() * 0.16,
			vy: -0.05 - Math.random() * 0.2,
			a: 0.14 + Math.random() * 0.4,
			color: palette[Math.floor(Math.random() * palette.length)],
		}));
	}

	function drawHeroParticles() {
		if (!heroCtx) return;
		heroCtx.clearRect(0, 0, heroW, heroH);

		for (const p of heroPoints) {
			p.x += p.vx;
			p.y += p.vy;
			if (p.y < -12) {
				p.y = heroH + 12;
				p.x = Math.random() * heroW;
			}
			if (p.x < -12) p.x = heroW + 12;
			if (p.x > heroW + 12) p.x = -12;

			heroCtx.beginPath();
			heroCtx.fillStyle = `rgba(${p.color}, ${p.a})`;
			heroCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
			heroCtx.fill();
		}

		heroRaf = window.requestAnimationFrame(drawHeroParticles);
	}

	function startHeroParticles() {
		if (!heroCtx || heroRaf || reduceMotion) return;
		heroRaf = window.requestAnimationFrame(drawHeroParticles);
	}

	function stopHeroParticles() {
		if (!heroRaf) return;
		window.cancelAnimationFrame(heroRaf);
		heroRaf = null;
	}

	if (heroCanvas && hero && !reduceMotion) {
		resizeHeroParticles();
		window.addEventListener('resize', resizeHeroParticles);
		document.fonts?.ready.then(resizeHeroParticles).catch(() => {});
		if ('IntersectionObserver' in window) {
			new IntersectionObserver(([entry]) => {
				if (entry.isIntersecting) startHeroParticles();
				else stopHeroParticles();
			}, { threshold: 0 }).observe(hero);
		} else {
			startHeroParticles();
		}
	}

	/* ── inclinación de la tarjeta VS ─────────────────────────── */
	function setupVersusTilt() {
		if (!versus || reduceMotion) return;
		if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

		let frame = null;
		versus.addEventListener('pointermove', (event) => {
			if (frame) return;
			frame = window.requestAnimationFrame(() => {
				frame = null;
				const rect = versus.getBoundingClientRect();
				const x = (event.clientX - rect.left) / rect.width - 0.5;
				const y = (event.clientY - rect.top) / rect.height - 0.5;
				const rotateX = (-y * 7).toFixed(2);
				const rotateY = (x * 9).toFixed(2);
				versus.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
			});
		});

		versus.addEventListener('pointerleave', () => {
			if (frame) {
				window.cancelAnimationFrame(frame);
				frame = null;
			}
			versus.style.transform = '';
		});
	}
	setupVersusTilt();

	/* ── filtros de features ──────────────────────────────────── */
	$$('.filter').forEach((btn) => {
		btn.addEventListener('click', () => {
			const filter = btn.dataset.filter;
			$$('.filter').forEach((b) => b.classList.toggle('is-active', b === btn));
			$$('.feat').forEach((card) => {
				const show = filter === 'all' || card.dataset.tier === filter;
				card.classList.toggle('is-hidden', !show);
			});
		});
	});

	/* ── revelado al scroll ───────────────────────────────────── */
	const revealEls = $$('.reveal');
	if ('IntersectionObserver' in window && !reduceMotion) {
		const io = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add('in');
					io.unobserve(entry.target);
				}
			});
		}, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });

		revealEls.forEach((el, i) => {
			el.style.setProperty('--delay', `${(i % 6) * 55}ms`);
			io.observe(el);
		});
	} else {
		revealEls.forEach((el) => el.classList.add('in'));
	}

	/* ── barra de progreso ────────────────────────────────────── */
	const progressBar = $('#progressBar');
	function updateProgress() {
		const scrollable = document.documentElement.scrollHeight - window.innerHeight;
		const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
		if (progressBar) progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
	}

	let scrollFrame = null;
	function onScroll() {
		if (scrollFrame) return;
		scrollFrame = window.requestAnimationFrame(() => {
			scrollFrame = null;
			updateProgress();
			updateChapter();
		});
	}

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onScroll);
	updateProgress();
	updateChapter();

	/* ── arranque ─────────────────────────────────────────────── */
	setScene('gameplay', { wipe: false });
	setTheme('broadcast', { toast: false });
	setSfx(false);
	syncFullscreenButton();
	crtBtn?.setAttribute('aria-pressed', 'false');
	matchPointBtn?.setAttribute('aria-pressed', 'false');

	// Pequeño respiro para que el layout esté listo antes del primer frame.
	window.setTimeout(fitStage, 120);
	window.addEventListener('load', fitStage);
})();
