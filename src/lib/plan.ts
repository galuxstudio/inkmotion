// Turns a Spec into a Plan: every stroke gets its path, length and exact
// start/end time. Runs once (in calculateMetadata), so frames render fast and
// the composition duration can follow the content.
import { staticFile } from "remotion";
import { getLength, getBoundingBox } from "@remotion/paths";
import { parseSvgFont, type SvgFont, type Pt, type Polyline } from "./svgfont";
import { smoothPath, rng, hashString } from "./geom";
import { makeDoodle } from "./doodles";
import type {
  Spec,
  Layer,
  Len,
  Plan,
  StrokePlan,
  ElementPlan,
  PlannedStroke,
  PlannedExit,
  WriteLayer,
  DoodleLayer,
  SvgLayer,
  TextLayer,
  ImageLayer,
  Exit,
} from "./types";

export const FONTS: Record<string, { file: string; label: string }> = {
  allure: { file: "EMSAllure.svg", label: "Elegant cursive script (from Allura)" },
  felix: { file: "EMSFelix.svg", label: "Calligraphic italic (from Felipa)" },
  elfin: { file: "EMSElfin.svg", label: "Playful hand lettering (from Mountains of Christmas)" },
  readability: { file: "EMSReadability.svg", label: "Clean monoline print (from Source Sans)" },
  "readability-italic": { file: "EMSReadabilityItalic.svg", label: "Clean monoline italic" },
  "hershey-script": { file: "HersheyScript1.svg", label: "Classic connected script, single stroke" },
  "hershey-script-med": { file: "HersheyScriptMed.svg", label: "Classic connected script, double stroke" },
};

export const assetUrl = (src: string) => (/^(https?:|data:|blob:)/.test(src) ? src : staticFile(src.replace(/^\/+/, "")));

const fontCache = new Map<string, Promise<SvgFont>>();
const loadFont = (key: string) => {
  const url = FONTS[key] ? staticFile(`fonts/${FONTS[key].file}`) : assetUrl(key);
  if (!fontCache.has(url)) {
    fontCache.set(
      url,
      fetch(url).then(async (r) => {
        if (!r.ok) throw new Error(`InkMotion: cannot load font "${key}" (${r.status}). Known fonts: ${Object.keys(FONTS).join(", ")}`);
        return parseSvgFont(await r.text(), key);
      }),
    );
  }
  return fontCache.get(url)!;
};

const len = (v: Len | undefined, ref: number, fallback: number) => {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  return s.endsWith("%") ? (parseFloat(s) / 100) * ref : parseFloat(s);
};

type Clock = { prevStart: number; prevEnd: number; ids: Map<string, { start: number; end: number }> };

const resolveStart = (s: Layer["start"], clock: Clock): number => {
  if (s === undefined) return clock.prevEnd;
  if (typeof s === "number") return s;
  const str = String(s).replace(/\s+/g, "");
  const ref = str.match(/^@([\w-]+)(\.start|\.end)?([+-][\d.]+)?$/);
  if (ref) {
    const target = clock.ids.get(ref[1]);
    if (!target) throw new Error(`InkMotion: start "${s}" references unknown layer id "${ref[1]}"`);
    return (ref[2] === ".start" ? target.start : target.end) + parseFloat(ref[3] ?? "0");
  }
  if (/^[+-][\d.]+$/.test(str)) return clock.prevEnd + parseFloat(str);
  const n = parseFloat(str);
  if (Number.isNaN(n)) throw new Error(`InkMotion: cannot parse start "${s}"`);
  return n;
};

const planExit = (exit: Exit | undefined, end: number, defaults: Record<string, number>): PlannedExit | undefined => {
  if (!exit || exit.type === "none") return undefined;
  const t0 = exit.at ?? end + (exit.after ?? 1);
  return { type: exit.type, t0, t1: t0 + (exit.duration ?? defaults[exit.type] ?? 0.5), ease: exit.ease };
};

const EXIT_DEFAULTS = { fade: 0.4, erase: 0.7, wipe: 0.5 };

const bboxOf = (polys: Polyline[]): [number, number, number, number] => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of polys)
    for (const [x, y] of p) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 0, 0];
};

const penTipOf = (p: WriteLayer["penTip"], color: string) =>
  p ? { color: color, radius: 6, glow: 14, ...(typeof p === "object" ? p : {}) } : undefined;

// ---------------------------------------------------------------- write ----

type InkStroke = { pts: Polyline; word: number; line: number };

const layoutText = (layer: WriteLayer, font: SvgFont, W: number, H: number) => {
  let size = layer.size ?? 160;
  let k = size / font.unitsPerEm;
  const ls = (layer.letterSpacing ?? 0) * font.unitsPerEm;
  const slant = Math.tan(((layer.slant ?? 0) * Math.PI) / 180);
  const jitter = layer.jitter ?? 0.25;
  const rand = rng(layer.seed ?? hashString(layer.text));
  const adv = (ch: string) => (font.glyphs.get(ch)?.adv ?? font.defaultAdv) + ls;
  const wordW = (w: string) => [...w].reduce((s, c) => s + adv(c), 0);

  // word wrap (in font units)
  const maxW = layer.maxWidth !== undefined ? len(layer.maxWidth, W, Infinity) / k : Infinity;
  const lines: string[] = [];
  for (const para of layer.text.split("\n")) {
    let cur = "";
    for (const word of para.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && wordW(next) > maxW) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
  }

  // auto-fit: never let a line run off the frame
  if (layer.fit !== false) {
    const fitPx = len(layer.fit ?? "88%", W, W * 0.88);
    const widest = Math.max(...lines.map((ln) => (wordW(ln) - ls) * k));
    if (widest > fitPx) {
      size *= fitPx / widest;
      k = size / font.unitsPerEm;
    }
  }
  const lineH = (layer.lineHeight ?? 1.25) * size;
  const capPx = font.capHeight * k;
  const x = len(layer.x, W, W / 2);
  const y = len(layer.y, H, H / 2);
  const blockH = capPx + (lines.length - 1) * lineH;
  const valign = layer.valign ?? "middle";
  const base0 = valign === "baseline" ? y : valign === "top" ? y + capPx : y - blockH / 2 + capPx;
  const align = layer.align ?? "center";

  const strokes: InkStroke[] = [];
  let word = 0;
  lines.forEach((ln, li) => {
    const lw = (wordW(ln) - ls) * k;
    let penX = align === "left" ? x : align === "right" ? x - lw : x - lw / 2;
    const baseY = base0 + li * lineH;
    for (const ch of ln) {
      if (ch === " ") {
        word++;
        penX += adv(ch) * k;
        continue;
      }
      const g = font.glyphs.get(ch);
      if (!g) {
        penX += adv(ch) * k;
        continue;
      }
      // organic per-letter variation
      const rot = (rand() * 2 - 1) * 4 * jitter * (Math.PI / 180);
      const dy = (rand() * 2 - 1) * 0.03 * jitter * font.unitsPerEm;
      const sc = 1 + (rand() * 2 - 1) * 0.04 * jitter;
      const gcx = g.adv / 2;
      const gcy = font.xHeight / 2;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      for (const poly of g.strokes) {
        const pts: Polyline = poly.map(([gx, gy]) => {
          let ux = (gx - gcx) * sc;
          let uy = (gy - gcy) * sc;
          const rx = ux * cos - uy * sin + gcx;
          const ry = ux * sin + uy * cos + gcy + dy;
          ux = rx + ry * slant;
          uy = ry;
          return [penX + ux * k, baseY - uy * k] as Pt;
        });
        strokes.push({ pts, word, line: li });
      }
      penX += adv(ch) * k;
    }
    word++;
  });
  return { strokes, size, x, y };
};

const planWrite = async (layer: WriteLayer, index: number, start: number, W: number, H: number): Promise<StrokePlan> => {
  const font = await loadFont(layer.font ?? "allure");
  const { strokes, size, x, y } = layoutText(layer, font, W, H);
  const color = layer.color ?? "#141414";
  const width = layer.strokeWidth ?? Math.max(2, size * 0.045);
  const speedPx = (layer.speed ?? 12) * size;
  const penLift = layer.penLift ?? 0.03;
  const wordPause = layer.wordPause ?? 0.1;
  const joinDist = size * 0.07;

  const items = strokes.map((s) => {
    const d = smoothPath(s.pts);
    return { ...s, d, len: d ? getLength(d) : 0 };
  });
  // natural timings: writing time + pauses (no pause when strokes connect)
  const segs: { gap: number; dur: number }[] = [];
  let natural = 0;
  items.forEach((it, i) => {
    let gap = 0;
    if (i > 0) {
      const prev = items[i - 1];
      const a = prev.pts[prev.pts.length - 1];
      const b = it.pts[0];
      const connected = Math.hypot(b[0] - a[0], b[1] - a[1]) < joinDist && prev.word === it.word;
      gap = connected ? 0 : penLift;
      if (it.word !== prev.word) gap += wordPause;
      if (it.line !== prev.line) gap += wordPause;
    }
    const dur = Math.max(0.03, it.len / speedPx);
    segs.push({ gap, dur });
    natural += gap + dur;
  });
  const scale = layer.duration && natural > 0 ? layer.duration / natural : 1;
  let t = start;
  const planned: PlannedStroke[] = items.map((it, i) => {
    t += segs[i].gap * scale;
    const t0 = t;
    t += segs[i].dur * scale;
    return { d: it.d, len: it.len, t0, t1: t, width, color, ease: layer.strokeEase ?? "inOutSine" };
  });
  const end = planned.length ? planned[planned.length - 1].t1 : start;
  return {
    kind: "strokes",
    index,
    start,
    end,
    exit: planExit(layer.exit, end, EXIT_DEFAULTS),
    strokes: planned.filter((s) => s.d),
    bbox: bboxOf(strokes.map((s) => s.pts)),
    glow: layer.glow,
    shadow: layer.shadow,
    penTip: penTipOf(layer.penTip, color),
    opacity: layer.opacity ?? 1,
    rotate: layer.rotate ?? 0,
    origin: [x, y],
    blend: layer.blend,
  };
};

// --------------------------------------------------------------- doodle ----

const planDoodle = (layer: DoodleLayer, index: number, start: number, W: number, H: number): StrokePlan => {
  const cx = len(layer.x, W, W / 2);
  const cy = len(layer.y, H, H / 2);
  const w = len(layer.w, W, 300);
  const h = len(layer.h, H, layer.shape === "highlight" ? 70 : layer.shape.includes("underline") ? 30 : w);
  const pt = (p?: [Len, Len]): Pt | undefined => (p ? [len(p[0], W, 0), len(p[1], H, 0)] : undefined);
  const polys = makeDoodle({
    shape: layer.shape,
    cx,
    cy,
    w,
    h,
    from: pt(layer.from),
    to: pt(layer.to),
    bend: layer.bend ?? 0.25,
    points: layer.points?.map((p) => pt(p)!) ?? undefined,
    roughness: layer.roughness ?? 0.5,
    seed: layer.seed ?? hashString(`${layer.shape}${cx}${cy}${w}${h}`),
  });
  const highlight = layer.shape === "highlight";
  const color = layer.color ?? (highlight ? "#ffe14d" : "#141414");
  const width = layer.strokeWidth ?? (highlight ? h * 0.85 : 8);
  const items = polys.map((p) => {
    const d = smoothPath(p, layer.shape === "star" || layer.shape === "check" || layer.shape === "box" ? 35 : 70);
    return { d, len: d ? getLength(d) : 0 };
  });
  const total = items.reduce((s, i) => s + i.len, 0);
  const gap = 0.06;
  const drawTime = layer.duration ?? Math.min(1.2, Math.max(0.35, total / 1600));
  const writeTime = Math.max(0.05, drawTime - gap * (items.length - 1));
  let t = start;
  const planned: PlannedStroke[] = items.map((it, i) => {
    if (i > 0) t += gap;
    const t0 = t;
    t += total ? (it.len / total) * writeTime : writeTime / items.length;
    return { d: it.d, len: it.len, t0, t1: t, width, color, ease: layer.strokeEase ?? (highlight ? "inOutQuad" : "inOutSine") };
  });
  const end = t;
  return {
    kind: "strokes",
    index,
    start,
    end,
    exit: planExit(layer.exit, end, EXIT_DEFAULTS),
    strokes: planned.filter((s) => s.d),
    bbox: bboxOf(polys),
    glow: layer.glow,
    shadow: layer.shadow,
    penTip: penTipOf(layer.penTip, color),
    opacity: layer.opacity ?? (highlight ? 0.55 : 1),
    rotate: layer.rotate ?? 0,
    origin: [cx, cy],
    blend: layer.blend ?? (highlight ? "multiply" : undefined),
  };
};

// ------------------------------------------------------------------ svg ----

const styleOf = (el: Element) => {
  const out: Record<string, string> = {};
  for (const part of (el.getAttribute("style") ?? "").split(";")) {
    const [k, v] = part.split(":").map((s) => s?.trim());
    if (k && v) out[k] = v;
  }
  const get = (k: string): string | undefined => out[k] ?? el.getAttribute(k) ?? undefined;
  return { stroke: get("stroke"), fill: get("fill"), strokeWidth: get("stroke-width") };
};

const inheritedPaint = (el: Element | null, key: "stroke" | "fill"): string | undefined => {
  for (let e = el; e && e.tagName.toLowerCase() !== "svg"; e = e.parentElement) {
    const v = styleOf(e)[key];
    if (v) return v;
  }
  return undefined;
};

const shapeToD = (el: Element): string | null => {
  const n = (a: string) => parseFloat(el.getAttribute(a) ?? "0");
  switch (el.tagName.toLowerCase()) {
    case "path":
      return el.getAttribute("d");
    case "line":
      return `M${n("x1")} ${n("y1")}L${n("x2")} ${n("y2")}`;
    case "polyline":
    case "polygon": {
      const nums = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(parseFloat);
      let d = "";
      for (let i = 0; i + 1 < nums.length; i += 2) d += `${i ? "L" : "M"}${nums[i]} ${nums[i + 1]}`;
      return el.tagName.toLowerCase() === "polygon" ? d + "Z" : d;
    }
    case "rect": {
      const x = n("x"), y = n("y"), w = n("width"), h = n("height");
      return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    }
    case "circle":
    case "ellipse": {
      const cx = n("cx"), cy = n("cy");
      const rx = el.tagName.toLowerCase() === "circle" ? n("r") : n("rx");
      const ry = el.tagName.toLowerCase() === "circle" ? n("r") : n("ry");
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
    }
    default:
      return null;
  }
};

const ancestorTransform = (el: Element) => {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e.tagName.toLowerCase() !== "svg"; e = e.parentElement) {
    const t = e.getAttribute("transform");
    if (t) parts.unshift(t);
  }
  return parts.join(" ");
};

const planSvg = async (layer: SvgLayer, index: number, start: number, W: number, H: number): Promise<StrokePlan> => {
  const res = await fetch(assetUrl(layer.src));
  if (!res.ok) throw new Error(`InkMotion: cannot load svg "${layer.src}" (${res.status})`);
  const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
  const root = doc.documentElement;
  const vb = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(parseFloat);
  const [vx, vy, vw, vh] =
    vb.length === 4 && vb.every((v) => !Number.isNaN(v))
      ? vb
      : [0, 0, parseFloat(root.getAttribute("width") ?? "100"), parseFloat(root.getAttribute("height") ?? "100")];
  const targetW = len(layer.w, W, W * 0.6);
  const sc = targetW / vw;
  const cx = len(layer.x, W, W / 2);
  const cy = len(layer.y, H, H / 2);
  const ox = cx - targetW / 2 - vx * sc;
  const oy = cy - (vh * sc) / 2 - vy * sc;

  const els = [...root.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse")].filter(
    (e) => !e.closest("defs,clipPath,mask,symbol"),
  );
  let items = els
    .map((el) => {
      const d = shapeToD(el);
      if (!d) return null;
      const own = ancestorTransform(el);
      const transform = `translate(${ox} ${oy}) scale(${sc})${own ? " " + own : ""}`;
      const bb = getBoundingBox(d);
      const fill = inheritedPaint(el, "fill");
      const stroke = inheritedPaint(el, "stroke");
      return { d, transform, len: getLength(d), bb, fill: fill && fill !== "none" ? fill : undefined, stroke };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.len > 0);
  if (layer.order === "left-to-right") items = [...items].sort((a, b) => a.bb.x1 - b.bb.x1);
  if (layer.order === "top-to-bottom") items = [...items].sort((a, b) => a.bb.y1 - b.bb.y1);

  const total = items.reduce((s, i) => s + i.len, 0);
  const drawTime = layer.duration ?? 2.5;
  let t = start;
  const width = (layer.strokeWidth ?? 4) / sc;
  const planned: PlannedStroke[] = items.map((it) => {
    const t0 = t;
    t += total ? (it.len / total) * drawTime : drawTime / items.length;
    return {
      d: it.d,
      len: it.len,
      t0,
      t1: t,
      width,
      color: layer.color ?? (it.stroke && it.stroke !== "none" ? it.stroke : it.fill ?? "#141414"),
      ease: layer.strokeEase ?? "linear",
      fill: layer.fill === "none" ? undefined : it.fill,
      transform: it.transform,
    };
  });
  const fillDur = layer.fillDuration ?? 0.5;
  const end = t + (planned.some((p) => p.fill) ? fillDur : 0);
  return {
    kind: "strokes",
    index,
    start,
    end,
    exit: planExit(layer.exit, end, EXIT_DEFAULTS),
    strokes: planned,
    bbox: [cx - targetW / 2, cy - (vh * sc) / 2, cx + targetW / 2, cy + (vh * sc) / 2],
    glow: layer.glow,
    shadow: layer.shadow,
    penTip: penTipOf(layer.penTip, layer.color ?? "#141414"),
    opacity: layer.opacity ?? 1,
    rotate: layer.rotate ?? 0,
    origin: [cx, cy],
    blend: layer.blend,
    fillDur,
  };
};

// ---------------------------------------------------------- text / image ----

const planText = (layer: TextLayer, index: number, start: number, W: number, H: number): ElementPlan => {
  const by = layer.by ?? (layer.animation === "typewriter" ? "char" : layer.animation === "wipe" ? "all" : "word");
  const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
  const units =
    by === "char" ? [...text.replace(/\s/g, "")].length : by === "word" ? text.split(/\s+/).filter(Boolean).length : by === "line" ? text.split("\n").length : 1;
  const stagger = layer.stagger ?? (by === "char" ? (layer.animation === "typewriter" ? 0.045 : 0.025) : 0.07);
  const duration = layer.duration ?? (layer.animation === "typewriter" ? 0.01 : 0.5);
  const end = start + Math.max(0, units - 1) * stagger + duration;
  return {
    kind: "text",
    index,
    start,
    end,
    exit: planExit(layer.exit, end, EXIT_DEFAULTS),
    layer: { ...layer, text, by, stagger, duration },
    x: len(layer.x, W, W / 2),
    y: len(layer.y, H, H / 2),
    maxWidth: layer.maxWidth !== undefined ? len(layer.maxWidth, W, W) : undefined,
    units,
  };
};

const planImage = (layer: ImageLayer, index: number, start: number, W: number, H: number): ElementPlan => {
  const duration = layer.duration ?? 0.6;
  const end = start + duration;
  return {
    kind: "image",
    index,
    start,
    end,
    exit: planExit(layer.exit, end, EXIT_DEFAULTS),
    layer: { ...layer, duration },
    x: len(layer.x, W, W / 2),
    y: len(layer.y, H, H / 2),
    w: len(layer.w, W, W * 0.5),
  };
};

// ------------------------------------------------------------------ main ----

export const buildPlan = async (spec: Spec): Promise<Plan> => {
  const W = spec.width ?? 1080;
  const H = spec.height ?? 1920;
  const fps = spec.fps ?? 30;
  const clock: Clock = { prevStart: 0, prevEnd: 0, ids: new Map() };
  const layers: Plan["layers"] = [];
  for (const [i, layer] of (spec.layers ?? []).entries()) {
    const start = Math.max(0, resolveStart(layer.start, clock));
    let p: StrokePlan | ElementPlan;
    switch (layer.type) {
      case "write":
        p = await planWrite(layer, i, start, W, H);
        break;
      case "doodle":
        p = planDoodle(layer, i, start, W, H);
        break;
      case "svg":
        p = await planSvg(layer, i, start, W, H);
        break;
      case "text":
        p = planText(layer, i, start, W, H);
        break;
      case "image":
        p = planImage(layer, i, start, W, H);
        break;
      default:
        throw new Error(`InkMotion: unknown layer type "${(layer as { type: string }).type}"`);
    }
    layers.push(p);
    clock.prevStart = p.start;
    clock.prevEnd = p.end;
    if (layer.id) clock.ids.set(layer.id, { start: p.start, end: p.end });
  }
  const lastMoment = layers.reduce((m, l) => Math.max(m, l.exit ? l.exit.t1 : l.end), 0);
  const duration = spec.duration ?? lastMoment + (spec.tail ?? 1);
  return {
    width: W,
    height: H,
    fps,
    duration: Math.max(1 / fps, duration),
    background: spec.background ?? { type: "color", color: "#f4efe6" },
    audio: spec.audio ?? [],
    layers,
  };
};
