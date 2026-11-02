/* ============ equilibrio.cjs — ataques a la par (2026-11-02) ============
 *
 * Lee lo que mide tools/balance.cjs (--json) y compara los ataques entre sí con el
 * «valor» de balance.cjs (media geométrica del DPS contra un jefe y contra la horda,
 * respecto a la mediana de todos los que pegan en esa etapa: 1 = lo normal), pero
 * siempre con las medianas de la medición de REFERENCIA (la de antes), para que el
 * antes y el después se puedan comparar.
 *
 *   node tools/balance.cjs --json antes.json                (con el código de antes)
 *   node tools/equilibrio.cjs --propone antes.json           factores para DMG_K y las evoluciones
 *   node tools/equilibrio.cjs --propone ahora.json --ref antes.json
 *                                                            otra vuelta: corrige los que se quedaron lejos
 *   node tools/equilibrio.cjs antes.json despues.json        tabla antes/después (Markdown)
 *
 * Regla (la pidió el dueño: «baja los que están muy fuertes para que todos estén a la par;
 * no subas los flojos salvo que se queden muy por debajo y no valgan para el final»):
 *   - nivel máximo y evolucionado: si el valor pasa de ALTO, baja a OBJ; si no llega a BAJO
 *     (y no es venenoso: el veneno no cuenta en el valor), sube a SUBE.
 *   - nivel 1: sólo baja si pasa de ALTO1 (a OBJ1); los flojos al nivel 1 se quedan (ya suben con el nivel).
 *   - Los factores del nivel 1 y del máximo van a DMG_K de moves.js (entre medias, en proporción al
 *     nivel); el del evolucionado, a lo que multiplica su evolución (`mods.dmg`).
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const files = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--ref') && !(i > 0 && argv[i - 1] === '--propone'));

const ALTO = 1.15, OBJ = 1.1, BAJO = 0.65, SUBE = 0.75;
// Nivel 1: sólo los que se salen mucho (el arranque sin mejoras ya es duro: no se quiere tocar).
const ALTO1 = 1.25, OBJ1 = 1.15;
const STAGES = ['n1', 'max', 'evo'];
const UTIL = new Set(['buff', 'ward', 'wipe']);

const ctx = { window: {}, console };
ctx.G = ctx.window.G = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/moves.js'), 'utf8'), ctx);
const M = ctx.G.Moves;

const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
/** { id: { n1: {v, j, h, psn}, max, evo } } con las medianas de `ref`. */
function table(rep, ref) {
  const out = {};
  for (const r of rep.rows) {
    const med = ref.med[r.stage];
    if (!med || !STAGES.includes(r.stage)) continue;
    const d = M.BY_ID[r.id];
    if (!d || UTIL.has(d.kind)) continue;
    const v = Math.sqrt(Math.max(r.jefe / med.jefe, 0.01) * Math.max(r.horda / med.horda, 0.01));
    (out[r.id] = out[r.id] || {})[r.stage] = { v, j: r.jefe, h: r.horda, psn: !!(r.psn && (r.psn[0] || r.psn[1])) };
  }
  return out;
}
const r2 = x => Math.round(x * 100) / 100;
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

if (val('propone')) {
  // Factores sobre lo que hay ahora: [× nivel 1, × nivel máximo, × evolución] (tools: se multiplican por DMG_K y mods.dmg).
  const now = load(val('propone')), ref = load(val('ref') || val('propone'));
  const T = table(now, ref), res = {};
  for (const id in T) {
    const t = T[id];
    if (!t.max) continue;
    const psn = t.max.psn || (t.evo && t.evo.psn);
    const want = v => v > ALTO ? OBJ : v < BAJO && !psn ? SUBE : v;
    const k1 = t.n1 && t.n1.v > ALTO1 ? OBJ1 / t.n1.v : 1;
    const km = want(t.max.v) / t.max.v;
    const ke = t.evo ? want(t.evo.v) / (t.evo.v * km) : 1;
    const r = [r2(k1), r2(km), r2(ke)];
    if (r.some(x => Math.abs(x - 1) >= 0.03)) res[id] = r;
  }
  const ids = Object.keys(res).sort();
  console.log(`// ${ids.length} ataques (ALTO ${ALTO} → ${OBJ}, BAJO ${BAJO} → ${SUBE}): [× nivel 1, × nivel máximo, × evolución]`);
  for (const id of ids) console.log(`    '${id}': [${res[id].join(', ')}],   // ${M.BY_ID[id].name}: ${STAGES.map(s => T[id][s] ? r2(T[id][s].v) : '—').join(' / ')}`);
  process.exit(0);
}

if (files.length < 2) { console.log('Uso: node tools/equilibrio.cjs antes.json despues.json  |  --propone x.json [--ref antes.json]'); process.exit(1); }
const ref = load(files[0]), A = table(ref, ref), B = table(load(files[1]), ref);
const ids = Object.keys(A).filter(id => B[id]).sort((a, b) => ((A[b].evo || A[b].max).v) - ((A[a].evo || A[a].max).v));
const f = x => x == null ? '—' : r2(x).toFixed(2).replace('.', ',');
const arrow = (a, b) => a == null || b == null ? '' : b < a - 0.04 ? ' ↓' : b > a + 0.04 ? ' ↑' : '';
console.log('| Ataque | Familia | Nv 1 antes → después | Nv máx antes → después | Evolución antes → después |');
console.log('|---|---|---|---|---|');
for (const id of ids) {
  const a = A[id], b = B[id], d = M.BY_ID[id];
  const cell = s => a[s] ? `${f(a[s].v)} → ${f(b[s] && b[s].v)}${arrow(a[s].v, b[s] && b[s].v)}` : '—';
  console.log(`| ${d.name}${M.EVO[id] ? ' / ' + M.EVO[id][0] : ''} | ${d.kind} | ${cell('n1')} | ${cell('max')} | ${cell('evo')} |`);
}
console.log('');
for (const s of STAGES) {
  const va = ids.filter(id => A[id][s]).map(id => A[id][s].v), vb = ids.filter(id => B[id][s]).map(id => B[id][s].v);
  const sp = v => { const x = v.slice().sort((p, q) => p - q); return `${f(x[Math.floor(x.length * 0.1)])}–${f(x[Math.floor(x.length * 0.9)])}`; };
  console.log(`${s}: mediana ${f(median(va))} → ${f(median(vb))} · 10-90 % ${sp(va)} → ${sp(vb)} · más de ${ALTO}: ${va.filter(v => v > ALTO).length} → ${vb.filter(v => v > ALTO).length} · menos de ${BAJO}: ${va.filter(v => v < BAJO).length} → ${vb.filter(v => v < BAJO).length}`);
}
