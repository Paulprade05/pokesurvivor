#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Descarga los sprites estilo Mundo Misterioso de SpriteCollab (normal y shiny)
a assets/pokemon/ y genera js/data/sprites-meta.js.

    python tools/fetch_sprites.py            # todos los que existan (1-1025)
    python tools/fetch_sprites.py 1 151      # sólo un rango de la Pokédex
    python tools/fetch_sprites.py --ext      # sólo las animaciones extra (Sleep.png, Ext.png y
                                             # More.png) de los que ya están, sin tocar las 7 de
                                             # siempre (--ext 1 151: sólo ese rango)

Se puede interrumpir y relanzar: lo ya bajado se reutiliza (tools/cache/; las
animaciones extra guardan además lo bajado en tools/cache/raw/).

Animaciones extra (26-10-2026), en atlas (un PNG con varias animaciones, para no
tener miles de archivos sueltos; cada una con su x, y dentro). Ver EXT_GROUPS:
  Sleep.png Sleep              dormir y caer (los que no tienen Faint propio)
  Ext.png   Hop, Rotate        saltar y girar (las tienen casi todos)
  More.png  Pose, Eat, Nod...  sólo ~220, los de Mundo Misterioso original (el
                               compañero del menú; Pose, también al subir de nivel)
Las que son copia (CopyOf) de una de las 7 de siempre o de otra extra no se guardan.
El shiny va en s/ con la MISMA colocación; lo que no tenga el shiny (o tenga otro
tamaño) se apunta en `xm` y queda en blanco. Ocupan ~35 MB (normal y shiny).

Fuente: https://github.com/PMDCollab/SpriteCollab  (CC BY-NC 4.0)
Créditos: python tools/fetch_credits.py

Formato de SpriteCollab:
  sprite/{dex}/            sprite normal
  sprite/{dex}/0000/0001/  sprite shiny (forma 0000, variante 0001)
  - columnas = fotogramas, filas = 8 direcciones
    (Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft; verificado
     con los -Offsets.png)
  - cada animación tiene su propio tamaño de fotograma, así que se alinean por
    el ancla al suelo, que se saca del -Shadow.png

Las hojas se guardan como PNG con paleta (sin pérdida): ocupan la mitad.
"""
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master'
BASE = RAW + '/sprite'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ASSETS = os.path.join(ROOT, 'assets', 'pokemon')
OUT_META = os.path.join(ROOT, 'js', 'data', 'sprites-meta.js')
CACHE = os.path.join(ROOT, 'tools', 'cache')
CACHE_EXT = os.path.join(CACHE, 'ext')

WANT = ['Idle', 'Walk', 'Attack', 'Shoot', 'Charge', 'Hurt', 'Faint']
FALLBACK = {
    'Idle': ['Walk'],
    'Walk': ['Idle'],
    'Attack': ['Strike', 'Swing', 'Shoot', 'Idle'],
    'Shoot': ['Attack', 'Strike', 'Idle'],
    'Charge': ['DeepBreath', 'Idle'],
    'Hurt': ['Cringe', 'Idle'],
    'Faint': ['Hurt', 'Idle'],
}
REQUIRED = {'Idle', 'Walk', 'Attack'}

# ---- Animaciones extra (atlas, ver arriba) ----
# (archivo, animaciones). El índice de cada archivo es el que va en la meta (x); los
# nombres van también a la meta (G.SPRITE_EXT). OJO: el service worker (sw.js) guarda
# los sprites para siempre, así que si cambia lo que va en un atlas (y con ello su
# colocación), cámbiale también el nombre (Ext2, More2...): si no, quien ya tenga el
# viejo vería trozos cambiados.
# Sleep va sola: es diminuta (1 fila, 2 fotogramas) y la usan muchos enemigos (caer,
# dormir), que así no cargan el atlas grande; Hop y Rotate sólo los saltadores y tu Pokémon.
EXT_GROUPS = [
    ('Ext', ['Hop', 'Rotate']),
    ('More', ['Pose', 'Eat', 'Nod', 'LookUp', 'Sit', 'Wake', 'DeepBreath', 'Twirl']),
    ('Sleep', ['Sleep']),
]
EXT_FILES = [f for f, _ in EXT_GROUPS]


def fetch(url, retries=4):
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'pokesurvivor/1.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
        except Exception as e:
            last = e
    print(f'    ! {url.split("/sprite/")[-1]} -> {last}')
    return None


def fetch_raw(url):
    """fetch() con copia en tools/cache/raw/ (para rehacer los atlas sin volver a bajarlo todo)."""
    path = os.path.join(CACHE, 'raw', *url.split('/sprite/')[-1].split('/'))
    if os.path.exists(path):
        return open(path, 'rb').read()
    data = fetch(url)
    if data:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(data)
    return data


def parse_animdata(xml):
    anims = {}
    for blk in re.findall(r'<Anim>(.*?)</Anim>', xml, re.S):
        name = re.search(r'<Name>(\w+)</Name>', blk)
        if not name:
            continue
        name = name.group(1)
        copy = re.search(r'<CopyOf>(\w+)</CopyOf>', blk)
        if copy:
            anims[name] = {'copyOf': copy.group(1)}
            continue
        fw = re.search(r'<FrameWidth>(\d+)</FrameWidth>', blk)
        fh = re.search(r'<FrameHeight>(\d+)</FrameHeight>', blk)
        if not (fw and fh):
            continue
        durs = [int(x) for x in re.findall(r'<Duration>(\d+)</Duration>', blk)]
        anims[name] = {'w': int(fw.group(1)), 'h': int(fh.group(1)), 'n': len(durs), 'd': durs}
    shadow = re.search(r'<ShadowSize>(\d+)</ShadowSize>', xml)
    return anims, int(shadow.group(1)) if shadow else 1


def resolve(anims, name, seen=None):
    seen = seen or set()
    if name not in anims or name in seen:
        return None, None
    seen.add(name)
    a = anims[name]
    if 'copyOf' in a:
        return resolve(anims, a['copyOf'], seen)
    return name, a


def ground_anchor(png, w, h):
    try:
        im = Image.open(io.BytesIO(png)).convert('RGBA')
    except Exception:
        return None
    px = im.crop((0, 0, w, h)).load()
    xs = ys = n = 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40:
                xs += x; ys += y; n += 1
    return (round(xs / n, 1), round(ys / n, 1)) if n else None


def save_optimized(png, path):
    """Guarda como PNG con paleta exacta (sin pérdida). Devuelve (ancho, alto)."""
    return save_image(Image.open(io.BytesIO(png)).convert('RGBA'), path)


def save_image(im, path):
    """Guarda una imagen RGBA como PNG con paleta exacta (sin pérdida). Devuelve (ancho, alto)."""
    cols = im.getcolors(256)
    if cols is None:                          # más de 256 colores: tal cual
        im.save(path, 'PNG', optimize=True)
        return im.size
    colors = [c for _, c in cols]
    # El transparente primero: algunos lectores lo agradecen.
    colors.sort(key=lambda c: c[3])
    idx = {c: i for i, c in enumerate(colors)}
    pim = Image.new('P', im.size)
    data = im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()
    pim.putdata([idx[p] for p in data])
    flat = []
    for c in colors:
        flat += c[:3]
    pim.putpalette(flat + [0] * (768 - len(flat)))
    pim.save(path, 'PNG', optimize=True, transparency=bytes(c[3] for c in colors))
    return im.size


def download_set(url_base, out_dir, anims, geometry_from=None):
    """Baja las animaciones de WANT desde url_base. `geometry_from` reutiliza
    las anclas del sprite normal (el shiny es el mismo dibujo recoloreado)."""
    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for want in WANT:
        src, geom = None, None
        for cand in [want] + FALLBACK[want]:
            src, geom = resolve(anims, cand)
            if geom:
                break
        if not geom:
            continue
        png = fetch(f'{url_base}/{src}-Anim.png')
        if not png:
            continue
        path = os.path.join(out_dir, want + '.png')
        w, h = save_optimized(png, path)
        cols, rows = w // geom['w'], h // geom['h']
        if rows < 1 or cols < 1:
            os.remove(path)
            continue

        ref = geometry_from.get(want) if geometry_from else None
        if ref and ref['w'] == geom['w'] and ref['h'] == geom['h']:
            ax, ay = ref['ax'], ref['ay']
        else:
            sh = fetch(f'{url_base}/{src}-Shadow.png')
            anchor = ground_anchor(sh, geom['w'], geom['h']) if sh else None
            ax, ay = (anchor if anchor else (geom['w'] / 2, geom['h'] * 0.78))
        meta[want] = {'w': geom['w'], 'h': geom['h'], 'n': min(geom['n'], cols), 'r': rows,
                      'd': geom['d'][:cols], 'ax': ax, 'ay': ay}
    return meta


# ---------------- animaciones extra (atlas) ----------------

def base_sources(anims):
    """Animaciones de SpriteCollab que ya dan las 7 de siempre (con sus respaldos)."""
    out = {}
    for want in WANT:
        for cand in [want] + FALLBACK[want]:
            src, geom = resolve(anims, cand)
            if geom:
                out[want] = src
                break
    return out


def pack(blocks):
    """
    Coloca bloques (nombre, ancho, alto) en estantes, con el ancho que deje menos
    hueco (la imagen se descomprime entera en memoria). Devuelve ({nombre: (x, y)}, ancho, alto).
    """
    order = sorted(blocks, key=lambda b: (-b[2], -b[1]))

    def shelves(width):
        pos, x, y, shelf, used = {}, 0, 0, 0, 0
        for name, w, h in order:
            if x + w > width:
                x, y, shelf = 0, y + shelf, 0
            pos[name] = (x, y)
            x += w
            used = max(used, x)
            shelf = max(shelf, h)
        return pos, used, y + shelf

    widths = {max(w for _, w, _ in blocks), sum(w for _, w, _ in blocks)}
    for i in range(len(order)):
        for j in range(i + 1, len(order) + 1):
            widths.add(sum(w for _, w, _ in order[i:j]))
    best = None
    for width in sorted(widths):
        if width < max(w for _, w, _ in blocks):
            continue
        pos, w, h = shelves(width)
        if best is None or w * h < best[1] * best[2]:
            best = (pos, w, h)
    return best


def build_ext(url_base, anims, out_dir, names, tag, used):
    """
    Atlas {tag}.png con las animaciones de `names` que sean propias (no copia de
    una de `used`, que se va llenando). Devuelve {nombre: [archivo, w, h, filas,
    ax, ay, x, y, *duraciones]} (archivo: índice en EXT_FILES).
    """
    got = []
    for name in names:
        src, geom = resolve(anims, name)
        if not geom or src in used:
            continue
        png = fetch_raw(f'{url_base}/{src}-Anim.png')
        if not png:
            continue
        im = Image.open(io.BytesIO(png)).convert('RGBA')
        cols, rows = im.width // geom['w'], im.height // geom['h']
        if cols < 1 or rows < 1:
            continue
        n = min(geom['n'], cols)
        sh = fetch_raw(f'{url_base}/{src}-Shadow.png')
        anchor = ground_anchor(sh, geom['w'], geom['h']) if sh else None
        ax, ay = anchor if anchor else (geom['w'] / 2, geom['h'] * 0.78)
        used.add(src)
        got.append((name, geom, rows, n, ax, ay, im.crop((0, 0, n * geom['w'], rows * geom['h']))))
    if not got:
        return {}
    pos, width, height = pack([(g[0], g[6].width, g[6].height) for g in got])
    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    meta = {}
    for name, geom, rows, n, ax, ay, im in got:
        x, y = pos[name]
        atlas.paste(im, (x, y))
        meta[name] = [EXT_FILES.index(tag), geom['w'], geom['h'], rows, ax, ay, x, y] + geom['d'][:n]
    os.makedirs(out_dir, exist_ok=True)
    save_image(atlas, os.path.join(out_dir, tag + '.png'))
    return meta


def build_ext_shiny(url_base, anims, out_dir, layout, tag, skip):
    """Atlas shiny con la misma colocación que el normal. Devuelve las que no tiene."""
    mine = {k: v for k, v in layout.items() if EXT_FILES[v[0]] == tag}
    if not mine:
        return []
    width = max(v[6] + (len(v) - 8) * v[1] for v in mine.values())
    height = max(v[7] + v[3] * v[2] for v in mine.values())
    atlas = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    missing, ok = [], 0
    for name, v in mine.items():
        src, geom = resolve(anims, name)
        im = None
        if geom and src not in skip and geom['w'] == v[1] and geom['h'] == v[2]:
            png = fetch_raw(f'{url_base}/{src}-Anim.png')
            if png:
                im = Image.open(io.BytesIO(png)).convert('RGBA')
                n = len(v) - 8
                if im.width < n * v[1] or im.height < v[3] * v[2]:
                    im = None
        if im is None:
            missing.append(name)
            continue
        atlas.paste(im.crop((0, 0, (len(v) - 8) * v[1], v[3] * v[2])), (v[6], v[7]))
        ok += 1
    if ok:
        os.makedirs(out_dir, exist_ok=True)
        save_image(atlas, os.path.join(out_dir, tag + '.png'))
    return missing


def do_ext(dex, meta):
    """
    Animaciones extra de un Pokémon (Ext.png, More.png y sus shiny). Pone en meta:
      x   {nombre: [archivo, w, h, filas, ax, ay, x, y, *duraciones]}
      xm  las que le faltan al shiny
      fo  1 si tiene una animación de caer propia (Faint que no es copia de Hurt)
    Devuelve False si no se pudo leer su AnimData (se reintenta otra vez).
    """
    tag = f'{dex:04d}'
    xml = fetch_raw(f'{BASE}/{tag}/AnimData.xml')
    if not xml:
        return False
    anims, _ = parse_animdata(xml.decode('utf-8', 'replace'))
    base = base_sources(anims)
    out_dir = os.path.join(OUT_ASSETS, str(dex))
    used = set(base.values())
    x = {}
    # (Sleep primero: así una copia suya, como EventSleep, no se guarda dos veces.)
    for f, names in sorted(EXT_GROUPS, key=lambda g: g[0] != 'Sleep'):
        x.update(build_ext(f'{BASE}/{tag}', anims, out_dir, names, f, used))
    meta['x'] = x
    meta.pop('xm', None)
    meta.pop('fo', None)
    if base.get('Faint') not in (None, base.get('Hurt'), base.get('Idle')):
        meta['fo'] = 1
    if meta.get('sh') and x:
        sxml = fetch_raw(f'{BASE}/{tag}/0000/0001/AnimData.xml')
        sanims = parse_animdata(sxml.decode('utf-8', 'replace'))[0] if sxml else anims
        skip = set(base_sources(sanims).values())
        sdir = os.path.join(out_dir, 's')
        missing = []
        for f in EXT_FILES:
            missing += build_ext_shiny(f'{BASE}/{tag}/0000/0001', sanims, sdir, x, f, skip)
        if missing:
            meta['xm'] = missing
    return True


def ext_job(job):
    dex, meta = job
    cache_file = os.path.join(CACHE_EXT, f'{dex}.json')
    out_dir = os.path.join(OUT_ASSETS, str(dex))
    if os.path.exists(cache_file):
        part = json.load(open(cache_file, encoding='utf-8'))
        files = {EXT_FILES[v[0]] for v in part.get('x', {}).values()}
        if all(os.path.exists(os.path.join(out_dir, f + '.png')) for f in files):
            for k in ('x', 'xm', 'fo'):
                meta.pop(k, None)
            meta.update(part)
            return dex, True
    if not do_ext(dex, meta):
        return dex, False
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump({k: meta[k] for k in ('x', 'xm', 'fo') if k in meta}, f, separators=(',', ':'))
    return dex, True


def do_dex(job):
    dex, want_shiny = job
    cache_file = os.path.join(CACHE, f'{dex}.json')
    out_dir = os.path.join(OUT_ASSETS, str(dex))
    if os.path.exists(cache_file):
        meta = json.load(open(cache_file, encoding='utf-8'))
        if all(os.path.exists(os.path.join(out_dir, a + '.png')) for a in meta['a']):
            return dex, meta

    tag = f'{dex:04d}'
    xml = fetch(f'{BASE}/{tag}/AnimData.xml')
    if not xml:
        return dex, None
    anims, shadow = parse_animdata(xml.decode('utf-8', 'replace'))
    normal = download_set(f'{BASE}/{tag}', out_dir, anims)
    if not REQUIRED & set(normal):
        return dex, None
    meta = {'s': shadow, 'a': normal}

    if want_shiny:
        sxml = fetch(f'{BASE}/{tag}/0000/0001/AnimData.xml')
        sanims = parse_animdata(sxml.decode('utf-8', 'replace'))[0] if sxml else anims
        shiny = download_set(f'{BASE}/{tag}/0000/0001', os.path.join(out_dir, 's'), sanims, normal)
        if REQUIRED <= set(shiny) or ('Idle' in shiny and 'Walk' in shiny):
            meta['sh'] = 1
            # Sólo se guarda la geometría shiny si difiere de la normal.
            diff = {k: v for k, v in shiny.items() if normal.get(k) != v}
            if diff:
                meta['sa'] = diff
            missing_s = [k for k in normal if k not in shiny]
            if missing_s:
                meta['sm'] = missing_s

    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(meta, f, separators=(',', ':'))
    return dex, meta


def read_meta():
    """Lo que ya hay en js/data/sprites-meta.js: {dex: meta}."""
    metas = {}
    if os.path.exists(OUT_META):
        for line in io.open(OUT_META, encoding='utf-8'):
            mt = re.match(r'^  (\d+): (\{.*\}),$', line.rstrip('\n'))
            if mt:
                metas[int(mt.group(1))] = json.loads(mt.group(2))
    return metas


def add_ext(metas):
    """Animaciones extra (Ext.png / More.png) de todos los de `metas`."""
    os.makedirs(CACHE_EXT, exist_ok=True)
    jobs = sorted(metas.items())
    failed, done = [], 0
    with ThreadPoolExecutor(max_workers=16) as ex:
        for dex, ok in ex.map(ext_job, jobs):
            done += 1
            if not ok:
                failed.append(dex)
            if done % 50 == 0 or done == len(jobs):
                print(f'  extra {done}/{len(jobs)}', flush=True)
    if failed:
        print(f'Sin animaciones extra (relanza para reintentar) ({len(failed)}): {failed}')


def main_ext():
    """--ext: sólo las animaciones extra de los que ya están (no toca las 7 de siempre)."""
    metas = read_meta()
    nums = [int(a) for a in sys.argv[1:] if a.isdigit()]
    lo, hi = (nums + [1, 1025])[:2] if len(nums) != 1 else (nums[0], nums[0])
    pick = {d: m for d, m in metas.items() if lo <= d <= hi}
    print(f'{len(metas)} Pokemon en sprites-meta.js; extra de {len(pick)} ({lo}-{hi})')
    add_ext(pick)
    write_meta(metas)


def main():
    if '--ext' in sys.argv:
        return main_ext()
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else 1025
    os.makedirs(OUT_ASSETS, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)

    print('Leyendo tracker.json de SpriteCollab...')
    tracker = json.loads(fetch(RAW + '/tracker.json').decode('utf-8'))
    jobs = []
    for dex in range(lo, hi + 1):
        e = tracker.get(f'{dex:04d}')
        if not e or not REQUIRED <= set(e.get('sprite_files', {})):
            continue
        s = e.get('subgroups', {}).get('0000', {}).get('subgroups', {}).get('0001', {})
        jobs.append((dex, {'Idle', 'Walk'} <= set(s.get('sprite_files', {}))))
    print(f'{len(jobs)} Pokemon con sprites en {lo}-{hi} ({sum(1 for _, s in jobs if s)} con shiny)')

    metas, missing, done = {}, [], 0
    with ThreadPoolExecutor(max_workers=16) as ex:
        for dex, meta in ex.map(do_dex, jobs):
            done += 1
            if meta:
                metas[dex] = meta
            else:
                missing.append(dex)
            if done % 50 == 0 or done == len(jobs):
                print(f'  {done}/{len(jobs)}', flush=True)

    # Compatibilidad con cachés antiguas: anota qué le falta al shiny.
    for dex, m in metas.items():
        if m.get('sh') and 'sm' not in m:
            sdir = os.path.join(OUT_ASSETS, str(dex), 's')
            miss = [k for k in m['a'] if not os.path.exists(os.path.join(sdir, k + '.png'))]
            if miss:
                m['sm'] = miss

    # Animaciones extra de los de este rango.
    add_ext(metas)

    # Funde con lo que ya hubiera en caché fuera del rango pedido (con sus extra, si las tiene).
    for fn in os.listdir(CACHE):
        if not fn.split('.')[0].isdigit():
            continue
        d = int(fn.split('.')[0])
        if d not in metas and os.path.isdir(os.path.join(OUT_ASSETS, str(d))):
            metas[d] = json.load(open(os.path.join(CACHE, fn), encoding='utf-8'))
            ext = os.path.join(CACHE_EXT, fn)
            if os.path.exists(ext):
                metas[d].update(json.load(open(ext, encoding='utf-8')))
    # Y con lo que ya está en sprites-meta.js (26-10-2026: sin caché, bajar un rango
    # dejaba la meta sólo con ese rango y todos los demás se quedaban sin sprite).
    for d, m in read_meta().items():
        if d not in metas and os.path.isdir(os.path.join(OUT_ASSETS, str(d))):
            metas[d] = m

    write_meta(metas)
    if missing:
        print(f'Fallaron ({len(missing)}): {missing}')


def write_meta(metas):
    lines = [
        '/* ============ sprites-meta.js — GENERADO, no editar a mano ============',
        ' * Lo produce tools/fetch_sprites.py a partir de los AnimData.xml de',
        ' * SpriteCollab. Va en un .js y no en un .json porque fetch() está',
        ' * bloqueado en file:// y el juego se abre con doble clic.',
        ' *',
        ' * Por Pokémon:    s ShadowSize · a animaciones · sh=1 si hay shiny',
        ' *                 sa geometría shiny que difiera de la normal (raro)',
        ' *                 sm animaciones que le faltan al shiny',
        ' * Por animación:  w,h fotograma · n fotogramas · r filas',
        ' *                 d duración de cada fotograma (1/60 s)',
        ' *                 ax,ay ancla al suelo dentro del fotograma',
        ' * Filas: 0 Down · 1 DownRight · 2 Right · 3 UpRight',
        ' *        4 Up   · 5 UpLeft    · 6 Left  · 7 DownLeft',
        ' * Extra (atlas Ext.png / More.png, ver tools/fetch_sprites.py):',
        ' *                 x  {anim: [archivo 0 Ext · 1 More, w, h, filas, ax, ay, x, y, ...duraciones]}',
        ' *                 xm extra que le faltan al shiny · fo=1 si tiene animación de caer propia',
        ' */',
        'G.SPRITE_META = {',
    ]
    for dex in sorted(metas):
        m = dict(metas[dex])
        if not m.get('x'):
            m.pop('x', None)
        lines.append(f'  {dex}: {json.dumps(m, separators=(",", ":"))},')
    lines += ['};', '', '/* Nombres de los atlas de animaciones extra (el índice de x). */',
              f'G.SPRITE_EXT = {json.dumps(EXT_FILES)};', '']
    with io.open(OUT_META, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))

    size = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(OUT_ASSETS) for fn in fns)
    print(f'\n{len(metas)} Pokemon ({sum(1 for m in metas.values() if m.get("sh"))} con shiny), {size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
