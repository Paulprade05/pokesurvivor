/* ============ moves.js — catálogo de movimientos ============
 *
 * kind (comportamiento, implementado en systems/combat.js):
 *   projectile  dispara `count` proyectiles al enemigo más cercano
 *   melee       golpe en arco alrededor del Pokémon
 *   beam        rayo recto que atraviesa todo lo que pilla
 *   orbit       orbes que giran alrededor mientras el movimiento está activo
 *   nova        ráfaga radial en todas las direcciones
 *   aura        círculo de daño continuo alrededor
 *   buff        potencia al propio Pokémon (acumulable, caduca)
 *   ---- desde 2026-10-10 (mismos gráficos, otra forma de jugar) ----
 *   boomerang   sale hacia el enemigo y vuelve a ti, golpeando a la ida y a la vuelta
 *   chain       golpea a uno y salta a los `count` siguientes más cercanos
 *   mine        minas en el suelo que estallan al pisarlas
 *   meteor      caen `count` meteoros sobre enemigos cercanos (avisa la sombra)
 *   turret      deja algo que dispara solo durante `dur` segundos
 *   dash        cruzas hacia el enemigo golpeando todo el camino (sin recibir daño)
 *   trail       vas dejando charcos que dañan a lo que los pisa
 *   cone        muchos disparos cortos en abanico (aliento, chorro...)
 *   ---- desde 2026-10-19 (más ataques por tipo; mismos gráficos) ----
 *   homing      proyectiles que persiguen al enemigo
 *   bounce      un proyectil que rebota de enemigo en enemigo `bounce` veces
 *   charge      se carga `charge` s y sale un rayo enorme
 *   spin        giras golpeando todo alrededor `count` veces seguidas
 *   quake       una onda avanza por el suelo en línea: `count` explosiones
 *   vortex      un remolino atrae a los enemigos a su centro y les va dañando
 *   shove       onda alrededor que daña y aparta a los enemigos
 *   stun        zona con aviso que daña y deja aturdidos (quietos) `stun` s
 *   ---- desde 2026-10-22 (inspiradas en Vampire Survivors) ----
 *   lob         `count` proyectiles en parábola de pantalla: suben, caen sobre el enemigo y atraviesan
 *   knife       ráfaga de `count` disparos rápidos hacia donde MIRAS (no al enemigo)
 *   cross       `count` aspas repartidas a tu alrededor; con `curl` giran en espiral
 *   column      columnas de arriba abajo (`anchor` self: sobre ti; target: en el enemigo)
 *   sweep       rayo anclado en ti que gira como una aguja de reloj `dur` s
 *   ricochet    bola que rebota en los bordes de una caja fija alrededor de ti `dur` s
 *   wipe        barrido de pantalla: tras `delay` s alcanza a todos los de una caja fija
 *               (`mode` exec: debilita a los muy tocados · cut: quita `pct` de su vida y duerme)
 *   ward        escudos: gana uno cada `cd` s (hasta `count`); cada uno para un golpe y contraataca
 *   ally        `count` aliados que persiguen y golpean a los enemigos cercanos `dur` s
 *   wings       aves que vuelan en círculo lejos de ti y bombardean cada `rate` s
 *   puddle      frascos sobre enemigos: dejan charcos que dañan `dur` s
 *   dusting     lluvia de `count` caídas desde lo alto de la pantalla
 *
 * Pasivos de la run (cartas Amplitud, Persistencia, Réplica, Propulsión): ver
 * PASSIVE_RULES y applyPassives; cada instancia se rehace con rebake().
 *
 * Sólo el movimiento ACTIVO se ejecuta. Se cambia con 1-4 / Q / E.
 *
 * El icono no se guarda aquí: G.Icons lo compone (emblema del tipo +
 * insignia de la familia), ver ui/icons.js.
 *
 * Las mejoras (lvl 1 -> 5) salen de una escalera común por `kind` (o de la
 * propia del movimiento, LADDER_BY_ID: Canto Mortal y Brecha Negra):
 *   mods multiplicativos -> dmg, cd, speed, radius, dur, amount, arc
 *   mods aditivos        -> count, pierce, stacks
 */
(() => {
  const LADDERS = {
    projectile: [
      { t: '+1 proyectil',                  m: { count: 1, spread: 1.4 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+1 proyectil y +1 perforación',   m: { count: 1, pierce: 1, spread: 1.2 } }
    ],
    melee: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% alcance',                  m: { radius: 1.25 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: 'Golpea en 360° y +50% daño',    m: { arc: 9, dmg: 1.50 } }
    ],
    beam: [
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% alcance y grosor',         m: { radius: 1.30, width: 1.30 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } }
    ],
    orbit: [
      { t: '+1 orbe',                       m: { count: 1 } },
      { t: '+55% daño',                     m: { dmg: 1.55 } },
      { t: '+25% radio y gira más rápido',  m: { radius: 1.25, speed: 1.35 } },
      { t: '+1 orbe y +55% daño',           m: { count: 1, dmg: 1.55 } }
    ],
    nova: [
      { t: '+4 proyectiles',                m: { count: 4 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+4 proyectiles y +1 perforación', m: { count: 4, pierce: 1 } }
    ],
    aura: [
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: 'Golpea un 40% más a menudo',    m: { cd: 0.70 } },
      { t: '+30% radio y +50% daño',        m: { radius: 1.30, dmg: 1.50 } }
    ],
    boomerang: [
      { t: '+1 bumerán',                    m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% alcance',                  m: { radius: 1.30 } },
      { t: '+1 bumerán y +40% daño',        m: { count: 1, dmg: 1.40 } }
    ],
    chain: [
      { t: '+2 saltos',                     m: { count: 2 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+2 saltos y +40% daño',         m: { count: 2, dmg: 1.40 } }
    ],
    mine: [
      { t: '+1 mina',                       m: { count: 1 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '+30% radio de explosión',       m: { radius: 1.30 } },
      { t: '+1 mina y -25% recarga',        m: { count: 1, cd: 0.75 } }
    ],
    meteor: [
      { t: '+1 meteoro',                    m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+2 meteoros y -20% recarga',    m: { count: 2, cd: 0.80 } }
    ],
    turret: [
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: 'Dispara un 35% más rápido',     m: { rate: 0.74 } },
      { t: '+1 a la vez',                   m: { count: 1 } },
      { t: '+50% duración y +40% daño',     m: { dur: 1.50, dmg: 1.40 } }
    ],
    dash: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% distancia',                m: { radius: 1.30 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+60% daño y más ancho',         m: { dmg: 1.60, width: 1.40 } }
    ],
    trail: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+40% duración',                 m: { dur: 1.40 } },
      { t: 'Charcos un 30% más grandes',    m: { radius: 1.30 } },
      { t: '+50% daño y +30% radio',        m: { dmg: 1.50, radius: 1.30 } }
    ],
    cone: [
      { t: '+3 disparos',                   m: { count: 3 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% alcance',                  m: { life: 1.30 } },
      { t: '+3 disparos y +1 perforación',  m: { count: 3, pierce: 1 } }
    ],
    homing: [
      { t: '+1 proyectil',                  m: { count: 1, spread: 1.3 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+1 proyectil y +40% daño',      m: { count: 1, dmg: 1.40 } }
    ],
    bounce: [
      { t: '+1 rebote',                     m: { bounce: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+1 proyectil y +1 rebote',      m: { count: 1, bounce: 1, spread: 1.3 } }
    ],
    charge: [
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% alcance y grosor',         m: { radius: 1.30, width: 1.30 } },
      { t: 'Carga más rápido y -20% recarga', m: { charge: 0.7, cd: 0.8 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } }
    ],
    spin: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% radio',                    m: { radius: 1.25 } },
      { t: '+1 vuelta',                     m: { count: 1 } },
      { t: '-25% recarga y +30% daño',      m: { cd: 0.75, dmg: 1.30 } }
    ],
    quake: [
      { t: '+2 ondas',                      m: { count: 2 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+25% tamaño',                   m: { radius: 1.25 } },
      { t: '-25% recarga y +2 ondas',       m: { cd: 0.75, count: 2 } }
    ],
    vortex: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+50% duración',                 m: { dur: 1.50 } },
      { t: 'Atrae más fuerte y +40% daño',  m: { pull: 1.40, dmg: 1.40 } }
    ],
    shove: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% radio',                    m: { radius: 1.25 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+50% empuje y +40% daño',       m: { knock: 1.50, dmg: 1.40 } }
    ],
    stun: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% radio',                    m: { radius: 1.25 } },
      { t: '+50% aturdimiento',             m: { stun: 1.50 } },
      { t: '-25% recarga y +30% daño',      m: { cd: 0.75, dmg: 1.30 } }
    ],
    buff: [
      { t: '+1 acumulación máxima',         m: { stacks: 1 } },
      { t: '+40% potencia',                 m: { amount: 1.40 } },
      { t: '+50% duración',                 m: { dur: 1.50 } },
      { t: '+1 acumulación y +40% potencia', m: { stacks: 1, amount: 1.40 } }
    ],
    // ---- familias nuevas (22-10-2026) ----
    lob: [
      { t: '+1 proyectil',                  m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+1 perforación y más grandes',  m: { pierce: 1, size: 1.25 } },
      { t: '+1 proyectil y -20% recarga',   m: { count: 1, cd: 0.80 } }
    ],
    knife: [
      { t: '+1 disparo',                    m: { count: 1 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+1 disparo y +1 perforación',   m: { count: 1, pierce: 1 } },
      { t: '-25% recarga y +30% daño',      m: { cd: 0.75, dmg: 1.30 } }
    ],
    cross: [
      { t: '+2 aspas',                      m: { count: 2 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+1 perforación y +25% alcance', m: { pierce: 1, life: 1.25 } },
      { t: '+2 aspas y -20% recarga',       m: { count: 2, cd: 0.80 } }
    ],
    column: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+1 columna',                    m: { count: 1 } },
      { t: '+25% de alto y de ancho',       m: { height: 1.25, width: 1.25 } },
      { t: '+1 columna y -15% recarga',     m: { count: 1, cd: 0.85 } }
    ],
    sweep: [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% de largo',                 m: { radius: 1.25 } },
      { t: '+1 rayo',                       m: { count: 1 } },
      { t: 'Gira un 30% más rápido y +40% daño', m: { turn: 1.30, dmg: 1.40 } }
    ],
    ricochet: [
      { t: '+1 proyectil',                  m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+40% duración y +20% velocidad', m: { dur: 1.40, speed: 1.20 } },
      { t: '+1 proyectil y +40% daño',      m: { count: 1, dmg: 1.40 } }
    ],
    // (Los barridos llevan cada uno la suya: LADDER_BY_ID.)
    wipe: [
      { t: '+10% de efecto',                m: { pct: 0.10 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '-15% recarga',                  m: { cd: 0.85 } },
      { t: '+10% de efecto y -15% recarga', m: { pct: 0.10, cd: 0.85 } }
    ],
    ward: [
      { t: '+1 escudo',                     m: { count: 1 } },
      { t: '+50% daño del contraataque',    m: { dmg: 1.50 } },
      { t: '-20% recarga de los escudos',   m: { cd: 0.80 } },
      { t: '+1 escudo y +30% radio del contraataque', m: { count: 1, radius: 1.30 } }
    ],
    ally: [
      { t: '+1 aliado',                     m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+40% duración y +20% velocidad', m: { dur: 1.40, speed: 1.20 } },
      { t: '+1 aliado y +40% daño',         m: { count: 1, dmg: 1.40 } }
    ],
    wings: [
      { t: '+1 ave',                        m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+30% explosión y bombardean un 15% más a menudo', m: { radius: 1.30, rate: 0.85 } },
      { t: '+1 ave y +40% daño',            m: { count: 1, dmg: 1.40 } }
    ],
    puddle: [
      { t: '+1 charco',                     m: { count: 1 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+50% duración y +40% daño',     m: { dur: 1.50, dmg: 1.40 } }
    ],
    dusting: [
      { t: '+4 caídas',                     m: { count: 4 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% tamaño y caen un 20% más rápido', m: { size: 1.30, speed: 1.20 } },
      { t: '+4 caídas y -20% recarga',      m: { count: 4, cd: 0.80 } }
    ]
  };

  // Escaleras propias de un movimiento (si no, la de su familia).
  const LADDER_BY_ID = {
    'perish-song': [
      { t: '+10% al umbral de KO',          m: { pct: 0.10 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '-15% recarga',                  m: { cd: 0.85 } },
      { t: '+10% al umbral de KO y -15% recarga', m: { pct: 0.10, cd: 0.85 } }
    ],
    'dark-void': [
      { t: '+10% de vida quitada',          m: { pct: 0.10 } },
      { t: '+40% de sueño',                 m: { stun: 1.40 } },
      { t: '-15% recarga',                  m: { cd: 0.85 } },
      { t: '+10% de vida quitada y +50% daño', m: { pct: 0.10, dmg: 1.50 } }
    ]
  };
  // -- ataques únicos: Roca, Fantasma, Dragón, Siniestro, Acero, Hada (26-10-2026) --
  // Los que ya no encajan con la escalera de su familia (la gema se parte, el remolino gira...).
  Object.assign(LADDER_BY_ID, {
    'power-gem': [
      { t: '+1 gema',                       m: { count: 1, spread: 1.3 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: 'Se parte una vez más y +30% daño', m: { bounce: 1, dmg: 1.30 } }
    ],
    'ominous-wind': [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+30% radio',                    m: { radius: 1.30 } },
      { t: '+50% duración',                 m: { dur: 1.50 } },
      { t: 'Gira más fuerte y +40% daño',   m: { pull: 1.40, dmg: 1.40 } }
    ],
    'play-rough': [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: 'Nube un 25% más grande',        m: { radius: 1.25 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+3 golpes en la nube y +50% daño', m: { count: 3, dmg: 1.50 } }
    ],
    'steel-wing': [
      { t: '+1 ave',                        m: { count: 1 } },
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: 'Pasadas un 30% más anchas y un 15% más seguidas', m: { radius: 1.30, rate: 0.85 } },
      { t: '+1 ave y +40% daño',            m: { count: 1, dmg: 1.40 } }
    ]
  });

  // (23-10-2026: daños retocados con tools/balance.cjs, que lanza cada ataque contra un jefe
  //  y contra una horda con el combate de verdad: ninguno muy por encima ni por debajo del
  //  resto a su nivel. Bajan Puño Meteoro, Enfado, Púas, Rueda Fuego, Cañón Floral, Látigo
  //  Cepa, Carantoña, Garra Dragón, Golpe Kárate, Tormenta Floral y Giro Bola; suben los
  //  rayos, cadenas, torretas, aturdir, aspas, rebotes, remolinos, ráfagas y lluvias.)
  const RAW = [
    // ---------------- NORMAL (pool común a todos) ----------------
    { id: 'tackle', name: 'Placaje', type: 'normal', kind: 'melee',
      desc: 'Embiste en arco a todo lo que tengas delante.',
      cd: 0.50, dmg: 13, radius: 48, arc: 1.7, knock: 90 },

    { id: 'quick-attack', name: 'Ataque Rápido', type: 'normal', kind: 'dash',
      desc: 'Cruzas como un rayo hacia el enemigo y golpeas todo el camino.',
      cd: 0.75, dmg: 22, radius: 110, width: 34, knock: 40 },

    { id: 'swords-dance', name: 'Danza Espada', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula ATAQUE (físico) mientras esté activo.',
      cd: 0.85, stat: 'patk', amount: 0.13, dur: 7, stacks: 5 },
    // Como Danza Espada, para los especiales (en los juegos es Siniestro; aquí
    // va en el grupo Normal para que la pueda aprender cualquiera).
    { id: 'nasty-plot', name: 'Maquinación', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula ATAQUE ESPECIAL mientras esté activo.',
      cd: 0.85, stat: 'satk', amount: 0.13, dur: 7, stacks: 5 },

    { id: 'agility', name: 'Agilidad', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula VELOCIDAD mientras esté activo.',
      cd: 0.85, stat: 'spd', amount: 0.10, dur: 7, stacks: 5 },

    { id: 'harden', name: 'Fortaleza', type: 'normal', kind: 'buff',
      desc: 'No hace daño: acumula DEFENSA mientras esté activo.',
      cd: 0.85, stat: 'def', amount: 0.07, dur: 7, stacks: 5 },

    // ---------------- FUEGO ----------------
    { id: 'ember', name: 'Ascuas', type: 'fire', kind: 'projectile',
      desc: 'Bola de fuego al enemigo más cercano.',
      cd: 0.52, dmg: 18, speed: 310, count: 1, spread: 0.12, pierce: 0, life: 1.6, size: 7, burn: 1 },

    { id: 'flamethrower', name: 'Lanzallamas', type: 'fire', kind: 'cone',
      desc: 'Chorro de llamas en abanico corto que quema.',
      cd: 0.70, dmg: 7, count: 7, arc: 0.9, speed: 380, life: 0.42, size: 6, pierce: 1, burn: 1 },

    { id: 'fire-spin', name: 'Giro Fuego', type: 'fire', kind: 'orbit',
      desc: 'Llamas que giran a tu alrededor. Defensa constante.',
      cd: 0.30, dmg: 14, count: 3, radius: 62, speed: 2.4, size: 9, burn: 1 },

    { id: 'heat-wave', name: 'Onda Ígnea', type: 'fire', kind: 'nova',
      desc: 'Explota en llamas en todas las direcciones.',
      cd: 1.25, dmg: 13, speed: 250, count: 10, pierce: 1, life: 1.1, size: 7, burn: 1 },

    // ---------------- AGUA ----------------
    { id: 'water-gun', name: 'Pistola Agua', type: 'water', kind: 'projectile',
      desc: 'Chorro perforante. Fiable a cualquier distancia.',
      cd: 0.44, dmg: 14, speed: 350, count: 1, spread: 0.10, pierce: 1, life: 1.5, size: 6 },

    { id: 'bubble', name: 'Burbuja', type: 'water', kind: 'nova',
      desc: 'Burbujas en abanico que ralentizan a quien tocan.',
      cd: 1.00, dmg: 10, speed: 210, count: 8, pierce: 0, life: 1.3, size: 8, slow: 0.45 },

    { id: 'hydro-pump', name: 'Hidrobomba', type: 'water', kind: 'beam',
      desc: 'Cañonazo de agua lento pero devastador.',
      cd: 1.50, dmg: 35, radius: 250, width: 30 },

    { id: 'aqua-ring', name: 'Acua Aro', type: 'water', kind: 'buff',
      desc: 'No hace daño: acumula REGENERACIÓN de vida.',
      cd: 0.90, stat: 'regen', amount: 1.6, dur: 8, stacks: 4 },

    // ---------------- PLANTA ----------------
    { id: 'vine-whip', name: 'Látigo Cepa', type: 'grass', kind: 'melee',
      desc: 'Látigos de largo alcance en arco amplio.',
      cd: 0.62, dmg: 13, radius: 68, arc: 1.3, knock: 60 },

    { id: 'razor-leaf', name: 'Hoja Afilada', type: 'grass', kind: 'boomerang',
      desc: 'Dos hojas que van y vuelven cortando a la ida y a la vuelta.',
      cd: 0.90, dmg: 10, speed: 330, count: 2, spread: 0.5, radius: 210, size: 6 },

    { id: 'leaf-storm', name: 'Tormenta Floral', type: 'grass', kind: 'orbit',
      desc: 'Un ciclón de hojas gira amplio a tu alrededor.',
      cd: 0.26, dmg: 13, count: 4, radius: 74, speed: 2.6, size: 8 },

    // (Antes Gigadrenado: curaba con cada golpe y estaba roto. Mismo id para no romper partidas.)
    { id: 'giga-drain', name: 'Hierba Lazo', type: 'grass', kind: 'aura',
      desc: 'Raíces que atrapan y machacan todo lo que tienes cerca.',
      cd: 0.55, dmg: 9, radius: 76 },

    // ---------------- ELÉCTRICO ----------------
    { id: 'thunder-shock', name: 'Impactrueno', type: 'electric', kind: 'projectile',
      desc: 'Descarga rapidísima que atraviesa varios enemigos.',
      cd: 0.40, dmg: 13, speed: 480, count: 1, spread: 0.08, pierce: 2, life: 1.1, size: 5 },

    { id: 'discharge', name: 'Chispazo', type: 'electric', kind: 'aura',
      desc: 'Campo eléctrico permanente alrededor de ti.',
      cd: 0.45, dmg: 8, radius: 70 },

    { id: 'thunderbolt', name: 'Rayo', type: 'electric', kind: 'chain',
      desc: 'Un rayo que salta de un enemigo a otro.',
      cd: 0.95, dmg: 29, count: 4, radius: 140 },

    // ---------------- PSÍQUICO ----------------
    // (11-10-2026: -22/-30 % de daño y persiguen menos; llenaban el ranking.)
    { id: 'confusion', name: 'Confusión', type: 'psychic', kind: 'projectile',
      desc: 'Onda que persigue sola a su objetivo.',
      cd: 0.58, dmg: 13, speed: 280, count: 1, spread: 0.1, pierce: 0, life: 2.2, size: 8, homing: 2.0 },

    { id: 'psybeam', name: 'Psicorrayo', type: 'psychic', kind: 'beam',
      desc: 'Rayo psíquico ancho y contundente.',
      cd: 1.15, dmg: 23, radius: 215, width: 40 },

    { id: 'psychic', name: 'Psíquico', type: 'psychic', kind: 'nova',
      desc: 'Estallido mental radial que busca enemigos.',
      cd: 1.35, dmg: 11, speed: 230, count: 12, pierce: 1, life: 1.6, size: 7, homing: 1.0 },

    // ---------------- TIPOS SECUNDARIOS ----------------
    { id: 'sludge', name: 'Residuos', type: 'poison', kind: 'projectile',
      desc: 'Lodo tóxico que envenena al impactar.',
      cd: 0.60, dmg: 17, speed: 290, count: 1, spread: 0.12, pierce: 0, life: 1.5, size: 8, poison: 1 },

    { id: 'mud-shot', name: 'Disparo Lodo', type: 'ground', kind: 'nova',
      desc: 'Salpica lodo alrededor y ralentiza.',
      cd: 1.10, dmg: 12, speed: 200, count: 7, pierce: 0, life: 1.0, size: 9, slow: 0.4 },

    { id: 'gust', name: 'Tornado', type: 'flying', kind: 'orbit',
      desc: 'Remolinos de viento que te escoltan.',
      cd: 0.26, dmg: 13, count: 3, radius: 72, speed: 2.8, size: 8, knock: 40 },

    { id: 'wing-attack', name: 'Ataque Ala', type: 'flying', kind: 'melee',
      desc: 'Barrido de alas amplio que empuja.',
      cd: 0.55, dmg: 14, radius: 58, arc: 1.9, knock: 70 },

    // ---------------- NORMAL (extra) ----------------
    { id: 'body-slam', name: 'Golpe Cuerpo', type: 'normal', kind: 'melee',
      desc: 'Placaje con todo el peso: lento, corto y brutal.',
      cd: 0.95, dmg: 30, radius: 46, arc: 2.2, knock: 140 },

    { id: 'hyper-voice', name: 'Vozarrón', type: 'normal', kind: 'nova',
      desc: 'Onda sonora que sale en todas direcciones.',
      cd: 1.15, dmg: 12, speed: 260, count: 9, pierce: 1, life: 0.9, size: 7 },

    // ---------------- VENENO (extra) ----------------
    { id: 'poison-sting', name: 'Picotazo Veneno', type: 'poison', kind: 'projectile',
      desc: 'Aguijón rápido que envenena.',
      cd: 0.34, dmg: 8, speed: 420, count: 1, spread: 0.08, pierce: 0, life: 1.0, size: 4, poison: 1 },

    { id: 'toxic', name: 'Tóxico', type: 'poison', kind: 'trail',
      desc: 'Vas dejando charcos de veneno que intoxican a quien los pisa.',
      cd: 0.3, dmg: 6, radius: 26, dur: 3, poison: 1 },

    // ---------------- TIERRA (extra) ----------------
    { id: 'bulldoze', name: 'Terratemblor', type: 'ground', kind: 'aura',
      desc: 'Sacude el suelo: daña y frena a lo cercano.',
      cd: 0.7, dmg: 11, radius: 80, slow: 0.35 },

    // ---------------- BICHO ----------------
    { id: 'bug-bite', name: 'Picadura', type: 'bug', kind: 'melee',
      desc: 'Mordisco rápido en arco corto.',
      cd: 0.42, dmg: 11, radius: 44, arc: 1.6, knock: 40 },

    { id: 'string-shot', name: 'Disparo Demora', type: 'bug', kind: 'mine',
      desc: 'Deja telarañas en el suelo que atrapan y frenan mucho al que las pisa.',
      cd: 1.1, dmg: 14, count: 2, radius: 56, dur: 7, slow: 0.6 },

    { id: 'bug-buzz', name: 'Zumbido', type: 'bug', kind: 'aura',
      desc: 'Vibración constante que machaca lo cercano.',
      cd: 0.45, dmg: 8, radius: 66 },

    // ---------------- ROCA ----------------
    // (26-10-2026: ataques únicos de Roca, Fantasma, Dragón, Siniestro, Acero y Hada: lo propio de
    //  cada uno, en combat.js, MECH3; hold, roll, wall... son números suyos que sólo lee su mecánica.)
    { id: 'rock-throw', name: 'Lanzarrocas', type: 'rock', kind: 'projectile',
      desc: 'Pedrusco pesado que empuja y se queda 2,5 s en el suelo como barricada: los enemigos lo rodean y para sus disparos.',
      cd: 0.7, dmg: 27, speed: 260, count: 1, spread: 0.12, pierce: 0, life: 1.1, size: 9, knock: 90, hold: 2.5 },

    { id: 'rock-slide', name: 'Avalancha', type: 'rock', kind: 'meteor',
      desc: 'Caen rocas del cielo sobre los enemigos y luego ruedan pantalla abajo arrollando e interrumpiendo a los que pillan.',
      cd: 1.3, dmg: 12, count: 3, radius: 46, knock: 50, roll: 100 },     // (12-10-2026: era 26; mataba el doble que la media)

    // ---------------- HIELO ----------------
    { id: 'ice-beam', name: 'Rayo Hielo', type: 'ice', kind: 'beam',
      desc: 'Rayo helado que congela casi del todo.',
      cd: 1.1, dmg: 26, radius: 220, width: 30, slow: 0.7 },

    { id: 'powder-snow', name: 'Nieve Polvo', type: 'ice', kind: 'aura',
      desc: 'Ventisca a tu alrededor que ralentiza.',
      cd: 0.55, dmg: 8, radius: 76, slow: 0.45 },

    // ---------------- LUCHA ----------------
    { id: 'karate-chop', name: 'Golpe Kárate', type: 'fighting', kind: 'melee',
      desc: 'Golpe seco y potente al frente.',
      cd: 0.5, dmg: 16, radius: 50, arc: 1.2, knock: 110 },

    { id: 'aura-sphere', name: 'Esfera Aural', type: 'fighting', kind: 'projectile',
      desc: 'Esfera de energía que nunca falla.',
      cd: 0.62, dmg: 17, speed: 300, count: 1, spread: 0.1, pierce: 0, life: 2.0, size: 8, homing: 4 },

    // ---------------- FANTASMA ----------------
    { id: 'lick', name: 'Lengüetazo', type: 'ghost', kind: 'melee',
      desc: 'Un lametazo largo en línea que atraviesa paredes y deja paralizado al enemigo 2 s.',
      cd: 0.48, dmg: 12, radius: 48, arc: 1.8, para: 2 },

    { id: 'shadow-ball', name: 'Bola Sombra', type: 'ghost', kind: 'projectile',
      desc: 'Una esfera oscura que crece y pega un 15% más con cada enemigo que atraviesa; a veces les baja la defensa.',
      cd: 0.66, dmg: 13, speed: 280, count: 1, spread: 0.1, pierce: 2, life: 1.6, size: 9 },

    // ---------------- DRAGÓN ----------------
    { id: 'dragon-rage', name: 'Furia Dragón', type: 'dragon', kind: 'beam',
      desc: 'Una llamarada dracónica en línea que se enfurece si sigues atacando al mismo enemigo: +25% cada vez, hasta ×2.',
      cd: 1.0, dmg: 20, radius: 230, width: 34 },

    { id: 'dragon-dance', name: 'Danza Dragón', type: 'dragon', kind: 'buff',
      desc: 'No hace daño: cada pila sube a la vez tu ATAQUE (físico) y tu VELOCIDAD.',
      cd: 0.7, stat: 'patk', amount: 0.08, dur: 7, stacks: 5 },

    // ---------------- HADA ----------------
    { id: 'fairy-wind', name: 'Viento Feérico', type: 'fairy', kind: 'nova',
      desc: 'Una brisa mágica en todas direcciones que aparta un poco a los enemigos y te trae la experiencia y los objetos que toca.',
      cd: 1.0, dmg: 11, speed: 230, count: 10, pierce: 0, life: 1.2, size: 7, knock: 30 },

    { id: 'dazzling-gleam', name: 'Brillo Mágico', type: 'fairy', kind: 'aura',
      desc: 'Un destello a tu alrededor que deslumbra: ×1,6 a los que vienen hacia ti y ×0,7 a los que te dan la espalda.',
      cd: 0.5, dmg: 6, radius: 72 },

    // ---------------- ACERO ----------------
    { id: 'metal-claw', name: 'Garra Metal', type: 'steel', kind: 'melee',
      desc: 'Un zarpazo de ida y vuelta: el de vuelta llega justo después y es crítico si el de ida acertó.',
      cd: 0.5, dmg: 7, radius: 50, arc: 1.6, knock: 60 },

    { id: 'flash-cannon', name: 'Foco Resplandor', type: 'steel', kind: 'beam',
      desc: 'Un rayo de luz metálica que se refleja en las paredes y en los objetos sólidos hasta 2 veces.',
      cd: 1.05, dmg: 24, radius: 220, width: 30, reflect: 2 },

    // ---------------- SINIESTRO ----------------
    { id: 'bite', name: 'Mordisco', type: 'dark', kind: 'melee',
      desc: 'Muerdes y no sueltas: arrastras al enemigo delante de ti 0,5 s con tres mordiscos y le interrumpes lo que preparaba.',
      cd: 0.45, dmg: 12, radius: 46, arc: 1.5, knock: 0 },

    { id: 'dark-pulse', name: 'Pulso Umbrío', type: 'dark', kind: 'nova',
      desc: 'Una onda oscura en todas direcciones que se contagia: cada enemigo alcanzado suelta su propio pulso y a veces se le interrumpe el ataque.',
      cd: 1.15, dmg: 9.5, speed: 240, count: 10, pierce: 1, life: 1.1, size: 8 },

    { id: 'night-shade', name: 'Tinieblas', type: 'dark', kind: 'aura',
      desc: 'Una sombra te rodea: hace un daño fijo según tu nivel (sin tipos ni defensas) y engaña a los de dentro, que a veces disparan hacia atrás.',
      cd: 0.5, dmg: 9, radius: 72 },

    // ---------------- NUEVOS (2026-10-10): mismas formas, otras mecánicas ----------------
    { id: 'bonemerang', name: 'Huesomerang', type: 'ground', kind: 'boomerang',
      desc: 'Un hueso que va y vuelve golpeando fuerte.',
      cd: 0.95, dmg: 16, speed: 300, count: 1, radius: 230, size: 8, knock: 40 },

    { id: 'psycho-cut', name: 'Psicocorte', type: 'psychic', kind: 'boomerang',
      desc: 'Cuchillas psíquicas que vuelven a ti.',
      cd: 0.8, dmg: 9, speed: 360, count: 2, spread: 0.6, radius: 200, size: 7 },

    { id: 'spikes', name: 'Púas', type: 'ground', kind: 'mine',
      desc: 'Siembra púas que estallan al pisarlas.',
      cd: 1.2, dmg: 15, count: 2, radius: 60, dur: 8 },

    { id: 'toxic-spikes', name: 'Púas Tóxicas', type: 'poison', kind: 'mine',
      desc: 'Púas venenosas que envenenan mucho al estallar.',
      cd: 1.1, dmg: 11, count: 2, radius: 56, dur: 8, poison: 2 },

    { id: 'hail', name: 'Granizo', type: 'ice', kind: 'meteor',
      desc: 'Bolas de hielo caen sobre los enemigos y los frenan.',
      cd: 1.2, dmg: 18, count: 4, radius: 40, slow: 0.4 },

    { id: 'meteor-mash', name: 'Puño Meteoro', type: 'steel', kind: 'meteor',
      desc: 'Puños meteoro que caen sobre los enemigos y rebotan hacia el siguiente más cercano (2 rebotes).',
      cd: 1.4, dmg: 10, count: 2, radius: 54, knock: 80, hops: 2 },

    { id: 'will-o-wisp', name: 'Fuego Fatuo', type: 'fire', kind: 'turret',
      desc: 'Deja una llama flotante que dispara sola y quema.',
      cd: 3.5, dmg: 18, rate: 0.55, dur: 6, count: 1, range: 300, speed: 300, size: 7, burn: 1 },

    { id: 'substitute', name: 'Sustituto', type: 'normal', kind: 'turret',
      desc: 'Un muñeco que se queda disparando por ti.',
      cd: 4.0, dmg: 17, rate: 0.4, dur: 6, count: 1, range: 280, speed: 320, size: 6 },

    { id: 'aerial-ace', name: 'Golpe Aéreo', type: 'flying', kind: 'dash',
      desc: 'Te lanzas en picado y cortas todo lo que cruzas.',
      cd: 0.75, dmg: 18, radius: 120, width: 40, knock: 60 },

    { id: 'flame-wheel', name: 'Rueda Fuego', type: 'fire', kind: 'trail',
      desc: 'Corres envuelto en fuego y dejas un rastro de llamas.',
      cd: 0.28, dmg: 8, radius: 28, dur: 2.6, burn: 1 },

    { id: 'bubble-beam', name: 'Rayo Burbuja', type: 'water', kind: 'cone',
      desc: 'Chorro de burbujas en abanico corto que frena.',
      cd: 0.65, dmg: 6, count: 7, arc: 1.0, speed: 340, life: 0.45, size: 6, slow: 0.3 },

    { id: 'hex', name: 'Infortunio', type: 'ghost', kind: 'chain',
      desc: 'Una maldición que salta entre enemigos con algún estado (×1,7) y se los alarga 1 s; deja malditos a los que toca.',
      cd: 0.9, dmg: 23, count: 4, radius: 150, hex: 1.7 },

    // ================= NUEVOS (19-10-2026): todos los tipos con 5 o más =================
    // Normal
    { id: 'hyper-beam', name: 'Hiperrayo', type: 'normal', kind: 'charge',
      desc: 'Se carga un momento y suelta un rayo enorme que lo atraviesa todo.',
      cd: 2.2, charge: 0.75, dmg: 58, radius: 300, width: 44 },
    { id: 'rapid-spin', name: 'Giro Rápido', type: 'normal', kind: 'spin',
      desc: 'Giras sobre ti mismo golpeando todo lo que te rodea varias veces.',
      cd: 1.0, dmg: 9, count: 3, radius: 62 },
    // Fuego
    { id: 'flame-charge', name: 'Nitrocarga', type: 'fire', kind: 'dash',
      desc: 'Te lanzas envuelto en llamas y quemas todo el camino.',
      cd: 0.8, dmg: 19, radius: 115, width: 36, burn: 1 },
    // Agua
    { id: 'whirlpool', name: 'Torbellino', type: 'water', kind: 'vortex',
      desc: 'Un remolino que arrastra a los enemigos a su centro y los va dañando.',
      cd: 3.0, dmg: 11, radius: 72, dur: 2.6, pull: 150 },
    // Planta
    { id: 'seed-bomb', name: 'Bomba Germen', type: 'grass', kind: 'bounce',
      desc: 'Una semilla que rebota de enemigo en enemigo.',
      cd: 0.6, dmg: 12, speed: 320, life: 1.6, size: 7, bounce: 3 },
    { id: 'energy-ball', name: 'Energibola', type: 'grass', kind: 'homing',
      desc: 'Una bola de energía que persigue al enemigo.',
      cd: 0.62, dmg: 19, speed: 280, life: 2.0, size: 8, homing: 5 },
    { id: 'solar-beam', name: 'Rayo Solar', type: 'grass', kind: 'charge',
      desc: 'Absorbe luz un momento y la suelta en un rayo enorme.',
      cd: 2.3, charge: 0.85, dmg: 62, radius: 290, width: 40 },
    // Eléctrico
    { id: 'thunder-wave', name: 'Onda Trueno', type: 'electric', kind: 'stun',
      desc: 'Una descarga que avisa en el suelo y deja paralizados a los que pilla.',
      cd: 1.6, dmg: 28, radius: 58, stun: 1.0 },
    { id: 'electro-ball', name: 'Bola Voltio', type: 'electric', kind: 'bounce',
      desc: 'Una bola eléctrica que salta de enemigo en enemigo.',
      cd: 0.62, dmg: 12, speed: 340, life: 1.6, size: 7, bounce: 3 },
    // Psíquico
    { id: 'extrasensory', name: 'Paranormal', type: 'psychic', kind: 'shove',
      desc: 'Una onda mental que daña y aparta a todos los que tienes cerca.',
      cd: 1.2, dmg: 16, radius: 92, knock: 320 },
    { id: 'mist-ball', name: 'Bola Neblina', type: 'psychic', kind: 'homing',
      desc: 'Una bola de bruma que persigue al enemigo y le frena.',
      cd: 0.55, dmg: 13, speed: 270, life: 2.0, size: 8, homing: 5, slow: 0.3 },
    // Veneno
    { id: 'acid-spray', name: 'Bomba Ácida', type: 'poison', kind: 'bounce',
      desc: 'Un chorro ácido que salta entre enemigos y los envenena.',
      cd: 0.66, dmg: 8, speed: 310, life: 1.6, size: 7, bounce: 3, poison: 1 },
    // Tierra
    { id: 'sand-tomb', name: 'Bucle Arena', type: 'ground', kind: 'vortex',
      desc: 'Un remolino de arena que atrapa y arrastra a los enemigos.',
      cd: 3.0, dmg: 11, radius: 70, dur: 2.6, pull: 140 },
    { id: 'magnitude', name: 'Magnitud', type: 'ground', kind: 'quake',
      desc: 'El suelo revienta en línea delante de ti, onda tras onda.',
      cd: 1.15, dmg: 18, count: 6, radius: 30 },
    // Volador
    { id: 'whirlwind', name: 'Remolino', type: 'flying', kind: 'shove',
      desc: 'Un golpe de viento que barre a todos los que tienes cerca.',
      cd: 1.1, dmg: 15, radius: 96, knock: 360 },
    { id: 'air-slash', name: 'Tajo Aéreo', type: 'flying', kind: 'homing',
      desc: 'Dos cuchillas de aire que buscan al enemigo.',
      cd: 0.55, dmg: 11, count: 2, spread: 0.35, speed: 330, life: 1.6, size: 7, homing: 4 },
    // Bicho
    { id: 'signal-beam', name: 'Rayo Señal', type: 'bug', kind: 'bounce',
      desc: 'Un destello que rebota entre los enemigos.',
      cd: 0.6, dmg: 12, speed: 340, life: 1.6, size: 7, bounce: 3 },
    { id: 'u-turn', name: 'Ida y Vuelta', type: 'bug', kind: 'dash',
      desc: 'Cruzas entre los enemigos golpeando a todos los del camino.',
      cd: 0.7, dmg: 17, radius: 120, width: 34 },
    // Roca
    { id: 'rock-tomb', name: 'Tumba Rocas', type: 'rock', kind: 'stun',
      desc: 'Caen seis rocas en anillo alrededor del enemigo: lo encierran 3 s, lo frenan y no dejan entrar a nadie. Paran los disparos.',
      cd: 1.7, dmg: 42, radius: 56, stun: 0.5, slow: 0.4, wall: 3 },
    { id: 'ancient-power', name: 'Poder Pasado', type: 'rock', kind: 'orbit',
      desc: 'Rocas antiguas giran a tu alrededor y cada 2 s salen disparadas al enemigo más cercano y vuelven a crecer. A veces te suben todas las stats.',
      cd: 0.28, dmg: 13, count: 3, radius: 70, speed: 2.6, size: 9 },
    // (bounce: las veces que se parte la gema, no rebotes; ver LADDER_BY_ID.)
    { id: 'power-gem', name: 'Joya de Luz', type: 'rock', kind: 'bounce',
      desc: 'Una gema que se parte en dos cada vez que golpea a un enemigo (hasta 4 ramas).',
      cd: 0.66, dmg: 13, speed: 320, life: 1.2, size: 8, bounce: 2 },
    // Hielo
    { id: 'ice-shard', name: 'Canto Helado', type: 'ice', kind: 'homing',
      desc: 'Esquirlas rapidísimas que persiguen al enemigo.',
      cd: 0.32, dmg: 9, speed: 380, life: 1.5, size: 6, homing: 7 },
    { id: 'freeze-dry', name: 'Liofilización', type: 'ice', kind: 'stun',
      desc: 'Un frío repentino que avisa en el suelo y deja congelados a los que pilla.',
      cd: 1.6, dmg: 27, radius: 60, stun: 1.0 },
    // Lucha
    { id: 'rolling-kick', name: 'Patada Giro', type: 'fighting', kind: 'spin',
      desc: 'Patadas en giro que golpean todo lo que tienes alrededor.',
      cd: 0.95, dmg: 11, count: 3, radius: 60 },
    { id: 'vacuum-wave', name: 'Onda Vacío', type: 'fighting', kind: 'shove',
      desc: 'Un puñetazo al aire que lanza una onda y aparta a los enemigos.',
      cd: 1.1, dmg: 17, radius: 88, knock: 330 },
    { id: 'dynamic-punch', name: 'Puño Dinámico', type: 'fighting', kind: 'stun',
      desc: 'Un puñetazo tremendo donde avisa el suelo: deja aturdidos a los que pilla.',
      cd: 1.7, dmg: 36, radius: 54, stun: 0.9 },
    // Fantasma
    { id: 'shadow-sneak', name: 'Sombra Vil', type: 'ghost', kind: 'homing',
      desc: 'Tu sombra se estira al instante por el suelo hasta el enemigo y lo deja clavado 0,6 s (no se mueve, pero puede disparar).',
      cd: 0.45, dmg: 18, speed: 300, life: 1.8, size: 7, homing: 6, range: 200 },
    { id: 'ominous-wind', name: 'Viento Aciago', type: 'ghost', kind: 'vortex',
      desc: 'Un viento maldito hace girar a los enemigos alrededor de su centro: chocan entre ellos y a veces se marean.',
      cd: 3.0, dmg: 10, radius: 74, dur: 2.6, pull: 160 },
    // Dragón
    { id: 'dragon-breath', name: 'Dragoaliento', type: 'dragon', kind: 'cone',
      desc: 'Un aliento de dragón en abanico que atraviesa a todos: pega más de cerca que de lejos y a veces paraliza.',
      cd: 0.7, dmg: 5, count: 7, arc: 0.95, speed: 330, life: 0.5, size: 7, pierce: 99 },
    { id: 'dragon-claw', name: 'Garra Dragón', type: 'dragon', kind: 'melee',
      desc: 'Un zarpazo de dragón que además lanza tres cortes de energía hacia delante.',
      cd: 0.52, dmg: 9.5, radius: 52, arc: 2.0, knock: 70 },
    // (count: lo que dura el frenesí, 1,7 + 0,2 s por cada uno.)
    { id: 'outrage', name: 'Enfado', type: 'dragon', kind: 'spin',
      desc: 'Un frenesí de 2,5 s girando cada vez más rápido y más abierto; al acabar te mareas un momento.',
      cd: 3, dmg: 3.5, count: 4, radius: 64 },
    // Hada
    { id: 'draining-kiss', name: 'Beso Drenaje', type: 'fairy', kind: 'homing',
      desc: 'Un beso que persigue al enemigo, te cura la mitad del daño que hace y lo deja enamorado 1,5 s (ni te toca ni dispara).',
      cd: 0.55, dmg: 18, speed: 280, life: 2.0, size: 7, homing: 5 },
    // (count: los golpes que caen en la nube.)
    { id: 'play-rough', name: 'Carantoña', type: 'fairy', kind: 'melee',
      desc: 'Una nube de polvo cómica sobre el enemigo: dentro caen golpes al azar sobre todos los que pilla.',
      cd: 0.6, dmg: 16, radius: 50, arc: 2.0, knock: 60, count: 6 },
    { id: 'disarming-voice', name: 'Voz Cautivadora', type: 'fairy', kind: 'shove',
      desc: 'Un grito encantador que daña y aparta a los que tienes cerca; luego caminan embelesados 1,5 s hacia donde lo lanzaste sin tocarte.',
      cd: 1.15, dmg: 15, radius: 94, knock: 160 },
    // Acero
    // (Disparo Espejo, 26-10-2026: deja un espejo; sus reflejos rebotan `bounce` veces.)
    { id: 'mirror-shot', name: 'Disparo Espejo', type: 'steel', kind: 'bounce',
      desc: 'Deja un espejo que gira 3 s: cada disparo tuyo que lo cruza sale duplicado y cada 0,6 s destella y lanza un reflejo que rebota entre los enemigos.',
      cd: 3, dmg: 15, speed: 340, life: 1.6, size: 7, bounce: 3 },
    { id: 'gyro-ball', name: 'Giro Bola', type: 'steel', kind: 'spin',
      desc: 'Giras como una bola de acero golpeando todo alrededor: cuanto más lento vas, más daño (quieto ×2, corriendo ×0,6).',
      cd: 1.05, dmg: 11, count: 3, radius: 60 },
    // Siniestro
    { id: 'sucker-punch', name: 'Golpe Bajo', type: 'dark', kind: 'homing',
      desc: 'Un golpe a traición al enemigo que está a punto de atacar: le hace el doble y le cancela el ataque. Si nadie prepara nada, al más cercano (más fuerte si está de espaldas).',
      cd: 0.7, dmg: 28, speed: 420, life: 1.6, size: 7, homing: 6 },
    { id: 'night-slash', name: 'Tajo Umbrío', type: 'dark', kind: 'spin',
      desc: 'Te desvaneces 0,5 s en la oscuridad mientras giras: te pierden de vista y tus tajos son críticos contra los que no te miran.',
      cd: 1.0, dmg: 11, count: 3, radius: 62 },

    // ================= NUEVOS (22-10-2026): familias de Vampire Survivors =================
    // Parábola (lob): spread en px/s entre proyectiles; grav en px/s².
    { id: 'bone-club', name: 'Hueso Palo', type: 'ground', kind: 'lob',
      desc: 'Lanza un hueso en parábola hacia el enemigo: sube, cae y atraviesa a varios.',
      cd: 1.15, dmg: 26, count: 1, speed: 340, life: 1.6, size: 9, pierce: 2, spread: 70, grav: 720, knock: 60 },
    // (count: las que salen seguro; rnd: hasta cuántas más al azar. Con Encadenado, todas.)
    { id: 'rock-blast', name: 'Pedrada', type: 'rock', kind: 'lob',
      desc: 'Lanza entre 2 y 5 rocas en parábola (siempre 5 con Encadenado): caen, atraviesan y botan una vez.',
      cd: 1.1, dmg: 19, count: 2, rnd: 3, speed: 330, life: 1.6, size: 8, pierce: 1, spread: 60, grav: 700 },
    // Ráfaga (knife): hacia donde miras; cdMin para que la ráfaga acabe antes de la siguiente.
    { id: 'water-shuriken', name: 'Shuriken de Agua', type: 'water', kind: 'knife',
      desc: 'Ráfaga de estrellas de agua hacia donde miras. Muy rápida, pero hay que encarar al enemigo.',
      cd: 0.5, cdMin: 0.15, dmg: 11, count: 2, speed: 460, life: 0.75, size: 5, pierce: 0, spread: 0.08 },
    { id: 'bullet-seed', name: 'Semilladora', type: 'grass', kind: 'knife',
      desc: 'Una ametralladora de semillas hacia donde miras.',
      cd: 0.55, cdMin: 0.15, dmg: 9, count: 3, speed: 420, life: 0.7, size: 5, pierce: 0, spread: 0.16 },
    { id: 'pin-missile', name: 'Pin Misil', type: 'bug', kind: 'knife',
      desc: 'Agujas en ráfaga hacia donde miras que atraviesan a uno.',
      cd: 0.55, cdMin: 0.15, dmg: 10, count: 2, speed: 440, life: 0.75, size: 5, pierce: 1, spread: 0.1 },
    { id: 'scale-shot', name: 'Ráfaga Escamas', type: 'dragon', kind: 'knife',
      desc: 'Escamas en ráfaga hacia donde miras. Al acabar cada ráfaga ganas velocidad, pero tu defensa baja un poco.',
      cd: 0.55, cdMin: 0.15, dmg: 15, count: 2, speed: 480, life: 0.7, size: 6, pierce: 0, spread: 0.06, knock: 30 },
    // Aspas (cross): curl = giro de cada aspa en rad/s (espiral).
    { id: 'swift', name: 'Meteoros', type: 'normal', kind: 'cross',
      desc: 'Estrellas en todas direcciones que giran en espiral; una va siempre al enemigo.',
      cd: 0.95, dmg: 14, count: 5, speed: 300, life: 1.1, size: 7, pierce: 1, curl: 1, homing: 1.5 },
    { id: 'cross-poison', name: 'Veneno X', type: 'poison', kind: 'cross',
      desc: 'Cuchillas venenosas en aspa, una hacia el enemigo; atraviesan y envenenan.',
      cd: 0.85, dmg: 12, count: 4, speed: 340, life: 0.8, size: 8, pierce: 1, curl: 0, poison: 1 },
    { id: 'cross-chop', name: 'Tajo Cruzado', type: 'fighting', kind: 'cross',
      desc: 'Tajos en aspa a todos lados, uno hacia el enemigo; atraviesan y empujan.',
      cd: 0.9, dmg: 18, count: 4, speed: 340, life: 0.85, size: 9, pierce: 1, curl: 0, knock: 50 },
    { id: 'twister', name: 'Ciclón', type: 'dragon', kind: 'cross',
      desc: 'Tornados que salen girando en espiral y se llevan consigo a los enemigos pequeños; ×1,5 a los voladores.',
      cd: 1.1, dmg: 18, count: 3, speed: 250, life: 1.3, size: 10, pierce: 3, curl: 2.6, knock: 30 },
    // Columna (column): life = lo que dura (un golpe cada 0,25 s).
    { id: 'waterfall', name: 'Cascada', type: 'water', kind: 'column',
      desc: 'Una columna de agua cae de arriba abajo sobre ti y arrastra a todo lo que pilla.',
      cd: 1.4, dmg: 12, count: 1, life: 0.45, width: 40, height: 240, anchor: 'self', knock: 40 },
    { id: 'photon-geyser', name: 'Géiser Fotónico', type: 'psychic', kind: 'column',
      desc: 'Un pilar de luz brota de arriba abajo en la columna del enemigo.',
      cd: 1.5, dmg: 16, count: 1, life: 0.45, width: 36, height: 220, anchor: 'target' },
    { id: 'icicle-crash', name: 'Chuzos', type: 'ice', kind: 'column',
      desc: 'Caen carámbanos en la columna del enemigo, de arriba abajo, y frenan.',
      cd: 1.5, dmg: 15, count: 1, life: 0.45, width: 34, height: 200, anchor: 'target', slow: 0.4 },
    { id: 'sky-uppercut', name: 'Gancho Alto', type: 'fighting', kind: 'column',
      desc: 'Un gancho al cielo: una columna de golpes sobre ti que lanza lejos a los enemigos.',
      cd: 1.3, dmg: 13, count: 1, life: 0.45, width: 44, height: 200, anchor: 'self', knock: 90, knockUp: 1 },
    // Aguja (sweep): turn en rad/s. (Cañón Floral lleva stun 0: la evolución lo multiplica.)
    { id: 'charge-beam', name: 'Rayo Carga', type: 'electric', kind: 'sweep',
      desc: 'Un rayo que gira a tu alrededor como una aguja de reloj y paraliza un instante.',
      cd: 3, dmg: 12, count: 1, width: 16, radius: 150, dur: 2.4, turn: 4.2, stun: 0.3 },
    { id: 'aurora-beam', name: 'Rayo Aurora', type: 'ice', kind: 'sweep',
      desc: 'Un rayo helado que gira a tu alrededor como una aguja de reloj y congela un momento.',
      cd: 3, dmg: 10, count: 1, width: 14, radius: 150, dur: 2.4, turn: 5.2, stun: 0.4 },
    { id: 'fleur-cannon', name: 'Cañón Floral', type: 'fairy', kind: 'sweep',
      desc: 'Un rayo floral que gira a tu alrededor como una aguja de reloj y va plantando flores que estallan al segundo.',
      cd: 3.2, dmg: 12, count: 1, width: 20, radius: 165, dur: 2, turn: 6.3, stun: 0 },
    // Carambola (ricochet): dur = lo que rebota.
    { id: 'pyro-ball', name: 'Balón Ígneo', type: 'fire', kind: 'ricochet',
      desc: 'Un balón en llamas que rebota por los bordes de la pantalla quemando a todo lo que toca.',
      cd: 3, dmg: 18, count: 1, speed: 320, size: 8, homing: 1.2, dur: 3, burn: 1 },
    { id: 'aura-wheel', name: 'Rueda Aural', type: 'electric', kind: 'ricochet',
      desc: 'Una rueda eléctrica rapidísima que rebota por los bordes de la pantalla y frena.',
      cd: 2.8, dmg: 17, count: 1, speed: 400, size: 8, homing: 1.2, dur: 3, slow: 0.3 },
    { id: 'rollout', name: 'Rodar', type: 'rock', kind: 'ricochet',
      desc: 'Una roca rodando que rebota por la pantalla y dobla su daño con cada golpe seguido (hasta ×8); si pasa 1 s sin golpear, vuelve a ×1. Con Fortaleza activa empieza en ×2.',
      cd: 3, dmg: 12, count: 1, speed: 280, size: 10, homing: 1, dur: 3, knock: 60 },
    // Barrido (wipe): recarga larga con tope propio (cdMin); pct = umbral de KO (exec) o vida quitada (cut).
    { id: 'perish-song', name: 'Canto Mortal', type: 'normal', kind: 'wipe',
      desc: 'Un canto que oye toda la pantalla: a los 3 s debilita a los que estén muy tocados y daña al resto. Los jefes lo aguantan.',
      cd: 45, cdMin: 20, dmg: 30, pct: 0.25, delay: 3, mode: 'exec' },
    { id: 'dark-void', name: 'Brecha Negra', type: 'dark', kind: 'wipe',
      desc: 'Una oscuridad cubre la pantalla: duerme a todos (se despiertan con un golpe fuerte), les quita parte de la vida y daña. Los jefes duermen menos.',
      cd: 30, cdMin: 15, dmg: 20, stun: 2, pct: 0.15, delay: 1.2, mode: 'cut' },
    // Escudo (ward): cd = lo que tarda en ganar un escudo; count = escudos máximos; radius = contraataque.
    { id: 'spiky-shield', name: 'Barrera Espinosa', type: 'grass', kind: 'ward',
      desc: 'Un escudo de pinchos que para un golpe y castiga a los que tienes cerca.',
      cd: 6, cdMin: 2.5, dmg: 45, count: 1, radius: 78, knock: 140 },
    { id: 'baneful-bunker', name: 'Búnker', type: 'poison', kind: 'ward',
      desc: 'Un búnker que para un golpe y envenena mucho a los que tienes cerca.',
      cd: 6, cdMin: 2.5, dmg: 24, count: 1, radius: 80, poison: 2 },
    { id: 'kings-shield', name: 'Escudo Real', type: 'steel', kind: 'ward',
      desc: 'Un escudo regio que para un golpe y aturde a los que tienes cerca; al gastarlo pasas 3 s a forma Filo: +40% de ataque físico, pero sin escudos nuevos.',
      cd: 6, cdMin: 2.5, dmg: 32, count: 1, radius: 76, stun: 0.8 },
    // Aliados (ally): size = radio de golpe; phase = atraviesan paredes; sprite owner = copias de tu Pokémon.
    { id: 'attack-order', name: 'Al Ataque', type: 'bug', kind: 'ally',
      desc: 'Llamas a un enjambre: las abejas revolotean cerca y pican a los enemigos.',
      cd: 6, dmg: 8, count: 3, speed: 160, size: 7, dur: 6 },
    { id: 'last-respects', name: 'Homenaje Póstumo', type: 'ghost', kind: 'ally',
      desc: 'Espíritus que atraviesan paredes, persiguen y frenan a los enemigos; salen más y más fuertes cuantos más enemigos hayas debilitado en los últimos 20 s.',
      cd: 6, dmg: 8, count: 3, speed: 140, size: 7, dur: 6, slow: 0.3, phase: 1 },
    // (Paliza, 26-10-2026: una copia por tipo de tus ataques; count suma copias de más.)
    { id: 'beat-up', name: 'Paliza', type: 'dark', kind: 'ally',
      desc: 'Copias pequeñas de tu Pokémon, una por cada tipo de tus ataques (hasta 4): cada una pega con su tipo y su estado (la de fuego quema, la de veneno envenena...).',
      cd: 6, dmg: 9, count: 2, speed: 130, size: 9, dur: 6, knock: 40, sprite: 'owner' },
    // Aves (wings): speed = giro en rad/s; ring = radio del círculo; radius = explosión de cada bomba.
    { id: 'dual-wingbeat', name: 'Ala Bis', type: 'flying', kind: 'wings',
      desc: 'Dos aves vuelan en círculo lejos de ti y bombardean a los enemigos de abajo.',
      cd: 8, dmg: 15, count: 2, speed: 1.7, radius: 34, dur: 8, rate: 0.6, ring: 150 },
    // (Ala de Acero, 26-10-2026: pasadas rasantes; rate = cada cuánto pasa, radius = el ancho de la pasada.)
    { id: 'steel-wing', name: 'Ala de Acero', type: 'steel', kind: 'wings',
      desc: 'Un ave de acero cruza la pantalla en pasadas rasantes cada 1,5 s atravesando a todos; a veces te sube la defensa.',
      cd: 8, dmg: 32, count: 1, speed: 1.5, radius: 42, dur: 8, rate: 1.5, ring: 160 },
    // Charcos (puddle): range = hasta dónde lanza los frascos.
    { id: 'fire-pledge', name: 'Voto Fuego', type: 'fire', kind: 'puddle',
      desc: 'Lanza frascos de fuego sobre los enemigos: dejan un mar de llamas que quema.',
      cd: 2.2, dmg: 6, count: 2, radius: 36, dur: 3, burn: 1, range: 260 },
    { id: 'psychic-terrain', name: 'Campo Psíquico', type: 'psychic', kind: 'puddle',
      desc: 'Lanza un campo psíquico amplio sobre los enemigos que los daña y frena.',
      cd: 2.6, dmg: 6, count: 1, radius: 54, dur: 4, slow: 0.25, range: 260 },
    { id: 'mud-bomb', name: 'Bomba Fango', type: 'ground', kind: 'puddle',
      desc: 'Bombas de barro sobre los enemigos: dejan charcos que dañan y frenan mucho.',
      cd: 2.2, dmg: 7, count: 2, radius: 36, dur: 3, slow: 0.4, range: 260 },
    // Lluvia (dusting): speed = lo rápido que caen.
    { id: 'feather-dance', name: 'Danza Pluma', type: 'flying', kind: 'dusting',
      desc: 'Caen plumas de lo alto de la pantalla que dañan y frenan a todos los que rozan.',
      cd: 1.6, dmg: 9, count: 8, speed: 200, size: 7, slow: 0.35 },
    { id: 'astral-barrage', name: 'Orbes Espectro', type: 'ghost', kind: 'dusting',
      desc: 'Orbes fantasma caen en corona alrededor del enemigo con más vida de la pantalla y se juntan sobre él.',
      cd: 1.6, dmg: 7, count: 8, speed: 230, size: 7 },
    { id: 'springtide-storm', name: 'Ciclón Primavera', type: 'fairy', kind: 'dusting',
      desc: 'Caen pétalos de lo alto: con más de media vida bajan el ataque de los enemigos; con menos, cada pétalo que acierta te sube el ataque.',
      cd: 1.6, dmg: 10, count: 8, speed: 210, size: 7, knock: 40 },
    { id: 'make-it-rain', name: 'Fiebre Dorada', type: 'steel', kind: 'dusting',
      desc: 'Llueven monedas que botan y se quedan 3 s en el suelo: si las pisas, +2% de crítico 5 s (hasta 5). Cada lluvia te cansa un poco: −10% de at. esp. 2 s.',
      cd: 1.7, dmg: 15, count: 8, speed: 240, size: 6 }
  ];

  // Cuerpo a cuerpo (12-10-2026): +20 % de daño y +25 % de alcance y de arco
  // (y -25 % de daño recibido mientras sea tu ataque activo, en player.js).
  // Pegaban bien, pero había que arriesgar mucho más que con los de distancia.
  for (const m of RAW) {
    if (m.kind !== 'melee') continue;
    m.dmg = Math.round(m.dmg * 1.2);
    m.radius = Math.round(m.radius * 1.25);
    if (m.arc) m.arc = Math.min(3, +(m.arc * 1.25).toFixed(2));
  }

  // -- ataques únicos: Lucha, Veneno, Tierra, Volador, Psíquico, Bicho (26-10-2026) --
  /*
   * Cada uno con su mecánica propia (systems/combat.js, bloque del mismo nombre, UQ[id]):
   * la familia (kind) sigue mandando en pasivos, icono y animación. Aquí, su texto y los
   * números que lee su mecánica: crit2 (crítico de más, se suma), wave [amplitud, frecuencia],
   * conf [probabilidad, s de confusión]... (todos con tools/balance.cjs).
   */
  const UQ_DEF = {
    // Psíquico
    'confusion': { desc: 'Una onda psíquica ondulante que confunde: los confusos se chocan entre ellos.',
      dmg: 18, pierce: 1, homing: 2, wave: [24, 7], conf: [0.25, 1.5] },
    'psybeam': { desc: 'Un rayo psicodélico que se tuerce a mitad de camino y confunde.', refr: 0.6, conf: [0.2, 1.5] },
    // (Psíquico: count = enemigos que levanta; size, hasta dónde los busca.)
    'psychic': { desc: 'Levantas a los enemigos con la mente y los lanzas contra otros.',
      cd: 1.35, dmg: 26, count: 3, size: 7, pierce: 0, lift: 0.6 },
    'psycho-cut': { desc: 'Cuchillas que oscilan como un péndulo: delante, detrás y otra vez a ti.', dmg: 8, crit2: 0.25 },
    'extrasensory': { desc: 'Una onda mental que teletransporta lejos a los que tienes encima.', stun: 0.3 },
    'mist-ball': { desc: 'Una bola de bruma que deja niebla: dentro, los enemigos no te ven y fallan.', dmg: 20, mist: [60, 3] },
    'photon-geyser': { desc: 'Un pilar de luz que se ensancha y al final deslumbra. Pega con tu lado más fuerte.', dmg: 11, life: 0.6 },
    'psychic-terrain': { desc: 'Un campo psíquico que potencia tus disparos y frena a los enemigos y los suyos.', dmg: 8 },
    // Veneno
    'sludge': { desc: 'Un lodo que se pega: el enemigo va dejando un rastro tóxico.' },
    'poison-sting': { desc: 'Dos aguijones a la vez: si los dos aciertan al mismo, el veneno es doble.', count: 2, spread: 0.05, dmg: 6 },
    'toxic': { desc: 'Dejas un rastro de veneno grave: cuanto más tiempo lo sufre, más daño hace.', dmg: 3.4 },
    'toxic-spikes': { desc: 'Púas venenosas por capas: con dos capas en el mismo sitio, el veneno es grave.', radius: 60, dur: 10, poison: 1 },
    'acid-spray': { desc: 'Un ácido que rebota y deja a los enemigos sin defensa.', dmg: 9.5, vuln: 2 },
    'cross-poison': { desc: 'Dos cuchillas que se cruzan sobre el enemigo: donde se cruzan, crítico seguro.', count: 2, speed: 300, life: 1.1 },
    'baneful-bunker': { desc: 'Al parar un golpe te encierras en un búnker: no te tocan y envenena gravemente a los de alrededor.' },
    // Tierra
    'mud-shot': { desc: 'Bolas de barro que frenan cada vez más hasta dejar atascados a los enemigos.', dmg: 13 },
    'bulldoze': { desc: 'Al andar das pisotones que hacen temblar el suelo: frenan a los que no vuelan y rompen rocas.', dmg: 8 },
    'bonemerang': { desc: 'Un hueso que va y vuelve al sitio desde donde lo lanzas: si lo atrapas, el siguiente sale antes.' },
    'spikes': { desc: 'Siembras abrojos delante de ti: cada uno daña y frena mucho al primero que lo pisa.', dur: 8, slow: 0.6 },
    'sand-tomb': { desc: 'Arenas movedizas: los que caen dentro no pueden salir y se hunden cada vez más.', dmg: 9.5, dur: 3 },
    'magnitude': { desc: 'Un temblor de magnitud al azar (de 4 a 10): a veces poco, a veces enorme. No toca a los que vuelan.', dmg: 8 },
    'bone-club': { desc: 'Un hueso que cae y se queda clavado girando: golpea a todo el que pasa y corta lo que preparan.', dur: 3 },
    'mud-bomb': { desc: 'Charcos de barro: frenan a los enemigos y les hacen fallar los disparos.' },
    // Volador
    'gust': { desc: 'Remolinos que te escoltan y devuelven los disparos enemigos contra ellos.' },
    'wing-attack': { desc: 'Un aletazo que aparta a los enemigos y te aleja de ellos.', dmg: 15, back: 40 },
    'aerial-ace': { desc: 'Apareces a la espalda del enemigo y le cortas en X: nunca falla y no puede dispararte un momento.', dmg: 26 },
    'whirlwind': { desc: 'Un vendaval en cono que manda lejos a los enemigos y los hace huir.', dmg: 24, fear: 1.5 },
    'air-slash': { desc: 'Cuchillas de aire que atraviesan en fila y cortan los ataques que preparan.', dmg: 8.5, pierce: 99 },
    'dual-wingbeat': { desc: 'Aves que bajan en picado de dos en dos sobre los enemigos.', dmg: 18 },
    'feather-dance': { desc: 'Llueven plumas que quitan fuerza y frenan a los enemigos.', weak: 0.4 },
    // Bicho
    'bug-bite': { desc: 'Mordiscos que te curan; a veces los enemigos sueltan una baya.' },
    'string-shot': { desc: 'Atas a varios enemigos con hilo de seda: se arrastran unos a otros y van lentos.', dmg: 19, dur: 4, slow: 0.5 },
    'bug-buzz': { desc: 'Un zumbido que ablanda a los enemigos y, al máximo, los aparta.', dmg: 6.5 },
    'signal-beam': { desc: 'Un destello que rebota y señala a los enemigos: tu puntería y tus aliados van a por ellos.', conf: [0.15, 1.5] },
    'u-turn': { desc: 'Cruzas, golpeas y vuelves a tu sitio; al volver, el siguiente ataque de tu vínculo sale al momento.' },
    'pin-missile': { desc: 'Agujas que se clavan; con cinco clavadas, el enemigo revienta.' },
    'attack-order': { desc: 'Un enjambre que ataca a tu objetivo en formación, con mucho crítico.', dmg: 7, crit2: 0.2 },
    // Lucha
    'karate-chop': { desc: 'Un tajo seco en línea con mucho crítico: cada crítico te deja golpear otra vez.', dmg: 15, crit2: 0.3 },
    'aura-sphere': { desc: 'Una esfera de aura que nunca falla, atraviesa paredes y pega más cuanto más lejos va.', dmg: 19, homing: 9 },
    'rolling-kick': { desc: 'Avanzas girando hacia el enemigo a patadas y cortas lo que prepara.', dmg: 10 },
    'vacuum-wave': { desc: 'Un puñetazo al aire que crea un vacío: atrae a los enemigos a un punto y los golpea.', dmg: 24 },
    'dynamic-punch': { desc: 'Un puñetazo tremendo que a veces falla, pero si acierta confunde siempre.', stun: 2 },
    'cross-chop': { desc: 'Tajos en cruz que, al acabar, se quedan girando como las aspas de un molino.' },
    'sky-uppercut': { desc: 'Un gancho al cielo que mantiene a los enemigos en el aire y luego caen.', dmg: 10, life: 0.6 }
  };
  for (const m of RAW) if (UQ_DEF[m.id]) Object.assign(m, UQ_DEF[m.id]);
  // Escaleras propias de los que ya no encajan en la de su familia.
  Object.assign(LADDER_BY_ID, {
    'toxic': [
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '+40% duración',                 m: { dur: 1.40 } },
      { t: 'Charcos un 30% más grandes',    m: { radius: 1.30 } },
      { t: '+60% daño y +30% radio',        m: { dmg: 1.60, radius: 1.30 } }
    ],
    'magnitude': [
      { t: '+45% daño',                     m: { dmg: 1.45 } },
      { t: '+25% tamaño',                   m: { radius: 1.25 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+50% daño y +1 onda',           m: { dmg: 1.50, count: 1 } }
    ],
    'string-shot': [
      { t: '+1 enemigo atado',              m: { count: 1 } },
      { t: '+50% daño',                     m: { dmg: 1.50 } },
      { t: '+40% duración',                 m: { dur: 1.40 } },
      { t: '+1 enemigo atado y -25% recarga', m: { count: 1, cd: 0.75 } }
    ],
    'psychic': [
      { t: '+1 enemigo levantado',          m: { count: 1 } },
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+1 enemigo levantado y +30% daño', m: { count: 1, dmg: 1.30 } }
    ],
    'karate-chop': [
      { t: '+40% daño',                     m: { dmg: 1.40 } },
      { t: '+25% alcance',                  m: { radius: 1.25 } },
      { t: '-25% recarga',                  m: { cd: 0.75 } },
      { t: '+50% daño y +15% de crítico',   m: { dmg: 1.50, crit2: 0.15 } }
    ]
  });
  // -- fin: ataques únicos (Lucha, Veneno, Tierra, Volador, Psíquico, Bicho) --

  // Pool de movimientos por tipo. El pool `normal` lo tienen todos.
  const POOL = {};
  for (const m of RAW) (POOL[m.type] = POOL[m.type] || []).push(m.id);

  /*
   * Físico o especial (G.Stats), como en los juegos. Los de estado que aquí sí
   * hacen daño van por lo que hacen: trampas y golpes, físicos (Púas, Disparo
   * Demora, Sustituto); efectos y energía, especiales (Tóxico, Granizo, Fuego
   * Fatuo). Los potenciadores (buff) no tienen: no hacen daño.
   */
  const PHYSICAL = new Set(['tackle', 'quick-attack', 'vine-whip', 'razor-leaf', 'wing-attack', 'body-slam', 'poison-sting',
    'bulldoze', 'bug-bite', 'string-shot', 'rock-throw', 'rock-slide', 'karate-chop', 'lick', 'metal-claw', 'bite',
    'bonemerang', 'psycho-cut', 'spikes', 'toxic-spikes', 'meteor-mash', 'substitute', 'aerial-ace', 'flame-wheel',
    // nuevos del 19-10-2026
    'rapid-spin', 'flame-charge', 'seed-bomb', 'sand-tomb', 'magnitude', 'u-turn', 'rock-tomb', 'ice-shard',
    'rolling-kick', 'dynamic-punch', 'shadow-sneak', 'dragon-claw', 'outrage', 'play-rough', 'gyro-ball',
    'sucker-punch', 'night-slash',
    // nuevos del 22-10-2026
    'bone-club', 'rock-blast', 'bullet-seed', 'pin-missile', 'scale-shot', 'cross-poison', 'cross-chop',
    'waterfall', 'icicle-crash', 'sky-uppercut', 'pyro-ball', 'aura-wheel', 'rollout',
    'spiky-shield', 'kings-shield', 'attack-order', 'last-respects', 'beat-up', 'dual-wingbeat', 'steel-wing']);

  // Los que disparan bolas necesitan count y spread de base: las mejoras los
  // multiplican y, sin ellos, "+1 proyectil" no sumaba ninguno y el abanico se
  // quedaba en 1,3 rad (Bomba Ácida evolucionada salía hacia los lados).
  for (const m of RAW) {
    if (m.kind !== 'projectile' && m.kind !== 'homing' && m.kind !== 'bounce') continue;
    if (m.count == null) m.count = 1;
    if (m.spread == null) m.spread = 0.12;
  }

  // Sin prototipo: un id que llega de la red o de una partida guardada como
  // 'toString' o 'constructor' no debe parecer un movimiento.
  const BY_ID = Object.create(null);
  for (const m of RAW) {
    m.cat = m.kind === 'buff' ? null : PHYSICAL.has(m.id) ? 'physical' : 'special';
    m.ups = LADDER_BY_ID[m.id] || LADDERS[m.kind];
    m.maxLvl = m.ups.length + 1;
    BY_ID[m.id] = m;
  }
  // Los movimientos Z van aparte (ver «movimientos Z» al final): ni en el catálogo ni en las cartas.
  const Z_BY_ID = Object.create(null);

  /**
   * Movimientos que este Pokémon puede aprender (sus tipos + normal) y, salvo
   * con `natural`, los que ha aprendido con MT (Tienda Kecleon, ver G.Mons).
   */
  function poolFor(mon, natural) {
    const ids = new Set(POOL.normal);
    for (const t of mon.types) for (const id of (POOL[t] || [])) ids.add(id);
    if (!natural && G.Mons && mon.dex) for (const id of G.Mons.taught(mon.dex)) ids.add(id);
    return [...ids];
  }

  /**
   * Instancia de movimiento en una run: los números base de `def` con todas
   * las mejoras de la escalera hasta `lvl` ya aplicadas. null si no existe.
   */
  function instance(id, lvl = 1) {
    const def = typeof id === 'string' ? BY_ID[id] || Z_BY_ID[id] : null;      // (también los movimientos Z, abajo)
    if (!def) return null;
    // El nivel puede venir de un compañero (red): entre 1 y el máximo (con más de 5 se colgaba).
    lvl = typeof lvl === 'number' && lvl > 1 ? Math.min(def.maxLvl, Math.floor(lvl)) : 1;
    const s = Object.assign({}, def, { id, def, lvl, t: 0 });
    delete s.ups;
    for (let i = 0; i < lvl - 1; i++) applyMods(s, def.ups[i].m);
    return s;
  }

  const MULT = ['dmg', 'cd', 'speed', 'radius', 'dur', 'amount', 'arc', 'width', 'spread', 'life', 'size', 'rate',
                'pull', 'knock', 'stun', 'charge',
                // familias del 22-10-2026
                'height', 'turn', 'ring', 'grav', 'curl', 'heal', 'blast'];
  const ADD = ['count', 'pierce', 'stacks', 'bounce', 'pct'];
  // -- ataques únicos (Lucha, Veneno, Tierra, Volador, Psíquico, Bicho): crit2 = crítico de más, se suma --
  ADD.push('crit2');

  function applyMods(s, m) {
    for (const k in m) {
      if (MULT.includes(k) && s[k] != null) s[k] *= m[k];
      else if (ADD.includes(k)) s[k] = (s[k] || 0) + m[k];
      else s[k] = m[k];
    }
  }

  /** Sube de nivel una instancia ya creada. */
  function levelUp(s) {
    if (s.lvl >= s.def.maxLvl) return false;
    applyMods(s, s.def.ups[s.lvl - 1].m);
    s.lvl++;
    return true;
  }

  /** Texto de la próxima mejora, para la carta de subida de nivel. */
  function nextUpText(s) {
    return s.lvl >= s.def.maxLvl ? null : s.def.ups[s.lvl - 1].t;
  }

  /** Movimiento inicial según el tipo principal (si el Pokémon no trae uno). */
  const START = {
    fire: 'ember', water: 'water-gun', grass: 'vine-whip', electric: 'thunder-shock',
    psychic: 'confusion', poison: 'sludge', ground: 'mud-shot', flying: 'gust',
    bug: 'bug-bite', rock: 'rock-throw', ice: 'ice-beam', fighting: 'karate-chop',
    ghost: 'shadow-ball', dragon: 'dragon-rage', fairy: 'fairy-wind', steel: 'metal-claw',
    dark: 'bite', normal: 'tackle'
  };
  function startFor(mon) {
    if (mon.start && BY_ID[mon.start]) return mon.start;
    for (const t of mon.types) if (START[t]) return START[t];
    return 'tackle';
  }

  // ---------------- evolución de movimientos ----------------
  /*
   * Un movimiento al NIVEL MÁXIMO evoluciona si en esa run has cogido alguna
   * vez la mejora de su condición (`needs`, un id de LevelUp.STATS). Sale una
   * carta dorada. Los potenciadores (buff) sólo si llevan evolución propia (EVO[id][2], abajo).
   */
  const NEED_NAME = { hp: 'Vigor', atk: 'Potencia', spd: 'Carrera', cd: 'Reflejos', def: 'Coraza',
                      rgn: 'Síntesis', mag: 'Imán', xp: 'Aprendizaje',
                      area: 'Amplitud', dur: 'Persistencia', amt: 'Réplica', pspd: 'Propulsión', luck: 'Puntería' };
  const EVO = {
    'tackle': ['Derribo', 'hp'],             'quick-attack': ['Velocidad Extrema', 'spd'],
    'body-slam': ['Gigaimpacto', 'atk'],     'hyper-voice': ['Alboroto', 'cd'],
    'ember': ['Llamarada', 'atk'],           'flamethrower': ['Sofoco', 'cd'],
    'fire-spin': ['Fuego Sagrado', 'rgn'],   'heat-wave': ['Erupción', 'hp'],
    'water-gun': ['Escaldar', 'atk'],        'bubble': ['Surf', 'spd'],
    'hydro-pump': ['Hidrocañón', 'atk'],     'vine-whip': ['Latigazo', 'atk'],
    'razor-leaf': ['Lluevehojas', 'cd'],     'leaf-storm': ['Danza Pétalo', 'rgn'],
    'giga-drain': ['Planta Feroz', 'hp'],    'thunder-shock': ['Trueno', 'atk'],
    'discharge': ['Campo Eléctrico', 'def'], 'thunderbolt': ['Electrocañón', 'cd'],
    'confusion': ['Psicocarga', 'cd'],       'psybeam': ['Premonición', 'atk'],
    'psychic': ['Vasta Fuerza', 'mag'],      'sludge': ['Bomba Lodo', 'atk'],
    'poison-sting': ['Puya Nociva', 'spd'],  'toxic': ['Gas Venenoso', 'rgn'],
    'mud-shot': ['Tierra Viva', 'atk'],      'bulldoze': ['Terremoto', 'atk'],
    'gust': ['Vendaval', 'spd'],             'wing-attack': ['Pájaro Osado', 'atk'],
    'bug-bite': ['Tijera X', 'atk'],         'string-shot': ['Red Viscosa', 'cd'],
    'bug-buzz': ['Enjambre', 'rgn'],         'rock-throw': ['Roca Afilada', 'atk'],
    'rock-slide': ['Trampa Rocas', 'cd'],    'ice-beam': ['Ventisca', 'atk'],
    'powder-snow': ['Viento Hielo', 'spd'],  'karate-chop': ['A Bocajarro', 'atk'],
    'aura-sphere': ['Onda Certera', 'cd'],   'lick': ['Puño Sombra', 'atk'],
    'shadow-ball': ['Golpe Fantasma', 'cd'], 'dragon-rage': ['Cometa Draco', 'atk'],
    'fairy-wind': ['Fuerza Lunar', 'atk'],   'dazzling-gleam': ['Campo de Niebla', 'rgn'],
    'metal-claw': ['Cabeza de Hierro', 'atk'], 'flash-cannon': ['Rayo Metálico', 'def'],
    'bite': ['Triturar', 'atk'],             'dark-pulse': ['Alarido', 'spd'],
    'night-shade': ['Pesadilla', 'rgn'],
    'bonemerang': ['Ataque Óseo', 'atk'],    'psycho-cut': ['Psicocolmillo', 'cd'],
    'spikes': ['Fisura', 'atk'],             'toxic-spikes': ['Lanza Mugre', 'rgn'],
    'hail': ['Alud', 'cd'],                  'meteor-mash': ['Bomba Imán', 'atk'],
    'will-o-wisp': ['Infierno', 'cd'],       'substitute': ['Doble Equipo', 'def'],
    'aerial-ace': ['Acróbata', 'spd'],       'flame-wheel': ['Envite Ígneo', 'spd'],
    'bubble-beam': ['Acua Cola', 'atk'],     'hex': ['Poltergeist', 'mag'],
    // nuevos del 19-10-2026
    'hyper-beam': ['Rayo Prisma', 'atk'],    'rapid-spin': ['Triataque', 'spd'],
    'flame-charge': ['Golpe Calor', 'spd'],  'whirlpool': ['Salmuera', 'rgn'],
    'seed-bomb': ['Mazazo', 'atk'],          'energy-ball': ['Gigadrenado', 'rgn'],
    'solar-beam': ['Cuchilla Solar', 'cd'],  'thunder-wave': ['Voltio Cruel', 'atk'],
    'electro-ball': ['Chispa', 'spd'],       'extrasensory': ['Psicoonda', 'def'],
    'mist-ball': ['Resplandor', 'cd'],       'acid-spray': ['Onda Tóxica', 'rgn'],
    'sand-tomb': ['Fuerza Equina', 'hp'],    'magnitude': ['Taladradora', 'atk'],
    'whirlwind': ['Huracán', 'spd'],         'air-slash': ['Ataque Aéreo', 'cd'],
    'signal-beam': ['Megacuerno', 'atk'],    'u-turn': ['Sanguijuela', 'rgn'],
    'rock-tomb': ['Testarazo', 'hp'],        'ancient-power': ['Tormenta de Diamantes', 'def'],
    'power-gem': ['Rayo Meteórico', 'atk'],  'ice-shard': ['Carámbano', 'cd'],
    'freeze-dry': ['Frío Polar', 'atk'],     'rolling-kick': ['Patada Salto Alta', 'spd'],
    'vacuum-wave': ['Puño Incremento', 'def'], 'dynamic-punch': ['Megapuño', 'atk'],
    'shadow-sneak': ['Garra Umbría', 'cd'],  'ominous-wind': ['Golpe Umbrío', 'mag'],
    'dragon-breath': ['Pulso Dragón', 'atk'], 'dragon-claw': ['Carga Dragón', 'atk'],
    'outrage': ['Dracoflecha', 'hp'],        'draining-kiss': ['Luz Lunar', 'rgn'],
    'play-rough': ['Choque Anímico', 'atk'], 'disarming-voice': ['Encanto', 'def'],
    'mirror-shot': ['Metaláser', 'atk'],     'gyro-ball': ['Cuerpo Pesado', 'def'],
    'sucker-punch': ['Juego Sucio', 'atk'],  'night-slash': ['Lariat Oscuro', 'spd'],
    // nuevos del 22-10-2026
    'bone-club': ['Hueso Sombrío', 'hp'],    'rock-blast': ['Hachazo Pétreo', 'area'],
    'water-shuriken': ['Azote Torrencial', 'pspd'], 'bullet-seed': ['Fulgor Semilla', 'amt'],
    'pin-missile': ['Aguijón Letal', 'amt'], 'scale-shot': ['Fragor Escamas', 'luck'],
    'swift': ['Teraclúster', 'luck'],        'cross-poison': ['Garra Nociva', 'luck'],
    'cross-chop': ['Espada Santa', 'atk'],   'twister': ['Dracoenergía', 'area'],
    'waterfall': ['Pulso Primigenio', 'area'], 'photon-geyser': ['Psicoataque', 'pspd'],
    'icicle-crash': ['Lanza Glacial', 'dur'], 'sky-uppercut': ['Puño Certero', 'atk'],
    'charge-beam': ['Rayo Fusión', 'cd'],    'aurora-beam': ['Mundo Gélido', 'dur'],
    'fleur-cannon': ['Luz Aniquiladora', 'area'],
    'pyro-ball': ['V de Fuego', 'pspd'],     'aura-wheel': ['Ataque Fulgor', 'spd'],
    'rollout': ['Romperrocas', 'def'],
    'perish-song': ['Estruendo', 'xp'],      'dark-void': ['Calamidad', 'cd'],
    'spiky-shield': ['Cura Selvática', 'rgn'], 'baneful-bunker': ['Armadura Ácida', 'hp'],
    'kings-shield': ['Embate Supremo', 'def'],
    'attack-order': ['Escaramuza', 'amt'],   'last-respects': ['Marcha Espectral', 'dur'],
    'beat-up': ['Cerco Dimensión', 'atk'],
    'dual-wingbeat': ['Ala Mortífera', 'pspd'], 'steel-wing': ['Meteoimpacto', 'def'],
    'fire-pledge': ['Lluvia Ígnea', 'mag'],  'psychic-terrain': ['Onda Mental', 'area'],
    'mud-bomb': ['Arenas Ardientes', 'dur'],
    'feather-dance': ['Aerochorro', 'spd'],  'astral-barrage': ['Rayo Umbrío', 'amt'],
    'springtide-storm': ['Furia Natural', 'rgn'], 'make-it-rain': ['Deseo Oculto', 'luck']
  };
  // Lo que gana al evolucionar, según cómo funcione.
  // (23-10-2026, con tools/balance.cjs: ninguna suma más de +2 a la cantidad —el tope
  // con Réplica es +3, ver EXTRA_MAX— y se igualan las familias: las que se salían
  // —cuerpo a cuerpo, minas, giros, charcos— pegan algo menos y las flojas —rayos,
  // cadenas, torretas, remolinos, aturdir, cargas, empujones, embestidas— algo más.)
  const EVO_MODS = {
    projectile: { t: '×1,6 daño, +2 proyectiles, +2 perforación y más grandes', m: { dmg: 1.6, count: 2, pierce: 2, size: 1.3, spread: 1.1 } },
    melee:      { t: '×1,7 daño, más alcance y golpea en 360°', m: { dmg: 1.7, radius: 1.3, arc: 9 } },
    beam:       { t: '×2,1 daño, rayo un 50% más grueso y más largo', m: { dmg: 2.1, width: 1.5, radius: 1.2, cd: 0.85 } },
    orbit:      { t: '+2 orbes, ×1,7 daño y más radio', m: { count: 2, dmg: 1.7, radius: 1.15 } },
    nova:       { t: '+2 proyectiles, ×1,9 daño y +1 perforación', m: { count: 2, dmg: 1.9, pierce: 1 } },
    aura:       { t: '×1,8 daño y un 35% más de radio', m: { dmg: 1.8, radius: 1.35 } },
    boomerang:  { t: '×1,8 daño, +1 bumerán y más alcance', m: { dmg: 1.8, count: 1, radius: 1.2, size: 1.2 } },
    chain:      { t: '×2,4 daño y +2 saltos', m: { dmg: 2.4, count: 2, radius: 1.2 } },
    mine:       { t: '×1,3 daño, +2 minas y explosión más grande', m: { dmg: 1.3, count: 2, radius: 1.25 } },
    meteor:     { t: '×1,7 daño, +2 meteoros y más radio', m: { dmg: 1.7, count: 2, radius: 1.2 } },
    turret:     { t: '×2,1 daño, +1 a la vez y dispara más rápido', m: { dmg: 2.1, count: 1, rate: 0.8 } },
    dash:       { t: '×2,1 daño, más distancia y menos recarga', m: { dmg: 2.1, radius: 1.25, cd: 0.8 } },
    trail:      { t: '×1,8 daño, charcos más grandes y duraderos', m: { dmg: 1.8, radius: 1.25, dur: 1.3 } },
    cone:       { t: '×1,9 daño, +2 disparos y +1 perforación', m: { dmg: 1.9, count: 2, pierce: 1 } },
    homing:     { t: '×1,8 daño, +2 proyectiles y más grandes', m: { dmg: 1.8, count: 2, size: 1.3, spread: 1.2 } },
    bounce:     { t: '×1,8 daño, +2 rebotes y +1 proyectil', m: { dmg: 1.8, bounce: 2, count: 1, spread: 1.3 } },
    charge:     { t: '×2,1 daño, rayo un 50% más grueso y carga más rápido', m: { dmg: 2.1, width: 1.5, charge: 0.7 } },
    spin:       { t: '×1,5 daño, +1 vuelta y más radio', m: { dmg: 1.5, count: 1, radius: 1.2 } },
    quake:      { t: '×1,9 daño, +2 ondas y ondas más grandes', m: { dmg: 1.9, count: 2, radius: 1.25 } },
    vortex:     { t: '×2,2 daño, más radio y atrae más fuerte', m: { dmg: 2.2, radius: 1.3, pull: 1.4 } },
    shove:      { t: '×2 daño, más radio y empuja más', m: { dmg: 2, radius: 1.25, knock: 1.4 } },
    stun:       { t: '×2,2 daño, más radio y aturde más rato', m: { dmg: 2.2, radius: 1.3, stun: 1.4 } },
    // familias del 22-10-2026
    lob:        { t: '×1,8 daño, +2 proyectiles, +2 perforación y más grandes', m: { dmg: 1.8, count: 2, pierce: 2, size: 1.25 } },
    knife:      { t: '×1,7 daño, +1 disparo y -25% recarga', m: { dmg: 1.7, count: 1, cd: 0.75 } },
    cross:      { t: '×1,8 daño, +2 aspas, +2 perforación y más grandes', m: { dmg: 1.8, count: 2, pierce: 2, size: 1.25 } },
    column:     { t: '×1,8 daño, +1 columna, más anchas y duran más', m: { dmg: 1.8, count: 1, width: 1.3, life: 1.4 } },
    sweep:      { t: '×1,8 daño, +1 rayo, más largo y aturde más', m: { dmg: 1.8, count: 1, radius: 1.2, stun: 1.5 } },
    ricochet:   { t: '×1,8 daño, +1 proyectil y estalla en cada rebote', m: { dmg: 1.8, count: 1, size: 1.2, blast: 44 } },
    wipe:       { t: '×2 daño, +20% de efecto y -15% recarga', m: { dmg: 2, pct: 0.2, cd: 0.85 } },
    ward:       { t: '+1 escudo, ×1,8 daño y curas un 4% de vida al bloquear', m: { count: 1, dmg: 1.8, heal: 0.04 } },
    ally:       { t: '×1,8 daño, +2 aliados y más grandes', m: { dmg: 1.8, count: 2, size: 1.3 } },
    wings:      { t: '×1,8 daño, bombas más grandes y más seguidas', m: { dmg: 1.8, radius: 1.25, rate: 0.75 } },
    puddle:     { t: '×1,2 daño, +1 charco y los charcos te siguen y crecen', m: { dmg: 1.2, count: 1, follow: 1 } },
    dusting:    { t: '×2,2 daño, +2 caídas y más grandes', m: { dmg: 2.2, count: 2, size: 1.2 } }
  };

  /*
   * Evolución POR MOVIMIENTO (26-10-2026): EVO[id][2] = { t: texto de la carta, mods }. Si la
   * tiene, sus mods van en lugar de los de la familia (EVO_MODS) y lo que cambia de verdad cómo
   * funciona lo hace su mecánica (combat.js, UQ[id] o MECH3[id], con m.evolved). Así también
   * evolucionan los potenciadores que la lleven (Danza Dragón → Estruendo Escama).
   */
  // -- ataques únicos: evolución propia de Lucha, Veneno, Tierra, Volador, Psíquico, Bicho (26-10-2026) --
  const EVO_UQ = {
    'confusion':      { t: 'Los confusos que toca se vuelven marionetas: van a por otro enemigo y le pegan.', mods: { dmg: 1.35, count: 2, pierce: 1, size: 1.2 } },
    'psybeam':        { t: 'Cada enemigo tocado queda marcado: 2 s después le cae encima un pilar de energía.', mods: { dmg: 1.5, width: 1.2 } },
    'psychic':        { t: 'Levanta a todos los de la pantalla y los estampa contra el suelo (el doble dentro del Campo Psíquico).', mods: { dmg: 1.5 } },
    'psycho-cut':     { t: 'Rompe los escudos de los enemigos y, en cada pasada, se cierra como una mandíbula sobre los que hay entre la cuchilla y tú.', mods: { dmg: 1.25, count: 1, radius: 1.1 } },
    'extrasensory':   { t: 'En vez de dispersarlos, los junta en un punto delante de ti y allí estalla una onda psíquica.', mods: { dmg: 1.6, radius: 1.2 } },
    'mist-ball':      { t: 'La niebla destella cada 0,5 s: daña a todos los de dentro y les baja la defensa.', mods: { dmg: 1.15, count: 1 } },
    'photon-geyser':  { t: 'El pilar dura 2 s y se desplaza solo hacia el enemigo más cercano.', mods: { dmg: 0.6, life: 3.4 } },
    'psychic-terrain': { t: 'Dos campos que se tocan se funden en uno más grande que lanza una onda psíquica cada segundo.', mods: { dmg: 1.4, count: 1 } },
    'sludge':         { t: 'La bomba bota 3 veces por el suelo hacia el enemigo y deja un charco tóxico en cada bote.', mods: { dmg: 0.8 } },
    'poison-sting':   { t: 'En vez de disparar, das tres estocadas rápidas hacia delante que envenenan mucho.', mods: { dmg: 3.4 } },
    'toxic':          { t: 'El rastro se vuelve una nube de gas grande que te sigue: dentro, frena y envenena gravemente.', mods: { dmg: 2.0 } },
    'toxic-spikes':   { t: 'Los que caen sobre las púas revientan y salpican capas nuevas alrededor.', mods: { dmg: 1.6, count: 1 } },
    'acid-spray':     { t: 'Cada rebote suelta un anillo de veneno que alcanza a los de alrededor.', mods: { dmg: 1.5, bounce: 1, count: 1, spread: 1.3 } },
    'cross-poison':   { t: 'La X se queda grabada en el suelo 2 s: una zona venenosa en forma de X.', mods: { dmg: 1.5, count: 2 } },
    'baneful-bunker': { t: 'Al parar un golpe te vuelves líquido: te deslizas al doble de rápido, sin que te toquen, dejando ácido.', mods: { count: 1, dmg: 1.6 } },
    'mud-shot':       { t: 'El suelo erupciona bajo los embarrados: más daño cuantas más pilas de barro llevan.', mods: { dmg: 1.35, count: 2 } },
    'bulldoze':       { t: 'Cada 2 s tiembla toda la pantalla: más fuerte cerca de ti, sólo a los que no vuelan.', mods: { dmg: 3.6, cd: 2.6 } },
    'bonemerang':     { t: 'En el punto más lejano, el hueso se queda girando como una hélice antes de volver.', mods: { dmg: 1.8, count: 1 } },
    'spikes':         { t: 'Una grieta une los abrojos: hace mucho daño a los que la cruzan y se traga a los pequeños que ya están tocados.', mods: { dmg: 2.2, count: 2 } },
    'sand-tomb':      { t: 'Una estampida: cada 0,5 s sale de la arena una línea de pisotones en una dirección al azar.', mods: { dmg: 1.6, radius: 1.2 } },
    'magnitude':      { t: 'Un taladro que perfora en línea sin parar, escupe piedras a los lados y hace más críticos.', mods: { dmg: 2.5 } },
    'bone-club':      { t: 'El hueso arde en fuego fantasma: al clavarse, un círculo que daña y maldice (más daño recibido).', mods: { dmg: 1.5 } },
    'mud-bomb':       { t: 'El barro se seca en arena ardiente que quema; con sol o en el volcán dura el doble.', mods: { dmg: 1.3, count: 1, burn: 1 } },
    'gust':           { t: 'Los remolinos se juntan en un huracán grande que confunde; con lluvia, el doble de grande.', mods: { dmg: 5.5 } },
    'wing-attack':    { t: 'Reculas y al momento vuelves en picado, envuelto en llamas, a través de los enemigos.', mods: { dmg: 1.1, radius: 1.15 } },
    'aerial-ace':     { t: 'Encadenas hasta 4 saltos entre enemigos cercanos, cada uno con su tajo.', mods: { dmg: 1.4 } },
    'whirlwind':      { t: 'Un huracán se queda 3 s donde estás: levanta a los que entran y los lanza lejos, con daño al caer.', mods: { dmg: 2.2 } },
    'air-slash':      { t: 'Brillas un instante y todas las cuchillas se juntan en una enorme que no falla, lo atraviesa todo y hace críticos.', mods: { dmg: 1.4 } },
    'dual-wingbeat':  { t: 'Aves de sombra roja y negra: cada picado te cura un poco.', mods: { dmg: 2.4 } },
    'feather-dance':  { t: 'Cada 8 plumas que caen, sale de ti un aerochorro hacia el grupo más grande.', mods: { dmg: 1.5, count: 2 } },
    'bug-bite':       { t: 'Un tajo en X que marca a los enemigos: tu siguiente golpe sobre ellos es crítico seguro.', mods: { dmg: 1.5, radius: 1.2, arc: 9 } },
    'string-shot':    { t: 'Además, una red pegajosa en el suelo que atrapa al que la pisa y frena mucho.', mods: { dmg: 1.5, count: 1 } },
    'bug-buzz':       { t: 'Un enjambre te rodea y pica más fuerte a los que ya tienen la defensa al mínimo.', mods: { dmg: 1.4, radius: 1.25 } },
    'signal-beam':    { t: 'Una embestida con el cuerno: llega más lejos por cada señalado en la línea y les hace más daño.', mods: { dmg: 5.5 } },
    'u-turn':         { t: 'Te cura un poco por cada enemigo que atraviesas.', mods: { dmg: 1.7 } },
    'pin-missile':    { t: 'Si una aguja o su estallido debilita a un enemigo, tu ataque físico sube para toda la partida (hasta 10 veces).', mods: { dmg: 1.5, count: 1 } },
    'attack-order':   { t: 'Además, una colmena en el suelo que suelta una abeja cada segundo.', mods: { dmg: 1.5, count: 1 } },
    'karate-chop':    { t: 'Una ráfaga de 6 golpes rapidísimos al frente; después bajas la guardia (−20% de defensa) 2 s.', mods: { dmg: 0.5 } },
    'aura-sphere':    { t: 'Una esfera enorme y lenta que atrae a los enemigos a su paso y estalla en el blanco.', mods: { dmg: 2.4 } },
    'rolling-kick':   { t: 'Saltas al enemigo más grande y caes sobre él con un rodillazo enorme; si no hay nadie donde caes, te haces daño.', mods: { dmg: 2.3 } },
    'vacuum-wave':    { t: 'Cada enemigo golpeado te sube el ataque físico un rato (hasta 6 veces).', mods: { dmg: 2.0, radius: 1.2 } },
    'dynamic-punch':  { t: 'Ya no falla y deja un cráter 2 s donde los enemigos quedan confusos.', mods: { dmg: 2.4, radius: 1.2 } },
    'cross-chop':     { t: 'Cada 4 s, cuatro espadas se clavan a tu alrededor: los enemigos dentro reciben un 30% más de daño.', mods: { dmg: 1.9 } },
    'sky-uppercut':   { t: 'Cargas un instante: si no te golpean fuerte, un puñetazo devastador en línea; si te golpean, recuperas la mitad de la recarga.', mods: { dmg: 2.9 } }
  };
  for (const id in EVO_UQ) if (EVO[id]) EVO[id][2] = EVO_UQ[id];
  // -- fin: Lucha, Veneno, Tierra, Volador, Psíquico, Bicho --

  // -- ataques únicos: Roca, Fantasma, Dragón, Siniestro, Acero, Hada (26-10-2026) --
  const EVO_RFDSAH = {
    // Roca
    'rock-throw':    { t: '×1,5 daño y +1 piedra. Son puntiagudas: al deshacerse estallan en 6 esquirlas que atraviesan.',
                       mods: { dmg: 1.5, count: 1, size: 1.2, spread: 1.1, shards: 6 } },
    'rock-slide':    { t: '×1,5 daño y +2 rocas. Se quedan 6 s como piedras puntiagudas: ×2 a Volador, Fuego, Hielo y Bicho; ×0,5 a Lucha, Tierra y Acero.',
                       mods: { dmg: 1.5, count: 2, radius: 1.1, trap: 6 } },
    'rock-tomb':     { t: '×1,8 daño y tumba más grande. Te lanzas de cabeza a la tumba y los muros estallan hacia fuera como metralla.',
                       mods: { dmg: 1.8, radius: 1.2, stun: 1.4, head: 1 } },
    'ancient-power': { t: '+2 rocas y ×1,4 daño. Son diamantes: estallan en esquirlas al impactar y cada impacto te da +1 de defensa (hasta 5).',
                       mods: { count: 2, dmg: 1.4, radius: 1.15, gems: 1 } },
    'power-gem':     { t: '×1,4 daño y +1 gema. Las ramas que fallan vuelven a ti (+1 de at. esp.); con 3 guardadas disparas un rayo de meteoros.',
                       mods: { dmg: 1.4, count: 1, size: 1.2, spread: 1.3, meteor: 1 } },
    'rock-blast':    { t: '×2 daño. Cada roca, al caer, se parte en dos hachas de piedra que barren el suelo hacia los lados.',
                       mods: { dmg: 2, size: 1.2, pierce: 1, axes: 2 } },
    'rollout':       { t: '×1,5 daño y más grande. Al llegar a ×8 estalla, rompe las rocas del mapa cercanas (sueltan metralla) y vuelve a empezar.',
                       mods: { dmg: 1.5, size: 1.2, crush: 80 } },
    // Fantasma
    'lick':          { t: '×2,3 daño. Puños de sombra salen de tu sombra y golpean a la vez a los 3 enemigos más cercanos, sin fallar y a través de las paredes.',
                       mods: { dmg: 2.3, radius: 1.2, count: 3 } },
    'shadow-ball':   { t: '×1,5 daño y +1 bola. A los 80 px desaparece y reaparece dentro del blanco estallando, sin que la paren los escudos.',
                       mods: { dmg: 1.5, count: 1, spread: 1.1, phase: 80 } },
    'hex':           { t: '×2 daño y +2 saltos. Por cada estado que tenga un enemigo, un objeto fantasma vuela desde lejos y le golpea.',
                       mods: { dmg: 2, count: 2, radius: 1.2, polter: 1 } },
    'shadow-sneak':  { t: '×1,4 daño y +1 sombra. Salen tres garras de la sombra que desgarran al blanco y a los de alrededor, con un 30% de crítico.',
                       mods: { dmg: 1.4, count: 1, claws: 3 } },
    'ominous-wind':  { t: '×2,2 daño y más grande. Desapareces dentro del remolino (invulnerable 1 s) y reapareces en su centro con un golpe que lanza fuera a todos.',
                       mods: { dmg: 2.2, radius: 1.3, pull: 1.3, sneak: 1 } },
    'last-respects': { t: '×1,8 daño y +2 espíritus. Los enemigos que debilitan se levantan 3 s como fantasmas aliados (hasta 4) que atacan a los demás.',
                       mods: { dmg: 1.8, count: 2, size: 1.3, raise: 4 } },
    'astral-barrage': { t: '×2 daño y +2 orbes. Cada orbe que impacta abre una grieta: medio segundo después sale de ella un rayo de sombra.',
                       mods: { dmg: 2, count: 2, size: 1.2, cracks: 1 } },
    // Dragón
    'dragon-rage':   { t: '×1,7 daño y más grueso. Caen 5 cometas a lo largo del rayo; después tu at. esp. baja un 30% durante 3 s.',
                       mods: { dmg: 1.7, width: 1.4, radius: 1.2, cd: 0.9, comets: 5 } },
    'dragon-dance':  { t: 'Cada uso sube 1 pila de TODO: ataque, at. esp., velocidad y defensa. Al llegar al máximo, un rugido asusta a los de alrededor.',
                       mods: { all: 1 } },
    'dragon-breath': { t: 'Ahora es una onda con forma de cabeza de dragón que avanza 200 px atravesando a todos y al final muerde lo que pilla.',
                       mods: { dmg: 9, pulse: 1 } },
    'dragon-claw':   { t: '×2,4 daño. Embistes en semicírculo alrededor del blanco cortando todo lo del arco y acabas detrás de él.',
                       mods: { dmg: 2.4, radius: 1.2, arc: 9, charge: 1 } },
    'outrage':       { t: '×1,9 daño y más radio. Al acabar el frenesí, dos Dreepy van a por dos enemigos y vuelven a ti, dos veces.',
                       mods: { dmg: 1.9, radius: 1.2, darts: 2 } },
    'scale-shot':    { t: '×1,5 daño, +1 escama y −25% recarga. Al acabar la ráfaga, cada enemigo tocado suelta un anillo de sonido que daña a los de al lado.',
                       mods: { dmg: 1.5, count: 1, cd: 0.75, ring3: 40 } },
    'twister':       { t: '×1,5 daño y +2 tornados. Dejan un rastro de energía y, cuando dos se cruzan, estallan juntos.',
                       mods: { dmg: 1.5, count: 2, pierce: 2, size: 1.25, energy: 1 } },
    // Hada
    'fairy-wind':    { t: '×1,9 daño. Una luna se queda sobre ti y dispara rayos de luz lunar al enemigo con más vida, bajándole el ataque un 30%.',
                       mods: { count: 2, dmg: 1.9, pierce: 1, moon: 1 } },
    'dazzling-gleam': { t: '×1,8 daño. Una niebla te sigue: tú y tus compañeros dentro no recibís estados y los enemigos dentro hacen un 30% menos de daño (los Dragón, un 50%).',
                       mods: { dmg: 1.8, radius: 1.35, mist: 140 } },
    'draining-kiss': { t: '×1,8 daño y +2 besos. Lo que cures por encima de tu vida máxima se guarda como escudo (hasta un 15% de tu vida) que se va gastando.',
                       mods: { dmg: 1.8, count: 2, size: 1.3, spread: 1.2, lunar: 0.15 } },
    'play-rough':    { t: '×2,2 daño. La nube rueda 120 px hacia delante arrastrando a los que pilla dentro.',
                       mods: { dmg: 2.2, radius: 1.2, roll: 120 } },
    'disarming-voice': { t: '×2 daño y más radio. Además, a los embelesados les baja el ataque un 60%.',
                       mods: { dmg: 2, radius: 1.25, disarm: 0.6 } },
    'fleur-cannon':  { t: '×1,5 daño y +1 rayo. Al estallar, cada flor dispara un rayo de luz hacia ti que atraviesa todo lo que hay entre medias.',
                       mods: { dmg: 1.5, count: 1, radius: 1.2, annihil: 1 } },
    'springtide-storm': { t: '×1,8 daño y +2 pétalos. Además, cada pétalo quita un 1,5% de la vida que le quede al enemigo (a los jefes, la cuarta parte).',
                       mods: { dmg: 1.8, count: 2, size: 1.2, gnaw: 0.015 } },
    // Acero
    'metal-claw':    { t: '×2,6 daño. Un cabezazo con embestida corta que interrumpe a todos los que golpea.',
                       mods: { dmg: 2.6, radius: 1.3, arc: 9, head: 1 } },
    'flash-cannon':  { t: 'Un láser continuo de 1,2 s que sigue tu apuntado y se refleja hasta 4 veces.',
                       mods: { dmg: 1.1, width: 1.4, radius: 1.2, reflect: 4, laser: 1.2 } },
    'meteor-mash':   { t: '×2,2 daño y +2 bombas. Bombas imán que no fallan: se pegan al enemigo, atraen a los de alrededor y estallan a los 0,6 s.',
                       mods: { dmg: 2.2, count: 2, radius: 1.2, magnet: 80 } },
    'mirror-shot':   { t: '×1,4 daño. Dos espejos con un láser entre ellos que daña todo lo que cruza la línea.',
                       mods: { dmg: 1.4, bounce: 2, count: 1, spread: 1.3, laser: 1 } },
    'gyro-ball':     { t: '×1,5 daño y +1 vuelta. Quieto te anclas: no te frenan y los que te tocan rebotan aturdidos y reciben el giro.',
                       mods: { dmg: 1.5, count: 1, radius: 1.2, anchor: 1 } },
    'kings-shield':  { t: '+1 escudo y ×1,8 daño. En forma Filo, una espada fantasma gira a tu alrededor cortando.',
                       mods: { count: 1, dmg: 1.8, heal: 0.04, sword: 1 } },
    'steel-wing':    { t: '×1,5 daño. El ave se estrella como un meteoro en el grupo más grande y deja un cráter de chatarra 4 s: dentro, +defensa para ti.',
                       mods: { dmg: 1.5, radius: 1.25, crash: 80 } },
    'make-it-rain':  { t: '×2,2 daño y +2 monedas. 2 s después de cada lluvia, una estrella cae sobre el grupo más grande.',
                       mods: { dmg: 2.2, count: 2, size: 1.2, wish: 1 } },
    // Siniestro
    'bite':          { t: '×1,7 daño. Cada mordisco le baja la defensa y al soltarlo lo lanzas lejos.',
                       mods: { dmg: 1.7, radius: 1.3, arc: 9, crunch: 1 } },
    'dark-pulse':    { t: '×1,9 daño. Los pulsos llegan el doble de lejos y bajan el ataque de los alcanzados un 40%.',
                       mods: { count: 2, dmg: 1.9, pierce: 1, shriek: 1 } },
    'night-shade':   { t: '×1,8 daño. Los que pasan 2 s dentro se duermen y los dormidos pierden un 3% de su vida por segundo.',
                       mods: { dmg: 1.8, radius: 1.35, dream: 1 } },
    'sucker-punch':  { t: '×1,8 daño y +2 golpes. Duele más cuanto más fuerte es el enemigo: a los jefes, ×2,5.',
                       mods: { dmg: 1.8, count: 2, size: 1.3, spread: 1.2, foul: 1 } },
    'night-slash':   { t: '×1,3 daño y un 40% más de radio. Giras con los brazos abiertos atrayendo hacia dentro, sin que te paren los escudos ni la resistencia a tu tipo.',
                       mods: { dmg: 1.3, count: 1, radius: 1.4, lariat: 1 } },
    'dark-void':     { t: '×2 daño, +20% de efecto y −15% recarga. Al acabar, un agujero negro se abre en ti 3 s y se traga a los dormidos.',
                       mods: { dmg: 2, pct: 0.2, cd: 0.85, hole: 3 } },
    'beat-up':       { t: '×1,8 daño y +1 copia. Salen de portales junto a los enemigos (les pegan por la espalda) y los portales se tragan los disparos enemigos.',
                       mods: { dmg: 1.8, count: 1, size: 1.3, portal: 1 } }
  };
  EVO['dragon-dance'] = ['Estruendo Escama', 'spd'];          // (los potenciadores no tenían)
  for (const id in EVO_RFDSAH) if (EVO[id]) EVO[id][2] = EVO_RFDSAH[id];
  // -- fin de Roca, Fantasma, Dragón, Siniestro, Acero, Hada --

  /** Lo que gana una instancia al evolucionar: lo suyo (EVO[id][2]) o lo de su familia. null si no evoluciona. */
  function evoMods(m) {
    const e = EVO[m.id], own = e && e[2];
    return own && own.mods ? own.mods : EVO_MODS[m.kind] ? EVO_MODS[m.kind].m : null;
  }
  function evoText(m) {
    const e = EVO[m.id], own = e && e[2];
    return own && own.t ? own.t : EVO_MODS[m.kind] ? EVO_MODS[m.kind].t : '';
  }

  // ---------------- pasivos de la run (22-10-2026) ----------------
  /*
   * Cartas al estilo de los pasivos de Vampire Survivors. Cada jugador lleva
   * pl.pass = { area, dur, amt, pspd } (1, 1, 0, 1 al empezar) y aquí se dice
   * qué número cambia cada uno en cada familia:
   *   a   × área            ah  × (1 + (área − 1) / 2)  (largo de los rayos)
   *   d   × duración        s   × propulsión     s2  × propulsión²     si  ÷ propulsión
   *   n   + n por cada carta de Réplica (count): 1 en todas desde el 23-10-2026 (las
   *       ráfagas radiales y los abanicos sumaban 2 y las lluvias 3), con el tope EXTRA_MAX
   *   code  el pasivo lo lee combat.js con m.pk (meteoros, terremoto, aturdir, charcos)
   */
  const PASSIVE_RULES = {
    projectile: { a: ['size'], s: ['speed'], n: 1 },
    homing:     { a: ['size'], s: ['speed'], n: 1 },
    bounce:     { a: ['size'], s: ['speed'], n: 1 },
    nova:       { a: ['size'], s: ['speed'], n: 1 },
    cone:       { a: ['size'], s: ['speed'], n: 1 },
    melee:      { a: ['radius'] },
    beam:       { a: ['width'], ah: ['radius'] },
    charge:     { a: ['width'], ah: ['radius'], si: ['charge'] },
    orbit:      { a: ['radius', 'size'], s: ['speed'], n: 1 },
    aura:       { a: ['radius'] },
    buff:       { d: ['dur'] },
    boomerang:  { a: ['size'], s: ['speed'], n: 1 },
    chain:      { a: ['radius'], n: 1 },
    mine:       { a: ['radius'], d: ['dur'], n: 1 },
    meteor:     { a: ['radius'], n: 1, code: 'pspd' },               // caída en 0,5/S s
    turret:     { a: ['range', 'size'], d: ['dur'], s: ['speed'], n: 1 },
    dash:       { a: ['width'] },
    trail:      { a: ['radius'], d: ['dur'] },
    spin:       { a: ['radius'], n: 1 },
    quake:      { a: ['radius'], n: 1, code: 'pspd' },               // una onda cada 0,07/S s
    vortex:     { a: ['radius'], d: ['dur'] },
    shove:      { a: ['radius'] },
    stun:       { a: ['radius'], d: ['stun'], code: 'amt' },         // 1 + amt zonas (como mucho EXTRA_MAX más)
    lob:        { a: ['size'], s: ['speed'], s2: ['grav'], n: 1 },  // misma curva, más rápida
    knife:      { a: ['size'], s: ['speed'], n: 1 },
    cross:      { a: ['size'], s: ['speed', 'curl'], n: 1 },        // misma espiral, más rápida
    column:     { a: ['width', 'height'], d: ['life'], n: 1 },
    sweep:      { a: ['radius', 'width'], d: ['dur', 'stun'], s: ['turn'], n: 1 },
    ricochet:   { a: ['size', 'blast'], d: ['dur'], s: ['speed'], n: 1 },
    wipe:       { d: ['stun'] },
    ward:       { a: ['radius'], d: ['stun'], n: 1 },
    ally:       { a: ['size'], d: ['dur'], s: ['speed'], n: 1 },
    // (El círculo de las aves, la mitad: con toda la Amplitud volaban casi al borde de la pantalla.)
    wings:      { a: ['radius'], ah: ['ring'], d: ['dur'], s: ['speed'], n: 1 },
    puddle:     { a: ['radius'], d: ['dur'], n: 1, code: 'pspd' },   // vuelo del frasco 0,45/S s
    dusting:    { a: ['size'], s: ['speed'], n: 1 }
  };
  const NO_PASS = Object.freeze({ area: 1, dur: 1, amt: 0, pspd: 1 });

  /*
   * Tope de cantidad (23-10-2026): lo que no es el nivel propio del ataque (las
   * cartas de Réplica, la evolución...) suma como mucho EXTRA_MAX proyectiles,
   * orbes, minas, aliados... a lo que lanza a su nivel. Es el único sitio: lo
   * aplica applyPassives (por donde pasan rebake y los ataques de los
   * compañeros) y combat.js lo lee para las zonas de aturdir y la red.
   */
  const EXTRA_MAX = 3;

  /** Cantidad (count) que lanza la instancia s sólo con su nivel (sin evolución ni pasivos). */
  function levelCount(s) {
    const d = s.def || BY_ID[s.id];
    if (!d || !d.ups) return s.count | 0;
    let c = d.count | 0;
    for (let i = 0; i < s.lvl - 1 && i < d.ups.length; i++) c += d.ups[i].m.count | 0;
    return c;
  }

  function mulKeys(m, keys, k) {
    if (!keys || k === 1) return;
    for (const key of keys) if (typeof m[key] === 'number') m[key] *= k;
  }

  /** Aplica los pasivos P a una instancia (recién hecha: instance + evolve). */
  function applyPassives(m, P) {
    const r = P && PASSIVE_RULES[m.kind];
    if (r) {
      const A = P.area || 1, D = P.dur || 1, S = P.pspd || 1, n = P.amt | 0;
      mulKeys(m, r.a, A); mulKeys(m, r.ah, 1 + (A - 1) / 2); mulKeys(m, r.d, D);
      mulKeys(m, r.s, S); mulKeys(m, r.s2, S * S); mulKeys(m, r.si, 1 / S);
      if (r.n && n > 0) m.count = (m.count || 0) + r.n * n;
    }
    // Tope: como mucho EXTRA_MAX más de lo que lanza a su nivel (evolución y Réplica juntas).
    if (typeof m.count === 'number') m.count = Math.min(m.count, levelCount(m) + EXTRA_MAX);
    m.pk = P || NO_PASS;
    return m;
  }

  // Lo que se copia al rehacer: sólo números (no la recarga en curso, el daño
  // hecho, los orbes ni los escudos guardados). (range: el de las torretas, con Amplitud.)
  const BAKE = MULT.concat(ADD, ['follow', 'range']);

  /** Rehace una instancia con su nivel, su evolución y los pasivos P. */
  function rebake(m, P) {
    const s = instance(m.id, m.lvl);
    if (!s) return m;
    if (m.evolved && evoMods(s)) applyMods(s, evoMods(s));
    applyPassives(s, P);
    for (const k of BAKE) if (s[k] !== undefined) m[k] = s[k];
    m.pk = s.pk;
    return m;
  }

  /** Todos los movimientos de un jugador (tras coger una carta). */
  function rebakeAll(pl) {
    if (!pl || !pl.moves) return;
    for (const m of pl.moves) rebake(m, pl.pass);
  }

  /** ¿Le sirve el pasivo `id` (area, dur, amt, pspd) a un movimiento de esta familia? */
  function passiveAffects(kind, id) {
    const r = PASSIVE_RULES[kind];
    if (!r) return false;
    if (id === 'area') return !!(r.a || r.ah);
    if (id === 'dur') return !!r.d;
    if (id === 'amt') return !!r.n || r.code === 'amt';
    if (id === 'pspd') return !!(r.s || r.s2 || r.si) || r.code === 'pspd';
    return true;
  }

  /** Familias que no hacen (casi) daño: como mucho 2 entre todas (ver levelup.js). */
  function nonAttacking(kind) { return kind === 'buff' || kind === 'ward' || kind === 'wipe'; }

  /** ¿Puede evolucionar ya? → { name, needs, needName, text, ready } o null */
  function evoInfo(m, statsTaken) {
    const e = EVO[m.id];
    if (!e || m.evolved || m.lvl < m.def.maxLvl || !evoMods(m)) return null;
    const [name, needs] = e;
    return { name, needs, needName: NEED_NAME[needs], text: evoText(m),
             ready: !!(statsTaken && statsTaken[needs]) };
  }

  /** Evoluciona una instancia (cambia nombre y potencia; sigue siendo del mismo tipo). */
  function evolve(m) {
    const e = EVO[m.id];
    if (!e || m.evolved || !evoMods(m)) return false;
    applyMods(m, evoMods(m));
    m.baseName = m.name;
    m.name = e[0];
    m.evolved = true;
    return true;
  }

  // ---------------- movimientos Z (24-10-2026, Tienda Kecleon) ----------------
  /*
   * Uno por tipo, con su nombre oficial. Se juegan con el Cristal Z de ese tipo
   * (data/shop.js, para siempre) y un compañero de ese tipo: pulsas Z (o su botón)
   * y durante Z_DUR s se lanza solo, a la vez que tus ataques; luego se recarga
   * Z_CD s (combat.js zUse / zTick). Cada uno es una familia de las de siempre
   * (mismo código y gráficos) con números y tamaños de evolución o más; vfx: su
   * forma, si no la del tipo (entities/vfx.js). zones: zonas de más (aturdir).
   *
   * Daño: el de aquí × zPower(nivel) al pulsarlo, para que valga igual al
   * principio que al final (tus ataques suben de nivel y evolucionan). Medido con
   * tools/balance.cjs --z: al nivel 1 rinde unas 3 veces lo normal de un ataque de
   * nivel 1 y, desde el nivel 45 (minuto 15 más o menos), unas 1,8 veces lo normal
   * de uno evolucionado. Físico o especial: el lado fuerte de tu Pokémon (en los
   * juegos sale del ataque del que viene). No sube de nivel ni evoluciona; los
   * pasivos (Amplitud, Réplica...) sí cuentan, con el tope de cantidad de siempre.
   */
  const Z_DUR = 60, Z_CD = 240;                 // 1 min activo, 4 min de recarga
  const Z_KL = 0.14, Z_KMAX = 7.2;              // daño × (1 + 0,14 por nivel), como mucho ×7,2 (nivel 45)
  const zPower = lvl => Math.min(Z_KMAX, 1 + Z_KL * (Math.max(1, lvl | 0) - 1));
  const Z_RAW = [
    { type: 'normal', name: 'Carrera Arrolladora', kind: 'shove',
      desc: 'Embistes con todo: una onda enorme machaca y aparta a todo lo que te rodea.',
      cd: 0.9, dmg: 20, radius: 150, knock: 420 },
    { type: 'fighting', name: 'Ráfaga Demoledora', kind: 'cone',
      desc: 'Una lluvia de puñetazos en abanico que atraviesa a los enemigos.',
      cd: 0.5, dmg: 4, count: 14, arc: 1.2, speed: 420, life: 0.55, size: 9, pierce: 2, knock: 40, vfx: { proj: 'impact' } },
    { type: 'flying', name: 'Picado Supersónico', kind: 'wings',
      desc: 'Cuatro aves gigantes vuelan en círculo y bombardean en picado todo lo de abajo.',
      cd: 6, dmg: 17, count: 4, speed: 2, radius: 54, dur: 6, rate: 0.35, ring: 160, vfx: { proj: 'bird' } },
    { type: 'poison', name: 'Diluvio Corrosivo', kind: 'dusting',
      desc: 'Llueve ácido en toda la pantalla: daña y envenena a todos los que pilla.',
      cd: 1.0, dmg: 6.5, count: 22, speed: 260, size: 9, poison: 1 },
    { type: 'ground', name: 'Barrena Telúrica', kind: 'quake',
      desc: 'El suelo revienta en una línea larguísima de explosiones.',
      cd: 0.8, dmg: 15, count: 14, radius: 46 },
    { type: 'rock', name: 'Aplastamiento Gigalítico', kind: 'meteor',
      desc: 'Caen rocas gigantes sobre los enemigos y aplastan todo lo de alrededor.',
      cd: 0.9, dmg: 10.5, count: 6, radius: 80, knock: 120 },
    { type: 'bug', name: 'Guadaña Sedosa', kind: 'cross',
      desc: 'Guadañas de seda salen girando en espiral, atraviesan a todos y los frenan.',
      cd: 0.7, dmg: 11.5, count: 10, speed: 300, life: 1.4, size: 11, pierce: 4, curl: 2, slow: 0.3, vfx: { proj: 'crescent' } },
    { type: 'ghost', name: 'Presa Espectral', kind: 'stun',
      desc: 'Manos de sombra salen del suelo bajo varios enemigos y los dejan quietos.',
      cd: 1.0, dmg: 22, radius: 90, stun: 1.2, zones: 2 },
    { type: 'steel', name: 'Hélice Trepanadora', kind: 'spin',
      desc: 'Giras como un taladro de acero y perforas todo lo que te rodea.',
      cd: 0.8, dmg: 4, count: 6, radius: 110 },
    { type: 'fire', name: 'Hecatombe Pírica', kind: 'lob',
      desc: 'Bolas de fuego gigantes caen sobre los enemigos, los atraviesan y los queman.',
      cd: 0.8, dmg: 14.5, count: 4, speed: 360, life: 1.8, size: 18, pierce: 6, spread: 80, grav: 700, burn: 2 },
    { type: 'water', name: 'Hidrovórtice Abisal', kind: 'vortex',
      desc: 'Un remolino enorme arrastra a los enemigos a su centro y los ahoga.',
      cd: 1.6, dmg: 7, radius: 140, dur: 3.2, pull: 260 },
    { type: 'grass', name: 'Megatón Floral', kind: 'column',
      desc: 'Columnas de flores brotan sobre los enemigos y lo arrasan todo.',
      cd: 0.8, dmg: 6.3, count: 3, life: 0.6, width: 64, height: 300, anchor: 'target', vfx: { proj: 'petal' } },
    { type: 'electric', name: 'Gigavoltio Destructor', kind: 'charge',
      desc: 'Cargas una lanza de rayos y la sueltas: un rayo gigante que lo atraviesa todo.',
      cd: 1.1, charge: 0.45, dmg: 47, radius: 420, width: 90, vfx: { beam: 'lightning', proj: 'bolt' } },
    { type: 'psychic', name: 'Disruptor Psíquico', kind: 'ricochet',
      desc: 'Orbes psíquicos rebotan por toda la pantalla y estallan en cada golpe.',
      cd: 2.2, dmg: 15.5, count: 4, speed: 420, size: 13, homing: 1.4, dur: 2.4, blast: 60 },
    { type: 'ice', name: 'Crioaliento Despiadado', kind: 'sweep',
      desc: 'Dos rayos helados gigantes giran a tu alrededor y congelan a todos.',
      cd: 2.0, dmg: 12.5, count: 2, width: 30, radius: 230, dur: 2.0, turn: 4.6, stun: 0.5 },
    { type: 'dragon', name: 'Dracoaliento Devastador', kind: 'beam',
      desc: 'Un aliento de dragón enorme y larguísimo que lo atraviesa todo.',
      cd: 0.55, dmg: 22, radius: 380, width: 80, vfx: { beam: 'fire' } },
    { type: 'dark', name: 'Agujero Negro Aniquilador', kind: 'vortex',
      desc: 'Abres un agujero negro que se traga a los enemigos y los destroza.',
      cd: 2.4, dmg: 7, radius: 190, dur: 3.6, pull: 340, vfx: { proj: 'shadow' } },
    { type: 'fairy', name: 'Arrumaco Sideral', kind: 'nova',
      desc: 'Una explosión de estrellas en todas las direcciones que buscan a los enemigos.',
      cd: 0.7, dmg: 6.5, count: 20, speed: 300, pierce: 2, life: 1.4, size: 10, homing: 1.5 }
  ];
  const Z_BY_TYPE = Object.create(null);
  for (const z of Z_RAW) {
    z.id = 'z-' + z.type;
    z.z = true;
    z.cat = 'physical';                         // (al pulsarlo: el lado fuerte del Pokémon, zInstance)
    z.ups = [];
    z.maxLvl = 1;
    // Como los de siempre: los que disparan bolas llevan count y spread.
    if (z.count == null && (z.kind === 'projectile' || z.kind === 'homing' || z.kind === 'bounce')) z.count = 1;
    Z_BY_ID[z.id] = z;
    Z_BY_TYPE[z.type] = z;
  }

  /**
   * El movimiento Z de un tipo listo para lanzar: con el daño de tu nivel, la
   * categoría de tu lado fuerte (cat) y tus pasivos P. null si no hay.
   */
  function zInstance(type, lvl = 1, P = null, cat = null) {
    const def = Z_BY_TYPE[type];
    if (!def) return null;
    const s = instance(def.id, 1);
    s.dmg *= zPower(lvl);
    if (cat === 'physical' || cat === 'special') s.cat = cat;
    return applyPassives(s, P);
  }

  /** Un movimiento por su id: los de siempre y los Z (los de la red: ghostCast). */
  const get = id => (typeof id === 'string' ? BY_ID[id] || Z_BY_ID[id] || null : null);

  G.Moves = { ALL: RAW, BY_ID, POOL, poolFor, instance, levelUp, nextUpText, startFor,
              EVO, NEED_NAME, evoInfo, evolve,
              PASSIVE_RULES, NO_PASS, EXTRA_MAX, levelCount, applyPassives, rebake, rebakeAll, passiveAffects, nonAttacking,
              Z: Z_BY_TYPE, Z_BY_ID, Z_DUR, Z_CD, zPower, zInstance, get };
})();
