#!/usr/bin/env node
/*
 * Auditoría de ataques (2026-11-07): ¿cada mejora de nivel y cada evolución hace lo que dice su carta?
 *
 *   node tools/auditoria-ataques.cjs                    tabla en la consola (sólo lo que falla) y resumen
 *   node tools/auditoria-ataques.cjs --md f.md          y la tabla completa en Markdown (ataque × nivel × escenario)
 *   node tools/auditoria-ataques.cjs --json f.json      y todos los números
 *   node tools/auditoria-ataques.cjs --solo ember,hex   sólo esos
 *   node tools/auditoria-ataques.cjs --tabla --md docs/AUDITORIA-ATAQUES.md   rehace la tabla de los tests y la del documento
 *
 * Con el sandbox (tools/sandbox.cjs: el combate de verdad sin ventana, Pokémon estándar inmortal) mide cada ataque a cada
 * nivel y evolucionado en los tres escenarios (solo, masa, horda), con dos pruebas por escenario: 8 s seguidos y un solo
 * lanzamiento. Luego, para cada mejora:
 *   1. lee su carta (español e inglés) y saca lo que promete: «+45% daño», «-25% recarga», «+1 proyectil», «+30% radio»...
 *   2. comprueba que lo prometido es lo que cambia en los números (mods) del ataque;
 *   3. comprueba en el motor que cada número que cambia se nota: +1 proyectil = sale uno más, más radio = toca a más en la
 *      masa, más daño = cada golpe quita más (y cuánto), menos recarga = se lanza más a menudo (y cuánto)...
 * Las evoluciones, igual con su texto; y las palabras que prometen algo que se puede ver (cura, aturde, frena, atrae,
 * quema, envenena, crítico, escudo...) se buscan en lo que hace el ataque evolucionado.
 */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const SB = require('./sandbox.cjs');
const G = SB.G, M = G.Moves;
const ROOT = path.join(__dirname, '..');

const argv = process.argv.slice(2);
const val = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = val('solo') ? new Set(val('solo').split(',')) : null;
const SCENS = ['solo', 'masa', 'horda'];
const SECS = 8, ONCE = 6;

// ---------------- inglés: el diccionario de verdad ----------------
function english() {
  const dev = fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8');
  const dicts = [...dev.matchAll(/src="(js\/data\/lang-[^"]+\.js)"/g)].map(m => m[1]);
  const ctx = { G: {}, navigator: { language: 'en', languages: ['en'] }, location: { pathname: '/' },
    localStorage: { getItem: k => (k === 'ps.lang' ? 'en' : null), setItem() {}, removeItem() {} },
    document: { documentElement: {}, write() {} }, CanvasRenderingContext2D: class { fillText() {} strokeText() {} measureText() { return { width: 1 }; } },
    confirm() {}, alert() {}, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  load('js/core/locales.js'); load('js/core/i18n.js');
  dicts.forEach(load);
  return s => ctx.G.I18n.t(s);
}
const EN = english();

// ---------------- lo que promete una carta ----------------
const num = s => parseFloat(String(s).replace(',', '.'));
/**
 * Promesas con número de un texto (es o en): [{ kind: 'pct'|'mul'|'add', v, word }].
 *  pct: «+45% daño», «-25% recarga», «un 30% más grandes», «40% more often»; mul: «×1,8 daño»; add: «+2 proyectiles».
 */
function promises(t) {
  const out = [];
  const s = t.replace(/−/g, '-');
  for (const m of s.matchAll(/([+-])\s?(\d+(?:[.,]\d+)?)\s?%\s*(?:de\s+|of\s+|more\s+|más\s+|de más\s+)?([\p{L}°]+)/gu)) out.push({ kind: 'pct', v: (m[1] === '-' ? -1 : 1) * num(m[2]) / 100, word: m[3].toLowerCase() });
  for (const m of s.matchAll(/(?:un|an?|by)?\s?(\d+(?:[.,]\d+)?)\s?%\s*(más a menudo|more often|más rápido|faster|más seguidas|more often|más|more|longer|wider|bigger|larger)\s*([\p{L}]*)/giu)) {
    if (/[+-]\s?$/.test(s.slice(0, m.index + (m[0].length - m[0].trimStart().length)))) continue;
    const w = /menudo|often|rápido|faster|seguidas/i.test(m[2]) ? 'a menudo' : (m[3] || m[2]);
    out.push({ kind: 'pct', v: num(m[1]) / 100, word: w.toLowerCase(), rel: true });
  }
  for (const m of s.matchAll(/×\s?(\d+(?:[.,]\d+)?)\s*([\p{L}]*)/gu)) out.push({ kind: 'mul', v: num(m[1]), word: m[2].toLowerCase() });
  for (const m of s.matchAll(/(?<![\d%])\+\s?(\d+)(?![\d.,]*\s?%)\s+([\p{L}]+)/gu)) out.push({ kind: 'add', v: +m[1], word: m[2].toLowerCase() });
  return out;
}
const DMG_W = /^(daño|damage|de daño)$/;
const CD_W = /^(recarga|cooldown)$/;
/** ¿Qué número del ataque toca cada palabra? (Lo demás: alcance, radio, tamaño... va a «área».) */
function wordKey(p) {
  const w = p.word;
  if (DMG_W.test(w)) return 'dmg';
  if (CD_W.test(w)) return 'cd';
  if (/^(perforación|pierce|perforaciones)$/.test(w)) return 'pierce';
  if (/^(rebotes?|bounces?)$/.test(w)) return 'bounce';
  if (/^(acumulaci|stacks?|pilas?|max)/.test(w)) return 'stacks';
  if (/^(duración|duration|longer)$/.test(w)) return 'dur';
  if (/^(potencia|power)$/.test(w)) return 'amount';
  if (/^(velocidad|speed)$/.test(w)) return 'speed';
  if (/^(efecto|effect|umbral|al|vida|life|hp|threshold|to)$/.test(w)) return 'pct';
  if (/^(aturdimiento|stun|parálisis|paralysis|sueño|sleep)$/.test(w)) return 'stun';
  if (/^(empuje|knockback|push)$/.test(w)) return 'knock';
  if (/^(crítico|crit)/.test(w)) return 'crit2';
  if (/^(a menudo|often|seguidas|rápido|faster|quickly)$/.test(w)) return 'rate';
  if (p.kind === 'add') return 'count';
  return 'area';
}
// Números del ataque que mueven cada promesa (los de «área» son todos los de tamaño).
const AREA_KEYS = ['radius', 'size', 'width', 'life', 'height', 'arc', 'blast', 'ring', 'range'];
const RATE_KEYS = ['cd', 'rate', 'speed', 'turn'];
const COSMETIC = new Set(['spread']);

/** Valor de la promesa como multiplicador del número (cd: -25% → 0,75; «un 40% más a menudo» → ÷1,4). */
function promisedMul(p) {
  if (p.kind === 'mul') return p.v;
  if (p.kind === 'pct') return 1 + p.v;
  return null;
}

// ---------------- medir ----------------
const cache = new Map();
function stage(id, lvl, evo) {
  const k = id + ':' + lvl + ':' + (evo ? 'e' : '');
  if (cache.has(k)) return cache.get(k);
  const r = {};
  for (const sc of SCENS) {
    const seed = SB.seedOf(id + sc);
    // Los de recarga larga (barridos de pantalla, 15-45 s), lo bastante para lanzarse varias veces; los escudos, 16 s
    // sin que te toquen y luego golpes: cuántos ha guardado.
    const def = M.BY_ID[id], cd = G.Combat.cooldown({ cdMul: 1, abil: null }, M.instance(id, lvl));
    const secs = Math.max(SECS, Math.min(150, cd * 3.2 + 2)), once = Math.max(ONCE, Math.min(20, (def.delay || 0) + 4));
    const calm = def.kind === 'ward' ? 16 : 0;
    r[sc] = { st: SB.run({ id, lvl, evo, scen: sc, secs: secs + calm, seed, calm }), one: SB.run({ id, lvl, evo, scen: sc, secs: once, once: true, seed }) };
  }
  cache.set(k, r);
  return r;
}

const up = (a, b, thr = 0.03) => a != null && b != null && b > a * (1 + thr) + 1e-9;
const ratio = (a, b) => (a > 0 && b != null ? b / a : null);
/** Métricas que deberían subir con cada número (en cada escenario). */
const RISE = {
  count: r => [r.st.blocks, r.st.charges, r.one.spawned, r.one.maxFields, r.one.distinct, r.one.hits, r.st.maxProj, r.st.hits, r.st.maxFields, r.st.distinct, r.one.ctl],
  pierce: r => [r.one.distinct, r.one.hits, r.st.hits],
  bounce: r => [r.one.distinct, r.one.hits, r.st.hits],
  area: r => [r.one.distinct, r.one.reach, r.one.hits, r.st.distinct, r.st.hits, r.one.ctl, r.one.moved],
  dur: r => [r.one.span, r.one.hits, r.one.ctl, r.st.hits, r.one.dot, r.st.dot, r.one.slow, r.buffDur],
  speed: r => [r.st.hits, r.one.hits, r.one.distinct, r.one.reach, r.st.distinct, r.inv(r.one.firstHit)],
  rate: r => [r.st.hits, r.one.hits, r.st.casts],
  turn: r => [r.st.hits, r.one.hits, r.one.distinct],
  stun: r => [r.one.stun, r.one.ctl, r.st.ctl, r.st.stun],
  knock: r => [r.one.knock, r.one.moved, r.st.knock, r.st.moved],
  pull: r => [r.one.moved, r.st.moved, r.one.hits, r.st.hits, r.one.ctl],
  charge: r => [r.st.casts, r.inv(r.one.firstHit), r.st.hits],
  stacks: r => [r.buffN],
  amount: r => [r.buffAmt],
  pct: r => [r.one.dmg, r.st.dmg, r.one.ctl],
  crit2: r => [r.st.critRate],
  heal: r => [r.st.heal, r.one.heal]
};
function view(r) {
  const b = r.st.buff || {};
  return Object.assign({}, r, { buffN: b.n || 0, buffAmt: b.amount || 0, buffDur: b.dur || 0, inv: v => (v > 0 ? 1 / v : null) });
}
/** ¿Sube en algún escenario? → { ok, where: escenario y métrica } */
const METRIC_NAMES = {
  count: ['bloqueos', 'escudos', 'proyectiles', 'campos', 'enemigos tocados', 'golpes', 'proyectiles a la vez', 'golpes/8 s', 'campos/8 s', 'tocados/8 s', 'control'],
  pierce: ['enemigos tocados', 'golpes', 'golpes/8 s'], bounce: ['enemigos tocados', 'golpes', 'golpes/8 s'],
  area: ['enemigos tocados', 'alcance', 'golpes', 'tocados/8 s', 'golpes/8 s', 'control', 'empujados'],
  dur: ['duración', 'golpes', 'control', 'golpes/8 s', 'quemadura/veneno', 'quemadura/veneno 8 s', 'frenado', 'duración del potenciador'],
  speed: ['golpes/8 s', 'golpes', 'tocados', 'alcance', 'tocados/8 s', 'llega antes'], rate: ['golpes/8 s', 'golpes', 'lanzamientos'],
  turn: ['golpes/8 s', 'golpes', 'tocados'], stun: ['aturdimiento', 'control', 'control/8 s', 'aturdimiento/8 s'],
  knock: ['empuje', 'desplazados', 'empuje/8 s', 'desplazados/8 s'], pull: ['desplazados', 'desplazados/8 s', 'golpes', 'golpes/8 s', 'control'],
  charge: ['lanzamientos', 'llega antes', 'golpes/8 s'], stacks: ['pilas'], amount: ['potencia'], pct: ['daño', 'daño/8 s', 'control'],
  crit2: ['críticos'], heal: ['curación/8 s', 'curación']
};
function rises(key, A, B) {
  const f = RISE[key];
  if (!f) return null;
  const per = {};
  let ok = false, where = null;
  for (const sc of SCENS) {
    const a = f(view(A[sc])), b = f(view(B[sc]));
    let best = null;
    for (let i = 0; i < a.length; i++) {
      if (up(a[i], b[i]) || (!(a[i] > 0) && b[i] > 0)) { const q = a[i] > 0 ? b[i] / a[i] : Infinity; if (best == null || q > best.q) best = { q, i }; }
    }
    per[sc] = best ? `${METRIC_NAMES[key][best.i]} ×${fmtQ(best.q)}` : '=';
    if (best && !ok) { ok = true; where = sc; }
  }
  return { ok, per };
}
const fmtQ = q => (q === Infinity ? '∞' : (Math.round(q * 100) / 100).toFixed(2).replace('.', ','));

/** Daño por golpe: el escenario donde más golpes hay de los tres que sirven (solo primero). */
function dmgRatio(A, B) {
  const per = {};
  for (const sc of SCENS) per[sc] = ratio(A[sc].st.perHit, B[sc].st.perHit);
  return per;
}
function cdRatio(A, B) {
  const per = {};
  for (const sc of SCENS) per[sc] = A[sc].st.cdMeasured && B[sc].st.cdMeasured ? B[sc].st.cdMeasured / A[sc].st.cdMeasured : null;
  return per;
}
// (La recarga medida va en pasos de 1/30 s: hasta un fotograma de error.)
const close = (q, want, tol) => q != null && Math.abs(q / want - 1) <= tol;
const pick = per => per.solo != null ? per.solo : per.masa != null ? per.masa : per.horda;

/**
 * Comprueba un paso (de A a B) con mods `mods` y textos es/en. evo: es una evolución (su texto cuenta además lo que hace de
 * nuevo: de él sólo se miran el daño del principio, la recarga y las cantidades). → { promises, checks, issues }
 */
const ADDK = ['count', 'bounce', 'pierce', 'stacks'];
function checkStep(id, mods, tEs, tEn, A, B, mA, mB, evo) {
  const issues = [], checks = [];
  let pe = promises(tEs);
  const pn = promises(tEn);
  // 1. Inglés y español prometen los mismos números.
  const sig = l => l.map(p => p.kind + ':' + Math.round(Math.abs(p.v) * 1000)).sort().join(' ');
  if (sig(pe) !== sig(pn)) issues.push({ k: 'idioma', d: `el inglés promete otros números («${tEn}»)` });
  if (tEn === tEs && /\p{L}{4,}/u.test(tEs)) issues.push({ k: 'idioma', d: 'sin traducir al inglés' });
  // (Evolución: sólo la primera frase, «×1,6 daño, +2 proyectiles...»; lo demás es su mecánica nueva.)
  if (evo) { const first = tEs.split(/\.\s/)[0]; pe = promises(first).filter(p => ['dmg', 'cd', 'count', 'pierce', 'bounce', 'stacks'].includes(wordKey(p))); }
  // 2. Lo prometido está en los números del ataque.
  const keys = Object.keys(mods).filter(k => !COSMETIC.has(k));
  const countRises = () => rises('count', A, B).ok;
  for (const p of pe) {
    const k = wordKey(p);
    const want = promisedMul(p);
    if (k === 'dmg') {
      if (mods.dmg == null) { issues.push({ k: 'texto', d: `promete ${fmtP(p)} de daño y no lo sube` }); continue; }
      if (Math.abs(mods.dmg - want) > 0.011) issues.push({ k: 'texto', d: `promete ${fmtP(p)} de daño y el número es ×${mods.dmg}` });
    } else if (k === 'cd') {
      if (mods.cd == null) { issues.push({ k: 'texto', d: `promete ${fmtP(p)} de recarga y no la cambia` }); continue; }
      if (Math.abs(mods.cd - want) > 0.011) issues.push({ k: 'texto', d: `promete ${fmtP(p)} de recarga y el número es ×${mods.cd}` });
    } else if (ADDK.includes(k)) {
      const mk = k === 'count' && mods.count == null ? keys.find(x => ADDK.includes(x)) || 'count' : k;
      // («+2 lianas a los lados»: no es la cantidad, pero vale si se nota que sale más.)
      if (mods[mk] == null) { if (!countRises()) issues.push({ k: 'texto', d: `promete ${fmtP(p)} ${p.word} y no cambia ${mk}` }); }
      else if (mods[mk] !== p.v) issues.push({ k: 'texto', d: `promete ${fmtP(p)} ${p.word} y suma ${mods[mk]}` });
    } else if (k === 'pct') {
      if (mods.pct == null || Math.abs(mods.pct - p.v) > 0.011) issues.push({ k: 'texto', d: `promete ${fmtP(p)} ${p.word} y suma ${mods.pct}` });
    } else if (k === 'crit2') {
      if (mods.crit2 == null || Math.abs(mods.crit2 - p.v) > 0.011) issues.push({ k: 'texto', d: `promete ${fmtP(p)} de crítico y suma ${mods.crit2}` });
    } else if (k === 'rate') {
      const v = RATE_KEYS.map(x => mods[x]).find(x => x != null);
      if (v == null) issues.push({ k: 'texto', d: `promete ${fmtP(p)} ${p.word} y no cambia el ritmo` });
      else { const got = v < 1 ? 1 / v - 1 : v - 1; if (Math.abs(got - p.v) > 0.05) issues.push({ k: 'texto', d: `promete un ${Math.round(p.v * 100)}% ${p.word} y es un ${Math.round(got * 100)}%` }); }
    } else if (want != null) {
      const cand = (k === 'area' ? AREA_KEYS : [k]).concat(k === 'area' ? [] : AREA_KEYS).map(x => mods[x]).filter(x => x != null);
      if (!cand.length) issues.push({ k: 'texto', d: `promete ${fmtP(p)} ${p.word} y no cambia ningún número` });
      else if (!cand.some(v => Math.abs(v - want) < 0.011)) issues.push({ k: 'texto', d: `promete ${fmtP(p)} ${p.word} y cambia ×${cand.join('/×')}` });
    }
  }
  // 3. El motor: cada número que cambia se nota.
  for (const k of keys) {
    let key = AREA_KEYS.includes(k) ? 'area' : k;
    if (k === 'dmg') {
      // (Evolución: su mecánica nueva añade golpes de otro tamaño; el daño por golpe no sirve. Basta con que pegue más.)
      if (evo) continue;
      // (Barridos: parte del golpe es un % de la vida, que sube con su propia carta; basta con que el golpe suba.)
      if (mA && mA.kind === 'wipe') { const r = rises('pct', A, B); checks.push({ key: 'dmg', per: r.per, ok: r.ok }); if (!r.ok) issues.push({ k: 'motor', d: 'más daño y no se nota' }); continue; }
      const per = dmgRatio(A, B), q = pick(per);
      const p = pe.find(x => wordKey(x) === 'dmg');
      const want = p ? promisedMul(p) : mods.dmg;
      // (Más de lo prometido vale: es un aviso, no un fallo.)
      const ok = close(q, want, 0.06) || (q != null && q > want);
      checks.push({ key: 'dmg', want, got: q, per, ok });
      if (q == null) { if (!(mA && M.nonAttacking(mA.kind))) issues.push({ k: 'motor', d: 'no se ha podido medir el daño por golpe' }); }
      else if (!ok) issues.push({ k: q < want ? 'motor' : 'aviso', d: `${p ? 'promete' : 'sube'} ×${fmtQ(want)} de daño y cada golpe hace ×${fmtQ(q)}` });
      continue;
    }
    if (k === 'cd') {
      // Vale en el escenario donde mejor se ve: en otros espera a tener a alguien a tiro (su propio empujón los aleja).
      // Y vale si baja lo que dice aunque haya una espera fija (Escudo Real: 3 s de Forma Filo sin escudos nuevos).
      const per = cdRatio(A, B), cdA = G.Combat.cooldown({ cdMul: 1, abil: null }, mA), cdB = G.Combat.cooldown({ cdMul: 1, abil: null }, mB);
      const okIn = sc => per[sc] != null && (close(per[sc], mods.cd, 0.08) ||
        Math.abs((B[sc].st.cdMeasured - A[sc].st.cdMeasured) - (cdB - cdA)) < 0.1);
      const best = SCENS.find(okIn);
      const q = best ? per[best] : pick(per);
      const ok = !!best;
      checks.push({ key: 'cd', want: mods.cd, got: q, per, ok });
      if (q != null && !ok) issues.push({ k: q > mods.cd ? 'motor' : 'aviso', d: `recarga ×${fmtQ(mods.cd)} y se lanza cada ×${fmtQ(q)}` });
      if (q != null && !ok && q < mods.cd) checks[checks.length - 1].ok = true;
      if (q == null) { const r = rises('rate', A, B); checks.push({ key: 'cd', per: r.per, ok: r.ok }); if (!r.ok) issues.push({ k: 'motor', d: 'menos recarga y no se nota' }); }
      continue;
    }
    if (!RISE[key]) continue;
    const r = rises(key, A, B);
    // Más alcance que no se nota rodeado (eligen a los N más cercanos, saltan hasta el blanco...): hasta dónde llega.
    if (!r.ok && (key === 'area' || key === 'speed') && mA && mB) {
      const ra = SB.maxReach(id, mA.lvl, !!mA.evolved), rb = SB.maxReach(id, mB.lvl, !!mB.evolved);
      if (rb > ra) { r.ok = true; r.per.solo = `alcance ${ra}→${rb} px`; }
    }
    // Revisado a mano: lo que mide ese número en su mecánica (ver REVIEW).
    const rv = REVIEW[id + ':' + k];
    if (!r.ok && rv) { const q = SCENS.map(sc => [sc, rv.f(view(A[sc])), rv.f(view(B[sc]))]).find(([, a, b]) => up(a, b)); if (q) { r.ok = true; r.per[q[0]] = `${rv.name} ×${fmtQ(q[2] / q[1])}`; } }
    checks.push({ key: k, per: r.per, ok: r.ok });
    if (!r.ok) issues.push({ k: 'motor', d: `cambia ${k} (${fmtMod(k, mods[k])}) y no se nota en ningún escenario` });
  }
  // 4. El daño baja sin decirlo (DMG_K, el equilibrio por niveles).
  if (!evo && mods.dmg == null && mA && mB && mA.dmg && mB.dmg && mB.dmg < mA.dmg * 0.97) {
    issues.push({ k: 'oculto', d: `el daño baja un ${Math.round((1 - mB.dmg / mA.dmg) * 100)}% sin decirlo` });
  }
  return { promises: pe, checks, issues };
}
const fmtP = p => (p.kind === 'mul' ? '×' + String(p.v).replace('.', ',') : p.kind === 'add' ? '+' + p.v : (p.v > 0 ? '+' : '') + Math.round(p.v * 100) + '%');
const fmtMod = (k, v) => (['count', 'pierce', 'bounce', 'stacks', 'pct', 'crit2'].includes(k) ? '+' + v : '×' + v);

/*
 * Revisados a mano (combat.js): números que esa mecánica usa para otra cosa que lo de la familia. f: la métrica que sube.
 */
const REVIEW = {
  // Giro Fuego: cada llama de la jaula suma un tercio de su daño (atk × n / 3).
  'fire-spin:count': { name: 'daño por golpe', f: r => r.st.perHit }
};

/** Lo que promete una evolución y el sandbox no puede provocar (leído en combat.js). */
const SIGN_REVIEW = {
  // Cuerpo Pesado: sólo quieto y cuando un enemigo te TOCA (touch3); el giro los aparta antes de que lleguen.
  'gyro-ball:aturde': 'quieto, al tocarte (combat.js touch3)'
};

// ---------------- evoluciones: palabras que prometen algo visible ----------------
const SIGNS = [
  { re: /\bcur(a|as|an|ar|ación)\b/i, f: r => r.st.heal + r.one.heal, name: 'cura' },
  { re: /aturd|parali/i, f: r => r.st.stun + r.st.ctl + r.one.ctl, name: 'aturde' },
  // («no te frenan», «te quita los frenazos»: es de ti, no de ellos.)
  { re: /(?<!no te )(?<!quita los )\bfren(a|an|ando)\b|ralentiz/i, f: r => r.st.slow + r.st.ctl, name: 'frena' },
  { re: /\bquem/i, f: r => r.st.dot, name: 'quema' },
  { re: /envenen|venen|tóxic/i, f: r => r.st.dot, name: 'envenena' },
  { re: /\batra(e|en|yendo)\b|arrastr/i, f: r => r.st.moved + r.one.moved, name: 'atrae' },
  { re: /\bempuj|aparta|lanza(s)? lejos/i, f: r => r.st.moved + r.st.knock, name: 'empuja' },
  { re: /crític/i, f: r => r.st.critRate, name: 'crítico' },
  { re: /duerm|dormid/i, f: r => r.st.ctl, name: 'duerme' },
  { re: /confun|confus|marionet/i, f: r => r.st.ctl, name: 'confunde' }
];

// ---------------- todo ----------------
/** Toda la auditoría (o sólo los ataques de `only`). → filas: una por mejora de nivel y una por evolución. */
function audit(only) {
const rows = [];
for (const id of Object.keys(M.BY_ID).filter(x => !only || only.has(x))) {
  const d = M.BY_ID[id];
  for (let l = 1; l < d.maxLvl; l++) {
    const up1 = d.ups[l - 1];
    const A = stage(id, l, false), B = stage(id, l + 1, false);
    const mA = M.instance(id, l), mB = M.instance(id, l + 1);
    const c = checkStep(id, up1.m, up1.t, EN(up1.t), A, B, mA, mB);
    rows.push({ id, name: d.name, kind: d.kind, step: `${l}→${l + 1}`, t: up1.t, en: EN(up1.t), mods: up1.m, ...c });
  }
  if (M.EVO[id]) {
    const mx = M.instance(id, d.maxLvl), e = M.instance(id, d.maxLvl);
    if (M.evolve(e)) {
      const mods = M.EVO[id][2] && M.EVO[id][2].mods ? M.EVO[id][2].mods : M.EVO_MODS[d.kind] ? M.EVO_MODS[d.kind].m : {};
      const t = M.EVO[id][2] && M.EVO[id][2].t ? M.EVO[id][2].t : M.EVO_MODS[d.kind] ? M.EVO_MODS[d.kind].t : '';
      const A = stage(id, d.maxLvl, false), B = stage(id, d.maxLvl, true);
      const c = checkStep(id, mods, t, EN(t), A, B, mx, e, true);
      // Lo visible que promete el texto de la evolución, ¿lo hace?
      for (const s of SIGNS) {
        if (!s.re.test(t)) continue;
        let got = SCENS.some(sc => s.f(view(B[sc])) > 0);
        // («Quieto...»: lo que hace parado, en la horda sin moverte.)
        if (!got && /quieto/i.test(t)) { const q = SB.run({ id, lvl: d.maxLvl, evo: true, scen: 'horda', secs: SECS, still: true, seed: 3 }); got = s.f(view({ st: q, one: q })) > 0; }
        const rv = SIGN_REVIEW[id + ':' + s.name];
        if (!got && rv) c.checks.push({ key: s.name, per: { solo: 'revisado: ' + rv }, ok: true });
        else if (!got) c.issues.push({ k: 'motor', d: `el texto dice «${s.name}» y evolucionado no se ve en ningún escenario` });
      }
      // Pega más que al nivel máximo en algún escenario (la norma fuerte la mira tests/evoluciones.test.cjs).
      const better = SCENS.some(sc => B[sc].st.dps > A[sc].st.dps * 1.02 || B[sc].st.heal > A[sc].st.heal || B[sc].st.blocks > A[sc].st.blocks || B[sc].st.ctl > A[sc].st.ctl * 1.02 || ((B[sc].st.buff || {}).total || 0) > ((A[sc].st.buff || {}).total || 0));
      if (!better && !(M.nonAttacking(d.kind))) c.issues.push({ k: 'motor', d: 'evolucionado no hace más en ningún escenario' });
      rows.push({ id, name: d.name, kind: d.kind, step: 'evo', evoName: M.EVO[id][0], t, en: EN(t), mods, ...c });
    }
  }
}
return rows;
}
module.exports = { audit, promises, wordKey };
if (require.main !== module) return;
const t0 = Date.now();
const ids = Object.keys(M.BY_ID).filter(id => !ONLY || ONLY.has(id));
const rows = audit(ONLY);
const secs = (Date.now() - t0) / 1000;

// ---------------- salida ----------------
const bad = rows.filter(r => r.issues.some(i => i.k !== 'aviso'));
const count = k => rows.reduce((s, r) => s + r.issues.filter(i => i.k === k).length, 0);
console.log(`${ids.length} ataques, ${rows.length} mejoras y evoluciones, ${secs.toFixed(1)} s. Con algún fallo: ${bad.length} ` +
            `(texto ${count('texto')}, motor ${count('motor')}, daño oculto ${count('oculto')}, idioma ${count('idioma')}; avisos ${count('aviso')}).`);
if (!argv.includes('--callado')) for (const r of bad) console.log(`${r.id} ${r.step} «${r.t}»: ` + r.issues.filter(i => i.k !== 'aviso').map(i => `[${i.k}] ${i.d}`).join('; '));

const perTxt = c => SCENS.map(sc => { const v = c.per && c.per[sc]; return v == null ? '–' : typeof v === 'number' ? '×' + fmtQ(v) : v; });
if (val('md')) {
  const L = [];
  L.push('| Ataque | Paso | Promete | Número | Solo | Masa | Horda | Resultado |', '|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const res = r.issues.length ? r.issues.map(i => (i.k === 'aviso' ? 'ⓘ ' : '✗ ') + i.d).join('; ') : '✓';
    if (!r.checks.length) L.push(`| ${r.name} | ${r.step} | ${r.t} | — | – | – | – | ${res} |`);
    r.checks.forEach((c, i) => {
      const [a, b, h] = perTxt(c);
      L.push(`| ${i ? '' : r.name} | ${i ? '' : r.step} | ${i ? '' : r.t} | ${c.key}${c.want != null ? ' ×' + fmtQ(c.want) : ''} | ${a} | ${b} | ${h} | ${i ? '' : res} |`);
    });
  }
  fs.writeFileSync(val('md'), L.join('\n') + '\n');
}
// (--tabla: la que fija tests/auditoria-ataques.test.cjs, y la de docs/AUDITORIA-ATAQUES.md.)
const slim = r => ({ id: r.id, step: r.step, t: r.t, en: r.en, mods: r.mods, checks: r.checks.map(c => ({ key: c.key, ok: c.ok, per: c.per })), issues: r.issues });
if (argv.includes('--tabla')) fs.writeFileSync(path.join(ROOT, 'tests/auditoria-ataques.tabla.json'), JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), rows: rows.map(slim) }, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)) + '\n');
if (val('json')) fs.writeFileSync(val('json'), JSON.stringify({ rows: rows.map(r => ({ id: r.id, step: r.step, t: r.t, en: r.en, mods: r.mods, checks: r.checks, issues: r.issues })) }, null, 1));
