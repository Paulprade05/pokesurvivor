/* ============ pixellab_gen.cjs — pide una imagen a PixelLab (api.pixellab.ai/v2) ============
 * Arte generado con PixelLab para PokéSurvivor (cofres, árboles, trampas: tools/pixellab_art.py lo prepara para el
 * juego). Uso:
 *   node tools/pixellab_gen.cjs <endpoint> <pedido.json> <salida.png> [salida_2.png ...]
 *   node tools/pixellab_gen.cjs balance
 * En el pedido, un campo {"file": "ruta.png"} se manda como imagen (base64). Los trabajos en segundo plano
 * (background_job_id) se esperan solos.
 * La clave NUNCA va en el repositorio (es público): se lee de la variable PIXELLAB_API_KEY o, si no está, del archivo
 * .pixellab-key de la carpeta de encima del repositorio.
 */
const fs = require('fs'), path = require('path');
const API = 'https://api.pixellab.ai/v2';

function key() {
  if (process.env.PIXELLAB_API_KEY) return process.env.PIXELLAB_API_KEY.trim();
  const f = path.join(__dirname, '..', '..', '.pixellab-key');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  throw new Error('Falta la clave: PIXELLAB_API_KEY o ' + f);
}

async function call(method, ep, body) {
  const r = await fetch(API + ep, {
    method, headers: { Authorization: 'Bearer ' + key(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const t = await r.text();
  if (!r.ok) throw new Error(method + ' ' + ep + ' -> ' + r.status + ' ' + t.slice(0, 500));
  return JSON.parse(t);
}

// {"file": "x.png"} -> imagen base64; el resto, igual.
function expand(v) {
  if (Array.isArray(v)) return v.map(expand);
  if (v && typeof v === 'object') {
    if (typeof v.file === 'string') {
      const o = { type: 'base64', base64: fs.readFileSync(v.file).toString('base64'), format: 'png' };
      return v.wrap ? { image: o, width: v.width, height: v.height } : o;
    }
    const o = {};
    for (const k in v) o[k] = expand(v[k]);
    return o;
  }
  return v;
}

// Todas las imágenes de una respuesta, en orden.
function images(o, out = []) {
  if (Array.isArray(o)) { for (const x of o) images(x, out); return out; }
  if (o && typeof o === 'object') {
    if (typeof o.base64 === 'string') { out.push(o.base64.replace(/^data:image\/\w+;base64,/, '')); return out; }
    for (const k in o) images(o[k], out);
  }
  return out;
}

async function main() {
  const [ep, req, ...outs] = process.argv.slice(2);
  if (ep === 'balance') { console.log(JSON.stringify(await call('GET', '/balance'))); return; }
  let res = await call('POST', '/' + ep.replace(/^\//, ''), expand(JSON.parse(fs.readFileSync(req, 'utf8'))));
  if (res.usage) console.log('coste', JSON.stringify(res.usage));
  const id = res.background_job_id;
  if (id) {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      res = await call('GET', '/background-jobs/' + id);
      if (res.status === 'completed') break;
      if (res.status === 'failed') throw new Error('falló: ' + JSON.stringify(res).slice(0, 500));
    }
    if (res.usage) console.log('coste', JSON.stringify(res.usage));
  }
  const ims = images(res.last_response || res);
  if (!ims.length) throw new Error('sin imagen: ' + JSON.stringify(res).slice(0, 500));
  const base = outs[0] || 'out.png';
  ims.forEach((b, i) => {
    const f = outs[i] || base.replace(/\.png$/, '_' + i + '.png');
    fs.writeFileSync(f, Buffer.from(b, 'base64'));
    console.log('->', f);
  });
}
main().catch(e => { console.error(String(e.message || e).replace(/pixl_\w+/g, 'pixl_***')); process.exit(1); });
