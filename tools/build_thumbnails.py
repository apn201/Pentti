"""Cut pieces from the real screenshots in docs/media and lay out the thumbnails.

Nothing here is drawn or retyped except the headline. The map and the red row are pixels
from the app. Needs Pillow. Writes docs/media/_thumb-*.html for tools/render_thumbnails.cjs.
"""
import base64
import io
from pathlib import Path

from PIL import Image

MEDIA = Path(__file__).resolve().parent.parent / "docs" / "media"
BRAND = Path(__file__).resolve().parent.parent / "static" / "brand" / "tervaniemi-mark-256.png"

# Regions in the 1920x1080 window captures.
MAP = (44, 332, 1147, 946)
ROW = (44, 328, 1145, 392)
CHAT = (1476, 56, 1898, 836)


def b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def page(w: int, h: int, map_w: int) -> str:
    gap = Image.open(MEDIA / "gap-map.png").convert("RGB").crop(MAP)
    row = Image.open(MEDIA / "people.png").convert("RGB").crop(ROW)
    logo = Image.open(BRAND).convert("RGBA")
    return f"""<!doctype html><meta charset=utf-8><style>
*{{box-sizing:border-box;margin:0}}
body{{width:{w}px;height:{h}px;background:#14291d;color:#fff;font-family:'Segoe UI',sans-serif;padding:0 40px;overflow:hidden;display:flex;flex-direction:column;justify-content:center}}
h1{{font-size:{int(w*0.0595)}px;line-height:1.05;font-weight:700;letter-spacing:-1px}}
.row{{display:block;width:100%;margin-top:22px;border-radius:6px}}
.low{{display:flex;gap:28px;margin-top:22px;align-items:flex-start}}
.map{{width:{map_w}px;border-radius:6px;display:block}}
.big{{font-size:{int(w*0.034)}px;line-height:1.15;font-weight:600}}
.small{{font-size:{int(w*0.0165)}px;line-height:1.3;color:#c5d6c9;margin-top:16px}}
.logo{{width:{int(w*0.075)}px;margin-top:18px}}
</style>
<h1>Pentti retires in 150 days.</h1>
<img class=row src="{b64(row)}">
<div class=low>
<img class=map src="{b64(gap)}">
<div><div class=big>Top right: risky, and nobody knows anything.</div>
<div class=small>A Rovo agent that says what a factory does not know. Fictional factory, real machine mix.</div>
<img class=logo src="{b64(logo)}"></div>
</div>"""


def chat() -> None:
    a = Image.open(MEDIA / "rovo-chat-known.png").convert("RGB").crop(CHAT)
    b = Image.open(MEDIA / "rovo-chat-not-known.png").convert("RGB").crop(CHAT)
    pad = 24
    out = Image.new("RGB", (a.width + b.width + pad * 3, a.height + pad * 2), "white")
    out.paste(a, (pad, pad))
    out.paste(b, (a.width + pad * 2, pad))
    out.save(MEDIA / "rovo-chat.png")


if __name__ == "__main__":
    chat()
    (MEDIA / "_thumb-youtube.html").write_text(page(1280, 720, 790), encoding="utf-8")
    (MEDIA / "_thumb-devpost.html").write_text(page(1500, 1000, 1080), encoding="utf-8")
