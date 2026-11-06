const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');
const dictionaries = [...source('dev.html').matchAll(/src="(js\/data\/lang-[^"]+\.js)"/g)].map(m => m[1]);
function boot(saved = null, nav = 'en-US', pathname = '/', blocked = false, seed = {}) {
  const storage = { 'ps.lang': saved, ...seed }, calls = [], dicts = {}, written = [];
  class Canvas {
    constructor() { this.font = '16px Pixelify,sans-serif'; }
    get font() { return this._font; }
    set font(v) { this._font = v; }
    fillText(s) { calls.push([s, this.font]); }
    strokeText(s) { calls.push([s, this.font]); }
    measureText(s) { calls.push([s, this.font]); return { width: s.length }; }
  }
  const ctx = { G: {}, navigator: { language: nav, languages: [nav] },
    location: { pathname, reload: () => calls.push('reload') },
    localStorage: { getItem: k => { if (blocked) throw Error('blocked'); return storage[k]; }, setItem: (k, v) => { storage[k] = v; },
      removeItem: k => { if (blocked) throw Error('blocked'); delete storage[k]; } },
    document: { documentElement: {}, write: html => written.push(html) }, CanvasRenderingContext2D: Canvas,
    confirm: s => { calls.push(s); return true; }, alert: s => calls.push(s), console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const load = f => vm.runInContext(source(f), ctx, { filename: f });
  load('js/core/locales.js');
  load('js/core/i18n.js');
  const add = ctx.G.I18n.add;
  ctx.G.I18n.add = (d, l = 'en') => {
    dicts[l] = { ...dicts[l], ...d };
    add(d, l);
  };
  dictionaries.forEach(load);
  return { ctx, G: ctx.G, storage, calls, dicts, Canvas, load, written };
}
const langs = ['es', 'en'];
const removed = ['fr', 'it', 'pt-BR', 'zh-Hans', 'zh-Hant'];
const save = ['Guardar', 'Save'];
for (const [i, lang] of langs.entries()) {
  test(`${lang}: isolated dictionary, templates, loading locale, canvas, new save notice`, () => {
    const b = boot(lang), I = b.G.I18n;
    assert.equal(I.lang, lang); assert.equal(b.ctx.document.documentElement.lang, lang);
    assert.equal(b.G.T('Guardar'), save[i]);
    assert.equal(I.f('Se guarda en la nube en {x} s.', 17).includes('17'), true);
    assert.equal(b.written.length, 0);
    const c = new b.Canvas(); c.fillText('Guardar');
    assert.equal(b.calls.at(-1)[0], save[i]);
    assert.equal(c.font, '16px Pixelify,sans-serif');
    I.rawCanvas(c, 'fillText', 'Pikachu'); assert.equal(b.calls.at(-1)[0], 'Pikachu');
    assert.ok(b.G.T('Solicitud enviada a Pikachu').includes('Pikachu'));
    assert.ok(I.f('Esperando a {x}…', 'Pikachu').includes('Pikachu'));
    const nodes = {};
    const node = id => nodes[id] ||= { children: [], classList: { add() {}, remove() {} }, attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; }, replaceChildren() { this.children = []; }, appendChild(n) { this.children.push(n); } };
    b.G.UI = { $: node }; b.G.DB = { mode: 'cloud', guest: false, save: { stats: {} } };
    b.ctx.document.createElement = () => ({});
    b.load('js/ui/login.js');
    assert.equal(b.G.LoginUI.updateNotices(), true);
    // El aviso del guardado (ps.savenote.3, 26-10-2026: ya se guarda solo; Guardar queda en Ajustes),
    // entero y con sus negritas, en el idioma del jugador.
    const body = node('savenote-body');
    const TITLE = ['Tu partida ya se guarda sola', 'Your game now saves itself'];
    const enBody = body.innerHTML.includes('You no longer need to press Save');
    assert.equal(enBody, lang === 'en');
    assert.ok(body.innerHTML.includes('class="gold">' + save[i] + '<') && !/\b10\b/.test(body.innerHTML));
    assert.equal((body.innerHTML.match(/<b[ >]/g) || []).length, 3);
    assert.equal(node('savenote-title').textContent, TITLE[i]);
    assert.equal(node('savenote-ok').textContent, lang === 'es' ? 'Entendido' : 'Got it');
    assert.equal(b.G.LoginUI.updateNotices(), false);
    b.G.DB.save.stats.runs = 1;
    assert.equal(b.G.LoginUI.updateNotices(), true);
    assert.ok(/rankings|leaderboards/.test(b.G.T(node('savenote-title').textContent)));
    assert.equal((node('savenote-body').innerHTML.match(/<p>/g) || []).length, 2);
    assert.equal(b.G.LoginUI.updateNotices(), false);
  });
}
test('every changelog line has Spanish and English', () => {
  const { G, load } = boot('es');
  load('js/data/changelog.js');
  for (const entry of G.CHANGELOG) {
    for (const pair of [entry.title, ...(entry.new || []), ...(entry.chg || []), ...(entry.fix || [])]) {
      assert.equal(pair.length, 2, entry.d);
      assert.ok(pair[0] && pair[1], entry.d);
    }
  }
});
test('only Spanish and English remain', () => {
  const { G } = boot('es');
  assert.deepEqual([...G.I18n.choices.map(([id]) => id)], langs);
  assert.deepEqual(dictionaries, ['js/data/lang-en.js']);
  assert.equal(fs.existsSync(path.join(root, 'js', 'lang')), false);
  assert.deepEqual(fs.readdirSync(path.join(root, 'js', 'data')).filter(f => f.startsWith('lang-')), ['lang-en.js']);
});
test('a removed language falls back to Spanish or English and keeps the save', () => {
  for (const old of removed) {
    for (const [nav, expected] of [['es-ES', 'es'], ['es-MX', 'es'], ['es', 'es'], ['en-US', 'en'], [old, 'en'], ['ja-JP', 'en']]) {
      const b = boot(old, nav, '/', false, { 'ps.cloud.fake': '{"coins":42}', 'ps.run': 'x' });
      assert.equal(b.G.I18n.lang, expected, `${old} ${nav}`);
      assert.equal(b.ctx.document.documentElement.lang, expected);
      assert.equal(b.G.I18n.locale, expected === 'es' ? 'es-ES' : 'en-GB');
      assert.equal(b.written.length, 0);
      assert.equal(b.G.T('Guardar'), expected === 'es' ? 'Guardar' : 'Save');
      // Se olvida sólo el ajuste del idioma: lo demás, igual.
      assert.equal('ps.lang' in b.storage, false);
      assert.equal(b.storage['ps.cloud.fake'], '{"coins":42}');
      assert.equal(b.storage['ps.run'], 'x');
    }
    // Con la dirección /en/ manda esa, como sin nada guardado.
    assert.equal(boot(old, 'es-ES', '/en/').G.I18n.lang, 'en');
    // Almacenamiento bloqueado: sin errores.
    assert.equal(boot(old, 'es-ES', '/', true).G.I18n.lang, 'es');
    // La pantalla de carga tampoco se queda sin texto.
    const b = boot(old, 'fr-FR'), paragraphs = [{}, {}];
    b.ctx.document.querySelector = () => ({});
    b.ctx.document.querySelectorAll = () => paragraphs;
    b.load('js/boot.js');
    assert.equal(paragraphs[1].textContent, 'Loading…');
  }
});
test('names per language keep only Spanish and English', () => {
  const b = boot('en');
  b.load('js/data/abilities.js'); b.load('js/data/natures.js'); b.load('js/data/evolutions.js'); b.load('js/systems/mons.js');
  for (const n of [...Object.values(b.G.ABIL), ...b.G.NATURES.map(x => x.n), ...Object.values(b.G.EVO_ITEM)]) {
    assert.equal(n.length, 2, n[0]);
    assert.ok(n[0] && n[1], n[0]);
  }
  assert.equal(b.G.Mons.name(['Uno', 'One']), 'One');
  const es = boot('es'); es.load('js/systems/mons.js');
  assert.equal(es.G.Mons.name(['Uno', 'One']), 'Uno');
});
test('locale precedence, aliases and blocked storage', () => {
  for (const [input, expected] of [['es-ES', 'es'], ['es-MX', 'es'], ['es', 'es'], ['en-GB', 'en'], ['en', 'en'],
    ['fr-CA', 'en'], ['it-IT', 'en'], ['pt-BR', 'en'], ['zh-CN', 'en'], ['zh-TW', 'en'], ['ja-JP', 'en']]) {
    assert.equal(boot(null, input).G.I18n.lang, expected, input);
  }
  assert.equal(boot('es', 'fr-FR', '/en/').G.I18n.lang, 'es');
  assert.equal(boot('unknown', 'fr-FR', '/en/').G.I18n.lang, 'en');
  assert.equal(boot(null, 'fr-FR', '/', true).G.I18n.lang, 'en');
  assert.equal(boot(null, 'es-MX').G.I18n.lang, 'es');
});
test('switching language writes only the preference and validates input', () => {
  const b = boot('es'); b.storage['ps.cloud.fake'] = '{"coins":42}';
  b.G.I18n.set('invalid'); assert.equal(b.storage['ps.lang'], 'es');
  b.G.I18n.set('fr'); assert.equal(b.storage['ps.lang'], 'es');
  assert.deepEqual(b.calls, []);
  b.G.I18n.set('en'); assert.equal(b.storage['ps.lang'], 'en');
  assert.equal(b.storage['ps.cloud.fake'], '{"coins":42}'); assert.deepEqual(b.calls, ['reload']);
});
test('specific templates and later overrides beat generic patterns', () => {
  const { G } = boot('en');
  G.I18n.add({ 'Hola {x}': 'Old {x}', '{x}).': '{x}!' }, 'en');
  G.I18n.add({ 'Hola {x}': 'New {x}', 'El resultado ({x}).': 'Result: {x}' }, 'en');
  assert.equal(G.T('Hola 5'), 'New 5');
  assert.equal(G.T('El resultado (42).'), 'Result: 42');
});


test('external boot follows the shared locale without inline executable scripts', () => {
  const html = source('dev.html');
  assert.ok(html.indexOf('src="js/core/locales.js"') < html.indexOf('src="js/boot.js"'));
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    assert.ok(/src=/.test(match[1]) || /application\/ld\+json/.test(match[1]), 'Executable inline script');
  }
  assert.ok(html.includes("script-src 'self'"));
  for (const lang of langs) {
    const b = boot(lang), paragraphs = [{}, {}];
    b.ctx.document.querySelector = () => ({});
    b.ctx.document.querySelectorAll = () => paragraphs;
    b.load('js/boot.js');
    assert.equal(b.ctx.PS_PAGES, true);
    assert.equal(b.ctx.document.documentElement.lang, lang);
    assert.ok(paragraphs.every(p => typeof p.textContent === 'string' && p.textContent.length));
    if (lang !== 'es') assert.notEqual(paragraphs[1].textContent, 'Cargando…');
  }
});
