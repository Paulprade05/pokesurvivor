"""Los cofres en bloque, como las paredes elevadas (assets/objects-px/chest.png y bigchest.png).

Mismo dibujo que una pared de js/world/tileset.js: arriba la tapa vista desde arriba (más clara, con luz arriba y a la
izquierda), delante la cara del cofre (más oscura, con el labio de luz en el borde), contorno oscuro, sombra a la
derecha y, en el suelo, la sombra al sur y al este. Pixel art a 24 px por casilla (el juego lo pinta ×2).

  py tools/chest3d.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'objects-px')


def hexc(h, a=255):
    return (int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16), a)


def chest(W, TOP, FRONT, wood, metal, big):
    """W: ancho; TOP: filas de la tapa vista desde arriba; FRONT: filas de la cara. wood/metal: de oscuro a claro."""
    SH = 3                                          # sombra en el suelo (al sur; 1 px al este)
    H = TOP + FRONT
    im = Image.new('RGBA', (W + 1, H + SH), (0, 0, 0, 0))
    px = im.load()
    OUT_C = hexc('#1c1210')
    wd = [hexc(c) for c in wood]                    # 0 muy oscuro .. 4 luz
    mt = [hexc(c) for c in metal]                   # 0 oscuro .. 3 brillo

    def put(x, y, c):
        if 0 <= x < im.width and 0 <= y < im.height:
            px[x, y] = c

    # Sombra en el suelo (como la de las paredes: más fuerte pegada al cofre).
    for y in range(SH):
        a = (110, 70, 35)[y]
        for x in range(1, W + 1):
            put(x, H + y, (0, 0, 0, a))
    for y in range(2, H):
        put(W, y, (0, 0, 0, 55))

    band = [3, W - 4] if not big else [4, W // 2, W - 5]   # flejes de metal (verticales)
    # Tapa (vista desde arriba): tablas a lo largo, luz arriba e izquierda.
    for y in range(TOP):
        for x in range(W):
            t = 4 if y < 1 else 3
            if (y - 1) % 3 == 0 and 0 < y < TOP - 1:
                t = 2                               # junta entre tablas
            if x < 2:
                t = min(4, t + 1)
            if x >= W - 2:
                t = max(1, t - 1)
            c = wd[t]
            if any(abs(x - b) <= (1 if big else 0) for b in band):
                c = mt[2] if y < 2 else mt[1]
                if any(x == b - (1 if big else 0) for b in band):
                    c = mt[3] if y < TOP - 1 else mt[2]
            put(x, y, c)
    # El labio: el borde de la tapa que da al frente, con luz (como el de las paredes).
    for x in range(W):
        on_band = any(abs(x - b) <= (1 if big else 0) for b in band)
        put(x, TOP - 1, mt[3] if on_band else wd[4])
    # Cara (más oscura): la parte de la tapa, la junta y el cuerpo.
    lid = 3 if not big else 4
    for y in range(TOP, H):
        r = y - TOP
        for x in range(W):
            t = 2 if r < lid else 1
            if r == lid:
                t = 0                               # la junta tapa/cuerpo
            if r == FRONT - 1:
                t = 0
            if x < 1:
                t = min(4, t + 1)
            if x >= W - 2:
                t = max(0, t - 1)
            c = wd[t]
            if any(abs(x - b) <= (1 if big else 0) for b in band) and r != lid:
                c = mt[1] if x < W - 2 else mt[0]
                if r == 0:
                    c = mt[2]
            put(x, y, c)
    # Cerradura (o candado en el grande) en el centro de la cara, sobre la junta.
    cx = W // 2
    ly = TOP + lid - 2
    lw, lh = (2, 4) if not big else (3, 6)
    for y in range(ly, ly + lh):
        for x in range(cx - lw, cx + lw):
            put(x, y, mt[2])
    for x in range(cx - lw, cx + lw):
        put(x, ly, mt[3])
        put(x, ly + lh - 1, mt[0])
    for y in range(ly, ly + lh):
        put(cx - lw, y, mt[3] if y < ly + lh - 1 else mt[1])
        put(cx + lw - 1, y, mt[0])
    put(cx - 1, ly + 2, OUT_C); put(cx, ly + 2, OUT_C)
    put(cx - 1 if not big else cx, ly + 3, OUT_C)
    if big:
        put(cx - 1, ly + 3, OUT_C); put(cx - 1, ly + 4, OUT_C)
        for x in range(cx - 2, cx + 2):            # el arco del candado, encima
            put(x, ly - 2, mt[1])
        put(cx - 2, ly - 1, mt[1]); put(cx + 1, ly - 1, mt[0])
    # Contorno.
    sil = [[px[x, y][3] == 255 and y < H for y in range(im.height)] for x in range(im.width)]
    for x in range(W):
        put(x, 0, OUT_C)
        put(x, H - 1, OUT_C)
    for y in range(H):
        put(0, y, OUT_C)
        put(W - 1, y, OUT_C)
    put(0, 0, (0, 0, 0, 0)); put(W - 1, 0, (0, 0, 0, 0))
    del sil
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    WOOD = ['#2e1a12', '#5c3520', '#83502c', '#a86c3c', '#cf9458']
    GOLD = ['#7a4e12', '#c48a22', '#ecc04a', '#fff0a8']
    RED = ['#2a0f1c', '#5e1a36', '#86284a', '#ab3e62', '#d0668a']
    for name, im in (('chest', chest(20, 8, 10, WOOD, GOLD, False)),
                     ('bigchest', chest(28, 11, 13, RED, GOLD, True))):
        im.save(os.path.join(OUT, name + '.png'), optimize=True)
        im.resize((im.width * 8, im.height * 8), Image.NEAREST).save(os.path.join(os.environ.get('TMP', '.'), name + '-x8.png'))
        print(name, im.size)


if __name__ == '__main__':
    main()
