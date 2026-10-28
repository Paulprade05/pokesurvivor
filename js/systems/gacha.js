/* ============ gacha.js — un banner por generación ============
 * Lógica pura: no toca la interfaz. La pantalla está en ui/gacha-ui.js.
 *
 * 9 banners (Kanto ... Paldea). Cada uno con su propio pity.
 * Sólo salen FORMAS FINALES (26-10-2026, data/families.js): Charizard, no Charmander;
 * en una rama, cada final por su lado. Cada una con su rareza (la de la final).
 * Probabilidades por tirada:  Legendaria (5★) 1,5 % · Épica (4★) 6,5 % (como antes) y el
 * 92 % restante entre las demás finales del banner (1★-3★), con más peso cuanto más
 * comunes (W_LOW): como casi todas las finales son 3★, con las de antes (1★ 45 %) salía
 * Ditto una de cada dos tiradas en Kanto. Lo que da cada rareza en cada banner, ratesFor.
 * Garantías:
 *   - la tirada ×10 trae al menos un 4★ o superior
 *   - a las 70 tiradas sin 5★ en ese banner, el siguiente es 5★ seguro
 * Shiny: 1 de cada 100 tiradas sale en su versión shiny.
 * Repetidos: se convierten en Pokémonedas (los shiny repetidos, el triple).
 *
 * Se tira con TICKETS (se consiguen jugando):
 *   ×1   1 ticket
 *   ×10  10 tickets normales, o 1 ticket ×10 (eliges con qué)
 */
G.Gacha = (() => {
  /** ¿Qué gasta una tirada de n? → { t1, t10 } o null si no te llega. */
  /** @param use  't1' (tickets normales) o 't10' (un ticket ×10, sólo para la ×10) */
  function costOf(save, n, use = 't1') {
    const t = save.tickets || { t1: 0, t10: 0 };
    if (n === 10 && use === 't10') return t.t10 >= 1 ? { t1: 0, t10: 1 } : null;
    return t.t1 >= n ? { t1: n, t10: 0 } : null;
  }
  // Sólo formas finales (26-10-2026): Legendaria y Épica como antes; el resto, a repartir (W_LOW).
  const TOP = [[5, 1.5], [4, 6.5]], LOW = 92;
  // Peso de cada final común, poco común y rara. (Las 1★ y 2★ finales son pocas: sobre todo
  // familias a medias en el juego, como Pikipek; con más peso, en Alola salía una de 4 comunes
  // en el 37 % de las tiradas.)
  const W_LOW = { 1: 2, 2: 1.5, 3: 1 };
  const PITY_5 = 70;
  const SHINY_RATE = 1 / 100;
  // Repetidos: ahora casi todo lo que sale es 3★ (antes 1★ y 2★), así que una Rara repetida
  // da 30 (era 60) y una Poco común 25 (era 30): de media, lo mismo por tirada que antes.
  const REFUND = { 1: 15, 2: 25, 3: 30, 4: 120, 5: 300 };
  let forceShiny = 0;           // para pruebas y vídeos: las N próximas salen shiny

  const RARITY_NAME = { 1: 'Común', 2: 'Poco común', 3: 'Rara', 4: 'Épica', 5: 'Legendaria' };
  const RARITY_COLOR = { 1: '#9fb1c9', 2: '#5fe08a', 3: '#4fb4ff', 4: '#c47bff', 5: '#ffcb3d' };

  const BANNERS = [
    { gen: 1, name: 'Kanto',   color: ['#3a1d6e', '#1b2f78', '#0f4d6e'] },
    { gen: 2, name: 'Johto',   color: ['#5a2a1a', '#7a3d1f', '#2d4a6e'] },
    { gen: 3, name: 'Hoenn',   color: ['#0f4d6e', '#1b6a5a', '#2a3d78'] },
    { gen: 4, name: 'Sinnoh',  color: ['#2a2a5e', '#3d3d8a', '#5a2a6e'] },
    { gen: 5, name: 'Teselia', color: ['#1a1a2a', '#3a3a4e', '#2a4a6e'] },
    { gen: 6, name: 'Kalos',   color: ['#4a1a3a', '#2a3a7a', '#1a5a7a'] },
    { gen: 7, name: 'Alola',   color: ['#7a3a1a', '#1a6a6a', '#2a4a8a'] },
    { gen: 8, name: 'Galar',   color: ['#4a1a5a', '#1a3a6a', '#6a1a3a'] },
    { gen: 9, name: 'Paldea',  color: ['#6a2a1a', '#4a1a5a', '#1a4a6a'] }
  ];

  const isFinal = dex => !G.Fam || G.Fam.isFinal(dex);
  function inBanner(p, gen) { return p.gen === gen && !!G.SPRITE_META[p.dex] && isFinal(p.dex); }

  /** Lo que puede salir en un banner (sólo formas finales), por rareza. */
  const POOLS = {};
  function pools(gen) {
    if (POOLS[gen]) return POOLS[gen];
    const by = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const p of G.DEX) if (inBanner(p, gen) && by[p.rarity]) by[p.rarity].push(p);
    return (POOLS[gen] = by);
  }
  /** Pokémon de una rareza en un banner. */
  function pool(rarity, gen) { return (pools(gen)[rarity] || []).slice(); }
  /** Todos los de un banner. */
  function all(gen) { const by = pools(gen); return [].concat(by[1], by[2], by[3], by[4], by[5]); }

  /**
   * Probabilidad de cada rareza en un banner: [[rareza, %]...] de 1★ a 5★. Las que no
   * tienen ningún Pokémon en ese banner no salen (su parte se la quedan las demás).
   */
  function ratesFor(gen) {
    const by = pools(gen), out = {};
    const low = [1, 2, 3].reduce((a, r) => a + by[r].length * W_LOW[r], 0);
    let top = 0;
    for (const [r, w] of TOP) if (by[r].length) { out[r] = w; top += w; }
    const lowPct = low ? LOW : 0, k = 100 / (top + lowPct || 1);
    for (const r of [1, 2, 3]) out[r] = low ? lowPct * by[r].length * W_LOW[r] / low : 0;
    for (const r in out) out[r] = Math.round(out[r] * k * 10) / 10;
    return [1, 2, 3, 4, 5].filter(r => out[r] > 0).map(r => [r, out[r]]);
  }

  /** Un Pokémon del banner. min 4: Épica o mejor; 5: Legendaria (pity). */
  function rollMon(gen, min = 1) {
    const by = pools(gen);
    const pickTop = r => (by[r].length ? { rarity: r, mon: G.U.pick(by[r]) } : null);
    if (min >= 5) return pickTop(5) || pickTop(4) || rollMon(gen, 1);
    let x = Math.random() * (min >= 4 ? 8 : 100);
    for (const [r, w] of TOP) { x -= w; if (x <= 0) { const t = pickTop(r) || pickTop(r === 5 ? 4 : 5); if (t) return t; } }
    if (min >= 4) return pickTop(4) || pickTop(5) || rollMon(gen, 1);
    // Común, poco común o rara: cada una con su peso.
    const low = [].concat(...[1, 2, 3].map(r => by[r].map(p => [p, W_LOW[r]])));
    if (!low.length) return pickTop(4) || pickTop(5);
    let y = Math.random() * low.reduce((a, [, w]) => a + w, 0);
    for (const [p, w] of low) { y -= w; if (y <= 0) return { rarity: p.rarity, mon: p }; }
    const p = low[low.length - 1][0];
    return { rarity: p.rarity, mon: p };
  }

  /** Los 3 más fuertes de la generación, para el cartel del banner. */
  function featured(gen) {
    return pool(5, gen).sort((a, b) => b.bst - a.bst).slice(0, 3).map(p => p.dex);
  }

  /**
   * Hace `n` tiradas en el banner `gen` sobre el guardado `save` (lo modifica).
   * Devuelve null si no hay monedas, o la lista de resultados:
   *   { dex, rarity, shiny, isNew, refund }
   */
  function pull(save, n, gen = 1, use = 't1') {
    const cost = costOf(save, n, use);
    if (!cost) return null;
    save.tickets.t1 -= cost.t1;
    save.tickets.t10 -= cost.t10;
    save.pity = save.pity || {};
    save.shiny = save.shiny || {};
    save.pity[gen] = save.pity[gen] || 0;

    const out = [];
    for (let i = 0; i < n; i++) {
      save.pity[gen]++;
      let min = 1;
      if (save.pity[gen] >= PITY_5) min = 5;
      else if (n === 10 && i === n - 1 && !out.some(r => r.rarity >= 4)) min = 4;

      const got = rollMon(gen, min), rarity = got.rarity, list = pool(rarity, gen);
      if (rarity === 5) save.pity[gen] = 0;
      let mon = got.mon;
      let shiny = G.Sprites.hasShiny(mon.dex) && (forceShiny > 0 ? (forceShiny--, true) : Math.random() < SHINY_RATE);
      // Los shiny no se repiten: si ya tienes ese, sale otro de la misma rareza
      // cuyo shiny te falte; si los tienes todos, sale normal.
      if (shiny && save.shiny[mon.dex]) {
        const missing = list.filter(p => G.Sprites.hasShiny(p.dex) && !save.shiny[p.dex]);
        if (missing.length) mon = G.U.pick(missing);
        else shiny = false;
      }

      let isNew = false, refund = 0;
      if (shiny) {
        isNew = !save.shiny[mon.dex];
        if (isNew) save.shiny[mon.dex] = { at: Date.now(), from: 'gacha' };
        else refund = REFUND[rarity] * 3;
        if (!save.owned[mon.dex]) save.owned[mon.dex] = { at: Date.now(), from: 'gacha' };
      } else {
        isNew = !save.owned[mon.dex];
        if (isNew) save.owned[mon.dex] = { at: Date.now(), from: 'gacha' };
        else refund = REFUND[rarity];
      }
      save.coins += refund;
      out.push({ dex: mon.dex, rarity, shiny, isNew, refund });
    }
    save.stats.pulls = (save.stats.pulls || 0) + n;
    return out;
  }

  return { debugForceShiny(n = 1) { forceShiny = n; },
           costOf, PITY_5, SHINY_RATE, REFUND, RARITY_NAME, RARITY_COLOR, BANNERS,
           /** (Por compatibilidad: las del banner de Kanto. Las de cada uno, ratesFor(gen).) */
           get RATES() { return ratesFor(1); },
           pool, all, ratesFor, featured, pull };
})();
