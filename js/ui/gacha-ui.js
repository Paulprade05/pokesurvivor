/* ============ gacha-ui.js — banners por generación y animación de tirada ============
 * La lógica (probabilidades, pity, shiny, repetidos) está en systems/gacha.js.
 */
G.GachaUI = (() => {
  const $ = G.UI.$;
  let busy = false;
  let gen = 1;
  let skipCards = false;        // Saltar: las cartas que falten salen de golpe

  function init() {
    $('pull-1').onclick = () => pull(1);
    $('pull-10').onclick = () => pull(10, 't1');
    $('pull-10b').onclick = () => pull(10, 't10');
    $('pull-close').onclick = close;
    // Tirar todos, y en la tirada: modo rápido (se recuerda), Saltar y el resumen.
    $('pull-10b').insertAdjacentHTML('afterend',
      '<button id="pull-all" class="btn gold grow hidden" data-sfx="none">Tirar todos · <span id="cost-all"></span></button>');
    $('pull-all').onclick = pullAll;
    $('slot').insertAdjacentHTML('afterend', `<div class="pull-ctl hidden" id="pull-ctl">
      <button class="chip" id="pull-fast" type="button">${G.Icons.html('boot', 12)} Rápido</button>
      <button class="btn small" id="pull-skip" type="button">Saltar</button></div>`);
    $('pull-results').insertAdjacentHTML('beforebegin', '<p class="pull-sum hidden" id="pull-sum"></p>');
    $('pull-fast').onclick = () => { G.Slots.setFast(!G.Slots.fast); fastChip(); };
    $('pull-skip').onclick = () => { skipCards = true; G.Slots.skip(); };
    $('slot').addEventListener('click', () => { if (busy) { G.Slots.setFast(true); fastChip(); } });

    const tabs = $('gacha-gens');
    G.Gacha.BANNERS.forEach(b => {
      const t = document.createElement('button');
      t.className = 'gen-tab';
      t.dataset.gen = b.gen;
      t.innerHTML = `<b>${b.name}</b><small>Gen ${b.gen}</small>`;
      t.onclick = () => { gen = b.gen; refresh(); };
      tabs.appendChild(t);
    });
  }

  function open() {
    G.UI.show('scr-gacha', true);
    refresh();
  }

  function refresh() {
    const s = G.DB.save;
    const banner = G.Gacha.BANNERS[gen - 1];
    document.querySelectorAll('#gacha-gens .gen-tab').forEach(t => t.classList.toggle('on', +t.dataset.gen === gen));

    const all = G.DEX.filter(p => p.gen === gen);
    const owned = all.filter(p => s.owned[p.dex]).length;
    const shinies = all.filter(p => s.shiny && s.shiny[p.dex]).length;
    const [c1, c2, c3] = banner.color;
    $('banner').style.background =
      `radial-gradient(circle at 80% 30%, rgba(255,210,63,.3), transparent 45%),
       radial-gradient(circle at 15% 80%, rgba(196,123,255,.3), transparent 50%),
       linear-gradient(135deg, ${c1}, ${c2} 55%, ${c3})`;
    $('banner-title').textContent = banner.name + ' Misterioso';
    $('banner-desc').textContent = `Los ${all.length} Pokémon de la generación ${gen}. ¡Los legendarios esperan!`;
    $('gacha-owned').innerHTML = `Tienes ${owned} de ${all.length}` +
      (shinies ? ` · ${G.Icons.html('shiny', 12)} ${shinies} shiny` : '');

    const feat = $('gacha-feat');
    feat.innerHTML = '';
    for (const dex of G.Gacha.featured(gen)) {
      feat.appendChild(G.UI.spriteCanvas(dex, 170, 190, { lively: true, scale: 2, dir: 1 }));
    }

    const pity = (s.pity && s.pity[gen]) || 0;
    $('gacha-pity').textContent = `Tiradas sin legendaria en ${banner.name}: ${pity} / ${G.Gacha.PITY_5}`;

    $('gacha-rates').innerHTML = '<h3>Probabilidades</h3>' + G.Gacha.RATES.slice().reverse().map(([r, w]) => `
      <div><span style="color:${G.Gacha.RARITY_COLOR[r]}">${G.UI.stars(r, 10)} ${G.Gacha.RARITY_NAME[r]}</span>
      <span>${w}% · ${G.Gacha.pool(r, gen).length}</span></div>`).join('') +
      `<div><span>${G.Icons.html('shiny', 12)} Shiny</span><span>1%</span></div>
       <p class="note">· La tirada ×10 garantiza al menos una Épica.<br>
       · A las ${G.Gacha.PITY_5} tiradas sin Legendaria en un banner, la siguiente lo es.<br>
       · Los repetidos dan Pokémonedas. Los shiny no se repiten.<br>
       · Los tickets se consiguen jugando: algunos Pokémon los sueltan al caer, y
         los jefes y los legendarios de las grietas, a veces, tickets ×10.</p>`;

    const t = s.tickets;
    $('cost-1').innerHTML = `${G.Icons.html('ticket', 18)} 1`;
    $('cost-10').innerHTML = `${G.Icons.html('ticket', 18)} 10`;
    $('cost-10b').innerHTML = `${G.Icons.html('ticket10', 18)} 1`;
    $('gacha-tickets').innerHTML = `Tienes ${G.Icons.html('ticket', 18)} <b>${t.t1}</b> tickets y ${G.Icons.html('ticket10', 18)} <b>${t.t10}</b> tickets ×10`;
    $('pull-1').disabled = !G.Gacha.costOf(s, 1);
    $('pull-10').disabled = !G.Gacha.costOf(s, 10, 't1');
    $('pull-10b').disabled = !G.Gacha.costOf(s, 10, 't10');
    const plan = allPlan(s);
    $('pull-all').classList.toggle('hidden', plan.n < 2);
    $('cost-all').textContent = '×' + plan.n * 10;
    G.UI.refreshCoins();
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function pull(n, use = 't1') {
    if (busy) return;
    const res = G.Gacha.pull(G.DB.save, n, gen, use);
    if (!res) { G.Audio.sfx('error'); G.UI.toast('No tienes tickets suficientes: consíguelos jugando'); return; }
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
    if (!confirm(`¿Hacer ${p.n} tiradas ×10? Gastarás ${p.a} tickets ×10 y ${p.b * 10} tickets.`)) return;
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
    $('pull-sum').classList.add('hidden');
    $('pull-ctl').classList.remove('hidden');
    fastChip();
    slot.style.display = '';
    fx.classList.remove('hidden');

    // La tragaperras (ui/slots.js) y luego las cartas.
    await G.Slots.play(slot, many ? res.slice(0, 10) : res);
    G.Audio.sfx('burst', { rarity: best });
    slot.style.display = 'none';
    if (res.length > 1) {
      const dup = res.filter(r => !r.isNew);
      $('pull-sum').innerHTML = `<span>Nuevos: ${res.length - dup.length} · Repetidos: ${dup.length}</span>
        · <span class="coin"></span> +${dup.reduce((a, r) => a + r.refund, 0).toLocaleString(G.I18n.locale)}`;
      $('pull-sum').classList.remove('hidden');
    }

    const cards = many ? res.filter(r => r.isNew || r.shiny) : res;
    for (const r of cards) {
      const mon = G.DEX_BY[r.dex];
      const c = document.createElement('div');
      c.className = 'pcard r' + r.rarity + (r.shiny ? ' shiny' : '');
      c.style.setProperty('--rc', r.shiny ? '#9ae6ff' : G.Gacha.RARITY_COLOR[r.rarity]);
      c.innerHTML = `<div class="stars">${G.UI.stars(r.rarity, 24)}</div>`;
      c.appendChild(G.UI.spriteCanvas(r.dex, 132, 120, { lively: r.rarity >= 4 || r.shiny, scale: 2, shiny: r.shiny }));
      const tag = r.isNew
        ? `<span class="new">${r.shiny ? '¡SHINY NUEVO!' : '¡NUEVO!'}</span>`
        : `Repetido · <span class="coin"></span> +${r.refund}`;
      // Nuevo: con qué naturaleza y habilidad te ha tocado (la oculta, en dorado).
      const ab = r.isNew ? G.Mons.abilityOf(r.dex) : null;
      const who = ab ? `<div class="pmon" translate="no">${G.Mons.name(G.Mons.natureOf(r.dex).n)} · <span class="${ab.slot === 2 ? 'gold' : ''}">${G.Mons.abilityName(ab.id)}</span></div>` : '';
      c.insertAdjacentHTML('beforeend', `<b>${r.shiny ? G.Icons.html('shiny', 12) + ' ' : ''}${mon.name}</b>${who}<div class="tag">${tag}</div>`);
      out.appendChild(c);
      if (many || skipCards) continue;        // de golpe: un solo sonido al final
      G.Audio.sfx('reveal', { rarity: r.rarity });
      await wait(res.length === 10 ? 150 : 0);
    }
    if ((many || skipCards) && cards.length) G.Audio.sfx('reveal', { rarity: Math.max(...cards.map(r => r.rarity)) });
    $('pull-ctl').classList.add('hidden');
    $('pull-close').classList.remove('hidden');
    busy = false;
  }

  function fastChip() { $('pull-fast').classList.toggle('on', G.Slots.fast); }

  function close() {
    $('pull-fx').classList.add('hidden');
    refresh();
  }

  return { init, open, get open_() { return !$('pull-fx').classList.contains('hidden'); } };
})();
