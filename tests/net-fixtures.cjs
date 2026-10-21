// Synthetic traffic following coop.js hostFrame/myState/enemyList/event layouts.
function frame(enemies = 100, events = 12, tick = 0) {
  const state = [1234, -567, 1.57, 1, 243, 300, 0, 'ember', 4, 108, -0.85, 1.25, 0, 0, 7];
  return {
    k: 'f', t: 1200.25 + tick, lv: 35, xp: 1543.75, xn: 1900, ki: 4567, bo: 12, co: 891,
    tk: [5, 1], p: { host_012345678901234567890123: state, mate_012345678901234567890123: [...state] },
    e: Array.from({ length: enemies }, (_, i) => [i + 1024, 1400 + i * 3, -870 + i * 2, 150 + i * 17, i % 7, i % 8, i % 8]),
    ev: Array.from({ length: events }, (_, i) => ['d', i + 1024, 54 + i, i % 2]),
    ja: [1200, -900, 2, 4], ho: ['皮卡丘 🐾', 'Aarón'], lu: [7, 35]
  };
}
const client = () => ({ k: 'f', p: [1234, -567, 1.57, 1, 243, 300, 0, 'ember', 4, 108, -0.85, 1.25, 0, 0, 7], ev: [['h', 1089, 54, 0, 0, false, 'fire']] });

/*
 * Realtime Database de juguete, vista por un jugador (me), con las reglas de
 * database.rules.json que importan para las salas: sin tu plaza no puedes leer
 * rooms/{id}/m (el listener se cancela), y tu plaza sólo se escribe si existe o
 * si la sala está abierta. server(path, v) escribe como el servidor (onDisconnect).
 * setConnected(false) es un corte como los de verdad: el SDK y el servidor
 * ejecutan entonces el onDisconnect armado (y deja de estarlo), y lo que se
 * escribe sin conexión espera y llega al volver, con las reglas de ese momento.
 */
function fakeRtdb(me) {
  const root = {}, listeners = [], od = [], queued = [];
  let connected = true, n = 0;
  const parts = p => p.split('/').filter(Boolean);
  const read = p => parts(p).reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), root);
  const copy = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const snap = (p, v) => ({ key: parts(p).at(-1), val: () => copy(v), numChildren: () => (v && typeof v === 'object' ? Object.keys(v).length : 0) });
  function prune(o) {
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') { prune(o[k]); if (!Object.keys(o[k]).length) delete o[k]; }
  }
  function canRead(p) {
    const k = parts(p);
    if (k[0] !== 'rooms' || k.length < 2 || k[2] === 'host' || k[2] === 'open') return true;
    return read('rooms/' + k[1] + '/m/' + me) !== undefined;
  }
  function canWrite(p, v) {
    const k = parts(p), room = k[0] === 'rooms' && read('rooms/' + k[1]);
    if (k[0] !== 'rooms') return true;
    if (room && room.host === me) return true;
    if (k.length === 2) return !room && v && v.host === me;
    if (k[2] === 'm' && k[3] === me) return v === null || read(p) !== undefined || (room && room.open === true);
    return k[2] === 'q';
  }
  function notify() {
    for (const l of listeners.slice()) {
      if (l.path === '.info/connected') { if (l.last !== connected) { l.last = connected; l.cb(snap(l.path, connected)); } continue; }
      if (!canRead(l.path)) { listeners.splice(listeners.indexOf(l), 1); if (l.err) l.err(Object.assign(Error('permission_denied'), { code: 'PERMISSION_DENIED' })); continue; }
      const v = read(l.path), j = JSON.stringify(v === undefined ? null : v);
      if (j !== l.last) { l.last = j; l.cb(snap(l.path, v)); }
    }
  }
  function write(p, v) {
    const k = parts(p);
    let o = root;
    for (const x of k.slice(0, -1)) o = o[x] && typeof o[x] === 'object' ? o[x] : (o[x] = {});
    if (v === null || v === undefined) delete o[k.at(-1)]; else o[k.at(-1)] = copy(v);
    prune(root); notify();
  }
  const denied = () => Promise.reject(Object.assign(Error('permission_denied'), { code: 'PERMISSION_DENIED' }));
  const db = {
    od, root, read, goOnline() {}, goOffline() {},
    server: write,
    setConnected(on) {
      if (on === connected) return;
      connected = on;
      if (!on) for (const p of od.splice(0)) write(p, null);
      else for (const q of queued.splice(0)) q();
      notify();
    },
    ref(p = '') {
      const put = (ok, apply) => {
        const go = () => { if (!ok()) return denied(); apply(); return Promise.resolve(); };
        return connected ? go() : new Promise((res, rej) => queued.push(() => go().then(res, rej)));
      };
      return {
        on(ev, cb, err) { const l = { path: p, cb, err, last: undefined }; listeners.push(l); notify(); },
        off() { for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].path === p) listeners.splice(i, 1); },
        set(v) { return put(() => canWrite(p, v), () => write(p, v)); },
        update(o) {
          return put(() => canWrite(p, Object.assign({}, read(p), o)), () => { for (const [k, v] of Object.entries(o)) write(p + '/' + k, v); });
        },
        remove() { return this.set(null); },
        get() { return canRead(p) ? Promise.resolve(snap(p, read(p))) : denied(); },
        push(v) { const key = 'k' + (++n); if (v !== undefined) write(p + '/' + key, v); return Object.assign(Promise.resolve(), { key }); },
        onDisconnect() {
          return { remove: () => { od.push(p); return Promise.resolve(); },
                   cancel: () => { for (let i = od.length - 1; i >= 0; i--) if (od[i] === p) od.splice(i, 1); return Promise.resolve(); } };
        }
      };
    }
  };
  return db;
}

/*
 * Firestore de juguete (lo que usan social.js y ranking.js). fail['col/id'] = código:
 * esa lectura falla; failSet['col/id']: esa escritura. txFail: códigos con los que
 * fallan las próximas transacciones.
 */
function fakeFirestore() {
  const docs = new Map(), fail = {}, failSet = {}, txFail = [], subs = [], writes = [];
  const snap = (id, v) => ({ id, exists: v !== undefined, data: () => v });
  const err = code => Object.assign(Error(code), { code });
  function docRef(path) {
    const id = path.split('/').at(-1);
    return {
      id, path,
      collection: name => collection(path + '/' + name),
      get: () => (fail[path] ? Promise.reject(err(fail[path])) : Promise.resolve(snap(id, docs.get(path)))),
      set: v => { if (failSet[path]) return Promise.reject(err(failSet[path])); writes.push([path, v]); docs.set(path, v); return Promise.resolve(); },
      update: v => { docs.set(path, Object.assign({}, docs.get(path), v)); return Promise.resolve(); },
      delete: () => { docs.delete(path); return Promise.resolve(); }
    };
  }
  function collection(name) {
    const query = test => ({
      onSnapshot(cb) { const s = { name, test, cb }; subs.push(s); cb({ docChanges: () => [], forEach() {} }); return () => subs.splice(subs.indexOf(s), 1); },
      get: () => Promise.resolve({ docs: [], size: 0 })
    });
    return {
      doc: id => docRef(name + '/' + id),
      where: (f, op, v) => query(d => d[f] === v)
    };
  }
  return {
    docs, fail, failSet, txFail, subs, writes,
    collection,
    async runTransaction(fn) {
      if (txFail.length) throw err(txFail.shift());
      const sets = [];
      await fn({ get: ref => ref.get(), set: (ref, v) => sets.push([ref, v]) });
      for (const [ref, v] of sets) await ref.set(v);
    }
  };
}

module.exports = { frame, client, fakeRtdb, fakeFirestore };
