#!/usr/bin/env python3
"""Rebuild brand/mark.svg and brand/wordmark.svg from the AI monogram + Gothic A1 Black 쓰발.

    python3 scripts/gen-brand-svg.py && node scripts/gen-brand-icons.mjs

The committed SVGs are the source of truth if this font is not on the machine.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / 'brand'
FONT = Path('/usr/share/fonts/truetype/sand-box/google/Gothic A1/GothicA1-Black.ttf')
SKEW = math.tan(math.radians(10))
INK = '#111111'
BASELINE = 100
VISUAL_GAP_MARK = 12
VISUAL_GAP_SYL = 6

A_OUTER = [(0, 100), (28, 8), (43, 8), (71, 100), (54, 100), (50, 82), (21, 82), (17, 100)]
A_COUNTER = [(26, 67), (45, 67), (35.5, 34)]
I_OUTER = [(83, 8), (101, 8), (101, 100), (83, 100)]


def q(n: float, places: int = 2) -> float:
    return round(float(n), places)


def italicize(x: float, y: float, baseline: float = BASELINE) -> tuple[float, float]:
    return x + (baseline - y) * SKEW, y


def poly(points: list[tuple[float, float]]) -> str:
    return 'M' + 'L'.join(f'{q(x)} {q(y)}' for x, y in points) + 'Z'


def italic_poly(points: list[tuple[float, float]]) -> str:
    return poly([italicize(x, y) for x, y in points])


def glyph_at(glyphset, cmap, scale: float, ch: str, dx: float, dy: float = BASELINE):
    g = glyphset[cmap[ord(ch)]]
    t = Transform(scale, 0, 0, -scale, dx, dy)
    italic = Transform(1, 0, -SKEW, 1, SKEW * dy, 0)
    final = italic.transform(t)
    pen = SVGPathPen(glyphset)
    g.draw(TransformPen(pen, final))
    bp = BoundsPen(glyphset)
    g.draw(TransformPen(bp, final))
    d = re.sub(r'-?\d+\.\d+', lambda m: str(q(float(m.group()), 2)), pen.getCommands())
    return d, g.width * scale, bp.bounds


def main() -> None:
    if not FONT.exists():
        raise SystemExit(f'Gothic A1 Black not found at {FONT}')
    BRAND.mkdir(exist_ok=True)

    mark_paths = [italic_poly(A_OUTER) + italic_poly(A_COUNTER), italic_poly(I_OUTER)]
    pts = [italicize(x, y) for group in (A_OUTER, A_COUNTER, I_OUTER) for x, y in group]
    mx0, my0 = min(p[0] for p in pts), min(p[1] for p in pts)
    mx1, my1 = max(p[0] for p in pts), max(p[1] for p in pts)
    mark_w, mark_h = mx1 - mx0, my1 - my0

    font = TTFont(str(FONT))
    glyphset = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = 92 / 826

    _, _, b_ssu0 = glyph_at(glyphset, cmap, scale, '쓰', 0)
    _, _, b_bal0 = glyph_at(glyphset, cmap, scale, '발', 0)
    ssu_dx = mark_w + VISUAL_GAP_MARK - b_ssu0[0]
    d_ssu, _, b_ssu = glyph_at(glyphset, cmap, scale, '쓰', ssu_dx)
    bal_dx = b_ssu[2] + VISUAL_GAP_SYL - b_bal0[0]
    d_bal, _, b_bal = glyph_at(glyphset, cmap, scale, '발', bal_dx)

    xs = [0, mark_w, b_ssu[0], b_ssu[2], b_bal[0], b_bal[2]]
    ys = [my0, my1, b_ssu[1], b_ssu[3], b_bal[1], b_bal[3]]
    pad = 3
    wx0, wy0 = min(xs) - pad, min(ys) - pad
    wx1, wy1 = max(xs) + pad, max(ys) + pad

    (BRAND / 'wordmark.svg').write_text(
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{q(wx0)} {q(wy0)} {q(wx1 - wx0)} {q(wy1 - wy0)}" fill="{INK}" role="img" aria-label="AI쓰발">
  <title>AI쓰발</title>
  <g transform="translate({q(-mx0)} 0)">
    <path fill-rule="evenodd" d="{mark_paths[0]}"/>
    <path d="{mark_paths[1]}"/>
  </g>
  <path d="{d_ssu}"/>
  <path d="{d_bal}"/>
</svg>
'''
    )

    side = max(mark_w, mark_h)
    pad_s = side * 0.04
    sq = side + 2 * pad_s
    ox = mx0 - (sq - mark_w) / 2
    oy = my0 - (sq - mark_h) / 2
    (BRAND / 'mark.svg').write_text(
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{q(ox)} {q(oy)} {q(sq)} {q(sq)}" fill="currentColor" role="img" aria-label="AI쓰발">
  <title>AI쓰발</title>
  <path fill-rule="evenodd" d="{mark_paths[0]}"/>
  <path d="{mark_paths[1]}"/>
</svg>
'''
    )

    (BRAND / 'metrics.json').write_text(
        json.dumps(
            {
                'wordmarkViewBox': [q(wx0), q(wy0), q(wx1 - wx0), q(wy1 - wy0)],
                'markViewBox': [q(ox), q(oy), q(sq), q(sq)],
                'aspect': q((wx1 - wx0) / (wy1 - wy0), 4),
                'ink': INK,
                'bg': '#111111',
            },
            indent=2,
        )
        + '\n'
    )
    print('wrote', BRAND / 'mark.svg', 'and', BRAND / 'wordmark.svg')


if __name__ == '__main__':
    main()
