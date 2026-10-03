// Procedural hand-drawn shapes. Every shape returns its strokes (polylines in
// pixels) in the order a person would draw them, with seeded wobble so the
// result looks drawn rather than computed.
import type { Pt, Polyline } from "./svgfont";
import { rng } from "./geom";

export type DoodleInput = {
  shape: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  from?: Pt;
  to?: Pt;
  bend: number;
  points?: Pt[];
  roughness: number;
  seed: number;
};

const TAU = Math.PI * 2;

// Smooth 1-D value noise, enough for organic wobble.
const noise1 = (rand: () => number, knots = 6) => {
  const v = Array.from({ length: knots + 1 }, () => rand() * 2 - 1);
  return (t: number) => {
    const x = Math.max(0, Math.min(0.9999, t)) * knots;
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return v[i] * (1 - s) + v[i + 1] * s;
  };
};

const rotateAround = (pts: Polyline, c: Pt, deg: number): Polyline => {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return pts.map(([x, y]) => [c[0] + (x - c[0]) * cos - (y - c[1]) * sin, c[1] + (x - c[0]) * sin + (y - c[1]) * cos]);
};

const line = (a: Pt, b: Pt, n: number, wobble: number, rand: () => number, arc = 0): Polyline => {
  const nz = noise1(rand, 4);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  const pts: Polyline = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = nz(t) * wobble + Math.sin(Math.PI * t) * arc;
    pts.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off]);
  }
  return pts;
};

export const makeDoodle = (o: DoodleInput): Polyline[] => {
  const rand = rng(o.seed);
  const R = o.roughness;
  const { cx, cy, w, h } = o;
  const jit = (s: number) => (rand() * 2 - 1) * s * R;

  switch (o.shape) {
    case "underline": {
      const a: Pt = [cx - w / 2 + jit(w * 0.02), cy + jit(h * 0.15) + h * 0.12];
      const b: Pt = [cx + w / 2 + jit(w * 0.03), cy + jit(h * 0.15) - h * 0.12];
      return [line(a, b, 24, h * 0.18 * R, rand, -h * 0.25 * R)];
    }
    case "double-underline": {
      const gap = Math.max(h * 0.5, 10);
      const a: Pt = [cx - w / 2, cy - gap / 2];
      const b: Pt = [cx + w / 2, cy - gap / 2 - h * 0.08];
      const c: Pt = [cx - w * 0.42, cy + gap / 2];
      const d: Pt = [cx + w * 0.46, cy + gap / 2 - h * 0.06];
      return [line(a, b, 24, h * 0.12 * R, rand, -h * 0.15 * R), line(c, d, 24, h * 0.12 * R, rand, -h * 0.12 * R)];
    }
    case "circle": {
      const nz = noise1(rand, 7);
      const a0 = (-150 + jit(25)) * (Math.PI / 180);
      const sweep = TAU * (1.1 + 0.08 * R);
      const pts: Polyline = [];
      const n = 72;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const grow = 1 + 0.07 * R * t; // the loop spirals slightly outward
        const k = 1 + nz(t) * 0.05 * R;
        const a = a0 + sweep * t;
        pts.push([cx + Math.cos(a) * (w / 2) * k * grow, cy + Math.sin(a) * (h / 2) * k * grow]);
      }
      return [rotateAround(pts, [cx, cy], jit(6))];
    }
    case "box": {
      const x0 = cx - w / 2;
      const x1 = cx + w / 2;
      const y0 = cy - h / 2;
      const y1 = cy + h / 2;
      const c = (x: number, y: number): Pt => [x + jit(w * 0.015), y + jit(h * 0.03)];
      const corners = [c(x0, y0), c(x1, y0), c(x1, y1), c(x0, y1), c(x0, y0 + h * 0.06)];
      const pts: Polyline = [corners[0]];
      for (let i = 1; i < corners.length; i++) pts.push(...line(corners[i - 1], corners[i], 10, 2 * R, rand).slice(1));
      // overshoot past the starting corner, like a real pen
      pts.push([corners[0][0] + w * 0.08, corners[0][1] - h * 0.02]);
      return [pts];
    }
    case "arrow": {
      const from = o.from ?? [cx - w / 2, cy + h / 2];
      const to = o.to ?? [cx + w / 2, cy - h / 2];
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      const nx = -(to[1] - from[1]) / len;
      const ny = (to[0] - from[0]) / len;
      const ctrl: Pt = [(from[0] + to[0]) / 2 + nx * o.bend * len * 0.5, (from[1] + to[1]) / 2 + ny * o.bend * len * 0.5];
      const shaft: Polyline = [];
      const n = 32;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        shaft.push([u * u * from[0] + 2 * u * t * ctrl[0] + t * t * to[0], u * u * from[1] + 2 * u * t * ctrl[1] + t * t * to[1]]);
      }
      const tx = to[0] - ctrl[0];
      const ty = to[1] - ctrl[1];
      const tl = Math.hypot(tx, ty) || 1;
      const dir: Pt = [tx / tl, ty / tl];
      const head = Math.min(70, len * 0.2);
      const wing = (deg: number): Pt => {
        const a = ((180 + deg) * Math.PI) / 180;
        return [to[0] + (dir[0] * Math.cos(a) - dir[1] * Math.sin(a)) * head, to[1] + (dir[0] * Math.sin(a) + dir[1] * Math.cos(a)) * head];
      };
      return [shaft, [wing(-30 + jit(6)), to, wing(32 + jit(6))]];
    }
    case "check": {
      return [[[cx - w / 2, cy + jit(h * 0.05)], [cx - w * 0.12, cy + h / 2], [cx + w / 2 + jit(w * 0.05), cy - h / 2]]];
    }
    case "cross": {
      return [
        line([cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], 10, 3 * R, rand),
        line([cx + w / 2, cy - h / 2], [cx - w / 2, cy + h / 2], 10, 3 * R, rand),
      ];
    }
    case "star": {
      const pts: Polyline = [];
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + i * ((4 * Math.PI) / 5);
        pts.push([cx + Math.cos(a) * (w / 2) + jit(w * 0.03), cy + Math.sin(a) * (h / 2) + jit(h * 0.03)]);
      }
      return [pts];
    }
    case "heart": {
      const pts: Polyline = [];
      const n = 60;
      for (let i = 0; i <= n; i++) {
        const t = Math.PI + (i / n) * TAU * 1.02;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push([cx + (x / 34) * w, cy - (y / 30) * h - h * 0.05]);
      }
      return [pts];
    }
    case "sparkle": {
      // three emphasis strokes fanning out from the centre
      const out: Polyline[] = [];
      for (const deg of [-145, -90, -35]) {
        const a = ((deg + jit(8)) * Math.PI) / 180;
        out.push([
          [cx + Math.cos(a) * w * 0.25, cy + Math.sin(a) * h * 0.25],
          [cx + Math.cos(a) * w * 0.5, cy + Math.sin(a) * h * 0.5],
        ]);
      }
      return out;
    }
    case "highlight": {
      // a single marker swipe; pair it with a wide strokeWidth and blend "multiply"
      return [line([cx - w / 2, cy + jit(h * 0.08)], [cx + w / 2, cy + jit(h * 0.08)], 24, h * 0.06 * R, rand, -h * 0.05)];
    }
    case "scribble": {
      const pts: Polyline = [];
      const zigs = Math.max(4, Math.round(w / Math.max(h * 0.35, 12)));
      for (let i = 0; i <= zigs; i++) {
        const x = cx - w / 2 + (w * i) / zigs + jit(w * 0.01);
        const y = i % 2 === 0 ? cy - h / 2 + jit(h * 0.08) : cy + h / 2 + jit(h * 0.08);
        pts.push([x, y]);
      }
      return [pts];
    }
    case "path":
    default:
      return o.points && o.points.length > 1 ? [o.points] : [];
  }
};
