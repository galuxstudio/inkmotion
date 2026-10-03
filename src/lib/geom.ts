import type { Pt, Polyline } from "./svgfont";

// Deterministic PRNG so every render of the same spec looks identical.
export const rng = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

const norm = (x: number, y: number): Pt => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

const dedupe = (pts: Polyline, eps = 0.25) => {
  const out: Polyline = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > eps) out.push(p);
  return out;
};

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Turns a polyline into a smooth SVG path (cubic Béziers through every point).
 * Sharp turns sharper than `cornerDeg` are kept as real corners, so cursive
 * cusps (the top of an "i", the turn of an "r") stay crisp.
 */
export const smoothPath = (input: Polyline, cornerDeg = 70): string => {
  const pts = dedupe(input);
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${r(pts[0][0])} ${r(pts[0][1])}L${r(pts[1][0])} ${r(pts[1][1])}`;
  const n = pts.length;
  const cornerCos = Math.cos((cornerDeg * Math.PI) / 180);
  const isCorner = pts.map((p, i) => {
    if (i === 0 || i === n - 1) return true;
    const a = norm(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const b = norm(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]);
    return a[0] * b[0] + a[1] * b[1] < cornerCos;
  });
  // Tangent direction at each point (one-sided at corners/ends).
  const tanIn: Pt[] = [];
  const tanOut: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    if (isCorner[i]) {
      tanIn[i] = norm(pts[i][0] - prev[0], pts[i][1] - prev[1]);
      tanOut[i] = norm(next[0] - pts[i][0], next[1] - pts[i][1]);
    } else {
      const t = norm(next[0] - prev[0], next[1] - prev[1]);
      tanIn[i] = t;
      tanOut[i] = t;
    }
  }
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const k = dist(a, b) / 3;
    const c1: Pt = [a[0] + tanOut[i][0] * k, a[1] + tanOut[i][1] * k];
    const c2: Pt = [b[0] - tanIn[i + 1][0] * k, b[1] - tanIn[i + 1][1] * k];
    d += `C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(b[0])} ${r(b[1])}`;
  }
  return d;
};

export const polylineLength = (pts: Polyline) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
};

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// After Effects–style easing curves.
export const EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  outBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export const ease = (name: string | undefined, t: number) =>
  (EASINGS[name ?? "linear"] ?? EASINGS.linear)(clamp01(t));
