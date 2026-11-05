/* ============ natures.js — GENERADO, no editar a mano ============
 * Las 25 naturalezas: +10 % a un stat (up) y −10 % a otro (down); 5 son neutras.
 * Stats: pa Ataque · sa Ataque Especial · df Defensa · sd Defensa Especial · spd Velocidad.
 * Sacado del PR #236 de TheAdro7 (datos de PokeAPI) el 20-10-2026.
 * Nombres: [es, en]; van aquí y no en el diccionario porque "Potencia", "Imán" o
 * "Rara" ya significan otra cosa allí. Ver G.Mons.name().
 */
G.NATURES = [
  {"id":"hardy","n":["Fuerte","Hardy"],"up":"","down":""},
  {"id":"bold","n":["Osada","Bold"],"up":"df","down":"pa"},
  {"id":"modest","n":["Modesta","Modest"],"up":"sa","down":"pa"},
  {"id":"calm","n":["Serena","Calm"],"up":"sd","down":"pa"},
  {"id":"timid","n":["Miedosa","Timid"],"up":"spd","down":"pa"},
  {"id":"lonely","n":["Huraña","Lonely"],"up":"pa","down":"df"},
  {"id":"docile","n":["Dócil","Docile"],"up":"","down":""},
  {"id":"mild","n":["Afable","Mild"],"up":"sa","down":"df"},
  {"id":"gentle","n":["Amable","Gentle"],"up":"sd","down":"df"},
  {"id":"hasty","n":["Activa","Hasty"],"up":"spd","down":"df"},
  {"id":"adamant","n":["Firme","Adamant"],"up":"pa","down":"sa"},
  {"id":"impish","n":["Agitada","Impish"],"up":"df","down":"sa"},
  {"id":"bashful","n":["Tímida","Bashful"],"up":"","down":""},
  {"id":"careful","n":["Cauta","Careful"],"up":"sd","down":"sa"},
  {"id":"rash","n":["Alocada","Rash"],"up":"sa","down":"sd"},
  {"id":"jolly","n":["Alegre","Jolly"],"up":"spd","down":"sa"},
  {"id":"naughty","n":["Pícara","Naughty"],"up":"pa","down":"sd"},
  {"id":"lax","n":["Floja","Lax"],"up":"df","down":"sd"},
  {"id":"quirky","n":["Rara","Quirky"],"up":"","down":""},
  {"id":"naive","n":["Ingenua","Naive"],"up":"spd","down":"sd"},
  {"id":"brave","n":["Audaz","Brave"],"up":"pa","down":"spd"},
  {"id":"relaxed","n":["Plácida","Relaxed"],"up":"df","down":"spd"},
  {"id":"quiet","n":["Mansa","Quiet"],"up":"sa","down":"spd"},
  {"id":"sassy","n":["Grosera","Sassy"],"up":"sd","down":"spd"},
  {"id":"serious","n":["Seria","Serious"],"up":"","down":""}
];
G.NATURE_BY = {};
for (const n of G.NATURES) G.NATURE_BY[n.id] = n;
