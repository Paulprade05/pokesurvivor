// Habilidades (17-11-2026, lo pidió el dueño): cada legendario y singular con una habilidad propia que
// no lleva nadie más; cada habilidad con un efecto de verdad (no la genérica), distinto de las demás y
// traducido; y los ganchos nuevos (auras, ondas, barreras, salvarse de caer) funcionando.
// node --test tests/habilidades.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function boot(lang = 'es') {
  const noop = () => {};
  const ctx = {
    G: {}, console, Math,
    navigator: { language: lang, languages: [lang] }, location: { pathname: '/', reload: noop },
    localStorage: { getItem: k => (k === 'ps.lang' ? lang : null), setItem: noop, removeItem: noop },
    document: { documentElement: {}, addEventListener: noop }, CanvasRenderingContext2D: class { fillText() {} strokeText() {} measureText() { return { width: 1 }; } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const load = f => vm.runInContext(source(f), ctx, { filename: f });
  for (const f of ['js/core/locales.js', 'js/core/i18n.js', 'js/data/lang-en.js', 'js/core/util.js', 'js/data/types.js', 'js/data/pokedex.js',
    'js/data/abilities.js', 'js/data/evolutions.js', 'js/data/families.js', 'js/data/ability-fx.js']) load(f);
  const G = ctx.G;
  G.DEX_BY = G.DEX_BY || {}; G.DEX.forEach(p => { G.DEX_BY[p.dex] = p; });
  return G;
}
const G = boot();
const FX = G.AbilityFX.FX;
const finals = G.Fam.FINALS.map(d => G.DEX_BY[d]);
const legs = finals.filter(p => p.leg);
const usedBy = {};
for (const p of G.DEX) (G.DEX_ABIL[p.dex] || []).forEach(a => { if (a) (usedBy[a] = usedBy[a] || new Set()).add(p.dex); });
const usedFinal = new Set();
for (const p of finals) (G.DEX_ABIL[p.dex] || []).forEach(a => { if (a) usedFinal.add(a); });

test('cada legendario y singular tiene una habilidad propia, fuerte y que no lleva nadie más', () => {
  assert.equal(legs.length, 83);
  const seen = new Set();
  for (const p of legs) {
    const l = G.DEX_ABIL[p.dex];
    assert.deepEqual([l[1], l[2]], [0, 0], `${p.name}: sólo una habilidad`);
    const a = l[0];
    assert.ok(a && G.ABIL[a], `${p.name}: habilidad con nombre`);
    assert.ok(FX[a] && FX[a].leg, `${p.name}: ${a} es de legendario (ability-fx.js)`);
    assert.ok(!seen.has(a), `${p.name}: ${a} repetida entre legendarios`);
    seen.add(a);
    assert.deepEqual([...usedBy[a]], [p.dex], `${p.name}: ${a} la lleva alguien más`);
    // Fuerte: algo que reacciona o actúa (no sólo un número plano).
    const f = FX[a];
    assert.ok(f.tick || f.hurt || f.kill || f.contact || f.hit || f.fall || f.taken || f.summon || f.absorb || f.block, `${p.name}: ${a} sin mecánica propia`);
  }
  // Y ninguna de legendario la lleva un Pokémon normal.
  for (const id in FX) if (FX[id].leg) assert.ok(usedBy[id] && [...usedBy[id]].every(d => G.DEX_BY[d].leg), id);
});

test('cada habilidad que se puede llevar tiene efecto propio, nombre y descripción en los dos idiomas', () => {
  const en = boot('en');
  const ALIAS = { 'pure-power': 'huge-power', 'libero': 'protean' };
  const byText = {};
  for (const a of usedFinal) {
    const f = G.AbilityFX.of(a, finals[0]);
    assert.ok(!f.generic && FX[a], `${a}: sin efecto (cae en la genérica)`);
    assert.ok(G.ABIL[a] && G.ABIL[a][0] && G.ABIL[a][1], `${a}: sin nombre`);
    assert.ok(typeof f.d === 'string' && f.d.length > 10, `${a}: sin descripción`);
    for (const s of [f.d, f.d2].filter(Boolean)) assert.notEqual(en.T(s), s, `${a}: falta en lang-en.js → ${s}`);
    const key = f.d + '|' + (f.d2 || '');
    if (!ALIAS[a]) { assert.ok(!byText[key], `${a} hace lo mismo que ${byText[key]}`); byText[key] = a; }
  }
  // Ninguna mejora plana diminuta: +3 %, +5 %... (las que se acumulan, «hasta +N %», aparte)
  for (const a of usedFinal) {
    const f = FX[a];
    for (const s of [f.d, f.d2].filter(Boolean).filter(x => !/hasta \+/.test(x))) assert.ok(!/(^|[^0-9,])[1-5] % de (daño|velocidad)/.test(s.replace(/\d+,\d/g, '')), `${a}: mejora diminuta → ${s}`);
  }
});

test('habilidades repetidas: muchas menos que antes', () => {
  const n = {};
  for (const p of finals) (G.DEX_ABIL[p.dex] || []).forEach(a => { if (a) n[a] = (n[a] || 0) + 1; });
  // Antes: Presión 25, Levitación 21 (casi todos legendarios). Ahora los legendarios llevan la suya.
  assert.ok(n.pressure <= 12, 'Presión: ' + n.pressure);
  assert.ok(n.levitate <= 16, 'Levitación: ' + n.levitate);
  // Efectos distintos: tantos como habilidades (menos los dos alias oficiales).
  assert.ok(Object.keys(n).length >= 300, 'habilidades distintas: ' + Object.keys(n).length);
});

// ---------------- los ganchos, en marcha ----------------
function world() {
  const foes = [];
  const g = boot();
  const log = { dmg: 0, stun: 0, slow: 0, burn: 0, psn: 0, rings: 0, beams: 0, pulled: 0 };
  g.Game = { st: { time: 0 } };
  g.Weather = { current: null, mult: () => 1, debugStart: (k) => { g.Weather.current = { kind: k }; } };
  g.Coop = { active: false };
  g.FX = { ring: () => log.rings++, beam: () => log.beams++, burst() {}, dmgText() {}, slash() {} };
  g.Camera = { kick() {} };
  g.Pickups = { drop() {}, pullAll: () => log.pulled++ };
  g.Mons = { abilityName: id => (g.ABIL[id] || [''])[0] };
  g.EnemyMgr = { queryCircle: (x, y, r) => foes.filter(e => (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.r) ** 2) };
  const foe = (x, y, boss = false) => {
    const e = { x, y, r: 12, hp: 1000, maxHp: 1000, boss, types: ['normal'], mon: { df: 50, sd: 80 }, dead: false, stunT: 0, slow: 0, poison: 0, burn: 0,
      hurt(d) { log.dmg += d; this.hp -= d; }, applyStun(t) { log.stun++; this.stunT = Math.max(this.stunT, t); },
      applySlow(f) { log.slow++; this.slow = Math.max(this.slow, f); }, applyBurn(n) { log.burn += n; this.burn += n; }, applyPoison(n) { log.psn += n; this.poison += n; } };
    foes.push(e); return e;
  };
  return { g, foes, foe, log };
}
function player(g, dex) {
  const b = () => ({ n: 0, amount: 0 });
  return { x: 0, y: 0, r: 14, bodyH: 24, aim: 0, level: 30, atk: 3, maxHp: 400, hp: 400, dead: false, remote: false, walking: true,
    mon: g.DEX_BY[dex], cdMul: 1, magnet: 78, xpMul: 1, coinMul: 1, critChance: 0, critDmg: 0, slowT: 0, invuln: 0, graceT: 0, dmgTaken: 0,
    buffs: { atk: b(), patk: b(), satk: b(), spd: b(), def: b() }, addBuff() {} };
}

test('cada legendario hace algo en partida: daña, frena, cura, protege o cambia sus números', () => {
  for (const p of legs) {
    const { g, foe, log } = world();
    const id = g.DEX_ABIL[p.dex][0], fx = g.AbilityFX.of(id, p);
    const pl = player(g, p.dex);
    g.AbilityFX.begin(pl, fx);
    for (let i = 0; i < 8; i++) foe(Math.cos(i) * 60, Math.sin(i) * 60, i === 0);
    const before = JSON.stringify([pl.maxHp, pl.cdMul, pl.xpMul, pl.coinMul, pl.magnet, pl.critChance]);
    let outK = 1, inK = 1, spdK = 1, healed = 0, saved = false, cut = 1;
    for (let t = 0; t < 50; t += 0.1) {
      g.Game.st.time = t;
      pl.hp = t < 25 ? pl.maxHp * 0.3 : pl.maxHp;              // con poca vida y con toda
      const h0 = pl.hp;
      if (fx.tick) fx.tick(pl, 0.1);
      healed += Math.max(0, pl.hp - h0);
      if (fx.hurt && t % 1 < 0.1) { pl.touchHit = true; fx.hurt(pl, 'fire', 'p', g.EnemyMgr.queryCircle(0, 0, 999)[0]); pl.touchHit = false; }
      if (fx.contact && t % 1 < 0.1) fx.contact(pl, g.EnemyMgr.queryCircle(0, 0, 999)[0]);
      if (fx.kill && t % 0.5 < 0.1) fx.kill(pl, g.EnemyMgr.queryCircle(0, 0, 999)[1]);
      const m = { type: p.types[0], cat: 'special', kind: 'melee', id: 'x', dmg: 20 };
      if (fx.out) outK = Math.max(outK, fx.out(pl, m, g.EnemyMgr.queryCircle(0, 0, 999)[0]));
      if (fx.hit) fx.hit(pl, g.EnemyMgr.queryCircle(0, 0, 999)[0], m);
      if (fx.inMul) inK = Math.min(inK, fx.inMul(pl, 'fire', 'p', null));
      if (fx.speed) spdK = Math.max(spdK, fx.speed(pl));
      if (fx.taken) cut = Math.min(cut, fx.taken(pl, pl.maxHp * 0.5, null) / (pl.maxHp * 0.5));
    }
    if (fx.fall) { pl.hp = 0; saved = fx.fall(pl); }
    const changed = before !== JSON.stringify([pl.maxHp, pl.cdMul, pl.xpMul, pl.coinMul, pl.magnet, pl.critChance]);
    const did = log.dmg > 0 || log.stun + log.slow + log.burn + log.psn > 0 || healed > 0 || saved || pl.abShield > 0 || outK > 1.05 || inK < 0.95 || spdK > 1.05 || cut < 1 || changed || fx.absorb || fx.summon;
    assert.ok(did, `${p.name} (${id}) no hace nada`);
    for (const k of ['dmg', 'stun', 'slow']) assert.ok(Number.isFinite(log[k]), `${p.name}: ${k}`);
  }
});

test('auras y ondas: dañan a los de cerca y no a los de lejos; la barrera y Robustez', () => {
  const { g, foe, log } = world();
  const near = foe(50, 0), far = foe(900, 0);
  const pl = player(g, 144), fx = g.AbilityFX.of('endless-blizzard', g.DEX_BY[144]);
  g.AbilityFX.begin(pl, fx);
  for (let t = 0; t < 11; t += 0.1) { g.Game.st.time = t; fx.tick(pl, 0.1); }
  assert.ok(near.hp < 1000 && near.slow > 0 && near.stunT > 0, 'Articuno: el de cerca, dañado, frenado y congelado');
  assert.equal(far.hp, 1000);
  // Daño de una habilidad: crece con el ataque y el nivel.
  const P = g.AbilityFX.pow;
  assert.ok(P({ atk: 6, level: 45 }, 1) > P({ atk: 1, level: 1 }, 1) * 10);
  // Robustez: salva una vez cada 90 s.
  const st = player(g, 76), sfx = g.AbilityFX.of('sturdy', g.DEX_BY[76]);
  g.AbilityFX.begin(st, sfx);
  g.Game.st.time = 100; st.hp = 0; assert.equal(sfx.fall(st), true); assert.equal(st.hp, 1);
  g.Game.st.time = 150; st.hp = 0; assert.equal(sfx.fall(st), false);
  g.Game.st.time = 191; st.hp = 0; assert.equal(sfx.fall(st), true);
  // Ho-Oh renace con el 60 %.
  const ho = player(g, 250), hfx = g.AbilityFX.of('sacred-phoenix', g.DEX_BY[250]);
  g.AbilityFX.begin(ho, hfx); ho.hp = 0; assert.equal(hfx.fall(ho), true); assert.equal(ho.hp, ho.maxHp * 0.6);
  // Cresselia: barrera cada 15 s.
  const cr = player(g, 488), cfx = g.AbilityFX.of('lunar-light', g.DEX_BY[488]);
  g.AbilityFX.begin(cr, cfx);
  for (let t = 0; t < 15.2; t += 0.1) { g.Game.st.time = t; cfx.tick(cr, 0.1); }
  assert.ok(cr.abShield > 0);
  // Caparazón: un golpe no quita más del 12 %.
  const sh = player(g, 91);
  assert.equal(g.AbilityFX.of('shell-armor').taken(sh, 300), sh.maxHp * 0.12);
  assert.ok(log.rings > 0);
});

test('player.js usa los ganchos nuevos (taken, fall, barrera, src)', () => {
  const s = source('js/entities/player.js');
  assert.ok(s.includes('ab.taken(this, d, src)'));
  assert.ok(s.includes('ab.fall(this)'));
  assert.ok(s.includes('this.abShield'));
  assert.ok(s.includes('ab.inMul(this, type, cls, src)'));
  assert.ok(s.includes('ab.hurt(this, type, cls, src)'));
});
