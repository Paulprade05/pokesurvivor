/* ============ estudio.cjs — estudio de todos los ataques (2026-11-02) ============
 *
 * Pedido del dueño: «para cada ataque, qué hace, su pasiva, su evolución, cómo le afectan todas las
 * pasivas, los objetos y las mejoras de la torre, y su daño por segundo y su utilidad al nivel máximo y
 * evolucionado, medido de forma objetiva». Junta lo que mide tools/balance.cjs (sin azar: semilla fija)
 * con los datos del juego (moves.js, levelup.js, items.js, upgrades.js) y escribe una tabla en Markdown.
 *
 *   node tools/balance.cjs --pasivos --json bal.json
 *   node tools/estudio.cjs bal.json > docs/ESTUDIO-ATAQUES.md
 *   node tools/estudio.cjs bal.json --antes bal-antes.json     y una columna con lo de antes
 *
 * Columnas de números (todo «con 1 de ataque», ver balance.cjs):
 *   DPS jefe / horda   daño por segundo contra un jefe que te persigue y contra una horda de 50
 *   valor              media geométrica de los dos respecto a la mediana de su etapa (1 = lo normal)
 *   evo/máx            cuánto mejor es el evolucionado que el de nivel máximo, YA con lo que el jugador
 *                      aplica a cada uno (Player.MOVE_K y EVO_K): > 1 = mejor (la norma pide > 1 siempre)
 *   control            enemigos·segundo fuera de combate por segundo en la horda (aturdidos, dormidos,
 *                      congelados, en el aire, con miedo, enamorados, confusos...): 10 = 10 de los 50 siempre
 *   frenado            suma de lo que frenan los frenados (0,5 = uno a media velocidad), por segundo
 *   cura               vida por segundo que te devuelve · bloqueos: golpes parados por segundo
 *   pasivas            lo que gana su DPS (al nivel máximo) con TODAS las cartas de esa pasiva
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = k => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const file = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!file) { console.error('uso: node tools/estudio.cjs bal.json [--antes antes.json]'); process.exit(1); }

const ctx = { window: {}, console };
ctx.G = ctx.window.G = { U: { pick: a => a[0] } };
vm.createContext(ctx);
for (const f of ['js/data/moves.js', 'js/data/items.js', 'js/data/upgrades.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
const G = ctx.G, M = G.Moves;
const K = 0.74 / 1.08;   // Player.EVO_K / Player.MOVE_K (js/entities/player.js)

const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const rep = load(file), ante = val('antes') ? load(val('antes')) : null;
const byId = rep => { const o = {}; for (const r of rep.rows) (o[r.id] = o[r.id] || {})[r.stage] = r; return o; };
const R = byId(rep), A = ante ? byId(ante) : null;
// Valor con dos decimales (balance.cjs lo redondea a uno), con las medianas de esta medición.
for (const r of rep.rows) {
  const med = rep.med[r.stage];
  if (med && r.valor != null) r.valor = Math.sqrt(Math.max(r.jefe / med.jefe, 0.01) * Math.max(r.horda / med.horda, 0.01));
}
const TYPE = { normal: 'Normal', fire: 'Fuego', water: 'Agua', grass: 'Planta', electric: 'Eléctrico', psychic: 'Psíquico',
  poison: 'Veneno', ground: 'Tierra', flying: 'Volador', bug: 'Bicho', rock: 'Roca', ice: 'Hielo', fighting: 'Lucha',
  ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };

const n1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const n2 = v => (v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace('.', ','));
const n0 = v => (v == null ? '—' : String(Math.round(v)));
const pct = v => (v == null ? '' : (v >= 0 ? '+' : '') + Math.round(v) + ' %');

const FAM = {
  projectile: 'Proyectil', melee: 'Golpe', beam: 'Haz', orbit: 'Órbita', nova: 'Estallido', aura: 'Aura', buff: 'Potenciador',
  boomerang: 'Bumerán', chain: 'Cadena', mine: 'Minas', meteor: 'Meteoro', turret: 'Torreta', dash: 'Embestida', trail: 'Estela',
  cone: 'Abanico', homing: 'Teledirigido', bounce: 'Rebote', charge: 'Carga', spin: 'Giro', quake: 'Temblor', vortex: 'Vórtice',
  shove: 'Empujón', stun: 'Aturdimiento', lob: 'Parábola', knife: 'Ráfaga', cross: 'Aspas', column: 'Columna', sweep: 'Aguja',
  ricochet: 'Carambola', wipe: 'Barrido', ward: 'Escudo', ally: 'Aliados', wings: 'Aves', puddle: 'Charcos', dusting: 'Chaparrón'
};
// Lo que cambia cada pasiva (claves de G.Moves.passiveKeys).
const KEY = {
  size: 'tamaño', radius: 'radio', width: 'grosor', height: 'alto', ring: 'círculo de vuelo', range: 'alcance de disparo',
  blast: 'explosión', speed: 'velocidad', curl: 'espiral', turn: 'giro', grav: 'caída', dur: 'duración', stun: 'aturdimiento',
  life: 'duración', count: '+1 cantidad', 'half:radius': 'largo (la mitad)', 'half:ring': 'círculo (la mitad)',
  'inv:charge': 'carga más rápida', 'code:pspd': 'llega antes', 'code:amt': '+1 zona'
};
const how = (kind, id) => M.passiveKeys(kind, id).map(k => KEY[k] || k).join(', ');
const PASS = [['area', 'Amplitud'], ['dur', 'Persistencia'], ['amt', 'Réplica'], ['pspd', 'Propulsión'], ['luck', 'Puntería']];
const UTIL = new Set(['buff', 'ward', 'wipe']);

const out = [];
const w = s => out.push(s);
w('# Estudio de los ataques (2026-11-02)');
w('');
w('Hecho con `tools/estudio.cjs` a partir de `tools/balance.cjs --pasivos` (combate de verdad, semilla fija: sale siempre');
w('lo mismo). Cómo se mide cada columna, en la cabecera de `tools/estudio.cjs`. Para repetirlo:');
w('');
w('```');
w('node tools/balance.cjs --pasivos --json bal.json');
w('node tools/estudio.cjs bal.json > docs/ESTUDIO-ATAQUES.md');
w('```');
w('');
w('## Lo que afecta a todos los ataques por igual');
w('');
w('Multiplican el daño o la recarga de **todos** los ataques igual, así que no cambian cuál es mejor (no salen en las tablas):');
w('');
w('- **Cartas de la partida**: Potencia +10 % de daño por carta (hasta 10); Reflejos −8 % de recarga por carta (hasta 6; un');
w('  aura golpea más a menudo); Puntería +5 % de crítico y +10 % de daño crítico por carta (hasta 5; los que tienen crítico');
w('  propio, como Golpe Kárate, Hoja Afilada o Tajo Aéreo, ganan algo más: columna «Puntería»). Vigor, Carrera, Coraza,');
w('  Síntesis, Imán y Aprendizaje no tocan el daño: sólo deciden **qué ataques evolucionan** (y pocos ataques leen tu vida o');
w('  tu velocidad: Tambor, Rueda Fuego, Giro Bola, Agilidad...).');
w('- **Objetos de la partida** (uno a la vez): ' + G.Items.LIST.map(i => `${i.name} (${i.desc.replace(/\.$/, '')})`).join('; ') + '.');
w('- **Mejoras de la torre**: ' + G.Upgrades.LIST.filter(u => ['atk', 'cd', 'crit', 'dur', 'pspd', 'amt'].includes(u.id)).map(u => `${u.name} ${u.unit} (hasta ${u.max})`).join('; ') +
  '. Persistencia, Propulsión y Réplica de la torre suman a las cartas del mismo nombre (abajo, columnas «pasivas»).');
w('- **El jugador**: cada ataque sin evolucionar ×1,08 y evolucionado ×0,74 (`Player.MOVE_K` / `EVO_K`): ya va en «evo/máx».');
w('');
w('## Cuánto vale cada pasiva');
w('');
w('Lo que gana el DPS con todas las cartas de esa pasiva (media de todos los ataques que pegan, al máximo y evolucionados):');
w('');
w('| Pasiva | Cartas | En total | Por carta |');
w('|---|---|---|---|');
for (const [id, name] of PASS) { const p = rep['pass_' + id]; if (p) w(`| ${name} | ${p.n} | ${pct(p.total)} | ${pct(p.perCard)} |`); }
w('| Potencia (para comparar) | 10 | +100 % | +10 % |');
w('');
w('Amplitud, Persistencia y Propulsión dan además cosas que no son daño (más área para tocar enemigos, efectos que duran');
w('más, disparos que llegan antes): por eso a algunos ataques no les suben el DPS.');
w('');

// ---------------- números ----------------
const ids = Object.keys(M.BY_ID);
const order = ids.slice().sort((a, b) => ((R[b].evo || R[b].max || {}).valor || 0) - ((R[a].evo || R[a].max || {}).valor || 0));
w('## Números: nivel máximo y evolucionado');
w('');
w('Ordenada por el valor evolucionado. Los potenciadores, escudos y barridos (no pegan o casi) van al final, sin valor.');
w('');
w(`| Ataque | Familia | Máx: DPS jefe / horda | valor | Evo: DPS jefe / horda | valor | evo/máx jefe · horda${A ? ' (antes)' : ''} | control | frenado | cura · bloqueos | ${PASS.map(p => p[1]).join(' | ')} |`);
w('|---' + '|---'.repeat(9 + PASS.length) + '|');
const evoRatio = (r, id) => {
  const a = r[id] && r[id].max, b = r[id] && r[id].evo;
  if (!a || !b) return null;
  return [b.jefe * K / Math.max(0.1, a.jefe), b.horda * K / Math.max(0.1, a.horda)];
};
for (const id of order.filter(i => !UTIL.has(M.BY_ID[i].kind)).concat(order.filter(i => UTIL.has(M.BY_ID[i].kind)))) {
  const d = M.BY_ID[id], a = R[id].max, b = R[id].evo, e = M.EVO[id];
  const util = UTIL.has(d.kind);
  const ra = evoRatio(R, id), rb = A ? evoRatio(A, id) : null;
  const ratio = ra ? `${n2(ra[0])} · ${n2(ra[1])}${ra[0] < 1 || ra[1] < 1 ? ' ⚠' : ''}${rb ? ` (${n2(rb[0])} · ${n2(rb[1])})` : ''}` : '—';
  const u = (b || a).util || {}, ua = (a || {}).util || {};
  const g = (rep.gain || {})[id] || {};
  const name = d.name + (e ? ` → ${e[0]}` : '');
  w(`| ${name} | ${FAM[d.kind] || d.kind} | ${a ? n1(a.jefe) + ' / ' + n1(a.horda) : '—'} | ${util ? '—' : n2(a && a.valor)} | ` +
    `${b ? n1(b.jefe) + ' / ' + n1(b.horda) : '—'} | ${util || !b ? '—' : n2(b.valor)} | ${ratio} | ` +
    `${n1(ua.ctl)} → ${n1(u.ctl)} | ${n1(ua.slw)} → ${n1(u.slw)} | ${n1(u.hps)} · ${n2(u.bps)} | ` +
    PASS.map(([p]) => (util ? '—' : pct(g[p]))).join(' | ') + ' |');
}
w('');

// ---------------- fichas ----------------
w('## Ficha de cada ataque');
w('');
w('Qué hace, qué pasiva lo hace evolucionar, en qué se convierte y qué gana, y qué número cambia cada pasiva de ataque.');
w('(Potencia, Reflejos y Puntería les afectan a todos: arriba.)');
w('');
const byType = {};
for (const id of ids) (byType[M.BY_ID[id].type] = byType[M.BY_ID[id].type] || []).push(id);
for (const t of Object.keys(byType)) {
  w(`### ${TYPE[t] || t}`);
  w('');
  w('| Ataque | Familia | Qué hace | Evoluciona | Qué gana al evolucionar | Amplitud | Persistencia | Réplica | Propulsión |');
  w('|---|---|---|---|---|---|---|---|---|');
  for (const id of byType[t]) {
    const d = M.BY_ID[id], e = M.EVO[id];
    const evo = e ? `**${e[0]}** con ${M.NEED_NAME[e[1]]}` : 'no evoluciona';
    const inst = M.instance(id, d.maxLvl);
    const gain = e && M.evolve(inst) ? (e[2] && e[2].t) || '' : '';
    const fam = id => { const t = how(d.kind, id); return t || '—'; };
    w(`| ${d.name} | ${FAM[d.kind] || d.kind} | ${d.desc} | ${evo} | ${gain || famEvo(d)} | ${fam('area')} | ${fam('dur')} | ${fam('amt')} | ${fam('pspd')} |`);
  }
  w('');
}
function famEvo(d) {
  // Sin evolución propia: la de su familia (EVO_MODS no se exporta: se ve en lo que cambia).
  const a = M.instance(d.id, d.maxLvl), b = M.instance(d.id, d.maxLvl);
  if (!M.evolve(b)) return '';
  const ch = [];
  for (const k of ['dmg', 'count', 'pierce', 'bounce', 'radius', 'width', 'size', 'cd', 'dur', 'stun']) {
    if (typeof a[k] === 'number' && typeof b[k] === 'number' && Math.abs(a[k] - b[k]) > 1e-6) {
      ch.push(['count', 'pierce', 'bounce'].includes(k) ? `${k} +${Math.round(b[k] - a[k])}` : `${k} ×${n2(b[k] / a[k])}`);
    }
  }
  return ch.join(', ');
}
process.stdout.write(out.join('\n') + '\n');
