import React from "react";
import { useVideoConfig } from "remotion";
import { getPointAtLength } from "@remotion/paths";
import type { StrokePlan, PlannedExit } from "../lib/types";
import { ease, clamp01 } from "../lib/geom";

// Maps the clock through an exit: "erase" plays the drawing backwards.
export const exitState = (exit: PlannedExit | undefined, t: number, start: number, end: number) => {
  if (!exit || t < exit.t0) return { tEff: t, fade: 1, wipe: 0 };
  const e = ease(exit.ease ?? "inOutSine", (t - exit.t0) / Math.max(1e-6, exit.t1 - exit.t0));
  switch (exit.type) {
    case "fade":
      return { tEff: t, fade: 1 - e, wipe: 0 };
    case "erase":
      return { tEff: end - (end - start) * e, fade: e >= 1 ? 0 : 1, wipe: 0 };
    case "wipe":
      return { tEff: t, fade: e >= 1 ? 0 : 1, wipe: e };
    default:
      return { tEff: t, fade: 1, wipe: 0 };
  }
};

export const filterFor = (glow?: { color?: string; radius?: number; strength?: number }, shadow?: { color?: string; blur?: number; dx?: number; dy?: number }) => {
  const parts: string[] = [];
  if (shadow) parts.push(`drop-shadow(${shadow.dx ?? 0}px ${shadow.dy ?? 6}px ${shadow.blur ?? 10}px ${shadow.color ?? "rgba(0,0,0,0.45)"})`);
  if (glow) {
    const r = glow.radius ?? 12;
    const c = glow.color ?? "#ffffff";
    const n = Math.max(1, Math.round(glow.strength ?? 2));
    for (let i = 0; i < n; i++) parts.push(`drop-shadow(0 0 ${r * (i + 1) * 0.6}px ${c})`);
  }
  return parts.length ? parts.join(" ") : undefined;
};

export const StrokeLayer: React.FC<{ plan: StrokePlan; t: number }> = ({ plan, t }) => {
  const { width, height } = useVideoConfig();
  if (t < plan.start) return null;
  const { tEff, fade, wipe } = exitState(plan.exit, t, plan.start, plan.end);
  if (fade <= 0) return null;
  const [bx0, by0, bx1, by1] = plan.bbox;
  const pad = 200;
  const clipId = `wipe-${plan.index}`;
  const fillDur = plan.fillDur ?? 0.5;

  let tip: { x: number; y: number } | null = null;
  const paths = plan.strokes.map((s, i) => {
    const raw = (tEff - s.t0) / Math.max(1e-6, s.t1 - s.t0);
    if (raw <= 0) return null;
    const p = ease(s.ease, raw);
    if (plan.penTip && raw < 1 && !tip) {
      const pt = getPointAtLength(s.d, s.len * p);
      if (!s.transform) tip = pt;
    }
    const fillO = s.fill ? clamp01((tEff - s.t1) / fillDur) : 0;
    return (
      <path
        key={i}
        d={s.d}
        transform={s.transform}
        fill={s.fill && fillO > 0 ? s.fill : "none"}
        fillOpacity={fillO}
        stroke={s.color}
        strokeWidth={s.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={p < 1 ? `${s.len} ${s.len + 2}` : undefined}
        strokeDashoffset={p < 1 ? s.len * (1 - p) : undefined}
        strokeOpacity={s.opacity ?? 1}
      />
    );
  });

  const tipEl =
    tip && plan.penTip ? (
      <circle
        cx={(tip as { x: number }).x}
        cy={(tip as { y: number }).y}
        r={plan.penTip.radius ?? 6}
        fill={plan.penTip.color}
        style={{ filter: `drop-shadow(0 0 ${plan.penTip.glow ?? 14}px ${plan.penTip.color})` }}
      />
    ) : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        opacity: plan.opacity * fade,
        filter: filterFor(plan.glow, plan.shadow),
        mixBlendMode: plan.blend as React.CSSProperties["mixBlendMode"],
      }}
    >
      {wipe > 0 ? (
        <defs>
          <clipPath id={clipId}>
            <rect
              x={bx0 - pad + (bx1 - bx0 + 2 * pad) * wipe}
              y={by0 - pad}
              width={bx1 - bx0 + 2 * pad}
              height={by1 - by0 + 2 * pad}
            />
          </clipPath>
        </defs>
      ) : null}
      <g
        clipPath={wipe > 0 ? `url(#${clipId})` : undefined}
        transform={plan.rotate ? `rotate(${plan.rotate} ${plan.origin[0]} ${plan.origin[1]})` : undefined}
      >
        {paths}
        {tipEl}
      </g>
    </svg>
  );
};
