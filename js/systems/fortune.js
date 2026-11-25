/* ============ fortune.js — suerte del jugador y rareza en las mejoras de ataque (1.0, bloque D, 25-11-2026) ============
 * Lo decidió el dueño (nota del vault «Bloque D - Rareza y suerte»):
 *
 * Suerte (G.Fortune): una estadística del jugador, pl.fortune de 0 a MAX (1 = 100 %). Un solo número que mueve TODAS las
 *   tiradas de rareza con la tabla única (G.Rarity, data/items.js): con 0 salen como siempre (55/30/12/3) y con 1 como
 *   hoy los jefes y los cofres grandes (30/40/23/7), que no suben más. No es un objeto. Se gana en los encuentros del
 *   bloque E (templo, tienda de Kecleon, santuarios) con G.Fortune.add(pl, x). Es de cada jugador (en cooperativo no se
 *   manda: las cartas son de cada uno y los objetos los sube la suerte de quien los coge, game.js offerItem).
 *   No se llama «luck»: ese nombre ya es la pasiva Puntería.
 *
 * Rareza en las mejoras de ataque (G.CardRarity): la carta de subir de nivel un ataque (sólo ésa: ni aprender ni
 *   evolucionar) sale con rareza. La subida es la de siempre (un nivel, nunca dos); la rareza añade un extra que se queda
 *   en ese ataque: común nada, raro +2 % de daño, épico +4 % de daño y +3 % de área, legendario +7 % de daño y +5 % de
 *   área. Topes por ataque: +15 % de daño y +15 % de área. Todo sale del presupuesto de poder (G.PowerBudget.CARD).
 *   En el ataque: m.rx (daño de más, lo suma Player.moveK) y m.ra (área de más, G.Moves.rebake), y m.rc (cartas de
 *   cada rareza, para la pausa). En cooperativo el invitado manda su golpe ya hecho y el área no viaja (el fantasma
 *   se ve con los pasivos de siempre): nada nuevo por la red.
 */
G.Fortune = (() => {
  const B = G.PowerBudget.FORTUNE;
  const MAX = B.MAX;
  const clamp = v => Math.max(0, Math.min(MAX, +v || 0));
  /** La suerte de un jugador (0-MAX). */
  const of = pl => clamp(pl && pl.fortune);
  /** En porcentaje redondeado, para la pausa y el HUD. */
  const pct = pl => Math.round(of(pl) * 100);
  /**
   * Sube (o baja, con x < 0) la suerte de pl, con su tope. Lo usarán el templo, Kecleon y los santuarios (bloque E).
   * Devuelve lo que ha cambiado de verdad.
   */
  function add(pl, x) {
    if (!pl) return 0;
    const a = of(pl);
    pl.fortune = clamp(a + (+x || 0));
    if (G.Reg && G.Reg.v1 && G.Game && pl === G.Game.player) G.Reg.v1.fortune(pl.fortune);
    return pl.fortune - a;
  }
  return { MAX, of, pct, add };
})();

G.CardRarity = (() => {
  const C = G.PowerBudget.CARD;
  /** Daño de más por carta, según su rareza (común, raro, épico, legendario). */
  const EXTRA = C.EXTRA.slice();
  /** Área de más por carta (sólo épico y legendario). */
  const AREA_X = [0, 0, 0.03, 0.05];
  /** Topes por ataque. */
  const CAP = C.CAP, AREA = C.AREA;
  const r2 = v => Math.round(v * 1000) / 1000;
  const rOf = r => Math.max(0, Math.min(3, r | 0));

  /** Rareza de una carta de mejora para pl (con su suerte). */
  const roll = (pl, rnd) => G.Rarity.roll(G.Fortune.of(pl), rnd);

  /** Lo que daría una carta de rareza r a este ataque, ya con los topes: { dmg, area } (fracciones). */
  function gain(m, r) {
    r = rOf(r);
    return { dmg: r2(Math.max(0, Math.min(CAP, (m.rx || 0) + EXTRA[r]) - (m.rx || 0))),
             area: r2(Math.max(0, Math.min(AREA, (m.ra || 0) + AREA_X[r]) - (m.ra || 0))) };
  }
  /** Se la queda el ataque (tras subirle el nivel). */
  function apply(m, r) {
    r = rOf(r);
    const g = gain(m, r);
    m.rx = r2((m.rx || 0) + g.dmg);
    m.ra = r2((m.ra || 0) + g.area);
    if (!m.rc) m.rc = [0, 0, 0, 0];
    m.rc[r]++;
    return g;
  }
  /** Multiplicadores del ataque m. */
  const dmgK = m => 1 + Math.min(CAP, (m && m.rx) || 0);
  const areaK = m => 1 + Math.min(AREA, (m && m.ra) || 0);
  /** La rareza más alta que ha cogido (−1: ninguna con extra). */
  const best = m => { const c = m && m.rc; if (!c) return -1; for (let i = 3; i > 0; i--) if (c[i]) return i; return -1; };

  const fmt = (t, ...x) => (G.I18n ? G.I18n.f(t, ...x) : t.replace(/\{x\}/g, () => x.shift()));
  const p = v => Math.round(v * 100);
  /** Texto del extra de una carta (vacío si no da nada): «+4 % de daño y +3 % de área». */
  function text(m, r) {
    const g = gain(m, r);
    if (g.dmg > 0 && g.area > 0) return fmt('+{x} % de daño y +{x} % de área', p(g.dmg), p(g.area));
    if (g.dmg > 0) return fmt('+{x} % de daño', p(g.dmg));
    if (g.area > 0) return fmt('+{x} % de área', p(g.area));
    return rOf(r) ? fmt('Ya tiene todo el extra de rareza') : '';
  }
  return { EXTRA, AREA_X, CAP, AREA, roll, gain, apply, dmgK, areaK, best, text };
})();
