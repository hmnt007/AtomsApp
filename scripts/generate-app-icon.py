#!/usr/bin/env python3
"""Generate the "Habits" app icon assets: a bold geometric capital H.

Draws a thick, rounded-stroke white "H" with an orange (#FF9500) crossbar
accent on a solid black background, and exports every size/variant the app
needs (regular icon, Android adaptive icon layers, monochrome icon, web
favicon, and splash mark).

Run: python3 scripts/generate-app-icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
ORANGE = (255, 149, 0, 255)  # #FF9500, the app's streak-orange accent

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets" / "images"


def draw_h(
    image: Image.Image,
    *,
    center: tuple[float, float],
    mark_size: float,
    stroke_color: tuple[int, int, int, int],
    crossbar_color: tuple[int, int, int, int],
) -> None:
    """Draw a bold capital "H" centered at `center`, `mark_size` tall/wide.

    The H is built from three rounded strokes: a left bar, a right bar, and
    a crossbar. The crossbar can use a different color to create the single
    small accent called for in the design.
    """
    draw = ImageDraw.Draw(image)

    cx, cy = center
    s = mark_size
    stroke_w = s * 0.22  # thickness of each stroke, relative to overall size
    radius = stroke_w * 0.5

    x0 = cx - s / 2
    x1 = cx + s / 2
    y0 = cy - s / 2
    y1 = cy + s / 2

    # Left vertical bar.
    draw.rounded_rectangle(
        [x0, y0, x0 + stroke_w, y1],
        radius=radius,
        fill=stroke_color,
    )

    # Right vertical bar.
    draw.rounded_rectangle(
        [x1 - stroke_w, y0, x1, y1],
        radius=radius,
        fill=stroke_color,
    )

    # Crossbar, spanning between the two vertical bars, centered vertically.
    draw.rounded_rectangle(
        [x0 + stroke_w * 0.6, cy - stroke_w / 2, x1 - stroke_w * 0.6, cy + stroke_w / 2],
        radius=radius,
        fill=crossbar_color,
    )


def make_icon(size: int) -> Image.Image:
    """icon.png: 1024x1024 RGB, full black background, H with orange crossbar."""
    img = Image.new("RGBA", (size, size), BLACK)
    draw_h(
        img,
        center=(size / 2, size / 2),
        mark_size=size * 0.62,
        stroke_color=WHITE,
        crossbar_color=ORANGE,
    )
    return img.convert("RGB")


def make_foreground(size: int) -> Image.Image:
    """android-icon-foreground.png: transparent bg, H mark within the ~66% safe zone."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_h(
        img,
        center=(size / 2, size / 2),
        mark_size=size * 0.66,
        stroke_color=WHITE,
        crossbar_color=ORANGE,
    )
    return img


def make_background(size: int) -> Image.Image:
    """android-icon-background.png: solid opaque black fill."""
    return Image.new("RGBA", (size, size), BLACK)


def make_monochrome(size: int) -> Image.Image:
    """android-icon-monochrome.png: transparent bg, solid white H (OS tints it)."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw_h(
        img,
        center=(size / 2, size / 2),
        mark_size=size * 0.66,
        stroke_color=WHITE,
        crossbar_color=WHITE,
    )
    return img


def make_favicon(size: int) -> Image.Image:
    """favicon.png: same look as icon.png, scaled down, kept as RGBA."""
    large = Image.new("RGBA", (1024, 1024), BLACK)
    draw_h(
        large,
        center=(512, 512),
        mark_size=1024 * 0.62,
        stroke_color=WHITE,
        crossbar_color=ORANGE,
    )
    return large.resize((size, size), Image.LANCZOS)


def make_splash(size: int) -> Image.Image:
    """splash-icon.png: transparent bg, H sized to match splash imageWidth:200 intent."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # The existing splash config uses imageWidth: 200 against a much larger
    # canvas, i.e. the mark occupies a small central portion of the canvas.
    draw_h(
        img,
        center=(size / 2, size / 2),
        mark_size=size * 0.2,
        stroke_color=WHITE,
        crossbar_color=ORANGE,
    )
    return img


def main() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    outputs = {
        "icon.png": make_icon(1024),
        "android-icon-foreground.png": make_foreground(512),
        "android-icon-background.png": make_background(512),
        "android-icon-monochrome.png": make_monochrome(432),
        "favicon.png": make_favicon(48),
        "splash-icon.png": make_splash(1024),
    }

    for filename, image in outputs.items():
        path = ASSETS_DIR / filename
        image.save(path)
        print(f"Wrote {path} ({image.size[0]}x{image.size[1]}, {image.mode})")


if __name__ == "__main__":
    main()
