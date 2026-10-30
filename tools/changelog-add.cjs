// Añade una entrada nueva arriba de G.CHANGELOG (js/data/changelog.js) y sus filas a js/data/lang-updates.js.
// Uso: node tools/changelog-add.cjs <items.json> <repo> <fecha AAAA-MM-DD> <titulo.json>
//   items.json  = [{ "tipo": "new"|"chg"|"fix", "es": "…", "en": "…", "fr": "…", "it": "…", "ptBR": "…", "zhHans": "…", "zhHant": "…" }, …]
//   titulo.json = { "es": "…", "en": "…", "fr": "…", "it": "…", "ptBR": "…", "zhHans": "…", "zhHant": "…" }
const fs = require('fs'), path = require('path');
const [file, repo, date, titleFile] = process.argv.slice(2);
const items = require(path.resolve(file)), title = require(path.resolve(titleFile));
const P = f => path.join(repo, f), dq = s => JSON.stringify(s);
let cl = fs.readFileSync(P('js/data/changelog.js'), 'utf8');
const nl = cl.includes('\r\n') ? '\r\n' : '\n';
const part = k => {
  const xs = items.filter(x => x.tipo === k);
  if (!xs.length) return '';
  return `${k}: [` + nl + xs.map(x => `    [${dq(x.es)},` + nl + `     ${dq(x.en)}]`).join(',' + nl) + '],';
};
const parts = ['new', 'chg', 'fix'].map(part).filter(Boolean);
const entry = `  { d: '${date}', title: [${dq(title.es)}, ${dq(title.en)}], ` + parts.join(nl + '  ') .replace(/,$/, '') + ' },' + nl;
const at = cl.indexOf('G.CHANGELOG = [');
const ins = cl.indexOf(nl, at) + nl.length;
cl = cl.slice(0, ins) + entry + cl.slice(ins);
fs.writeFileSync(P('js/data/changelog.js'), cl);
let up = fs.readFileSync(P('js/data/lang-updates.js'), 'utf8');
const nl2 = up.includes('\r\n') ? '\r\n' : '\n';
const has = s => up.includes('[' + dq(s) + ',');
const row = t => `    [${[t.es, t.fr, t.it, t.ptBR, t.zhHans, t.zhHant].map(dq).join(', ')}],`;
const rows = [title, ...items].filter(t => !has(t.es)).map(row);
const cut = up.indexOf(nl2 + '  ];');
up = up.slice(0, cut) + nl2 + `    // ---------------- ${date}: ${title.es} (novedades) ----------------` + nl2 + rows.join(nl2) + up.slice(cut);
fs.writeFileSync(P('js/data/lang-updates.js'), up);
console.log('entrada con', items.length, 'líneas;', rows.length, 'filas nuevas en lang-updates');
