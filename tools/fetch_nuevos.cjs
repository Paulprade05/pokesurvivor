#!/usr/bin/env node
/* ============ fetch_nuevos.cjs — habilidades y MT de los Pokémon que entran al juego ============
 * js/data/abilities.js y js/data/tms.js salieron de un PR y no tienen generador. Esto
 * les añade los Pokémon que entren después, con los datos de PokeAPI:
 *
 *   node tools/fetch_nuevos.cjs 593 837 865
 *
 * Antes: fetch_sprites.py y fetch_pokedex.py; después, fetch_evolutions.js. Sólo añade:
 * no toca a los que ya están y se puede repetir. Las MT sólo cuentan si el ataque está
 * en el juego (si no hay clave en G.TM_MOVES). Avisa de habilidades sin nombre en G.ABIL.
 */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https');
const ROOT = path.join(__dirname, '..');
const ABIL = path.join(ROOT, 'js', 'data', 'abilities.js');
const TMS = path.join(ROOT, 'js', 'data', 'tms.js');

const get = url => new Promise((ok, ko) => {
  https.get(url, { headers: { 'User-Agent': 'pokesurvivor-fetch-nuevos' } }, res => {
    if (res.statusCode !== 200) { res.resume(); return ko(new Error(res.statusCode + ' ' + url)); }
    let s = ''; res.setEncoding('utf8'); res.on('data', d => { s += d; }); res.on('end', () => ok(JSON.parse(s)));
  }).on('error', ko);
});

/** Los archivos llevan CRLF o LF según la copia: se respeta el que tengan. */
function edit(file, fn) {
  const raw = fs.readFileSync(file, 'utf8'), crlf = raw.includes('\r\n');
  const out = fn(raw.replace(/\r\n/g, '\n'));
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
}

async function main() {
  const dexes = process.argv.slice(2).map(Number).filter(Boolean);
  if (!dexes.length) { console.log('Uso: node tools/fetch_nuevos.cjs <dex> [dex...]'); return; }
  const data = [];
  for (const dex of dexes) data.push({ dex, p: await get(`https://pokeapi.co/api/v2/pokemon/${dex}`) });

  edit(ABIL, src => {
    let out = src;
    for (const { dex, p } of data) {
      if (new RegExp(`^  ${dex}:\\[`, 'm').test(out)) continue;
      const slot = n => { const a = p.abilities.find(x => x.slot === n); return a ? a.ability.name : 0; };
      const row = [slot(1), slot(2), slot(3)];
      for (const a of row) if (a && !out.includes(`"${a}":[`)) console.log(`! ${dex}: ${a} no tiene nombre en G.ABIL`);
      const lines = out.split('\n');
      let at = -1;      // detrás del último número menor
      lines.forEach((l, i) => { const m = l.match(/^  (\d+):\[/); if (m && +m[1] < dex) at = i; });
      if (at >= 0 && !lines[at].endsWith(',')) lines[at] += ',';     // el último de la lista no lleva coma
      lines.splice(at + 1, 0, `  ${dex}:${JSON.stringify(row)},`);
      out = lines.join('\n');
      console.log(`${dex} ${p.name}: ${row.join(' · ')}`);
    }
    return out;
  });

  edit(TMS, src => {
    let out = src;
    for (const { dex, p } of data) {
      let n = 0;
      for (const m of p.moves) {
        if (!m.version_group_details.some(v => v.move_learn_method.name === 'machine')) continue;
        const re = new RegExp(`^(  "${m.move.name}":\\[)([\\d,]*)(\\])`, 'm');
        const hit = out.match(re);
        if (!hit) continue;
        const list = hit[2] ? hit[2].split(',').map(Number) : [];
        if (list.includes(dex)) continue;
        list.push(dex); list.sort((a, b) => a - b);
        out = out.replace(re, `$1${list.join(',')}$3`);
        n++;
      }
      console.log(`${dex} ${p.name}: ${n} MT`);
    }
    return out;
  });
}

main().catch(e => { console.error(e); process.exit(1); });
