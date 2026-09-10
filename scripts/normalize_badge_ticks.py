"""Apply one canonical verification medallion to every animal badge."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

from PIL import Image, ImageDraw


BADGES = (
    "Crab",
    "Lobster",
    "Piranha",
    "Tortoise",
    "Cobra",
    "Octopus",
    "Crocodite",
    "Dolphin",
    "Tiger Shark",
    "Killer Whale",
    "Great White Shark",
    "Blue Whale",
    "Meglodon",
)

CANVAS_SIZE = 128
MEDALLION_SIZE = 82
MEDALLION_OFFSET = (23, 23)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_medallion(_: Path) -> Image.Image:
    """Draw a chrome plate whose tick has provably equal horizontal padding."""
    scale = 8
    size = MEDALLION_SIZE * scale
    center = size // 2
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Concentric diamonds create the existing black-chrome/enamel treatment.
    outer = [(center, 1 * scale), ((MEDALLION_SIZE - 1) * scale, center),
             (center, (MEDALLION_SIZE - 1) * scale), (1 * scale, center)]
    middle = [(center, 5 * scale), ((MEDALLION_SIZE - 5) * scale, center),
              (center, (MEDALLION_SIZE - 5) * scale), (5 * scale, center)]
    inner = [(center, 8 * scale), ((MEDALLION_SIZE - 8) * scale, center),
             (center, (MEDALLION_SIZE - 8) * scale), (8 * scale, center)]
    draw.polygon(outer, fill=(28, 30, 34, 255))
    draw.line(outer + [outer[0]], fill=(232, 235, 240, 255), width=2 * scale, joint="curve")
    draw.line(middle + [middle[0]], fill=(90, 96, 106, 255), width=2 * scale, joint="curve")
    draw.polygon(inner, fill=(8, 10, 13, 255))

    # Draw the tick on its own mask, then center its *rendered pixel bounds*.
    tick = Image.new("L", (size, size), 0)
    tick_draw = ImageDraw.Draw(tick)
    points = [(19 * scale, 41 * scale), (34 * scale, 56 * scale), (63 * scale, 27 * scale)]
    tick_draw.line(points, fill=255, width=10 * scale, joint="curve")
    radius = 5 * scale
    for x, y in points:
        tick_draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=255)
    bounds = tick.getbbox()
    if bounds is None:
        raise ValueError("tick mask is empty")
    left, _, right, _ = bounds
    if (size - (right - left)) % 2:
        # One supersampled pixel makes the visible width even, allowing exactly
        # equal integer padding without a half-pixel translation.
        tick.putpixel((right, points[-1][1]), 255)
        left, _, right, _ = tick.getbbox() or bounds
    dx = ((size - (right - left)) // 2) - left
    centered_tick = Image.new("L", (size, size), 0)
    centered_tick.paste(tick, (dx, 0))
    final_bounds = centered_tick.getbbox()
    if final_bounds is None or final_bounds[0] != size - final_bounds[2]:
        raise ValueError(f"tick padding is not equal: {final_bounds}")

    white = Image.new("RGBA", (size, size), (242, 245, 248, 255))
    image.alpha_composite(Image.composite(white, Image.new("RGBA", (size, size)), centered_tick))
    return image.resize((MEDALLION_SIZE, MEDALLION_SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: normalize_badge_ticks.py MASTER WEB_ROOT MOBILE_ROOT")

    master_path, web_root, mobile_root = map(Path, sys.argv[1:])
    web_badges = web_root / "src" / "assets" / "badges"
    mobile_badges = mobile_root / "assets" / "badges"
    public_media = web_root / "public" / "media"
    medallion = canonical_medallion(master_path)

    # Resolve legacy UUID copies before replacing the named source files.
    legacy_by_badge: dict[str, list[Path]] = {}
    public_by_hash: dict[str, list[Path]] = {}
    for candidate in public_media.glob("*.png"):
        public_by_hash.setdefault(digest(candidate), []).append(candidate)
    for name in BADGES:
        legacy_by_badge[name] = public_by_hash.get(digest(web_badges / f"{name}.png"), [])

    for name in BADGES:
        source = Image.open(mobile_badges / f"{name}.png").convert("RGBA")
        if source.size != (CANVAS_SIZE, CANVAS_SIZE):
            raise ValueError(f"{name} is {source.size}, expected 128x128")
        source.alpha_composite(medallion, MEDALLION_OFFSET)

        mobile_target = mobile_badges / f"{name}.png"
        web_png_target = web_badges / f"{name}.png"
        web_webp_target = web_badges / f"{name}.webp"
        source.save(mobile_target, optimize=True)
        source.save(web_png_target, optimize=True)
        source.save(web_webp_target, "WEBP", lossless=True, method=6)
        for legacy_target in legacy_by_badge[name]:
            source.save(legacy_target, optimize=True)

        print(f"{name}: medallion={MEDALLION_OFFSET[0]},{MEDALLION_OFFSET[1]} {MEDALLION_SIZE}x{MEDALLION_SIZE}")


if __name__ == "__main__":
    main()
