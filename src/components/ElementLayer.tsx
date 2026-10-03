import React from "react";
import { Img, continueRender, delayRender } from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadBebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import type { ElementPlan, TextLayer, ImageLayer } from "../lib/types";
import { ease, clamp01 } from "../lib/geom";
import { exitState, filterFor } from "./StrokeLayer";
import { assetUrl } from "../lib/plan";

const GOOGLE: Record<string, (w: string) => void> = {
  Poppins: (w) => loadPoppins("normal", { weights: [w as "400"], subsets: ["latin", "latin-ext"] }),
  Anton: () => loadAnton("normal", { subsets: ["latin", "latin-ext"] }),
  Caveat: (w) => loadCaveat("normal", { weights: [w as "400"], subsets: ["latin", "latin-ext"] }),
  "Bebas Neue": () => loadBebas("normal", { subsets: ["latin", "latin-ext"] }),
  Montserrat: (w) => loadMontserrat("normal", { weights: [w as "400"], subsets: ["latin", "latin-ext"] }),
  "Playfair Display": (w) => loadPlayfair("normal", { weights: [w as "400"], subsets: ["latin", "latin-ext"] }),
};
const SINGLE_WEIGHT = new Set(["Anton", "Bebas Neue"]);

const loaded = new Set<string>();
const ensureFont = (layer: TextLayer): string => {
  const weight = String(layer.weight ?? 700);
  if (layer.fontFile) {
    const family = `inkmotion-${layer.fontFile.replace(/\W/g, "")}`;
    if (!loaded.has(family)) {
      loaded.add(family);
      const handle = delayRender(`font ${layer.fontFile}`);
      const face = new FontFace(family, `url(${assetUrl(layer.fontFile)})`);
      face
        .load()
        .then((f) => {
          document.fonts.add(f);
          continueRender(handle);
        })
        .catch((err) => {
          console.error(err);
          continueRender(handle);
        });
    }
    return family;
  }
  const family = layer.fontFamily ?? "Poppins";
  const key = `${family}:${weight}`;
  if (GOOGLE[family] && !loaded.has(key)) {
    loaded.add(key);
    GOOGLE[family](SINGLE_WEIGHT.has(family) ? "400" : weight);
  }
  return family;
};

// Per-unit entrance styles, After Effects text-animator style.
const unitStyle = (anim: TextLayer["animation"], local: number, l: TextLayer): React.CSSProperties => {
  const dur = l.duration ?? 0.5;
  const raw = local / dur;
  if (raw <= 0) return { opacity: 0 };
  const e = ease(l.ease ?? (anim === "pop" ? "outBack" : "outCubic"), raw);
  switch (anim) {
    case "pop":
      return { opacity: clamp01(raw * 3), transform: `scale(${0.35 + 0.65 * e})`, display: "inline-block" };
    case "fade":
      return { opacity: e };
    case "blur":
      return { opacity: e, filter: `blur(${(1 - e) * 18}px)`, display: "inline-block" };
    case "typewriter":
      return { opacity: raw > 0 ? 1 : 0 };
    case "none":
    case "wipe":
      return {};
    case "rise":
    default:
      return { opacity: clamp01(raw * 1.8), transform: `translateY(${(1 - e) * (l.rise ?? 60)}px)`, display: "inline-block" };
  }
};

const TextEl: React.FC<{ plan: ElementPlan; tEff: number }> = ({ plan, tEff }) => {
  const l = plan.layer as TextLayer;
  const family = ensureFont(l);
  const anim = l.animation ?? "rise";
  const by = l.by ?? "word";
  const stagger = l.stagger ?? 0.07;
  const local = (i: number) => tEff - plan.start - i * stagger;
  let unit = 0;
  const lines = l.text.split("\n");

  const renderLine = (line: string, li: number) => {
    if (by === "line") {
      const st = unitStyle(anim, local(li), l);
      return (
        <div key={li} style={{ ...st, display: "block" }}>
          {line || " "}
        </div>
      );
    }
    const words = line.split(" ");
    return (
      <div key={li}>
        {words.map((w, wi) => {
          const space = wi < words.length - 1 ? " " : "";
          if (by === "word") {
            const st = unitStyle(anim, local(unit++), l);
            return (
              <React.Fragment key={wi}>
                <span style={{ display: "inline-block", ...st }}>{w}</span>
                {space}
              </React.Fragment>
            );
          }
          if (by === "char") {
            return (
              <React.Fragment key={wi}>
                <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                  {[...w].map((c, ci) => (
                    <span key={ci} style={{ display: "inline-block", ...unitStyle(anim, local(unit++), l) }}>
                      {c}
                    </span>
                  ))}
                </span>
                {space}
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={wi}>
              {w}
              {space}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const all = by === "all" ? unitStyle(anim, local(0), l) : {};
  const wipeIn = anim === "wipe" ? clamp01(ease(l.ease ?? "outCubic", local(0) / (l.duration ?? 0.5))) : 1;
  const align = l.align ?? "center";
  const tx = align === "left" ? "0" : align === "right" ? "-100%" : "-50%";
  const textShadow = [
    l.shadow ? `${l.shadow.dx ?? 0}px ${l.shadow.dy ?? 4}px ${l.shadow.blur ?? 12}px ${l.shadow.color ?? "rgba(0,0,0,0.5)"}` : null,
    l.glow ? `0 0 ${l.glow.radius ?? 16}px ${l.glow.color ?? "#fff"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div
      style={{
        position: "absolute",
        left: plan.x,
        top: plan.y,
        transform: `translate(${tx}, -50%) rotate(${l.rotate ?? 0}deg)`,
        width: plan.maxWidth,
        textAlign: align,
        fontFamily: `"${family}", sans-serif`,
        fontWeight: l.weight ?? 700,
        fontSize: l.size ?? 96,
        lineHeight: l.lineHeight ?? 1.1,
        letterSpacing: `${l.letterSpacing ?? 0}em`,
        color: l.color ?? "#141414",
        whiteSpace: plan.maxWidth ? "normal" : "pre",
        textShadow: textShadow || undefined,
        WebkitTextStroke: l.stroke ? `${l.stroke.width ?? 2}px ${l.stroke.color ?? "#000"}` : undefined,
        paintOrder: "stroke fill",
        background: l.background?.color,
        padding: l.background ? l.background.padding ?? 24 : undefined,
        borderRadius: l.background?.radius ?? (l.background ? 18 : undefined),
        clipPath: anim === "wipe" ? `inset(0 ${(1 - wipeIn) * 100}% 0 0)` : undefined,
        mixBlendMode: l.blend as React.CSSProperties["mixBlendMode"],
        ...all,
      }}
    >
      {lines.map(renderLine)}
    </div>
  );
};

const ImageEl: React.FC<{ plan: ElementPlan; tEff: number; t: number }> = ({ plan, tEff, t }) => {
  const l = plan.layer as ImageLayer;
  const raw = (tEff - plan.start) / (l.duration ?? 0.6);
  if (raw <= 0) return null;
  const anim = l.animation ?? "pop";
  const e = ease(l.ease ?? (anim === "pop" ? "outBack" : "outCubic"), raw);
  const bob = l.float ? Math.sin((t - plan.start) * Math.PI * 0.8) * l.float : 0;
  let opacity = 1;
  let extra = "";
  let clip: string | undefined;
  if (anim === "pop") {
    opacity = clamp01(raw * 3);
    extra = ` scale(${0.3 + 0.7 * e})`;
  } else if (anim === "rise") {
    opacity = clamp01(raw * 1.8);
    extra = ` translateY(${(1 - e) * 80}px)`;
  } else if (anim === "fade") opacity = e;
  else if (anim === "wipe") clip = `inset(0 ${(1 - e) * 100}% 0 0)`;
  return (
    <Img
      src={assetUrl(l.src)}
      style={{
        position: "absolute",
        left: plan.x,
        top: plan.y + bob,
        width: plan.w,
        transform: `translate(-50%, -50%) rotate(${l.rotate ?? 0}deg)${extra}`,
        opacity: opacity * (l.opacity ?? 1),
        clipPath: clip,
        mixBlendMode: l.blend as React.CSSProperties["mixBlendMode"],
      }}
    />
  );
};

export const ElementLayer: React.FC<{ plan: ElementPlan; t: number }> = ({ plan, t }) => {
  if (t < plan.start) return null;
  const { tEff, fade, wipe } = exitState(plan.exit, t, plan.start, plan.end);
  if (fade <= 0) return null;
  const inner = plan.kind === "text" ? <TextEl plan={plan} tEff={tEff} /> : <ImageEl plan={plan} tEff={tEff} t={t} />;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: fade * (plan.kind === "text" ? (plan.layer.opacity ?? 1) : 1),
        clipPath: wipe > 0 ? `inset(0 0 0 ${wipe * 100}%)` : undefined,
        filter: plan.kind === "image" ? filterFor((plan.layer as ImageLayer & { glow?: never }).glow, undefined) : undefined,
      }}
    >
      {inner}
    </div>
  );
};
