import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import type { Plan, Spec } from "./lib/types";
import { assetUrl } from "./lib/plan";
import { StrokeLayer } from "./components/StrokeLayer";
import { ElementLayer } from "./components/ElementLayer";

export type SceneProps = Spec & { __plan?: Plan };

export const Scene: React.FC<SceneProps> = ({ __plan: plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!plan) return null;
  const t = frame / fps;
  const bg = plan.background;
  return (
    <AbsoluteFill style={{ background: bg.type === "color" ? bg.color : "transparent" }}>
      {bg.type === "image" ? (
        <Img src={assetUrl(bg.src)} style={{ width: "100%", height: "100%", objectFit: bg.fit ?? "cover" }} />
      ) : null}
      {bg.type === "video" ? (
        <OffthreadVideo
          src={assetUrl(bg.src)}
          startFrom={Math.round((bg.startFrom ?? 0) * fps)}
          volume={bg.volume ?? 1}
          style={{ width: "100%", height: "100%", objectFit: bg.fit ?? "cover" }}
        />
      ) : null}
      {plan.layers.map((l) =>
        l.kind === "strokes" ? <StrokeLayer key={l.index} plan={l} t={t} /> : <ElementLayer key={l.index} plan={l} t={t} />,
      )}
      {plan.audio.map((a, i) => (
        <Audio key={i} src={assetUrl(a.src)} volume={a.volume ?? 1} startFrom={Math.round((a.startFrom ?? 0) * fps)} />
      ))}
    </AbsoluteFill>
  );
};
