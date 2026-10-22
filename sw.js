/* ============ sw.js — para poder instalar el juego como app ============
 * - Código del juego (html, js, css): primero la red, así cada actualización
 *   llega al momento; si no hay conexión, la última copia guardada. De lo que
 *   lleva huella (?v=) sólo se guarda la última: las viejas se borran (antes la
 *   caché crecía con cada versión).
 * - version.json (¿hay versión nueva?, js/core/updater.js): siempre de la red y
 *   nunca se guarda (lleva ?t= y cada consulta añadía una copia).
 * - Sprites de los Pokémon: no cambian nunca, se sirven de la caché (se van
 *   guardando según se usan: no se descarga todo de golpe).
 * - Iconos (los de la app y los objetos de assets/items), fuente y pantallas de
 *   arranque: la copia guardada al momento y, por detrás, se pide la nueva para
 *   la próxima vez (si cambian, llegan solas).
 * - Firebase y demás servicios de fuera no se tocan.
 * Al cambiar los nombres de las cachés, las viejas se borran al activarse. La de
 * arte sigue siendo la v1 a propósito: así no se pierden los sprites ya guardados
 * (sólo se quitan las copias repetidas de los reintentos, las que llevan ?r=).
 */
const CODE = 'ps-code-v2', ART = 'ps-art-v1';
const PRE_CODE = ['./', './index.html', './css/style.css', './manifest.webmanifest'];
const PRE_ART = ['./assets/icons/icon-180.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];

self.addEventListener('install', e => {
  // Recién pedidas al servidor, no las de la caché del navegador.
  const pre = (name, list) => caches.open(name).then(c => c.addAll(list.map(u => new Request(u, { cache: 'reload' }))));
  e.waitUntil(Promise.all([pre(CODE, PRE_CODE), pre(ART, PRE_ART)]).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CODE && k !== ART).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    // Por detrás (sin retrasar nada): fuera las copias de los reintentos de sprites (?r=), que
    // las versiones anteriores guardaban aparte; ahora cada sprite se guarda una sola vez.
    .then(() => { caches.open(ART).then(c => c.keys().then(ks => ks.forEach(k => { if (new URL(k.url).search) c.delete(k); }))).catch(() => {}); }));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const p = url.pathname;
  if (p.endsWith('/version.json') || p.startsWith('/__/')) return;      // directo a la red
  if (p.includes('/assets/pokemon/')) { e.respondWith(sprite(e, req, url)); return; }
  if (/\/assets\/(icons|fonts|splash|items)\//.test(p)) { fresh(e, req); return; }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) e.waitUntil(keep(req, url, res.clone()).catch(() => {}));
    return res;
  }).catch(() => offline(req)));
});

/** Sprites: de la caché si ya están. Los reintentos (?r=1, sprites.js) son el mismo archivo: una sola copia. */
async function sprite(e, req, url) {
  const c = await caches.open(ART), key = url.origin + url.pathname;
  const hit = await c.match(key, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) e.waitUntil(c.put(key, res.clone()).catch(() => {}));
  return res;
}

/** Iconos, objetos, fuente y pantallas de arranque: lo guardado al momento y la copia nueva para la próxima vez. */
function fresh(e, req) {
  const net = fetch(req).then(res => res.ok
    ? caches.open(ART).then(c => c.put(req, res.clone())).then(() => res, () => res)
    : res);
  e.waitUntil(net.catch(() => {}));
  e.respondWith(caches.open(ART).then(c => c.match(req, { ignoreVary: true })).then(hit => hit || net));
}

/**
 * Guarda la copia nueva del código. Las páginas, sin lo que va tras «?» (?dev,
 * enlaces de redes...): una copia por página. De lo que lleva huella (?v=),
 * sólo la última versión.
 */
async function keep(req, url, copy) {
  const c = await caches.open(CODE);
  await c.put(req.mode === 'navigate' ? url.origin + url.pathname : req, copy);
  if (!/[?&]v=/.test(url.search)) return;
  for (const k of await c.keys()) {
    const u = new URL(k.url);
    if (u.pathname === url.pathname && u.search !== url.search) await c.delete(k);
  }
}

/**
 * Sin red: la copia guardada (si no está esa versión, la que haya de ese archivo).
 * La página del juego sólo sirve de respaldo al abrir la web (nunca en lugar de
 * un script o una imagen).
 */
async function offline(req) {
  const hit = await caches.match(req, { ignoreVary: true }) || await caches.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  if (req.mode === 'navigate') return (await caches.match('./')) || (await caches.match('./index.html')) || Response.error();
  return Response.error();
}
