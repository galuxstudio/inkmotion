#!/usr/bin/env python3
"""Turn a black-on-light line drawing (PNG/JPG) into an SVG InkMotion can draw.

    python3 scripts/vectorize.py drawing.png drawing.svg [--threshold 140] [--speckle 8]

Needs `vtracer` and `pillow`. vtracer 0.6.x crashes on Python 3.14; with uv:
    uv run --python 3.12 --with vtracer --with pillow python scripts/vectorize.py in.png out.svg
"""
import argparse
import os
import tempfile

from PIL import Image, ImageOps
import vtracer

ap = argparse.ArgumentParser()
ap.add_argument("input")
ap.add_argument("output")
ap.add_argument("--threshold", type=int, default=140, help="0-255, pixels darker than this become ink")
ap.add_argument("--speckle", type=int, default=8, help="drop specks smaller than this many pixels")
ap.add_argument("--invert", action="store_true", help="use for light lines on a dark background")
a = ap.parse_args()

im = ImageOps.exif_transpose(Image.open(a.input)).convert("L")
if a.invert:
    im = ImageOps.invert(im)
im = ImageOps.autocontrast(im)
im = im.point(lambda v: 0 if v < a.threshold else 255).convert("RGB")
with tempfile.TemporaryDirectory() as tmp:
    clean = os.path.join(tmp, "clean.png")
    im.save(clean)
    vtracer.convert_image_to_svg_py(
        clean, os.path.abspath(a.output), colormode="binary", mode="spline", filter_speckle=a.speckle
    )
print(f"wrote {a.output}")
