#!/usr/bin/env node
/* ============ fetch_evolutions.js — evoluciones en partida (24-10-2026) ============
 * Baja de PokeAPI las cadenas evolutivas (evolution-chain) y las especies
 * (pokemon-species) y escribe js/data/evolutions.js: una regla por especie con
 * cómo evoluciona DURANTE la partida (ver la cabecera de ese archivo).
 *
 *   node tools/fetch_evolutions.js            baja lo que falte (tools/cache/evo) y genera
 *   node tools/fetch_evolutions.js --offline  sólo genera, con lo que ya hay en la caché
 *   node tools/fetch_evolutions.js --report   y además cuenta los métodos (para revisarlo)
 *
 * Sin dependencias. La caché (tools/cache/, fuera del repositorio) guarda sólo lo
 * que se usa de cada respuesta, así que volver a generar no toca internet.
 */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'tools', 'cache', 'evo');
const OUT = path.join(ROOT, 'js', 'data', 'evolutions.js');
const API = 'https://pokeapi.co/api/v2/';
const LAST = 1025;
const argv = process.argv.slice(2);
const OFFLINE = argv.includes('--offline'), REPORT = argv.includes('--report');

// ---------------- descarga con caché ----------------

function get(url, tries = 4) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'pokesurvivor-fetch-evolutions' } }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) {
        res.resume();
        if (tries > 1) return setTimeout(() => get(url, tries - 1).then(resolve, reject), 1500);
        return reject(new Error('HTTP ' + res.statusCode + ' ' + url));
      }
      let s = '';
      res.setEncoding('utf8');
      res.on('data', c => { s += c; });
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    }).on('error', e => (tries > 1 ? setTimeout(() => get(url, tries - 1).then(resolve, reject), 1500) : reject(e)));
  });
}

/** Lo de la caché, o lo baja con `get` y guarda lo que devuelva `keep`. */
let fetched = 0;
async function cached(file, url, keep) {
  const f = path.join(CACHE, file);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  if (OFFLINE) throw new Error('Falta en la caché: ' + file + ' (quita --offline)');
  if (++fetched % 100 === 0) console.log('descargados', fetched);
  const j = await get(url);
  const v = j ? keep(j) : null;
  fs.writeFileSync(f, JSON.stringify(v));
  return v;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const idOf = url => +String(url).replace(/\/$/, '').split('/').pop();
const LANGS = { es: 'es', en: 'en', fr: 'fr', it: 'it', 'zh-hans': 'zhHans', 'zh-hant': 'zhHant' };
const namesOf = j => {
  const o = {};
  for (const n of j.names || []) if (LANGS[n.language.name]) o[LANGS[n.language.name]] = n.name;
  return o;
};

/** Una cadena, sólo con lo que se usa: especie, si es bebé y los detalles de cada paso. */
function slimChain(node) {
  return {
    id: idOf(node.species.url), baby: !!node.is_baby,
    how: (node.evolution_details || []).map(d => {
      const o = { t: d.trigger && d.trigger.name };
      for (const [k, v] of Object.entries(d)) {
        if (k === 'trigger' || v === null || v === false || v === '' || (Array.isArray(v) && !v.length)) continue;
        o[k] = v && typeof v === 'object' && v.name ? v.name : v;
      }
      return o;
    }),
    to: (node.evolves_to || []).map(slimChain)
  };
}

async function download() {
  fs.mkdirSync(CACHE, { recursive: true });
  const ids = Array.from({ length: LAST }, (_, i) => i + 1);
  const species = await pool(ids, 12, id => cached('species-' + id + '.json', API + 'pokemon-species/' + id + '/', j => ({
    id: j.id, name: j.name, baby: !!j.is_baby, leg: !!j.is_legendary, myth: !!j.is_mythical,
    from: j.evolves_from_species ? idOf(j.evolves_from_species.url) : 0,
    chain: j.evolution_chain ? idOf(j.evolution_chain.url) : 0, names: namesOf(j)
  })));
  const chains = [...new Set(species.filter(Boolean).map(s => s.chain).filter(Boolean))];
  const chainData = await pool(chains, 12, id => cached('chain-' + id + '.json', API + 'evolution-chain/' + id + '/', j => slimChain(j.chain)));
  // Objetos y movimientos que salen en los detalles: sus nombres en cada idioma.
  const items = new Set(), moves = new Set();
  const walk = n => { for (const d of n.how) { if (d.item) items.add(d.item); if (d.held_item) items.add(d.held_item); if (d.known_move) moves.add(d.known_move); } n.to.forEach(walk); };
  chainData.forEach(c => c && walk(c));
  const itemNames = {}, moveNames = {};
  await pool([...items], 8, async it => { itemNames[it] = await cached('item-' + it + '.json', API + 'item/' + it + '/', namesOf); });
  await pool([...moves], 8, async mv => { moveNames[mv] = await cached('move-' + mv + '.json', API + 'move/' + mv + '/', namesOf); });
  return { species: species.filter(Boolean), chains: chainData.filter(Boolean), itemNames, moveNames };
}

// ---------------- datos del juego (los mismos archivos, en un contexto aislado) ----------------

function gameData() {
  const sb = { console, Math, JSON, Object, Array, Set, Map };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext('var G = window.G = {};', sb);
  for (const f of ['js/data/pokedex.js', 'js/data/moves.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  return sb.G;
}

// ---------------- de los detalles de PokeAPI a una regla de partida ----------------

/*
 * Cada paso de la cadena trae uno o varios "detalles" (uno por juego en el que
 * cambió el método). Se queda el de la versión de serie (is_default); si no hay,
 * uno que use un objeto (las evoluciones por lugar tienen piedra desde Espada/Escudo)
 * y si no, el primero. Los de formas regionales sólo si no hay otro.
 */
function pickDetail(how) {
  if (!how.length) return null;
  const regional = d => d.required_pokemon_form && /-(alola|galar|hisui|paldea)\b|white-striped/.test(d.required_pokemon_form);
  const list = how.filter(d => !regional(d)).length ? how.filter(d => !regional(d)) : how;
  return list.find(d => d.is_default) || list.find(d => d.t === 'use-item') || list[0];
}

/** Movimientos que existen en el juego: el id del juego es el de PokeAPI. */
let MOVES = null;

/**
 * La regla de un paso. lv: el nivel de los juegos (o uno equivalente si el método
 * no es por nivel: lo pone stageLevel después). Ver la cabecera de evolutions.js.
 */
function ruleOf(d, report) {
  if (!d || !d.t) return null;
  const note = k => { report[k] = (report[k] || 0) + 1; };
  switch (d.t) {
    case 'level-up':
    case 'in-battle-level-up': {
      if (d.known_move) { note('saber ' + d.known_move + (MOVES[d.known_move] ? '' : ' (no está)')); return MOVES[d.known_move] ? { k: 'move', mv: d.known_move } : { k: 'move' }; }
      if (d.known_move_type) { note('saber tipo ' + d.known_move_type); return { k: 'move', mt: d.known_move_type }; }
      if (d.held_item) { note('nivel con ' + d.held_item); return { k: 'item', it: d.held_item }; }
      if (d.min_steps) { note('pasos'); return { k: 'steps', n: d.min_steps }; }
      if (d.min_level) {
        const r = { k: 'lv', lv: d.min_level };
        if (d.needs_overworld_rain) { r.wx = 'rain'; note('nivel con lluvia'); }
        if (d.time_of_day) note('nivel de ' + d.time_of_day + ' (se ignora la hora)');
        if (d.gender) note('nivel por sexo (se ignora)');
        if (d.party_type || d.party_species || d.turn_upside_down || d.needs_multiplayer) note('nivel con condición rara (se ignora)');
        return r;
      }
      if (d.min_happiness || d.min_affection) { note('amistad'); return { k: 'friend' }; }
      if (d.party_species) { note('con otro en el equipo'); return { k: 'friend' }; }
      if (d.location) { note('lugar sin piedra'); return { k: 'item', it: 'thunder-stone' }; }
      note('subir de nivel sin más'); return { k: 'friend' };
    }
    case 'use-item': note('objeto'); return { k: 'item', it: d.item };
    case 'trade': note('intercambio' + (d.held_item ? ' con objeto' : d.trade_species ? ' por otro' : '')); return d.held_item ? { k: 'trade', it: d.held_item } : { k: 'trade' };
    case 'spin': note('girar con dulce'); return { k: 'item', it: d.held_item || 'strawberry-sweet' };
    case 'shed': note('muda (Shedinja)'); return { k: 'lv', lv: 20 };
    // Puño Furia: más fuerte cuantos más golpes recibe · Runerigus y Basculegion: recibir daño.
    case 'use-move': case 'take-damage': case 'recoil-damage': note('recibir daño'); return { k: 'damage', n: d.t === 'take-damage' ? 600 : 1500 };
    case 'three-defeated-bisharp': note('derrotar jefes'); return { k: 'bosses', n: 3 };
    case 'three-critical-hits': note('derrotar jefes'); return { k: 'bosses', n: 1 };
    case 'meltan-candies': note('derrotar enemigos'); return { k: 'kills', n: 400 };
    case 'gimmighoul-coins': note('monedas'); return { k: 'coins', n: 300 };
    case 'agile-style-move': case 'strong-style-move': note('estilo (no está)'); return { k: 'move' };
    case 'tower-of-darkness': case 'tower-of-waters': note('torre'); return { k: 'item', it: d.t === 'tower-of-darkness' ? 'scroll-of-darkness' : 'scroll-of-waters' };
    default: note('?? ' + d.t); return { k: 'friend' };
  }
}

/** Nivel equivalente de un paso que no es por nivel: según en qué fase está de su línea. */
function stageLevel(step, steps, prevLv) {
  const base = steps <= 1 ? 30 : step === 1 ? 20 : 36;
  return Math.max(base, prevLv ? prevLv + 8 : 0);
}

function generate(d) {
  const G = gameData();
  MOVES = G.Moves.BY_ID;
  const inGame = id => !!G.DEX_BY[id];
  const sp = {};
  for (const s of d.species) sp[s.id] = s;
  const report = {}, EVO = {}, usedItems = new Set();
  for (const chain of d.chains) {
    // Árbol sólo con los que están en el juego: el que falta se salta (sus hijos
    // cuelgan de su padre, con su propio método, que es el de después).
    const nodes = [];
    const walk = (n, parent, depth, babyFrom) => {
      const here = inGame(n.id);
      const me = here ? { id: n.id, parent, baby: n.baby, how: n.how, kids: [] } : null;
      if (me) { nodes.push(me); if (parent) parent.kids.push(me); }
      for (const c of n.to) walk(c, me || parent, depth + 1, babyFrom);
    };
    walk(chain, null, 0);
    // Pasos sin bebé hasta cada uno y por debajo (para el nivel equivalente).
    const stagesBelow = n => (n.kids.length ? 1 + Math.max(...n.kids.map(stagesBelow)) : 0);
    for (const n of nodes) {
      if (!n.parent) continue;
      const det = pickDetail(n.how);
      if (!det || !det.t) { report['sin método (no evoluciona)'] = (report['sin método (no evoluciona)'] || 0) + 1; continue; }
      const r = ruleOf(det, report);
      if (!r) continue;
      const rule = Object.assign({ f: n.parent.id }, r);
      // Bebé: su primera evolución es rápida, sea cual sea el método.
      if (n.parent.baby) rule.q = 1;
      // Nivel equivalente para lo que no va por nivel (y el de reserva de "saber un movimiento").
      if (rule.k !== 'lv') {
        let step = 0, a = n;
        while (a.parent && !a.parent.baby) { step++; a = a.parent; }
        const root = a;
        const steps = step + stagesBelow(n);
        const prev = n.parent.parent && !n.parent.parent.baby ? (EVO[n.parent.id] && EVO[n.parent.id].lv) || 0 : 0;
        if (!rule.q) rule.lv = stageLevel(step, steps, prev);
        void root;
      }
      // Legendarios y singulares (Cosmog, Tipo: Nulo, Kubfu, Poipole, Meltan): más deprisa.
      const leg = s => sp[s] && (sp[s].leg || sp[s].myth);
      if ((leg(n.id) || leg(n.parent.id)) && rule.lv) rule.lv = Math.round(rule.lv * 0.6);
      if (rule.it) usedItems.add(rule.it);
      EVO[n.id] = rule;
    }
  }
  // Nombres de los objetos: [es, en, fr, it, zh-Hans, zh-Hant] (como G.Mons.name).
  const ITEM = {};
  for (const it of [...usedItems].sort()) {
    const n = d.itemNames[it] || {};
    ITEM[it] = [n.es || n.en || it, n.en || it, n.fr || n.en || it, n.it || n.en || it, n.zhHans || n.en || it, n.zhHant || n.zhHans || n.en || it];
  }
  return { EVO, ITEM, report };
}

const HEADER = `/* ============ evolutions.js — GENERADO por tools/fetch_evolutions.js, no editar a mano ============
 * Cómo evoluciona cada Pokémon DURANTE la partida (24-10-2026). Se empieza siempre
 * con la primera fase de la línea de tu compañero y evoluciona según su método de
 * los juegos (PokeAPI: evolution-chain y pokemon-species), pasado a la partida:
 *
 *   G.EVO[dex] = { f, k, lv, ... }   cómo se llega a dex desde f (su fase anterior en el juego)
 *     k 'lv'      por nivel: lv es el de los juegos (G.Evo.runLevel lo pasa al nivel de la partida)
 *     k 'item'    piedra u objeto (it): aparece en el suelo cerca de ti al nivel equivalente
 *     k 'trade'   intercambio (con el objeto it, si lo pide): al nivel equivalente, o antes
 *                 en grupo, junto a un compañero
 *     k 'friend'  amistad: al nivel equivalente
 *     k 'move'    saber un movimiento (mv, si está en el juego) o uno de su tipo (mt):
 *                 al aprenderlo; si no, al nivel equivalente
 *     k 'coins' / 'steps' / 'bosses' / 'damage' / 'kills'   n monedas recogidas, pasos
 *                 (de 32 px), jefes derrotados, daño recibido o enemigos derrotados en la partida
 *     q 1         sale de un bebé: evolución rápida
 *     wx 'rain'   además, con lluvia (o unos niveles más tarde)
 *   lv: en lo que no va por nivel, uno equivalente según su fase (20 / 30 / 36...).
 *   Los que faltan en el juego se saltan; los legendarios, más deprisa (×0,6).
 * G.EVO_ITEM[id] = nombre del objeto [es, en, fr, it, zh-Hans, zh-Hant] (pt-BR: el inglés).
 */
`;

function write({ EVO, ITEM }) {
  const ent = Object.keys(EVO).map(Number).sort((a, b) => a - b).map(k => `  ${k}: ${JSON.stringify(EVO[k]).replace(/"(\w+)":/g, '$1:').replace(/"/g, "'")}`);
  const items = Object.keys(ITEM).map(k => `  '${k}': ${JSON.stringify(ITEM[k])}`);
  const src = HEADER + 'G.EVO = {\n' + ent.join(',\n') + '\n};\n\nG.EVO_ITEM = {\n' + items.join(',\n') + '\n};\n';
  fs.writeFileSync(OUT, src);
  return ent.length;
}

module.exports = { download, generate, CACHE };
if (require.main === module) {
  download().then(d => {
    const g = generate(d);
    const n = write(g);
    console.log(`${d.species.length} especies · ${d.chains.length} cadenas → ${n} reglas y ${Object.keys(g.ITEM).length} objetos en ${path.relative(ROOT, OUT)}`);
    if (REPORT) for (const [k, v] of Object.entries(g.report).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
  }).catch(e => { console.error(e); process.exit(1); });
}
