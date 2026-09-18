#!/usr/bin/env python3
"""
render.py — turn shots.html into assets/img/app/*.webp

    python3 assets/mockups/render.py               # render every shot
    python3 assets/mockups/render.py project tasks # render some
    python3 assets/mockups/render.py --preview     # also write the slot previews

Why the widths in SHOTS are what they are
-----------------------------------------
Every slot on the marketing site scales the screenshot to a different width, so
the same UI looks bigger on one page than another unless you correct for it.
The correction: pick the apparent size the app's 15px row title should have on
screen (~11px), then render each shot at

    logical width = display width x 15 / 11

so the page's own downscale lands the type in the same place every time.
`display` is the measured rendered width of that image's slot at a 1440px
viewport; `logical` is the stage width in shots.html. Keep the printed
`apparent` column inside 10-12px and the shots read as one set.

Natural pixel size is logical x SCALE, which covers a 2x display in every slot
without shipping pixels nobody can see.
"""
import asyncio, io, os, sys, threading, functools, http.server, socketserver
from PIL import Image
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))  # serve the site root so ../fonts resolves
OUT  = os.path.normpath(os.path.join(HERE, '..', 'img', 'app'))
CHROME = os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium')
SCALE   = 1.6    # natural px per logical px
DPR     = 2      # render at 2x, then resample down to SCALE — crisper text
QUALITY = 84

# name              logical  where it is used (display width at a 1440 viewport)
SHOTS = [
    ('meetings',       1000, 'closing CTA card — index, pricing (813)'),
    ('project',        1000, 'use-case tab — index (790); split — features (695); CTA — features (813)'),
    ('meeting-notes',  1000, 'use-case tab — index (790); split — features (695)'),
    ('watchouts',      1000, 'CTA card — about (813)'),
    ('watch-panel',    1000, 'split — features, about (695)'),
    ('tasks',          1000, 'use-case tab — index (790)'),
    ('speech',         1000, 'use-case tab — index (790); split — features (695)'),
    ('assistant',      1000, 'CTA card — integrations (813)'),
    ('c-watchout',      420, 'three-up card — index (269-336)'),
    ('c-tasks',         420, 'three-up card — index (269-336)'),
    ('c-tasks-lg',      620, 'stacking card — index (460)'),
    ('c-compare',       650, 'stacking card — index (460)'),
    ('c-compare-tall',  500, 'results card — index (365)'),
    ('c-speech-tall',   420, 'three-up card — index (269-336)'),
    ('c-privacy',       620, 'stacking card — index (460)'),
]

# The frame each slot puts round a full-window shot, as a fraction of the image:
# left/width come from the slot's CSS (.shot__fg is positioned and over-sized on
# purpose, so the window bleeds past the painted backdrop). --preview renders
# exactly what a visitor sees, which is the only way to catch a shot whose right
# or bottom edge has something on it that matters.
SLOTS = {
    'use-case': dict(box=(681, 495), left=.07, top=.08, width=1.16),
    'split':    dict(box=(570, 413), left=.08, top=.08, width=1.22),
    'cta':      dict(box=(616, 320), left=.08, top=.09, width=1.32),
}


def serve(root):
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=root)
    srv = socketserver.TCPServer(('127.0.0.1', 0), h)
    srv.allow_reuse_address = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


async def main(only, preview):
    os.makedirs(OUT, exist_ok=True)
    srv, port = serve(ROOT)
    rows = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=CHROME,
                                        args=['--no-sandbox', '--force-color-profile=srgb'])
            pg = await b.new_page(viewport={'width': 1400, 'height': 900}, device_scale_factor=DPR)
            await pg.goto(f'http://127.0.0.1:{port}/assets/mockups/shots.html', wait_until='load')
            await pg.evaluate('document.fonts.ready')
            await pg.wait_for_timeout(500)
            await pg.add_style_tag(content='.stage{box-shadow:none!important}.stage::after{display:none!important}')

            for name, logical, used in SHOTS:
                if only and name not in only:
                    continue
                el = await pg.query_selector(f'#{name}')
                if el is None:
                    print(f'  !! no stage #{name} in shots.html'); continue
                raw = await el.screenshot(type='png')
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                tw = int(round(logical * SCALE))
                th = int(round(im.height * tw / im.width))
                im = im.resize((tw, th), Image.LANCZOS)
                im.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=QUALITY, method=6)
                kb = os.path.getsize(os.path.join(OUT, f'{name}.webp')) / 1024
                rows.append((name, logical, tw, th, kb, used))
                if preview:
                    write_previews(name, im, logical)
            await b.close()
    finally:
        srv.shutdown()

    print(f'\n{"shot":15} {"logical":>8} {"natural":>12} {"KB":>7}   used in')
    for name, logical, tw, th, kb, used in rows:
        print(f'{name:15} {logical:>8} {tw:>5}x{th:<6} {kb:>7.0f}   {used}')
    print(f'\nwritten to {OUT}')
    print('\nHTML width/height attributes to use:')
    for name, logical, tw, th, kb, used in rows:
        print(f'  {name}.webp  width="{tw}" height="{th}"')


def write_previews(name, im, logical):
    """What the visitor actually sees, slot by slot."""
    d = os.path.join(HERE, '_preview')
    os.makedirs(d, exist_ok=True)
    if logical < 900:
        im.save(os.path.join(d, f'{name}.png')); return
    for slot, s in SLOTS.items():
        bw, bh = s['box']
        iw = bw * s['width']
        x0, y0 = bw * s['left'], bh * s['top']
        fx = min(1.0, (bw - x0) / iw)
        fy = min(1.0, (bh - y0) / (iw * im.height / im.width))
        crop = im.crop((0, 0, int(im.width * fx), int(im.height * fy)))
        crop = crop.resize((int(bw - x0), int(round((bw - x0) * crop.height / crop.width))), Image.LANCZOS)
        crop.save(os.path.join(d, f'{name}--{slot}.png'))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    asyncio.run(main(set(args), '--preview' in sys.argv))
