// The scene spec: one JSON file describes the whole animation.
// Lengths accept pixels (number) or a percentage of the frame ("50%").
// Times are seconds. `start` also accepts relative forms:
//   "+0.3"          → 0.3 s after the previous layer finishes its entrance
//   "-0.2"          → overlaps the previous layer by 0.2 s
//   "@title+0.5"    → 0.5 s after layer "title" finishes its entrance
//   "@title.start"  → same moment layer "title" starts

export type Len = number | string;
export type Start = number | string;

export type Exit = {
  type: "fade" | "erase" | "wipe" | "none";
  at?: number; // absolute time when the exit begins
  after?: number; // or: seconds after the entrance finishes
  duration?: number;
  ease?: string;
};

export type Glow = { color?: string; radius?: number; strength?: number };
export type Shadow = { color?: string; blur?: number; dx?: number; dy?: number };
export type PenTip = { color?: string; radius?: number; glow?: number };

type Common = {
  id?: string;
  start?: Start;
  exit?: Exit;
  opacity?: number;
  rotate?: number;
  blend?: string; // CSS mix-blend-mode, e.g. "multiply" for marker highlights
};

type StrokeStyle = {
  color?: string;
  strokeWidth?: number;
  glow?: Glow;
  shadow?: Shadow;
  penTip?: PenTip | boolean;
};

export type WriteLayer = Common &
  StrokeStyle & {
    type: "write";
    text: string;
    font?: string; // key from FONTS or a path to a single-line SVG font
    x?: Len;
    y?: Len;
    size?: number; // em size in px
    align?: "left" | "center" | "right";
    valign?: "top" | "middle" | "baseline";
    lineHeight?: number; // in em
    letterSpacing?: number; // in em
    maxWidth?: Len;
    fit?: Len | false; // shrink the size so the widest line fits (default 88% of the frame)
    slant?: number; // degrees, positive leans right
    jitter?: number; // 0..1 organic per-letter wobble
    seed?: number;
    speed?: number; // ems of ink per second (default 12)
    duration?: number; // overrides speed: total writing time
    penLift?: number; // pause between strokes (s)
    wordPause?: number; // extra pause between words (s)
    strokeEase?: string;
  };

export type DoodleShape =
  | "underline"
  | "double-underline"
  | "circle"
  | "box"
  | "arrow"
  | "check"
  | "cross"
  | "star"
  | "heart"
  | "sparkle"
  | "highlight"
  | "scribble"
  | "path";

export type DoodleLayer = Common &
  StrokeStyle & {
    type: "doodle";
    shape: DoodleShape;
    x?: Len; // centre
    y?: Len;
    w?: Len;
    h?: Len;
    from?: [Len, Len]; // arrow start
    to?: [Len, Len]; // arrow end
    bend?: number; // arrow curvature, -1..1
    points?: [Len, Len][]; // for shape "path"
    roughness?: number; // 0..1
    seed?: number;
    duration?: number;
    strokeEase?: string;
  };

export type SvgLayer = Common &
  StrokeStyle & {
    type: "svg";
    src: string;
    x?: Len;
    y?: Len;
    w?: Len; // target width; height follows the viewBox ratio
    duration?: number;
    order?: "document" | "left-to-right" | "top-to-bottom";
    fill?: "keep" | "none"; // fade the original fills in after drawing
    fillDuration?: number;
    strokeEase?: string;
  };

export type TextLayer = Common & {
  type: "text";
  text: string;
  x?: Len;
  y?: Len;
  size?: number;
  color?: string;
  fontFamily?: string; // Poppins, Anton, Caveat, Bebas Neue, Montserrat, Playfair Display, or any loaded font
  fontFile?: string; // local .ttf/.otf/.woff2
  weight?: number;
  align?: "left" | "center" | "right";
  maxWidth?: Len;
  lineHeight?: number;
  letterSpacing?: number; // em
  uppercase?: boolean;
  animation?: "rise" | "pop" | "fade" | "blur" | "typewriter" | "wipe" | "none";
  by?: "char" | "word" | "line" | "all";
  stagger?: number;
  duration?: number; // per unit
  ease?: string;
  rise?: number; // px for "rise"
  shadow?: Shadow;
  glow?: Glow;
  stroke?: { color?: string; width?: number };
  background?: { color?: string; padding?: number; radius?: number };
};

export type ImageLayer = Common & {
  type: "image";
  src: string;
  x?: Len;
  y?: Len;
  w?: Len;
  animation?: "pop" | "rise" | "fade" | "wipe" | "none";
  duration?: number;
  ease?: string;
  float?: number; // idle bob amplitude in px
};

export type Layer = WriteLayer | DoodleLayer | SvgLayer | TextLayer | ImageLayer;

export type Background =
  | { type: "transparent" }
  | { type: "color"; color: string }
  | { type: "image"; src: string; fit?: "cover" | "contain" }
  | { type: "video"; src: string; startFrom?: number; volume?: number; fit?: "cover" | "contain" };

export type Spec = {
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  tail?: number;
  background?: Background;
  audio?: { src: string; volume?: number; startFrom?: number }[];
  layers: Layer[];
};

// ---------- planned (resolved) structures handed to the renderer ----------

export type PlannedStroke = {
  d: string;
  len: number;
  t0: number;
  t1: number;
  width: number;
  color: string;
  ease?: string;
  fill?: string; // svg layers: original fill faded in after drawing
  transform?: string;
  opacity?: number;
};

export type PlannedExit = { type: Exit["type"]; t0: number; t1: number; ease?: string };

export type StrokePlan = {
  kind: "strokes";
  index: number;
  start: number;
  end: number; // entrance end
  exit?: PlannedExit;
  strokes: PlannedStroke[];
  bbox: [number, number, number, number];
  glow?: Glow;
  shadow?: Shadow;
  penTip?: PenTip;
  opacity: number;
  rotate: number;
  origin: [number, number];
  blend?: string;
  fillDur?: number;
};

export type ElementPlan = {
  kind: "text" | "image";
  index: number;
  start: number;
  end: number;
  exit?: PlannedExit;
  layer: TextLayer | ImageLayer;
  x: number;
  y: number;
  w?: number;
  maxWidth?: number;
  units?: number; // number of animated units (chars/words/lines)
};

export type Plan = {
  width: number;
  height: number;
  fps: number;
  duration: number;
  background: Background;
  audio: NonNullable<Spec["audio"]>;
  layers: (StrokePlan | ElementPlan)[];
};
