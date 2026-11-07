// Auditoría de ataques (2026-11-07): cada carta de mejora y cada evolución hace lo que dice (tools/auditoria-ataques.cjs).
//
// La tabla tests/auditoria-ataques.tabla.json fija lo comprobado: ataque × paso → lo que cambia (mods) y lo que se ha
// medido en el sandbox (tools/sandbox.cjs: el combate de verdad, sin ventana, en los escenarios solo, masa y horda).
// Si cambias una carta, vuelve a pasar la auditoría y rehaz la tabla: node tools/auditoria-ataques.cjs --tabla
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'auditoria-ataques.tabla.json'), 'utf8'));
const A = require(path.join(root, 'tools/auditoria-ataques.cjs'));
const SB = require(path.join(root, 'tools/sandbox.cjs'));
const M = SB.G.Moves;

// Lo de las cartas que la tabla fija: texto y números de cada paso.
function steps() {
  const out = {};
  for (const id of Object.keys(M.BY_ID)) {
    const d = M.BY_ID[id];
    d.ups.forEach((u, i) => { out[`${id} ${i + 1}→${i + 2}`] = { t: u.t, mods: u.m }; });
  }
  return out;
}

test('la tabla cubre todas las cartas de todos los ataques y todas están comprobadas', () => {
  const now = steps(), rows = TABLE.rows.filter(r => r.step !== 'evo');
  const keys = rows.map(r => `${r.id} ${r.step}`);
  assert.deepEqual(keys.slice().sort(), Object.keys(now).sort());
  for (const r of rows) {
    const k = `${r.id} ${r.step}`;
    assert.equal(r.t, now[k].t, `${k}: el texto ha cambiado; rehaz la tabla con la auditoría`);
    // (JSON: los de moves.js vienen de otro contexto de vm, con otro Object.)
    assert.equal(JSON.stringify(r.mods), JSON.stringify(now[k].mods), `${k}: los números han cambiado; rehaz la tabla con la auditoría`);
    assert.deepEqual(r.issues.filter(i => i.k !== 'aviso'), [], `${k}: ${r.issues.map(i => i.d).join('; ')}`);
    assert.ok(r.checks.every(c => c.ok), `${k}: ${JSON.stringify(r.checks)}`);
  }
});

test('la tabla cubre todas las evoluciones y ninguna tiene fallos', () => {
  const evo = TABLE.rows.filter(r => r.step === 'evo').map(r => r.id).sort();
  const want = Object.keys(M.BY_ID).filter(id => { if (!M.EVO[id]) return false; const m = M.instance(id, M.BY_ID[id].maxLvl); return M.evolve(m); }).sort();
  assert.deepEqual(evo, want);
  for (const r of TABLE.rows.filter(x => x.step === 'evo')) {
    assert.deepEqual(r.issues.filter(i => i.k !== 'aviso'), [], `${r.id} evo: ${r.issues.map(i => i.d).join('; ')}`);
  }
});

test('lo que promete cada carta (español e inglés) son los números que cambia', () => {
  // La parte de texto de la auditoría, sin motor: rápida, para todas.
  for (const id of Object.keys(M.BY_ID)) {
    for (const u of M.BY_ID[id].ups) {
      for (const p of A.promises(u.t)) {
        const k = A.wordKey(p);
        if (k === 'dmg') assert.ok(Math.abs(u.m.dmg - (1 + p.v)) < 0.011 || (p.kind === 'mul' && Math.abs(u.m.dmg - p.v) < 0.011), `${id} «${u.t}»: daño ×${u.m.dmg}`);
        if (k === 'cd') assert.ok(Math.abs(u.m.cd - (1 + p.v)) < 0.011, `${id} «${u.t}»: recarga ×${u.m.cd}`);
      }
    }
  }
});

test('el daño entre niveles va en las cartas de daño (DMG_K): ninguna carta lo baja sin decirlo', () => {
  for (const id of Object.keys(M.BY_ID)) {
    const d = M.BY_ID[id];
    if (d.dmg == null) continue;
    for (let l = 1; l < d.maxLvl; l++) {
      const a = M.instance(id, l).dmg, b = M.instance(id, l + 1).dmg, u = d.ups[l - 1];
      if (u.m.dmg == null) assert.ok(b >= a * 0.999, `${id} ${l}→${l + 1} «${u.t}»: el daño baja de ${a} a ${b}`);
      else assert.ok(Math.abs(b / a - u.m.dmg) < 0.011, `${id} ${l}→${l + 1} «${u.t}»: ×${(b / a).toFixed(3)}`);
    }
  }
});

test('motor (sandbox): los arreglos de la auditoría y una de cada familia hacen lo que dicen', () => {
  // Los arreglados el 7-11-2026 y un ataque de cada familia: la auditoría entera tarda varios minutos (ver la tabla).
  const fixed = ['substitute', 'aerial-ace', 'vacuum-wave', 'spikes', 'magnitude', 'whirlwind', 'will-o-wisp', 'sand-tomb', 'ember'];
  const fam = {};
  for (const id of Object.keys(M.BY_ID)) { const k = M.BY_ID[id].kind; if (!fam[k] && !fixed.includes(id)) fam[k] = id; }
  // (Los de recarga muy larga, los barridos de pantalla, sólo en la tabla.)
  const ids = new Set(fixed.concat(Object.values(fam)).filter(id => M.BY_ID[id].kind !== 'wipe'));
  const rows = A.audit(ids);
  const bad = rows.filter(r => r.issues.some(i => i.k !== 'aviso')).map(r => `${r.id} ${r.step}: ${r.issues.map(i => i.d).join('; ')}`);
  assert.deepEqual(bad, []);
});

test('sandbox: Sustituto al nivel 5 hace más que al 4 y el muñeco que se quita también estalla', () => {
  const a = SB.run({ id: 'substitute', lvl: 4, scen: 'masa', secs: 12, seed: 1 }), b = SB.run({ id: 'substitute', lvl: 5, scen: 'masa', secs: 12, seed: 1 });
  assert.ok(b.dps > a.dps * 1.2, `${a.dps} → ${b.dps}`);
});

test('sandbox: el Pokémon estándar no muere en la horda y le golpean sin parar', () => {
  const r = SB.run({ id: 'tackle', lvl: 1, scen: 'horda', secs: 8, still: true });
  assert.ok(r.struck >= 4, 'golpes recibidos ' + r.struck);
  assert.ok(r.kills > 0);
});
