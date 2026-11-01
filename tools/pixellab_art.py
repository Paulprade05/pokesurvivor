"""Prepara para el juego el arte generado con PixelLab (tools/pixellab/*.png -> assets/objects-px/).

Los originales y sus pedidos (tools/pixellab/pedidos.json, para repetirlos con tools/pixellab_gen.cjs) se guardan tal
cual salieron; aquí sólo se recortan los bordes vacíos y se limpia la textura del risco. Los colores de cada bioma los
pone el juego (js/world/tileset.js), así que basta una versión de cada cosa.

  py tools/pixellab_art.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'pixellab')
OUT = os.path.join(ROOT, 'assets', 'objects-px')


def trim(im):
    """Quita lo transparente de alrededor (y los píxeles casi transparentes que deja el quitafondos)."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] < 128:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = px[x, y][:3] + (255,)
    return im.crop(im.getbbox())


def main():
    os.makedirs(OUT, exist_ok=True)
    for k in ('chest', 'bigchest', 'trap0', 'trap1', 'trap2'):
        im = trim(Image.open(os.path.join(SRC, k + '.png')).convert('RGBA'))
        im.save(os.path.join(OUT, k + '.png'), optimize=True)
        print(k, im.size)
    # El risco: 16 filas del centro de la textura de roca (cliff_v2; la primera, cliff.png, parecía un muro de
    #  ladrillo): la cara de una pared.
    im = Image.open(os.path.join(SRC, 'cliff_v2.png')).convert('RGBA')
    im = im.crop((0, 8, im.width, 24))
    im.save(os.path.join(OUT, 'cliff.png'), optimize=True)
    print('cliff', im.size)


if __name__ == '__main__':
    main()
