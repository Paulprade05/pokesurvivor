/* ============ items.js — objetos equipables de la partida ============
 * Se encuentran en los cofres (a veces en los normales, a menudo en los grandes) y los sueltan los jefes.
 * (21-11-2026, «objetos-rareza», lo pidió el dueño.) Ahora:
 *   - 26 objetos, cada uno con su forma de jugar (no sólo «+X % de lo mismo»).
 *   - Rareza: común, raro, épico y legendario (RAR). Sube sus números (k) y desde épico da un efecto
 *     extra (ex). El legendario sale poco (W: 3 %; de jefes y cofres grandes, 7 %).
 *   - Un hueco; el segundo se abre al tener los 4 movimientos fusionados (player.js itemSlots).
 *   - Evolución: tras EVO_T s de partida llevando ESE objeto, evoluciona: sus números ×EVO_K y gana una
 *     pasiva propia (p / pt), también según su rareza. El tiempo es de cada objeto: si lo cambias por
 *     otro, lo dejas y su progreso se pierde (el nuevo empieza de cero).
 *   - Todo lo de los objetos se suma y tiene topes (CAP, DMG_CAP): con dos legendarios evolucionados
 *     el daño de los objetos no pasa de ×2.
 *
 * En el suelo y por la red un objeto es una clave 'id:r' (r = rareza 0-3; sin ':r', común).
 * Cada objeto:
 *   st    stats que suben con la rareza (y ×EVO_K al evolucionar)        (claves de STAT_T)
 *   neg   stats en contra, fijos (no suben con la rareza)
 *   ex    extra desde épico (×1 épico, ×1,5 legendario)
 *   x/xt  números de su efecto especial y sus textos ({x} en el orden de las claves)
 *   p/pt  pasiva del evolucionado y sus textos; pst: stats que da además el evolucionado
 *   out(pl, m, e, type, v)  × al daño (combat.js), con v = vals de ese objeto
 *   drop  'neg' si el evolucionado quita lo que tenía en contra
 * Claves que empiezan por 'cd' son segundos: bajan con la rareza. pow: «golpes» (como las habilidades).
 */
G.Items = (() => {
  const RAR = [
    { name: 'Común', col: '#c9d1d9', k: 0.85 },
    { name: 'Raro', col: '#5aa9ff', k: 1.1 },
    { name: 'Épico', col: '#b77bff', k: 1.35 },
    { name: 'Legendario', col: '#ffb23f', k: 1.65 }
  ];
  const W = [55, 30, 12, 3], W_LUCK = [30, 40, 23, 7];
  const EVO_T = 600, EVO_K = 1.6, EX_K = [0, 0, 1, 1.5];
  // Topes de la suma de todos los objetos (fracciones). spd puede bajar (Brazal Firme) hasta SPD_MIN.
  const CAP = { atk: 0.9, cd: 0.4, spd: 0.6, red: 0.35, regen: 0.035, xp: 1.2, coin: 1.5, crit: 0.25, critD: 0.6,
                hp: 0.6, magnet: 1, heal: 1, dodge: 0.25 };
  const SPD_MIN = -0.3, DMG_CAP = 2;
  const STAT_T = {
    atk: '+{x} % de daño.', cd: '-{x} % de recarga en todos tus movimientos.', spd: '+{x} % de velocidad.',
    red: '-{x} % de daño recibido.', regen: 'Recuperas un {x} % de tu vida por segundo.', xp: '+{x} % de experiencia.',
    coin: '+{x} % de Pokémonedas al acabar la partida.', crit: '+{x} % de probabilidad de crítico.',
    critD: '+{x} % de daño de los críticos.', hp: '+{x} % de vida máxima.', magnet: '+{x} % de radio de recogida.',
    heal: 'Las curas te curan un {x} % más.', dodge: 'Esquivas el {x} % de los golpes.'
  };
  const SPD_NEG = '-{x} % de velocidad.';

  const half = pl => pl.hp < pl.maxHp / 2;
  const now = () => (G.Game && G.Game.st ? G.Game.st.time || 0 : 0);
  const canEvolve = pl => !!(G.Evo && G.Evo.options && pl.evo && G.Evo.options(pl).length);

  const LIST = [
    { id: 'leftovers', name: 'Restos', evo: 'Restos Eternos', st: { regen: 0.015 }, ex: { hp: 0.06 },
      pt: ['Con menos del 30 % de vida, la regeneración de tus objetos se triplica.'] },
    { id: 'choiceband', name: 'Cinta Elección', evo: 'Cinta Campeona', st: { atk: 0.4 }, ex: { crit: 0.04 },
      xt: [['No puedes cambiar de movimiento.']], pst: { critD: 0.25 },
      pt: ['Ya no te ata a un movimiento.'] },
    { id: 'quickclaw', name: 'Garra Rápida', evo: 'Garra Relámpago', st: { cd: 0.2 }, ex: { spd: 0.06 },
      p: { cdNow: 10 }, pt: [['Cada {x} s, el movimiento que llevas se recarga al instante.', 'cdNow']] },
    { id: 'focussash', name: 'Banda Focus', evo: 'Banda Coraje', x: { cdSash: 60 }, ex: { red: 0.05 },
      xt: [['Un golpe que te dejaría KO te deja con 1 de vida (cada {x} s).', 'cdSash']],
      p: { heal: 0.25, pow: 4 }, pt: [['Al salvarte, recuperas un {x} % de vida y lanzas una onda que daña y empuja.', 'heal']] },
    { id: 'shellbell', name: 'Cascabel Concha', evo: 'Campana Marina', x: { steal: 0.04 }, ex: { regen: 0.003 },
      xt: [['Recuperas un {x} % del daño que haces (con un tope por segundo).', 'steal']],
      p: { pow: 2 }, pt: ['Cada 6 s, una onda de agua daña a tu alrededor y te cura con lo que hace.'] },
    { id: 'amuletcoin', name: 'Moneda Amuleto', evo: 'Moneda Áurea', st: { coin: 0.5 }, ex: { magnet: 0.15 },
      pst: { xp: 0.2 }, pt: ['Brilla tanto que también te da experiencia de más.'] },
    { id: 'luckyegg', name: 'Huevo Suerte', evo: 'Huevo Dorado', st: { xp: 0.3 }, ex: { magnet: 0.2 },
      p: { cdXp: 120 }, pt: [['Cada {x} s, ganas de golpe la experiencia de medio nivel.', 'cdXp']] },
    { id: 'lifeorb', name: 'Vidasfera', evo: 'Vidasfera Pura', st: { atk: 0.3 }, ex: { crit: 0.04 },
      xt: [['Cada ataque te quita un poco de vida.']], p: { boss: 0.15 },
      pt: [['Ya no te quita vida y haces un +{x} % de daño a jefes y legendarios.', 'boss']],
      out: (pl, m, e, type, v) => (v.evo && e && e.boss ? 1 + v.p.boss : 1) },
    { id: 'choicescarf', name: 'Pañuelo Elección', evo: 'Pañuelo Ventisca', st: { spd: 0.35 }, ex: { cd: 0.06 },
      p: { slow: 0.4 }, pt: [['Al correr dejas una estela helada que frena un {x} % a los enemigos.', 'slow']] },
    { id: 'rockyhelmet', name: 'Casco Dentado', evo: 'Casco Púas', x: { thorn: 1 }, ex: { red: 0.05 },
      xt: [['Los que te golpean cuerpo a cuerpo reciben daño.']],
      p: { pow: 3 }, pt: ['Cada golpe que recibes suelta una onda de púas a tu alrededor (como mucho cada 2 s).'] },
    { id: 'assaultvest', name: 'Chaleco Asalto', evo: 'Chaleco Titán', st: { red: 0.2 }, ex: { hp: 0.08 },
      pt: ['Lo que pasa del 15 % de tu vida en un solo golpe se reduce a la mitad.'] },
    // ---- nuevos (21-11-2026) ----
    { id: 'brightpowder', name: 'Polvo Brillo', evo: 'Polvo Estelar', st: { dodge: 0.08 }, ex: { spd: 0.06 },
      p: { slow: 0.6 }, pt: [['Al esquivar, deslumbras a los enemigos cercanos: quedan frenados un {x} % 2 s.', 'slow']] },
    { id: 'liechiberry', name: 'Baya Lichi', evo: 'Baya Lichi Madura', x: { low: 0.35 }, ex: { red: 0.05 },
      xt: [['Con menos de la mitad de vida, +{x} % de daño.', 'low']],
      p: { heal: 0.2 }, pt: [['Cada minuto, la primera vez que bajas de la mitad de vida recuperas un {x} %.', 'heal']],
      out: (pl, m, e, type, v) => (half(pl) ? 1 + v.x.low : 1) },
    { id: 'oranberry', name: 'Baya Aranja', evo: 'Baya Aranja Gigante', x: { heal: 0.25, cdBerry: 50 }, ex: { regen: 0.003 },
      xt: [['Al bajar del 35 % de vida, recuperas un {x} % (se recarga en {x} s).', 'heal', 'cdBerry']],
      p: { shield: 0.2 }, pt: [['Al comértela, también ganas una barrera del {x} % de tu vida.', 'shield']] },
    { id: 'metalcoat', name: 'Revestimiento Metálico', evo: 'Coraza de Acero', st: { hp: 0.15 }, ex: { red: 0.05 },
      p: { shield: 0.12 }, pt: [['Cada 12 s ganas una barrera del {x} % de tu vida.', 'shield']] },
    { id: 'eviolite', name: 'Mineral Evolutivo', evo: 'Mineral Eterno', st: { red: 0.15, atk: 0.1 }, ex: { hp: 0.08 },
      xt: [['Entero mientras tu Pokémon aún pueda evolucionar; si no, la mitad.']],
      pt: ['Su efecto ya es entero aunque tu Pokémon no pueda evolucionar más.'],
      half: (pl, it) => !it.evo && !canEvolve(pl) },
    { id: 'toxicorb', name: 'Toxisfera', evo: 'Toxisfera Negra', x: { psn: 0.15, vsP: 0.15 }, ex: { crit: 0.03 },
      xt: [['Tus golpes envenenan un {x} % de las veces.', 'psn'], ['+{x} % de daño a los enemigos envenenados.', 'vsP']],
      pt: ['Cada 4 s, una nube tóxica envenena a los enemigos cercanos.'],
      out: (pl, m, e, type, v) => (e && e.poison > 0 ? 1 + v.x.vsP : 1) },
    { id: 'soothebell', name: 'Cascabel Alivio', evo: 'Campana Serena', st: { heal: 0.35 }, ex: { regen: 0.003 },
      p: { cap: 0.2 }, pt: [['La curación que te sobra se guarda como barrera (hasta el {x} % de tu vida).', 'cap']] },
    { id: 'whiteherb', name: 'Hierba Blanca', evo: 'Hierba Pura', st: { spd: 0.08 }, ex: { cd: 0.05 },
      xt: [['No te frenan las trampas pegajosas, el agua ni el hielo.']],
      p: { spd: 0.3 }, pt: [['Al recibir un golpe, +{x} % de velocidad durante 3 s.', 'spd']] },
    { id: 'airballoon', name: 'Globo Helio', evo: 'Globo Aerostático', st: { spd: 0.1 }, ex: { dodge: 0.04 },
      xt: [['Flotas sobre el agua y la lava.']],
      p: { pow: 3 }, pt: ['Cada 10 s caes en picado: una onda daña y empuja a tu alrededor.'] },
    { id: 'souldew', name: 'Rocío Bondad', evo: 'Rocío Eterno', x: { stab: 0.2 }, ex: { critD: 0.15 },
      xt: [['+{x} % de daño con movimientos de tus tipos.', 'stab']],
      p: { crit: 0.1 }, pt: [['Los movimientos de tus tipos tienen un +{x} % de probabilidad de crítico.', 'crit']],
      out: (pl, m, e, type, v) => ((type || (m && m.type)) && pl.mon && pl.mon.types.includes(type || m.type) ? 1 + v.x.stab : 1) },
    { id: 'weaknesspolicy', name: 'Seguro Debilidad', evo: 'Póliza Total', x: { buff: 0.25 }, ex: { red: 0.05 },
      xt: [['Al recibir un golpe súper eficaz, +{x} % de daño durante 10 s (se acumula 2 veces).', 'buff']],
      pt: ['También lo activa cualquier golpe fuerte (el 10 % de tu vida o más).'] },
    { id: 'snowball', name: 'Bola de Nieve', evo: 'Alud', x: { slow: 0.5 }, ex: { red: 0.05 },
      xt: [['Quien te golpea cuerpo a cuerpo queda frenado un {x} % 2 s.', 'slow']],
      p: { slow: 0.8 }, pt: [['Cada 8 s, una ventisca frena un {x} % a los enemigos cercanos 2 s.', 'slow']] },
    { id: 'stickybarb', name: 'Toxiestrella', evo: 'Púas Malditas', x: { pow: 0.6 }, ex: { red: 0.05 },
      xt: [['Cada segundo, daña a los enemigos pegados a ti.']],
      pt: ['Su aura es un 50 % más grande y envenena.'] },
    { id: 'machobrace', name: 'Brazal Firme', evo: 'Brazal Campeón', st: { xp: 0.6 }, neg: { spd: -0.12 }, ex: { coin: 0.2 },
      drop: 'neg', pst: { atk: 0.1 }, pt: ['Ya no te frena.'] },
    { id: 'expertbelt', name: 'Cinta Experto', evo: 'Cinturón Maestro', x: { sup: 0.25 }, ex: { critD: 0.15 },
      xt: [['+{x} % de daño con golpes súper eficaces.', 'sup']],
      pt: ['Tus golpes poco eficaces pegan como neutros.'],
      out: (pl, m, e, type, v) => {
        if (!e || !type || !e.types) return 1;
        const tk = G.Types.mult(type, e.types);
        if (tk > 1) return 1 + v.x.sup;
        return v.evo && tk > 0 && tk < 1 ? Math.min(2, 1 / tk) : 1;
      } }
  ];
  const BY = {};
  for (const it of LIST) BY[it.id] = it;

  // ---------------- claves, rareza y números ----------------
  const key = (id, r = 0) => id + ':' + (r | 0);
  /** 'id:r' (o un id suelto, de una versión de antes) → { id, r } (null si no existe). */
  function parse(k) {
    if (!k || typeof k !== 'string') return null;
    const [id, r] = k.split(':');
    if (!BY[id]) return null;
    return { id, r: G.U.clamp((r | 0), 0, 3) };
  }
  function rollRarity(luck = 0) {
    const w = luck ? W_LUCK : W;
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return i;
    return 0;
  }
  /** Uno al azar, como clave 'id:r'. luck: 1 en jefes y cofres grandes (mejores rarezas). */
  function roll(luck = 0) { return key(G.U.pick(LIST).id, rollRarity(luck)); }

  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  /** Los números de un objeto con su rareza r, evolucionado o no. */
  function vals(id, r = 0, evo = false) {
    const d = BY[id], k = RAR[r].k, e = evo ? EVO_K : 1, v = { id, r, evo, st: {}, x: {}, p: {} };
    for (const s in d.st || {}) add(v.st, s, d.st[s] * k * e);
    if (!(evo && d.drop === 'neg')) for (const s in d.neg || {}) add(v.st, s, d.neg[s]);
    if (EX_K[r]) for (const s in d.ex || {}) add(v.st, s, d.ex[s] * EX_K[r] * e);
    if (evo) for (const s in d.pst || {}) add(v.st, s, d.pst[s] * k);
    for (const s in d.x || {}) v.x[s] = /^cd/.test(s) ? d.x[s] / (k * (evo ? 1.25 : 1)) : d.x[s] * k * e;
    if (v.x.slow) v.x.slow = Math.min(0.85, v.x.slow);
    if (v.x.psn) v.x.psn = Math.min(0.6, v.x.psn);
    for (const s in d.p || {}) v.p[s] = /^cd/.test(s) ? d.p[s] / k : d.p[s] * k;
    if (v.p.slow) v.p.slow = Math.min(0.85, v.p.slow);
    return v;
  }
  /** Los números de un objeto que llevas (se guardan en it.v y se rehacen al evolucionar). */
  const V = it => it.v || (it.v = vals(it.id, it.r, it.evo));

  // ---------------- textos (en español; lang-en.js traduce cada frase con su patrón) ----------------
  const num = n => {
    const s = n >= 10 || Number.isInteger(n) ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
    return G.I18n && G.I18n.lang === 'es' ? s.replace('.', ',') : s;
  };
  const show = (k, n) => (/^cd/.test(k) ? num(n) : num(n * 100));
  function fill(t, o) {
    if (typeof t === 'string') return t;
    let i = 1;
    return t[0].replace(/\{x\}/g, () => show(t[i], o[t[i++]]));
  }
  /** Frases de lo que hace (sus stats, su efecto y, evolucionado, su pasiva). */
  function lines(id, r = 0, evo = false) {
    const d = BY[id], v = vals(id, r, evo), out = [];
    for (const s in v.st) {
      const n = v.st[s];
      if (!n) continue;
      out.push((s === 'spd' && n < 0 ? SPD_NEG : STAT_T[s]).replace('{x}', num(Math.abs(n) * 100)));
    }
    for (const t of d.xt || []) {
      if (evo && t === d.xt[0] && (id === 'choiceband' || id === 'lifeorb')) continue;   // (su pega, que el evolucionado quita)
      out.push(fill(t, v.x));
    }
    if (evo) for (const t of d.pt || []) out.push(fill(t, v.p));
    return out;
  }
  /** La pasiva que ganará al evolucionar, con los números de su rareza. */
  const evoLines = (id, r = 0) => (BY[id].pt || []).map(t => fill(t, vals(id, r, true).p));
  const nameOf = it => (it.evo ? BY[it.id].evo : BY[it.id].name);
  const rarName = r => RAR[r].name;
  const color = r => RAR[r].col;

  // ---------------- llevarlos: suma, topes y aplicar ----------------
  /** Suma de todos los objetos que llevas, con los topes. */
  function sum(pl) {
    const s = {};
    for (const it of pl.items) {
      const v = V(it), h = BY[it.id].half && BY[it.id].half(pl, it) ? 0.5 : 1;
      for (const k in v.st) add(s, k, v.st[k] * (v.st[k] > 0 ? h : 1));
    }
    for (const k in s) s[k] = k === 'spd' ? G.U.clamp(s[k], SPD_MIN, CAP.spd) : Math.min(s[k], CAP[k] == null ? s[k] : CAP[k]);
    return s;
  }
  function apply(pl, s, sg) {
    const m = k => Math.pow(1 + (s[k] || 0), sg);
    pl.atkMul *= m('atk'); pl.spdMul *= m('spd'); pl.xpMul *= m('xp'); pl.coinMul *= m('coin'); pl.magnet *= m('magnet');
    pl.cdMul *= Math.pow(1 - (s.cd || 0), sg);
    pl.dmgReduce += sg * (s.red || 0);
    pl.critChance = (pl.critChance || 0) + sg * (s.crit || 0);
    pl.critDmg = (pl.critDmg || 0) + sg * (s.critD || 0);
    if (sg > 0) {
      pl._itHp = Math.round(pl.maxHp * (s.hp || 0));
      if (pl._itHp) pl.addMaxHp(pl._itHp);
    } else if (pl._itHp) {
      pl.maxHp = Math.max(1, pl.maxHp - pl._itHp);
      pl.hp = Math.max(1, Math.min(pl.hp, pl.maxHp));
      pl._itHp = 0;
    }
  }
  /** Vuelve a calcular lo que dan los objetos que llevas (al ponerte, quitarte o evolucionar uno, o al evolucionar tu Pokémon). */
  function refresh(pl) {
    if (pl._itS) apply(pl, pl._itS, -1);
    for (const it of pl.items) it.v = null;
    const s = sum(pl);
    apply(pl, s, 1);
    pl._itS = s;
    pl.itSteady = pl.items.some(i => i.id === 'whiteherb');
    pl.itFloat = pl.items.some(i => i.id === 'airballoon');
  }
  const stat = (pl, k) => (pl._itS && pl._itS[k]) || 0;

  // ---------------- ganchos (los llaman player.js y combat.js) ----------------
  const live = pl => !pl.remote && !pl.dead;
  const foes = (pl, r) => ((G.EnemyMgr && G.EnemyMgr.queryCircle) ? G.EnemyMgr.queryCircle(pl.x, pl.y, r) : []).filter(e => !e.dead);
  /** Daño de un objeto: k «golpes» (como las habilidades, data/ability-fx.js pow). */
  const pow = (pl, k) => k * (pl.atk || 1) * (10 + (pl.level || 1) * 0.9);
  function strike(pl, e, k, col, knock = 0) {
    const d = pow(pl, k);
    e.hurt(d, col, e.x - pl.x, e.y - pl.y, knock);
    pl.dmgDealt = (pl.dmgDealt || 0) + d;
    return d;
  }
  function nova(pl, r, k, col, fn, knock = 140) {
    if (G.FX.ring) G.FX.ring(pl.x, pl.y, 8, r, col, 0.45, 5);
    let tot = 0;
    for (const e of foes(pl, r)) { if (k) tot += strike(pl, e, k, col, knock); if (fn && !e.dead) fn(e); }
    return tot;
  }
  function every(it, k, s, dt) {
    const o = it.s || (it.s = {});
    o[k] = (o[k] || 0) + dt;
    if (o[k] < s) return false;
    o[k] = 0;
    return true;
  }
  const itemOf = (pl, id) => (pl.items ? pl.items.find(i => i.id === id) : null);
  const isEvo = (pl, id) => { const it = itemOf(pl, id); return !!(it && it.evo); };

  /** × al daño de un golpe tuyo (combat.js hit y proyectiles). Con el resto de objetos, hasta ×DMG_CAP. */
  function out(pl, m, e, type) {
    if (!pl.items || !pl.items.length) return 1;
    let k = 1;
    for (const it of pl.items) { const d = BY[it.id]; if (d.out) k *= d.out(pl, m, e, type, V(it)); }
    return k === 1 ? 1 : Math.min(k, DMG_CAP / (1 + stat(pl, 'atk')));
  }
  /** Ha golpeado a e (Toxisfera). */
  function hit(pl, e) {
    const it = itemOf(pl, 'toxicorb');
    if (it && !e.dead && Math.random() < V(it).x.psn) e.applyPoison(1);
  }
  /** Probabilidad de crítico de más con el movimiento m (Rocío Eterno). */
  function crit(pl, m) {
    const it = itemOf(pl, 'souldew');
    return it && it.evo && m && pl.mon && pl.mon.types.includes(m.type) ? V(it).p.crit : 0;
  }
  /** ¿Esquiva este golpe? (Polvo Brillo; Globo Helio épico.) */
  function dodge(pl) {
    const c = stat(pl, 'dodge');
    if (!(c > 0) || Math.random() >= c) return false;
    const it = itemOf(pl, 'brightpowder');
    if (it && it.evo) {
      G.FX.ring(pl.x, pl.y, 6, 120, '#fff4b0', 0.35, 4);
      for (const e of foes(pl, 120)) e.applySlow(V(it).p.slow, 2);
    }
    return true;
  }
  /** Daño final de un golpe (Chaleco Titán). */
  function taken(pl, d) {
    if (!isEvo(pl, 'assaultvest')) return d;
    const lim = pl.maxHp * 0.15;
    return d > lim ? lim + (d - lim) * 0.5 : d;
  }
  /** Te acaban de golpear (d de vida perdida; super: súper eficaz). */
  function hurt(pl, d, sup) {
    if (pl.remote || !pl.items.length) return;
    const wp = itemOf(pl, 'weaknesspolicy');
    if (wp && (sup || (wp.evo && d >= pl.maxHp * 0.1))) {
      pl.addBuff('atk', V(wp).x.buff, 10, 2, 'item');
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 16, G.T(nameOf(wp)), '#ff8a5c', true);
    }
    const rh = itemOf(pl, 'rockyhelmet');
    if (rh && rh.evo && !pl.dead) {
      const o = rh.s || (rh.s = {});
      if (!(now() - (o.at || -9) < 2)) { o.at = now(); nova(pl, 110, V(rh).p.pow, '#9aa6b5'); }
    }
    const wh = itemOf(pl, 'whiteherb');
    if (wh && wh.evo) pl.addBuff('spd', V(wh).p.spd, 3, 1, 'item');
  }
  /** Banda Focus: ¿te salva de este golpe? (pone la vida ella). */
  function sash(pl) {
    const it = itemOf(pl, 'focussash');
    if (!it || pl.remote) return false;
    const t = now(), o = it.s || (it.s = {});
    if (o.sash != null && t - o.sash < V(it).x.cdSash) return false;
    o.sash = t;
    pl.hp = 1; pl.invuln = 1.2; pl.graceT = Math.max(pl.graceT || 0, it.r >= 2 ? 2.5 : 1.2);
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 16, '¡' + G.T(nameOf(it)) + '!', '#ff9a3d', true);
    G.FX.ring(pl.x, pl.y, 6, 70, '#ff9a3d', 0.5, 4);
    if (it.evo) { pl.hp = Math.max(1, pl.maxHp * V(it).p.heal); nova(pl, 150, V(it).p.pow, '#ff9a3d', null, 260); }
    return true;
  }
  /** Un enemigo te ha golpeado cuerpo a cuerpo (Casco Dentado, Bola de Nieve). */
  function contact(pl, e) {
    if (!pl.items.length || e.dead) return;
    const rh = itemOf(pl, 'rockyhelmet');
    if (rh) e.hurt((15 + pl.level * 4) * V(rh).x.thorn, '#9aa6b5', e.x - pl.x, e.y - pl.y, 80);
    const sb = itemOf(pl, 'snowball');
    if (sb && !e.dead) e.applySlow(V(sb).x.slow, 2);
  }
  /** Lo que se cura de más (Cascabel Alivio) y lo que sobra, a barrera (Campana Serena). */
  const healK = pl => 1 + stat(pl, 'heal');
  function overflow(pl, extra) {
    const it = itemOf(pl, 'soothebell');
    if (!it || !it.evo || !(extra > 0)) return;
    pl.abShield = Math.min(pl.maxHp * V(it).p.cap, (pl.abShield || 0) + extra);
  }
  /** Cascabel Concha: lo que cura por el daño que haces (tope por segundo). */
  function bell(pl, dmg) {
    const it = itemOf(pl, 'shellbell');
    if (!it) return;
    const cap = Math.max(4, pl.maxHp * 0.01) * RAR[it.r].k * (it.evo ? EVO_K : 1);
    pl.bellCap = cap;
    pl.bellHeal = Math.min(cap, (pl.bellHeal || 0) + dmg * V(it).x.steal);
  }
  const locked = pl => { const it = itemOf(pl, 'choiceband'); return !!(it && !it.evo); };
  const orbCost = pl => { const it = itemOf(pl, 'lifeorb'); return !!(it && !it.evo); };

  /** Al evolucionar un objeto: sus números nuevos, el aviso y el destello. */
  function evolve(pl, it) {
    it.evo = true;
    refresh(pl);
    if (pl.remote) return;
    const col = RAR[it.r].col;
    G.Spawner.say('¡' + BY[it.id].name + ' ha evolucionado a ' + BY[it.id].evo + '!', 3.2, true);
    G.FX.ring(pl.x, pl.y, 8, 150, col, 0.8, 6);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, col, 40, 240);
    G.Audio.sfx('legend');
    if (G.Reg && G.Reg.ev) G.Reg.ev('objeto-evo', key(it.id, it.r));
  }

  /** Cada fotograma (player.js, sólo el tuyo y vivo): el reloj de evolución y las pasivas. */
  function tick(pl, dt) {
    if (!pl.items.length) return;
    for (const it of pl.items) {
      it.t = (it.t || 0) + dt;
      if (!it.evo && it.t >= EVO_T) evolve(pl, it);
    }
    for (const it of pl.items) {
      const v = V(it), id = it.id;
      if (id === 'oranberry') {
        const o = it.s || (it.s = {});
        if (pl.hp < pl.maxHp * 0.35 && !(now() - (o.ate == null ? -1e9 : o.ate) < v.x.cdBerry)) {
          o.ate = now();
          pl.heal(pl.maxHp * v.x.heal, 'objeto');
          if (it.r >= 2) pl.invuln = Math.max(pl.invuln, 1);
          if (it.evo) pl.abShield = Math.max(pl.abShield || 0, pl.maxHp * v.p.shield);
          G.FX.ring(pl.x, pl.y, 6, 60, '#5fa8ff', 0.4, 3);
        }
      }
      if (id === 'stickybarb' && every(it, 'aura', 1, dt)) {
        for (const e of foes(pl, it.evo ? 128 : 85)) { strike(pl, e, v.x.pow, '#b46ad8'); if (it.evo && !e.dead) e.applyPoison(1); }
      }
      if (!it.evo) continue;
      if (id === 'leftovers' && pl.hp < pl.maxHp * 0.3) {
        const h = Math.min(pl.maxHp - pl.hp, pl.maxHp * stat(pl, 'regen') * 2 * dt);
        if (h > 0) { pl.hp += h; pl.healed += h; if (G.Reg) G.Reg.heal(pl, h, 'regeneración'); }
      }
      else if (id === 'quickclaw' && every(it, 'now', v.p.cdNow, dt)) {
        for (const m of pl.activeGroup()) if (m.kind !== 'orbit') m.t = 0;
        G.FX.ring(pl.x, pl.y, 6, 50, '#ffe14d', 0.3, 3);
      } else if (id === 'shellbell' && every(it, 'wave', 6, dt)) {
        const d = nova(pl, 120, v.p.pow, '#5fc8ff', null, 60);
        if (d > 0) bell(pl, d);
      } else if (id === 'luckyegg' && every(it, 'xp', v.p.cdXp, dt)) {
        if (G.Game.giveXp) G.Game.giveXp(pl.xpNext * 0.5 / (pl.xpMul || 1));
        G.FX.ring(pl.x, pl.y, 6, 80, '#ffe9a0', 0.5, 4);
      } else if (id === 'choicescarf' && pl.walking && every(it, 'trail', 0.4, dt)) {
        for (const e of foes(pl, 80)) e.applySlow(v.p.slow, 1.5);
      } else if (id === 'metalcoat' && every(it, 'shield', 12, dt)) {
        pl.abShield = Math.max(pl.abShield || 0, pl.maxHp * v.p.shield);
        G.FX.ring(pl.x, pl.y, pl.r * 2.6, pl.r * 1.4, '#c8d2e0', 0.4, 3);
      } else if (id === 'toxicorb' && every(it, 'gas', 4, dt)) {
        nova(pl, 130, 0, '#a46ad8', e => e.applyPoison(1));
      } else if (id === 'snowball' && every(it, 'snow', 8, dt)) {
        nova(pl, 160, 0, '#bfe8ff', e => e.applySlow(v.p.slow, 2));
      } else if (id === 'airballoon' && every(it, 'drop', 10, dt)) {
        nova(pl, 140, v.p.pow, '#9fd8ff', null, 200);
      } else if (id === 'liechiberry') {
        const o = it.s || (it.s = {});
        if (half(pl) && !(now() - (o.at == null ? -1e9 : o.at) < 60)) { o.at = now(); pl.heal(pl.maxHp * v.p.heal, 'objeto'); }
      }
    }
  }

  return { LIST, BY, RAR, EVO_T, EVO_K, CAP, DMG_CAP, key, parse, roll, rollRarity, vals, lines, evoLines, nameOf, rarName, color,
           sum, refresh, stat, itemOf, out, hit, crit, dodge, taken, hurt, sash, contact, healK, overflow, bell, locked, orbCost, tick, evolve };
})();
