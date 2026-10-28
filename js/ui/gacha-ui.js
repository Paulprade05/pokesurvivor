/* ============ gacha-ui.js — banners por generación y animación de tirada ============
 * La lógica (probabilidades, pity, shiny, repetidos) está en systems/gacha.js.
 *
 * Pantalla (#scr-gacha, hoja): pestañas de región arriba, el cartel con sus
 * legendarios, el contador de legendaria, los tickets y las probabilidades en
 * el cuerpo, y los botones de tirar en el pie.
 * Tirada (#pull-fx): la tragaperras pixel art (slots.js) a escala entera de
 * píxeles de pantalla y luego las cartas, en una rejilla que cabe en el móvil.
 * Más a mano (26-10-2026): región anterior / siguiente con las flechas del cartel o
 * deslizando el dedo por él, cuántos tickets faltan en los botones que no se pueden
 * pulsar, «Otra vez» al acabar una tirada y «Tirar todos» con una ventana del juego.
 */
G.GachaUI = (() => {
  const $ = G.UI.$;
  let busy = false;
  let gen = 1;
  let skipCards = false;        // Saltar: las cartas que falten salen de golpe
  let rulesOn = false;          // móvil tumbado: las reglas en vez de las fichas de probabilidad
  const ico = n => G.Icons.html(n, 30);

  function init() {
    $('pull-1').onclick = () => pull(1);
    $('pull-10').onclick = () => pull(10, 't1');
    $('pull-10b').onclick = () => pull(10, 't10');
    $('pull-all').onclick = pullAll;
    $('pull-close').onclick = close;
    // En la tirada: modo rápido (se recuerda) y Saltar.
    $('pull-fast').insertAdjacentHTML('afterbegin', ico('boot'));
    $('pull-fast').onclick = () => { G.Slots.setFast(!G.Slots.fast); fastChip(); };
    $('pull-skip').onclick = skip;
    $('pull-again').onclick = again;
    $('slot').addEventListener('click', () => { if (busy) { G.Slots.setFast(true); fastChip(); } });
    $('gacha-pity-ico').innerHTML = ico('ball4');
    wireNav();

    const tabs = $('gacha-gens');
    G.Gacha.BANNERS.forEach(b => {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'gen-tab';
      t.setAttribute('role', 'tab');
      t.dataset.gen = b.gen;
      t.innerHTML = `<b>${b.name}</b><small>Gen ${b.gen}</small>`;
      t.onclick = () => { if (gen === b.gen) return; gen = b.gen; refresh(); t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
      tabs.appendChild(t);
    });

    // Al girar el móvil o cambiar la ventana: legendarios del cartel y tragaperras a su nuevo tamaño.
    let q = 0;
    addEventListener('resize', () => {
      if (q) return;
      q = requestAnimationFrame(() => { q = 0; if (G.UI.isOpen('scr-gacha')) fitFeat(); fitSlot(); });
    });
    // Esc en la tirada: la salta y, si ya ha acabado, la cierra (sin volver además al menú).
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || $('pull-fx').classList.contains('hidden')) return;
      e.stopPropagation(); e.preventDefault();
      if (busy) skip(); else close();
    }, true);
  }

  function open() {
    G.UI.show('scr-gacha', true);
    refresh();
  }

  // ---------------- a mano en el móvil (26-10-2026) ----------------
  // Cambiar de región sin ir a las pestañas de arriba: las flechas del cartel o
  // deslizar el dedo por él (a la izquierda, la siguiente). La pestaña elegida, siempre a la vista.
  function step(d) {
    if (busy) return;
    const n = G.Gacha.BANNERS.length;
    gen = ((gen - 1 + d) % n + n) % n + 1;
    G.Audio.sfx('select');
    refresh();
  }
  function wireNav() {
    $('gacha-prev').innerHTML = G.UI.svg('back');
    $('gacha-next').innerHTML = G.UI.svg('chevron');
    $('gacha-prev').onclick = () => step(-1);
    $('gacha-next').onclick = () => step(1);
    // (Con toques y no con punteros: al arrastrar, el navegador se queda el gesto y
    // cancela el puntero, pero el toque sí termina.)
    const hero = $('banner');
    let sw = null;
    hero.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      sw = e.touches.length === 1 && t && !e.target.closest('button') ? { id: t.identifier, x: t.clientX, y: t.clientY } : null;
    }, { passive: true });
    hero.addEventListener('touchend', e => {
      const t = sw && [...e.changedTouches].find(q => q.identifier === sw.id);
      if (!t) return;
      const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
      sw = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    hero.addEventListener('touchcancel', () => { sw = null; }, { passive: true });
  }
  /** La pestaña de la región elegida, a la vista (las regiones se deslizan de lado). */
  function showTab() {
    const strip = $('gacha-gens'), t = strip.querySelector('.gen-tab.on');
    if (!t || !strip.clientWidth) return;
    const l = t.offsetLeft - strip.offsetLeft, r = l + t.offsetWidth;
    if (l < strip.scrollLeft + 8) strip.scrollLeft = Math.max(0, l - 24);
    else if (r > strip.scrollLeft + strip.clientWidth - 8) strip.scrollLeft = r - strip.clientWidth + 24;
  }

  /**
   * Botones de tirar: lo que cuesta cada uno, con el ticket de verdad, y si no te
   * llega, cuántos te faltan (así se entiende por qué no se puede).
   */
  function costs(s) {
    const t = s.tickets || { t1: 0, t10: 0 };
    const pill = (icon, need, have) => `<span class="pb-ico">${ico(icon)}</span><b>${need}</b>`
      + (have < need ? `<small class="pb-miss">${G.I18n.f('te faltan {x}', need - have)}</small>` : '');
    $('cost-1').innerHTML = pill('ticket', 1, t.t1);
    $('cost-10').innerHTML = pill('ticket', 10, t.t1);
    $('cost-10b').innerHTML = pill('ticket10', 1, t.t10);
    $('pull-1').disabled = !G.Gacha.costOf(s, 1);
    $('pull-10').disabled = !G.Gacha.costOf(s, 10, 't1');
    $('pull-10b').disabled = !G.Gacha.costOf(s, 10, 't10');
  }

  // «Otra vez»: al acabar una tirada, la misma (en la misma región) sin volver al cartel.
  let lastPull = null;
  function againBtn(show) {
    const b = $('pull-again'), p = lastPull, s = G.DB.save;
    const ok = !!(show && p && G.Gacha.costOf(s, p.n, p.use));
    b.classList.toggle('hidden', !ok);
    if (!ok) return;
    b.classList.toggle('rainbow', p.use === 't10');
    $('pull-again-t').textContent = G.I18n.f('Otra vez ×{x}', p.n);
    $('cost-again').innerHTML = `<span class="pb-ico">${ico(p.use === 't10' ? 'ticket10' : 'ticket')}</span><b>${p.use === 't10' ? 1 : p.n}</b>`;
  }
  function again() {
    if (busy || !lastPull) return;
    $('pull-results').innerHTML = '';
    pull(lastPull.n, lastPull.use);
  }

  /** «¿Tirar todos?» en una ventana del juego (no la del sistema: con el móvil de pie saldría de lado). → Promise<boolean> */
  function ask(text) {
    return new Promise(done => {
      const el = document.createElement('section');
      el.id = 'scr-pullall';
      el.className = 'scr dim modal';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-labelledby', 'pullall-title');
      el.innerHTML = `<div class="box mcard">
        <span class="ico-tile l round t-purple mcard-ico" aria-hidden="true">${G.Icons.html('ball4', 60)}</span>
        <h2 id="pullall-title">Tirar todos</h2>
        <p class="mcard-txt"></p>
        <div class="mcard-acts">
          <button class="btn gold big block" type="button" data-a="yes">Tirar todos</button>
          <button class="btn ghost block" type="button" data-a="no" data-back>Cancelar</button>
        </div></div>`;
      el.querySelector('.mcard-txt').textContent = text;
      document.body.appendChild(el);
      const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); end(false); } };
      const end = v => { removeEventListener('keydown', onKey, true); el.remove(); done(v); };
      addEventListener('keydown', onKey, true);
      el.querySelector('[data-a=no]').onclick = () => end(false);
      el.querySelector('[data-a=yes]').onclick = () => end(true);
      el.addEventListener('click', e => { if (e.target === el) end(false); });
      setTimeout(() => el.querySelector('[data-a=yes]').focus({ preventScroll: true }), 50);
    });
  }

  function refresh() {
    const s = G.DB.save;
    const banner = G.Gacha.BANNERS[gen - 1];

    // Pestañas: la región y cuántos tienes de ella (en verde si está completa).
    // Familias (26-10-2026): sólo cuentan las formas finales, lo que puede salir.
    const cnt = {};
    for (const b of G.Gacha.BANNERS) { const l = G.Gacha.all(b.gen); cnt[b.gen] = [l.filter(p => s.owned[p.dex]).length, l.length]; }
    document.querySelectorAll('#gacha-gens .gen-tab').forEach(t => {
      const g = +t.dataset.gen, c = cnt[g] || [0, 0], on = g === gen;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.classList.toggle('done', c[1] > 0 && c[0] >= c[1]);
      t.querySelector('small').textContent = c[0] + '/' + c[1];
    });

    // Cartel: los colores de la región, su nombre y lo que llevas.
    const all = G.Gacha.all(gen);
    const owned = all.filter(p => s.owned[p.dex]).length;
    const shinies = all.filter(p => s.shiny && s.shiny[p.dex]).length;
    const hero = $('banner');
    banner.color.forEach((c, i) => hero.style.setProperty('--g' + (i + 1), c));
    $('gacha-gen').textContent = 'Gen ' + gen;
    $('banner-title').textContent = banner.name + ' Misterioso';
    $('banner-desc').textContent = `Los ${all.length} Pokémon de la generación ${gen}. ¡Los legendarios esperan!`;
    $('gacha-owned').innerHTML = `<span>Tienes ${owned} de ${all.length}</span>` +
      (shinies ? `<span class="gh-shiny" title="Shiny">${G.Icons.html('shiny', 18)}<b>${shinies}</b></span>` : '');
    $('gacha-owned-bar').firstChild.style.width = (all.length ? owned / all.length * 100 : 0) + '%';

    // Legendarios: el más fuerte en el centro y por delante; los otros dos, mirándole.
    const feat = $('gacha-feat');
    feat.innerHTML = '';
    const f = G.Gacha.featured(gen);
    const order = f.length === 3 ? [f[1], f[0], f[2]] : f;
    order.forEach((dex, i) => {
      const dir = order.length === 3 ? [1, 0, 7][i] : 0;
      const cv = G.UI.spriteCanvas(dex, 120, 150, { lively: true, scale: 2, dir });
      cv.dataset.dex = dex; cv.dataset.dir = dir; cv.dataset.k = 2;
      if (order.length === 3 && i === 1) cv.className = 'gh-main';
      feat.appendChild(cv);
    });

    // Contador de legendaria.
    const pity = (s.pity && s.pity[gen]) || 0;
    $('gacha-pity').textContent = `Tiradas sin legendaria en ${banner.name}: ${pity} / ${G.Gacha.PITY_5}`;
    $('gacha-pity-bar').firstChild.style.width = Math.min(100, pity / G.Gacha.PITY_5 * 100) + '%';

    // Tickets que tienes.
    const t = s.tickets || { t1: 0, t10: 0 };
    $('gacha-tickets').innerHTML = `<p class="eyebrow">Tickets del gacha</p><div class="gw-row">
      <span class="gw-chip"><span class="ico-tile s">${ico('ticket')}</span><b>${t.t1.toLocaleString(G.I18n.locale)}</b></span>
      <span class="gw-chip"><span class="ico-tile s t-purple">${ico('ticket10')}</span><b>${t.t10.toLocaleString(G.I18n.locale)}</b><small>×10</small></span></div>`;

    // Probabilidades: de la más rara a la más común, con su Poké Ball. En el móvil
    // tumbado van en fichas y las reglas salen con la «i» (en el resto, siempre a la vista).
    const rates = $('gacha-rates');
    rates.innerHTML = `<h3><span>Probabilidades</span><button type="button" class="icon-btn plain gr-info" aria-expanded="${rulesOn}" ` +
      `aria-label="Reglas del gacha" title="Reglas del gacha">${G.UI.svg('info')}</button></h3><div class="rate-list">` + G.Gacha.ratesFor(gen).slice().reverse().map(([r, w]) => `
      <div class="rate-row" style="--rc:${G.Gacha.RARITY_COLOR[r]}"><span class="ico-tile s round">${ico(G.Icons.RARITY_BALL[r])}</span>
        <span class="grow"><b>${G.Gacha.RARITY_NAME[r]}</b><small>${G.Gacha.pool(r, gen).length} Pokémon</small></span>
        <b class="rate-pct">${w.toLocaleString(G.I18n.locale)}%</b></div>`).join('') +
      `<div class="rate-row shiny" style="--rc:var(--shiny)"><span class="ico-tile s round">${G.Icons.html('shiny', 24)}</span>
        <span class="grow"><b>Shiny</b></span><b class="rate-pct">1%</b></div></div>
      <p class="gacha-rules">· La tirada ×10 garantiza al menos una Épica.<br>
       · A las ${G.Gacha.PITY_5} tiradas sin Legendaria en un banner, la siguiente lo es.<br>
       · Los repetidos dan Pokémonedas. Los shiny no se repiten.<br>
       · Los tickets se consiguen jugando: algunos Pokémon los sueltan al caer, y
         los jefes y los legendarios de las grietas, a veces, tickets ×10.</p>`;
    rates.classList.toggle('rules-on', rulesOn);
    rates.querySelector('.gr-info').onclick = () => {
      rulesOn = !rulesOn;
      rates.classList.toggle('rules-on', rulesOn);
      rates.querySelector('.gr-info').setAttribute('aria-expanded', String(rulesOn));
    };

    // Botones de tirar: lo que cuesta cada uno, con el ticket de verdad (y lo que falta).
    costs(s);
    const plan = allPlan(s);
    $('pull-all').classList.toggle('hidden', plan.n < 2);
    $('cost-all').innerHTML = `<span class="pb-ico">${ico('ball4')}</span><b>×${plan.n * 10}</b>`;
    // Al final, con todo ya puesto: si el cuerpo se desplaza, su barra estrecha el cartel.
    fitFeat();
    showTab();
    G.UI.refreshCoins();
  }

  /**
   * Los legendarios del cartel, a la medida de su hueco (#gacha-feat, que cambia
   * con la pantalla): cada canvas mide su parte del ancho y todo el alto, y el
   * sprite va a ×2 (píxeles enteros). Si no caben, se solapan un poco en vez de cortarse.
   * En el móvil tumbado el cartel ocupa todo el alto: con sitio, a ×3 (o a ×2 los
   * que no quepan de pie, «hero»).
   */
  const LAND = matchMedia('(max-height: 520px)');
  function fitFeat() {
    const feat = $('gacha-feat'), list = [...feat.children], n = list.length;
    const W = feat.clientWidth, H = feat.clientHeight;
    if (!n || !W || !H) return;
    const k = LAND.matches && H >= 160 ? 3 : 2;
    const cw = Math.min(Math.floor(W / n * 1.5), k === 3 ? 240 : 200);
    const over = n * cw > W ? Math.ceil((n * cw - W) / (2 * n)) : 0;
    for (const cv of list) {
      if (cv.width !== cw) cv.width = cw;
      if (cv.height !== H) cv.height = H;
      cv.style.margin = over ? `0 -${over}px` : '';
      if (+cv.dataset.k !== k) {
        cv.dataset.k = k;
        G.UI.sprite(cv, +cv.dataset.dex, { lively: true, scale: k, dir: +cv.dataset.dir, hero: k === 3 });
      }
    }
  }

  /**
   * La tragaperras (176×170 de arte) a la mayor escala que quepa, entera en
   * píxeles del aparato (así se ve nítida también con pantallas de 1,25 o 2,6x),
   * hasta ×3. Con el móvil tumbado los botones van a su derecha.
   */
  function fitSlot() {
    const fx = $('pull-fx'), slot = $('slot'), ctl = $('pull-ctl');
    if (fx.classList.contains('hidden') || fx.classList.contains('revealed')) return;
    const cs = getComputedStyle(fx), ss = getComputedStyle(fx.querySelector('.pfx-spin'));
    const side = matchMedia('(max-height: 520px)').matches;
    // Lo que ocupa además de la máquina: los dos huecos de la columna (::before y
    // ::after también cuentan) y Rápido / Saltar, a su lado (tumbado) o debajo.
    const gap = parseFloat(cs.rowGap) || 0, inner = parseFloat(side ? ss.columnGap : ss.rowGap) || 0;
    const W = fx.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (side ? inner + ctl.offsetWidth : 0);
    const H = fx.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 2 * gap - (side ? 0 : inner + ctl.offsetHeight);
    const k = Math.min(W / 176, H / 170, 3);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const kd = Math.max(1, Math.floor(k * dpr + 1e-6));
    slot.style.width = 176 * kd / dpr + 'px';
    slot.style.height = 170 * kd / dpr + 'px';
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function pull(n, use = 't1') {
    if (busy) return;
    const res = G.Gacha.pull(G.DB.save, n, gen, use);
    if (!res) { G.Audio.sfx('error'); G.UI.toast('No tienes tickets suficientes: consíguelos jugando'); return; }
    lastPull = { n, use };
    G.Progress.checkAch();
    G.DB.commit(true);
    await reveal(res);
  }

  /*
   * Tirar todos: tiradas ×10 seguidas mientras haya tickets (primero los ×10),
   * como mucho ALL_MAX. Cada una es una ×10 normal (G.Gacha.pull), con su
   * Épica asegurada y su contador de legendaria: no cambia ninguna probabilidad.
   */
  const ALL_MAX = 20;
  function allPlan(s) {
    const t = s.tickets || { t1: 0, t10: 0 };
    const a = Math.min(t.t10, ALL_MAX), b = Math.min(Math.floor(t.t1 / 10), ALL_MAX - a);
    return { a, b, n: a + b };
  }

  async function pullAll() {
    if (busy) return;
    const s = G.DB.save, p = allPlan(s);
    if (p.n < 1) { refresh(); return; }
    busy = true;                         // (mientras pregunta, nada de tirar dos veces)
    const yes = await ask(G.I18n.f('¿Hacer {x} tiradas ×10? Gastarás {x} tickets ×10 y {x} tickets.', p.n, p.a, p.b * 10));
    busy = false;
    if (!yes) return;
    lastPull = null;
    const all = [];
    for (let i = 0; i < p.n; i++) {
      const res = G.Gacha.pull(s, 10, gen, G.Gacha.costOf(s, 10, 't10') ? 't10' : 't1');
      if (!res) break;
      all.push(...res);
    }
    if (!all.length) { refresh(); return; }
    G.Progress.checkAch();
    G.DB.commit(true);
    // Lo nuevo y los shiny primero; luego de más a menos rareza.
    const top = r => (r.isNew ? 2 : 0) + (r.shiny ? 1 : 0);
    all.sort((x, y) => top(y) - top(x) || y.rarity - x.rarity);
    await reveal(all, true);
  }

  /*
   * Cartas del resultado. Cómo se colocan (style.css) y qué lienzo lleva cada una:
   *   one  una sola carta, grande (×3 si el Pokémon cabe)
   *   row  móvil de pie: tumbadas, de dos en dos
   *   low  móvil tumbado: de pie y bajitas, cinco por fila
   *   std  tableta y ordenador: de pie, cinco por fila
   *   xl   pantalla grande: igual, con el Pokémon más holgado
   */
  const CARD_CV = { one: [176, 160], row: [72, 80], low: [84, 72], std: [112, 96], xl: [136, 120] };
  function cardMode(n) {
    if (n === 1) return 'one';
    if (matchMedia('(max-width: 599px) and (min-height: 521px)').matches) return 'row';
    if (matchMedia('(max-height: 520px)').matches) return 'low';
    if (matchMedia('(min-width: 1200px) and (min-height: 860px)').matches) return 'xl';
    return 'std';
  }

  function card(r, mode) {
    const mon = G.DEX_BY[r.dex];
    const [w, h] = CARD_CV[mode];
    const col = r.shiny ? '#9ae6ff' : G.Gacha.RARITY_COLOR[r.rarity];
    const c = document.createElement('div');
    c.className = 'pull-card r' + r.rarity + (r.shiny ? ' shiny' : '') + (r.isNew ? ' is-new' : ' is-dup');
    c.style.setProperty('--rc', col);
    // Escala entera: ×3 en la carta grande si cabe entero; si no, ×2 como todas.
    const m = G.Sprites.animMeta(r.dex, 'Idle');
    const k = mode === 'one' && (m ? m.ay : 24) * 3 <= h * 0.8 ? 3 : 2;
    const stage = document.createElement('div');
    stage.className = 'pc-stage';
    stage.innerHTML = `<span class="pc-ball">${G.Icons.rarity(r.rarity, 30)}</span>`;
    stage.appendChild(G.UI.spriteCanvas(r.dex, w, h, { lively: r.rarity >= 4 || r.shiny, scale: k, shiny: r.shiny }));
    c.appendChild(stage);
    // Nuevo: con qué naturaleza y habilidad te ha tocado (la oculta, en dorado).
    const ab = r.isNew ? G.Mons.abilityOf(r.dex) : null;
    const who = ab ? `<div class="pmon" translate="no">${G.Mons.name(G.Mons.natureOf(r.dex).n)} · <span class="${ab.slot === 2 ? 'gold' : ''}">${G.Mons.abilityName(ab.id)}</span></div>` : '';
    const flag = r.isNew
      ? `<span class="badge ${r.shiny ? 'pc-shiny' : 'gold'} pc-flag">${r.shiny ? '¡SHINY NUEVO!' : '¡NUEVO!'}</span>`
      : `<span class="pc-flag pc-dup"><span>Repetido</span><span class="pc-refund">${ico('coin')}<b>+${r.refund.toLocaleString(G.I18n.locale)}</b></span></span>`;
    c.insertAdjacentHTML('beforeend', `<div class="pc-txt"><b class="pc-name">${r.shiny ? G.Icons.html('shiny', 16) : ''}<span>${mon.name}</span></b>${who}${flag}</div>`);
    return c;
  }

  /**
   * Enseña lo que ha salido: la tragaperras y luego las cartas.
   * many (Tirar todos): la tragaperras sólo con las 10 mejores, cartas sólo de
   * lo nuevo y los shiny y sin esperas; el resumen de arriba cuenta todo.
   */
  async function reveal(res, many = false) {
    busy = true; skipCards = false;
    const best = Math.max(...res.map(r => r.rarity));
    const fx = $('pull-fx'), slot = $('slot'), out = $('pull-results');
    out.innerHTML = '';
    $('pull-close').classList.add('hidden');
    againBtn(false);
    $('pull-sum').classList.add('hidden');
    $('pull-ctl').classList.remove('hidden');
    fastChip();
    fx.classList.remove('revealed');
    fx.classList.remove('hidden');
    fx.scrollTop = 0;
    fitSlot();

    // La tragaperras (ui/slots.js) y luego las cartas.
    await G.Slots.play(slot, many ? res.slice(0, 10) : res);
    G.Audio.sfx('burst', { rarity: best });
    fx.classList.add('revealed');
    $('pull-ctl').classList.add('hidden');
    if (res.length > 1) {
      const dup = res.filter(r => !r.isNew);
      $('pull-sum').innerHTML = `<span class="ps-chip">Nuevos: ${res.length - dup.length} · Repetidos: ${dup.length}</span>` +
        `<span class="ps-chip">${ico('coin')}<b>+${dup.reduce((a, r) => a + r.refund, 0).toLocaleString(G.I18n.locale)}</b></span>`;
      $('pull-sum').classList.remove('hidden');
    }

    const cards = many ? res.filter(r => r.isNew || r.shiny) : res;
    const mode = cardMode(cards.length);
    out.className = 'pfx-grid ' + mode + (cards.length === 10 ? ' ten' : '');
    for (const r of cards) {
      out.appendChild(card(r, mode));
      if (many || skipCards) continue;        // de golpe: un solo sonido al final
      G.Audio.sfx('reveal', { rarity: r.rarity });
      await wait(res.length === 10 ? 150 : 0);
    }
    if ((many || skipCards) && cards.length) G.Audio.sfx('reveal', { rarity: Math.max(...cards.map(r => r.rarity)) });
    $('pull-close').classList.remove('hidden');
    againBtn(!many);
    busy = false;
    // Con teclado, Intro sigue; el mando ya empieza en «Continuar» (botón dorado).
    try { $('pull-close').focus({ preventScroll: true }); } catch (e) { /* nada */ }
  }

  function skip() { skipCards = true; G.Slots.skip(); }

  function fastChip() { $('pull-fast').classList.toggle('on', G.Slots.fast); }

  function close() {
    const fx = $('pull-fx');
    fx.classList.add('hidden');
    fx.classList.remove('revealed');
    // Fuera las cartas: así sus sprites dejan de animarse.
    $('pull-results').innerHTML = '';
    refresh();
  }

  return { init, open, get open_() { return !$('pull-fx').classList.contains('hidden'); } };
})();
