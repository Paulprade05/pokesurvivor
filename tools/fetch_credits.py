#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera CREDITS.md con los artistas de cada sprite descargado.

    python tools/fetch_credits.py

Cada carpeta de SpriteCollab tiene un credits.txt (sin cabecera) con lineas
    fecha <TAB> autor <TAB> ...
donde el autor es un nombre o un ID de Discord ("<@!123...>"). Los IDs se
traducen con el credit_names.txt de la raiz del repo.
"""
import io
import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor

RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets', 'pokemon')
OUT = os.path.join(ROOT, 'CREDITS.md')


def fetch(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'pokesurvivor/1.0'})
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.read().decode('utf-8', 'replace')
    except Exception:
        return ''


def main():
    # ID de Discord / alias -> (nombre visible, contacto)
    names = {}
    for line in fetch(f'{RAW}/credit_names.txt').splitlines()[1:]:
        parts = line.split('\t')
        if len(parts) >= 2:
            display = parts[0].strip()
            contact = parts[2].strip() if len(parts) > 2 else ''
            names[parts[1].strip()] = (display, contact)
            names[display] = (display, contact)

    dexes = sorted(int(d) for d in os.listdir(ASSETS) if d.isdigit())

    # Las megas van por su número de PokeAPI: su carpeta es la de su especie y forma (tools/fetch_megas.cjs).
    forms = {}
    jobs = os.path.join(ROOT, 'tools', 'cache', 'megas.json')
    if os.path.exists(jobs):
        with io.open(jobs, encoding='utf-8') as f:
            jl = json.load(f)
        forms = {j['id']: f"{j['dex']:04d}/{j['form']}" for j in jl if j.get('form')}
        # Las de pokeemerald-expansion (j['rhh']) no son de SpriteCollab: sus créditos van a mano en CREDITS.md.
        other = {j['id'] for j in jl if j.get('rhh')}
        dexes = [d for d in dexes if d not in other]

    def one(dex):
        # Créditos del sprite normal y del shiny (que puede ser de otro artista).
        if dex in forms:
            txt = fetch(f'{RAW}/sprite/{forms[dex]}/credits.txt')
            txt += '\n' + fetch(f'{RAW}/sprite/{forms[dex]}/0001/credits.txt')
        else:
            txt = fetch(f'{RAW}/sprite/{dex:04d}/credits.txt')
            if os.path.isdir(os.path.join(ASSETS, str(dex), 's')):
                txt += '\n' + fetch(f'{RAW}/sprite/{dex:04d}/0000/0001/credits.txt')
        authors = []
        for line in txt.splitlines():
            parts = line.split('\t')
            a = parts[1].strip() if len(parts) > 1 else ''
            if a and names.get(a, (a, ''))[0]:
                authors.append(a)
        return dex, authors

    per_artist = {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        for dex, authors in ex.map(one, dexes):
            for a in set(authors):
                display, contact = names.get(a, (a, ''))
                per_artist.setdefault((display, contact), set()).add(dex)

    # Sólo la tabla de sprites: el resto de CREDITS.md (tilesets, fuentes, marca...) está escrito a mano.
    rows = ''.join(f'| {display} | {contact} | {", ".join(str(d) for d in sorted(dx))} |\n'
                   for (display, contact), dx in sorted(per_artist.items(), key=lambda kv: kv[0][0].lower()))
    head = '| Artista | Contacto | Sprites (nº de Pokédex) |\n|---|---|---|\n'
    with io.open(OUT, encoding='utf-8') as f:
        text = f.read().replace('\r\n', '\n')
    start = text.index(head) + len(head)
    end = text.index('\n\n', start) + 1
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text[:start] + rows + text[end:])

    print(f'{len(per_artist)} artistas para {len(dexes)} Pokemon -> CREDITS.md')


if __name__ == '__main__':
    main()
