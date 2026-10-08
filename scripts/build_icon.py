#!/usr/bin/env python3
"""
Generate multi-resolution Windows ICO file for PulseTerm from master icon.
Resolutions: 16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256.
"""

import os
import sys
from PIL import Image, ImageDraw

def create_pulseterm_ico(output_path: str):
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    png_source = os.path.join(root_dir, "assets", "app_icon.png")

    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]

    if os.path.exists(png_source):
        im = Image.open(png_source).convert("RGBA")
        images = [im.resize(s, Image.Resampling.LANCZOS) for s in sizes]
    else:
        # Fallback procedural generation
        images = []
        bg_color = (6, 9, 6, 255)
        border_color = (0, 255, 102, 255)
        for w, h in sizes:
            img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=int(w * 0.18), fill=bg_color, outline=border_color)
            images.append(img)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    images[0].save(
        output_path,
        format="ICO",
        sizes=sizes,
        append_images=images[1:]
    )
    print(f"[OK] PulseTerm new multi-resolution ICO generated: {output_path} ({len(sizes)} resolutions)")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "assets", "app.ico")
    if len(sys.argv) > 1:
        out = sys.argv[1]
    create_pulseterm_ico(os.path.abspath(out))
