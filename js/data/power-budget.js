/* ============ power-budget.js — presupuesto de poder de la 1.0 (bloque A, 24-11-2026) ============
 * Cuánto pueden crecer COMO MUCHO el daño, la defensa y la vida del jugador al final de una partida de 30 min
 * con todo lo nuevo de la 1.0, sobre lo que se tiene hoy (0.10) con el mismo Pokémon y las mismas mejoras.
 * Lo pidió el dueño (idea 2 de la propuesta 1.0). Nota del vault: «Bloque A - Medir».
 *
 * Tres ejes, cada uno un multiplicador sobre hoy:
 *   dmg  daño que haces              def  1 / (daño que recibes)          hp  vida máxima
 * Cada fuente nueva tiene su trozo (SOURCES[x].k) y sus topes; el producto de los trozos no puede pasar de LIMIT.
 * Los enemigos no cambian con el tope de 4 ataques (decisión del dueño): lo que se pierda ahí lo compensan las
 * rarezas y la Sobrefusión, dentro de este presupuesto.
 *
 * Quien haga cada sistema LEE sus topes de aquí (G.PowerBudget.VIT, .CARD, ...) en vez de copiarlos, y
 * tests/power-budget.test.cjs comprueba que nada se pasa (verify).
 *
 * Contrato para los bloques (verify lo mira si existe):
 *   G.Player.OVER_K, OVER_MAX               Sobrefusión (bloque C)
 *   G.CardRarity.EXTRA [4], .CAP, .AREA     rareza en las mejoras de ataque (bloque D)
 *   G.Fortune.MAX                           suerte (bloque D; no se llama «luck»: ya es Puntería)
 *   G.Vitamins.VIT                          vitaminas del templo y de la tienda (bloque E): { id: { stat, step[4], cap } }
 *   G.Companion.SHARE                       trozo del daño del compañero (bloque G)
 *   G.Items.DMG_CAP, CAP                    objetos (ya existen; la tienda de Kecleon y la máquina no los suben)
 */
G.PowerBudget = (() => {
  /** Lo máximo que puede crecer cada eje sobre hoy, sumando todo lo de la 1.0. */
  const LIMIT = { dmg: 2.0, def: 1.25, hp: 1.35, spd: 1.2 };
  /** Lo que se espera ver en las partidas del bot (mediana del final): si se pasa, hay que mirar. */
  const EXPECT = { dmg: 1.5, def: 1.15, hp: 1.2 };

  // ---- Rareza en las mejoras de ataque (bloque D): un extra de daño por carta, sin saltar niveles ----
  // Común, raro, épico, legendario (los 4 colores de los objetos). Suma por ataque con tope CAP.
  // AREA: el épico y el legendario dan además algo de área, con tope (el anfitrión rechaza áreas > ×1,5: netPass).
  const CARD = { EXTRA: [0, 0.02, 0.04, 0.07], CAP: 0.15, AREA: 0.15, AREA_NET: 1.5 };

  // ---- Vitaminas (templo y tienda, bloque E): cada toma suma step[rareza] hasta cap (tope por vitamina) ----
  // Más PP: +1 a la cantidad de un ataque, sin el tope de Réplica (dueño, 24-11-2026); su tope es el suyo (cap).
  //   Su daño «equivalente» (dmgEq): +1 proyectil en 1 de 4 ataques que lanza ~4 → +6,25 % por toma.
  const VIT = {
    hpup:    { stat: 'hp',     step: [0.03, 0.05, 0.07, 0.10], cap: 0.25 },
    protein: { stat: 'atkP',   step: [0.02, 0.03, 0.04, 0.06], cap: 0.15 },
    calcium: { stat: 'atkS',   step: [0.02, 0.03, 0.04, 0.06], cap: 0.15 },
    iron:    { stat: 'redP',   step: [0.02, 0.03, 0.04, 0.06], cap: 0.15 },
    zinc:    { stat: 'redS',   step: [0.02, 0.03, 0.04, 0.06], cap: 0.15 },
    carbos:  { stat: 'spd',    step: [0.02, 0.03, 0.04, 0.06], cap: 0.15 },
    ppup:    { stat: 'amount', step: [1, 1, 1, 1], cap: 2, dmgEq: 0.0625 }
  };

  // ---- Suerte (bloque D): un solo número para todas las rarezas; al tope, la tabla de jefes y cofres grandes ----
  // No da poder por sí misma: mueve las rarezas, y cada rareza ya tiene su tope (objetos, cartas, vitaminas).
  const FORTUNE = { MAX: 1, TABLE_MAX: [30, 40, 23, 7] };

  // ---- Compañero del huevo (bloque G): un trozo fijo del daño total ----
  const COMPANION = { SHARE: [0.10, 0.15] };

  // ---- Sobrefusión (bloque C): +8 % cada una, hasta 8, también las 3 primeras (dueño, 24-11-2026) ----
  const OVER = { K: 0.08, MAX: 8, TODAY: 0.15 * 3 };

  // ---- Objetos (ya existen): la 1.0 no sube sus topes; la tienda y la máquina de rareza venden dentro de ellos ----
  const ITEMS = { DMG_CAP: 2, CAP: { atk: 0.9, red: 0.35, hp: 0.6, spd: 0.6 }, LEGEND_MAX: 0.07 };

  const vitMax = id => VIT[id].cap;
  /** Trozo de cada fuente en cada eje (1 = no cambia ese eje). */
  const SOURCES = {
    cardRarity: { name: 'Rareza en mejoras de ataque', block: 'D', k: { dmg: 1 + CARD.CAP } },
    vitamins:   { name: 'Vitaminas (Proteína/Calcio, Hierro/Zinc, Más PS, Carburante)', block: 'E',
                  k: { dmg: 1 + Math.max(vitMax('protein'), vitMax('calcium')), def: 1 / (1 - Math.max(vitMax('iron'), vitMax('zinc'))),
                       hp: 1 + vitMax('hpup'), spd: 1 + vitMax('carbos') } },
    ppup:       { name: 'Más PP (sin el tope de Réplica)', block: 'E', k: { dmg: 1 + VIT.ppup.cap * VIT.ppup.dmgEq } },
    fortune:    { name: 'Suerte', block: 'D', k: {} },
    shop:       { name: 'Tienda de Kecleon', block: 'E', k: {} },
    companion:  { name: 'Compañero del huevo', block: 'G', k: { dmg: 1 / (1 - COMPANION.SHARE[1]) } },
    overfusion: { name: 'Sobrefusión (+8 % ×8)', block: 'C', k: { dmg: (1 + OVER.K * OVER.MAX) / (1 + OVER.TODAY) } },
    fourMoves:  { name: 'Tope de 4 ataques', block: 'C', k: {} }
  };

  /** Producto de los trozos en cada eje: lo máximo que puede crecer con todo. */
  function total() {
    const t = { dmg: 1, def: 1, hp: 1, spd: 1 };
    for (const id in SOURCES) for (const ax in SOURCES[id].k) t[ax] *= SOURCES[id].k[ax];
    return t;
  }

  const r3 = x => Math.round(x * 1000) / 1000;
  /**
   * Lo que se pasa del presupuesto, en el presupuesto mismo y en lo que el juego tenga cargado (g = G).
   * Devuelve una lista de textos; vacía si todo cabe.
   */
  function verify(g) {
    const bad = [], t = total();
    for (const ax in LIMIT) if (t[ax] > LIMIT[ax] + 1e-9) bad.push(`total ${ax} ×${r3(t[ax])} > ×${LIMIT[ax]}`);
    for (const id in VIT) { const v = VIT[id]; if (v.step.some(s => s > v.cap)) bad.push(`vitamina ${id}: una toma pasa de su tope`); }
    if (!g) return bad;
    const P = g.Player;
    if (P && P.OVER_K != null && P.OVER_K * P.OVER_MAX > OVER.K * OVER.MAX + 1e-9) bad.push(`Sobrefusión ${r3(P.OVER_K * P.OVER_MAX)} > ${r3(OVER.K * OVER.MAX)}`);
    const I = g.Items;
    if (I) {
      if (I.DMG_CAP > ITEMS.DMG_CAP) bad.push(`objetos DMG_CAP ${I.DMG_CAP} > ${ITEMS.DMG_CAP}`);
      for (const k in ITEMS.CAP) if (I.CAP && I.CAP[k] > ITEMS.CAP[k]) bad.push(`objetos CAP.${k} ${I.CAP[k]} > ${ITEMS.CAP[k]}`);
    }
    const C = g.CardRarity;
    if (C) {
      if (C.CAP > CARD.CAP) bad.push(`rareza de cartas CAP ${C.CAP} > ${CARD.CAP}`);
      if (C.AREA > CARD.AREA) bad.push(`rareza de cartas AREA ${C.AREA} > ${CARD.AREA}`);
      (C.EXTRA || []).forEach((x, i) => { if (x > CARD.EXTRA[i]) bad.push(`rareza de cartas EXTRA[${i}] ${x} > ${CARD.EXTRA[i]}`); });
    }
    if (g.Fortune && g.Fortune.MAX > FORTUNE.MAX) bad.push(`suerte MAX ${g.Fortune.MAX} > ${FORTUNE.MAX}`);
    if (g.Companion && g.Companion.SHARE != null) {
      const s = [].concat(g.Companion.SHARE);
      if (Math.max(...s) > COMPANION.SHARE[1]) bad.push(`compañero ${Math.max(...s)} > ${COMPANION.SHARE[1]}`);
    }
    const V = g.Vitamins && g.Vitamins.VIT;
    if (V) for (const id in V) {
      const b = VIT[id];
      if (!b) { bad.push(`vitamina ${id} sin presupuesto`); continue; }
      if (V[id].cap > b.cap) bad.push(`vitamina ${id} cap ${V[id].cap} > ${b.cap}`);
      (V[id].step || []).forEach((s, i) => { if (s > b.step[i]) bad.push(`vitamina ${id} step[${i}] ${s} > ${b.step[i]}`); });
    }
    return bad;
  }

  return { LIMIT, EXPECT, CARD, VIT, FORTUNE, COMPANION, OVER, ITEMS, SOURCES, total, verify };
})();
