// Rendimiento: tirones y calor (2026-11-14). Que no vuelvan las esperas a la GPU ni el bucle sin tope.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function settings(stored = {}) {
  const store = { 'ps.settings': JSON.stringify(stored) };
  const sb = { G: {}, JSON, Object, Set, Math, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read('js/core/settings.js'), sb, { filename: 'settings.js' });
  return sb.G.Settings;
}

test('tope de FPS: 60 de serie, y se puede quitar', () => {
  assert.equal(settings().get('fpsCap'), 60);
  assert.equal(settings({ fpsCap: 0 }).get('fpsCap'), 0);
  const ui = read('js/ui/settings-ui.js');
  assert.match(ui, /choice\('fpsCap', \[\[30, '30'\], \[60, '60'\], \[0, 'Sin límite'\]\]/);
  const en = read('js/data/lang-en.js');
  for (const k of ['Límite de FPS', 'Sin límite']) assert.ok(en.includes(JSON.stringify(k) + ':'), 'falta en inglés: ' + k);
});

test('bucle: se salta el aviso de la pantalla que llega antes de tiempo (mismo cálculo que game.js loop)', () => {
  const src = read('js/game.js');
  assert.match(src, /if \(ts \+ 3 < capNext\) return;\s*capNext = ts - capNext > iv \? ts \+ iv : capNext \+ iv;/);
  // El mismo cálculo: cuántos fotogramas se hacen en 10 s con cada pantalla y cada tope.
  const run = (hz, cap) => {
    let capNext = 0, n = 0;
    const iv = 1000 / cap;
    for (let ts = 0; ts < 10000; ts += 1000 / hz) {
      if (ts + 3 < capNext) continue;
      capNext = ts - capNext > iv ? ts + iv : capNext + iv;
      n++;
    }
    return n / 10;
  };
  assert.ok(Math.abs(run(60, 60) - 60) <= 1, '60 Hz, tope 60: ninguno saltado');
  assert.ok(Math.abs(run(120, 60) - 60) <= 1, '120 Hz, tope 60');
  assert.ok(Math.abs(run(144, 60) - 60) <= 2, '144 Hz, tope 60');
  assert.ok(Math.abs(run(60, 30) - 30) <= 1, '60 Hz, tope 30');
});

test('el testigo de lienzos (lee de la GPU) sólo va seguido en iOS', () => {
  const src = read('js/game.js');
  assert.match(src, /gfxCheckT = G\.U\.IOS \? 1\.5 : Infinity;/);
});

test('los horneados que leen píxeles van en la memoria normal (no esperan a la GPU)', () => {
  const ts = read('js/world/tileset.js');
  assert.match(ts, /const RD = \{ willReadFrequently: true \};/);
  // Cada función de tileset.js que lee su propio lienzo nuevo (getContext y getImageData en la misma función) lo pide con RD.
  const fns = ts.split(/\n  function /).slice(1);
  for (const f of fns) {
    const name = f.slice(0, f.indexOf('('));
    const own = /const (\w+) = (\w+)\.getContext\('2d'(, [^)]*)?\);/g;
    let m;
    while ((m = own.exec(f))) {
      if (!new RegExp('\\b' + m[1] + '\\.getImageData\\(').test(f)) continue;
      assert.ok(m[3], `${name}: ${m[1]} se lee y no va con willReadFrequently`);
    }
    // Y las que pasan su lienzo a quien lo lee (softEdge, grounded, muteMarks, moodTone).
    if (/\b(softEdge|grounded|muteMarks|moodTone)\(g, cv/.test(f.slice(f.indexOf('{')))) assert.match(f, /cv\.getContext\('2d', (RD|\{ willReadFrequently: true \})\)/, name + ': pasa a leer un lienzo de la GPU');
  }
  assert.match(read('js/world/anim.js'), /function sheen[\s\S]*?getContext\('2d', \{ willReadFrequently: true \}\)/);
  assert.match(read('js/core/sprites.js'), /function frameTops[\s\S]*?getContext\('2d', \{ willReadFrequently: true \}\)/);
});

test('llegada a la arena: los chunks se hornean poco a poco mientras dura el túnel', () => {
  const w = read('js/world/world.js');
  assert.match(w, /const hidden = !!\(G\.Rift && G\.Rift\.traveling\);/);
  assert.match(read('js/systems/rift.js'), /G\.Tileset\.preload\(\[G\.Tiles\.arenaBiome\(cfg\.type\)\]\)/);
});

test('tools/perf.cjs compara dos medidas', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
  const mk = (dir, fps) => {
    fs.mkdirSync(path.join(tmp, dir));
    fs.writeFileSync(path.join(tmp, dir, 'chrome-high.json'), JSON.stringify({ escenas: { horda: { fps, ms: 10, p95: 12, p99: 20, tirones: 3, maxGap: 80 } } }));
  };
  mk('a', 40); mk('b', 55);
  const out = execFileSync(process.execPath, [path.join(root, 'tools/perf.cjs'), '--comparar', path.join(tmp, 'a'), path.join(tmp, 'b')], { encoding: 'utf8' });
  assert.match(out, /\| chrome-high \| horda \| 40 → 55 \|/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
