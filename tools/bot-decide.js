/* ============ bot-decide.js — lo que decide el bot de tools/curve.cjs (1.0, bloque A, 24-11-2026) ============
 * Funciones puras: reciben lo que ve el bot y devuelven qué hace. curve.cjs las mete en la página y
 * tests/bot-decide.test.cjs las prueba en Node. Nada de aquí entra en el juego (no está en dev.html).
 *
 * Estilo: cada partida el bot tiene un «estilo» (atk, def o mix) y un apetito de riesgo (0-1), sacados del
 * azar de la partida (con CURVE_SEED, siempre el mismo para la misma partida) o fijados con --estilo. Así no
 * elige siempre lo mismo y, con la semilla, antes y después se pueden emparejar.
 *
 * Lo que ya existe (0.10): objetos con rareza (quedarse o cambiar, mirando la rareza, lo que le falta para
 * evolucionar y el tiempo que queda), el segundo hueco (vínculos hacia el grupo de 4) y qué ataque fusionar.
 * Lo de la 1.0 (cuando cada bloque lo añada; contrato en la nota del vault «Bloque A - Medir» y en curve.cjs):
 *   cardRarity   rareza de las cartas de nivel (bloque D)       shop     qué comprar a Kecleon (E)
 *   temple       quedarse o no en el templo (E)                 vitamin  qué vitamina coger (E)
 *   curse        aceptar o no la maldición (F)                  egg      llevar compañero o no (G)
 */
(function (root) {
  'use strict';
  const STYLES = ['atk', 'def', 'mix'];
  const OFF = new Set(['atk', 'cd', 'crit', 'critD']), DEF = new Set(['red', 'hp', 'regen', 'dodge', 'heal']);
  // Valor de cada estadística de objeto (por 1,0 de esa estadística: +30 % de daño = 30 puntos).
  const W = { atk: 100, cd: 120, crit: 80, critD: 30, red: 90, hp: 60, regen: 1200, dodge: 90, spd: 25, heal: 20, xp: 60, coin: 4, magnet: 8 };
  // Lo que no está en «st» (su efecto especial), en los mismos puntos, para un objeto común sin evolucionar.
  // [lado, puntos]: el lado decide cuánto le gusta según el estilo.
  const SPECIAL = {
    focussash: ['def', 22], shellbell: ['def', 16], lifeorb: ['def', -6], choiceband: ['atk', -4], quickclaw: ['atk', 4],
    rockyhelmet: ['def', 12], liechiberry: ['atk', 15], oranberry: ['def', 15], toxicorb: ['atk', 20], souldew: ['atk', 18],
    weaknesspolicy: ['atk', 10], snowball: ['def', 10], stickybarb: ['atk', 12], expertbelt: ['atk', 15], airballoon: ['def', 5],
    whiteherb: ['def', 6], metalcoat: ['def', 6], soothebell: ['def', 4]
  };
  const EVO_SPECIAL = 1.5;     // el evolucionado gana una pasiva propia: su especial vale más
  const RAR_BONUS = [0, 6, 12, 20];

  /** Estilo de una partida: rnd es el azar de la página (con semilla) o Math.random. */
  function style(rnd, force) {
    const r = rnd || Math.random;
    const name = STYLES.includes(force) ? force : STYLES[Math.floor(r() * 3) % 3];
    return { name, risk: Math.round((0.25 + r() * 0.6) * 100) / 100 };
  }
  const sideK = (st, side) => (st.name === 'mix' || !side ? 1 : st.name === side ? 1.3 : 0.75);

  /**
   * Cuánto vale llevar un objeto, por segundo de partida (puntos).
   * vals: { st } de G.Items.vals(id, r, evo). minute: la experiencia vale más al principio.
   */
  function itemValue(id, r, evo, vals, st, minute = 0, kRar = [0.85, 1.1, 1.35, 1.65]) {
    let v = 0;
    for (const k in vals.st || {}) {
      let w = W[k] == null ? 10 : W[k];
      if (k === 'xp') w *= Math.max(0.1, 1 - minute / 20);
      v += vals.st[k] * w * sideK(st, OFF.has(k) ? 'atk' : DEF.has(k) ? 'def' : null);
    }
    const sp = SPECIAL[id];
    if (sp) v += sp[1] * (kRar[r] || 1) * (evo ? EVO_SPECIAL : 1) * sideK(st, sp[0]);
    return v;
  }

  /**
   * Te sale un objeto y no tienes hueco libre: ¿con qué te quedas?
   * ctx: { mine: [{ id, r, evo, t }], offer: { id, r }, same (−1 o el hueco del mismo objeto), now (s), EVO_T,
   *        END (s de partida), vals(id, r, evo), style, minute }
   * Devuelve −1 (te quedas como estás) o el hueco que cambias. Mira el valor de aquí al final: lo que da ahora y,
   * cuando evolucione, lo que dará evolucionado (cambiar pierde el progreso del que dejas).
   */
  function pickItem(ctx) {
    const left = Math.max(60, (ctx.END || 1800) - (ctx.now || 0)), T = ctx.EVO_T || 600;
    const worth = it => {
      const v0 = itemValue(it.id, it.r, false, ctx.vals(it.id, it.r, false), ctx.style, ctx.minute);
      const v1 = itemValue(it.id, it.r, true, ctx.vals(it.id, it.r, true), ctx.style, ctx.minute);
      if (it.evo) return v1 * left;
      const until = Math.max(0, T - (it.t || 0));
      return v0 * Math.min(left, until) + v1 * Math.max(0, left - until);
    };
    const mineW = ctx.mine.map(worth), keep = mineW.reduce((a, b) => a + b, 0);
    const newW = worth({ id: ctx.offer.id, r: ctx.offer.r, evo: false, t: 0 });
    let best = -1, bestV = keep * 1.05;        // un poco de pereza: cambiar por casi lo mismo no compensa
    const slots = ctx.same >= 0 ? [ctx.same] : ctx.mine.map((_, i) => i);
    for (const i of slots) { const v = keep - mineW[i] + newW; if (v > bestV) { bestV = v; best = i; } }
    return best;
  }

  /**
   * Qué ataque unir en un vínculo. moves: [{ id, lvl, evolved, dealt, support }] en el orden de las cartas.
   * El que más pega y más subido está; los de apoyo, los últimos.
   */
  function pickBond(moves) {
    let best = 0, bv = -1e9;
    moves.forEach((m, i) => { const v = (m.support ? -100 : 0) + (m.lvl || 1) * 4 + (m.evolved ? 10 : 0) + Math.log10(1 + (m.dealt || 0)) * 3; if (v > bv) { bv = v; best = i; } });
    return best;
  }

  /**
   * Smeargle: ¿olvida un ataque suelto? moves: [{ lvl, evolved, support }] (los que ofrece). Sólo pronto (antes del
   * minuto 15) y uno flojo (nivel ≤ 2, sin evolucionar): los de apoyo primero. Devuelve el índice o −1.
   */
  function forget(moves, minute) {
    if (minute >= 15) return -1;
    let best = -1, bv = 1e9;
    moves.forEach((m, i) => { if (m.evolved || (m.lvl || 1) > 2) return; const v = (m.support ? -10 : 0) + (m.lvl || 1); if (v < bv) { bv = v; best = i; } });
    return best;
  }

  /** Puntos de más de una carta de nivel por su rareza (bloque D: data-r en la carta; sin rareza, 0). */
  const cardRarity = r => RAR_BONUS[Math.max(0, Math.min(3, r | 0))];

  /**
   * Templo de vitaminas: ¿se queda a cargarlo? ctx: { hpFrac, enemies (cerca), full (todas sus vitaminas al tope),
   * charge 0-1, style }. Se va si va mal de vida (salvo que le falte poco) o si ya no le sirve.
   */
  function temple(ctx) {
    if (ctx.full) return false;
    if (ctx.charge >= 0.75) return ctx.hpFrac > 0.15;
    const need = ctx.style.name === 'def' ? 0.45 : 0.35 - 0.1 * ctx.style.risk;
    return ctx.hpFrac > need && (ctx.enemies || 0) < 25 + 20 * ctx.style.risk;
  }

  /**
   * Qué vitamina. opts: [{ id, r }]; taken: { id: lo que ya lleva sumado }; caps: G.PowerBudget.VIT ({ id: { cap } });
   * phys: parte de sus ataques que son físicos (0-1). Devuelve el índice (−1 si todas están al tope).
   */
  function vitamin(opts, taken, caps, phys, st) {
    const pref = { atk: { protein: 30, calcium: 30, ppup: 34, hpup: 12, iron: 8, zinc: 8, carbos: 10 },
                   def: { protein: 14, calcium: 14, ppup: 16, hpup: 30, iron: 24, zinc: 24, carbos: 12 },
                   mix: { protein: 22, calcium: 22, ppup: 25, hpup: 22, iron: 15, zinc: 15, carbos: 11 } }[st.name];
    let best = -1, bv = 0;
    opts.forEach((o, i) => {
      const c = caps[o.id]; if (!c || (taken[o.id] || 0) >= c.cap - 1e-9) return;
      let v = (pref[o.id] || 10) + RAR_BONUS[o.r | 0];
      if (o.id === 'protein') v *= 0.3 + phys; else if (o.id === 'calcium') v *= 1.3 - phys;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }

  /**
   * Maldición (santuario maldito). ctx: { hpFrac, minute, upg ('max'|'zero'), recentFalls (caídas en los últimos
   * 2 min), level (maldición que ya lleva), cap, style, roll (0-1) , force ('si'|'no'|'auto') }.
   */
  function curse(ctx) {
    if (ctx.force === 'si') return ctx.level < ctx.cap;
    if (ctx.force === 'no' || ctx.level >= ctx.cap) return false;
    if (ctx.recentFalls > 0 || ctx.hpFrac < 0.6 || ctx.minute > 25) return false;
    const want = ctx.style.risk * (ctx.upg === 'max' ? 1 : 0.4) * (1 - ctx.level / Math.max(1, ctx.cap));
    return ctx.roll < want;
  }

  /**
   * Huevo (Chansey o Kecleon). ctx: { has (lleva compañero), hasEvolved, newBst, curBst, force }.
   * Sin compañero, siempre; con uno, sólo si el nuevo es claramente mejor y el suyo aún no ha evolucionado.
   */
  function egg(ctx) {
    if (ctx.force === 'no') return false;
    if (!ctx.has) return true;
    if (ctx.force === 'si') return true;
    return !ctx.hasEvolved && (ctx.newBst || 0) > (ctx.curBst || 0) * 1.15;
  }

  /**
   * Tienda de Kecleon. offers: [{ kind: 'item'|'heal'|'vitamin'|'egg'|'luck'|'curse', id, r, price }];
   * ctx: { coins, hpFrac, minute, style, itemGain(o) (≥0: cuánto mejora su objeto), vitOk(o), eggOk(o), curseOk(o),
   * luck, luckCap }. Gasta como mucho una parte de lo que lleva (lo demás va a su cuenta); devuelve los índices en orden.
   */
  function shop(offers, ctx) {
    let budget = Math.floor(ctx.coins * (0.25 + 0.5 * ctx.style.risk));
    const val = o => {
      switch (o.kind) {
        case 'heal': return ctx.hpFrac < 0.45 ? 100 : ctx.hpFrac < 0.7 ? 20 : 0;
        case 'item': return ctx.itemGain ? Math.max(0, ctx.itemGain(o)) : 0;
        case 'vitamin': return ctx.vitOk && ctx.vitOk(o) ? 40 + RAR_BONUS[o.r | 0] : 0;
        case 'egg': return ctx.eggOk && ctx.eggOk(o) ? 60 : 0;
        case 'luck': return (ctx.luck || 0) < (ctx.luckCap || 1) && ctx.minute < 22 ? 30 * (1 - ctx.minute / 30) : 0;
        case 'curse': return ctx.curseOk && ctx.curseOk(o) ? 25 : 0;
        default: return 0;
      }
    };
    const list = offers.map((o, i) => ({ i, v: val(o), p: Math.max(1, o.price || 0) })).filter(x => x.v > 0)
      .sort((a, b) => b.v / b.p - a.v / a.p || b.v - a.v);
    const out = [];
    for (const x of list) {
      const urgent = offers[x.i].kind === 'heal' && ctx.hpFrac < 0.45;
      if (x.p <= budget || (urgent && x.p <= ctx.coins)) { out.push(x.i); budget -= x.p; ctx.coins -= x.p; }
    }
    return out;
  }

  /**
   * (1.0, bloque E) Porygon: sube la rareza de un objeto. offers: [{ id, r, price, gain }] (gain: cuánto mejora ese
   * objeto, ≥ 0); ctx: { coins, style }. Gasta como en la tienda (una parte de lo que lleva); devuelve el índice (−1: nada).
   */
  function machine(offers, ctx) {
    const budget = Math.floor(ctx.coins * (0.25 + 0.5 * ctx.style.risk));
    let best = -1, bv = 0;
    offers.forEach((o, i) => {
      if (!(o.price > 0) || o.price > budget || !(o.gain > 0)) return;
      const v = o.gain / o.price;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }

  const api = { STYLES, W, SPECIAL, RAR_BONUS, style, itemValue, pickItem, pickBond, forget, cardRarity, temple, vitamin, curse, egg, shop, machine };
  root.BotDecide = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
