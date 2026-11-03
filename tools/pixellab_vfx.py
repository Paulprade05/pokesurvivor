"""Prepara para el juego los dibujos de ataques hechos con PixelLab (tools/pixellab/vfx/*.png -> assets/vfx/).

Revisión de ataques (2026-11-02): algunos ataques llevan su propio dibujo para no confundirse con los de su tipo
(js/entities/vfx.js, PX_VFX). Los originales y sus pedidos (tools/pixellab/vfx/pedidos.json; se repiten con
tools/pixellab_gen.cjs) se guardan tal cual salieron; aquí se recortan los bordes vacíos, se limpian los píxeles
casi transparentes y se pone el contorno oscuro de 1 px de los sprites del juego donde PixelLab no lo puso.

  py tools/pixellab_vfx.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'pixellab', 'vfx')
OUT = os.path.join(ROOT, 'assets', 'vfx')
MAX = 14                     # lado máximo (px de arte, sin el contorno): las formas de código miden 7-15
# Los que el juego ya dibuja grandes (×1,5 o más): algo menos, para que no tapen al Pokémon.
MAX_BY = {'confusion': 12, 'hail': 12, 'rock-throw': 13, 'thunder-shock': 13}


def clean(im):
    """Alfa a 0 o 255 y recorte de lo vacío."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 128 else (0, 0, 0, 0)
    return im.crop(im.getbbox())


def outline(im):
    """Contorno de 1 px alrededor de lo opaco, con el color del vecino muy oscurecido (como los de PMD)."""
    w, h = im.width + 2, im.height + 2
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im, (1, 1))
    src = out.copy().load()
    px = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                continue
            near = [src[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                    if 0 <= x + dx < w and 0 <= y + dy < h and src[x + dx, y + dy][3]]
            if near:
                r, g, b, _ = min(near, key=lambda c: c[0] + c[1] + c[2])
                px[x, y] = (r // 4, g // 4, b // 4, 255)
    return out


def dark_edge(im):
    """¿Ya tiene contorno oscuro? (la mayoría de los píxeles del borde de la silueta son oscuros)"""
    px = im.load()
    edge = dark = 0
    for y in range(im.height):
        for x in range(im.width):
            if not px[x, y][3]:
                continue
            if any(not (0 <= x + dx < im.width and 0 <= y + dy < im.height) or not px[x + dx, y + dy][3]
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                edge += 1
                dark += sum(px[x, y][:3]) < 150
    return edge and dark / edge > 0.6


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in sorted(os.listdir(SRC)):
        if not f.endswith('.png'):
            continue
        im = clean(Image.open(os.path.join(SRC, f)).convert('RGBA'))
        top = MAX_BY.get(f[:-4], MAX)
        if max(im.size) > top:
            k = top / max(im.size)
            im = clean(im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST))
        if not dark_edge(im):
            im = outline(im)
        im.save(os.path.join(OUT, f), optimize=True)
        print(f, im.size)


if __name__ == '__main__':
    main()
