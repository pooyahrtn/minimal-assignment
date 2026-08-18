#!/usr/bin/env python3
"""Generate the 34 KRACHT packshots as SVG -> JPEG.

Original artwork, not photography: a matte-black container with a lime lid/seal
accent, KRACHT wordmark, flavour swatch and macro line, on neutral studio grey.
Three container silhouettes read as one packaging system (same lime accent,
wordmark, sub-label, swatch and soft contact shadow) but the shape follows the
product: a wide screw-lid jar for gummies/capsules, a stand-up pouch for
vegan/clear-whey powders, and a cylindrical tub (a taller one for bulk sizes)
for everything else.
Run:  python3 generate_kracht.py
"""
import io
import json
import os

import cairosvg
from PIL import Image

W, H = 800, 1000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kracht")

LIME = "#C6F441"
CX = W / 2

# file, category, line label (printed), flavour, swatch, macro line (lime), descriptor
# Lines and flavours are driven by apps/shop-kracht/data/products.json so the
# printed label agrees with the catalog. Deliberately NO size/servings line:
# one image serves several size variants and the storefront renders the size.
PRODUCTS = [
    ("protein-01", "protein", "WHEY CLASSIC", "Chocolate fudge", "#4A2C1A", "24g protein per serving", "Whey protein concentrate"),
    ("protein-02", "protein", "WHEY CLASSIC", "Vanilla cream", "#EFE0B8", "24g protein per serving", "Whey protein concentrate"),
    ("protein-03", "protein", "WHEY CLASSIC", "Strawberry", "#E24B6A", "24g protein per serving", "Whey protein concentrate"),
    ("protein-04", "protein", "WHEY STARTER", "Cookies & cream", "#D8D2C6", "22g protein per serving", "Whey protein blend"),
    ("protein-05", "protein", "CASEIN NIGHT", "Peanut butter", "#C08A45", "25g protein per serving", "Slow-release micellar casein"),
    ("protein-06", "protein", "WHEY CLASSIC", "Banana custard", "#EBCF5C", "24g protein per serving", "Whey protein concentrate"),
    ("protein-07", "protein", "PURE WHEY ISOLATE", "Unflavoured", None, "28g protein per serving", "Whey isolate · nothing added"),
    ("protein-08", "protein", "WHEY ISOLATE", "Cappuccino", "#6F4E37", "27g protein per serving", "Cold-filtered whey isolate"),
    ("protein-09", "protein", "CLEAR WHEY", "Mango passionfruit", "#F2A63B", "20g protein per serving", "Clear whey isolate · light and fruity"),
    ("protein-10", "protein", "WHEY ISOLATE", "Mint chocolate", "#5FBF9B", "27g protein per serving", "Cold-filtered whey isolate"),
    ("protein-11", "protein", "VEGAN PROTEIN", "Chocolate hazelnut", "#8B6A45", "22g protein per serving", "Pea and rice protein blend"),
    ("protein-12", "protein", "PURE WHEY CONCENTRATE", "Unflavoured", None, "24g protein per serving", "Whey concentrate · nothing added"),
    ("protein-13", "protein", "WHEY STARTER", "White chocolate", "#F0E6D2", "22g protein per serving", "Whey protein blend"),
    ("protein-14", "protein", "VEGAN PROTEIN", "Coconut chai", "#F4F0E6", "22g protein per serving", "Pea and rice protein blend"),
    ("creatine-01", "creatine", "CREATINE MONOHYDRATE", "Unflavoured", None, "5g creatine per serving", "Micronised creatine monohydrate"),
    ("creatine-02", "creatine", "CREATINE MONOHYDRATE", "Blue raspberry", "#2F6FD0", "5g creatine per serving", "Micronised creatine monohydrate"),
    ("creatine-03", "creatine", "CREATINE MONOHYDRATE", "Watermelon", "#E4506A", "5g creatine per serving", "Micronised creatine monohydrate"),
    ("creatine-04", "creatine", "CREATINE MONOHYDRATE", "Green apple", "#8CC63F", "5g creatine per serving", "Micronised creatine monohydrate"),
    ("creatine-05", "creatine", "CREAPURE", "Unflavoured", None, "5g creatine per serving", "Creapure creatine monohydrate"),
    ("creatine-06", "creatine", "CREATINE HCL", "Unflavoured", None, "750mg per capsule", "Creatine hydrochloride capsules"),
    ("creatine-07", "creatine", "CREATINE MONOHYDRATE", "Lemon lime", "#D6E23C", "5g creatine per serving", "Micronised creatine monohydrate"),
    ("creatine-08", "creatine", "CREATINE GUMMIES", "Grape", "#7B4FA8", "5g creatine per 5 gummies", "Chewable creatine monohydrate"),
    ("preworkout-01", "preworkout", "PRE-WORKOUT SHOCK", "Blue raspberry blast", "#2F6FD0", "200mg caffeine per scoop", "Caffeine · beta-alanine · citrulline"),
    ("preworkout-02", "preworkout", "PURE PRE-WORKOUT", "Unflavoured", None, "200mg caffeine per scoop", "Caffeine · beta-alanine · citrulline"),
    ("preworkout-03", "preworkout", "PRE-WORKOUT SHOCK", "Watermelon burst", "#E4506A", "200mg caffeine per scoop", "Caffeine · beta-alanine · citrulline"),
    ("preworkout-04", "preworkout", "BETA-ALANINE", "Unflavoured", None, "3.2g beta-alanine per scoop", "Pure beta-alanine powder"),
    ("preworkout-05", "preworkout", "PRE-WORKOUT SHOCK", "Cola kick", "#5A3A22", "200mg caffeine per scoop", "Caffeine · beta-alanine · citrulline"),
    ("preworkout-06", "preworkout", "PRE-WORKOUT LITE", "Mango ice", "#F2A63B", "100mg caffeine per scoop", "Half the caffeine, same pump"),
    ("preworkout-07", "preworkout", "CITRULLINE MALATE", "Unflavoured", None, "6g citrulline malate per scoop", "Pure citrulline malate 2:1"),
    ("preworkout-08", "preworkout", "PRE-WORKOUT SHOCK", "Sour candy", "#C9E24B", "200mg caffeine per scoop", "Caffeine · beta-alanine · citrulline"),
    ("preworkout-09", "preworkout", "PRE-WORKOUT SHOCK", "Peach tea", "#E9A87C", "200mg caffeine per scoop", "Caffeine · beta-alanine · citrulline"),
    ("preworkout-10", "preworkout", "PUMP NON-STIM", "Grape storm", "#7B4FA8", "Stimulant free", "Citrulline · glycerol · nitrate"),
    ("preworkout-11", "preworkout", "PUMP NON-STIM", "Citrus surge", "#F0B429", "Stimulant free", "Citrulline · glycerol · nitrate"),
    ("preworkout-12", "preworkout", "PRE-WORKOUT SHOCK", "Berry fusion", "#A0348C", "200mg caffeine per scoop", "Caffeine · beta-alanine · citrulline"),
]

ALT_KIND = {"protein": "protein", "creatine": "creatine", "preworkout": "pre-workout"}

# Silhouette assignment, by file. Everything not listed here is a standard tub.
# - pouch: vegan protein and clear whey (powders that ship in stand-up bags)
# - jar: gummies and capsules (short, wide, screw-lid)
# - tub-large: the images shared with this line's bulk sizes get a visibly
#   bigger tub so a listing page doesn't read as one silhouette repeated
POUCH_FILES = {"protein-09", "protein-11", "protein-14"}
JAR_FILES = {"creatine-06", "creatine-08"}
LARGE_TUB_FILES = {"protein-01", "protein-10", "creatine-01"}

SHAPE_WORD = {"tub": "tub", "tub-large": "tub", "jar": "jar", "pouch": "pouch"}


def shape_for(name):
    if name in POUCH_FILES:
        return "pouch"
    if name in JAR_FILES:
        return "jar"
    if name in LARGE_TUB_FILES:
        return "tub-large"
    return "tub"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


DEFS = """<defs>
  <radialGradient id="bg" cx="50%" cy="42%" r="72%">
    <stop offset="0%" stop-color="#F2F1EE"/><stop offset="100%" stop-color="#DCDAD5"/>
  </radialGradient>
  <!-- cylinder/pouch shading: dark edges, a soft specular band left of centre -->
  <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#080808"/>
    <stop offset="8%"   stop-color="#151515"/>
    <stop offset="30%"  stop-color="#33322F"/>
    <stop offset="45%"  stop-color="#232322"/>
    <stop offset="72%"  stop-color="#131313"/>
    <stop offset="100%" stop-color="#050505"/>
  </linearGradient>
  <linearGradient id="lid" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#0B0B0B"/>
    <stop offset="30%"  stop-color="#3A3A37"/>
    <stop offset="55%"  stop-color="#232322"/>
    <stop offset="100%" stop-color="#070707"/>
  </linearGradient>
  <linearGradient id="labelfill" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%"   stop-color="#D9D8D4"/>
    <stop offset="28%"  stop-color="#FBFBFA"/>
    <stop offset="72%"  stop-color="#EDEDEB"/>
    <stop offset="100%" stop-color="#CFCECA"/>
  </linearGradient>
  <!-- soft contact shadow: blurred, wide falloff, no hard edge -->
  <filter id="soft" x="-60%" y="-160%" width="220%" height="420%">
    <feGaussianBlur stdDeviation="26"/>
  </filter>
  <filter id="softer" x="-60%" y="-160%" width="220%" height="420%">
    <feGaussianBlur stdDeviation="46"/>
  </filter>
  <filter id="tight" x="-60%" y="-260%" width="220%" height="620%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>
</defs>"""


def shadow_block(cx, bottom, half_w):
    """Blurred contact shadow: a wide diffuse pool plus a tighter core.
    Same treatment on every silhouette, just scaled to the container's width.
    """
    return f"""<ellipse cx="{cx}" cy="{bottom + 10}" rx="{half_w * 1.32:.0f}" ry="30"
         fill="#4C4A44" opacity="0.30" filter="url(#softer)"/>
<ellipse cx="{cx}" cy="{bottom + 2}" rx="{half_w * 0.94:.0f}" ry="16"
         fill="#232220" opacity="0.55" filter="url(#soft)"/>
<ellipse cx="{cx}" cy="{bottom - 2}" rx="{half_w * 0.88:.0f}" ry="9"
         fill="#141412" opacity="0.70" filter="url(#tight)"/>"""


def label_block(lab_left, lab_top, lab_w, lab_h, sub, flavour, swatch, descr, macro):
    """Wordmark + sub-label + flavour swatch + descriptor + lime macro line.
    Identical markup on every silhouette; only the band's box moves/resizes.
    """
    return f"""<rect x="{lab_left}" y="{lab_top}" width="{lab_w}" height="{lab_h}" fill="url(#labelfill)"/>
<rect x="{lab_left}" y="{lab_top}" width="{lab_w}" height="5" fill="{swatch or '#B9B7B2'}"/>

<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" text-anchor="middle" fill="#111">
  <text x="{CX}" y="{lab_top + 62}" font-size="46" font-weight="800"
        letter-spacing="1.5">KRACHT</text>
  <text x="{CX}" y="{lab_top + 92}" font-size="{15 if len(sub) < 18 else 13}" font-weight="600"
        letter-spacing="{4.5 if len(sub) < 18 else 2.6}" fill="#55534E">{esc(sub)}</text>
</g>
<circle cx="{lab_left + 34}" cy="{lab_top + 138}" r="13" fill="{swatch or '#F2F1EE'}" stroke="#9A9892" stroke-width="1"/>
<text x="{lab_left + 58}" y="{lab_top + 146}"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="{26 if len(flavour) < 17 else 22}" font-weight="700" fill="#111">{esc(flavour)}</text>
<line x1="{lab_left + 26}" y1="{lab_top + 172}" x2="{lab_left + lab_w - 26}" y2="{lab_top + 172}"
      stroke="#C3C1BC" stroke-width="1"/>
<text x="{CX}" y="{lab_top + 202}" text-anchor="middle"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="18" fill="#4A4844">{esc(descr)}</text>
<text x="{CX}" y="{lab_top + lab_h + 58}" text-anchor="middle"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="21" font-weight="700" letter-spacing="1" fill="{LIME}">{esc(macro)}</text>"""


def svg_cylinder(sub, flavour, swatch, macro, descr, width=460, body_h=560, lid_h=96,
                  bottom=858, lab_gap=205):
    """Tub / large tub / jar: all the same cylinder-with-screw-lid silhouette,
    just resized. A wide short one reads as a jar, a taller one as a bulk tub.
    """
    body_top = bottom - body_h
    lid_top = body_top - lid_h + 18  # lid overlaps the body shoulder
    left = CX - width / 2
    lab_top = body_top + lab_gap
    lab_h = 230
    lab_left = left + 8
    lab_w = width - 16

    knurl_n = int((width + 24) / 11)
    knurl = "".join(
        f'<line x1="{left - 12 + i * 11}" y1="{lid_top + 34}" x2="{left - 12 + i * 11}" y2="{lid_top + lid_h - 14}"/>'
        for i in range(1, knurl_n)
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
{DEFS}
<rect width="{W}" height="{H}" fill="url(#bg)"/>

{shadow_block(CX, bottom, width / 2)}

<!-- body -->
<path d="M {left} {body_top} h {width} v {body_h - 34} a 26 26 0 0 1 -26 26
         h {-(width - 52)} a 26 26 0 0 1 -26 -26 z" fill="url(#body)"/>
<!-- bottom rim highlight -->
<path d="M {left + 30} {bottom - 3} h {width - 60}" stroke="#4A4A46"
      stroke-width="2" opacity="0.5" fill="none"/>

<!-- lid -->
<rect x="{left - 12}" y="{lid_top}" width="{width + 24}" height="{lid_h}"
      rx="16" fill="url(#lid)"/>
<ellipse cx="{CX}" cy="{lid_top + 6}" rx="{width / 2 + 12}" ry="26" fill="#101010"/>
<ellipse cx="{CX}" cy="{lid_top + 4}" rx="{width / 2 - 6}" ry="19" fill="{LIME}"/>
<ellipse cx="{CX}" cy="{lid_top + 4}" rx="{width / 2 - 6}" ry="19"
         fill="none" stroke="#A9D22F" stroke-width="2"/>
<!-- lid knurling -->
<g stroke="#000" stroke-width="1.5" opacity="0.45">
  {knurl}
</g>

<!-- label -->
{label_block(lab_left, lab_top, lab_w, lab_h, sub, flavour, swatch, descr, macro)}
</svg>"""


def svg_pouch(sub, flavour, swatch, macro, descr, width=380, body_h=620, bottom=880):
    """Stand-up pouch: gusseted flat bottom, bulging sides, heat-sealed peaked
    top with a lime zip-strip in place of the tub's lid accent.
    """
    top = bottom - body_h
    seal_h = 46
    left = CX - width / 2
    right = CX + width / 2
    bulge = 26
    zip_y = top + 34
    lab_top = zip_y + 40
    lab_h = 225
    lab_left = left + 8
    lab_w = width - 16

    path = (
        f"M {left + 18} {top} "
        f"C {left - bulge} {top + 140} {left - bulge} {bottom - 160} {left + 16} {bottom - 30} "
        f"Q {left + 16} {bottom} {left + 40} {bottom} "
        f"H {right - 40} "
        f"Q {right - 16} {bottom} {right - 16} {bottom - 30} "
        f"C {right + bulge} {bottom - 160} {right + bulge} {top + 140} {right - 18} {top} "
        f"L {CX + 60} {top - seal_h + 6} "
        f"Q {CX} {top - seal_h - 4} {CX - 60} {top - seal_h + 6} "
        f"Z"
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
{DEFS}
<rect width="{W}" height="{H}" fill="url(#bg)"/>

{shadow_block(CX, bottom, width / 2)}

<!-- pouch body -->
<path d="{path}" fill="url(#body)"/>
<!-- shoulder crease -->
<path d="M {left + 24} {top + 6} Q {CX} {top - 10} {right - 24} {top + 6}"
      stroke="#3A3A38" stroke-width="1.5" opacity="0.5" fill="none"/>

<!-- zip-seal accent, the pouch's equivalent of the tub's lime lid -->
<rect x="{left + 22}" y="{zip_y}" width="{width - 44}" height="16" rx="8" fill="{LIME}"/>
<rect x="{left + 22}" y="{zip_y}" width="{width - 44}" height="16" rx="8"
      fill="none" stroke="#A9D22F" stroke-width="2"/>

<!-- label -->
{label_block(lab_left, lab_top, lab_w, lab_h, sub, flavour, swatch, descr, macro)}
</svg>"""


SHAPE_PARAMS = {
    "tub": dict(),
    "tub-large": dict(width=529, body_h=644, lid_h=110, lab_gap=205),
    "jar": dict(width=560, body_h=420, lid_h=130, lab_gap=40),
}


def render(name, sub, flavour, swatch, macro, descr):
    shape = shape_for(name)
    if shape == "pouch":
        return svg_pouch(sub, flavour, swatch, macro, descr), shape
    return svg_cylinder(sub, flavour, swatch, macro, descr, **SHAPE_PARAMS[shape]), shape


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for name, cat, sub, flavour, swatch, macro, descr in PRODUCTS:
        svg_str, shape = render(name, sub, flavour, swatch, macro, descr)
        png = cairosvg.svg2png(bytestring=svg_str.encode(), output_width=W, output_height=H)
        img = Image.open(io.BytesIO(png)).convert("RGB")
        img.save(os.path.join(OUT, f"{name}.jpg"), "JPEG", quality=78, optimize=True)
        manifest.append({
            "file": f"{name}.jpg",
            "alt": f"KRACHT {sub.title().replace('Hcl', 'HCl')} {ALT_KIND[cat]} {SHAPE_WORD[shape]}, "
                   + ("unflavoured" if flavour == "Unflavoured" else f"{flavour.lower()} flavour"),
            "category": cat,
            "dominant": "#121212",
        })
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"wrote {len(manifest)} packshots + manifest.json")


if __name__ == "__main__":
    main()
    # self-check: every declared product exists on disk and is a real JPEG,
    # and all three silhouettes actually got used (the point of this pass)
    shapes_seen = set()
    for name, *_ in PRODUCTS:
        p = os.path.join(OUT, f"{name}.jpg")
        assert os.path.getsize(p) > 5000, p
        assert Image.open(p).size == (W, H), p
        shapes_seen.add(shape_for(name))
    assert len(PRODUCTS) == 34 and len({p[0] for p in PRODUCTS}) == 34
    assert max(W, H) <= 1000
    assert shapes_seen == {"tub", "tub-large", "jar", "pouch"}, shapes_seen
    print("self-check ok:", shapes_seen)
