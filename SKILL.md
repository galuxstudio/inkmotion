---
name: inkmotion
description: Handwriting and hand-drawn motion graphics, After Effects style, rendered from a JSON spec with Remotion. Text that writes itself stroke by stroke with real single-line pen fonts (exact spelling, accents, ñ, ¿¡), neon/glow signs with a glowing pen tip, hand-drawn doodles (underline, circle, arrow, check, star, heart, marker highlight, scribble), SVG line art and logos that draw themselves then fill in, kinetic titles (rise, pop, blur, typewriter, wipe), and exits (fade, erase in reverse, wipe). Renders a finished MP4, an MP4 over your own footage, or a transparent ProRes 4444 overlay for Premiere, After Effects, DaVinci or ffmpeg. Use when the user asks for "handwriting animation", "text that writes itself", "write-on / draw-on effect", "animated signature", "whiteboard / doodle animation", "annotate my video with arrows and circles", "neon sign text", "After Effects-style titles", "animate this line drawing/logo", or in Spanish "animación de escritura a mano", "texto que se escribe solo", "letras a mano", "efecto lettering", "subrayado/círculo/flecha dibujados". Not for generative video, and not for changing the footage itself (cuts, color): pair it with a video editing skill for that.
---

# InkMotion: handwriting and hand-drawn motion graphics

You describe the animation as a JSON **spec**. InkMotion lays out the text with real pen
(single-line) fonts, times every stroke, and renders it with Remotion. The strokes are vector
paths drawn with `stroke-dashoffset`, so the spelling is always exact. That is something
generative video models cannot guarantee.

Skill directory: the folder containing this file (written as `$SKILL` below).

## 0. First run

```bash
cd "$SKILL" && npm install          # Node 18+; ffmpeg must be on PATH for --sheet and video backgrounds
```

Check the install with `node scripts/render.mjs examples/hello.json out/hello.mp4 --sheet`.

## 1. Workflow (follow it every time)

1. **Brief.** Settle the exact text, frame size (default 1080×1920; 1920×1080 for landscape),
   style (font, colours, neon or ink), background (colour, image, the user's footage, or a
   transparent overlay) and any timing constraint, such as syncing to a voiceover.
   Text the user dictates goes in verbatim, accents included.
2. **Write the spec** in the user's project folder (e.g. `<project>/inkmotion/scene.json`),
   never inside `$SKILL`. Relative asset paths resolve from the spec's folder.
3. **Check the timing:** `node "$SKILL/scripts/render.mjs" scene.json out.mp4 --timeline`
   prints when every layer starts, finishes and exits. Adjust `speed`, `duration` and `start`
   until it matches the brief or the voiceover.
4. **Look before rendering it all:** `--still=end` (last frame) and `--still=<sec>` mid-write.
   Open the PNGs. Check that nothing runs off the frame, that doodles sit where they should
   (underline under the words, circle around the target), and that the text reads.
5. **Render** with `--sheet` and inspect `<out>_sheet.jpg`, a 6×2 contact sheet across the
   whole clip. Fix and re-render before showing the user.
6. **Deliver.** Use `--alpha` for a transparent `.mov` when the user edits in Premiere, After
   Effects or DaVinci, or when you composite with ffmpeg yourself (recipe below).

```bash
node "$SKILL/scripts/render.mjs" <spec.json> <out.mp4|out.mov|out.png> [--alpha] [--still=SEC|end] [--sheet] [--timeline] [--crf=18]
```

## 2. Spec reference

```jsonc
{
  "width": 1080, "height": 1920, "fps": 30,
  "duration": 8,            // optional. Default: last exit/entrance + "tail". A video background sets it to the video length.
  "tail": 1.0,              // seconds held after the last animation
  "background": { "type": "color", "color": "#f4efe6" },
  //   { "type": "video", "src": "clip.mp4", "startFrom": 2.5, "volume": 1, "fit": "cover" }
  //   { "type": "image", "src": "photo.jpg" }      { "type": "transparent" }
  "audio": [{ "src": "voice.mp3", "volume": 1, "startFrom": 0 }],
  "layers": [ /* drawn in order; later layers on top */ ]
}
```

**Units.** Positions and sizes take pixels (`540`) or a percentage of the frame (`"50%"`).
`x`/`y` is the **centre** of the layer (for `write`/`text` it is the anchor of the chosen `align`).

**Timing: `start`.**
- `0.4`: absolute seconds.
- Omitted: starts when the previous layer finishes its entrance.
- `"+0.3"` / `"-0.5"`: 0.3 s after, or 0.5 s overlapping, the previous layer's entrance end.
- `"@title+0.2"`: 0.2 s after layer `id: "title"` finishes. `"@title.start+1"` counts from its start.

**Exits** (any layer): `"exit": { "type": "fade" | "erase" | "wipe", "at": 6.0 }`. Use `"after": 1.5`
(seconds after the entrance ends) instead of `at` if you prefer. `"duration"` and `"ease"` are
optional. `erase` plays the writing backwards. `wipe` sweeps it away left to right.

### `write`: handwriting

| key | default | notes |
|---|---|---|
| `text` | required | `\n` for line breaks. Accents, ñ, ¿ ¡, € and most Latin-1 are supported |
| `font` | `allure` | see the font table, or a path to any single-line SVG font |
| `size` | 160 | em size in px |
| `color`, `strokeWidth` | `#141414`, 4.5% of size | the pen |
| `align` / `valign` | `center` / `middle` | `left`, `right` · `top`, `baseline` |
| `maxWidth` | none | wraps words |
| `fit` | `"88%"` | shrinks the size if a line would be wider; `false` disables |
| `speed` | 12 | ems of ink per second. Raise for fast scribbles, lower (5–7) for slow, elegant script |
| `duration` | none | forces the total writing time (overrides `speed`); use it to sync to audio |
| `penLift`, `wordPause` | 0.03, 0.1 | pauses between strokes and between words |
| `slant`, `jitter`, `seed` | 0, 0.25, auto | lean in degrees; organic per-letter wobble (0 = mechanical) |
| `glow` | none | `{ "color", "radius": 12, "strength": 2 }`: neon |
| `shadow` | none | `{ "color", "blur", "dx", "dy" }`: legibility over footage |
| `penTip` | none | `true` or `{ "color", "radius", "glow" }`: a glowing dot that leads the stroke |
| `strokeEase` | `inOutSine` | per-stroke acceleration |
| `rotate`, `opacity`, `blend` | | `blend` is any CSS mix-blend-mode |

Fonts (all single-stroke, SIL OFL or Hershey licence; see NOTICE.md):

| key | look |
|---|---|
| `allure` | elegant connected cursive (wedding, premium, signature) |
| `felix` | calligraphic italic, chunky and friendly |
| `elfin` | playful hand lettering (kids, holidays) |
| `readability` / `readability-italic` | clean monoline print, best for longer lines and small sizes |
| `hershey-script` / `hershey-script-med` | classic connected script; `-med` is a double stroke, bolder |

Size guide for 1080 px wide: titles 150–230, subtitles 60–90. Monoline print reads well down
to ~50 px; cursive needs ~90 px or more.

### `doodle`: hand-drawn marks

`shape`: `underline`, `double-underline`, `circle`, `box`, `arrow`, `check`, `cross`, `star`,
`heart`, `sparkle`, `highlight`, `scribble`, `path`.
Keys: `x`, `y`, `w`, `h` (centre and size), `color`, `strokeWidth` (8), `roughness` (0.5),
`seed`, `duration`, plus `glow`/`shadow`/`penTip`/`exit`.
- `arrow`: `from: [x, y]`, `to: [x, y]`, `bend` (-1..1, default 0.25).
- `highlight` is a marker swipe: yellow, `multiply` blend, stroke as tall as `h`. Put it
  **before** the text layer it highlights so it sits underneath.
- `path`: `points: [[x, y], ...]`, drawn through the points.

### `svg`: draw any line art, icon or logo

`src` (.svg), `x`, `y`, `w` (the height follows the viewBox), `duration` (2.5), `order`
(`document` | `left-to-right` | `top-to-bottom`), `color` (outline colour; default is the SVG's
own), `strokeWidth` (px), `fill` (`keep` fades the original fills in after each outline;
`none` leaves outlines only), `fillDuration` (0.5). This is the "Trim Paths + fill" effect.
Nested scale transforms inside the SVG are only roughly supported; flat SVGs, such as those
made by `vectorize.py`, work best.

### `text`: kinetic typography (regular fonts)

`text`, `fontFamily` (`Poppins` · `Anton` · `Caveat` · `Bebas Neue` · `Montserrat` ·
`Playfair Display`, fetched from Google Fonts at render time) or `fontFile` (local .ttf/.otf/.woff2),
`weight` (700), `size` (96), `color`, `align`, `maxWidth`, `lineHeight`, `letterSpacing` (em),
`uppercase`, `animation` (`rise` · `pop` · `fade` · `blur` · `typewriter` · `wipe` · `none`),
`by` (`char` · `word` · `line` · `all`), `stagger`, `duration` (per unit), `ease`, `rise` (px),
`shadow`, `glow`, `stroke` (`{color,width}`), `background` (`{color,padding,radius}`, a label box).

### `image`: stickers and cut-outs

`src`, `x`, `y`, `w`, `animation` (`pop` · `rise` · `fade` · `wipe`), `duration`, `float`
(idle bob in px), `rotate`.

**Easing names** (AE-style): `linear`, `inSine`, `outSine`, `inOutSine`, `inQuad`, `outQuad`,
`inOutQuad`, `outCubic`, `inOutCubic`, `outExpo`, `inOutExpo`, `outBack`, `outElastic`, `outBounce`.

## 3. Recipes

**Neon sign.** Dark background, `font: "hershey-script"` or `"allure"`, saturated `color`,
`glow: {color: same, radius: 16, strength: 3}`, `penTip: {color: "#fff"}`. Finish with an
`erase` exit. See `examples/neon.json`.

**Annotate footage.** Use a `video` background. Add `write` captions with a `shadow`, a `circle`
around the product, and an `arrow` pointing at it. Take stills at the moments the doodles appear
and check that they land on the subject. If the subject moves, set the doodles' times so they
appear while it holds still, and give them an `exit` before it moves.

**Sync to a voiceover.** Get word timestamps first, from a transcript with word times or from
forced alignment (e.g. ElevenLabs `POST /v1/forced-alignment`). Then give each phrase
`start: <first word time>` and `duration: <last word end - start>`. Put the voice in `audio` and
confirm with `--timeline`.

**Overlay for an editor.** Render with `--alpha` to get ProRes 4444 with transparency. Drop it on
a track above the footage in Premiere, After Effects or DaVinci.

**Composite with ffmpeg yourself:**
```bash
ffmpeg -i footage.mp4 -i overlay.mov -filter_complex "[0:v][1:v]overlay=0:0:format=auto[v]" \
  -map "[v]" -map 0:a? -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy out.mp4
```

**AI-made illustrations that draw themselves.** Generate line art with any image model
(Higgsfield, Nano Banana, GPT Image, Midjourney…). Prompt for *"black ink line drawing on a
plain white background, single uniform line weight, no shading, no colour fill, no texture"*.
Then vectorise it and use it as an `svg` layer:
```bash
uv run --python 3.12 --with vtracer --with pillow python "$SKILL/scripts/vectorize.py" art.png art.svg
```
(`vtracer` crashes on Python 3.14, hence the 3.12 pin.) Each line becomes a thin filled shape.
InkMotion traces its outline and then fills it, which reads as the drawing being inked.

**Text plus generative video.** Do not ask a video model to write words; it misspells them.
Generate the shot without text, then write the text on top with InkMotion.

## 4. Gotchas

- Characters missing from a font render as a blank space. If a symbol vanishes, switch to
  `readability`, which has the widest coverage.
- `fit` keeps lines inside the frame by shrinking them. If the text comes out smaller than
  you planned, add `\n` breaks or a `maxWidth` instead.
- A `glow` with high `strength` stacks several drop-shadows and slows rendering. 2–3 is enough.
- Doodle positions are absolute. Changing the text's `size`, font or `x`/`y` means moving
  its underline or circle too. Always re-check with `--still`.
- Video backgrounds keep their audio (`volume`, default 1). Set `"volume": 0` to mute.
- `--alpha` replaces the background with transparency, even if the spec sets one.
- Remotion caches the bundle. After editing files under `src/`, the next render rebuilds it.

## 5. Licences (tell the user if they ask about commercial use)

The InkMotion code is MIT. The fonts are SIL OFL 1.1 (EMS fonts) and the Hershey font licence;
see NOTICE.md. Rendering uses **Remotion**, which is free (commercial use included) for
individuals, non-profits and for-profit companies with up to 3 employees. Bigger companies need
a Remotion company licence: https://remotion.dev/license.
