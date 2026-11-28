// Cooperativo: mientras CUALQUIERA tiene abierta una elección que pausa (vitamina del templo, Kecleon, Smeargle,
// Porygon, Chansey, santuario, objeto, vínculo, evolución, mega), la partida se para para todos (28-11-2026).
// Antes los encuentros no paraban nada en grupo: el que elegía se quedaba quieto y lo mataban.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** Un coop.js (anfitrión o invitado) con red de juguete: `wire` reparte los mensajes entre los dos al momento. */
function peer(uid, wire, clock) {
  const said = [], G = {};
  G.Net = {
    uid, slow: () => false, onPeer() {},
    on(fn) { wire.recv[uid] = fn; },
    send(to, msg) { wire.q.push([uid, to, msg]); },
    toHost(msg) { wire.q.push([uid, 'host', msg]); }
  };
  G.Player = class { constructor() { this.maxHp = 300; } };
  G.DEX_BY = { 25: { dex: 25 } }; G.baseStartOf = () => 'thundershock';
  G.Sprites = { preload() {} }; G.U = { dist2: () => 0, clamp: (v, a, b) => Math.min(b, Math.max(a, v)) };
  G.EnemyMgr = { all: () => [], get: () => null }; G.Judgment = { netState: () => null, netApply() {} };
  G.Spawner = { say: t => said.push(t) }; G.Projectiles = { clearOrbs() {} };
  G.Social = { me: { name: uid === 'host' ? 'Hosty' : 'Ana' } };
  G.Flow = {};
  new Function('G', 'document', 'performance', source('js/net/coop.js'))(G, { addEventListener() {} }, { now: () => clock.t });
  // Lo del juego que importa aquí: si elige (state 'choice') y si está parado por otro ('held').
  const game = { state: 'playing', holdBy: [] };
  const api = {
    team: () => ({ time: 1, level: 2, xp: 0, xpNext: 10, kills: 0, bosses: 0, coins: 0, t1: 0, t10: 0 }),
    choosing: () => game.state === 'choice', inLevelUp: () => false,
    levelStart() {}, waiting() {}, resume() {}, syncTeam() {},
    hold(n) {                                       // como coopApi.hold en game.js
      game.holdBy = n || [];
      if (game.holdBy.length) { if (game.state === 'playing') game.state = 'held'; }
      else if (game.state === 'held') game.state = 'playing';
    }
  };
  const local = { x: 0, y: 0, moveAngle: 0, walking: false, hp: 1, maxHp: 1, magnet: 1, aim: 0, xpMul: 1, reviveT: 0, activeGroup: () => [] };
  G.Coop.begin({ host: 'host', members: [{ uid: 'host', name: 'Hosty', dex: 25 }, { uid: 'ana', name: 'Ana', dex: 25 }] }, local, api);
  // Abrir / cerrar una elección, como el juego (encounterHold, offerBond, offerItem...).
  const open = () => { game.state = 'choice'; G.Coop.holdStart(); };
  const close = () => { game.state = game.holdBy.length ? 'held' : 'playing'; G.Coop.holdEnd(); };
  return { C: G.Coop, game, said, open, close };
}

function pair() {
  const clock = { t: 1000 }, wire = { recv: {}, q: [] };
  const host = peer('host', wire, clock), ana = peer('ana', wire, clock);
  /** Entrega lo que haya en la red (y lo que se mande al recibirlo). */
  const flush = () => { while (wire.q.length) { const [from, to, msg] = wire.q.shift(); wire.recv[to](from, JSON.parse(JSON.stringify(msg))); } };
  /** Un rato de juego: cada uno manda su envío de siempre (15 por segundo). */
  const run = (ms) => { for (let t = 0; t < ms; t += 70) { clock.t += 70; host.C.tick(0.07); ana.C.tick(0.07); flush(); } };
  return { clock, host, ana, flush, run };
}

test('el invitado elige (vitamina, Kecleon...): el anfitrión, y con él el mundo, se para; al terminar sigue', () => {
  const { host, ana, flush, run } = pair();
  run(200);
  assert.equal(host.game.state, 'playing');
  ana.open(); flush();
  assert.equal(ana.game.state, 'choice');
  assert.equal(host.game.state, 'held', 'el anfitrión mueve a los enemigos: parado, nadie recibe daño');
  assert.deepEqual(host.game.holdBy, ['Ana']);
  run(3000);
  assert.equal(host.game.state, 'held', 'sigue parado mientras ella elige');
  ana.close(); flush(); run(200);
  assert.equal(host.game.state, 'playing');
  assert.equal(ana.game.state, 'playing');
});

test('el anfitrión elige: el invitado se queda parado con el aviso, y sigue al terminar', () => {
  const { host, ana, flush, run } = pair();
  run(200);
  host.open(); flush();
  assert.equal(ana.game.state, 'held');
  assert.deepEqual(ana.game.holdBy, ['Hosty']);
  run(2000);
  host.close(); flush(); run(200);
  assert.equal(ana.game.state, 'playing');
  assert.equal(host.game.state, 'playing');
});

test('si eligen los dos a la vez se espera a ambos', () => {
  const { host, ana, flush, run } = pair();
  run(200);
  ana.open(); host.open(); flush(); run(300);
  assert.deepEqual([...host.game.holdBy].sort(), ['Ana', 'Hosty']);
  host.close(); flush(); run(300);
  assert.equal(host.game.state, 'held', 'el anfitrión ha terminado, pero Ana no');
  ana.close(); flush(); run(300);
  assert.equal(host.game.state, 'playing');
  assert.equal(ana.game.state, 'playing');
});

test('un aviso perdido no deja a nadie parado: cada envío dice si estás eligiendo', () => {
  const { host, ana, flush, run } = pair();
  run(200);
  ana.game.state = 'choice';                        // abre sin que llegue el 'hs'
  run(300);
  assert.equal(host.game.state, 'held');
  ana.game.state = 'playing';                       // cierra sin que llegue el 'he'
  run(300);
  assert.equal(host.game.state, 'playing');
});

test('límite: a quien lleva 60 s eligiendo (y sí responde) se le deja de esperar; al cerrar y abrir otra, cuenta otra vez', () => {
  const { host, ana, flush, run } = pair();
  run(200);
  ana.open(); flush();
  run(59000);
  assert.equal(host.game.state, 'held');
  run(1500);
  assert.equal(host.game.state, 'playing', 'los demás siguen');
  assert.ok(host.said.includes('Ana tarda mucho: seguimos sin esperar'));
  assert.equal(ana.game.state, 'choice', 'ella sigue eligiendo, con su partida parada (a salvo)');
  run(3000);
  assert.equal(host.game.state, 'playing', 'sus envíos con «eligiendo» no la vuelven a meter');
  ana.close(); flush(); run(300);
  ana.open(); flush(); run(300);
  assert.equal(host.game.state, 'held', 'una elección nueva para otra vez a todos');
});

test('si el que elige se va de la partida, los demás siguen', () => {
  const { host, ana, flush, run } = pair();
  run(200);
  ana.open(); flush();
  assert.equal(host.game.state, 'held');
  ana.C.leave(); flush();
  assert.equal(host.game.state, 'playing');
});

test('game.js: la pantalla de un encuentro para la partida también en grupo (holdStart / holdEnd)', () => {
  const g = source('js/game.js');
  const a = g.indexOf('encounterHold(on) {'), b = g.indexOf('\n    },', a);
  assert.ok(a > 0 && b > a);
  const body = g.slice(a + 'encounterHold(on) {'.length, b);
  const mk = coop => {
    const s = { state: 'playing', holdBy: [], encMine: false, after: 0, calls: [] };
    const G = { Coop: { active: coop, holdStart: () => s.calls.push('hs'), holdEnd: () => s.calls.push('he') } };
    const fn = new Function('G', 's', 'afterLevelUp',
      'return function (on) { let state = s.state, holdBy = s.holdBy, encMine = s.encMine;' +
      ' try { ' + body + ' } finally { s.state = state; s.encMine = encMine; } };');
    return { s, hold: fn(G, s, () => s.after++) };
  };
  // En grupo: para (y lo dice), y al cerrar sigue.
  let { s, hold } = mk(true);
  hold(true);
  assert.equal(s.state, 'choice'); assert.deepEqual(s.calls, ['hs']);
  hold(true); assert.deepEqual(s.calls, ['hs'], 'abrirla dos veces no la cuenta dos veces');
  hold(false);
  assert.equal(s.state, 'playing'); assert.deepEqual(s.calls, ['hs', 'he']); assert.equal(s.after, 1);
  // Otro está eligiendo a la vez: al cerrar, sigues parado esperándole.
  ({ s, hold } = mk(true)); s.state = 'held'; s.holdBy = ['Hosty'];
  hold(true); assert.equal(s.state, 'choice');
  hold(false); assert.equal(s.state, 'held');
  // En solitario, como antes: se para y sigue, sin red.
  ({ s, hold } = mk(false));
  hold(true); assert.equal(s.state, 'choice');
  hold(false); assert.equal(s.state, 'playing'); assert.deepEqual(s.calls, []);
});

test('las cartas de nivel que llegan con un encuentro abierto lo cierran antes de mirar la elección de objeto', () => {
  const g = source('js/game.js');
  const a = g.indexOf('    levelStart(level) {'), b = g.indexOf("state = 'levelup';", a);
  const part = g.slice(a, b);
  assert.ok(part.indexOf('G.EncounterUI.abort()') < part.indexOf('openItem && G.Coop.active) G.Coop.holdEnd()'));
});

test('parado porque otro elige, el aviso «Pausa: X está eligiendo…» se ve (su fundido avanza en «held»)', () => {
  const g = source('js/game.js');
  // Fuera de 'playing' no corre update (ni Spawner.update, que avanza el aviso): se avanza aparte en 'held'.
  assert.match(g, /if \(state === 'playing'\) update\(dt\);\s*else if \(pl && state !== 'ui'\) \{[^}]*if \(state === 'held'\) G\.Spawner\.tickBanner\(dt\);/);
  // Y el aviso es invisible con edad 0 (hud.js drawBanner: alfa = min(1, edad·6, ...)).
  assert.match(source('js/ui/hud.js'), /const L = BAN, a = Math\.min\(1, ban\.age \* 6/);
});

test('el aviso nuevo tiene su inglés', () => {
  assert.match(source('js/net/coop.js'), /' tarda mucho: seguimos sin esperar'/);
  assert.match(source('js/data/lang-en.js'), /"\{name\} tarda mucho: seguimos sin esperar": "\{name\} is taking too long/);
});
