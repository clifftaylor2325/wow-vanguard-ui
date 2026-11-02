// TEST-ONLY: a corner bracket drawn in the toned kind (docs/handoff/leonardo-art-plan.md §3.7 step 8,
// §4.2), for the media tests and the tint sheet. It is not in MEDIA and never written to Media/.

import { TONES, bleed, box, draw, image } from "../lib/media-art.mjs";

// A grey of one tone as RGB.
const grey = (v) => [v, v, v];

// The bracket on a 16-unit grid, top left, inside a clear one-unit border: an outline,
// two bars 2 units wide, and from the 2 x bake up a lit top and left edge and a recess line.
const LAYERS = [
  { tone: "outline", shapes: [box(1, 1, 5, 15), box(1, 1, 15, 5)] },
  { tone: "base", shapes: [box(2, 2, 4, 14), box(2, 2, 14, 4)] },
  { tone: "lit", from: 32, shapes: [box(2, 2, 2.5, 14), box(2, 2, 14, 2.5)] },
  { tone: "recess", from: 32, shapes: [box(3.5, 3.5, 4, 14), box(3.5, 3.5, 14, 4)] },
];

// The bracket baked at size texels (16 or 32), its clear pixels bled to the outline tone.
export function tonedBracket(size) {
  const img = image(size, size);
  for (const layer of LAYERS) if (size >= (layer.from || 0)) draw(img, 16, layer.shapes, grey(TONES[layer.tone]));
  return bleed(img, grey(TONES.outline));
}
