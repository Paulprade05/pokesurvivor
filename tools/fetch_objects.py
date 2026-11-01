#!/usr/bin/env python3
"""
Objetos de mazmorra de Mundo Misterioso para el mundo (2.0, bloque 6b; la misma opción B del dueño que los tilesets).

Descarga de PMDCollab/RawAsset (Object/) los cofres y las trampas, recortados a lo que tienen dibujado, en una carpeta
aparte; el juego nunca lee píxeles (getImageData falla con file://):

  assets/objects-pmd/chest.png       Chest (32 px: no cabe en una casilla; sólo es el origen del dorado)
  assets/objects-pmd/bigchest.png    el mismo cofre en dorado: el cofre con candado del juego, recoloreado aquí
  assets/objects-pmd/trap0.png       Trap_Poison     (trampa de veneno)
  assets/objects-pmd/trap1.png       Trap_Sticky     (trampa pegajosa)
  assets/objects-pmd/trap2.png       Trap_Explosion  (trampa explosiva)
  js/data/objects-pmd.js             G.OBJECTS_PMD: por objeto, archivo y tamaño (px de arte, 24 por casilla)

Los árboles, las rocas, la hierba alta, los cofres pequeños, las torres y los manantiales no salen de aquí: los árboles son la pieza de
pared suelta de cada tileset (assets/tiles-pmd) y lo demás se pinta en código con la paleta del tileset
(tools/fetch_tiles.py la deja en js/data/tilesets.js).

Uso:  py -I tools/fetch_objects.py            (descarga lo que falte)
      py -I tools/fetch_objects.py --force    (todo otra vez)
Sin licencia: extracciones del juego (ver CREDITS.md y docs/PROMPT-2.0.md §11.2). Para retirarlos basta con borrar
assets/objects-pmd/ (y, si se quiere, js/data/objects-pmd.js con su línea de dev.html): el juego vuelve a su dibujo.
"""
import colorsys, io, json, os, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'objects-pmd')
RAW = 'https://raw.githubusercontent.com/PMDCollab/RawAsset/master/Object/'

# (tipo del juego, archivo, nombre en RawAsset)
OBJECTS = [
    ('chest', 'chest.png', 'Chest.None.png'),
    ('trap0', 'trap0.png', 'Trap_Poison.None.png'),
    ('trap1', 'trap1.png', 'Trap_Sticky.None.png'),
    ('trap2', 'trap2.png', 'Trap_Explosion.None.png'),
]


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'pokesurvivor-fetch-objects'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def crop(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def gold(im):
    """El cofre verde, en dorado (sólo los píxeles verdes; el metal y el contorno, igual)."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.18 < h < 0.5 and s > 0.25:
                r2, g2, b2 = colorsys.hsv_to_rgb(0.12, min(1, s * 1.05), min(1, v * 1.08))
                px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return out


def main():
    force = '--force' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for key, file, src in OBJECTS:
        p = os.path.join(OUT, file)
        if force or not os.path.exists(p):
            im = Image.open(io.BytesIO(get(RAW + src))).convert('RGBA')
            crop(im).save(p, optimize=True)
        im = Image.open(p).convert('RGBA')
        meta[key] = {'file': file, 'w': im.width, 'h': im.height, 'src': src}
        if key == 'chest':
            g = os.path.join(OUT, 'bigchest.png')
            if force or not os.path.exists(g):
                gold(im).save(g, optimize=True)
            meta['bigchest'] = {'file': 'bigchest.png', 'w': im.width, 'h': im.height, 'src': src + ' (dorado)'}
        print('%-9s %-24s %dx%d' % (key, src, im.width, im.height))
    js = ('/* GENERADO por tools/fetch_objects.py: no editar a mano.\n'
          ' * Cofres y trampas de PMD: Exploradores del Cielo (PMDCollab/RawAsset, Object), en assets/objects-pmd/.\n'
          ' * Sin licencia (extracciones del juego, ver CREDITS.md); sin ellos, el juego los pinta en código. */\n'
          'G.OBJECTS_PMD = ' + json.dumps(meta, separators=(',', ':')) + ';\n')
    with open(os.path.join(ROOT, 'js', 'data', 'objects-pmd.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.png'))
    print('ok: %d objetos, %.1f KB en assets/objects-pmd' % (len(meta), total / 1024))


if __name__ == '__main__':
    main()
