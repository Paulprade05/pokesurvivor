#!/usr/bin/env node
/*
 * Curva de dificultad medida con partidas de verdad (28-10-2026).
 *
 * Uso:  node tools/curve.cjs [--par 6] [--speed 2] [--cap 1860] [--out <carpeta>] 6:max 6:zero:2 225:max 150:zero ...
 *       node tools/curve.cjs --report <carpeta>...
 *   (puppeteer-core: `--pp <carpeta node_modules>` o PUPPETEER_CORE=<ruta>; Chrome: `--chrome <exe>` o CHROME=<exe>)
 *
 * Cada trabajo es `dex:mejoras[:repeticiones]`, con mejoras `max` (todas las del Pokémon al máximo, también
 * Persistencia, Propulsión y Réplica) o `zero` (ninguna). Pokémon de referencia: 225 Delibird (flojo), 6 Charizard
 * (medio, empieza de Charmander) y 445 Garchomp / 150 Mewtwo (fuertes).
 *
 * Abre dev.html en Chrome sin ventana con un servidor propio, entra como invitado y juega una partida entera con
 * un bot que esquiva (avisos en el suelo, disparos, campos de las firmas de los jefes), recoge, entra en las grietas
 * y elige las cartas como una persona que sabe jugar. El bot es INMORTAL: lleva una vida «virtual» (golpes,
 * regeneración y curas) y apunta cuándo habría caído; al caer vuelve a la vida llena y sigue, así una sola partida
 * dice la presión de cada minuto. «primera» es cuándo habría acabado la partida de verdad.
 *
 * El informe (--report, y al acabar una tanda) da por partida: primera caída, «muro» (primer minuto con ≥10 caídas,
 * o ≥5 dos minutos seguidos), caídas en los minutos 0-10 / 10-20 / 20-30 y nivel en los minutos 10, 20 y 29.
 * Objetivo (dueño, 26-10-2026): con mejoras al máximo se llega con esfuerzo al 20-30; sin mejoras se cae hacia el
 * 8-15; y los minutos 20-30 son los más duros. Se decide con «primera» además de con el muro (29-10-2026): con todas las
 * mejoras, la primera caída en el minuto 15 o más tarde en la mayoría de partidas (el resumen del final da la mediana).
 *
 * Medidas de la 2.0 (bloque 0 de docs/PROMPT-2.0.md, 30-10-2026), detrás de «caídas=N» en cada línea de minuto: bajas,
 * daño hecho, tiempo mediano para tumbar a un enemigo normal (ttk), DPS a un objetivo (sdps), director (dir), tickets
 * (tk=t1/t10), ataques al 5 (m5), evolucionados (ev) y cartas cogidas. En RESULT, cada jefe y legendario (ttk, ataques,
 * firmas, daño hecho mientras vivía) y cada grieta (ganada, ttk, nº de legendarios). El informe da sus medianas.
 * (Bloque 4) «ia=A%/B/C»: enemigos atascados (% de los vivos, muestreado cada 0,2 s), media bajo tierra y nadando.
 * --mega  (6-11-2026) lleva su megapiedra y megaevoluciona en cuanto puede; «mg=» en RESULT y en cada minuto, en s.mg.
 * --quiere id,id,...  (4-11-2026) las cartas sólo ofrecen esos ataques y empieza con el primero: mide un equipo concreto.
 *                     Con ataques cortos el bot juega pegado a la horda (closeRange).
 * --pref Réplica,Propulsión,...  esas pasivas antes que las demás (por nombre de carta).
 * El bot va a por el cofre grande, los altares, los manantiales si va mal de vida y los cofres pequeños (4-11-2026); los abre
 * con la acción 'open', como una persona: pulsa el pequeño y mantiene el grande (7-11-2026).
 * Al acabar, una línea REG con el daño de cada ataque (G.Reg: dealt, boss, active, lvl, evolved), para contrastar el modelo.
 * Con G.Director, el bot le pasa su vida virtual (hpFrac) y sus caídas (noteFall); «dir» = vida/daño/geo del director
 * (geo: lo que tarda en caer un enemigo normal, ver systems/director.js) y el informe da sus medianas.
 */
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = k => { const i = args.indexOf('--' + k); if (i < 0) return false; args.splice(i, 1); return true; };
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------- informe
function report(dirs) {
  const firsts = { max: [], zero: [] }, walls = { max: [], zero: [] };
  const G2 = () => ({ ia: [], lv: { 5: [], 10: [], 15: [], 20: [], 29: [] }, m5: [], ev: [], ttk: { 5: [], 10: [], 15: [], 20: [], 29: [] },
                      boss: { '3-12': [], '15-21': [], '24-27': [] }, dh: { 5: [], 10: [], 15: [], 20: [], 29: [] }, dd: { 5: [], 10: [], 15: [], 20: [], 29: [] }, dg: { 5: [], 10: [], 15: [], 20: [], 29: [] }, sig1: 0, sig2: 0, nb: 0, leg: {}, legSig: 0, nl: 0, rw: 0, rn: 0, hn: [], hs: [], tk: { 5: [], 10: [], 15: [], 20: [], 25: [], 30: [] } });
  const agg = { max: G2(), zero: G2() };
  for (const dir of dirs) {
    console.log('== ' + dir);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
      const s = fs.readFileSync(path.join(dir, f), 'utf8');
      const rows = [...s.matchAll(/\[\s*(\d+):(\d+)\] Nv\.(\d+) .*?caídas=(\d+)/g)].map(m => ({ m: +m[1], lv: +m[3], d: +m[4] }));
      // Campos de la 2.0 (bloque 0), si la partida los tiene.
      const ext = [...s.matchAll(/\[\s*(\d+):\d+\] Nv\.(\d+) .*?ttk=(\S+) sdps=(\d+) dir=(\S+) tk=(\d+)\/(\d+) m5=(\d+) ev=(\d+)/g)]
        .map(m => ({ m: +m[1], lv: +m[2], ttk: +m[3], sdps: +m[4], dir: m[5], t1: +m[6], t10: +m[7], m5: +m[8], ev: +m[9] }));
      const gg = /-max-/.test(f) ? 'max' : /-zero-/.test(f) ? 'zero' : null;
      if (gg && ext.length) {
        const A = agg[gg], at = m => ext.filter(x => x.m <= m).pop();
        for (const m of [5, 10, 15, 20, 29]) { const r = at(m); if (r && r.m >= m - 1) { A.lv[m].push(r.lv); if (!isNaN(r.ttk)) A.ttk[m].push(r.ttk);
          const dm = /^([\d.]+)\/([\d.]+)(?:\/([\d.]+))?$/.exec(r.dir); if (dm) { A.dh[m].push(+dm[1]); A.dd[m].push(+dm[2]); if (dm[3] && +dm[3] > 0) A.dg[m].push(+dm[3]); } } }
        for (const m of [5, 10, 15, 20, 25, 30]) { const r = at(m); if (r && r.m >= m - 1) A.tk[m].push(r.t1 + 10 * r.t10); }
        for (const m of s.matchAll(/ia=([\d.]+)%/g)) A.ia.push(+m[1]);
        const f5 = ext.find(x => x.m5 >= 4), fe = ext.find(x => x.ev >= 4);
        A.m5.push(f5 ? f5.m : 31); A.ev.push(fe ? fe.m : 31);
        const jb = /jefes=(\[.*?\]) grietas=(\[.*?\]) log=/.exec(s);
        if (jb) {
          for (const b of JSON.parse(jb[1])) {
            if (b.l) { A.nl++; if (b.sig) A.legSig++; continue; }
            A.nb++; if (b.sig >= 1) A.sig1++; if (b.sig >= 2) A.sig2++;
            const k = b.min < 13.5 ? '3-12' : b.min < 22.5 ? '15-21' : '24-27';
            if (b.ttk != null) A.boss[k].push(b.ttk);
          }
          for (const a of JSON.parse(jb[2])) { A.rn++; A.hn.push(...(a.hn || [])); A.hs.push(...(a.hs || [])); if (a.won) { A.rw++; (A.leg[a.n] = A.leg[a.n] || []).push(a.ttk); } }
        }
      }
      const res = /RESULT .*?primera=(\S+) caídas=\[([^\]]*)\]/.exec(s);
      if (!rows.length) { console.log(`${f.replace('.txt', '').padEnd(12)} (sin datos)`); continue; }
      let wall = null;
      for (let i = 0; i < rows.length; i++) { const r = rows[i], n = rows[i + 1]; if (r.d >= 10 || (r.d >= 5 && n && n.d >= 5)) { wall = r.m; break; } }
      const lv = m => { const r = rows.find(x => x.m === m) || rows.filter(x => x.m <= m).pop(); return r ? r.lv : '-'; };
      const first = res ? res[1] : '-';
      const g = /-max-/.test(f) ? 'max' : /-zero-/.test(f) ? 'zero' : null;
      if (g && res) { firsts[g].push(first === '-' ? 1860 : +first); walls[g].push(wall == null ? 31 : wall); }
      const sum = (a, b) => rows.filter(r => r.m >= a && r.m < b).reduce((t, r) => t + r.d, 0);
      console.log(`${f.replace('.txt', '').padEnd(12)} primera=${String(first === '-' ? '-' : (first / 60).toFixed(1) + 'min').padEnd(8)} muro=${wall == null ? 'no' : 'min ' + wall}`.padEnd(46) +
        ` caídas 0-10/10-20/20-30: ${sum(0, 10)}/${sum(10, 20)}/${sum(20, 99)}  Nv m10/m20/m29: ${lv(10)}/${lv(20)}/${lv(29)}  (llegó al ${rows[rows.length - 1].m})`);
    }
  }
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
  for (const g of ['max', 'zero']) {
    const a = firsts[g]; if (!a.length) continue;
    console.log(`resumen ${g.padEnd(4)}: ${a.length} partidas · primera caída mediana ${(med(a) / 60).toFixed(1)} min (${a.filter(x => x >= 900).length} en el 15 o más tarde, ${a.filter(x => x >= 480).length} en el 8 o más) · muro mediano min ${med(walls[g])}`);
  }
  // Medidas de la 2.0: medianas por grupo (max / zero).
  const md = a => { const v = med(a); return v == null ? '-' : Math.round(v * 10) / 10; };
  const pc = (n, d) => d ? Math.round(100 * n / d) + '%' : '-';
  for (const g of ['max', 'zero']) {
    const A = agg[g]; if (!A.m5.length) continue;
    const per = o => Object.keys(o).map(k => `m${k}=${md(o[k])}`).join(' ');
    console.log(`2.0 ${g.padEnd(4)}: nivel ${per(A.lv)} · ttk normal (s) ${per(A.ttk)}`);
    console.log(`         4 ataques al 5: min ${md(A.m5)} (antes del 9: ${A.m5.filter(x => x < 9).length}/${A.m5.length}) · 4 evolucionados: min ${md(A.ev)}`);
    console.log(`         jefes ttk (s) ${Object.keys(A.boss).map(k => k + '=' + md(A.boss[k]) + ' (' + A.boss[k].length + ')').join(' ')} · con 1 firma ${pc(A.sig1, A.nb)}, con 2 ${pc(A.sig2, A.nb)}`);
    console.log(`         grietas ganadas ${pc(A.rw, A.rn)} (${A.rn}) · arena (s) ${Object.keys(A.leg).map(k => k + ' leg=' + md(A.leg[k]) + ' (' + A.leg[k].length + ')').join(' ') || '-'} · legendarios con firma ${pc(A.legSig, A.nl)} · golpe en grieta normal ${md(A.hn)} (${A.hn.length}) firma ${md(A.hs)} (${A.hs.length})`);
    console.log(`         tickets (tiradas acumuladas) ${per(A.tk)}`);
    if (A.ia.length) console.log(`         IA: atascados ${md(A.ia)} % de mediana por minuto (máx. ${Math.max(...A.ia)} %, ${A.ia.filter(x => x > 1).length}/${A.ia.length} minutos > 1 %)`);
    if (A.dh[5].length) console.log(`         director vida ${per(A.dh)} · daño ${per(A.dd)} · geo (s) ${per(A.dg)}`);
  }
}

// ---------------------------------------------------------------- el bot (se ejecuta en la página)
const PRELUDE = String.raw`
window.sleep = ms => new Promise(r => setTimeout(r, ms));
window.home = async () => {
  for (const id of ['scr-settings', 'scr-news', 'scr-legal', 'scr-install', 'scr-profile']) { const e = document.getElementById(id); if (e) e.classList.add('hidden'); }
  if (document.querySelector('.scr:not(.hidden):not(#scr-menu)')) { G.Flow.goMenu(); await sleep(300); }
};
window.BOT = { on: false, log: [], wander: Math.random() * 6.28, wt: 0, seen: {}, spin: Math.random() < 0.5 ? 1 : -1, target: null };
// Cartas como una persona que sabe jugar: evoluciones, subir sus ataques, 2-3 ataques que pegan y pasivas de daño.
BOT.pick = function (cards, cardInfo) {
  const info = cards.map(cardInfo), pl = G.Game.player;
  const byName = {}; for (const id in G.Moves.BY_ID) byName[G.Moves.BY_ID[id].name] = G.Moves.BY_ID[id];
  const attacks = pl.moves.filter(m => !G.Moves.nonAttacking(m.kind || (m.def && m.def.kind))).length;
  const STAT = { 'Potencia': 42, 'Réplica': 40, 'Reflejos': 36, 'Amplitud': 30, 'Coraza': 30, 'Vigor': 26, 'Puntería': 24, 'Síntesis': 24,
                 'Persistencia': 20, 'Propulsión': 16, 'Carrera': 18, 'Imán': 12, 'Aprendizaje': 10 };
  // (2-11-2026) La pasiva que hace evolucionar a uno de sus ataques, mientras no llegue al nivel que pide
  // (3-11-2026: la mitad de su máximo, G.LevelUp.evoHas; antes bastaba cogerla una vez).
  const taken = pl.statsTaken || {}, needs = new Set();
  const has = id => (G.LevelUp.evoHas ? G.LevelUp.evoHas(id, taken, pl) : !!taken[id]);
  for (const m of pl.moves) {
    const e = G.Moves.EVO[m.id];
    if (e && !m.evolved && !has(e[1]) && !G.Moves.nonAttacking(m.kind || (m.def && m.def.kind))) needs.add(G.Moves.NEED_NAME[e[1]]);
  }
  const score = c => {
    if (/\bevo\b/.test(c.cls)) return 100;
    if (/unlocks/.test(c.cls)) return 90;
    const mv = byName[c.title], atk = mv && (!G.Moves.nonAttacking(mv.kind) || (BOT.want && BOT.want.includes(mv.id)));
    if (BOT.want && mv && BOT.want.includes(mv.id) && /is-new/.test(c.cls)) return 95;
    if (/is-up/.test(c.cls)) { const own = pl.moves.find(m => m.id === (mv && mv.id)); return atk ? 60 + (own ? own.lvl : 0) * 2 + (BOT.want && mv ? (BOT.want.length - BOT.want.indexOf(mv.id)) * 5 : 0) : 12; }
    if (/is-new/.test(c.cls)) return atk ? (attacks < 2 ? 75 : attacks < 3 ? 48 : 22) : 4;
    if (c.title === 'Baya Zidra') return pl.hp < pl.maxHp * 0.5 ? 70 : 1;
    // Todo al máximo (1-11-2026): curarte un poco (20 %) si va mal de vida; si no, «Monedas» (15, abajo).
    if (c.title === 'Curarte un poco') return pl.hp < pl.maxHp * 0.5 ? 70 : 1;
    if (BOT.pref && BOT.pref.includes(c.title)) return 59 + BOT.pref.length - BOT.pref.indexOf(c.title);
    if (needs.has(c.title)) return 58;
    return STAT[c.title] != null ? STAT[c.title] : 15;
  };
  let idx = 0, best = -1;
  info.forEach((c, i) => { const s = score(c) + Math.random() * 3; if (s > best) { best = s; idx = i; } });
  return idx;
};
(function () {
  const orig = G.Input.axis.bind(G.Input);
  // Prueba 16 direcciones (y quedarse quieto), mira dónde estarían él y los enemigos dentro de 0,25 / 0,5 / 0,9 s
  // y elige la más segura, con algo de atracción por orbes, la grieta y el espacio libre.
  const DIRS = []; for (let i = 0; i < 16; i++) DIRS.push([Math.cos(i / 16 * 6.2832), Math.sin(i / 16 * 6.2832)]); DIRS.push([0, 0]);
  let prev = [0, 0];
  // (5-11-2026) Los ataques cortos o que salen hacia donde miras no llegan huyendo: con ellos se juega como una persona, pegado
  // a la horda y andando hacia ella. Devuelve a qué distancia hay que quedarse (0: a distancia, como siempre).
  const CERCA = { melee: 0.7, spin: 0.7, aura: 0.7, shove: 0.7, orbit: 0.7, mine: 0.6, trail: 0.6, dash: 0.8, knife: 1 };
  function closeRange(pl) {
    if (!BOT.cerca) return 0;
    let D = 0;
    for (const m of pl.moves || []) { const k = CERCA[m.kind]; if (k) D = Math.max(D, m.kind === 'knife' ? 30 : Math.max(36, (m.radius || 60) * k)); }
    return D;
  }
  // (5-11-2026) Sólo pega el hueco activo: con un apoyo (--quiere apoyo,ataque) una persona va y vuelve. Las danzas, 4,5 s de cada
  // 10 para acumular; escudos y barridos, cuando estén listos.
  function swapSupport(pl) {
    if (!BOT.want || pl.slots.length < 2) return;
    const sup = g => g.some(m => G.Moves.nonAttacking(m.kind));
    const u = pl.slots.findIndex(sup), a = pl.slots.findIndex(g => !sup(g));
    if (u < 0 || a < 0) return;
    const m = pl.slots[u][0], t = G.Game.st ? G.Game.st.time || 0 : 0;
    let go;
    if (m.kind === 'buff') go = t % 10 < 4.5;
    else {
      const wants = m.kind === 'ward' ? (m.charges | 0) < 1 : G.EnemyMgr.all().length >= 4;
      if (m.t <= 0 && wants && t >= (BOT.supT || 0)) BOT.supT = t + 0.6;
      go = t < (BOT.supT || 0);
    }
    const i = go ? u : a;
    if (i !== pl.active) pl.setActive(i);
  }
  function smart(pl) {
    const s = pl.spd || 100, R = pl.r || 12, en = [], pr = [], D = closeRange(pl);
    for (const e of G.EnemyMgr.all()) if (!e.dead && Math.abs(e.x - pl.x) < 420 && Math.abs(e.y - pl.y) < 420 && e.behavior !== 'thief' && !(G.BossSig && G.BossSig.hidden(e))) en.push(e);
    for (const p of G.Projectiles.all()) if (!p.friendly && !p.orb && Math.abs(p.x - pl.x) < 320 && Math.abs(p.y - pl.y) < 320) pr.push(p);
    const hz = G.Hazards.all.filter(h => !h.hit);
    const fl = G.BossSig && G.BossSig.botFields ? G.BossSig.botFields() : [];
    let tx = null, ty = null, tw = 0;
    const gem = pl.evo && pl.evo.item;
    if (gem) { tx = gem.x; ty = gem.y; tw = 1.6; }
    else if (BOT.target) { tx = BOT.target.x; ty = BOT.target.y; tw = 1.4; }
    else {
      // (4-11-2026) Como una persona: el cofre grande (hay que quedarse al lado), el altar, el manantial si va mal de vida
      // y los cofres pequeños (cerca, antes que seguir recogiendo). Se abren en G.Input.axis, de abajo.
      const low = window.V ? V.hp / pl.maxHp < 0.55 : pl.hp / pl.maxHp < 0.55;
      let gd = 1e12, goal = null;
      for (const p of G.World.specialsNear(pl.x, pl.y, 620)) {
        const ok = p.type === 'bigchest' || (p.type === 'altar' && !p.used) || (p.type === 'spring' && low && !p.dry);
        if (!ok) continue;
        const d2 = ((p.x - pl.x) ** 2 + (p.y - pl.y) ** 2) * (p.type === 'spring' ? 0.3 : p.type === 'altar' ? 0.8 : 1);
        if (d2 < gd) { gd = d2; goal = p; }
      }
      if (goal) { tx = goal.x; ty = goal.y; tw = 1.3; }
      else {
        let cd = 260 * 260, br = null;
        for (const p of G.World.specialsNear(pl.x, pl.y, 260)) {
          const d2 = (p.x - pl.x) ** 2 + (p.y - pl.y) ** 2;
          if (p.type === 'chest' && d2 < cd) { cd = d2; br = p; }
        }
        if (br) { tx = br.x; ty = br.y; tw = 1.1; }
        else {
          let bd = 1e12, best = null;
          for (const p of G.Pickups.all()) { const d2 = (p.x - pl.x) ** 2 + (p.y - pl.y) ** 2; if (d2 < bd) { bd = d2; best = p; } }
          if (best && bd < 600 * 600) { tx = best.x; ty = best.y; tw = 0.9; }
        }
      }
    }
    let near = null, nd = 300;
    if (D && tw < 1.4) for (const e of en) { const d = Math.hypot(e.x - pl.x, e.y - pl.y); if (d < nd) { nd = d; near = e; } }
    let bestS = -1e9, bx = 0, by = 0;
    for (const [dx, dy] of DIRS) {
      let danger = 0;
      for (const T of [0.25, 0.5, 0.9]) {
        const px = pl.x + dx * s * T, py = pl.y + dy * s * T;
        if (T < 0.6 && (dx || dy) && !G.World.isFree(px, py, Math.min(R, 11))) danger += 6;
        for (const e of en) {
          let ux = pl.x - e.x, uy = pl.y - e.y; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
          const es = (e.spd || 60) * (e.phase === 'dash' ? 3 : 1) * 0.9;
          const d = Math.hypot(px - (e.x + ux * es * T), py - (e.y + uy * es * T)) - (e.r || 12) - R, M = D ? (e.boss ? 45 : 20) : (e.boss ? 90 : 50);
          if (d < M) danger += (e.boss ? 3 : e.champ ? 2 : 1) * ((M - d) / M) ** 2 * (T < 0.3 ? 1.6 : 1);
        }
        for (const h of hz) { if (h.delay - h.t > T + 0.45) continue; if (G.Hazards.inside(h, px, py, R + 8)) danger += 9 * (h.kind === 'zone' && h.r > 80 ? 1.2 : 1); }
        for (const f of fl) if (f.hits(px, py, R + 6, T)) danger += f.w;
        for (const p of pr) { const d = Math.hypot(px - (p.x + p.vx * T), py - (p.y + p.vy * T)) - (p.r || 7) - R; if (d < 18) danger += 2.5 * ((18 - d) / 18) ** 2; }
      }
      let gain = 0;
      if (tx != null && (dx || dy)) { const l = Math.hypot(tx - pl.x, ty - pl.y) || 1; gain += ((tx - pl.x) * dx + (ty - pl.y) * dy) / l * tw; }
      if (tx == null && (dx || dy)) {
        BOT.wt -= 1 / 600; if (BOT.wt <= 0) { BOT.wander += (Math.random() - 0.5) * 1.6; BOT.wt = 2.5; }
        gain += (Math.cos(BOT.wander) * dx + Math.sin(BOT.wander) * dy) * 0.5;
      }
      if (near && (dx || dy)) gain += ((near.x - pl.x) * dx + (near.y - pl.y) * dy) / (nd || 1) * (nd > D ? 1.2 : nd < D * 0.6 ? -0.8 : 0);
      if (!D && (dx || dy)) { let c = 0; for (const e of en) { const ex = e.x - pl.x, ey = e.y - pl.y, l = Math.hypot(ex, ey); if (l < 320 && l > 1) c += (ex * dx + ey * dy) / l * (1 - l / 320); } gain -= c * 0.35; }
      if (!D && (dx || dy) && en.length > 4 && tw < 1.4) {
        let cx = 0, cy = 0; for (const e of en) { cx += e.x; cy += e.y; } cx /= en.length; cy /= en.length;
        let ox = pl.x - cx, oy = pl.y - cy; const l = Math.hypot(ox, oy) || 1; ox /= l; oy /= l;
        gain += (-oy * BOT.spin * dx + ox * BOT.spin * dy) * 0.6;
      }
      gain += (dx * prev[0] + dy * prev[1]) * 0.25;
      if (gain - danger > bestS) { bestS = gain - danger; bx = dx; by = dy; }
    }
    prev = [bx, by];
    // La ráfaga sale hacia donde andas: si vas hacia el enemigo, derecho a él (16 direcciones fallan a 100 px).
    if (near && (bx || by) && (pl.moves || []).some(m => m.kind === 'knife')) {
      const ux = (near.x - pl.x) / (nd || 1), uy = (near.y - pl.y) / (nd || 1);
      if (ux * bx + uy * by > 0.7) return [ux, uy];
    }
    return [bx, by];
  }
  G.Input.axis = function () {
    if (!BOT.on) return orig();
    const pl = G.Game.player; if (!pl) return [0, 0];
    const r = G.Rift.rift;
    // (07-11-2026) Cada grieta que se abre en el mapa: cuándo, a qué distancia, y si había jefe (en RESULT, «abiertas=»).
    if (r && r !== BOT.lastRift && window.M) { BOT.lastRift = r; M.opened = M.opened || []; M.opened.push({ t: T(), d: Math.round(G.U.dist(pl.x, pl.y, r.x, r.y)), boss: G.EnemyMgr.bossAlive() ? 1 : 0 }); }
    BOT.target = r && !G.EnemyMgr.bossAlive() ? { x: r.x, y: r.y - 10 } : null;
    swapSupport(pl);
    // Un cofre al alcance: se pulsa y se mantiene (el pequeño se abre con lo primero; el grande, con lo segundo).
    if (G.Interact.near) { G.Input.virtualAct('open'); G.Input.virtualHold('open'); }
    return smart(pl);
  };
  const visible = id => { const e = document.getElementById(id); return e && !e.classList.contains('hidden'); };
  const T = () => Math.round(G.Game.st ? (G.Game.st.time || 0) : 0);
  const cardInfo = el => ({ cls: el.className.replace('card pick-card', '').trim(), title: (el.querySelector('.nm') || {}).textContent || '' });
  setInterval(() => {
    if (!BOT.on) return;
    try {
      if (visible('scr-levelup')) { const cards = [...document.querySelectorAll('#cards .pick-card')]; if (cards.length) cards[BOT.pick(cards, cardInfo)].click(); }
      else if (visible('scr-item')) { const c = document.querySelector('#item-cards .pick-card'); if (c) c.click(); }
      else if (visible('scr-bond')) { const c = document.querySelector('#bond-cards .pick-card[data-over]') || document.querySelector('#bond-cards .pick-card'); if (c) c.click(); }   // (07-11-2026: la sobrefusión antes que un 2.º grupo)
      else if (visible('scr-evo')) { const c = document.querySelector('#evo-cards .pick-card'); if (c) c.click(); }
      if (G.Rift.traveling) G.Rift.skipTravel();
    } catch (e) { BOT.log.push('bot err ' + e.message); }
  }, 250);
  let lastForm = null, lastBan = '';
  setInterval(() => {
    const pl = G.Game.player;
    if (!pl || G.Game.state === 'ui') { lastForm = null; return; }
    if (lastForm !== null && pl.form !== lastForm) BOT.log.push(T() + 's Nv.' + pl.level + ' evoluciona ' + (G.DEX_BY[lastForm] || {}).name + ' -> ' + (G.DEX_BY[pl.form] || {}).name);
    lastForm = pl.form;
    const b = G.Spawner.banner && G.Spawner.banner(), tx = b ? b.text : '';
    if (tx && tx !== lastBan) BOT.log.push(T() + 's aviso: ' + tx);
    lastBan = tx;
  }, 200);
})();
`;

// ---------------------------------------------------------------- una partida
async function one(dex, upg, tag, speed, cap, want, pref) {
  const ppDir = opt('pp', process.env.PUPPETEER_CORE || '');
  let puppeteer;
  // (path.resolve: una ruta relativa se lee desde la carpeta en la que se lanza, no desde tools/.)
  try { puppeteer = require(ppDir ? path.resolve(/puppeteer-core$/.test(ppDir) ? ppDir : path.join(ppDir, 'puppeteer-core')) : 'puppeteer-core'); }
  catch (e) { console.error('Falta puppeteer-core: pasa --pp <carpeta node_modules> o PUPPETEER_CORE=<ruta>'); process.exit(2); }
  // Chrome (o Edge) en las rutas normales de Windows, Mac y Linux, salvo que se diga otro con --chrome o CHROME.
  const CHROME = opt('chrome', process.env.CHROME || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(p => fs.existsSync(p)) || 'C:/Program Files/Google/Chrome/Application/chrome.exe');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
  const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try { if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); } catch (e) { /* */ }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 3600000,
    args: ['--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const page = await browser.newPage();
  let errors = 0;
  page.on('pageerror', e => { errors++; console.log('  !! pageerror', String(e.message || e).slice(0, 300)); });
  page.on('console', m => { if (m.type() === 'error' && !/beforeunload|favicon|firebase|ERR_|Failed to load resource/i.test(m.text())) { errors++; console.log('  !! console.error', m.text().slice(0, 300)); for (const h of m.args()) h.evaluate(x => (x && x.stack) || '').then(t => { if (t) console.log('  !! pila', t.slice(0, 500)); }).catch(() => {}); } });
  await page.setViewport({ width: 932, height: 430, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const log = s => console.log(s);
  try {
    // (Con muchas a la vez, cargar puede tardar: 30 s no bastaban con 12.)
    await page.goto(`http://127.0.0.1:${server.address().port}/dev.html?dev`, { waitUntil: 'load', timeout: 180000 });
    await page.evaluate(PRELUDE);
    // Entrar como invitado (y pasar el test de naturaleza si sale).
    await page.evaluate(async () => {
      for (let i = 0; i < 80 && !document.querySelector('#scr-login:not(.hidden), #scr-menu:not(.hidden)'); i++) await sleep(250);
      const g = [...document.querySelectorAll('button')].find(b => b.offsetParent && /invitado|guest/i.test(b.textContent));
      if (g) { g.click(); await sleep(1200); }
      for (let i = 0; i < 12; i++) { const b = document.querySelector('#scr-test:not(.hidden) .answer'); if (!b) break; b.click(); await sleep(300); }
      await sleep(400);
      const v = [...document.querySelectorAll('#scr-result button')].find(b => b.offsetParent);
      if (v) { v.click(); await sleep(1200); }
    });
    await page.evaluate(async (dex, upg, want, pref, mega) => {
      if (pref) BOT.pref = pref;
      if (want) {       // (--quiere: sólo esos ataques en las cartas y el primero, de inicio)
        BOT.want = want;
        BOT.cerca = true;
        G.Moves.poolFor = () => want.slice();
        G.startMoveOf = () => want[0];
      }
      const S = G.DB.save, U = G.DB.upgradesOf(dex);
      for (const k of Object.keys(U)) delete U[k];
      if (upg === 'max') for (const u of G.Upgrades.LIST) U[u.id] = u.max;
      S.owned[dex] = S.owned[dex] || { at: Date.now(), from: 'gacha' };
      S.partner = dex; S.partnerShiny = false;
      // --mega (06-11-2026): lleva su megapiedra y megaevoluciona en cuanto puede.
      if (mega) { S.ach = S.ach || {}; S.ach.rift1 = 1; S.pz = {}; S.mst = { [G.Shop.megaId(dex)]: 1 }; }
      // Daño recibido por origen: contacto (t), disparo enemigo (p), aviso en el suelo (h), firma de jefe (s).
      window.DMG = { touch: 0, proj: 0, hz: 0, sig: 0, other: 0, total: 0 };
      window.__src = 'other';
      const wrap = (obj, fn, src) => { if (!obj || !obj[fn]) return; const o = obj[fn].bind(obj); obj[fn] = function (...a) { const p = window.__src; window.__src = src; try { return o(...a); } finally { window.__src = p; } }; };
      wrap(G.Hazards, 'update', 'hz'); wrap(G.Projectiles, 'update', 'proj'); wrap(G.Combat, 'resolve', 'touch'); wrap(G.BossSig, 'update', 'sig');
      await home();
      BOT.on = true;
      // (2.0, bloque 5) --speed marca la partida como acelerada y el reloj de tickets no contaría: con ?dev se le dice que sí.
      if (G.Tickets) G.Tickets.debugIgnoreTamper = true;
      G.Flow.play();
      await sleep(1500);
      // Vida «virtual»: no cae nunca, pero apunta cuándo habría caído.
      const pl = G.Game.player, h = pl.hurt.bind(pl), hl = pl.heal.bind(pl);
      window.V = { hp: pl.maxHp, deaths: [], heal: 0 };
      pl.heal = function (a, ...r) { V.heal += Math.max(0, a || 0); return hl(a, ...r); };
      pl.hurt = function (a, ...r) {
        const hp0 = pl.hp; pl.hp = 1e9;
        const out = h(a, ...r), d = Math.max(0, 1e9 - pl.hp);
        pl.hp = hp0; pl.dead = false; V.hp -= d;
        if (V.hp <= 0) { V.deaths.push(Math.round(G.Game.st.time)); V.hp = pl.maxHp; }
        // (G.Combat.resolve resuelve los toques y también los disparos enemigos: el toque lleva pl.touchHit.)
        const src = window.__src === 'touch' && !pl.touchHit ? 'proj' : window.__src;
        if (d > 0) { DMG[src] = (DMG[src] || 0) + d; DMG.total += d; }
        return out;
      };
      let last = G.Game.st.time;
      setInterval(() => { const now = G.Game.st.time, k = Math.max(0, Math.min(3, now - last)); last = now; V.hp = Math.min(pl.maxHp, V.hp + (pl.regen || 0) * k + V.heal); V.heal = 0; }, 100);
      // El director (bloque 2) lee la vida virtual, no la real (que el bot nunca pierde).
      const dirHook = () => { if (G.Director) G.Director.hpFrac = () => V.hp / pl.maxHp; };
      dirHook(); setInterval(dirHook, 1000);
      const fall = V.deaths.push.bind(V.deaths);
      V.deaths.push = (...a) => { if (G.Director && G.Director.noteFall) G.Director.noteFall(pl); return fall(...a); };
      // Medidas de la 2.0 (bloque 0): tiempo para tumbar (ttk) enemigos normales, jefes y legendarios,
      // ataques y firmas que usan los jefes, daño que hacen y grietas ganadas.
      const now = () => G.Game.st.time;
      window.M = { ttk: [], boss: [], arenas: [], arena: null };
      const E = G.Enemy.prototype, hurt0 = E.hurt, die0 = E.die, start0 = E.bossStart;
      E.hurt = function (...a) { if (!this.dead && !this.remote && this._t0 == null) this._t0 = now(); return hurt0.apply(this, a); };
      E.die = function (...a) {
        const was = this.dead, out = die0.apply(this, a);
        if (!was && this.dead && !this.remote) {
          const t = now();
          if (this._b) { this._b.ttk = +(t - (this._t0 != null ? this._t0 : this._b.at)).toFixed(1); this._b.dead = Math.round(t); }
          else if (this._t0 != null && !this.boss && !this.judge && !this.legend && !this.weak && this.behavior !== 'thief') M.ttk.push(t - this._t0);
        }
        return out;
      };
      E.bossStart = function (...a) { if (this._b) this._b.atk++; return start0.apply(this, a); };
      const sig0 = G.BossSig.start;
      G.BossSig.start = function (e, ...a) { if (e && e._b) e._b.sig++; return sig0.call(this, e, ...a); };
      const add0 = G.EnemyMgr.add;
      G.EnemyMgr.add = function (e, ...a) {
        if (e && e.boss && !e.judge && !e.remote) {
          e._b = { name: e.name, legend: !!e.legend, min: +(now() / 60).toFixed(1), at: now(), hp: Math.round(e.maxHp), ttk: null, atk: 0, sig: 0, dmg: 0 };
          M.boss.push(e._b);
          if (e.legend && !M.arena) M.arena = { min: +(now() / 60).toFixed(1), legs: [] };
          if (e.legend) M.arena.legs.push(e._b);
        }
        return add0.call(this, e, ...a);
      };
      // Daño que hacen los jefes: lo que recibe el jugador mientras viven (repartido entre los vivos).
      const vh = pl.hurt;
      pl.hurt = function (a, ...r) {
        const d0 = DMG.total, out = vh.call(pl, a, ...r), d = DMG.total - d0;
        if (d > 0) { const al = M.boss.filter(b => b.dead == null && b.ttk == null); for (const b of al) b.dmg += d / al.length; }
        // (Grietas, 02-11-2026) Cada golpe recibido en la arena: de una firma (mientras un legendario la usa o hasta 1,2 s
        //  después) o normal. Los de menos de 5 (quemaduras, esbirros) no cuentan.
        if (d >= 5 && G.Rift.inArena && M.arena) {
          const sig = G.EnemyMgr.bosses().some(e => e.legend && ((e.ai && e.ai.cast && e.ai.cast.id === 'sig') || (e._sigEnd != null && now() - e._sigEnd < 1.2)));
          (M.arena[sig ? 'hs' : 'hn'] = M.arena[sig ? 'hs' : 'hn'] || []).push(Math.round(d));
        }
        return out;
      };
      setInterval(() => {
        for (const e of G.EnemyMgr.bosses()) if (e.legend) { const c = e.ai && e.ai.cast; if (c && c.id === 'sig') e._wasSig = true; else if (e._wasSig) { e._wasSig = false; e._sigEnd = now(); } }
      }, 50);
      // (2.0, bloque 4) IA: vivos, atascados, bajo tierra y nadando, muestreados cada 0,2 s (G.EnemyMgr.debugStats).
      window.AI = { n: 0, live: 0, stuck: 0, under: 0, swim: 0 };
      setInterval(() => {
        if (G.EnemyMgr.debugStats && G.Game.state === 'playing') {
          const d = G.EnemyMgr.debugStats(); AI.n++; AI.live += d.vivos; AI.stuck += d.atascados; AI.under += d.bajoTierra; AI.swim += d.nadando;
        }
        const inA = G.Rift.inArena;
        if (inA && !M.arena) M.arena = { min: +(now() / 60).toFixed(1), legs: [] };
        else if (!inA && M.arena) {
          const a = M.arena; M.arena = null;
          if (a.legs.length) {
            a.won = a.legs.every(b => b.ttk != null);
            const t0 = Math.min(...a.legs.map(b => b.at)), t1 = Math.max(...a.legs.map(b => b.dead || 0));
            a.ttk = a.won ? Math.round(t1 - t0) : null; a.n = a.legs.length; delete a.legs; M.arenas.push(a);
          }
        }
      }, 200);
    }, dex, upg, want || null, pref || null, process.argv.includes('--mega'));
    await page.evaluate(k => G.Game.debugSpeed(k), speed);
    const t0 = Date.now();
    let s = null, lastLog = -999, lastDmg = 0, lastDeaths = 0, lastKills = 0, lastDealt = 0, ttks = [], judgeAt = null, lastAi = { n: 0, live: 0, stuck: 0, under: 0, swim: 0 };
    for (let i = 0; i < 6000; i++) {
      await new Promise(r => setTimeout(r, 1000));
      s = await page.evaluate(() => {
        const pl = G.Game.player;
        if (G.Mega && G.Mega.of(pl) && G.Mega.ready(pl, G.Mega.of(pl))) G.Mega.use(pl);
        return { t: Math.round(G.Game.st.time), mg: pl.mg ? pl.mg.uses : 0, ov: pl.over || 0, fz: Math.max(0, ...pl.slots.map(g => g.length)), lv: pl.level, max: Math.round(pl.maxHp), form: (G.DEX_BY[pl.form] || {}).name, kills: pl.kills, en: G.EnemyMgr.count,
          boss: G.EnemyMgr.bosses().map(e => e.name + (e.legend ? '*' : '') + ':' + Math.round(100 * e.hp / e.maxHp) + '%').join(','), arena: G.Rift.inArena, judge: G.Judgment.active,
          over: G.Game.state === 'over', moves: pl.moves.map(m => m.id + m.lvl + (m.evolved ? '*' : '')).join(' '), dmg: Object.assign({}, DMG), vhp: Math.round(V.hp), deaths: V.deaths.slice(),
          dealt: Math.round(pl.dmgDealt), ttk: M.ttk.splice(0), cards: Object.assign({}, pl.statsTaken), t1: pl.t1, t10: pl.t10,
          sdps: Math.round(G.Judgment.singleDps ? G.Judgment.singleDps() : G.Judgment.debug.single),
          dir: G.Director ? (+G.Director.hp()).toFixed(2) + '/' + (+G.Director.dmg()).toFixed(2) + '/' + (+G.Director.geo || 0).toFixed(2) : '-',
          m5: pl.moves.filter(m => !G.Moves.nonAttacking(m.kind || (m.def && m.def.kind)) && m.lvl >= 5).length,
          ev: pl.moves.filter(m => !G.Moves.nonAttacking(m.kind || (m.def && m.def.kind)) && m.evolved).length,
          ai: Object.assign({}, AI) };
      });
      ttks.push(...s.ttk);
      if (s.t - lastLog >= 60 || s.over) {
        lastLog = s.t;
        const dm = s.dmg.total - lastDmg; lastDmg = s.dmg.total;
        const nd = s.deaths.length - lastDeaths; lastDeaths = s.deaths.length;
        const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
        const cards = Object.entries(s.cards).map(([k, v]) => k + v).join(',');
        // (Los campos nuevos van detrás de caídas=N: report() lee hasta ahí.)
        log(`${tag} [${String(Math.floor(s.t / 60)).padStart(2)}:${String(s.t % 60).padStart(2, '0')}] Nv.${s.lv} ${s.form} v${s.vhp}/${s.max} en=${s.en} dmg/min=${Math.round(dm)} (${(dm / s.max).toFixed(1)}x) caídas=${nd} ` +
            `bajas=${s.kills - lastKills} mg=${s.mg} hecho=${s.dealt - lastDealt} ttk=${ttks.length ? med(ttks).toFixed(2) : '-'} sdps=${s.sdps} dir=${s.dir} tk=${s.t1}/${s.t10} m5=${s.m5} ev=${s.ev} cartas=${cards || '-'} ` +
            `ia=${s.ai.live > lastAi.live ? (100 * (s.ai.stuck - lastAi.stuck) / (s.ai.live - lastAi.live)).toFixed(1) : '-'}%/${s.ai.n > lastAi.n ? ((s.ai.under - lastAi.under) / (s.ai.n - lastAi.n)).toFixed(1) : '-'}/${s.ai.n > lastAi.n ? ((s.ai.swim - lastAi.swim) / (s.ai.n - lastAi.n)).toFixed(1) : '-'} ` +
            `${s.boss ? 'JEFE ' + s.boss : ''}${s.arena ? ' ARENA' : ''}${s.judge ? ' SENTENCIA' : ''} t/p/h/s=${Math.round(s.dmg.touch)}/${Math.round(s.dmg.proj)}/${Math.round(s.dmg.hz)}/${Math.round(s.dmg.sig)} | ${s.moves}`);
        lastKills = s.kills; lastDealt = s.dealt; ttks = []; lastAi = s.ai;
      }
      // (Al empezar la Sentencia, 2 s más para ver lo que pasa al llegar.)
      if (s.judge && judgeAt == null) judgeAt = Date.now();
      if (s.over || s.t >= cap || (judgeAt != null && Date.now() - judgeAt >= 2000) || Date.now() - t0 > 90 * 60 * 1000) break;
    }
    const blog = await page.evaluate(() => BOT.log.filter(l => /evolu|aviso: ¡|err/.test(l)).slice(-30).join(' | '));
    const meas = await page.evaluate(() => ({ boss: M.boss.map(b => ({ n: b.name, l: b.legend ? 1 : 0, min: b.min, hp: b.hp, ttk: b.ttk, atk: b.atk, sig: b.sig, dmg: Math.round(b.dmg) })), arenas: M.arenas, opened: M.opened || [] }));
    const reg = await page.evaluate(() => { try { const r = G.Reg.build(), o = {}; for (const id in r.moves) { const m = r.moves[id]; o[id] = { d: m.dealt, b: m.boss, a: m.active, l: m.lvl, e: m.evolved ? 1 : 0, g: m.group, h: m.hits, k: m.kills }; } return { dur: r.dur, lvl: r.lvl, kills: r.kills, dealt: r.dealt, taken: r.taken, healed: r.healed, bossesN: r.bossesN, item: r.item, cards: r.statsTaken, moves: o, en: r.tl.map(x => x[7]), keys: r.tlKeys, tl: r.tl, ev: r.ev, takenBy: r.takenBy, bosses: r.bosses, kinds: r.kinds }; } catch (e) { return null; } });
    if (reg) log(`${tag} REG ${JSON.stringify(reg)}`);
    log(`${tag} RESULT dex=${dex} upg=${upg} INMORTAL primera=${s.deaths[0] || '-'} caídas=${JSON.stringify(s.deaths)} t=${s.t} lv=${s.lv} kills=${s.kills} tk=${s.t1}/${s.t10} real=${Math.round((Date.now() - t0) / 1000)}s errores=${errors} fus=${s.fz} sobre=${s.ov} ` +
        `abiertas=${JSON.stringify(meas.opened)} jefes=${JSON.stringify(meas.boss)} grietas=${JSON.stringify(meas.arenas)} log=${blog}`);
  } catch (e) { log(`${tag} FALLO ${e && e.stack || e}`); }
  finally { await browser.close(); server.close(); }
}

// ---------------------------------------------------------------- tanda
async function main() {
  const rep = args.indexOf('--report');
  if (rep >= 0) return report(args.slice(rep + 1));
  if (flag('one')) {
    const [dex, upg, tag] = args;
    const want = opt('quiere', ''), pref = opt('pref', '');
    return one(+dex, upg, tag, +opt('speed', 2), +opt('cap', 1860), want ? want.split(',') : null, pref ? pref.split(',') : null);
  }
  const par = +opt('par', 6), speed = opt('speed', '2'), cap = opt('cap', '1860'), chrome = opt('chrome', ''), want = opt('quiere', ''), pref = opt('pref', '');
  const pp0 = opt('pp', process.env.PUPPETEER_CORE || ''), pp = pp0 && path.resolve(pp0);
  const out = path.resolve(opt('out', path.join(os.tmpdir(), 'ps-curve-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'))));
  const jobs = args.filter(a => /^\d+:(max|zero)(:\d+)?$/.test(a));
  if (!jobs.length) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 7).join('\n')); return; }
  fs.mkdirSync(out, { recursive: true });
  const queue = [];
  for (const j of jobs) { const [dex, upg, n = 1] = j.split(':'); for (let r = 0; r < +n; r++) queue.push({ dex, upg, tag: `${dex}-${upg}-${r}` }); }
  console.log(`${queue.length} partidas, ${par} a la vez, en ${out}`);
  let running = 0;
  await new Promise(done => {
    const next = () => {
      if (!queue.length) { if (!running) done(); return; }
      const j = queue.shift(); running++;
      const f = fs.openSync(path.join(out, j.tag + '.txt'), 'w');
      const a = [__filename, '--one', j.dex, j.upg, j.tag, '--speed', speed, '--cap', cap];
      if (pp) a.push('--pp', pp);
      if (chrome) a.push('--chrome', chrome);
      if (want) a.push('--quiere', want);
      if (args.includes('--mega')) a.push('--mega');
      if (pref) a.push('--pref', pref);
      spawn(process.execPath, a, { stdio: ['ignore', f, f] }).on('exit', () => { running--; console.log('hecha', j.tag); next(); });
    };
    // (Escalonadas: si arrancan todas a la vez, Chrome tarda tanto en cargar que alguna falla.)
    for (let i = 0; i < par; i++) setTimeout(next, i * 4000);
  });
  report([out]);
}
main().catch(e => { console.error(e); process.exit(1); });
