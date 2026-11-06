#!/usr/bin/env node
/* ============ medir-mega.cjs — cuánto sube cada Pokémon con su megaevolución (06-11-2026) ============
 *
 *   node tools/balance.cjs --pasivos --todas --json bal.json
 *   node tools/medir-pokemon.cjs bal.json --json pok.json > /dev/null
 *   node tools/medir-mega.cjs pok.json
 *
 * Parte del «valor» de medir-pokemon.cjs (1 = lo normal entre las formas finales) y le aplica el daño
 * de la mega (G.MEGA) durante el tiempo que dura. Dos ritmos, según cuánto cuesta recargarla:
 *   lento   60 derrotados por minuto (primeros minutos): 75 s de mega cada ~375 s
 *   rápido  600 derrotados por minuto (lo más alto del bot): 75 s de mega cada 105 s, el 71 % del tiempo
 * Fuera a propósito, como en medir-pokemon: habilidad, naturaleza y aguante (−15 % de daño recibido).
 * La norma de evolución no se mide aquí: la mega multiplica todos los ataques por igual.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const file = process.argv[2];
if (!file) { console.error('uso: node tools/medir-mega.cjs pok.json'); process.exit(2); }
const G = {};
for (const f of ['pokedex.js', 'megas.js']) vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/data', f), 'utf8'), { G });
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const by = {}; for (const r of rows) by[r.dex] = r;
const U_LENTO = 75 / 375, U_TOPE = 75 / 105;
const noMega = rows.filter(r => !G.MEGA_OF[r.dex]).map(r => r.v).sort((a, b) => b - a);
const top = noMega[0], p95 = noMega[Math.floor(noMega.length * 0.05)], med = noMega[Math.floor(noMega.length / 2)];
const f2 = v => v.toFixed(2).replace('.', ',');
const list = [];
for (const id in G.MEGA) {
  const m = G.MEGA[id], r = by[m.dex], p = G.DEX_BY[m.dex];
  if (!r) { console.log('! sin medir: ' + m.name[0]); continue; }
  const k = m.atk / p.atk;
  list.push({ n: m.name[0], rar: p.leg ? 'L' : p.rarity, v: r.v, k, lento: r.v * (1 + U_LENTO * (k - 1)), tope: r.v * (1 + U_TOPE * (k - 1)), pico: r.v * k });
}
list.sort((a, b) => b.tope - a.tope);
console.log(`Sin mega: mejor ${f2(top)} · 5 % mejores desde ${f2(p95)} · mediana ${f2(med)}\n`);
console.log('| Mega | Rareza | Valor | Daño | Media lenta | Media rápida | Pico |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
for (const x of list) console.log(`| ${x.n} | ${x.rar} | ${f2(x.v)} | ×${f2(x.k)} | ${f2(x.lento)} | ${f2(x.tope)} | ${f2(x.pico)} |`);
const over = list.filter(x => x.tope > top);
console.log(`\nPor encima del mejor sin mega, al ritmo rápido: ${over.length ? over.map(x => x.n).join(', ') : 'ninguna'}`);
const pk = list.filter(x => x.pico > top);
console.log(`Por encima en el pico, mientras dura: ${pk.length ? pk.map(x => x.n).join(', ') : 'ninguna'}`);
