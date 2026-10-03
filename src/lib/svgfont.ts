// Parser for single-line ("stroke") SVG fonts such as the EMS / Hershey fonts.
// Each glyph becomes a list of open polylines in font units (y-up, baseline = 0).

export type Pt = [number, number];
export type Polyline = Pt[];

export type Glyph = {
  adv: number;
  strokes: Polyline[];
};

export type SvgFont = {
  name: string;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  capHeight: number;
  xHeight: number;
  defaultAdv: number;
  glyphs: Map<string, Glyph>;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e] ?? m;
  });

const attrs = (tag: string) => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};

// Flattens a cubic Bézier into points (excluding the start point).
const flattenCubic = (p0: Pt, c1: Pt, c2: Pt, p1: Pt, steps = 10): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
  return pts;
};

// Supports the commands found in stroke fonts: M, L, C, Z (absolute and relative).
export const parsePathToPolylines = (d: string): Polyline[] => {
  const tokens = d.match(/[MLCZHVmlczhv]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const lines: Polyline[] = [];
  let cur: Polyline | null = null;
  let cmd = "";
  let pos: Pt = [0, 0];
  let i = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-z]/i.test(t)) {
      cmd = t;
      i++;
      if (cmd === "Z" || cmd === "z") {
        if (cur && cur.length > 1) cur.push([cur[0][0], cur[0][1]]);
        if (cur) pos = [...cur[0]] as Pt;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? pos[0] : 0;
    const oy = rel ? pos[1] : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        pos = [ox + num(), oy + num()];
        cur = [pos];
        lines.push(cur);
        cmd = rel ? "l" : "L"; // implicit lineto after moveto
        break;
      }
      case "L": {
        pos = [ox + num(), oy + num()];
        if (!cur) {
          cur = [pos];
          lines.push(cur);
        } else cur.push(pos);
        break;
      }
      case "H": {
        pos = [(rel ? pos[0] : 0) + num(), pos[1]];
        cur?.push(pos);
        break;
      }
      case "V": {
        pos = [pos[0], (rel ? pos[1] : 0) + num()];
        cur?.push(pos);
        break;
      }
      case "C": {
        const c1: Pt = [ox + num(), oy + num()];
        const c2: Pt = [ox + num(), oy + num()];
        const p1: Pt = [ox + num(), oy + num()];
        const pts = flattenCubic(pos, c1, c2, p1);
        if (!cur) {
          cur = [pos];
          lines.push(cur);
        }
        cur.push(...pts);
        pos = p1;
        break;
      }
      default:
        i++; // unknown token, skip
    }
  }
  return lines.filter((l) => l.length > 1);
};

export const parseSvgFont = (text: string, fallbackName = "font"): SvgFont => {
  const fontTag = text.match(/<font\b[^>]*>/)?.[0] ?? "";
  const faceTag = text.match(/<font-face\b[^>]*>/)?.[0] ?? "";
  const fa = attrs(fontTag);
  const fc = attrs(faceTag);
  const unitsPerEm = parseFloat(fc["units-per-em"] ?? "1000");
  const font: SvgFont = {
    name: fc["font-family"] ?? fa.id ?? fallbackName,
    unitsPerEm,
    ascent: parseFloat(fc.ascent ?? String(unitsPerEm * 0.8)),
    descent: parseFloat(fc.descent ?? String(-unitsPerEm * 0.2)),
    capHeight: parseFloat(fc["cap-height"] ?? String(unitsPerEm * 0.6)),
    xHeight: parseFloat(fc["x-height"] ?? String(unitsPerEm * 0.4)),
    defaultAdv: parseFloat(fa["horiz-adv-x"] ?? String(unitsPerEm * 0.5)),
    glyphs: new Map(),
  };
  for (const m of text.matchAll(/<glyph\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.unicode === undefined) continue;
    const ch = decodeEntities(a.unicode);
    font.glyphs.set(ch, {
      adv: parseFloat(a["horiz-adv-x"] ?? String(font.defaultAdv)),
      strokes: a.d ? parsePathToPolylines(a.d) : [],
    });
  }
  return font;
};
