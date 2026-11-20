#!/usr/bin/env python3
"""Generate the "Habits" app icon assets from the user-supplied logo source.

The source (`assets/images/source/habits-logo-source.jpg`) is a mockup photo
of the logo: a rounded white card holding a navy "H"-shaped growth-arrow mark
and the "Habits" wordmark, shown on a near-white page background. This script
extracts the mark from that photo (by color distance from the background) and
composes every icon size/variant the app needs.

Run: python3 scripts/generate-app-icon.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

WHITE = (255, 255, 255, 255)
CARD_BG = (247, 248, 246, 255)  # the logo card's own near-white fill

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets" / "images"
SOURCE_PATH = ASSETS_DIR / "source" / "habits-logo-source.jpg"

# Color-distance thresholds (sum of abs RGB diff from the page background)
# used to separate the mockup photo into layers.
CARD_THRESHOLD = 40  # card + glyph + wordmark, vs. bare page background
GLYPH_THRESHOLD = 130  # navy ink only, vs. everything else (card included)

CROP_PADDING = 20


def _load_source() -> np.ndarray:
    img = Image.open(SOURCE_PATH).convert("RGB")
    return np.array(img).astype(int)


def _page_background(arr: np.ndarray) -> np.ndarray:
    # Sample a corner, far from the centered card.
    return arr[5, 5]


def _extract_layer(arr: np.ndarray, bg: np.ndarray, threshold: int) -> Image.Image:
    """Return an RGBA image where pixels far enough from `bg` keep their
    color, and everything else is fully transparent."""
    diff = np.abs(arr - bg).sum(axis=2)
    mask = diff > threshold
    alpha = np.clip(diff.astype(float) * 1.5, 0, 255).astype(np.uint8)
    alpha[~mask] = 0
    rgba = np.dstack([arr.astype(np.uint8), alpha])
    return Image.fromarray(rgba)


def _bbox_at_threshold(arr: np.ndarray, bg: np.ndarray, threshold: int, padding: int) -> tuple[int, int, int, int]:
    """Bounding box (x0, y0, x1, y1) of pixels differing from `bg` by more
    than `threshold`, padded outward."""
    diff = np.abs(arr - bg).sum(axis=2)
    mask = diff > threshold
    cols = np.where(mask.any(axis=0))[0]
    rows = np.where(mask.any(axis=1))[0]
    h, w = arr.shape[0], arr.shape[1]
    x0, x1 = max(cols.min() - padding, 0), min(cols.max() + padding, w)
    y0, y1 = max(rows.min() - padding, 0), min(rows.max() + padding, h)
    return x0, y0, x1, y1


def _tight_crop(mask_source: Image.Image, padding: int = CROP_PADDING) -> Image.Image:
    alpha = np.array(mask_source.split()[-1])
    cols = np.where(alpha.any(axis=0))[0]
    rows = np.where(alpha.any(axis=1))[0]
    x0, x1 = max(cols.min() - padding, 0), min(cols.max() + padding, mask_source.width)
    y0, y1 = max(rows.min() - padding, 0), min(rows.max() + padding, mask_source.height)
    return mask_source.crop((x0, y0, x1, y1))


def _fit_on_square(layer: Image.Image, size: int, fill_fraction: float, background) -> Image.Image:
    """Paste `layer` (RGBA), scaled to occupy `fill_fraction` of `size`,
    centered on a new `size`x`size` canvas filled with `background`
    (an RGBA tuple, or None for a transparent canvas)."""
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    target = int(size * fill_fraction)
    scale = target / max(layer.size)
    new_size = (max(1, int(layer.width * scale)), max(1, int(layer.height * scale)))
    resized = layer.resize(new_size, Image.LANCZOS)
    offset = ((size - new_size[0]) // 2, (size - new_size[1]) // 2)
    canvas.alpha_composite(resized, offset)
    return canvas


def main() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    arr = _load_source()
    bg = _page_background(arr)

    card_layer = _tight_crop(_extract_layer(arr, bg, CARD_THRESHOLD))

    # Bound the glyph extraction tightly to the ink itself first (a strict
    # threshold finds just the letters/arrow, no shadow), then re-extract at
    # the normal threshold only within that region — this keeps the card's
    # drop shadow (which can be dark enough to pass a looser global threshold)
    # from leaking into the glyph-only layer.
    gx0, gy0, gx1, gy1 = _bbox_at_threshold(arr, bg, threshold=150, padding=12)
    glyph_region = arr[gy0:gy1, gx0:gx1]
    glyph_layer = _tight_crop(_extract_layer(glyph_region, bg, GLYPH_THRESHOLD))

    # White-only version of the glyph, for the Android monochrome icon
    # (the OS tints whatever is opaque here with its own theme color).
    glyph_white = glyph_layer.copy()
    glyph_alpha = np.array(glyph_white.split()[-1])
    white_rgba = np.zeros((*glyph_alpha.shape, 4), dtype=np.uint8)
    white_rgba[..., 0:3] = 255
    white_rgba[..., 3] = glyph_alpha
    glyph_white = Image.fromarray(white_rgba)

    outputs = {
        # Full card (rounded card + glyph + wordmark) on a plain white
        # canvas — the OS applies its own corner rounding on top.
        "icon.png": _fit_on_square(card_layer, 1024, 0.92, (255, 255, 255, 255)).convert("RGB"),
        # Adaptive icon: foreground is the full card art on transparent,
        # sized into the ~66% safe zone; background is a solid card-matching fill.
        "android-icon-foreground.png": _fit_on_square(card_layer, 512, 0.72, None),
        "android-icon-background.png": Image.new("RGBA", (512, 512), CARD_BG),
        # Monochrome: glyph + wordmark only, solid white, transparent bg.
        "android-icon-monochrome.png": _fit_on_square(glyph_white, 432, 0.66, None),
        "favicon.png": _fit_on_square(card_layer, 48, 0.92, (255, 255, 255, 255)),
        # Splash: glyph + wordmark only, transparent bg, modest size to match
        # the existing splash config's imageWidth:200 intent.
        "splash-icon.png": _fit_on_square(glyph_layer, 1024, 0.3, None),
    }

    for filename, image in outputs.items():
        path = ASSETS_DIR / filename
        image.save(path)
        print(f"Wrote {path} ({image.size[0]}x{image.size[1]}, {image.mode})")


if __name__ == "__main__":
    main()
