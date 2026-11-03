// Revisión de ataques (2026-11-02): la norma de las evoluciones y los dibujos de PixelLab.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

function moves() {
  const c = { window: {}, console };
  c.G = c.window.G = {};
  vm.createContext(c);
  vm.runInContext(source('js/data/moves.js'), c);
  return c.G.Moves;
}

test('ninguna evolución sustituye al ataque («en vez de...»): conserva lo suyo y añade algo', () => {
  const M = moves();
  const bad = Object.keys(M.EVO).filter(id => { const e = M.EVO[id][2]; return e && /\ben vez de/i.test(e.t); });
  assert.deepEqual(bad, []);
});

test('la evolución pega siempre más que el ataque a su nivel máximo, contra un jefe y contra una horda', () => {
  // El combate de verdad (tools/balance.cjs, semilla fija; --rapido: 10 s por prueba). Con lo que el jugador aplica a
  // cada uno (Player.MOVE_K 1,08 y EVO_K 0,74). La norma pide ×1,2 (tools/equilibrio.cjs --norma); aquí, con margen.
  const out = path.join(require('node:os').tmpdir(), 'ps-evo-norma-' + process.pid + '.json');
  execFileSync(process.execPath, [path.join(root, 'tools/balance.cjs'), '--rapido', '--json', out], { stdio: 'ignore' });
  const r = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.unlinkSync(out);
  const by = {};
  for (const x of r.rows) (by[x.id] = by[x.id] || {})[x.stage] = x;
  const K = 0.74 / 1.08, worse = [];
  for (const id in by) {
    const a = by[id].max, b = by[id].evo;
    if (!a || !b || !(a.jefe > 1 && a.horda > 1)) continue;
    const j = b.jefe * K / a.jefe, h = b.horda * K / a.horda;
    if (Math.min(j, h) < 1.05) worse.push(`${id} ${j.toFixed(2)}/${h.toFixed(2)}`);
  }
  assert.deepEqual(worse, []);
});

test('dibujos de PixelLab: cada uno es de un ataque y tiene su archivo', () => {
  const M = moves(), vfx = source('js/entities/vfx.js');
  const block = vfx.slice(vfx.indexOf('const PX_VFX = {'), vfx.indexOf('};', vfx.indexOf('const PX_VFX = {')));
  const ids = [...block.matchAll(/'([a-z0-9-]+)':\s*\{/g)].map(m => m[1]);
  assert.ok(ids.length >= 10);
  for (const id of ids) {
    assert.ok(M.BY_ID[id], 'ataque ' + id);
    assert.ok(fs.existsSync(path.join(root, 'assets/vfx', id + '.png')), 'assets/vfx/' + id + '.png');
  }
});

test('passiveKeys: lo que cambia cada pasiva sale de PASSIVE_RULES (compendio y estudio)', () => {
  const M = moves();
  assert.deepEqual([...M.passiveKeys('projectile', 'area')], ['size']);
  assert.deepEqual([...M.passiveKeys('beam', 'area')], ['width', 'half:radius']);
  assert.deepEqual([...M.passiveKeys('charge', 'pspd')], ['inv:charge']);
  assert.deepEqual([...M.passiveKeys('stun', 'amt')], ['code:amt']);
  assert.deepEqual([...M.passiveKeys('melee', 'dur')], []);
  for (const k of Object.keys(M.PASSIVE_RULES)) for (const p of ['area', 'dur', 'amt', 'pspd']) {
    assert.equal(M.passiveKeys(k, p).length > 0, M.passiveAffects(k, p), k + ' ' + p);
  }
});
