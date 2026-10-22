const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { frame, client, fakeRtdb, fakeFirestore } = require('./net-fixtures.cjs');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function codec() { const G = {}; new Function('G', source('js/net/codec.js'))(G); return G.NetCodec; }
const C = codec();

test('host/client frames, events, pauses and Unicode round-trip exactly', () => {
  for (const f of [client(), frame(0, 0), frame(100, 40), frame(600, 400)]) {
    const b = C.encode(f); assert.ok(b); assert.deepEqual(C.decode(b), f);
  }
});
test('integer limits and decimals retain exact JS values, including high HP', () => {
  const values = [0, 127, 128, 16383, 16384, 2 ** 32, Number.MAX_SAFE_INTEGER,
    -Number.MAX_SAFE_INTEGER, 0.01, -0.01, 1.57, 1e-100, 1e30, Math.PI, Number.MAX_VALUE];
  assert.deepEqual(C.decode(C.encode(values)), values);
});
test('unsupported values safely fall back rather than silently changing data', () => {
  const cycle = []; cycle.push(cycle);
  for (const v of [undefined, 1n, new Date(), cycle, '\ud800', '\udc00']) {
    assert.equal(C.encode(v), null);
  }
  assert.equal(C.encode('x'.repeat(C.MAX_BYTES)), null);
});
test('-0, NaN, Infinity and undefined arrive exactly as they would through JSON', () => {
  const r2 = v => Math.round(v * 100) / 100;
  for (const v of [-0, NaN, Infinity, [r2(-0.003), Math.round(-0.2)], { x: undefined, y: 1, f() {} },
    [undefined, NaN, -Infinity, () => 1], { k: 'f', p: [-0, 1], ev: [['c', 'ember', 3, r2(-0.001), undefined]] }]) {
    const b = C.encode(v); assert.ok(b);
    const got = C.decode(b);
    assert.deepEqual(got, JSON.parse(JSON.stringify(v)));
    assert.equal(JSON.stringify(got), JSON.stringify(v));
  }
});
test('object keys cannot mutate prototypes', () => {
  const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":"safe"}');
  const decoded = C.decode(C.encode(value));
  assert.deepEqual(decoded, value); assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
});
test('truncation, trailing bytes, versions, tags, UTF-8 and lengths are rejected', () => {
  const b = new Uint8Array(C.encode(frame(3, 2)));
  for (let i = 0; i < b.length; i++) assert.throws(() => C.decode(b.slice(0, i).buffer));
  for (const bad of [[80, 83, 2, 0], [80, 83, 1, 255], [80, 83, 1, 8, 2, 255, 255],
    [80, 83, 1, 9, 255, 255, 255, 127], [80, 83, 1, 3, 128, 0],
    [80, 83, 1, 3, ...Array(8).fill(255)], [...b, 0]]) {
    assert.throws(() => C.decode(Uint8Array.from(bad).buffer));
  }
  assert.throws(() => C.decode(new ArrayBuffer(C.MAX_BYTES + 1)));
  assert.throws(() => C.decode('not binary'));
});
test('bounded deterministic random numeric payloads round-trip', () => {
  let seed = 1234;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let i = 0; i < 500; i++) {
    const f = frame(rand() % 8, rand() % 5, rand());
    f.ev.push(['h', rand(), (rand() - 2 ** 31) / 100, rand() / 31]);
    assert.deepEqual(C.decode(C.encode(f)), f);
  }
});

function network() {
  const pcs = [], relay = [], G = { NetCodec: codec(), DB: { fb: { uid: 'host', rtdb: {
    ref: p => ({ on() {}, off() {}, push: s => { relay.push([p, s]); return Promise.resolve(); } })
  } } } };
  class PC {
    constructor() { pcs.push(this); }
    createDataChannel() {
      return this.dc = { readyState: 'open', sent: [], send(data) { if (this.fail) throw Error('closed'); this.sent.push(data); }, close() {} };
    }
    createOffer() { return Promise.resolve({ type: 'offer' }); }
    setLocalDescription() { this.localDescription = { toJSON: () => ({ type: 'offer' }) }; return Promise.resolve(); }
    close() {}
  }
  new Function('G', 'RTCPeerConnection', 'setTimeout', 'clearTimeout', source('js/net/net.js'))(G, PC, () => 1, () => {});
  G.Net.open('test', true, 'host'); G.Net.syncMembers(['host', 'a', 'b']);
  for (const pc of pcs) pc.dc.onopen();
  const cap = dc => dc.onmessage({ data: JSON.stringify({ k: 'net-cap', binary: 1 }) });
  return { N: G.Net, pcs, relay, cap };
}
test('negotiation is per peer; old clients and unknown versions keep JSON', () => {
  const { N, pcs, cap } = network(), [a, b] = pcs.map(p => p.dc), f = frame();
  assert.equal(a.binaryType, 'arraybuffer');
  N.send('a', f); assert.equal(typeof a.sent.at(-1), 'string');
  cap(a); b.onmessage({ data: '{"k":"net-cap","binary":99}' });
  N.broadcast(f);
  assert.ok(a.sent.at(-1) instanceof ArrayBuffer); assert.deepEqual(C.decode(a.sent.at(-1)), f);
  assert.deepEqual(JSON.parse(b.sent.at(-1)), f);
  N.send('a', { k: 'start', seed: 12 }); assert.equal(typeof a.sent.at(-1), 'string');
  N.send('a', { k: 'f' }); assert.equal(typeof a.sent.at(-1), 'string'); // binary would be larger
  N.send('a', { k: 'f', ev: [undefined] }); assert.deepEqual(C.decode(a.sent.at(-1)), { k: 'f', ev: [null] });
});
test('mixed formats arrive unchanged; capabilities and corrupt packets never reach gameplay', () => {
  const { N, pcs, cap } = network(), dc = pcs[0].dc, got = [];
  N.on((from, msg) => got.push([from, msg]));
  dc.onmessage({ data: C.encode(frame()) }); assert.equal(got.length, 0);
  cap(dc); assert.equal(got.length, 0);
  dc.onmessage({ data: C.encode(frame()) });
  dc.onmessage({ data: JSON.stringify(client()) });
  dc.onmessage({ data: C.encode({ k: 'start' }) });
  dc.onmessage({ data: new ArrayBuffer(0) });
  assert.deepEqual(got, [['a', frame()], ['a', client()]]);
  assert.equal(N.stats.binaryRecv, 1); assert.equal(N.stats.invalidBinary, 3);
});
test('byte counters count successful payloads; failed frames never enable database relay', () => {
  const { N, pcs, cap, relay } = network(), dc = pcs[0].dc, f = frame(); cap(dc);
  N.send('a', f);
  assert.equal(N.stats.sentBytes, C.encode(f).byteLength);
  assert.equal(N.stats.jsonBytes, Buffer.byteLength(JSON.stringify(f)));
  assert.equal(N.stats.binarySent, 1);
  const before = N.stats.sentBytes; dc.fail = true; N.send('a', f);
  assert.equal(N.stats.sentBytes, before); assert.equal(relay.length, 0);
  N.send('a', { k: 'start', seed: 1 }); assert.equal(relay.length, 1);
});
test('reconnect resets capability, so a replaced/old peer never receives binary', () => {
  const { N, pcs, cap } = network(); cap(pcs[0].dc);
  N.close(); N.open('next', true, 'host'); N.syncMembers(['host', 'a']);
  const dc = pcs.at(-1).dc; dc.onopen(); N.send('a', frame());
  assert.equal(typeof dc.sent.at(-1), 'string');
});
test('representative busy host payload saves at least 30%; all savings are lossless', () => {
  for (const n of [30, 100, 300, 600]) {
    const f = frame(n), b = C.encode(f), json = Buffer.byteLength(JSON.stringify(f));
    assert.ok(b.byteLength < json * 0.7, `${n}: ${b.byteLength}/${json}`);
    assert.deepEqual(C.decode(b), f);
  }
});

test('real Coop.tick frames pass through the codec without changing gameplay fields', () => {
  for (const host of [true, false]) {
    const sent = [], G = {};
    G.Net = { uid: host ? 'host' : 'guest', on() {}, onPeer() {}, slow: () => false,
      send: (uid, f) => sent.push(f), toHost: f => sent.push(f) };
    G.Player = class { constructor() { this.maxHp = 300; } };
    G.DEX_BY = { 25: { dex: 25 } }; G.baseStartOf = () => 'thundershock';
    G.Sprites = { preload() {} }; G.U = { dist2: (x, y, a, b) => (x - a) ** 2 + (y - b) ** 2 };
    G.EnemyMgr = { all: () => [{ id: 123, x: 50, y: -10, hp: 125.1, anim: { cur: 'Walk', dir: 3 }, burn: 1 }] };
    G.Judgment = { netState: () => [12, -23, 1, 4] };
    new Function('G', 'document', source('js/net/coop.js'))(G, { addEventListener() {} });
    const local = { x: 0, y: 0, moveAngle: 1.234, walking: true, hp: 234, maxHp: 300,
      magnet: 78, aim: -1.43, xpMul: 1.2, reviveT: 0, activeGroup: () => [{ id: 'thundershock', lvl: 3 }] };
    G.Coop.begin({ host: 'host', members: [{ uid: 'host', name: 'Aarón', dex: 25 }, { uid: 'guest', name: '皮卡丘', dex: 25 }] }, local,
      { team: () => ({ time: 145.12, level: 7, xp: 123.45, xpNext: 300, kills: 52, bosses: 2, coins: 40, t1: 1, t10: 0 }), choosing: () => false });
    G.Coop.tick(1 / 15);
    assert.equal(sent.length, 1);
    assert.deepEqual(C.decode(C.encode(sent[0])), sent[0]);
    if (host) { assert.deepEqual(sent[0].e, [[123, 50, -10, 126, 1, 3, 1]]); assert.ok('ho' in sent[0]); }
    else { assert.equal(sent[0].p.length, 18); assert.equal(sent[0].p[15], ''); }   // 16.º: a quién mira estando caído; 17.º y 18.º: ancho y alto de su vista
  }
});

function turnNetwork(respond, { user = { uid: 'host', getIdToken: async () => 'token' }, host = true } = {}) {
  const pcs = [], calls = [], signals = [], timers = [], G = { NetCodec: codec(), DB: { fb: { uid: host ? 'host' : 'guest', auth: { currentUser: user }, rtdb: {
    ref: p => ({ on(ev, fn) { this.fn = fn; G.listen = fn; }, off() {}, push: s => { signals.push([p, JSON.parse(s)]); return Promise.resolve(); } })
  } } } };
  class PC {
    constructor(cfg) { this.cfg = cfg; pcs.push(this); }
    createDataChannel() { return this.dc = { readyState: 'connecting', send() {}, close() {} }; }
    createOffer() { return Promise.resolve({ type: 'offer' }); }
    createAnswer() { return Promise.resolve({ type: 'answer' }); }
    setLocalDescription(d) { this.localDescription = { toJSON: () => d }; return Promise.resolve(); }
    setRemoteDescription(d) { this.remoteDescription = d; return Promise.resolve(); }
    addIceCandidate() { return Promise.resolve(); }
    fail() { this.connectionState = 'failed'; this.onconnectionstatechange(); }
    close() {}
  }
  const setTimeout = (fn, ms) => { timers.push(ms); if (ms === 0) Promise.resolve().then(fn); return timers.length; };
  const fetch = async (url, opt) => { calls.push([url, opt]); return respond(); };
  new Function('G', 'RTCPeerConnection', 'setTimeout', 'clearTimeout', 'fetch', source('js/net/net.js'))(G, PC, setTimeout, () => {}, fetch);
  const offer = (t) => G.listen({ val: () => JSON.stringify({ f: 'host', sig: t ? { sdp: { type: 'offer' }, t: 1 } : { sdp: { type: 'offer' } } }), ref: { remove: () => Promise.resolve() } });
  return { N: G.Net, pcs, calls, signals, timers, offer };
}
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
const turnReply = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
const goodTurn = () => turnReply({ expiresAt: Date.now() / 1000 + 7200, iceServers: [
  { urls: ['turn:turn.pokesurvivor.com:3478?transport=udp', 'turn:evil.example:3478', 'stun:x'], username: 'u', credential: 'c' },
  { urls: ['turn:turn.pokesurvivor.com:3478?transport=tcp'], username: '', credential: 'c' }] });

test('own TURN: first try is direct only; a failed pair retries at once with clean TURN servers', async () => {
  const { N, pcs, calls, signals } = turnNetwork(goodTurn);
  N.open('room', true, 'host'); N.syncMembers(['host', 'a', 'b']); await settle();
  assert.equal(calls.length, 0, 'nothing is asked while direct may work');
  assert.equal(pcs.length, 2);
  for (const pc of pcs) assert.equal(pc.cfg.iceServers.length, 1);
  assert.ok(signals.every(([, m]) => !m.sig.sdp || !m.sig.t));
  pcs[0].fail(); await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://ice.pokesurvivor.com/v1/ice');
  assert.equal(calls[0][1].method, 'POST'); assert.equal(calls[0][1].headers.Authorization, 'Bearer token');
  const retry = pcs[2];
  assert.equal(retry.cfg.iceServers[0].urls[0], 'stun:stun.l.google.com:19302');
  assert.deepEqual(retry.cfg.iceServers.slice(1), [{ urls: ['turn:turn.pokesurvivor.com:3478?transport=udp'], username: 'u', credential: 'c' }]);
  const offers = signals.filter(([p, m]) => p.endsWith('/a') && m.sig.sdp);
  assert.equal(offers.at(-1)[1].sig.t, 1);
  assert.equal(pcs.length, 3, 'only the failed pair reserves TURN');
});
test('own TURN: refused or broken answers retry with STUN only and then wait as before', async () => {
  for (const respond of [() => turnReply({ error: 'user_denied' }, 403), () => { throw Error('offline'); },
    () => turnReply({ expiresAt: 1, iceServers: [] })]) {
    const { N, pcs, calls, timers } = turnNetwork(respond);
    N.open('room', true, 'host'); N.syncMembers(['host', 'a']); await settle();
    pcs[0].fail(); await settle();
    assert.equal(calls.length, 1); assert.equal(pcs.length, 2); assert.equal(pcs[1].cfg.iceServers.length, 1);
    pcs[1].fail(); await settle();
    assert.equal(timers.at(-1), 15000); assert.equal(pcs.length, 2); assert.equal(calls.length, 1);
  }
});
test('own TURN: guests use it only when the host asks for it', async () => {
  const { N, pcs, calls, offer } = turnNetwork(goodTurn, { user: { uid: 'guest', getIdToken: async () => 'token' }, host: false });
  N.open('room', false, 'host');
  offer(false); await settle();
  assert.equal(calls.length, 0); assert.equal(pcs[0].cfg.iceServers.length, 1);
  offer(true); await settle();
  assert.equal(calls.length, 1); assert.equal(pcs[1].cfg.iceServers.length, 2);
});
test('own TURN: players without an account never ask and keep the old retry', async () => {
  for (const user of [null, { uid: 'anon', isAnonymous: true }]) {
    const { N, pcs, calls, timers } = turnNetwork(() => assert.fail('no request'), { user });
    N.open('room', true, 'host'); N.syncMembers(['host', 'a']); await settle();
    pcs[0].fail(); await settle();
    assert.equal(calls.length, 0); assert.equal(pcs.length, 1); assert.equal(timers.at(-1), 15000);
  }
});
test('own TURN: a pair that needed it starts with it next time, and after 2 such guests everyone does', async () => {
  const { N, pcs } = turnNetwork(goodTurn);
  N.open('room', true, 'host'); N.syncMembers(['host', 'a']); await settle();
  pcs[0].fail(); await settle();
  N.close(); N.open('room2', true, 'host'); N.syncMembers(['host', 'a', 'b']); await settle();
  const [a2, b1] = pcs.slice(-2);
  assert.equal(a2.cfg.iceServers.length, 2, 'a remembered for the whole session');
  assert.equal(b1.cfg.iceServers.length, 1, 'b still tries direct first');
  b1.fail(); await settle();
  N.syncMembers(['host', 'a', 'b', 'c']); await settle();
  assert.equal(pcs.at(-1).cfg.iceServers.length, 2, 'two failures: own network needs TURN');
});

// ---------------- señalización por intentos, sin WebRTC, cortes de la base de datos ----------------

/** net.js con un WebRTC de juguete: remoteDescription sólo existe al terminar setRemoteDescription (como en el navegador). */
function rtcNet({ host = true, rtc, respond } = {}) {
  const me = host ? 'host' : 'guest', pcs = [], signals = [], timers = [];
  const G = { NetCodec: codec(), DB: { fb: { uid: me, auth: { currentUser: { uid: me, getIdToken: async () => 't' } }, rtdb: {
    ref: p => ({ on(ev, fn) { G.listen = fn; }, off() {}, push: s => { signals.push([p, JSON.parse(s)]); return Promise.resolve(); } })
  } } } };
  class PC {
    constructor(cfg) { this.cfg = cfg; this.added = []; pcs.push(this); }
    createDataChannel() { return this.dc = { readyState: 'connecting', send() {}, close() {} }; }
    createOffer() { return Promise.resolve({ type: 'offer' }); }
    createAnswer() { return Promise.resolve({ type: 'answer' }); }
    setLocalDescription(d) { this.localDescription = { toJSON: () => d }; return Promise.resolve(); }
    setRemoteDescription(d) {
      if (!PC.slow) { this.remoteDescription = d; return Promise.resolve(); }
      return new Promise(r => { this.finish = () => { this.remoteDescription = d; r(); }; });
    }
    addIceCandidate(c) { this.added.push(c.candidate); return Promise.resolve(); }
    fail() { this.connectionState = 'failed'; this.onconnectionstatechange(); }
    close() { this.closed = true; }
  }
  const setTimeout = (fn, ms) => { const t = { fn, ms }; timers.push(t); if (ms === 0) Promise.resolve().then(() => !t.off && fn()); return t; };
  const clearTimeout = t => { if (t) t.off = true; };
  const fetch = async () => (respond ? respond() : turnReply({}, 403));
  new Function('G', 'RTCPeerConnection', 'setTimeout', 'clearTimeout', 'fetch', source('js/net/net.js'))(G, rtc === undefined ? PC : rtc, setTimeout, clearTimeout, fetch);
  const recv = (sig, f = host ? 'a' : 'host') => G.listen({ val: () => JSON.stringify({ f, sig }), ref: { remove: () => Promise.resolve() } });
  const live = () => timers.filter(t => !t.off);
  return { N: G.Net, pcs, signals, timers, live, recv, PC };
}
const cand = name => ({ candidate: { toJSON: () => ({ candidate: name }) } });

test('signalling: the host applies ICE candidates that arrive while it is still applying the answer (they were lost)', async () => {
  const { N, pcs, signals, recv, PC } = rtcNet();
  N.open('room', true, 'host'); N.syncMembers(['host', 'a']); await settle();
  assert.equal(signals.find(([, m]) => m.sig.sdp)[1].sig.a, 1, 'each attempt carries its number');
  pcs[0].onicecandidate(cand('h1'));
  assert.equal(signals.at(-1)[1].sig.a, 1);
  PC.slow = true;
  recv({ sdp: { type: 'answer' }, a: 1 }); recv({ c: { candidate: 'c1' }, a: 1 }); recv({ c: { candidate: 'c2' } });   // c2: guest without numbers
  await settle();
  assert.deepEqual(pcs[0].added, []);
  pcs[0].finish(); await settle();
  PC.slow = false;
  assert.deepEqual(pcs[0].added, ['c1', 'c2']);
  recv({ c: { candidate: 'c3' }, a: 1 }); await settle();
  assert.deepEqual(pcs[0].added, ['c1', 'c2', 'c3']);
});
test('signalling: on a TURN retry the guest keeps the new attempt\'s candidates for the new connection and drops old ones', async () => {
  let open; const gate = new Promise(r => { open = r; });
  const { N, pcs, signals, recv } = rtcNet({ host: false, respond: async () => { await gate; return goodTurn(); } });
  N.open('room', false, 'host');
  recv({ c: { candidate: 'early' }, a: 1 }); recv({ sdp: { type: 'offer' }, a: 1 }); await settle();
  assert.deepEqual(pcs[0].added, ['early'], 'candidates before the offer wait for it');
  assert.equal(signals.find(([, m]) => m.sig.sdp)[1].sig.a, 1, 'the answer says which attempt it is for');
  recv({ sdp: { type: 'offer' }, t: 1, a: 2 });            // retry with TURN: the guest waits for its credentials
  recv({ c: { candidate: 'new' }, a: 2 }); await settle();
  assert.equal(pcs.length, 1); assert.deepEqual(pcs[0].added, ['early'], 'never into the failed connection');
  open(); await settle();
  assert.equal(pcs.length, 2); assert.equal(pcs[1].cfg.iceServers.length, 2);
  assert.deepEqual(pcs[1].added, ['new']);
  recv({ c: { candidate: 'late' }, a: 1 }); recv({ sdp: { type: 'offer' }, a: 1 }); await settle();
  assert.equal(pcs.length, 2, 'a late offer of an old attempt is ignored');
  assert.deepEqual(pcs[1].added, ['new']);
  pcs[1].onicecandidate(cand('g'));
  assert.equal(signals.at(-1)[1].sig.a, 2);
});
test('signalling: an answer to an old attempt does not break the host\'s new one; untagged answers still work', async () => {
  const { N, pcs, recv } = rtcNet({ respond: goodTurn });
  N.open('room', true, 'host'); N.syncMembers(['host', 'a']); await settle();
  pcs[0].fail(); await settle();                          // retried at once with TURN: attempt 2
  assert.equal(pcs.length, 2);
  recv({ sdp: { type: 'answer' }, a: 1 }); await settle();
  assert.equal(pcs[1].remoteDescription, undefined); assert.equal(N.mode('a'), 'connecting');
  recv({ sdp: { type: 'answer' } }); await settle();
  assert.deepEqual(pcs[1].remoteDescription, { type: 'answer' });
});
test('without WebRTC a pair ends as failed (never "connected by server"), with no retry loop', async () => {
  for (const rtc of [null, class { constructor() { throw Error('blocked'); } }]) {
    const h = rtcNet({ rtc });
    h.N.open('room', true, 'host'); h.N.syncMembers(['host', 'a']); await settle();
    assert.equal(h.N.mode('a'), 'failed'); assert.equal(h.N.noRtc, true); assert.equal(h.live().length, 0);
    const g = rtcNet({ host: false, rtc });
    g.N.open('room', false, 'host');
    if (rtc === null) assert.equal(g.N.mode('host'), 'failed');
    g.recv({ sdp: { type: 'offer' }, a: 1 }); await settle();
    assert.equal(g.N.mode('host'), 'failed'); assert.equal(g.N.noRtc, true);
  }
  const ok = rtcNet(); assert.equal(ok.N.noRtc, false);
});
test('#253: in a game, a peer still connected is kept when the database drops its seat; after the game it goes', async () => {
  const { N, pcs, live } = rtcNet();
  N.open('room', true, 'host'); N.syncMembers(['host', 'a', 'b', 'c']); await settle();
  pcs[0].dc.onopen(); pcs[1].dc.onopen();                   // a and b direct; c still connecting
  N.syncMembers(['host', 'a'], true);
  assert.equal(N.mode('b'), 'direct'); assert.equal(N.mode('c'), 'closed', 'only live connections are kept');
  // b really leaves later: its channel closes and it is not looked for again.
  pcs[1].dc.onclose(); await settle();
  assert.equal(N.mode('b'), 'closed'); assert.equal(pcs.length, 3);
  assert.equal(live().filter(t => t.ms === 15000).length, 0);
  N.syncMembers(['host'], true); assert.equal(N.mode('a'), 'direct');
  N.syncMembers(['host']); assert.equal(N.mode('a'), 'closed', 'outside a game the room list rules');
  // La sala desaparece en plena partida: se sigue con quien está conectado y no se reintenta a nadie.
  const h = rtcNet();
  h.N.open('room', true, 'host'); h.N.syncMembers(['host', 'a', 'b']); await settle();
  h.pcs[0].dc.onopen();
  h.N.syncMembers([], true);
  assert.equal(h.N.mode('a'), 'direct'); assert.equal(h.N.mode('b'), 'closed');
  h.pcs[0].dc.onclose(); await settle();
  assert.equal(h.N.mode('a'), 'closed'); assert.equal(h.pcs.length, 2, 'nobody is retried (no new connection or TURN slot)');
  const g = rtcNet({ host: false });
  g.N.open('room', false, 'host'); g.recv({ sdp: { type: 'offer' }, a: 1 }); await settle();
  const dc = { send() {}, close() {} }; g.pcs[0].ondatachannel({ channel: dc }); dc.onopen();
  g.N.syncMembers(['guest'], true); assert.equal(g.N.mode('host'), 'direct');
  g.N.syncMembers(['guest']); assert.equal(g.N.mode('host'), 'closed');
});

/** social.js con una Realtime Database y un Firestore de juguete. */
function social({ me = 'guest', nick = 'Guesty' } = {}) {
  const rtdb = fakeRtdb(me), fs = fakeFirestore(), events = [], store = { ['ps.nick.' + me]: nick };
  const G = { Coop: { active: false }, AchDefs: { LIST: [] }, DB: { online: true, user: me, nameAccount: false, fb: { uid: me, fs, rtdb },
    save: { partner: 25, partnerShiny: false, profile: { title: 'Héroe' }, ach: {}, legends: {},
            stats: { bestTime: 900, bestGroupTime: 0, bestLevel: 30, bossesTotal: 4, totalKills: 1000 } },
    ownsShiny: () => false, setName() {}, onLeave() {} } };
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const firebase = { database: { ServerValue: { TIMESTAMP: 1 } }, firestore: { FieldValue: { serverTimestamp: () => 'now' } } };
  new Function('G', 'firebase', 'localStorage', 'fetch', source('js/net/social.js'))(G, firebase, ls, () => Promise.reject(Error('offline')));
  G.Social.on(w => events.push(w));
  return { S: G.Social, G, rtdb, fs, events };
}
const hostRoom = (open = true) => ({ host: 'host', open, at: 1, m: { host: { name: 'Hosty', dex: 1, at: 1 } } });

test('#253: a guest whose seat the database dropped writes it again in the room, and waits until the game ends', async () => {
  const { S, G, rtdb, events } = social();
  await S.start();
  rtdb.server('rooms/r1', hostRoom());
  assert.deepEqual(await S.joinRoom('r1'), { ok: true });
  assert.deepEqual(rtdb.od, ['rooms/r1/m/guest']);
  // Corte breve fuera de partida: al cortarse se ejecuta el onDisconnect y la plaza
  // se va; se vuelve a escribir en cuanto hay conexión y el onDisconnect se arma otra vez.
  rtdb.setConnected(false); await settle();
  assert.equal(rtdb.read('rooms/r1/m/guest'), undefined); assert.deepEqual(rtdb.od, []);
  rtdb.setConnected(true); await settle();
  assert.ok(rtdb.read('rooms/r1/m/guest'), 'seat written again');
  assert.equal(S.room.id, 'r1'); assert.ok(!S.room.lost); assert.ok(!events.includes('room-closed'));
  assert.deepEqual(rtdb.od, ['rooms/r1/m/guest'], 'onDisconnect armed again');
  assert.deepEqual(S.room.members.map(m => m.uid), ['host', 'guest']);
  // El servidor se da cuenta tarde del corte (ya con otra conexión): igual.
  rtdb.server('rooms/r1/m/guest', null); await settle();
  assert.ok(rtdb.read('rooms/r1/m/guest')); assert.ok(!S.room.lost);
  // En partida (la sala está cerrada a nuevos): no se toca nada hasta que se reabre.
  rtdb.server('rooms/r1/open', false); G.Coop.active = true;
  rtdb.setConnected(false); rtdb.setConnected(true); await settle();
  assert.equal(rtdb.read('rooms/r1/m/guest'), undefined);
  assert.equal(S.room.id, 'r1'); assert.equal(S.room.lost, true); assert.ok(!events.includes('room-closed'));
  G.Coop.active = false; rtdb.server('rooms/r1/open', true); await settle();
  assert.ok(rtdb.read('rooms/r1/m/guest'), 'back in the room after the game'); assert.ok(!S.room.lost);
  // Se reabre antes de que acabe tu partida: vuelves al abrir la sala (refreshMember).
  rtdb.server('rooms/r1/open', false); G.Coop.active = true;
  rtdb.server('rooms/r1/m/guest', null); rtdb.server('rooms/r1/open', true); await settle();
  assert.equal(S.room.lost, true); assert.equal(rtdb.read('rooms/r1/m/guest'), undefined);
  G.Coop.active = false; S.refreshMember(); await settle();
  assert.ok(rtdb.read('rooms/r1/m/guest')); assert.ok(!S.room.lost);
  // Si la sala desaparece de verdad, se cierra como siempre.
  rtdb.server('rooms/r1', null); await settle();
  assert.equal(S.room, null); assert.ok(events.includes('room-closed'));
});
test('#253: the host arms its room\'s onDisconnect again if a cut found it unarmed; a cut with it armed closes the room', async () => {
  const { S, rtdb, events } = social({ me: 'host', nick: 'Hosty' });
  await S.start();
  await S.createRoom();
  const id = S.room.id;
  assert.deepEqual(rtdb.od, ['rooms/' + id]);
  rtdb.od.length = 0;                                       // (no se llegó a armar)
  rtdb.setConnected(false); rtdb.setConnected(true); await settle();
  assert.equal(S.room.id, id); assert.deepEqual(rtdb.od, ['rooms/' + id]);
  // Armado, un corte borra la sala (en partida la red sigue: ver la prueba de la sala).
  rtdb.setConnected(false); await settle();
  assert.equal(S.room, null); assert.ok(events.includes('room-closed'));
});
test('invitations are listened to from the start, also on a new device (one query)', async () => {
  const { S, fs } = social();
  await S.start();
  assert.equal(fs.subs.filter(s => s.name === 'inv').length, 1);
  await S.ensureFriends();
  assert.equal(fs.subs.filter(s => s.name === 'inv').length, 1);
});
test('friends: pasted nicknames are cleaned, a failed read is not "no such player", and your nickname repairs itself', async () => {
  const { S, fs } = social();
  await S.start();
  fs.docs.set('names/pikachu_fan', { uid: 'other' });
  const zw = String.fromCharCode(0x200B) + String.fromCharCode(0xFEFF);
  assert.equal((await S.request(' @Pikachu_Fan' + zw + ' ')).ok, true);
  fs.fail['names/nadie'] = 'unavailable';
  assert.equal((await S.request('Nadie')).error, 'No se pudo buscar ahora mismo. Prueba en un rato.');
  delete fs.fail['names/nadie'];
  assert.match((await S.request('Nadie')).error, /^No hay ningún jugador con ese apodo/);
  // names/guesty no existe (caché vieja): al abrir Amigos se reserva otra vez, sin vaciar el perfil.
  await S.repairNick();
  assert.deepEqual(fs.docs.get('names/guesty'), { uid: 'guest' });
  const prof = fs.docs.get('profiles/guest');
  assert.equal(prof.name, 'Guesty'); assert.equal(prof.lower, 'guesty'); assert.equal(prof.title, 'Héroe'); assert.equal(prof.best.solo, 900);
  const n = fs.writes.length;
  await S.repairNick(); assert.equal(fs.writes.length, n, 'once per session');
  // Si el apodo es tuyo, sólo se lee.
  const other = social(); await other.S.start(); other.fs.docs.set('names/guesty', { uid: 'guest' });
  await other.S.repairNick(); assert.equal(other.fs.writes.length, 0);
});

/** coop.js de anfitrión con reloj de juguete. */
function coopHost(clock) {
  const said = [], G = {};
  G.Net = { uid: 'host', on(fn) { G.recv = fn; }, onPeer() {}, slow: () => false, send() {}, toHost() {} };
  G.Player = class { constructor() { this.maxHp = 300; } };
  G.DEX_BY = { 25: { dex: 25 } }; G.baseStartOf = () => 'thundershock';
  G.Sprites = { preload() {} }; G.U = { dist2: () => 0 };
  G.EnemyMgr = { all: () => [] }; G.Judgment = { netState: () => null };
  G.Spawner = { say: t => said.push(t) }; G.Projectiles = { clearOrbs() {} };
  G.Social = { me: { name: 'Hosty' } };
  new Function('G', 'document', 'performance', source('js/net/coop.js'))(G, { addEventListener() {} }, { now: () => clock.t });
  const api = { names: [], resumed: 0, holds: [],
    team: () => ({ time: 1, level: 2, xp: 0, xpNext: 10, kills: 0, bosses: 0, coins: 0, t1: 0, t10: 0 }), choosing: () => false,
    levelStart() {}, waiting(n) { api.names = n; }, resume() { api.resumed++; },
    hold(n) { api.holds = n; if (!n.length) said.push(''); } };            // (como el juego: sin nadie eligiendo, borra el aviso)
  const local = { x: 0, y: 0, moveAngle: 0, walking: false, hp: 1, maxHp: 1, magnet: 1, aim: 0, xpMul: 1, reviveT: 0, activeGroup: () => [] };
  G.Coop.begin({ host: 'host', members: [{ uid: 'host', name: 'Hosty', dex: 25 }, { uid: 'a', name: 'Ana', dex: 25 }, { uid: 'b', name: 'Bea', dex: 25 }] }, local, api);
  // Envío de un invitado: ch = eligiendo objeto/vínculo, ld = última ronda de cartas elegida.
  const frame = (u, ld = 0, ch = 0) => G.recv(u, { k: 'f', p: [0, 0, 0, 0, 100, 100, 0, '', 1, 0, 0, 1, 0, ch, ld, ''], ev: [] });
  return { C: G.Coop, api, said, frame };
}

test('co-op: the host stops waiting for a guest who never entered the run or stops answering, and waits again if he returns', () => {
  const clock = { t: 0 }, { C, api, said, frame } = coopHost(clock);
  clock.t = 100; frame('a');                               // Bea sigue en el resumen de la partida anterior: nada
  clock.t = 2000; C.levelStart(3);
  assert.deepEqual(api.names, ['Hosty', 'Ana', 'Bea']);
  clock.t = 9000; C.tick(0.02); assert.deepEqual(api.names, ['Hosty', 'Ana', 'Bea']);
  clock.t = 10001; C.tick(0.02);
  assert.deepEqual(api.names, ['Hosty', 'Ana']); assert.deepEqual(said, ['Bea no responde: seguimos sin esperar']);
  C.localPicked(); frame('a', 1); assert.equal(api.resumed, 1);
  // Ana bloquea el móvil durante la ronda siguiente.
  clock.t = 20000; frame('a', 1); C.levelStart(4);
  assert.deepEqual(api.names, ['Hosty', 'Ana'], 'Bea is not waited for while she does not answer');
  clock.t = 64000; C.tick(0.02); assert.deepEqual(api.names, ['Hosty', 'Ana']);
  clock.t = 65001; C.tick(0.02); assert.deepEqual(api.names, ['Hosty']);
  frame('a', 1);                                           // vuelve sin haber elegido: se la espera otra vez
  assert.deepEqual(api.names, ['Hosty', 'Ana']);
  C.localPicked(); assert.equal(api.resumed, 1);
  frame('a', 2); assert.equal(api.resumed, 2);
  // Quien elige un vínculo y deja de responder tampoco para a todos para siempre.
  clock.t = 70000; frame('a', 2, 1); assert.deepEqual(api.holds, ['Ana']);
  clock.t = 115001; C.tick(0.02); assert.deepEqual(api.holds, []);
  assert.equal(said.at(-1), 'Ana no responde: seguimos sin esperar', 'the notice is not wiped by the pause banner');
  frame('a', 2, 1); assert.deepEqual(api.holds, ['Ana'], 'still choosing when he comes back');
});

test('co-op start: a guest still on the results screen joins; a start from someone else or without you is ignored', () => {
  const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : stub()), apply: () => stub() });
  const G = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = stub())), set: (t, k, v) => { t[k] = v; return true; } });
  new Function('G', 'document', 'addEventListener', source('js/game.js'))(G, stub(), () => {});
  const started = [];
  G.Game = { state: 'over', startRun: cfg => started.push(cfg) };
  G.Social = { room: { host: 'host' }, uid: 'me' }; G.LobbyUI = { close() {} };
  const cfg = { k: 'start', host: 'host', members: [{ uid: 'host' }, { uid: 'me' }] };
  G.Flow.startCoop(cfg, 'host'); assert.deepEqual(started, [cfg]);
  G.Flow.startCoop(cfg, 'mallory');
  G.Flow.startCoop(Object.assign({}, cfg, { members: [{ uid: 'host' }] }), 'host');
  G.Game.state = 'playing'; G.Flow.startCoop(cfg, 'host');
  assert.equal(started.length, 1);
  G.Game.state = 'ui'; G.Social.uid = 'host'; G.Flow.startCoop(cfg); assert.equal(started.length, 2, 'the host starts its own');
});

/** social-ui.js con un DOM de juguete (sólo lo que toca). */
function socialUi() {
  const els = {}, calls = [], handlers = [], net = [], peer = [], toHost = [], asked = [], answers = [];
  const mk = () => {
    const s = new Set();
    return { dataset: {}, style: { setProperty() {} }, appendChild() {}, insertAdjacentHTML() {}, querySelectorAll: () => [],
      after(n) { els[n.id] = n; },
      classList: { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
                   toggle: (c, on) => ((on === undefined ? !s.has(c) : on) ? s.add(c) : s.delete(c)) } };
  };
  const el = id => els[id] || (els[id] = mk());
  const G = { UI: { $: el, toast: t => calls.push(['toast', t]), isOpen: id => id === 'scr-lobby' && G.lobby, show() { G.lobby = true; }, hide() {}, spriteCanvas: mk },
    Coop: { active: true, COLORS: [] }, DEX_BY: {}, MenuUI: { open() { G.lobby = false; } }, Game: { state: 'playing' },
    Flow: { startCoop: cfg => calls.push(['start', cfg.members.length]) },
    Social: { room: null, invites: [], friends: [], MAX_PLAYERS: 4, uid: 'me', on: fn => handlers.push(fn),
              refreshMember() {}, ensureFriends: () => Promise.resolve(), setOpen() {} },
    Net: { open_: true, on: fn => net.push(fn), onPeer: fn => peer.push(fn), toHost: m => toHost.push(m.on), mode: () => 'direct', viaTurn: () => false,
           noRtc: false, close: () => calls.push(['close']), open() {}, broadcast() {}, syncMembers: (u, keep) => calls.push(['sync', u, keep]) } };
  const confirm = q => { asked.push(q); return answers.shift(); };
  new Function('G', 'document', 'confirm', source('js/ui/social-ui.js'))(G, { createElement: mk }, confirm);
  G.SocialUI.init();
  return { G, els, calls, handlers, net, peer, toHost, asked, answers };
}

test('#253: the room UI keeps the network during a game and closes it after', () => {
  const { G, els, calls, handlers } = socialUi();
  assert.equal(els['fr-name'].maxLength, 40);
  handlers.forEach(fn => fn('room-closed'));
  assert.deepEqual(calls, [['sync', [], true]], 'no close and no toast: keep who is connected, retry nobody');
  calls.length = 0;
  G.Social.room = { id: 'r', isHost: true, host: 'me', members: [{ uid: 'me' }] };
  handlers.forEach(fn => fn('room'));
  assert.deepEqual(calls, [['sync', ['me'], true]]);
  G.Coop.active = false; G.Social.room = null; calls.length = 0;
  handlers.forEach(fn => fn('room-closed'));
  assert.deepEqual(calls, [['close'], ['toast', 'La sala se ha cerrado']]);
});
test('#97: "¡Estoy listo!" goes over the direct channel; the host can still start but is asked who is not ready', () => {
  const guest = socialUi();
  guest.G.Coop.active = false;
  guest.G.Social.room = { id: 'r', isHost: false, host: 'h', members: [{ uid: 'h', name: 'Hosty' }, { uid: 'me', name: 'Yo' }] };
  guest.G.LobbyUI.open();
  const rb = guest.els['lobby-ready'];
  assert.equal(rb.classList.contains('hidden'), false); assert.equal(rb.textContent, '¡Estoy listo!');
  rb.onclick(); assert.equal(rb.textContent, 'No estoy listo');
  guest.peer.forEach(fn => fn('h', 'direct'));              // al reconectar se repite
  guest.els['lobby-menu'].onclick();                          // al irse al menú deja de estar listo
  assert.deepEqual(guest.toHost, [0, 1, 1, 0]);
  guest.G.Social.room = { id: 'r2', isHost: false, host: 'h2', members: [] };
  guest.G.LobbyUI.open(); assert.equal(guest.toHost.at(-1), 0);

  const host = socialUi();
  host.G.Coop.active = false;
  host.G.Social.room = { id: 'r', isHost: true, host: 'me', members: [{ uid: 'me', name: 'Yo' }, { uid: 'a', name: 'Ana' }, { uid: 'b', name: 'Bea' }, { uid: 'c', name: 'Old' }] };
  host.G.LobbyUI.open();
  assert.equal(host.els['lobby-ready'].classList.contains('hidden'), true);
  host.net.forEach(fn => { fn('a', { k: 'rdy', on: 1 }); fn('b', { k: 'rdy', on: 0 }); });   // c: versión vieja, no dice nada
  host.answers.push(false);
  host.els['lobby-start'].onclick();
  assert.deepEqual(host.asked, ['Sin pulsar «¡Estoy listo!»: Bea. ¿Empezar igualmente?']);
  assert.ok(!host.calls.some(c => c[0] === 'start'));
  host.answers.push(true); host.els['lobby-start'].onclick();
  assert.ok(host.calls.some(c => c[0] === 'start'));
});

/** ranking.js con un Firestore de juguete. */
function ranking(txFail = []) {
  const fs = fakeFirestore(), toasts = [], store = {};
  fs.txFail.push(...txFail);
  const U = { str: s => String(s), int: v => v | 0, list: (a, n) => (Array.isArray(a) ? a.slice(0, n) : []) };
  const G = { U, UI: { toast: t => toasts.push(t) }, DB: { online: true, fb: { uid: 'me', fs } },
    Social: { me: { name: 'Me' }, started: true, friends: [], ensureFriends: async () => {} } };
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
    key: i => Object.keys(store)[i], get length() { return Object.keys(store).length; } };
  const firebase = { firestore: { FieldValue: { serverTimestamp: () => 'now' } } };
  new Function('G', 'firebase', 'localStorage', 'setTimeout', source('js/net/ranking.js'))(G, firebase, ls, fn => { fn(); return 0; });
  return { R: G.Ranking, G, fs, toasts, store };
}
const run = { t: 600, lv: 20, kills: 900, dex: 25, shiny: false };
const lost = t => t.filter(x => x.startsWith('Tu marca no se ha podido guardar'));

test('ranking: a transaction clash is retried once; a mark that still cannot be saved is told to the player', async () => {
  let r = ranking(['aborted']);
  assert.deepEqual((await r.R.submitSolo(run)).sort(), ['a', 'd', 'm', 'w']);
  assert.deepEqual(lost(r.toasts), []);
  assert.ok(r.fs.docs.get('lbs/s_all3').top.me);
  r = ranking(Array(10).fill('aborted'));
  await r.R.submitSolo(run);
  assert.deepEqual(lost(r.toasts), ['Tu marca no se ha podido guardar en el ranking: el servidor estaba ocupado.']);
  r = ranking(['permission-denied']);
  await r.R.submitSolo(run);
  assert.deepEqual(lost(r.toasts), ['Tu marca no se ha podido guardar en el ranking: el servidor la ha rechazado.']);
  // Rechazada porque la nube ya tenía una marca tuya mejor (de otro aparato): no es un fallo.
  r = ranking();
  r.store['ps.rk.best2.me'] = JSON.stringify({ 's_all3:me': 300 });   // lo que sabía este navegador
  r.fs.docs.set('lb/s_all3/e/me', { t: 900 }); r.fs.failSet['lb/s_all3/e/me'] = 'permission-denied';
  await r.R.submitSolo(run);
  assert.deepEqual(lost(r.toasts), []);
  assert.equal(JSON.parse(r.store['ps.rk.best2.me'])['s_all3:me'], 900);
  // Sin apodo no se sube: se dice una vez por sesión.
  r = ranking(); r.G.Social.me = null;
  await r.R.submitSolo(run); await r.R.submitSolo(run);
  assert.deepEqual(r.toasts, ['Elige un apodo (en Amigos) para salir en el ranking.']);
});
