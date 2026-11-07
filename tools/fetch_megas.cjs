#!/usr/bin/env node
/* ============ fetch_megas.cjs — datos de las megaevoluciones (06-11-2026) ============
 * Cruza PokeAPI con el tracker.json de SpriteCollab y escribe js/data/megas.js y, para
 * tools/fetch_sprites.py --megas, tools/cache/megas.json. Diseño: docs/MEGAEVOLUCIONES.md.
 *
 *   node tools/fetch_megas.cjs
 *
 * Una mega entra si tiene sprite con Idle (lo que falte lo saca fetch_sprites.py de otra
 * animación, como con los Pokémon) y su Pokémon es una forma final del juego. Se puede
 * volver a ejecutar: avisa de las que hayan ganado sprite o habilidad.
 *
 * Segunda fuente (07-11-2026): si SpriteCollab no tiene su cuerpo, el sprite de seguimiento
 * de pokeemerald-expansion (RHH, abajo; créditos en CREDITS.md). Sólo andar y quieto, 32×32
 * y sin ampliar: fetch_sprites.py --megas monta las hojas. SpriteCollab manda: si un día
 * dibuja una de estas, al volver a ejecutar se usa la suya.
 *
 * Los stats salen de las fórmulas de tools/fetch_pokedex.py y se ajustan AQUÍ, una vez
 * (sección 3.4 del documento): el juego no hace cuentas, sólo lee estos números.
 */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'js', 'data', 'megas.js');
const JOBS = path.join(ROOT, 'tools', 'cache', 'megas.json');
const API = 'https://pokeapi.co/api/v2/';
const TRACKER = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json';
// La segunda fuente: graphics/pokemon/<especie>/<mega | mega_x | mega_y | primal>/overworld.png,
// con overworld_normal.pal y overworld_shiny.pal al lado.
const RHH = 'https://raw.githubusercontent.com/rh-hideout/pokeemerald-expansion/master/graphics/pokemon/';

// Ajustes de la sección 3.4. Tope de daño por rareza del Pokémon (el legendario, como la 5).
// La fórmula sola da de +4 % a +51 %: reparte entre físico y especial, pero el total lo fija la rareza.
const DMG = { 1: 1.4, 2: 1.4, 3: 1.35, 4: 1.3, 5: 1.25 }, SPD_MIN = 0.9;
// Glalie y Camerupt ya están entre los mejores (tools/medir-mega.cjs): con ×1,35 pasarían al mejor de todos.
// Abomasnow (07-11-2026), igual: está en el 5 % mejor y con ×1,35 sería la mega más fuerte (2,50 frente al
// 2,57 de Glaceon al ritmo rápido; 2,70 en el pico).
const DMG_DEX = { 362: 1.25, 323: 1.25, 460: 1.25 };
// Formas de SpriteCollab que no entran: otro color, otra forma que el juego no tiene, o no oficiales.
const SKIP = /altcolor|alternate|shadow|skytemple|baby|original|stretchy|droopy/i;
// Sólo la especie importa aquí: Mega-Floette es de la Floette de flor eterna, no de la forma final (Florges).
const SKIP_DEX = new Set([670]);
// Nombre de la forma en PokeAPI, si no es «especie-mega».
const SLUG = { 978: 'tatsugiri-curly-mega' };
// Piedras: el objeto de PokeAPI (las que no siguen la regla general se buscan por especie).
const STONE = { 6: 'charizardite', 9: 'blastoisinite', 150: 'mewtwonite', 65: 'alakazite', 94: 'gengarite', 115: 'kangaskhanite',
  80: 'slowbronite', 142: 'aerodactylite', 208: 'steelixite', 214: 'heracronite', 227: 'skarmorite', 229: 'houndoominite',
  248: 'tyranitarite', 254: 'sceptilite', 282: 'gardevoirite', 302: 'sablenite', 303: 'mawilite', 308: 'medichamite',
  310: 'manectite', 319: 'sharpedonite', 323: 'cameruptite', 334: 'altarianite', 354: 'banettite', 358: 'chimechite',
  359: 'absolite', 362: 'glalitite', 373: 'salamencite', 380: 'latiasite', 381: 'latiosite', 382: 'blue-orb', 383: 'red-orb',
  384: 'meteorite', 428: 'lopunnite', 448: 'lucarionite', 460: 'abomasite', 475: 'galladite', 491: 'darkranite',
  530: 'excadrite', 531: 'audinite', 560: 'scraftinite', 604: 'eelektrossite', 691: 'dragalgite', 701: 'hawluchanite',
  718: 'zygardite', 719: 'diancite', 780: 'drampanite', 807: 'zeraorite', 978: 'tatsugirinite' };
// Las que mantienen tu habilidad aunque tengan otra: las suyas cambian el clima de todos (sección 3.6).
const KEEP_OWN = new Set(['desolate-land', 'primordial-sea', 'delta-stream']);

function get(url, tries = 4) {
  return new Promise((ok, ko) => {
    https.get(url, { headers: { 'User-Agent': 'pokesurvivor-fetch-megas' } }, res => {
      if (res.statusCode === 404) { res.resume(); return ok(null); }
      if (res.statusCode !== 200) { res.resume(); return tries > 1 ? setTimeout(() => get(url, tries - 1).then(ok, ko), 800) : ko(new Error(res.statusCode + ' ' + url)); }
      let s = ''; res.setEncoding('utf8'); res.on('data', d => { s += d; }); res.on('end', () => ok(JSON.parse(s)));
    }).on('error', e => (tries > 1 ? setTimeout(() => get(url, tries - 1).then(ok, ko), 800) : ko(e)));
  });
}
/** ¿Existe ese archivo? (HEAD: no lo baja; eso lo hace fetch_sprites.py). */
function exists(url, tries = 4) {
  return new Promise((ok, ko) => {
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'pokesurvivor-fetch-megas' } }, res => {
      res.resume();
      if (res.statusCode === 200) return ok(true);
      if (res.statusCode === 404) return ok(false);
      return tries > 1 ? setTimeout(() => exists(url, tries - 1).then(ok, ko), 800) : ko(new Error(res.statusCode + ' ' + url));
    });
    req.on('error', e => (tries > 1 ? setTimeout(() => exists(url, tries - 1).then(ok, ko), 800) : ko(e)));
    req.end();
  });
}
const nameIn = (o, lang) => ((o.names || []).find(n => n.language.name === lang) || {}).name;
const r2 = v => Math.round(v * 100) / 100;

function loadGame() {
  const G = {};
  for (const f of ['pokedex.js', 'abilities.js', 'evolutions.js']) vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'data', f), 'utf8'), { G });
  // Ojo: ability-fx.js necesita el juego entero; aquí basta con saber qué claves tiene.
  const fx = fs.readFileSync(path.join(ROOT, 'js', 'data', 'ability-fx.js'), 'utf8');
  G.hasFx = id => fx.includes(`'${id}':`) || fx.includes(`FX['${id}']`);
  G.hasKid = d => Object.keys(G.EVO).some(k => G.EVO[k].f === d && G.DEX_BY[k]);
  return G;
}

/**
 * La fila de G.MEGA de una forma (p: su pokemon de PokeAPI). suf: '', 'x', 'y', 'z' o 'primal'.
 * Stats con las fórmulas de fetch_pokedex.py y los ajustes de arriba.
 */
async function makeRow(G, dex, sp, suf, p, warn) {
  const mon = G.DEX_BY[dex], slug = p.name;
  const itemSlug = (STONE[dex] || sp.name + 'ite') + (/^[xyz]$/.test(suf) ? '-' + suf : '');
  const item = await get(`${API}item/${itemSlug}`);
  if (!item) warn.push(`${slug}: sin objeto ${itemSlug} en PokeAPI`);
  const b = {}; for (const st of p.stats) b[st.stat.name] = st.base_stat;
  const abil = ((p.abilities || []).find(a => a.ability) || { ability: null }).ability;
  const abilId = abil && abil.name;
  if (!abilId) warn.push(`${slug}: PokeAPI no da su habilidad (conserva la tuya)`);
  else if (!KEEP_OWN.has(abilId) && !G.hasFx(abilId)) warn.push(`${slug}: ${abilId} no tiene efecto en ability-fx.js (conserva la tuya)`);
  else if (!KEEP_OWN.has(abilId) && !G.ABIL[abilId]) warn.push(`${slug}: ${abilId} no tiene nombre en abilities.js`);

  const form = v => 0.70 + v / 100 * 0.55;
  let pa = form(b.attack), sa = form(b['special-attack']);
  const best = Math.max(pa, sa), k = DMG_DEX[dex] || DMG[mon.leg ? 5 : mon.rarity];
  pa *= k * mon.atk / best; sa *= k * mon.atk / best;
  const spd = Math.max(Math.round(78 + b.speed * 0.42), Math.round(mon.spd * SPD_MIN));

  const lab = suf === 'primal' ? '' : suf ? ' ' + suf.toUpperCase() : '';
  const es = suf === 'primal' ? mon.name + ' Primigenio' : 'Mega-' + mon.name + lab;
  const en = suf === 'primal' ? 'Primal ' + mon.name : 'Mega ' + mon.name + lab;
  return { id: p.id, dex, name: [es, en], stone: [item ? nameIn(item, 'es') || item.name : itemSlug, item ? nameIn(item, 'en') || item.name : itemSlug], ico: itemSlug,
           types: p.types.map(x => x.type.name), abil: abilId && !KEEP_OWN.has(abilId) && G.hasFx(abilId) && G.ABIL[abilId] ? abilId : '',
           hp: mon.hp, spd, atk: r2(Math.max(pa, sa)), pa: r2(pa), sa: r2(sa), df: b.defense, sd: b['special-defense'], height: p.height };
}

/** ¿Puede entrar una mega de este Pokémon? (si no, lo apunta en warn) */
function fits(G, dex, what, warn) {
  if (!G.DEX_BY[dex]) { warn.push(`${what}: tiene sprite y su Pokémon no está en el juego`); return false; }
  if (G.hasKid(dex)) { warn.push(`${what}: no es forma final`); return false; }
  return true;
}

async function main() {
  const G = loadGame(), t = await get(TRACKER), rows = [], jobs = [], warn = [];
  // ---- 1. SpriteCollab ----
  for (const [key, e] of Object.entries(t)) {
    const dex = +key;
    if (!dex || SKIP_DEX.has(dex)) continue;
    for (const [sub, s] of Object.entries(e.subgroups || {})) {
      if (!/^(mega|primal)/i.test(s.name || '') || SKIP.test(s.name)) continue;
      if (dex === 483 || dex === 484) continue;       // Dialga Primigenio: no es oficial
      const files = Object.keys(s.sprite_files || {});
      if (!files.includes('Idle')) continue;
      if (!fits(G, dex, `${e.name} ${s.name}`, warn)) continue;
      const suf = s.name.toLowerCase().replace('_', '-').replace(/^mega-?/, '').replace(/^primal$/, 'primal');
      const sp = await get(`${API}pokemon-species/${dex}`);
      const slug = SLUG[dex] || (suf === 'primal' ? sp.name + '-primal' : sp.name + '-mega' + (suf ? '-' + suf : ''));
      const p = await get(`${API}pokemon/${slug}`);
      if (!p) { warn.push(`${slug}: no está en PokeAPI`); continue; }
      const row = await makeRow(G, dex, sp, suf, p, warn);
      if (!files.includes('Walk')) row.noWalk = 1;
      rows.push(row);
      jobs.push({ id: p.id, dex, form: sub, shiny: Object.keys(((s.subgroups || {})['0001'] || {}).sprite_files || {}).includes('Idle') });
      process.stdout.write('.');
    }
  }

  // ---- 2. pokeemerald-expansion, para las que SpriteCollab no tiene ----
  const have = new Set(rows.map(r => r.id));
  const list = ((await get(`${API}pokemon?limit=3000`)) || { results: [] }).results
    .filter(r => /-(mega(-[xyz])?|primal)$/.test(r.name)).map(r => ({ name: r.name, id: +r.url.split('/').slice(-2)[0] }))
    .filter(r => !have.has(r.id));
  const rhh = [];
  for (const r of list) {
    const p = await get(`${API}pokemon/${r.name}`);
    if (!p) continue;
    const dex = +p.species.url.split('/').slice(-2)[0], spName = p.species.name;
    if (SKIP_DEX.has(dex) || dex === 483 || dex === 484) continue;
    // Sólo «especie-mega», «especie-mega-x/y/z» y «especie-primal» (las de otra forma, como
    // Meowstic macho, no tienen carpeta sencilla allí).
    const suf = r.name.slice(spName.length + 1).replace(/^mega-?/, '');
    if (!r.name.startsWith(spName + '-') || !/^(|[xyz]|primal)$/.test(suf)) continue;
    const dir = spName.replace(/-/g, '_') + '/' + (suf === 'primal' ? 'primal' : suf ? 'mega_' + suf : 'mega');
    if (!(await exists(RHH + dir + '/overworld.png')) || !(await exists(RHH + dir + '/overworld_normal.pal'))) continue;
    if (!fits(G, dex, r.name + ' (pokeemerald-expansion)', warn)) continue;
    const sp = await get(`${API}pokemon-species/${dex}`);
    rows.push(await makeRow(G, dex, sp, suf, p, warn));
    jobs.push({ id: p.id, dex, rhh: dir, shiny: await exists(RHH + dir + '/overworld_shiny.pal') });
    rhh.push(r.name);
    process.stdout.write('+');
  }

  rows.sort((a, b) => a.dex - b.dex || a.id - b.id);
  jobs.sort((a, b) => a.id - b.id);
  fs.mkdirSync(path.dirname(JOBS), { recursive: true });
  fs.writeFileSync(JOBS, JSON.stringify(jobs));

  const head = `/* ============ megas.js — GENERADO por tools/fetch_megas.cjs, no editar a mano ============
 * G.MEGA[id]: una megaevolución (id: su número en PokeAPI; viaja por la red en el dato de la
 * fase, ver coop.js). No entran en G.DEX: no cuentan en el gacha, la Pokédex ni los logros.
 *   dex    el Pokémon del que sale (forma final)      name, stone  [es, en]   ico  icono de la piedra
 *   types  sus tipos                                  abil  su habilidad ('' = se queda la tuya)
 *   hp spd atk pa sa df sd   stats del juego, ya ajustados (docs/MEGAEVOLUCIONES.md, 3.4)
 * G.MEGA_OF[dex] = [ids]: las de cada Pokémon (Charizard y Mewtwo tienen dos: X e Y).
 */
`;
  const body = rows.map(r => `  ${r.id}: ${JSON.stringify(r)}`).join(',\n');
  const tail = `\n};\n\nG.MEGA_OF = {};\nfor (const id in G.MEGA) (G.MEGA_OF[G.MEGA[id].dex] = G.MEGA_OF[G.MEGA[id].dex] || []).push(+id);\n`;
  fs.writeFileSync(OUT, head + 'G.MEGA = {\n' + body + tail);
  console.log(`\n${rows.length} megas en js/data/megas.js (${rhh.length} con el sprite de pokeemerald-expansion)`);
  if (rhh.length) console.log('  pokeemerald-expansion: ' + rhh.join(' '));
  for (const w of warn) console.log('! ' + w);
}

main().catch(e => { console.error(e); process.exit(1); });
