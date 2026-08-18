#!/usr/bin/env python3
"""Generate the 34 KRACHT packshots as SVG -> JPEG.

Original artwork, not photography: a matte-black tub with a lime lid accent,
KRACHT wordmark, flavour swatch and macro line, on neutral studio grey.
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

# --- tub geometry (scaled up from the first pass; was ~300x420, now ~460x650) --
TUB_W = 460
LID_H = 96
BODY_H = 560
CX = W / 2
BOTTOM = 858
BODY_TOP = BOTTOM - BODY_H
LID_TOP = BODY_TOP - LID_H + 18  # lid overlaps the body shoulder
LEFT = CX - TUB_W / 2

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


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg(sub, flavour, swatch, macro, descr):
    # Label band, sized off the body.
    lab_top = BODY_TOP + 205
    lab_h = 230
    lab_left = LEFT + 8
    lab_w = TUB_W - 16
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
  <radialGradient id="bg" cx="50%" cy="42%" r="72%">
    <stop offset="0%" stop-color="#F2F1EE"/><stop offset="100%" stop-color="#DCDAD5"/>
  </radialGradient>
  <!-- cylinder shading: dark edges, a soft specular band left of centre -->
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
</defs>

<rect width="{W}" height="{H}" fill="url(#bg)"/>

<!-- contact shadow: a wide diffuse pool plus a tighter core, both blurred -->
<ellipse cx="{CX}" cy="{BOTTOM + 10}" rx="{TUB_W * 0.66:.0f}" ry="30"
         fill="#4C4A44" opacity="0.30" filter="url(#softer)"/>
<ellipse cx="{CX}" cy="{BOTTOM + 2}" rx="{TUB_W * 0.47:.0f}" ry="16"
         fill="#232220" opacity="0.55" filter="url(#soft)"/>
<ellipse cx="{CX}" cy="{BOTTOM - 2}" rx="{TUB_W * 0.44:.0f}" ry="9"
         fill="#141412" opacity="0.70" filter="url(#tight)"/>

<!-- body -->
<path d="M {LEFT} {BODY_TOP} h {TUB_W} v {BODY_H - 34} a 26 26 0 0 1 -26 26
         h {-(TUB_W - 52)} a 26 26 0 0 1 -26 -26 z" fill="url(#body)"/>
<!-- bottom rim highlight -->
<path d="M {LEFT + 30} {BOTTOM - 3} h {TUB_W - 60}" stroke="#4A4A46"
      stroke-width="2" opacity="0.5" fill="none"/>

<!-- lid -->
<rect x="{LEFT - 12}" y="{LID_TOP}" width="{TUB_W + 24}" height="{LID_H}"
      rx="16" fill="url(#lid)"/>
<ellipse cx="{CX}" cy="{LID_TOP + 6}" rx="{TUB_W / 2 + 12}" ry="26" fill="#101010"/>
<ellipse cx="{CX}" cy="{LID_TOP + 4}" rx="{TUB_W / 2 - 6}" ry="19" fill="{LIME}"/>
<ellipse cx="{CX}" cy="{LID_TOP + 4}" rx="{TUB_W / 2 - 6}" ry="19"
         fill="none" stroke="#A9D22F" stroke-width="2"/>
<!-- lid knurling -->
<g stroke="#000" stroke-width="1.5" opacity="0.45">
  {''.join(f'<line x1="{LEFT - 12 + i * 11}" y1="{LID_TOP + 34}" x2="{LEFT - 12 + i * 11}" y2="{LID_TOP + LID_H - 14}"/>' for i in range(1, int((TUB_W + 24) / 11)))}
</g>

<!-- label -->
<rect x="{lab_left}" y="{lab_top}" width="{lab_w}" height="{lab_h}" fill="url(#labelfill)"/>
<rect x="{lab_left}" y="{lab_top}" width="{lab_w}" height="5" fill="{swatch or "#B9B7B2"}"/>

<g font-family="Helvetica Neue, Helvetica, Arial, sans-serif" text-anchor="middle" fill="#111">
  <text x="{CX}" y="{lab_top + 62}" font-size="46" font-weight="800"
        letter-spacing="1.5">KRACHT</text>
  <text x="{CX}" y="{lab_top + 92}" font-size="{15 if len(sub) < 18 else 13}" font-weight="600"
        letter-spacing="{4.5 if len(sub) < 18 else 2.6}" fill="#55534E">{esc(sub)}</text>
</g>
<circle cx="{lab_left + 34}" cy="{lab_top + 138}" r="13" fill="{swatch or "#F2F1EE"}" stroke="#9A9892" stroke-width="1"/>
<text x="{lab_left + 58}" y="{lab_top + 146}"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="{26 if len(flavour) < 17 else 22}" font-weight="700" fill="#111">{esc(flavour)}</text>
<line x1="{lab_left + 26}" y1="{lab_top + 172}" x2="{lab_left + lab_w - 26}" y2="{lab_top + 172}"
      stroke="#C3C1BC" stroke-width="1"/>
<text x="{CX}" y="{lab_top + 202}" text-anchor="middle"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="18" fill="#4A4844">{esc(descr)}</text>

<!-- lime macro strip + size line, printed on the black body below the label -->
<text x="{CX}" y="{lab_top + lab_h + 58}" text-anchor="middle"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="21" font-weight="700" letter-spacing="1" fill="{LIME}">{esc(macro)}</text>
</svg>"""


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for name, cat, sub, flavour, swatch, macro, descr in PRODUCTS:
        png = cairosvg.svg2png(
            bytestring=svg(sub, flavour, swatch, macro, descr).encode(),
            output_width=W, output_height=H,
        )
        img = Image.open(io.BytesIO(png)).convert("RGB")
        img.save(os.path.join(OUT, f"{name}.jpg"), "JPEG", quality=78, optimize=True)
        manifest.append({
            "file": f"{name}.jpg",
            "alt": f"KRACHT {sub.title().replace('Hcl', 'HCl')} {ALT_KIND[cat]} tub, "
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
    # self-check: every declared product exists on disk and is a real JPEG
    for name, *_ in PRODUCTS:
        p = os.path.join(OUT, f"{name}.jpg")
        assert os.path.getsize(p) > 5000, p
        assert Image.open(p).size == (W, H), p
    assert len(PRODUCTS) == 34 and len({p[0] for p in PRODUCTS}) == 34
    assert max(W, H) <= 1000
    print("self-check ok")
