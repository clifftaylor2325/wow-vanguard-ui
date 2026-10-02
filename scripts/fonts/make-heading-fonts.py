"""Builds the faction look's heading fonts from art/fonts (run by hand when
updating them; needs Python 3 and fonttools):

    python3 scripts/fonts/make-heading-fonts.py

  * Cinzel (Alliance): the variable font pinned to SemiBold (600) and
    limited to the glyphs ForeverUI keeps, as Media/Fonts/Cinzel-SemiBold.ttf.
    Cinzel has no Reserved Font Name, so a changed copy may keep its name.
  * Metamorphous (Horde): copied unchanged, because its license reserves the
    name "Metamorphous" for unmodified copies.

Both licenses (SIL OFL 1.1) ship beside them in Media/Fonts.
"""

import os
import shutil

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(__file__)
SRC = os.path.join(HERE, "..", "..", "art", "fonts")
OUT = os.path.join(HERE, "..", "..", "Media", "Fonts")
RANGES = [(0x0020, 0x007E), (0x00A0, 0x024F), (0x2000, 0x206F), (0x20AC, 0x20AC), (0x2122, 0x2122)]


def cinzel():
    """Cinzel pinned to SemiBold and subset."""
    font = instancer.instantiateVariableFont(TTFont(os.path.join(SRC, "Cinzel[wght].ttf")), {"wght": 600})
    options = subset.Options()
    options.layout_features = ["*"]
    sub = subset.Subsetter(options)
    sub.populate(unicodes=[c for lo, hi in RANGES for c in range(lo, hi + 1)])
    sub.subset(font)
    font.save(os.path.join(OUT, "Cinzel-SemiBold.ttf"))


def main():
    """Writes both fonts and their licenses."""
    cinzel()
    shutil.copyfile(os.path.join(SRC, "Metamorphous-Regular.ttf"), os.path.join(OUT, "Metamorphous-Regular.ttf"))
    for name in ("OFL-Cinzel.txt", "OFL-Metamorphous.txt"):
        shutil.copyfile(os.path.join(SRC, name), os.path.join(OUT, name))


if __name__ == "__main__":
    main()
