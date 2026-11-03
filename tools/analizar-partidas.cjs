// Resume las partidas exportadas desde el juego (Historial de partidas › Exportar; core/registro.js).
// También lee los resúmenes de la nube (net/stats.js; Historial › «Descargar las de todos», sólo el dueño).
// Uso: node tools/analizar-partidas.cjs <partidas.json> [más.json…] [--json salida.json] [--ver <huella>]
//                                       [--desde AAAA-MM-DD] [--modo solo|grupo] [--min <s>] [--top N]
//   Junta varios archivos (de varios aparatos) sin repetir partidas (mismo id).
//   --min: sólo partidas de al menos tantos segundos (por defecto 30: las de probar y salir no cuentan).
// Saca: duración, nivel y daño medios; ataques que más y menos pegan (daño por segundo desde que los
// tienes, contra jefes y contra la horda, cuánto se eligen); quién te tumba y quién te quita más vida;
// curación media y de dónde; cartas que más y menos se eligen; jefes (cuánto duran); FPS por aparato.
'use strict';
const fs = require('fs'), path = require('path');

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = a => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const r1 = v => Math.round(v * 10) / 10;
const mmss = t => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const who = k => String(k || '?').split('|')[0];

/** Nombres de los Pokémon (los resúmenes de la nube no los llevan). */
let DEX_NAMES = null;
function dexNames() {
  if (DEX_NAMES) return DEX_NAMES;
  DEX_NAMES = {};
  try {
    const G = {};
    new Function('G', fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'pokedex.js'), 'utf8'))(G);
    for (const d of G.DEX || []) DEX_NAMES[d.dex] = d.name;
  } catch (e) { /* sin nombres: salen las claves */ }
  return DEX_NAMES;
}

/** Un resumen de la nube (net/stats.js, brief) con la forma de una partida guardada. */
function fromBrief(b) {
  const nm = dexNames(), at = typeof b.at === 'number' ? b.at : 0;
  const moves = {};
  for (const [id, m] of Object.entries(b.moves || {})) {
    moves[id] = { name: id, dealt: m.d, boss: m.b, kills: m.k, hits: m.h, lvl: m.l, evolved: !!m.e, got: m.g, active: m.a, evo: m.et, group: m.f ? [id] : null };
  }
  const usedNames = {};
  for (const k of [b.killer, ...Object.keys(b.tk || {}), ...(b.bosses || []).map(x => x.k)]) {
    const m = /^[hblax]:(\d+)/.exec(k || '');
    if (m && nm[m[1]]) usedNames[m[1]] = nm[m[1]];
  }
  if (nm[b.dex]) usedNames[b.dex] = nm[b.dex];
  return {
    id: b.id || at, cloudId: b.id, at, ver: b.ver, mode: b.mode, players: b.pl, state: b.st, dur: b.dur,
    mon: { dex: b.dex, abil: b.abil, nat: b.nat }, form: b.form, lvl: b.lvl, kills: b.kills, coins: b.coins,
    dealt: b.dealt, taken: b.taken, healed: b.healed, kinds: b.kinds, dev: b.dev, upg: b.upg, nm: usedNames, moves,
    takenBy: Object.fromEntries(Object.entries(b.tk || {}).map(([k, v]) => [k, [v, 0]])), healBy: b.hb || {},
    downs: b.killer ? [{ by: b.killer, t: b.killT }] : [], downsN: b.downs || 0, cardAgg: b.cards || {},
    bosses: (b.bosses || []).map(x => ({ k: x.k, t: x.t, kt: x.kt >= 0 ? x.kt : null })), fpsAvg: b.fps
  };
}

/** Lee uno o varios archivos exportados (del historial o de la nube) y devuelve las partidas (sin repetir). */
function load(files) {
  const byId = new Map();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const runs = (Array.isArray(j) ? j : j.runs || []).map(r => (j.fmt === 'ps-resumenes' || (r && r.v && r.tk) ? fromBrief(r) : r));
    for (const r of runs) if (r && r.id != null) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => (a.at || 0) - (b.at || 0));
}

/** Filtra y resume. o: { ver, desde, modo, min } */
function analyze(all, o = {}) {
  const min = o.min != null ? o.min : 30;
  const runs = all.filter(r => (r.dur || 0) >= min && (!o.ver || r.ver === o.ver) && (!o.modo || r.mode === o.modo) &&
                               (!o.desde || r.at >= Date.parse(o.desde)));
  const out = { partidas: runs.length, descartadas: all.length - runs.length };
  if (!runs.length) return out;
  const nm = {};
  for (const r of runs) Object.assign(nm, r.nm || {});
  const name = k => { const w = who(k), m = /^([hblax]):(\d+)$/.exec(w); return m && nm[m[2]] ? `${nm[m[2]]} (${w})` : w; };
  const dur = runs.map(r => r.dur || 0);
  out.versiones = count(runs.map(r => r.ver));
  out.modos = count(runs.map(r => r.mode));
  out.final = count(runs.map(r => r.state));
  out.aparatos = count(runs.map(r => (r.dev && r.dev.mob ? 'móvil' : 'PC')));
  out.duracion = { media: r1(mean(dur)), mediana: r1(median(dur)), max: Math.max(...dur) };
  out.nivel = { medio: r1(mean(runs.map(r => r.lvl || 0))), mediana: median(runs.map(r => r.lvl || 0)) };
  out.dps = r1(mean(runs.map(r => (r.dealt || 0) / Math.max(1, r.dur))));
  out.danoRecibidoPorS = r1(mean(runs.map(r => (r.taken || 0) / Math.max(1, r.dur))));
  out.curacionPorS = r1(mean(runs.map(r => (r.healed || 0) / Math.max(1, r.dur))));
  out.derrotados = r1(mean(runs.map(r => r.kills || 0)));
  out.pokemon = top(count(runs.map(r => (nm[r.mon && r.mon.dex] || '#' + (r.mon && r.mon.dex)))), 15);

  // ---- ataques ----
  const mv = {};
  for (const r of runs) for (const [id, m] of Object.entries(r.moves || {})) {
    if (m.dealt == null) continue;
    const a = mv[id] || (mv[id] = { id, name: m.name || id, runs: 0, dps: [], bossK: [], share: [], kills: 0, hits: 0, evo: 0, evoT: [] });
    const tot = Object.values(r.moves).reduce((x, y) => x + (y.dealt || 0), 0) || 1;
    const secs = Math.max(10, (r.dur || 0) - (m.got || 0));
    a.runs++;
    a.dps.push((m.dealt || 0) / secs);
    a.share.push((m.dealt || 0) / tot);
    if (m.dealt > 0) a.bossK.push((m.boss || 0) / m.dealt);
    a.kills += m.kills || 0; a.hits += m.hits || 0;
    if (m.evolved) { a.evo++; if (m.evo != null) a.evoT.push(m.evo); }
  }
  const moves = Object.values(mv).map(a => ({
    ataque: a.name, id: a.id, partidas: a.runs, dps: r1(mean(a.dps)), parte: Math.round(mean(a.share) * 100) + '%',
    aJefes: Math.round(mean(a.bossK) * 100) + '%', derrotadosPorPartida: r1(a.kills / a.runs),
    evoluciona: Math.round(a.evo / a.runs * 100) + '%', minutoEvo: a.evoT.length ? r1(mean(a.evoT) / 60) : null
  })).sort((x, y) => y.dps - x.dps);
  const enough = moves.filter(m => m.partidas >= Math.min(3, runs.length));
  out.ataquesQueMasPegan = enough.slice(0, o.top || 10);
  out.ataquesQueMenosPegan = enough.slice(-(o.top || 10)).reverse();

  // ---- quién te tumba y quién te pega ----
  const downs = runs.flatMap(r => r.downs || []);
  const downsN = runs.reduce((a, r) => a + (r.downsN != null ? r.downsN : (r.downs || []).length), 0);
  out.caidas = { total: downsN, porPartida: r1(downsN / runs.length) };
  out.quienTeTumba = top(count(downs.map(d => name(d.by))), o.top || 10);
  out.conQueTeTumba = top(count(downs.map(d => `${name(d.by)} · ${String(d.by).split('|')[1] || '?'}`)), o.top || 10);
  const tk = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.takenBy || {})) tk[name(k)] = (tk[name(k)] || 0) + v[0];
  out.quienTeQuitaMasVida = top(Object.fromEntries(Object.entries(tk).map(([k, v]) => [k, Math.round(v / runs.length)])), o.top || 10);
  const cls = { h: 'horda', b: 'jefes', l: 'legendarios', a: 'Arceus', x: 'terreno', '?': 'desconocido' };
  const byCls = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.takenBy || {})) { const c = cls[who(k)[0]] || 'otros'; byCls[c] = (byCls[c] || 0) + v[0]; }
  const tkAll = Object.values(byCls).reduce((a, b) => a + b, 0) || 1;
  out.danoRecibidoPorClase = Object.fromEntries(Object.entries(byCls).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v / tkAll * 100) + '%']));

  // ---- curación ----
  const hb = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.healBy || {})) hb[k] = (hb[k] || 0) + v;
  out.curacionPorFuente = top(Object.fromEntries(Object.entries(hb).map(([k, v]) => [k, Math.round(v / runs.length)])), o.top || 10);

  // ---- cartas ----
  const off = {}, pick = {};
  for (const r of runs) {
    for (const c of r.cards || []) {
      for (const k of c.o || []) off[k] = (off[k] || 0) + 1;
      if (c.p) pick[c.p] = (pick[c.p] || 0) + 1;
    }
    for (const [k, [o, p]] of Object.entries(r.cardAgg || {})) { off[k] = (off[k] || 0) + o; pick[k] = (pick[k] || 0) + p; }
  }
  const cards = Object.keys(off).filter(k => off[k] >= 5).map(k => ({ carta: k, sale: off[k], elegida: Math.round((pick[k] || 0) / off[k] * 100) }))
    .sort((a, b) => b.elegida - a.elegida);
  out.cartasMasElegidas = cards.slice(0, o.top || 10).map(c => ({ ...c, elegida: c.elegida + '%' }));
  out.cartasMenosElegidas = cards.slice(-(o.top || 10)).reverse().map(c => ({ ...c, elegida: c.elegida + '%' }));

  // ---- jefes ----
  const bs = {};
  for (const r of runs) for (const b of r.bosses || []) {
    const k = name(b.k), a = bs[k] || (bs[k] = { visto: 0, vencido: 0, t: [] });
    a.visto++;
    if (b.kt != null) { a.vencido++; a.t.push(b.kt - b.t); }
  }
  out.jefes = Object.entries(bs).sort((a, b) => b[1].visto - a[1].visto).slice(0, o.top || 15)
    .map(([k, a]) => ({ jefe: k, visto: a.visto, vencido: Math.round(a.vencido / a.visto * 100) + '%', segundos: r1(mean(a.t)) }));

  // ---- rendimiento ----
  const fps = { 'móvil': [], PC: [] };
  for (const r of runs) {
    if (r.fpsAvg && r.fpsAvg.m > 0) { fps[r.dev && r.dev.mob ? 'móvil' : 'PC'].push(r.fpsAvg.m); continue; }
    const i = (r.tlKeys || []).indexOf('fps');
    if (i < 0) continue;
    for (const row of r.tl || []) if (row[i] > 0) fps[r.dev && r.dev.mob ? 'móvil' : 'PC'].push(row[i]);
  }
  out.fps = Object.fromEntries(Object.entries(fps).filter(([, v]) => v.length).map(([k, v]) => [k, { media: Math.round(mean(v)), p10: Math.round(v.slice().sort((a, b) => a - b)[Math.floor(v.length * 0.1)]) }]));
  return out;
}

function count(list) { const o = {}; for (const x of list) o[x] = (o[x] || 0) + 1; return o; }
function top(o, n) { return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)); }

/** El resumen en texto, para leerlo en la consola. */
function text(s) {
  if (!s.partidas) return `Ninguna partida que cuente (${s.descartadas} descartadas: muy cortas o fuera del filtro).`;
  const L = [];
  const kv = o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' · ');
  L.push(`${s.partidas} partidas (${s.descartadas} descartadas) · versiones: ${kv(s.versiones)}`);
  L.push(`Modos: ${kv(s.modos)} · cómo acaban: ${kv(s.final)} · aparatos: ${kv(s.aparatos)}`);
  L.push(`Duración media ${mmss(s.duracion.media)} (mediana ${mmss(s.duracion.mediana)}, máx ${mmss(s.duracion.max)}) · nivel medio ${s.nivel.medio}`);
  L.push(`Daño por segundo ${s.dps} · recibido/s ${s.danoRecibidoPorS} · curación/s ${s.curacionPorS} · derrotados ${s.derrotados} · caídas/partida ${s.caidas.porPartida}`);
  const table = (title, rows) => {
    if (!rows.length) return;
    L.push('', title);
    const keys = Object.keys(rows[0]);
    for (const r of rows) L.push('  ' + keys.map(k => `${k}: ${r[k]}`).join(' · '));
  };
  table('Ataques que más pegan (daño por segundo desde que los tienes):', s.ataquesQueMasPegan);
  table('Ataques que menos pegan:', s.ataquesQueMenosPegan);
  L.push('', 'Quién te tumba: ' + kv(s.quienTeTumba));
  L.push('Con qué: ' + kv(s.conQueTeTumba));
  L.push('Quién te quita más vida (media por partida): ' + kv(s.quienTeQuitaMasVida));
  L.push('Daño recibido por clase: ' + kv(s.danoRecibidoPorClase));
  L.push('Curación por fuente (media por partida): ' + kv(s.curacionPorFuente));
  table('Cartas más elegidas (de las que salen 5 veces o más):', s.cartasMasElegidas);
  table('Cartas menos elegidas:', s.cartasMenosElegidas);
  table('Jefes:', s.jefes);
  L.push('', 'FPS: ' + Object.entries(s.fps).map(([k, v]) => `${k} media ${v.media} (peor 10 % ${v.p10})`).join(' · '));
  return L.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2), files = [], o = {};
  let jsonOut = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') jsonOut = args[++i];
    else if (a === '--ver') o.ver = args[++i];
    else if (a === '--desde') o.desde = args[++i];
    else if (a === '--modo') o.modo = args[++i];
    else if (a === '--min') o.min = +args[++i];
    else if (a === '--top') o.top = +args[++i];
    else files.push(a);
  }
  if (!files.length) { console.error('Uso: node tools/analizar-partidas.cjs <partidas.json> [más.json…] [--json salida.json] [--ver huella] [--desde AAAA-MM-DD] [--modo solo|grupo] [--min s] [--top N]'); process.exit(1); }
  const s = analyze(load(files.map(f => path.resolve(f))), o);
  console.log(text(s));
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(s, null, 2)); console.log('\nResumen en', jsonOut); }
}

module.exports = { load, analyze, text, fromBrief };
