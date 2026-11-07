// Reloj de tickets (2.0, bloque 5): systems/tickets.js y lo que llega por la red (coop.js). 01-11-2026.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function load(search = '') {
  const G = {};
  new Function('G', 'location', source('js/systems/tickets.js'))(G, { search });
  return G.Tickets;
}
const T = load();

test('tickets: 30 when reaching Arceus at 30:00 with all 13 calendar bosses', () => {
  assert.equal(T.forRun(1800, 13, true), 30);
  assert.equal(T.forRun(1800, 11, true), 30);
  assert.equal(T.forRun(1800, 0, false), 18);
  assert.equal(T.forRun(0, 0, false), 0);
  assert.equal(T.forRun(99, 0, false), 0);
  assert.equal(T.forRun(100, 0, false), 1);
});

test('tickets: every 5-minute slice pays 3 to 8, with no bosses or with all of them; the total never drops nor passes 30', () => {
  // Jefes del calendario: antes minutos 3, 6, 9, 12, 15, 18, 21, 24 (×2), 27 (×2); desde el 07-11-2026 cada 2,5 min (2:30 ...
  // 27:30, dúos a las 25:00 y 27:30, ±22,5 s), vencidos a los 20 o a los 45 s (o a los 22,5 + 45).
  const OLD = [180, 360, 540, 720, 900, 1080, 1260, 1440, 1440, 1620, 1620];
  const NEW = [150, 300, 450, 600, 750, 900, 1050, 1200, 1350, 1500, 1500, 1650, 1650];
  for (const [AT, lag] of [[OLD, null], [OLD, 20], [OLD, 45], [NEW, 20], [NEW, 45], [NEW, 67.5]]) {
    let prev = 0, last = 0;
    for (let t = 0; t <= 1800; t += 1) {
      const nb = lag == null ? 0 : AT.filter(a => a + lag <= t).length;
      const v = T.forRun(t, nb, false);
      assert.ok(v >= prev && v <= 30, 'nunca baja ni pasa de 30');
      prev = v;
      if (t % 300 === 0 && t > 0) {
        const slice = v - last; last = v;
        assert.ok(slice >= 3 && slice <= 8, `tramo hasta ${t / 60} min con jefes ${lag}: ${slice}`);
      }
    }
  }
  // Pase lo que pase con el reloj (Sentencia más tarde, mil jefes), 30 como mucho.
  assert.equal(T.forRun(5000, 999, true), 30);
});

test('tickets: an old host sending [999, 50] leaves the guest at most what the clock gives, and no ×10', () => {
  assert.equal(T.fromHost(999, 600, 3, false), Math.min(T.forRun(600, 3, false), 999));
  assert.equal(T.fromHost(999, 600, 3, false), 9);
  assert.equal(T.fromHost(2, 600, 3, false), 2, 'si el anfitrión lleva menos, lo suyo');
  assert.equal(T.fromHost(undefined, 600, 3), 0);
});

test('tickets: the bot can ignore the speed-up only with ?dev', () => {
  const a = load(''); a.debugIgnoreTamper = true; assert.equal(a.debugIgnoreTamper, false);
  const b = load('?dev'); b.debugIgnoreTamper = true; assert.equal(b.debugIgnoreTamper, true);
});

test('co-op: the host frame carries the calendar bosses (cb) and the guest gets them in syncTeam', () => {
  const C = (() => { const G = {}; new Function('G', source('js/net/codec.js'))(G); return G.NetCodec; })();
  const make = (uid, team) => {
    const G = {}, got = {};
    G.Net = { uid, on(fn) { G.recv = fn; }, onPeer() {}, slow: () => false, send: (u, f) => { got.sent = f; }, toHost() {} };
    G.Player = class { constructor() { this.maxHp = 300; } };
    G.DEX_BY = { 25: { dex: 25 } }; G.baseStartOf = () => 'thundershock';
    G.Sprites = { preload() {} }; G.U = { dist2: () => 0 };
    G.EnemyMgr = { all: () => [], get: () => null, addRemote() {} };
    G.Judgment = { netState: () => null, netApply() {} };
    G.Projectiles = { clearOrbs() {}, spawn() {} }; G.Hazards = { add() {} }; G.VFX = { forType: t => ({ t }) };
    G.Spawner = { say() {} }; G.Social = { me: { name: uid } }; G.Rift = { onEvent() {} };
    new Function('G', 'document', source('js/net/coop.js'))(G, { addEventListener() {} });
    const local = { x: 0, y: 0, moveAngle: 0, walking: false, hp: 1, maxHp: 1, magnet: 1, aim: 0, xpMul: 1, reviveT: 0, activeGroup: () => [] };
    G.Coop.begin({ host: 'host', members: [{ uid: 'host', name: 'Ana', dex: 25 }, { uid: 'guest', name: 'Bea', dex: 25 }] }, local,
      { team, choosing: () => false, syncTeam: t => { got.team = t; } });
    return { G, got };
  };
  const host = make('host', () => ({ time: 700, level: 9, xp: 0, xpNext: 10, kills: 50, bosses: 6, coins: 0, t1: 9, t10: 0, cboss: 3 }));
  const guest = make('guest', () => ({ time: 1, level: 1, xp: 0, xpNext: 10, kills: 0, bosses: 0, coins: 0, t1: 0, t10: 0 }));
  host.G.Coop.tick(1);
  guest.G.recv('host', C.decode(C.encode(host.got.sent)));
  assert.equal(guest.got.team.cboss, 3);
  assert.equal(guest.got.team.t1, 9);
});
