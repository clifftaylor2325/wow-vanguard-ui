"""Builds Vanguard's two font files from the upstream Fira Sans Condensed.

Run by hand when updating the font (needs Python 3 and fonttools):

    pip install fonttools
    python3 scripts/fonts/make-fonts.py <folder with the upstream .ttf files>

Upstream: https://github.com/google/fonts/tree/main/ofl/firasanscondensed
(SIL Open Font License 1.1, no Reserved Font Name; the license ships
next to the fonts as Media/Fonts/OFL.txt).

Two changes, both allowed by the OFL:
  * the digits 0-9 point at the font's tabular figures, because WoW can't
    turn on OpenType features and numbers on bars must not jitter;
  * glyphs are limited to Latin, Greek, Cyrillic and common punctuation
    (Korean and Chinese clients use the game's own font).
"""

import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

WEIGHTS = ["Medium", "SemiBold"]
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "Media", "Fonts")
TABULAR = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
RANGES = [
    (0x0020, 0x007E), (0x00A0, 0x024F), (0x0370, 0x03FF), (0x0400, 0x04FF),
    (0x2000, 0x206F), (0x20AC, 0x20AC), (0x2122, 0x2122), (0x2190, 0x2193), (0x2212, 0x2212),
]


def unicodes():
    """Every code point the addon keeps."""
    return [c for lo, hi in RANGES for c in range(lo, hi + 1)]


def tabular_digits(font):
    """Points the digit code points at the tabular figure glyphs."""
    for table in font["cmap"].tables:
        if table.isUnicode():
            for i, name in enumerate(TABULAR):
                if 0x30 + i in table.cmap:
                    table.cmap[0x30 + i] = name + ".tf"


def build(src_dir, weight):
    """Writes one weight to Media/Fonts."""
    font = TTFont(os.path.join(src_dir, f"FiraSansCondensed-{weight}.ttf"))
    tabular_digits(font)
    options = subset.Options()
    options.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
    options.name_IDs = ["*"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes())
    subsetter.subset(font)
    font.save(os.path.join(OUT, f"FiraSansCondensed-{weight}.ttf"))


if __name__ == "__main__":
    for w in WEIGHTS:
        build(sys.argv[1], w)
