#!/usr/bin/env node
/*
 * Laboratorio de ataques (2026-11-05): cada ataque, en partidas de verdad, sin cuenta y en local.
 *
 *   node tools/laboratorio.cjs --pp <node_modules> --out <carpeta> [--dex 151] [--par 9] [--cap 840] [--speed 2] [--solo a,b]
 *   node tools/laboratorio.cjs --informe <carpeta>[,<carpeta>...] > informe.md
 *
 * Abre el juego en Chrome sin ventana como invitado (tools/curve.cjs), con un Pokémon fijo y todas las mejoras, y juega una
 * partida con cada ataque: las cartas sólo ofrecen ese ataque (`--quiere`) y el resto son pasivas. Los potenciadores, escudos y
 * barridos no pegan solos: van con Placaje, el bot va y vuelve entre los dos huecos, y Placaje solo sirve de referencia.
 *
 * El bot esquiva, recoge, entra en las grietas, abre cofres, usa altares y manantiales. Tiene vida infinita: lleva una vida
 * «virtual» y apunta cuándo habría caído, así que una partida mide toda la curva. G.Reg guarda cada 5 s el daño hecho, el
 * recibido, la vida, los enemigos y las bajas (línea REG de cada archivo): de ahí sale este informe.
 *
 * Mew de referencia: 1,25 de ataque físico y especial, así no cuenta el lado. Sus ataques de tipo Psíquico llevan el +20 % de
 * monotipo: el informe se lo quita. Ojo: dos partidas iguales difieren ×1,3 de normal y ×2 a veces, sobre todo por las
 * cartas que salen (con más Ataque, ×1,5). Hacen falta varias por ataque, y sirve para ver los extremos, no para un 10 %.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };

const ctx = { window: {}, console };
ctx.G = ctx.window.G = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data/moves.js'), 'utf8'), ctx);
const M = ctx.G.Moves;
const NAME = id => (M.BY_ID[id] ? M.BY_ID[id].name : id);
const util = id => M.nonAttacking(M.BY_ID[id].kind);

const MONO_K = 1.2; // Player.MONO_K
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const n0 = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const n2 = v => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');

function read(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.txt'))) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = /REG (\{.*\})\s*$/m.exec(s);
    if (!m) continue;
    const r = JSON.parse(m[1]);
    const res = /RESULT .*?primera=(\S+) caídas=\[([^\]]*)\]/.exec(s);
    r.id = f.replace('.txt', '');
    r.falls = res && res[2] ? res[2].split(',').filter(Boolean).map(Number) : [];
    r.first = res && res[1] !== '-' ? +res[1] : null;
    out.push(r);
  }
  return out;
}

/** Lo que interesa de una partida. Mew lleva +20 % en sus ataques Psíquicos: se le quita para compararlos con los demás. */
function summary(r) {
  const K = (r.keys || []).reduce((o, k, i) => { o[k] = i; return o; }, {});
  const at = (row, k, i) => row[K[k] != null ? K[k] : i];
  const def = M.BY_ID[r.id] || {};
  const mono = def.type === 'psychic' ? 1 / MONO_K : 1;
  const tl = (r.tl || []).map(x => ({ t: at(x, 't', 0), dealt: at(x, 'dps', 4) * mono, taken: at(x, 'tps', 6) }));
  const avg = (a, b, k) => { const l = tl.filter(x => x.t > a && x.t <= b); return l.length ? l.reduce((s, x) => s + x[k], 0) / l.length : 0; };
  const mv = r.moves[r.id] || {};
  const ev = r.ev || [];
  const count = k => ev.filter(e => e[1] === k).length;
  const dur = Math.max(1, r.dur);
  const boss = Object.values(r.moves).reduce((s, m) => s + (m.b || 0), 0);
  return {
    id: r.id, name: NAME(r.id), type: def.type, kind: def.kind, util: !!def.kind && M.nonAttacking(def.kind), dur: r.dur, lvl: r.lvl, kills: r.kills,
    dps: r.dealt * mono / dur, own: (mv.d || 0) / dur, d0: avg(0, 300, 'dealt'), d5: avg(300, 600, 'dealt'), d10: avg(600, 1e9, 'dealt'),
    peak: tl.reduce((m, x) => Math.max(m, x.dealt), 0),
    takenS: (r.taken || 0) / dur, t0: avg(0, 300, 'taken'), t5: avg(300, 600, 'taken'), t10: avg(600, 1e9, 'taken'), healS: (r.healed || 0) / dur,
    bossPct: r.dealt ? boss / r.dealt : 0, bosses: r.bossesN || 0, cofres: count('cofre'), altares: count('altar'), grietas: count('grieta'),
    evolved: !!mv.e, moveLvl: mv.l, falls: r.falls.length, first: r.first
  };
}

/** Une las partidas de un ataque: media de cada número y la lista de daños, para ver cuánto se parecen. */
function merge(list) {
  const out = { ...list[0], games: list.map(x => x.dps) };
  for (const k of Object.keys(out)) if (typeof out[k] === 'number') out[k] = list.reduce((s, x) => s + (x[k] || 0), 0) / list.length;
  out.evolved = list.filter(x => x.evolved).length;
  return out;
}

const row = (r, mDps) => `| ${r.name} | ${r.kind} | ${n0(r.dps)} | ${r.games.map(n0).join(' / ')} | ${n2(r.dps / mDps)} | ${n0(r.d0)} | ${n0(r.d5)} | ${n0(r.d10)} | ${n2(r.takenS)} | ${n2(r.t0)} | ${n2(r.t5)} | ${n2(r.t10)} | ${n2(r.healS)} | ${Math.round(r.bossPct * 100)} | ${n0(r.kills)} | ${n0(r.lvl)} | ${r.evolved}/${r.games.length} | ${Math.round(r.falls)} |`;
const HEAD = ['| Ataque | Familia | Daño/s | Cada partida | ×mediana | 0-5 min | 5-10 | 10+ | Recibido/s | 0-5 | 5-10 | 10+ | Cura/s | Jefes % | Bajas | Nv | Evo | Caídas |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];

/** dirs: carpetas separadas por comas; cada ataque junta las partidas que tenga en ellas. */
function report(dirs) {
  const flat = dirs.split(',').flatMap(d => read(d).map(summary));
  const by = {};
  for (const r of flat) (by[r.id] = by[r.id] || []).push(r);
  const all = Object.values(by).map(merge).sort((a, b) => b.dps - a.dps);
  const rows = all.filter(r => !r.util), utils = all.filter(r => r.util);
  const out = [];
  const mDps = median(rows.map(r => r.dps));
  out.push(`${flat.length} partidas de ${all.length} ataques (${rows.length} que pegan, ${utils.length} de apoyo). Mediana de los que pegan: ${n0(mDps)} de daño/s, ${n2(median(rows.map(r => r.takenS)))} de daño recibido/s, ${n0(median(rows.map(r => r.kills)))} bajas, nivel ${n0(median(rows.map(r => r.lvl)))}.`);
  const tot = k => flat.reduce((s, r) => s + r[k], 0);
  out.push(`Hecho en total: ${tot('cofres')} cofres, ${tot('altares')} altares, ${tot('grietas')} grietas, ${tot('bosses')} jefes.`, '');
  out.push('## Ataques que pegan', '', ...HEAD, ...rows.map(r => row(r, mDps)), '');
  out.push('## Por familia', '', '| Familia | Ataques | Daño/s mediano | Mínimo | Máximo | Recibido/s | Nivel |', '|---|---|---|---|---|---|---|');
  const fam = {};
  rows.forEach(r => (fam[r.kind] = fam[r.kind] || []).push(r));
  for (const [k, l] of Object.entries(fam).sort((a, b) => median(b[1].map(r => r.dps)) - median(a[1].map(r => r.dps)))) {
    const d = l.map(r => r.dps);
    out.push(`| ${k} | ${l.length} | ${n0(median(d))} | ${n0(Math.min(...d))} | ${n0(Math.max(...d))} | ${n2(median(l.map(r => r.takenS)))} | ${n0(median(l.map(r => r.lvl)))} |`);
  }
  out.push('', '## Apoyo: lo que pega es Placaje', '', 'Comparar con la fila de Placaje: la diferencia es lo que aporta el apoyo. «Propio» es el daño del apoyo en sí.', '');
  out.push('| Ataque | Familia | Daño/s total | ×Placaje | Propio/s | Recibido/s | Cura/s | Bajas | Nv |', '|---|---|---|---|---|---|---|---|---|');
  const base = (all.find(r => r.id === 'tackle') || { dps: 1 }).dps;
  for (const r of utils) out.push(`| ${r.name} | ${r.kind} | ${n0(r.dps)} | ${n2(r.dps / base)} | ${n0(r.own)} | ${n2(r.takenS)} | ${n2(r.healS)} | ${n0(r.kills)} | ${n0(r.lvl)} |`);
  return out.join('\n');
}

async function main() {
  if (args.includes('--informe')) { console.log(report(opt('informe'))); return; }
  const dex = opt('dex', '151'), par = +opt('par', 9), cap = opt('cap', '840'), speed = opt('speed', '2');
  const pp = path.resolve(opt('pp', '')), out = path.resolve(opt('out', 'lab'));
  const solo = opt('solo', '');
  const ids = solo ? solo.split(',') : Object.keys(M.BY_ID);
  fs.mkdirSync(out, { recursive: true });
  const queue = ids.filter(id => !fs.existsSync(path.join(out, id + '.txt')) || !/RESULT|FALLO/.test(fs.readFileSync(path.join(out, id + '.txt'), 'utf8')));
  console.log(`${queue.length} ataques, ${par} a la vez, en ${out}`);
  let running = 0, done = 0;
  await new Promise(fin => {
    const next = () => {
      if (!queue.length) { if (!running) fin(); return; }
      const id = queue.shift(); running++;
      const f = fs.openSync(path.join(out, id + '.txt'), 'w');
      const want = util(id) ? `${id},tackle` : id;
      const a = [path.join(__dirname, 'curve.cjs'), '--one', dex, 'max', id, '--speed', speed, '--cap', cap, '--pp', pp, '--quiere', want];
      spawn(process.execPath, a, { stdio: ['ignore', f, f] }).on('exit', () => { running--; done++; console.log(`${done} ${id}`); next(); });
    };
    for (let i = 0; i < par; i++) setTimeout(next, i * 4000);
  });
}
main().catch(e => { console.error(e); process.exit(1); });
