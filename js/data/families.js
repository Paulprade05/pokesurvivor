/* ============ families.js — familias de evolución (26-10-2026) ============
 * Cada familia (Charmander → Charmeleon → Charizard) se representa en todo el juego
 * por su ÚLTIMA evolución: en la Pokédex sólo salen las formas finales (y los que no
 * evolucionan), el gacha sólo da formas finales y lo que una partida tenía de una
 * preevolución pasa a su forma final (core/db.js, «FAMILIAS»). Las preevoluciones se
 * ven en la ficha de su final (con sus estadísticas) y son con las que se empieza la
 * partida (G.Evo, systems/mons.js: eligiendo Charizard, sales como Charmander).
 * Ramas (Eevee, Wurmple, Tyrogue, Slowpoke, Applin...): cada forma final es una entrada.
 *
 * No lleva datos propios: sale de G.EVO (data/evolutions.js, de PokeAPI) y de los
 * Pokémon que hay en el juego (G.DEX), igual que G.Evo. Si mañana entra Trumbeak,
 * Pikipek deja de ser final solo (y quien lo tenga pasa a tener Toucannon).
 *
 *   G.Fam.isFinal(dex)    no evoluciona en nada que esté en el juego
 *   G.Fam.finalsOf(dex)   las formas finales a las que llega (él mismo, si es final)
 *   G.Fam.familyOf(dex)   { base, stages: [[dex...] de cada fase], finals, members }
 *   G.Fam.lineOf(dex)     de la primera fase a dex: Charizard → [4, 5, 6]
 *   G.Fam.prevOf / kidsOf / baseOf
 *   G.Fam.FINALS          todas las formas finales, en el orden de la Pokédex
 *   G.Fam.total(gen) / owned(save, gen)   cuántas hay / cuántas tienes (gen 0: todas)
 *   G.Fam.rec(dex)        récords con ese Pokémon (save.prec, se apuntan al acabar cada partida)
 */
G.Fam = (() => {
  let PREV = null, KIDS = null, FINALS = null, FINSET = null;
  const FIN_OF = {}, FAM_OF = {};

  const ready = () => !!(G.DEX && G.DEX_BY && G.EVO);
  function build() {
    if (PREV || !ready()) return;
    PREV = {}; KIDS = {};
    for (const k in G.EVO) {
      const d = +k, r = G.EVO[k];
      // Como G.Evo.rule: las dos fases tienen que estar en el juego.
      if (!r || !G.DEX_BY[d] || !G.DEX_BY[r.f] || r.f === d) continue;
      PREV[d] = r.f;
      (KIDS[r.f] = KIDS[r.f] || []).push(d);
    }
    for (const k in KIDS) KIDS[k].sort((a, b) => a - b);
    FINALS = G.DEX.filter(p => !KIDS[p.dex]).map(p => p.dex);
    FINSET = new Set(FINALS);
  }

  const kidsOf = dex => { build(); return (KIDS && KIDS[dex]) || []; };
  const prevOf = dex => { build(); return PREV && PREV[dex] != null ? PREV[dex] : null; };
  function isFinal(dex) { build(); return !!FINSET && FINSET.has(+dex); }

  /** De la primera fase a dex (como G.Evo.path). */
  function lineOf(dex) {
    dex = +dex;
    const out = [dex];
    for (let n = 0; n < 8 && prevOf(out[0]) != null; n++) out.unshift(prevOf(out[0]));
    return out;
  }
  const baseOf = dex => lineOf(dex)[0];

  /** Formas finales a las que llega dex (de menor a mayor número). */
  function finalsOf(dex) {
    dex = +dex;
    if (FIN_OF[dex]) return FIN_OF[dex];
    if (!G.DEX_BY || !G.DEX_BY[dex]) return [];
    const out = new Set(), todo = [dex];
    for (let n = 0; todo.length && n < 60; n++) {
      const d = todo.pop(), k = kidsOf(d);
      if (!k.length) out.add(d); else todo.push(...k);
    }
    return (FIN_OF[dex] = [...out].sort((a, b) => a - b));
  }

  /** La familia de dex: su primera fase, las fases (cada una con sus formas) y sus finales. */
  function familyOf(dex) {
    const base = baseOf(dex);
    if (FAM_OF[base]) return FAM_OF[base];
    const stages = [];
    let row = [base];
    for (let n = 0; row.length && n < 8; n++) {
      stages.push(row);
      row = [].concat(...row.map(kidsOf));
    }
    return (FAM_OF[base] = { base, stages, finals: finalsOf(base), members: [].concat(...stages) });
  }

  const finals = () => { build(); return FINALS || []; };
  /** Cuántas formas finales hay (de una región, o todas con gen 0). */
  const total = (gen = 0) => finals().filter(d => !gen || G.DEX_BY[d].gen === gen).length;
  /** Cuántas tiene la partida s (de una región, o todas con gen 0). */
  function owned(s, gen = 0) {
    const o = (s && s.owned) || {};
    let n = 0;
    for (const d of finals()) if (o[d] && (!gen || G.DEX_BY[d].gen === gen)) n++;
    return n;
  }
  /** Shinies de formas finales que tiene la partida s. */
  function shinies(s) {
    const o = (s && s.shiny) || {};
    let n = 0;
    for (const d of finals()) if (o[d]) n++;
    return n;
  }

  // ---------------- récords con cada Pokémon (save.prec) ----------------
  /*
   * prec[dex] = [mejor tiempo (s), mejor nivel, más derrotados, más jefes] en una partida
   * con ese Pokémon (el que elegiste: pl.dex). Se apunta al acabar cada partida (el aviso
   * 'runEnd' de G.Progress; en grupo, cada uno el suyo) y se ve en la ficha de la Pokédex.
   * Al fusionar partidas, el mayor de cada uno (core/db.js).
   */
  function rec(dex) {
    const s = G.DB && G.DB.save, r = s && s.prec && s.prec[dex];
    return Array.isArray(r) ? r : null;
  }
  function noteRun(d) {
    const s = G.DB && G.DB.save, pl = G.Game && G.Game.player;
    if (!s || !pl || !G.DEX_BY[pl.dex]) return;
    const now = [Math.floor(+d.time || 0), pl.level | 0, pl.kills | 0, pl.bosses | 0];
    s.prec = s.prec && typeof s.prec === 'object' ? s.prec : {};
    const old = Array.isArray(s.prec[pl.dex]) ? s.prec[pl.dex] : [0, 0, 0, 0];
    s.prec[pl.dex] = now.map((v, i) => Math.max(+old[i] || 0, v));
  }
  // Se engancha al aviso de fin de partida cuando ya está todo cargado (G.Progress es de después).
  if (typeof addEventListener === 'function') addEventListener('DOMContentLoaded', () => {
    const P = G.Progress;
    if (!P || typeof P.event !== 'function' || P.event.famHook) return;
    const ev = P.event;
    P.event = function (kind, d) {
      if (kind === 'runEnd') { try { noteRun(d || {}); } catch (e) { /* sin récord, nada más */ } }
      return ev.apply(this, arguments);
    };
    P.event.famHook = true;
  });

  return {
    ready, isFinal, finalsOf, familyOf, lineOf, baseOf, prevOf, kidsOf, total, owned, shinies, rec, noteRun,
    get FINALS() { return finals(); }
  };
})();
