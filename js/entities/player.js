/* ============ player.js — el Pokémon que controlas ============
 * (x, y) son los PIES. Sólo UN movimiento está activo a la vez: se dispara
 * solo y se cambia con 1-4 / Q / E. Cada disparo reproduce la animación de
 * ataque de Mundo Misterioso que le toca (Attack, Shoot o Charge).
 */
G.Player = class Player {
  /**
   * @param mon   entrada de G.DEX
   * @param perks mejoras permanentes ya resueltas (ver data/upgrades.js)
   */
  constructor(mon, perks = {}, shiny = false) {
    this.mon = mon;
    // dex: el Pokémon que elegiste (mejoras, MT, récords). form: la fase de su línea
    // que eres ahora (sprite, stats y tipos; evoluciona en partida, ver G.Evo).
    this.dex = mon.dex;
    this.shinyWant = !!shiny;
    this.x = 0; this.y = 0;
    this.body(mon.form || mon.dex);

    this.atkMul = perks.atkMul || 1;
    this.spdMul = perks.spdMul || 1;
    this.cdMul = perks.cdMul || 1;
    this.dmgReduce = perks.dmgReduce || 0;
    this.regenFlat = perks.regen || 0;
    this.regenK = 0;           // regeneración de la habilidad: esa parte de la vida máxima por segundo
    this.magnet = 78 * (perks.magnetMul || 1);
    this.xpMul = perks.xpMul || 1;
    this.coinMul = perks.coinMul || 1;

    this.maxHp = mon.hp + (perks.hp || 0);
    this.hp = this.maxHp;
    this.baseSpd = mon.spd;
    this.baseAtk = mon.atk;

    this.moves = [];           // todos los movimientos aprendidos
    this.slots = [];           // huecos: cada uno, una lista de movimientos que se lanzan a la vez
    this.active = 0;           // hueco activo
    this.maxMoves = 4;         // huecos
    this.bonds = 0;            // vínculos por usar (premio de los legendarios)

    // patk / satk: Danza Espada y Danza Dragón (físico) y Maquinación (especial).
    this.buffs = {
      atk: { n: 0, t: 0, amount: 0 },
      patk: { n: 0, t: 0, amount: 0 },
      satk: { n: 0, t: 0, amount: 0 },
      spd: { n: 0, t: 0, amount: 0 },
      def: { n: 0, t: 0, amount: 0 },
      regen: { n: 0, t: 0, amount: 0 }
    };

    this.level = 1;
    this.xp = 0;
    this.xpNext = Player.xpFor(1);
    this.kills = 0;
    this.bosses = 0;
    this.rerolls = 0;          // veces que ha cambiado las cartas de nivel en esta run
    this.rerollBonus = perks.rerolls || 0;   // cambios comprados en Mejoras (más el gratis)
    this.critChance = perks.crit || 0;       // probabilidad de golpe crítico (Mejoras)
    this.critDmg = 0;                        // + al daño de los críticos (cartas de Puntería; combat.js critMul)
    // Pasivos de la run (cartas Amplitud, Persistencia, Réplica y Propulsión): ver G.Moves.applyPassives.
    // Se empieza con lo que den las mejoras permanentes de los ataques (26-10-2026, data/upgrades.js:
    // duración, velocidad de proyectiles y cantidad); las cartas suman encima.
    this.pass = { area: 1, dur: perks.passDur || 1, amt: perks.passAmt | 0, pspd: perks.passSpd || 1 };
    this.banned = new Set();                 // movimientos vetados (Mejoras → Veto): no salen en las cartas
    this.bind = {};                          // movimiento -> hueco fijo (0-3), elegido en Mejoras
    this.coins = 0;            // monedas recogidas en esta run
    this.t1 = 0; this.t10 = 0; // tickets del gacha recogidos en esta run
    this.dmgDealt = 0;
    this.dmgTaken = 0;         // vida perdida por golpes (resumen final)
    this.healed = 0;           // vida recuperada (resumen final)

    this.invuln = 0;
    // Gracia: invulnerable aunque los peligros, la lava o las trampas pongan
    // invuln a 0 (vuelta de la grieta, levantarse, Banda Focus). Ver hurt().
    this.graceT = 0;
    this.flash = 0;
    this.aim = Math.PI / 2;
    this.moveAngle = Math.PI / 2;
    this.walking = false;
    this.inLiquid = false;
    this.lavaTick = 0;
    this.attackFace = 0;       // tiempo que sigue mirando al objetivo tras atacar
    this.dead = false;
    this.power = null;         // poder de altar activo: { def, t, dur }
    this.slowT = 0;            // pegado por una trampa
    this.item = null;          // objeto equipado (data/items.js), uno por run
    this.sashT = -Infinity;    // última vez que salvó la Banda Focus (tiempo de partida)
    this.bellHeal = 0;         // curación pendiente del Cascabel Concha
    this.statsTaken = {};      // mejoras de stat cogidas (condición de evolución)
    this.abil = null;          // efecto de su habilidad (data/ability-fx.js), lo pone game.js
    this.sturdyAt = -Infinity; // última vez que le salvó Robustez (tiempo de partida)
    // (Movimiento Z, this.z: lo pone combat.js, zOf, la primera vez que se mira; null sin Pulsera Z.)
  }

  /** Sprite, tamaño y choque de la fase `form` (al crearlo y al evolucionar). */
  body(form) {
    this.form = form;
    this.shiny = this.shinyWant && G.Sprites.hasShiny(form);
    // Los grandes, algo más pequeños y con el choque de uno normal (ver sprites.js).
    this.scale = G.Sprites.playerScale(form);
    const dir = this.anim ? this.anim.dir : 0;
    this.anim = new G.Sprites.Animator(form, this.scale, this.shiny);
    this.anim.dir = dir;
    this.r = G.Sprites.playerRadius(form);
    // Radio contra paredes y objetos: menos de medio tile, para que todos quepan
    // por un hueco de un tile (#265: Celesteela no pasaba). Los golpes siguen con r.
    this.wr = Math.min(Player.WALL_R, this.r);
    this.bodyH = G.Sprites.bodyHeight(form, this.scale);
  }

  /**
   * Evoluciona (24-10-2026): sprite, stats y tipos de `mon` (G.Mons.formFor: la
   * nueva fase con la naturaleza del que elegiste). Se queda con todo lo de la
   * partida (mejoras, cartas, objeto, habilidad): la vida máxima sube lo que
   * sube la de la fase, cura un 25 % y es invulnerable mientras dura el destello.
   * fx: con la animación (los compañeros en grupo la ven igual, ver netUpdate).
   */
  evolve(mon, fx = true) {
    const old = this.mon, from = this.anim, fromForm = this.form;
    this.mon = mon;
    this.body(mon.form || mon.dex);
    this.baseSpd = mon.spd;
    if (!this.remote) {
      // La habilidad es la misma; su pasiva de tipo (la genérica) va con el tipo de la fase nueva.
      // Lo que cambia los stats de la fase (Potencia, Energía Pura...) se pone otra vez sobre la
      // nueva (G.AbilityFX.stage); lo demás de al empezar (críticos, monedas...) ya está y no se repite.
      // La regeneración que va con la vida máxima (regenK) crece sola con ella (get regen).
      if (this.abil) { this.abil = G.AbilityFX.of(this.abilId, this.mon); G.AbilityFX.stage(this.abil, mon); }
      const up = Math.round(((mon.hp || 0) - (old.hp || 0)) * ((this.abil && this.abil.hpMul) || 1));
      this.maxHp = Math.max(1, this.maxHp + up);
      this.hp = Math.min(this.maxHp, Math.max(1, this.hp + Math.max(0, up)));
      if (fx) this.heal(this.maxHp * 0.25);
      this.baseAtk = mon.atk;
      // (El movimiento Z no cambia: va con la Pulsera Z del elegido y el tipo de tus
      // ataques, no con los tipos de la fase; ver combat.js zOf.)
    }
    if (fx) {
      this.evoFx = { t: 0, dur: Player.EVO_TIME, from, fromForm };
      this.invuln = Math.max(this.invuln, Player.EVO_TIME + 0.3);
      this.graceT = Math.max(this.graceT || 0, Player.EVO_TIME + 0.3);
    }
  }
  /** Lo que dura el destello de la evolución (s). */
  static get EVO_TIME() { return 1.25; }

  /** Pone la habilidad (G.AbilityFX.of) y aplica lo que hace al empezar (G.AbilityFX.begin). */
  setAbility(id) {
    this.abilId = id || '';
    this.abil = G.AbilityFX.of(id, this.mon);
    G.AbilityFX.begin(this, this.abil);
  }

  /** Segundos que hay que estar junto a un compañero caído para levantarlo. */
  static get REVIVE_TIME() { return 3; }

  /** Radio máximo contra el terreno (un tile mide 32). */
  static get WALL_R() { return 14; }

  // (×2 y luego ×4 el 2026-10-10: se subía de nivel demasiado rápido.)
  static xpFor(level) {
    return Math.floor((8 + level * 6 + Math.pow(level, 1.75) * 1.6) * 4);
  }

  cy() { return this.y; }

  // ---------------- stats efectivos ----------------
  get atk() { return this.baseAtk * this.atkMul * (1 + this.buffs.atk.n * this.buffs.atk.amount); }
  /**
   * Ataque con un movimiento: el físico o el especial de tu Pokémon (ver
   * G.Stats), con las danzas que sean de su lado (las de mejora, sin ninguna).
   */
  atkFor(m) {
    const cat = m && m.cat, b = cat === 'physical' ? this.buffs.patk : cat === 'special' ? this.buffs.satk : null;
    return this.atk * G.Stats.fit(this.mon, cat) * (b ? 1 + b.n * b.amount : 1) * (m && this.monoType(m.type) ? Player.MONO_K : 1);
  }
  /** Monotipo (19-10-2026): los de un solo tipo pegan un +20 % con los ataques de su tipo (tienen menos variedad). */
  static get MONO_K() { return 1.2; }
  monoType(type) { return this.mon.types.length === 1 && type === this.mon.types[0]; }
  get spd() {
    // (Habilidades: "steady" no se frena; speed() multiplica, ver data/ability-fx.js.)
    const ab = this.abil || {}, stuck = this.slowT > 0 && !ab.steady;
    const s = this.baseSpd * this.spdMul * (1 + this.buffs.spd.n * this.buffs.spd.amount) * (stuck ? 0.5 : 1) * (ab.speed ? ab.speed(this) : 1);
    const w = G.Weather.speedFor(this.mon.types);
    const slow = this.inLiquid && !ab.steady ? G.World.liquidEffect(this.mon.types).slow || 1 : 1;
    return G.Judgment && G.Judgment.active ? G.Judgment.capSpd(s * slow * w) : s * slow * w;
  }
  get reduction() { return Math.min(0.8, this.dmgReduce + this.buffs.def.n * this.buffs.def.amount); }
  get regen() { return this.regenFlat + this.maxHp * this.regenK + this.buffs.regen.n * this.buffs.regen.amount; }

  // ---------------- movimientos ----------------
  addMove(id) {
    if (this.slots.length >= this.maxMoves || this.hasMove(id)) return false;
    const m = G.Moves.instance(id, 1);
    // Con los pasivos que ya lleva (los de las mejoras permanentes, desde el principio): antes
    // sólo llegaban con la siguiente carta (rebakeAll), y al empezar la partida no había ninguno.
    if (this.pass) G.Moves.applyPassives(m, this.pass);
    m.since = G.Game.st.time;         // desde cuándo lo tienes (daño por segundo en el resumen)
    this.moves.push(m);
    const group = [m];
    this.slots.push(group);
    this.arrange();
    // Te quedas con el que llevabas (18-10-2026: antes se cambiaba solo al nuevo
    // y te quitaba el ataque que estabas usando). Sólo si no tenías ninguno, el nuevo.
    if (!this.slots[this.active]) this.active = this.slots.indexOf(group);
    return true;
  }

  /**
   * Huecos fijos (Mejoras → Atajos): cada movimiento con hueco elegido se pone
   * en ese número para la memoria muscular (Confusión siempre en el 1...).
   * Mientras no tengas tantos movimientos, va al más cercano; los demás
   * rellenan los huecos libres en el orden en que los aprendiste.
   */
  arrange() {
    const n = this.slots.length;
    if (n < 2 || !this.bind) return;
    const want = g => { let k = Infinity; for (const m of g) if (this.bind[m.id] != null) k = Math.min(k, this.bind[m.id]); return k; };
    const cur = this.slots[this.active];
    const out = new Array(n).fill(null);
    const bound = this.slots.filter(g => want(g) < Infinity).sort((a, b) => want(a) - want(b));
    for (const g of bound) {
      let p = Math.min(want(g), n - 1);
      while (p >= 0 && out[p]) p--;                          // ocupado: el de antes
      if (p < 0) { p = 0; while (out[p]) p++; }              // o el primero libre
      out[p] = g;
    }
    for (const g of this.slots) if (!out.includes(g)) out[out.indexOf(null)] = g;
    this.slots = out;
    if (cur) this.active = out.indexOf(cur);
  }

  hasMove(id) { return this.moves.some(m => m.id === id); }

  setActive(i) {
    if (i < 0 || i >= this.slots.length || i === this.active) return;
    // Cinta Elección: no se puede cambiar de movimiento. Salvo si el que llevas no
    // hace daño (#92: con Agilidad activa al cogerla te quedabas sin atacar).
    const cur = this.activeGroup();
    // (Ni si es un escudo o un barrido de pantalla: con Canto Mortal te quedabas sin atacar 45 s.)
    if (this.hasItem('choiceband') && cur.some(m => !G.Moves.nonAttacking(m.kind))) {
      G.FX.dmgText(this.x, this.y - this.bodyH - 8, 'Cinta Elección', '#ff8ad8');
      return;
    }
    // Recargas (#174): corren en todos los huecos (combat.js) y cambiar no las acorta.
    // Además el hueco nuevo no dispara antes de cuando lo habría hecho el que dejas
    // (como mucho espera su propia recarga): así cambiar rápido no da más disparos,
    // y uno que lleva rato sin usarse sale en cuanto le toca.
    // La espera entera sigue contando aunque pases por otro hueco (una órbita o uno de
    // recarga corta, swapLock baja en combat.js): si no, pasando por él salían todos.
    let own = Infinity;
    for (const m of cur) if (m.kind !== 'orbit') own = Math.min(own, Math.max(0, m.t));
    const lock = this.swapLock = Math.max(own === Infinity ? 0 : own, this.swapLock || 0);
    this.active = i;
    G.Projectiles.clearOrbs(this);
    G.Audio.sfx('select');
    for (const m of this.slots[i]) if (m.kind !== 'orbit') m.t = Math.max(m.t, Math.min(lock, G.Combat.cooldown(this, m)));
    const m = this.slots[i][0];
    G.FX.ring(this.x, this.y - G.LIFT * 0.5, 6, this.r * 3.4, G.U.TYPE_COLOR[m.type], 0.3, 3);
  }

  cycle(dir) {
    if (!this.slots.length) return;
    this.setActive((this.active + dir + this.slots.length) % this.slots.length);
  }

  // ---------------- vínculos (fusiones) ----------------
  // Cada legendario vencido da un vínculo. Con él se juntan movimientos en un
  // solo hueco y se lanzan a la vez. Sólo crece un grupo (hasta BOND_MAX); si
  // no hay ninguno a medias, el vínculo une dos movimientos sueltos.
  static get BOND_MAX() { return 4; }

  /** Lo que se puede hacer ahora con un vínculo: añadir a un grupo o unir dos sueltos. */
  bondOptions() {
    const loose = this.slots.filter(s => s.length === 1).map(s => s[0]);
    const grow = this.slots.find(s => s.length > 1 && s.length < Player.BOND_MAX);
    if (grow) return loose.length ? { mode: 'add', group: grow, loose } : null;
    return loose.length >= 2 ? { mode: 'pair', group: null, loose } : null;
  }

  /** Junta `moves` (sueltos) en el grupo `group` (o en uno nuevo) y gasta un vínculo. */
  fuse(moves, group = null) {
    const target = group || this.slots.find(s => s[0] === moves[0]);
    const cur = this.slots[this.active];
    for (const m of moves) {
      if (target.includes(m)) continue;
      const i = this.slots.findIndex(s => s.length === 1 && s[0] === m);
      if (i < 0) continue;
      this.slots.splice(i, 1);
      target.push(m);
    }
    this.arrange();
    // Se pasa al grupo, salvo con la Cinta Elección (sigues en el hueco que tenías, si queda).
    const a = this.slots.indexOf(cur);
    this.active = this.hasItem('choiceband') && a >= 0 ? a : this.slots.indexOf(target);
    this.bonds = Math.max(0, this.bonds - 1);
    G.Projectiles.clearOrbs(this);
    return target;
  }

  /** Movimientos que se lanzan ahora (el grupo del hueco activo). */
  activeGroup() { return this.slots[this.active] || []; }

  activeMove() { return this.activeGroup()[0]; }

  /**
   * Lo llama combat.js al lanzar un movimiento. Elige la animación de PMD y la
   * acelera si la recarga es más corta que la animación, para que encadene.
   */
  cast(m) {
    // Vidasfera: cada ataque cuesta un poco de vida (nunca te deja KO). Ganar un escudo no es un ataque.
    // (El movimiento Z, tampoco: se lanza solo y muy seguido.)
    if (this.hasItem('lifeorb') && m.kind !== 'orbit' && m.kind !== 'trail' && m.kind !== 'ward' && !m.z && !this.remote) {
      this.hp = Math.max(1, this.hp - Math.max(1, this.maxHp * 0.01));
    }
    const anim = this.pickAnim(m.kind);
    // Las familias nuevas suenan como la parecida de las de siempre.
    const SND = { boomerang: 'projectile', chain: 'beam', mine: 'nova', meteor: 'nova', turret: 'buff', dash: 'melee', trail: 'aura', cone: 'projectile',
                  lob: 'projectile', knife: 'projectile', cross: 'nova', column: 'beam', sweep: 'beam', ricochet: 'projectile',
                  wipe: 'buff', ward: 'buff', ally: 'buff', wings: 'orbit', puddle: 'nova', dusting: 'aura' };
    // El rastro no suena a cada charco (sería un zumbido constante).
    if (m.kind !== 'trail') G.Audio.sfx('shot', { kind: SND[m.kind] || m.kind, type: m.type });
    if (m.kind === 'trail') return;
    // No reinicies una animación que va por la mitad: se vería a tirones.
    if (this.anim.busy() && this.anim.progress() < 0.65) return;
    // Andando, como mucho una animación de lanzar cada 0,6 s (29-10-2026: con un ataque rápido, como Ascuas, se veía
    // todo el rato en postura de disparo y parecía que se deslizaba). Quieto, como antes.
    const now = G.Game && G.Game.st ? G.Game.st.time || 0 : performance.now() / 1000;
    if (this.walking && now - (this.castAt == null ? -9 : this.castAt) < 0.6) return;
    this.castAt = now;
    const meta = G.Sprites.animMeta(this.form, anim);
    const len = meta ? meta.d.reduce((a, b) => a + b, 0) / 60 : 0.4;
    const cd = Math.max(0.12, m.cd * this.cdMul);
    this.anim.play(anim, { speed: Math.max(1, len / (cd * 0.9)) });
    this.attackFace = 0.35;
  }

  // ---------------- daño y curación ----------------
  /**
   * @param type  tipo del ataque (tabla de tipos y clima); sin tipo, daño tal cual
   * @param pure  daño que no baja con la defensa ni el cuerpo a cuerpo (Arceus)
   */
  /** @param cat  'physical' | 'special': con qué defensa tuya se para (la del enemigo que pega). */
  hurt(amount, type = null, pure = false, cat = null) {
    // La gracia sólo la atraviesa el daño puro de Arceus (la Sentencia no se salta).
    if (this.invuln > 0 || this.dead || (this.graceT > 0 && !pure)) return;
    // Habilidad (data/ability-fx.js): absorber un tipo, esquivar o recibir menos.
    const ab = this.abil, cls = cat === 'physical' ? 'p' : cat === 'special' ? 's' : '';
    if (ab && !pure) {
      if (type && ab.absorb === type) {
        this.invuln = 0.3;
        this.heal(this.maxHp * 0.03);
        return;
      }
      if (ab.dodge && Math.random() < ab.dodge(this, type, cls)) {
        this.invuln = 0.3;
        G.FX.dmgText(this.x, this.y - this.bodyH - 4, '¡Esquiva!', '#bfe8ff');
        return;
      }
      if (ab.inMul) amount *= ab.inMul(this, type, cls);
    }
    // Escudos (familia ward, combat.js): paran entero un golpe de un enemigo (no la lava, las trampas ni Arceus).
    if (!pure && (type || cat) && G.Combat.wardBlock(this)) return;
    if (!pure) amount *= G.Stats.taken(this.mon, cat);
    let eff = null;
    if (type) {
      const k = G.Types.mult(type, this.mon.types);
      eff = G.Types.label(k);
      amount *= k * G.Weather.mult(type);
    }
    // Con un ataque cuerpo a cuerpo activo se recibe un 25 % menos: hay que
    // estar encima de los enemigos para pegar (iban muy por detrás).
    const close = this.activeGroup().some(m => m.kind === 'melee') ? 0.75 : 1;
    const d = pure ? Math.max(1, amount) : Math.max(1, amount * (1 - this.reduction) * close);
    this.dmgTaken += Math.min(d, Math.max(0, this.hp));
    // Golpes fuertes (de una vez, un 20 % de la vida o más): Puño Certero se cancela sólo con estos.
    if (d >= this.maxHp * 0.2) this.bigHits = (this.bigHits || 0) + 1;
    this.hp -= d;
    this.invuln = 0.45;
    this.flash = 0.14;
    this.hurtAnim();
    G.Audio.sfx('hurt');
    G.Camera.kick(0.28);
    if (!this.remote) G.Pad.rumble(0.25 + Math.min(0.75, d / this.maxHp * 3), 140);
    G.FX.dmgText(this.x, this.y - this.bodyH - 4, '-' + Math.round(d), eff === 'super' ? '#ff3048' : eff === 'weak' ? '#c9a0a8' : '#ff6b7a', eff === 'super');
    G.FX.burst(this.x, this.y - this.bodyH * 0.5, '#ff5f6d', 6, 90);
    // Banda Focus: aguanta el golpe con 1 de vida (una vez cada 60 s de partida;
    // con performance.now() contaba la pausa y no iba hasta 60 s después de cargar la página).
    // Los 1,2 s son de gracia: una lluvia de 4-6 zonas de un jefe ya no te remata.
    const now = G.Game.st.time;
    if (this.hp <= 0 && this.hasItem('focussash') && now - this.sashT > 60) {
      this.sashT = now;
      this.hp = 1; this.invuln = 1.2; this.graceT = Math.max(this.graceT, 1.2);
      G.FX.dmgText(this.x, this.y - this.bodyH - 16, '¡Banda Focus!', '#ff9a3d', true);
      G.FX.ring(this.x, this.y, 6, 70, '#ff9a3d', 0.5, 4);
    }
    // Robustez (habilidad): lo mismo, una vez cada 90 s.
    if (this.hp <= 0 && ab && ab.sturdy && now - this.sturdyAt > 90) {
      this.sturdyAt = now;
      this.hp = 1; this.invuln = 1.2; this.graceT = Math.max(this.graceT, 1.2);
      G.FX.dmgText(this.x, this.y - this.bodyH - 16, '¡Robustez!', '#c9b48a', true);
      G.FX.ring(this.x, this.y, 6, 70, '#c9b48a', 0.5, 4);
    }
    if (ab && ab.hurt && this.hp > 0) ab.hurt(this, type, cls);
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true;
      this.anim.play('Faint', { hold: true });
      G.Projectiles.clearOrbs(this);
      this.reviveT = 0;
    }
  }

  heal(amount) {
    if (this.abil && this.abil.healMul) amount *= this.abil.healMul;     // Gula, Recogida
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.healed += Math.max(0, this.hp - before);
    const got = Math.round(this.hp - before);
    if (got >= 1) G.FX.dmgText(this.x, this.y - this.bodyH - 6, '+' + got, '#5fe08a');
  }

  addMaxHp(amount) { this.maxHp += amount; this.hp += amount; }

  /** Devuelve cuántos niveles ha subido (pueden ser varios de golpe). */
  gainXp(amount) {
    const add = amount * this.xpMul;
    if (!Number.isFinite(add) || add <= 0) return 0;     // una experiencia infinita no acababa nunca de subir niveles
    this.xp += add;
    let leveled = 0;
    while (this.xp >= this.xpNext && leveled < 50) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = Player.xpFor(this.level);
      leveled++;
    }
    return leveled;
  }

  // ---------------- objeto equipado ----------------
  hasItem(id) { return this.item === id; }

  /** Se pone un objeto (y se quita el que llevara). */
  equip(id) {
    if (this.item) G.Items.BY[this.item].off(this);
    this.item = id;
    if (id) G.Items.BY[id].on(this);
  }

  /** Cascabel Concha: un poco de vida por el daño que haces (tope 4/s). */
  onDealt(dmg) {
    if (this.item === 'shellbell') this.bellHeal = Math.min(4, this.bellHeal + dmg * 0.04);
  }

  /** Poder de un altar (ver systems/interact.js): se aplica y se quita solo. */
  addPower(def, dur) {
    if (this.power) this.power.def.off(this);
    def.on(this);
    this.power = { def, t: dur, dur };
  }

  /**
   * Potenciador acumulable. Cada origen (`src`: el id del movimiento, o 'abil' la
   * habilidad) lleva sus pilas, su duración y su potencia: antes compartían hueco y
   * un golpe con Firmeza o Impasible dejaba 7 pilas de Agilidad en 1 o 2. En b
   * queda la suma (n × amount = el total) para los stats y el HUD.
   */
  addBuff(stat, amount, dur, maxStacks, src = 'abil') {
    const b = this.buffs[stat];
    if (!b) return;
    const l = b.src || (b.src = []);
    let s = l.find(o => o.id === src);
    if (!s) l.push(s = { id: src, n: 0, t: 0, amount: 0 });
    s.amount = amount;
    s.n = Math.min(maxStacks, s.n + 1);
    s.t = dur;
    Player.sumBuff(b);
  }

  /** Junta los orígenes de un potenciador en b.n, b.amount y b.t. */
  static sumBuff(b) {
    let n = 0, tot = 0, t = 0;
    for (const s of b.src) if (s.n > 0) { n += s.n; tot += s.n * s.amount; t = Math.max(t, s.t); }
    b.n = n; b.amount = n ? tot / n : 0; b.t = t;
  }

  // ---------------- ciclo ----------------
  /** El destello de la evolución avanza (también en los compañeros). */
  evoTick(dt) {
    const e = this.evoFx;
    if (!e) return;
    e.from.update(dt);
    if ((e.t += dt) >= e.dur) this.evoFx = null;
  }

  update(dt) {
    this.anim.update(dt);
    this.evoTick(dt);
    if (this.dead) return;
    if (this.invuln > 0) this.invuln -= dt;
    // Mientras dura la gracia, invuln la acompaña (así parpadea aunque algo la ponga a 0).
    if (this.graceT > 0) { this.graceT -= dt; if (this.invuln < this.graceT) this.invuln = this.graceT; }
    if (this.flash > 0) this.flash -= dt;
    if (this.attackFace > 0) this.attackFace -= dt;

    for (const k in this.buffs) {
      const b = this.buffs[k];
      if (!(b.n > 0)) continue;
      // Cada origen caduca por su cuenta (ver addBuff).
      let gone = false;
      for (const s of b.src) if (s.n > 0 && (s.t -= dt) <= 0) { s.n = 0; gone = true; }
      if (gone) Player.sumBuff(b); else b.t -= dt;
    }
    if (this.slowT > 0) this.slowT -= dt;
    const hp0 = this.hp;       // Cascabel Concha y regeneración: cuentan en la curación
    if (this.bellHeal > 0) { const h = Math.min(this.bellHeal, 4 * dt); this.hp = Math.min(this.maxHp, this.hp + h); this.bellHeal -= h; }
    if (this.power && (this.power.t -= dt) <= 0) { this.power.def.off(this); this.power = null; }
    if (this.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    if (this.hp > hp0) this.healed += this.hp - hp0;
    const hp1 = this.hp;       // y lo que cura la habilidad (Cura Lluvia, Gélido, Mudar...)
    if (this.abil && this.abil.tick) this.abil.tick(this, dt);
    if (this.hp > hp1) this.healed += this.hp - hp1;
    // Sequía, Llovizna...: su clima al empezar y cada 3 min, si no hay otro (en
    // grupo lo pone el anfitrión, que es quien manda el clima a todos).
    if (this.abil && this.abil.summon && (!G.Coop.active || G.Coop.isHost) && (this.sumT = (this.sumT || 0) - dt) <= 0) {
      this.sumT = 180;
      if (!G.Weather.current) G.Weather.debugStart(this.abil.summon, 60);
    }

    // Movimiento Z: su tecla (Ajustes > Controles, Z de serie) o el botón X del mando; el del HUD llama a zUse.
    if (!this.frozen && !this.remote && G.Input.act('zmove')) G.Combat.zUse(this);

    // --- movimiento con colisiones ---
    // (En cooperativo la pausa no para el juego: sólo te quedas quieto.)
    const [ax, ay] = this.frozen ? [0, 0] : G.Input.axis();
    this.walking = ax !== 0 || ay !== 0;
    const s = this.spd;
    // Hielo: resbalas (la velocidad cambia despacio).
    const slide = this.inLiquid && G.World.liquidEffect(this.mon.types).slide;
    this.svx = slide ? G.U.damp(this.svx || 0, ax * s * 1.15, 1.6, dt) : ax * s;
    this.svy = slide ? G.U.damp(this.svy || 0, ay * s * 1.15, 1.6, dt) : ay * s;
    // En pasos de como mucho medio radio, chocando en cada uno: muy rápido, el
    // paso entero de un fotograma cruzaba las paredes (#202).
    const mx = this.svx * dt, my = this.svy * dt;
    const n = Math.min(32, Math.ceil(Math.hypot(mx, my) / (this.wr * 0.5))) || 1;
    for (let k = 0; k < n; k++) {
      this.x += mx / n;
      this.y += my / n;
      G.World.collide(this);
    }
    if (this.walking) this.moveAngle = Math.atan2(ay, ax);

    // --- terreno líquido ---
    // (Levitación: flota por encima del agua y la lava.)
    this.inLiquid = !(this.abil && this.abil.levitate) && G.World.isLiquid(this.x, this.y);
    if (this.inLiquid) {
      const le = G.World.liquidEffect(this.mon.types);
      if (le.dmg && !(this.abil && this.abil.lavaProof)) {
        this.lavaTick -= dt;
        if (this.lavaTick <= 0) {
          this.lavaTick = le.every; this.invuln = 0;
          this.hurt(Math.max(le.flat, this.maxHp * le.dmg * 0.5));
          G.FX.burst(this.x, this.y - 4, le.color, 5, 70);
        }
      } else if (this.walking && Math.random() < dt * 8) {
        G.FX.burst(this.x, this.y, le.slide ? '#ffffff' : '#b3defa', 2, 40);
      }
    }

    // --- apuntado: enemigo más cercano; si no hay, hacia donde caminas ---
    // Prioridad de blanco según el ataque activo:
    //   a distancia (proyectil, rayo): el jefe si está a tiro > lo que te toca > el más cercano
    //   cuerpo a cuerpo y el resto:   lo que te toca > el jefe > el más cercano
    // Con una horda encima casi siempre te toca algo; si eso ganara siempre,
    // los ataques a distancia no le darían nunca al jefe.
    // El jefe sólo cuenta si algún ataque del hueco le llega (#186, #208: con uno
    // cuerpo a cuerpo y el jefe a 200 px te quedabas quieto sin pegar a los de al
    // lado). Los de un vínculo que no le lleguen pegan al más cercano (combat.js).
    // Sin enemigos, apunta a la roca o cofre más cercano.
    const all = G.EnemyMgr.all();
    const m = this.activeMove();
    const ranged = !!m && (m.kind === 'projectile' || m.kind === 'beam' || m.kind === 'lob' || m.kind === 'cross' ||
                           m.kind === 'ricochet' || (m.kind === 'column' && m.anchor === 'target'));
    const threat = G.Projectiles.nearest(all, this.x, this.y, this.r + 24);
    let bossR = m ? 0 : 330;
    for (const a of this.activeGroup()) bossR = Math.max(bossR, Math.min(330, G.Combat.reach(a)));
    const boss = all.find(e => e.boss && !e.dead && G.U.dist(this.x, this.y, e.x, e.y) <= bossR);
    const tg = (ranged ? boss || threat : threat || boss)
            || G.Projectiles.nearest(all, this.x, this.y, 520)
            || G.World.nearestBreakable(this.x, this.y, 200);
    // Apuntar a mano (Ajustes > Accesibilidad): hacia el ratón o el stick derecho.
    // El blanco (para la cadena) es el enemigo que hay en esa dirección; si no
    // hay ninguno, el de siempre.
    const hand = this.handAim();
    this.manualAim = hand != null;
    if (hand != null) {
      this.aim = hand;
      this.target = this.enemyAlong(all, hand) || tg;
    } else {
      this.target = tg;
      if (tg) this.aim = Math.atan2(tg.y - this.y, tg.x - this.x);
      else if (this.walking) this.aim = this.moveAngle;
    }

    // --- animación: mira al objetivo al atacar, si no a donde camina ---
    const face = this.attackFace > 0 || !this.walking ? this.aim : this.moveAngle;
    this.anim.dir = G.Sprites.dirFromAngle(face);
    this.animTick(dt, s / 110);
  }

  /**
   * Ángulo de "Apuntar a mano", o null si toca apuntar solo. Manda lo último
   * que se haya usado: el stick derecho mientras se empuja; si no, el ratón si
   * se ha movido después (en PC). Soltar el stick sin tocar el ratón = solo.
   */
  handAim() {
    // En el móvil (táctil) no hay apuntado a mano: siempre apunta solo.
    if (this.remote || G.Settings.touch || !G.Settings.get('aimManual')) return null;
    const st = G.Pad.aim();
    if (st) return Math.atan2(st[1], st[0]);
    if (G.Touch.active || !G.Input.mouseMovedAt || G.Input.mouseMovedAt < G.Pad.aimAt) return null;
    const w = G.Input.mouseWorld();
    const dx = w.x - this.x, dy = w.y - (this.y - G.LIFT * 0.5);
    return Math.hypot(dx, dy) < 4 ? null : Math.atan2(dy, dx);
  }

  /** El enemigo más cercano dentro de ±25° de la dirección a (a menos de 520). */
  enemyAlong(all, a) {
    let best = null, bd = 520 * 520;
    const ca = Math.cos(a), sa = Math.sin(a), cosMax = Math.cos(0.44);
    for (const e of all) {
      if (e.dead) continue;
      const dx = e.x - this.x, dy = e.y - this.y, d2 = dx * dx + dy * dy;
      if (d2 >= bd || d2 < 1) continue;
      if ((dx * ca + dy * sa) / Math.sqrt(d2) < cosMax) continue;
      bd = d2; best = e;
    }
    return best;
  }

  /** Vuelve a levantarse (lo revive un compañero en cooperativo). */
  revive(frac = 0.5) {
    this.dead = false;
    this.hp = Math.max(1, this.maxHp * frac);
    this.invuln = 2;
    this.graceT = Math.max(this.graceT || 0, 2);   // ni la lava ni los ataques avisados la quitan
    this.reviveT = 0;
    this.anim._start('Idle', false);
    this.cheer(['Hop']);              // se levanta de un salto
    G.FX.ring(this.x, this.y, 6, 70, '#5fe08a', 0.5, 4);
    G.FX.burst(this.x, this.y - this.bodyH * 0.5, '#9dffb8', 18, 150);
    G.Audio.sfx('heal');
  }

  // ---------------- compañero (cooperativo) ----------------

  /**
   * Un compañero en otro ordenador: su dueño manda su estado (posición, vida,
   * movimiento activo...) y aquí se sigue con suavidad.
   * n = { x, y, ang, walk, hp, maxHp, dead, mv, ml, mag, aim, rev }
   */
  netUpdate(dt) {
    this.anim.update(dt);
    this.evoTick(dt);
    const n = this.net;
    if (!n) return;
    // Su fase (evoluciones en partida): la manda su dueño en cada envío. Una versión
    // anterior no la manda (fm 0): se le ve como el Pokémon que eligió.
    const fm = n.fm || this.dex;
    if (fm !== this.form && G.DEX_BY[fm]) {
      const evo = !!n.fm && this.formSeen;           // la primera vez, sin destello
      G.Sprites.preload([fm], 8000, this.shinyWant);
      this.evolve(Object.assign({}, G.DEX_BY[fm], { dex: this.dex, form: fm }), evo);
      if (evo && G.EvoUI) G.EvoUI.mateEvolved(this);
    }
    this.formSeen = true;
    if (this.flash > 0) this.flash -= dt;
    if (this.attackFace > 0) this.attackFace -= dt;
    if (G.U.dist2(this.x, this.y, n.x, n.y) > 300 * 300) { this.x = n.x; this.y = n.y; }
    else { this.x = G.U.damp(this.x, n.x, 14, dt); this.y = G.U.damp(this.y, n.y, 14, dt); }
    if (n.hp < this.hp - 0.5 && !n.dead) {
      this.flash = 0.14;
      // Se encoge con un golpe, no con lo poco que quita la Vidasfera a cada ataque.
      if (n.hp < this.hp - this.maxHp * 0.015) this.hurtAnim();
    }
    this.hp = n.hp; this.maxHp = n.maxHp;
    this.magnet = n.mag || this.magnet;
    this.reviveT = n.rev || 0;
    if (n.dead && !this.dead) { this.dead = true; this.anim.play('Faint', { hold: true }); G.Projectiles.clearOrbs(this); }
    else if (!n.dead && this.dead) this.revive(n.hp / (n.maxHp || 1));
    // Movimiento activo (para el halo, el HUD y los orbes).
    // El nivel que llega se ajusta igual que en Moves.instance (1..máximo, entero): si no,
    // un nivel raro no coincidiría nunca y el movimiento se rehacía en cada fotograma.
    const mdef = n.mv ? G.Moves.BY_ID[n.mv] : null;
    const ml = mdef && typeof n.ml === 'number' && n.ml > 1 ? Math.min(mdef.maxLvl, Math.floor(n.ml)) : 1;
    if (mdef && (!this.moves[0] || this.moves[0].id !== n.mv || this.moves[0].lvl !== ml)) {
      this.moves = [G.Moves.instance(n.mv, ml)];
      this.slots = [this.moves.slice()];
      this.active = 0;
      G.Projectiles.clearOrbs(this);
    }
    if (this.dead) return;
    this.walking = !!n.walk;
    this.moveAngle = n.ang;
    this.aim = n.aim;
    const face = this.attackFace > 0 || !this.walking ? this.aim : this.moveAngle;
    this.anim.dir = G.Sprites.dirFromAngle(face);
    this.animTick(dt, this.baseSpd / 110);
  }

  // ---------------- animaciones (Mundo Misterioso) ----------------
  /*
   * Qué animación hace según lo que pasa (26-10-2026): la de la familia del movimiento
   * al lanzarlo (los que giran, girar; los que golpean el suelo, saltar...), encogerse
   * al recibir un golpe, caer al morir (sprites.js), posar o saltar al subir de nivel y
   * al evolucionar, saltar al levantarse y dormirse si se queda un rato quieto sin
   * atacar (o enseguida en la pausa del cooperativo). Las extra (Rotate, Hop, Sleep,
   * Pose...) sólo si su Pokémon las tiene y ya están cargadas; si no, las de siempre.
   * Sólo se ve: no cambia nada del juego ni va por la red (en grupo, cada uno lo
   * calcula para los demás con lo que ya llega: sus ataques, su vida, si cae...).
   */
  /** Animaciones de cada familia al lanzar, de la preferida a la de siempre (la última). */
  static get CAST_ANIM() {
    return Player._castAnim || (Player._castAnim = {
      melee: ['Attack'], dash: ['Attack'], cross: ['Attack'],
      nova: ['Rotate', 'Attack'], spin: ['Rotate', 'Attack'], vortex: ['Rotate', 'Charge'],
      shove: ['Hop', 'Attack'], quake: ['Hop', 'Attack'],
      projectile: ['Shoot'], beam: ['Shoot'], boomerang: ['Shoot'], chain: ['Shoot'], cone: ['Shoot'], lob: ['Shoot'],
      knife: ['Shoot'], sweep: ['Shoot'], ricochet: ['Shoot'], puddle: ['Shoot'], homing: ['Shoot'], bounce: ['Shoot'],
      aura: ['Charge'], buff: ['Charge'], orbit: ['Charge'], mine: ['Charge'], meteor: ['Charge'], turret: ['Charge'],
      column: ['Charge'], wipe: ['Charge'], ward: ['Charge'], ally: ['Charge'], wings: ['Charge'], dusting: ['Charge'],
      charge: ['Charge'], stun: ['Charge'], trail: ['Walk']
    });
  }
  /** Segundos quieto y sin atacar hasta que se duerme. */
  static get NAP_T() { return 8; }

  /** Animación al lanzar un movimiento de la familia `kind` (una nueva sin apuntar: Attack). */
  pickAnim(kind) {
    let list = Player.CAST_ANIM[kind] || ['Attack'];
    // Con orbes se concentra y, una de cada tres veces, gira con ellos.
    if (kind === 'orbit' && (this.orbAnimN = (this.orbAnimN || 0) + 1) % 3 === 0) list = ['Rotate', 'Charge'];
    return G.Sprites.choose(this.form, this.shiny, list) || 'Attack';
  }

  /** Al recibir un golpe: se encoge (salvo a media animación de ataque) y se despierta. */
  hurtAnim() {
    this.calmT = 0;
    const a = this.anim;
    if (this.dead || (a.busy() && a.cur !== 'Hurt' && a.progress() < 0.5)) return;
    a.play('Hurt');
  }

  /** Posa o salta (subir de nivel, evolucionar, levantarse), si tiene con qué. */
  cheer(list = ['Pose', 'Hop']) {
    const k = G.Sprites.choose(this.form, this.shiny, list);
    if (k && !this.dead) { this.anim.play(k); this.calmT = 0; }
  }

  /** Animación de fondo (quieto, andar o dormido) y las de una vez por lo que ha pasado. k: velocidad al andar. */
  animTick(dt, k) {
    const a = this.anim;
    if (this.warmed !== a) { this.warmed = a; G.Sprites.warm(this.form, this.shiny); }   // sus extra, por detrás
    if (this.lvSeen != null && this.level > this.lvSeen) this.cheer();
    this.lvSeen = this.level;
    if (this.evoSeen && !this.evoFx) this.cheer();
    this.evoSeen = !!this.evoFx;
    this.calmT = this.walking || this.attackFace > 0 ? 0 : (this.calmT || 0) + dt;
    const nap = this.calmT > (this.frozen ? 1 : Player.NAP_T) && G.Sprites.ready(this.form, 'Sleep', this.shiny);
    a.sub = nap ? Player._nap || (Player._nap = { Idle: 'Sleep' }) : null;
    a.loop(this.walking ? 'Walk' : 'Idle', this.walking ? k : 1);
  }

  draw(ctx) {
    // Halo del tipo del movimiento activo, en el suelo.
    const m = this.activeMove();
    if (m && !this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = G.U.TYPE_COLOR[m.type];
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 1.5, this.r * 0.6, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
    G.Sprites.drawShadow(ctx, this.form, this.x, this.y, this.scale);
    // Movimiento Z activo: dos aros de su color que giran bajo los pies.
    if (this.z && this.z.t > 0 && !this.dead) {
      const t = performance.now() / 1000, rr = this.r * 2.3;
      ctx.save();
      ctx.strokeStyle = G.U.TYPE_COLOR[this.z.type];
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55 + Math.sin(t * 6) * 0.2;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, rr, rr * 0.42, 0, t * 3, t * 3 + 4.4); ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, rr * 1.25, rr * 0.52, 0, -t * 2, -t * 2 + 3.6); ctx.stroke();
      ctx.restore();
    }
    // Poder de altar: aro de su color latiendo bajo los pies.
    if (this.power && !this.dead) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 120) * 0.15;
      ctx.strokeStyle = this.power.def.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(this.x, this.y, this.r * 2.1, this.r * 0.85, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    const e = this.evoFx;
    if (e) {
      // Evolución: la silueta blanca pasa de la fase de antes a la nueva, cada vez
      // más deprisa (como en los juegos); al final se ve la nueva con un destello.
      const k = e.t / e.dur, f0 = 2.5, f1 = 16;
      const n = Math.floor(f0 * e.t + (f1 - f0) * e.t * k / 2);
      if (k > 0.88) this.anim.draw(ctx, this.x, this.y, { flash: true, softFlash: true, color: '#ffcb3d' });
      else (n % 2 ? this.anim : e.from).draw(ctx, this.x, this.y, { flash: true, color: '#ffffff' });
    } else {
      const alpha = this.invuln > 0 && !this.dead ? (Math.floor(this.invuln * 18) % 2 ? 0.45 : 1) : 1;
      this.anim.draw(ctx, this.x, this.y, { flash: this.flash > 0, softFlash: true, alpha, color: '#ffcb3d' });
    }

    // Arcos de buff alrededor de los pies.
    const COL = { atk: '#ff6b4d', patk: '#ff6b4d', satk: '#c47bff', spd: '#7fe0ff', def: '#b0b8c8', regen: '#5fe08a' };
    let i = 0;
    for (const k in this.buffs) {
      const b = this.buffs[k];
      if (b.n <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = COL[k];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * 1.8 + i * 5, (this.r * 1.8 + i * 5) * 0.42, 0, 0, 6.2832 * (b.n / 5));
      ctx.stroke();
      ctx.restore();
      i++;
    }

    // Vida bajo los pies (Ajustes: «Vida bajo tu Pokémon»); también la de los compañeros.
    if (!this.dead && G.Settings.get('hpUnder') !== false) {
      const f = G.U.clamp(this.hp / this.maxHp, 0, 1), bw = 26;
      const x = Math.round(this.x - bw / 2), y = Math.round(this.y + 8);
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(x - 1, y - 1, bw + 2, 5);
      ctx.fillStyle = f > 0.5 ? '#5fe08a' : f > 0.25 ? '#ffd23f' : '#ff5f6d';
      ctx.fillRect(x, y, Math.ceil(bw * f), 3);
    }

    // Cooperativo: anillo de "reviviendo" y nombre encima.
    if (this.dead && this.reviveT > 0) {
      ctx.save();
      ctx.strokeStyle = '#5fe08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r * 2.4, this.r * 1.0, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(1, this.reviveT / G.Player.REVIVE_TIME));
      ctx.stroke();
      ctx.restore();
    }
    if (this.tag) {
      // Nombre (Fredoka) y aviso (Nunito) con al menos 12 y 11 px en pantalla
      // (en el móvil, la cámara aleja); las letras se rehacen sólo si cambia el zoom.
      const T = Player._tagF || (Player._tagF = { s: 0, a: '', b: '', pa: 7, pb: 6 });
      if (T.s !== G.Camera.scale) {
        T.s = G.Camera.scale;
        T.pa = Math.max(7, 12 / (T.s || 1)); T.pb = Math.max(6, 11 / (T.s || 1));
        T.a = '600 ' + T.pa.toFixed(2) + 'px Fredoka,"Segoe UI",system-ui,sans-serif';
        T.b = '700 ' + T.pb.toFixed(2) + 'px Nunito,"Segoe UI",system-ui,sans-serif';
      }
      ctx.save();
      ctx.font = T.a;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      const y = this.y - this.bodyH - 8;
      ctx.lineWidth = T.pa * 0.34; ctx.strokeStyle = 'rgba(6,12,30,.82)';
      G.I18n.rawCanvas(ctx, 'strokeText', this.tag, this.x, y);
      ctx.fillStyle = this.dead ? '#ff8a96' : this.tagColor || '#fff';
      G.I18n.rawCanvas(ctx, 'fillText', this.tag, this.x, y);
      if (this.dead) {
        ctx.font = T.b;
        ctx.lineWidth = T.pb * 0.34;
        ctx.strokeText(this.revLabel || '', this.x, y - T.pa * 1.1);
        ctx.fillText(this.revLabel || '', this.x, y - T.pa * 1.1);
      }
      ctx.restore();
    }
  }
};
