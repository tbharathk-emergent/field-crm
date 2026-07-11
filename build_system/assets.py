"""Icon + Splash asset generation from a single tenant logo.

Uses Pillow. All output paths are absolute.

Android densities and sizes (launcher icon):
    mdpi     48
    hdpi     72
    xhdpi    96
    xxhdpi   144
    xxxhdpi  192

Android adaptive icon foreground: 108×108 dp per density (mdpi 108, hdpi 162,
xhdpi 216, xxhdpi 324, xxxhdpi 432). The Play Store 512×512 marketing icon is
also emitted.

iOS AppIcon.appiconset — full universal set covering iPhone + iPad + App Store.

Splash: single 2732×2732 PNG (Capacitor's SplashScreen plugin resizes it).
`splash.png` and `splash-dark.png` both emitted (same for now).
"""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageOps

from .utils import ensure_dir, hex_to_rgb, log, write_bytes, write_text


ANDROID_ICON_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ANDROID_ADAPTIVE_SIZES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
PLAYSTORE_ICON = 512

# iOS AppIcon.appiconset contents.json entries (universal set).
IOS_APPICON_SIZES: list[tuple[str, int, str]] = [
    # (filename, pixel size, contents.json blob key)
    ("Icon-20@2x.png", 40, "20x20@2x-iphone"),
    ("Icon-20@3x.png", 60, "20x20@3x-iphone"),
    ("Icon-29@2x.png", 58, "29x29@2x-iphone"),
    ("Icon-29@3x.png", 87, "29x29@3x-iphone"),
    ("Icon-40@2x.png", 80, "40x40@2x-iphone"),
    ("Icon-40@3x.png", 120, "40x40@3x-iphone"),
    ("Icon-60@2x.png", 120, "60x60@2x-iphone"),
    ("Icon-60@3x.png", 180, "60x60@3x-iphone"),
    ("Icon-20-ipad.png", 20, "20x20@1x-ipad"),
    ("Icon-20@2x-ipad.png", 40, "20x20@2x-ipad"),
    ("Icon-29-ipad.png", 29, "29x29@1x-ipad"),
    ("Icon-29@2x-ipad.png", 58, "29x29@2x-ipad"),
    ("Icon-40-ipad.png", 40, "40x40@1x-ipad"),
    ("Icon-40@2x-ipad.png", 80, "40x40@2x-ipad"),
    ("Icon-76.png", 76, "76x76@1x-ipad"),
    ("Icon-76@2x.png", 152, "76x76@2x-ipad"),
    ("Icon-83.5@2x.png", 167, "83.5x83.5@2x-ipad"),
    ("Icon-1024.png", 1024, "1024x1024-ios-marketing"),
]

SPLASH_SIZE = 2732  # Capacitor recommendation (universal)


def _open_logo(logo_bytes: Optional[bytes], fallback_color: str) -> Image.Image:
    """Return an RGBA logo image. Falls back to a solid-color square when no logo."""
    if logo_bytes:
        try:
            im = Image.open(io.BytesIO(logo_bytes))
            return ImageOps.exif_transpose(im).convert("RGBA")
        except Exception as e:
            log.warning(f"Could not open uploaded logo ({e}); using fallback")
    r, g, b = hex_to_rgb(fallback_color)
    im = Image.new("RGBA", (1024, 1024), (r, g, b, 255))
    return im


def _square_pad(im: Image.Image, bg: tuple[int, int, int, int]) -> Image.Image:
    """Pad the image so it's a centered square, on a background of `bg`."""
    w, h = im.size
    if w == h:
        return im
    size = max(w, h)
    canvas = Image.new("RGBA", (size, size), bg)
    canvas.paste(im, ((size - w) // 2, (size - h) // 2), im if im.mode == "RGBA" else None)
    return canvas


def _resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.LANCZOS)


def _fit_into(im: Image.Image, box: int, padding_pct: float,
              bg: tuple[int, int, int, int]) -> Image.Image:
    """Fit `im` centered into a `box`×`box` canvas with `padding_pct` inner margin."""
    canvas = Image.new("RGBA", (box, box), bg)
    inner = int(box * (1 - padding_pct))
    im2 = im.copy()
    im2.thumbnail((inner, inner), Image.LANCZOS)
    ox = (box - im2.width) // 2
    oy = (box - im2.height) // 2
    canvas.paste(im2, (ox, oy), im2 if im2.mode == "RGBA" else None)
    return canvas


def _rounded_mask(size: int, radius_pct: float = 0.22) -> Image.Image:
    """Return an 'L' mask with rounded corners (Android launcher rounded shape)."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    r = int(size * radius_pct)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return m


def _apply_round(im: Image.Image) -> Image.Image:
    m = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(m)
    d.ellipse([0, 0, im.width - 1, im.height - 1], fill=255)
    out = im.copy()
    out.putalpha(m)
    return out


def generate_all(logo_bytes: Optional[bytes],
                 primary_hex: str,
                 android_res_dir: Path,
                 ios_appicon_dir: Path,
                 splash_out_dir: Path,
                 playstore_icon_path: Path) -> None:
    """Generate every asset atom needed by both platforms + Play Store."""

    r, g, b = hex_to_rgb(primary_hex)
    bg = (r, g, b, 255)
    src = _square_pad(_open_logo(logo_bytes, primary_hex), bg)

    # -------- Android launcher icons --------
    for density, size in ANDROID_ICON_SIZES.items():
        out_dir = android_res_dir / f"mipmap-{density}"
        base = _fit_into(src, size, padding_pct=0.15, bg=bg)
        # ic_launcher.png — square (Android <8 fallback)
        write_bytes(out_dir / "ic_launcher.png", _png(base))
        # ic_launcher_round.png — circular
        write_bytes(out_dir / "ic_launcher_round.png", _png(_apply_round(base)))
        # ic_launcher_foreground.png — used by adaptive icon
        fg_size = ANDROID_ADAPTIVE_SIZES[density]
        fg = _fit_into(src, fg_size, padding_pct=0.30,
                       bg=(0, 0, 0, 0))  # transparent so the color layer shows
        write_bytes(out_dir / "ic_launcher_foreground.png", _png(fg))

    # Adaptive icon XMLs (Android O+)
    adaptive_xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
                    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                    '    <background android:drawable="@color/ic_launcher_background" />\n'
                    '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
                    '</adaptive-icon>\n')
    write_text(android_res_dir / "mipmap-anydpi-v26" / "ic_launcher.xml", adaptive_xml)
    write_text(android_res_dir / "mipmap-anydpi-v26" / "ic_launcher_round.xml", adaptive_xml)

    # values/ic_launcher_background.xml — primary color
    color_xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
                 '<resources>\n'
                 f'    <color name="ic_launcher_background">{primary_hex}</color>\n'
                 '</resources>\n')
    write_text(android_res_dir / "values" / "ic_launcher_background.xml", color_xml)

    # Splash asset for Android (used by capacitor splash plugin)
    splash = Image.new("RGBA", (SPLASH_SIZE, SPLASH_SIZE), bg)
    center = _fit_into(src, int(SPLASH_SIZE * 0.5), padding_pct=0.05, bg=(0, 0, 0, 0))
    ox = (SPLASH_SIZE - center.width) // 2
    oy = (SPLASH_SIZE - center.height) // 2
    splash.paste(center, (ox, oy), center)
    write_bytes(splash_out_dir / "splash.png", _png(splash))
    write_bytes(splash_out_dir / "splash-dark.png", _png(splash))

    # Play Store 512×512 marketing icon
    write_bytes(playstore_icon_path, _png(_fit_into(src, PLAYSTORE_ICON, 0.10, bg)))

    # -------- iOS AppIcon set --------
    contents = {"images": [], "info": {"version": 1, "author": "build_app.py"}}
    for filename, size, _ in IOS_APPICON_SIZES:
        out = _fit_into(src, size, padding_pct=0.10, bg=bg)
        write_bytes(ios_appicon_dir / filename, _png(out))
        contents["images"].append(_ios_contents_entry(filename, size))
    write_text(ios_appicon_dir / "Contents.json", json.dumps(contents, indent=2))

    log.info(
        f"Generated: android {len(ANDROID_ICON_SIZES)}×3 icons + adaptive XML, "
        f"ios {len(IOS_APPICON_SIZES)} icons, 1 splash (2732), 1 playstore 512"
    )


def _png(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _ios_contents_entry(filename: str, size: int) -> dict:
    """Build the Contents.json image entry from filename convention."""
    is_ipad = "ipad" in filename
    is_marketing = filename == "Icon-1024.png"
    if is_marketing:
        return {"filename": filename, "idiom": "ios-marketing",
                "scale": "1x", "size": "1024x1024"}
    # Parse "@2x" / "@3x" scale
    scale = "1x"
    if "@2x" in filename:
        scale = "2x"
    elif "@3x" in filename:
        scale = "3x"
    # Parse point size from filename prefix like "Icon-40"
    tag = filename.split("-", 1)[1].split("@", 1)[0].replace("-ipad", "").rstrip(".png")
    pt = tag  # e.g. "20", "29", "40", "60", "76", "83.5"
    return {"filename": filename, "idiom": "ipad" if is_ipad else "iphone",
            "scale": scale, "size": f"{pt}x{pt}"}


def prepare_dirs(project_root: Path) -> tuple[Path, Path, Path, Path]:
    """Return (android_res, ios_appicon, splash_dir, playstore_icon_path)."""
    android_res = project_root / "android" / "app" / "src" / "main" / "res"
    ios_appicon = (project_root / "ios" / "App" / "App" /
                   "Assets.xcassets" / "AppIcon.appiconset")
    splash_dir = project_root / "resources"       # for capacitor-assets tooling
    playstore = project_root / "playstore-icon-512.png"
    ensure_dir(android_res)
    ensure_dir(ios_appicon)
    ensure_dir(splash_dir)
    return android_res, ios_appicon, splash_dir, playstore
