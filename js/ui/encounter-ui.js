/* ============ encounter-ui.js — pantalla de los encuentros (1.0, bloque E, 25-11-2026) ============
 * Una sola pantalla para todos (#scr-encounter, plantilla «Elección» de docs/DISENO.md §14c): las cartas en fila, ← → con
 * vuelta y ↓ a «Irse» (B también se va). Las mismas cartas que la subida de nivel (G.RunUI.parts.cardEl).
 *   shop     Kecleon: un objeto, curarte, una vitamina y suerte, con su precio y lo que te llevarías a la cuenta.
 *            Se puede comprar varias cosas: la pantalla se vuelve a pintar tras cada compra. El objeto se te da al irte.
 *   temple   Templo: elige 1 de 3 vitaminas (o ninguna).
 *   forget   Smeargle: el ataque suelto que olvidas (o ninguno).
 *   machine  Porygon: el objeto al que subes la rareza (o ninguno).
 *   egg      Chansey (bloque G): el huevo que te da; si ya llevas compañero o huevo, eliges cuál se queda («Irse»: el tuyo).
 * En solitario la partida se para mientras está abierta (G.Game.encounterHold); en grupo sigue, como la pausa.
 * Contrato con el bot (tools/curve.cjs): .pick-card con data-kind (item | heal | vitamin | luck | forget | rarity), data-id,
 * data-r, data-price; «Irse» lleva data-close.
 */
G.EncounterUI = (() => {
  const $ = G.UI.$;
  let cur = null;               // { e, o, gifts: [claves de objeto que te llevas al irte] }
  const P = () => G.RunUI.parts;
  const n = v => G.I18n.num ? G.I18n.num(v) : String(v);

  const isOpen = () => G.UI.isOpen('scr-encounter');

  function open(e, o) {
    if (cur) return;
    cur = { e, o, gifts: [] };
    G.Game.encounterHold(true);
    P().headIcons('scr-encounter');
    render(true);
    G.UI.show('scr-encounter');
    P().guard($('enc-cards'));
  }

  const HEAD = {
    shop: { ico: 'shop', title: 'Kecleon, tendero ambulante', leave: 'Irse' },
    temple: { ico: 'hpup', title: 'Templo de vitaminas', leave: 'Ninguna' },
    forget: { ico: 'book', title: 'Smeargle', leave: 'No olvidar nada' },
    machine: { ico: 'up', title: 'Porygon', leave: 'Irse' },
    egg: { ico: 'egg', title: 'Chansey', leave: 'Irse' }
  };

  function render(first = false) {
    const { e, o } = cur, pl = G.Game.player, h = HEAD[o.kind];
    $('enc-ico').innerHTML = G.Icons.html(h.ico, 30);
    $('enc-title').textContent = G.T(h.title);
    $('enc-leave-t').textContent = G.T(o.kind === 'egg' && pl.companion ? 'Quedarme con el mío' : h.leave);
    const purse = G.Encounters.purse(pl);
    $('enc-sub').innerHTML = o.kind === 'shop' || o.kind === 'machine'
      ? `${G.Icons.html('coin', 20)}<span>${G.T('Te llevarías a la cuenta')}</span> <b>${n(purse)}</b>`
      : o.kind === 'temple' ? G.T('Elige una vitamina: cada una tiene su tope')
      : o.kind === 'egg' ? G.I18n.f('Un huevo: eclosiona andando (unos {x} min) y te acompaña toda la partida', Math.round(G.Companion.HATCH_D / 110 / 60))
      : G.T('Olvida un ataque suelto: deja sitio para aprender otro');
    const box = $('enc-cards');
    box.innerHTML = '';
    const cards = o.kind === 'shop' ? shopCards(pl, o) : o.kind === 'temple' ? templeCards(pl, o)
                : o.kind === 'forget' ? forgetCards(pl, o) : o.kind === 'egg' ? [Object.assign(eggCard(pl, o.egg), { kind: 'egg', id: o.egg.dex, r: o.egg.r,
                    go: () => { G.Companion.give(pl, o.egg); G.Audio.sfx('confirm'); close(); } })] : machineCards(pl, o);
    if (!cards.length) box.innerHTML = `<p class="enc-none">${G.T(o.kind === 'forget' ? 'No tienes ataques sueltos que olvidar' : 'Nada que hacer aquí ahora')}</p>`;
    cards.forEach((c, i) => {
      const el = P().cardEl(c, i, () => { if (!P().guarded() && !c.off) c.go(); }, false);
      el.dataset.kind = c.kind; el.dataset.id = c.id; el.dataset.r = c.r | 0;
      if (c.price != null) el.dataset.price = c.price;
      if (c.off) el.classList.add('enc-off');
      box.appendChild(el);
    });
    $('enc-keys').innerHTML = cards.map((_, i) => '<kbd>' + (i + 1) + '</kbd>').join(' ');
    P().fitCards(box);
    if (!first && G.Pad && G.Pad.refocus) G.Pad.refocus();
  }

  const priceTag = (p, ok) => `<span class="enc-price${ok ? '' : ' no'}">${G.Icons.html('coin', 20)}<b>${n(p)}</b></span>`;

  function shopCards(pl, o) {
    const E = G.Encounters, out = [];
    for (const it of o.offers) {
      const p = E.price(pl, it.kind, it.r), can = E.canBuy(pl, it);
      const base = { kind: it.kind, id: it.id, r: it.r, price: p, off: !can, go: () => { if (E.buy(pl, it, k => cur.gifts.push(k))) render(); } };
      let c;
      if (it.kind === 'item') {
        const N = G.Items.BY[it.id];
        c = { cls: 'is-next', icon: it.id, tile: 'tint', tileC: G.Items.color(it.r), eyebrow: P().rarBadge(it.r), title: N.name,
              desc: P().itemLines(it.id, it.r, false) + `<span class="enc-note">${G.T('Te lo da al irte')}</span>` };
      } else if (it.kind === 'vitamin') {
        c = vitCard(pl, it);
      } else if (it.kind === 'egg') {
        c = eggCard(pl, it);
      } else if (it.kind === 'heal') {
        c = { cls: 'is-stat', icon: 'heal', tile: 't-blue', title: G.T('Curarte'), desc: G.T('Recuperas la mitad de tu vida') };
      } else {
        c = { cls: 'is-stat', icon: 'luck', tile: 't-gold', title: G.T('Suerte'),
              desc: G.I18n.f('+{x} % de suerte: más rareza en cartas y objetos', Math.round(E.LUCK.shop * 100))
                + `<span class="enc-note">${G.I18n.f('Llevas {x} %', G.Fortune.pct(pl))} · ${G.I18n.f('quedan {x}', it.left)}</span>` };
      }
      c.badge = it.sold ? P().badge(G.T('Vendido'), 'ghost') : priceTag(p, can);
      out.push(Object.assign(c, base));
    }
    return out;
  }

  function vitCard(pl, v) {
    const V = G.Vitamins;
    return { cls: 'is-up' + (v.r ? ' rar-on' : ''), rc: v.r ? G.Rarity.color(v.r) : '', icon: v.id, tile: 'tint', tileC: G.Rarity.color(v.r),
             eyebrow: P().rarBadge(v.r), title: G.T(V.NAME[v.id]),
             desc: V.desc(pl, v.id, v.r, v.m) + `<span class="enc-note">${G.T('Llevas')} ${V.progress(pl, v.id)}</span>` };
  }

  /** Huevo (bloque G): qué Pokémon lleva, su ataque y, si ya tienes uno, a cuál sustituye. */
  function eggCard(pl, g) {
    const dex = +(g.dex || g.id), mon = G.DEX_BY[dex] || {}, C = G.Companion, mv = G.Moves.get(C.moveOf(dex)), cur = pl.companion;
    const side = G.T(C.sideOf(dex) === 'physical' ? 'Físico' : 'Especial');
    return { cls: 'is-next' + (g.r ? ' rar-on' : ''), rc: g.r ? G.Rarity.color(g.r) : '', icon: 'egg', tile: 'tint', tileC: G.Rarity.color(g.r | 0),
             eyebrow: P().rarBadge(g.r | 0), title: G.I18n.f('Huevo de {x}', mon.name || '?'),
             desc: G.I18n.f('Ataca con {x} ({x})', mv ? G.T(mv.name) : '', side)
               + (cur && !g.sold ? `<span class="enc-note">${G.I18n.f(cur.egg ? 'Sustituye a tu huevo de {x}' : 'Sustituye a tu {x}', (G.DEX_BY[cur.dex] || {}).name || '')}</span>` : '') };
  }

  function templeCards(pl, o) {
    return o.vit.map(v => Object.assign(vitCard(pl, v), { kind: 'vitamin', id: v.id, r: v.r,
      go: () => { G.Vitamins.apply(pl, v.id, v.r, v.m); G.Audio.sfx('confirm'); close(); } }));
  }

  function forgetCards(pl, o) {
    return o.moves.filter(m => pl.moves.includes(m)).map(m => ({
      kind: 'forget', id: m.id, r: 0, cls: 'is-stat', icon: 'move:' + m.id, tile: 'tint', tileC: G.U.TYPE_COLOR[m.type],
      badge: P().lvBadge(m.lvl, false), eyebrow: m.evolved ? `<span class="pc-eyebrow">${G.T('Evolucionado')}</span>` : '',
      title: G.T(m.name), chips: P().moveChips(m), desc: G.T('Olvidarlo: puede volver a salir en las cartas'),
      go: () => { if (G.Encounters.forget(pl, m)) { G.Audio.sfx('confirm'); close(); } }
    }));
  }

  function machineCards(pl, o) {
    const E = G.Encounters, purse = E.purse(pl);
    return pl.items.map(it => {
      const top = it.r >= 3, p = top ? 0 : E.machinePrice(it.r), can = !top && purse >= p;
      return { kind: 'rarity', id: it.id, r: it.r, price: top ? null : p, off: !can, cls: 'is-up', icon: it.id, tile: 'tint', tileC: G.Items.color(top ? it.r : it.r + 1),
               eyebrow: top ? P().rarBadge(it.r, it.evo) : P().rarBadge(it.r, it.evo) + ' → ' + P().rarBadge(it.r + 1, it.evo),
               title: G.Items.nameOf(it), badge: top ? P().badge(G.T('Al máximo'), 'ghost') : priceTag(p, can),
               desc: top ? G.T('Ya es legendario') : P().itemLines(it.id, it.r + 1, it.evo),
               go: () => { if (E.upgradeItem(pl, it)) close(); } };
    });
  }

  /** Te vas (o ya has elegido): el encuentro se da por usado y, si compraste objetos, te los da. */
  function close() {
    if (!cur) return;
    const { e, gifts } = cur;
    cur = null;
    e.used = e.type !== 'temple' ? true : e.used;
    if (e.type === 'shop' || e.type === 'smeargle' || e.type === 'machine' || e.type === 'egg') e.done = true;
    G.UI.hide('scr-encounter');
    G.Game.encounterHold(false);
    for (const k of gifts) G.Game.giveItem(k);
  }

  /** (Grupo) Te llega la subida de nivel con la pantalla abierta: se cierra como si te fueras. */
  function abort() { if (cur) close(); }

  /** Partida nueva: nada a medias. */
  function reset() { cur = null; G.UI.hide('scr-encounter'); }

  function init() {
    $('enc-leave').onclick = () => { G.Audio.sfx('back'); close(); };
  }

  return { open, close, abort, reset, init, isOpen, get current() { return cur; } };
})();
