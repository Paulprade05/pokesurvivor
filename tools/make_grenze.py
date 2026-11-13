# -*- coding: utf-8 -*-
"""Grenze en versiones fijas (600, 700 y 800) a partir de la variable.

WebKit (Safari) no siempre aplica el grosor de una fuente variable cargada como
TTF: los títulos salían finos. Con tres archivos fijos se ve igual en todos.
Uso: python tools/make_grenze.py <Grenze[wght].ttf, de github.com/google/fonts ofl/grenze>  ->  assets/fonts/Grenze-600.ttf, -700, -800
Necesita fontTools (pip install fonttools). Grenze: SIL OFL 1.1 (assets/fonts/OFL-Grenze.txt).
"""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = sys.argv[1]
for w in (600, 700, 800):
    f = instancer.instantiateVariableFont(TTFont(SRC), {'wght': w})
    out = os.path.join(ROOT, 'assets', 'fonts', 'Grenze-%d.ttf' % w)
    f.save(out)
    print('ok:', os.path.basename(out), os.path.getsize(out) // 1024, 'KB')
