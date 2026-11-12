/* ============ windows-dl.js — «Descargar para Windows» en Ajustes ============
 * Pedido del dueño (12-11-2026): que la versión de PC se pueda descargar desde
 * Ajustes › Acerca de. La app de Windows (carpeta desktop/ del repositorio) se
 * reparte como un .zip con nombre fijo en GitHub Releases:
 *   https://github.com/Paulprade05/pokesurvivor/releases/latest/download/PokeSurvivor-Windows.zip
 * - Sólo sale en la web, en un PC con Windows. En la propia app
 *   (window.pokeEscritorio), en el móvil y en otros sistemas, no.
 * - Sólo sale si la release existe de verdad y lleva ese archivo: se pregunta a
 *   la API de GitHub (una vez por sesión, sin cuenta). Así, sin release
 *   publicada no hay enlace roto: la fila no aparece.
 * - Antes de descargar se explica el aviso de SmartScreen (la app no va firmada).
 */
G.WindowsDL = (() => {
  const REPO = 'Paulprade05/pokesurvivor';
  const ARCHIVO = 'PokeSurvivor-Windows.zip';
  const API = `https://api.github.com/repos/${REPO}/releases/latest`;
  const DL = `https://github.com/${REPO}/releases/latest/download/${ARCHIVO}`;
  const KEY = 'ps.windl';                         // en sessionStorage: lo que dijo GitHub
  let info = null;                                // null = sin preguntar; {ok, version, mb}
  let pending = null;

  /** ¿Web abierta en un PC con Windows, fuera de la app? (nav y win, para las pruebas) */
  function isWindowsPC(nav = navigator, win = window) {
    if (win.pokeEscritorio) return false;                       // ya es la app
    if (!/^https?:$/.test((win.location || {}).protocol || '')) return false;
    const ua = nav.userAgent || '';
    const uad = nav.userAgentData;
    if (uad && uad.mobile) return false;
    if (/Android|iPhone|iPad|iPod|Mobile|Windows Phone|Xbox/i.test(ua)) return false;
    if (uad && uad.platform) return uad.platform === 'Windows';
    return /Windows NT/.test(ua);
  }

  /** Lo que devuelve la API de GitHub → {ok, version, mb}. */
  function parse(rel) {
    const a = rel && Array.isArray(rel.assets) && rel.assets.find(x => x && x.name === ARCHIVO);
    if (!a || rel.draft || rel.prerelease) return { ok: false };
    return { ok: true, version: String(rel.tag_name || '').replace(/^v/, ''), mb: Math.round((a.size || 0) / 1048576) };
  }

  /** Pregunta a GitHub si hay descarga (una vez por sesión). Nunca falla: sin red o sin release, ok:false. */
  function check() {
    if (info) return Promise.resolve(info);
    if (pending) return pending;
    try { const c = JSON.parse(sessionStorage.getItem(KEY)); if (c && typeof c.ok === 'boolean') return Promise.resolve(info = c); } catch (e) { /* nada */ }
    pending = fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => (r.ok ? r.json() : null))
      .then(parse, () => ({ ok: false }))
      .catch(() => ({ ok: false }))
      .then(r => {
        info = r; pending = null;
        try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { /* nada */ }
        return r;
      });
    return pending;
  }

  /** ¿Sale ya la fila? (sin esperar: si aún no se sabe, no) */
  const can = () => isWindowsPC() && !!(info && info.ok);
  /** ¿Hay que preguntar a GitHub antes de poder decidirlo? */
  const unknown = () => isWindowsPC() && !info;

  return { REPO, ARCHIVO, URL: DL, isWindowsPC, parse, check, can, unknown, info: () => info };
})();
