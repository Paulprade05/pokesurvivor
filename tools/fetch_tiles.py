#!/usr/bin/env python3
"""
Tilesets de Mundo Misterioso: Exploradores del Cielo para el mundo (2.0, bloque 6, opción B del dueño).

Descarga de PMDCollab/RawAsset (TileDtef/<mazmorra>/) las hojas DTEF de 24 px de cada bioma y las deja listas
para el juego, que nunca lee píxeles (getImageData falla con file://):

  assets/tiles-pmd/<clave>/sheet.png    tileset_0: 18×8 casillas (pared | secundario | suelo, 6×8 cada una)
  assets/tiles-pmd/<clave>/var1.png     tileset_1 y tileset_2 (variaciones), si las hay
  assets/tiles-pmd/<clave>/liq.png      el secundario (agua, lava...) animado: K fotogramas de 6×8 casillas en fila
  js/data/tilesets.js                   G.TILESETS: por bioma, carpeta, variaciones (qué casillas tienen),
                                        fotogramas del líquido y su duración, y créditos

La animación del agua en DTEF es un ciclo de paleta; RawAsset ya la trae en fotogramas RGBA (tileset_0_frame0_N.D.png,
D = 1/60 s que dura cada uno): se cogen como mucho MAX_FRAMES, repartidos, y sólo la sección del secundario.

Uso:  py tools/fetch_tiles.py            (descarga lo que falte)
      py tools/fetch_tiles.py --force    (todo otra vez)
Sin licencia: son extracciones del juego (ver docs/PROMPT-2.0.md §11.2 y CREDITS.md). Para retirarlos basta con
borrar assets/tiles-pmd/ y js/data/tilesets.js (el juego vuelve al pintor de tiles.js).
"""
import io, json, os, re, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'tiles-pmd')
RAW = 'https://raw.githubusercontent.com/PMDCollab/RawAsset/master/TileDtef/'
API = 'https://api.github.com/repos/PMDCollab/RawAsset/contents/TileDtef/'
T = 24
MAX_FRAMES = 8

# Bioma (índice de G.Tiles.BIOMES) → mazmorra. 0-2: los del mapa; 3-20: las arenas de la grieta por tipo; 21: Juicio.
# LIQ: el secundario (y su animación) de otra mazmorra, cuando el suyo no es el líquido del bioma (comprobado a ojo).
LIQ = {'poison': 'PoisonMaze', 'judgment': 'MtBlaze'}
BIOMES = [
    ('forest', 'HowlingForest1'), ('crystal', 'CrystalCave1'), ('volcano', 'MagmaCavern2'),
    ('normal', 'LushPrairie'), ('fire', 'MagmaCavern3'), ('water', 'BeachCave'), ('grass', 'MysteryJungle1'),
    ('electric', 'LightningField'), ('ice', 'IceAegisCave'), ('fighting', 'MtHorn'), ('poison', 'MurkyCave'),
    ('ground', 'NorthernDesert1'), ('flying', 'HiddenHighland'), ('psychic', 'MystifyingForest'), ('bug', 'ForestPath'),
    ('rock', 'DeepBoulderQuarry'), ('ghost', 'DarkHill1'), ('dragon', 'DarkCrater'), ('dark', 'DarknightRelic'),
    ('steel', 'MtSteel1'), ('fairy', 'MoonlitCourtyard'), ('judgment', 'HiddenLand'),
]


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'pokesurvivor-fetch-tiles'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def listing(d, dun):
    """Archivos de una mazmorra (guardados en tools/cache/tiles-lists: la API de GitHub limita a 60 por hora)."""
    os.makedirs(os.path.join(ROOT, 'tools', 'cache', 'tiles-lists'), exist_ok=True)
    p = os.path.join(ROOT, 'tools', 'cache', 'tiles-lists', '%s.json' % dun)
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    try:
        names = [x['name'] for x in json.loads(get(API + dun))]
    except Exception:
        # (Sin la API, que limita a 60 consultas por hora: un clon de sólo árboles, sin archivos, en tools/cache.)
        import subprocess
        repo = os.path.join(ROOT, 'tools', 'cache', 'RawAsset')
        if not os.path.exists(repo):
            subprocess.run(['git', 'clone', '-q', '--filter=blob:none', '--no-checkout', '--depth', '1',
                            'https://github.com/PMDCollab/RawAsset', repo], check=True)
        out = subprocess.run(['git', '-C', repo, 'ls-tree', '--name-only', 'HEAD', 'TileDtef/%s/' % dun],
                             check=True, capture_output=True, text=True).stdout
        names = [os.path.basename(x) for x in out.split()]
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(names, f)
    return names


def png(data):
    return Image.open(io.BytesIO(data)).convert('RGBA')


def cells(im):
    """Qué casillas tienen algo (para las variaciones: una vacía usa la anterior). 3 secciones × 48 bits."""
    out = []
    for sec in range(3):
        bits = 0
        for k in range(48):
            x0, y0 = (sec * 6 + k % 6) * T, (k // 6) * T
            box = im.crop((x0, y0, x0 + T, y0 + T))
            if box.getextrema()[3][1] > 0:
                bits |= 1 << k
        out.append(bits)
    return out


def main():
    force = '--force' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    meta = []
    for bi, (key, dun) in enumerate(BIOMES):
        d = os.path.join(OUT, key)
        os.makedirs(d, exist_ok=True)
        names = listing(d, dun)
        ldun = LIQ.get(key, dun)
        lnames = names if ldun == dun else listing(d, ldun)
        sheet = os.path.join(d, 'sheet.png')
        if force or not os.path.exists(sheet):
            im = png(get(RAW + dun + '/tileset_0.png'))
            if ldun != dun:
                im.paste(png(get(RAW + ldun + '/tileset_0.png')).crop((6 * T, 0, 12 * T, 8 * T)), (6 * T, 0))
            im.save(sheet, optimize=True)
        base = Image.open(sheet).convert('RGBA')
        assert base.size == (18 * T, 8 * T), (dun, base.size)
        vars_ = []
        for v in (1, 2):
            if 'tileset_%d.png' % v not in names:
                continue
            p = os.path.join(d, 'var%d.png' % v)
            if force or not os.path.exists(p):
                im = png(get(RAW + dun + '/tileset_%d.png' % v))
                if im.size != base.size:
                    continue
                im.save(p, optimize=True)
            cs = cells(Image.open(p).convert('RGBA'))
            if ldun != dun:
                cs[1] = 0                     # (su secundario es de otra mazmorra: sin variaciones)
            vars_.append({'file': 'var%d.png' % v, 'cells': cs})
        frames = sorted(((int(m.group(1)), int(m.group(2)), n) for n in lnames
                         for m in [re.match(r'tileset_0_frame0_(\d+)\.(\d+)\.png$', n)] if m))
        nf, dur = 0, 0
        liq = os.path.join(d, 'liq.png')
        if frames:
            step = max(1, len(frames) // MAX_FRAMES)
            pick = frames[::step][:MAX_FRAMES]
            dur = round(sum(f[1] for f in frames) / len(pick) / 60, 3)      # s por fotograma, con los que se saltan
            nf = len(pick)
            if force or not os.path.exists(liq):
                strip = Image.new('RGBA', (6 * T * nf, 8 * T))
                for i, (_, _, n) in enumerate(pick):
                    strip.paste(png(get(RAW + ldun + '/' + n)).crop((6 * T, 0, 12 * T, 8 * T)), (i * 6 * T, 0))
                strip.save(liq, optimize=True)
        elif os.path.exists(liq):
            os.remove(liq)
        meta.append({'bi': bi, 'key': key, 'src': dun if ldun == dun else dun + '+' + ldun, 'vars': vars_, 'frames': nf, 'dur': dur})
        print('%-9s %-18s variaciones %d, fotogramas del líquido %d (%.2f s)' % (key, dun, len(vars_), nf, dur))
    js = ('/* GENERADO por tools/fetch_tiles.py: no editar a mano.\n'
          ' * Tilesets DTEF de 24 px de PMD: Exploradores del Cielo (PMDCollab/RawAsset, TileDtef), uno por bioma.\n'
          ' * Sin licencia (extracciones del juego, ver CREDITS.md); el juego vuelve al pintor de tiles.js sin ellos. */\n'
          'G.TILESETS = ' + json.dumps(meta, separators=(',', ':')) + ';\n')
    with open(os.path.join(ROOT, 'js', 'data', 'tilesets.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
    total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs if f.endswith('.png'))
    print('ok: %d biomas, %.0f KB en assets/tiles-pmd' % (len(meta), total / 1024))


if __name__ == '__main__':
    main()
