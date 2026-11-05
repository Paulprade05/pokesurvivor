/* ============ medir-pokemon.cjs — lo que rinde cada Pokémon en su evolución final (2026-11-04) ============
 *
 * Pedido del dueño: «quiero que midas todos los ataques y todos los pokemon en evolución final».
 * Lee lo que mide tools/balance.cjs (combate de verdad, sin azar) y, para cada Pokémon sin evolución
 * posterior (G.Fam.isFinal), saca su mejor equipo de ataques realista.
 *
 *   node tools/balance.cjs --pasivos --todas --json bal.json
 *   node tools/medir-pokemon.cjs bal.json > docs/ESTUDIO-POKEMON.md
 *   node tools/medir-pokemon.cjs bal.json --antes bal-main.json --bot carpeta1,carpeta2 --botantes carpeta3   (contraste)
 *
 * Qué rinde un ataque con un Pokémon (Player.atkFor):
 *   DPS medido con 1 de ataque (todas las pasivas, evolucionado si tiene evolución)
 *   × ataque del Pokémon × G.Stats.fit (físico/especial) × Player.MONO_K (monotipo y ataque de su tipo)
 *   × Player.EVO_K (o MOVE_K si no evoluciona) × tipo (efectividad media contra los enemigos del juego, con su defensa).
 *
 * Equipo: 4 huecos. Cada partida sólo salen en las cartas ~el 70 % de sus ataques (levelup.js runPool), así que es la
 * media de POOL_TRIES sorteos de ese 70 %, cogiendo los 4 mejores. Sólo pega el hueco activo: PESOS = el tiempo que va
 * activo cada uno (en las partidas de verdad, el mejor ~55 %). `grupo` = los 4 fusionados (Vínculos), que suman.
 *
 * Valor: el «real» de estudio.cjs (VR_JEFE): media geométrica de marea y jefe con peso 0,8 / 0,2, respecto a la
 * mediana de todos los finales: 1 = lo normal.
 *
 * Fuera a propósito: habilidad, naturaleza, objeto, MT, megaevoluciones, clima, danzas y estados del Pokémon.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const file = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!file) { console.error('uso: node tools/medir-pokemon.cjs bal.json [--antes bal.json] [--bot c1,c2] [--botantes c3] [--json f]'); process.exit(1); }

const ctx = { window: {}, console };
ctx.G = ctx.window.G = {};
vm.createContext(ctx);
for (const f of ['js/core/util.js', 'js/data/pokedex.js', 'js/data/evolutions.js', 'js/data/families.js', 'js/data/types.js', 'js/systems/stats.js', 'js/data/moves.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const G = ctx.G;
if (!G.DEX_BY) { G.DEX_BY = {}; for (const p of G.DEX) G.DEX_BY[p.dex] = p; }

const MONO_K = 1.2, EVO_K = 0.74, MOVE_K = 1.08;            // Player.MONO_K, EVO_K y MOVE_K (js/entities/player.js)
const VR_JEFE = 0.2;                                        // peso del jefe en el valor real (estudio.cjs)
const PESOS = [0.5, 0.25, 0.15, 0.1], POOL_K = 0.7, POOL_MIN = 10, POOL_TRIES = 300;   // (levelup.js runPool)

const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const n0 = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const n2 = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
const pct = v => `${v >= 0 ? '+' : ''}${Math.round(v * 100)} %`;

function rng32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Efectividad media de un ataque contra todos los enemigos normales del juego (tipo × defensa del lado que toca).
const WILD = G.DEX.filter(p => !p.leg);
const covCache = {};
function cov(type, cat) {
  const k = type + cat;
  if (covCache[k] == null) covCache[k] = WILD.reduce((a, e) => a + G.Types.mult(type, e.types) * G.Stats.taken(e, cat), 0) / WILD.length;
  return covCache[k];
}
const COV0 = median(Object.keys(G.Moves.POOL).map(t => cov(t, 'special')));

/** Filas de ataques de una medición: el mejor estado de cada uno (evolucionado si tiene). */
function moveTable(rep) {
  const T = {};
  for (const id in rep.todas) {
    const e = rep.todas[id].evo, m = rep.todas[id].max, x = e || m;
    T[id] = { id, name: x.name, evoName: x.evoName, type: x.type, cat: x.cat, kind: x.kind, evo: !!e, k: e ? EVO_K : MOVE_K, c: cov(x.type, x.cat) / COV0,
              j: x.jefe.dps + x.jefe.psn, h: x.horda.dps + x.horda.psn, m: x.marea.dps + x.marea.psn };
  }
  return T;
}
const shown = t => t.evo && t.evoName ? `${t.name} → ${t.evoName}` : t.name;

/** Lo que rinde el ataque t con el Pokémon p (sin el «1 de ataque»). */
const statK = (p, t) => p.atk * G.Stats.fit(p, t.cat) * (p.types.length === 1 && p.types[0] === t.type ? MONO_K : 1);
const moveK = (p, t) => statK(p, t) * t.k * t.c;

function measureAll(T) {
  const finals = G.DEX.filter(p => G.Fam.isFinal(p.dex));
  const rows = [];
  // El valor con el que se elige: marea y jefe, con los pesos del valor real (los dos, en escalas parecidas).
  const mj = median(Object.values(T).map(t => t.j)), mm = median(Object.values(T).map(t => t.m));
  const score = t => Math.pow(Math.max(t.j, 1) / mj, VR_JEFE) * Math.pow(Math.max(t.m, 1) / mm, 1 - VR_JEFE);
  for (const p of finals) {
    const ids = G.Moves.poolFor(p, true).filter(id => T[id]);
    const list = ids.map(id => { const t = T[id], k = moveK(p, t); return { t, k, s: score(t) * k }; }).sort((a, b) => b.s - a.s);
    const n = Math.max(POOL_MIN, Math.ceil(list.length * POOL_K));
    const R = rng32(p.dex * 7919 + 1);
    let J = 0, M = 0, Ms = 0, Js = 0, K = 0;
    const seen = {};
    for (let tr = 0; tr < POOL_TRIES; tr++) {
      // Sorteo de los que saldrán en esta partida y, de ésos, los 4 mejores (la lista ya va ordenada).
      const pick = list.map(x => [R(), x]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]).sort((a, b) => b.s - a.s).slice(0, 4);
      pick.forEach((x, i) => {
        J += PESOS[i] * x.t.j * x.k; M += PESOS[i] * x.t.m * x.k; Js += x.t.j * x.k; Ms += x.t.m * x.k;
        K += PESOS[i] * x.k;
        seen[x.t.id] = (seen[x.t.id] || 0) + 1;
      });
    }
    const top = list.slice(0, 4);
    const q = 1 / POOL_TRIES;
    rows.push({ p, n: list.length, top, J: J * q, M: M * q, Js: Js * q, Ms: Ms * q, K: K * q,
                top6: Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, c]) => [id, Math.round(c * q * 100)]) });
  }
  const mJ = median(rows.map(r => r.J)), mM = median(rows.map(r => r.M)), mKk = median(rows.map(r => r.K));
  for (const r of rows) {
    r.rj = r.J / mJ; r.rm = r.M / mM;
    r.v = Math.pow(r.rj, VR_JEFE) * Math.pow(r.rm, 1 - VR_JEFE);
    r.st = r.K / mKk;                 // lo que aportan sus estadísticas, tipo y MONO
    r.ls = r.v / r.st;                // lo que aporta su lista de ataques
  }
  rows.sort((a, b) => b.v - a.v);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows, mJ, mM };
}

const NOM = { normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'Eléctrico', psychic: 'Psíquico', poison: 'Veneno', ground: 'Tierra', flying: 'Volador',
  bug: 'Bicho', rock: 'Roca', ice: 'Hielo', fighting: 'Lucha', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };
const tps = p => p.types.map(t => NOM[t] || t).join('/');
const cause = r => {
  const a = Math.abs(Math.log(r.st)), b = Math.abs(Math.log(r.ls));
  const dir = x => (x > 1 ? 'buena' : 'mala');
  return a > b * 1.5 ? `estadísticas (${dir(r.st)}: ataque ${n2(r.p.atk)})` : b > a * 1.5 ? `lista (${dir(r.ls)})` : `las dos (${dir(r.st)} / ${dir(r.ls)})`;
};

// ---------------- contraste con las partidas ----------------
// De la nube (`stats`): daño/s activo de cada ataque. Pokémon, ataque, DPS real, evolucionado.
const REALES = [
  { dex: 786, nom: 'Tapu Lele máximo (18:14, nv 56)', dps: 7491, mov: { 'fleur-cannon': 5190000 / 616 } },
  { dex: 786, nom: 'Tapu Lele pocas (17:42, nv 48)', dps: 7263, mov: { 'fleur-cannon': 3960000 / 512 } },
  { dex: 786, nom: 'Tapu Lele muchas (18:06, nv 48)', dps: 3923, mov: {} },
  { dex: 802, nom: 'Marshadow máximo (16:20, nv 40)', dps: 1722, mov: { 'last-respects': 720, 'cross-chop': 1210, 'dynamic-punch': 732, 'astral-barrage': 609 } },
  { dex: 894, nom: 'Regieleki casi máximo (15:05, nv 45)', dps: 5066, mov: { 'thunder-shock': 3855, thunderbolt: 2995 } }
];

/** Partidas del bot: las líneas REG de curve.cjs. */
function botRuns(dirs) {
  const out = [];
  for (const d of dirs) {
    for (const f of fs.readdirSync(d).filter(x => x.endsWith('.txt'))) {
      const m = /REG (\{.*\})\s*$/m.exec(fs.readFileSync(path.join(d, f), 'utf8'));
      if (m) { const r = JSON.parse(m[1]); r.dex = +f.split('-')[0]; r.tag = f.replace('.txt', ''); r.dir = path.basename(d); out.push(r); }
    }
  }
  return out;
}

function contrast(T, runs, title) {
  const L = [];
  L.push(`| ${title} | Ataque | Real: daño/s activo | Modelo (marea × Pokémon) | real / modelo |`, '|---|---|---|---|---|');
  const rat = [];
  for (const r of runs) {
    const p = G.DEX_BY[r.dex];
    for (const id in r.mov) {
      const t = T[id];
      if (!t) continue;
      // (El tipo va en lo real y también en t.c. Reparto de tiempo: 80 % marea, 20 % un solo objetivo.)
      const pred = (0.8 * t.m + 0.2 * t.j) * moveK(p, t);
      const ratio = r.mov[id] / pred;
      rat.push(ratio);
      L.push(`| ${r.nom} | ${shown(t)} | ${n0(r.mov[id])} | ${n0(pred)} | ${n2(ratio)} |`);
    }
  }
  return { text: L.join('\n'), rat };
}

// ---------------- salida ----------------
const rep = load(file), T = moveTable(rep), A = measureAll(T);
const ante = val('antes') ? load(val('antes')) : null, TA = ante ? moveTable(ante) : null, B = ante ? measureAll(TA) : null;
const o = [];
const push = (...x) => o.push(...x);
const rowsB = B ? Object.fromEntries(B.rows.map(r => [r.p.dex, r])) : null;

push('# Estudio de los Pokémon en evolución final (2026-11-04)', '',
  `Hecho con \`tools/medir-pokemon.cjs\` sobre \`tools/balance.cjs --todas\` (combate de verdad, semilla fija). ${A.rows.length} Pokémon sin evolución posterior. Para repetirlo:`, '',
  '```', 'node tools/balance.cjs --pasivos --todas --json bal.json', 'node tools/medir-pokemon.cjs bal.json > docs/ESTUDIO-POKEMON.md', '```', '');

push('## Supuestos', '',
  '- **Ataques**: nivel máximo y evolucionados (los que no evolucionan, a nivel máximo), con **todas** las pasivas de daño a la vez: Amplitud, Persistencia, Réplica, Propulsión y Puntería con todas sus cartas.',
  '- **Pokémon**: su ataque, su lado físico o especial (`G.Stats.fit`), +20 % de monotipo en su tipo, `EVO_K` / `MOVE_K`, y la efectividad media del ataque (tipo y defensa) contra todos los enemigos normales. Los potenciadores, escudos y barridos no cuentan.',
  `- **Equipo**: 4 huecos. En cada partida sólo salen en cartas el ~70 % de sus ataques: es la media de ${POOL_TRIES} sorteos, cogiendo los 4 mejores. Sólo pega el hueco activo: ${PESOS.map(x => x * 100 + ' %').join(', ')} del tiempo (en lo real, el mejor ~55 %). «Grupo» = los 4 fusionados con Vínculos, que suman.`,
  `- **Jefe y marea**: jefe, un objetivo. Marea: enemigos que caen y vienen andando hacia ti (${rep.marea.n} a la vez), sin rodearte. Los números van «con 1 de ataque por punto del Pokémon», sin Potencia ni Mejoras (multiplican igual a todos).`,
  `- **Valor**: media geométrica de marea (${(1 - VR_JEFE) * 100} %) y jefe (${VR_JEFE * 100} %) frente a la mediana de los finales: 1 = lo normal. Los jefes reciben entre un 5 y un 30 % del daño en las partidas.`,
  '- **Fuera a propósito**: habilidad, naturaleza, objeto, MT, megaevoluciones, clima, danzas y aguante (vida, defensa, velocidad). Mide sólo cuánto pega.', '');

push(`Mediana de los finales: jefe ${n0(A.mJ)} · marea ${n0(A.mM)}.`, '');

const line = (r, i) => {
  const b = rowsB && rowsB[r.p.dex];
  return `| ${r.rank} | ${r.p.name} | ${tps(r.p)} | ${n2(r.v)}${b ? ` (${n2(b.v)})` : ''} | ${n0(r.J)} | ${n0(r.M)} | ${n0(r.Ms)} | ${n2(r.p.atk)} | ${n2(r.st)} | ${n2(r.ls)} | ${r.n} | ${r.top.map(x => x.t.name).join(', ')} |`;
};
const HEAD = `| # | Pokémon | Tipo | Valor${rowsB ? ' (main)' : ''} | Jefe | Marea | Grupo marea | Ataque | Stats | Lista | Ataques | Mejores 4 |`;
const SEP = '|---|---|---|---|---|---|---|---|---|---|---|---|';

push('## Los más fuertes y los más débiles', '', '«Stats» = lo que aportan ataque, lado y monotipo; «Lista» = lo que aporta su lista de ataques (Stats × Lista = Valor).', '');
push('### Los 25 más fuertes', '', HEAD, SEP, ...A.rows.slice(0, 25).map(line), '');
push('### Los 25 más débiles', '', HEAD, SEP, ...A.rows.slice(-25).map(line), '');

push('## Causa de los extremos', '', '| Pokémon | Valor | Causa | Ataques que lo sostienen (veces en el equipo) |', '|---|---|---|---|');
for (const r of [...A.rows.slice(0, 15), ...A.rows.slice(-15)]) {
  push(`| ${r.p.name} | ${n2(r.v)} | ${cause(r)} | ${r.top6.slice(0, 4).map(([id, c]) => `${T[id].name} ${c} %`).join(', ')} |`);
}
push('');

// Por tipo
const byT = {};
for (const r of A.rows) for (const t of r.p.types) (byT[t] = byT[t] || []).push(r);
push('## Por tipo', '', '| Tipo | Pokémon finales | Valor mediano | Lista mediana | Mejor ataque del tipo (real) |', '|---|---|---|---|---|');
const bestOfType = t => Object.values(T).filter(x => x.type === t).sort((a, b) => b.m - a.m)[0];
for (const t of Object.keys(byT).sort((a, b) => median(byT[b].map(r => r.v)) - median(byT[a].map(r => r.v)))) {
  push(`| ${NOM[t]} | ${byT[t].length} | ${n2(median(byT[t].map(r => r.v)))} | ${n2(median(byT[t].map(r => r.ls)))} | ${(bestOfType(t) && shown(bestOfType(t))) || '—'} |`);
}
push('');

// Contraste
const reales = REALES;
const bots = val('bot') ? botRuns(val('bot').split(',')) : [], botsA = val('botantes') ? botRuns(val('botantes').split(',')) : [];
const toRow = r => ({ dex: r.dex, nom: `bot ${G.DEX_BY[r.dex].name} ${r.tag.split('-').pop()} (nv ${r.lvl})`,
  mov: Object.fromEntries(Object.entries(r.moves).filter(([id, m]) => T[id] && m.a > 60 && m.d > 0).map(([id, m]) => [id, m.d / m.a])) });
push('## Contraste con las partidas', '');
if (TA) {
  const c = contrast(TA, reales, 'Partida (código de `main`)');
  push(c.text, '', `Real / modelo: mediana ${n2(median(c.rat))}, de ${n2(Math.min(...c.rat))} a ${n2(Math.max(...c.rat))}.`, '');
}
if (botsA.length) {
  const c = contrast(TA || T, botsA.map(toRow), 'Bot (código de `main`)');
  push(c.text, '', `Real / modelo: mediana ${n2(median(c.rat))}, de ${n2(Math.min(...c.rat))} a ${n2(Math.max(...c.rat))}.`, '');
}
if (bots.length) {
  const c = contrast(T, bots.map(toRow), 'Bot (esta rama)');
  push(c.text, '', `Real / modelo: mediana ${n2(median(c.rat))}, de ${n2(Math.min(...c.rat))} a ${n2(Math.max(...c.rat))}.`, '');
}

push('## Ranking completo', '', HEAD, SEP, ...A.rows.map(line), '');

if (val('json')) fs.writeFileSync(val('json'), JSON.stringify(A.rows.map(r => ({ dex: r.p.dex, name: r.p.name, v: r.v, J: r.J, M: r.M, st: r.st, ls: r.ls, top: r.top.map(x => x.t.id) })), null, 0));
console.log(o.join('\n'));
