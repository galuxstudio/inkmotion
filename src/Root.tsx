import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { Scene, type SceneProps } from "./Scene";
import { buildPlan } from "./lib/plan";
import demo from "../examples/hello.json";

const calculateMetadata: CalculateMetadataFunction<SceneProps> = async ({ props }) => {
  const { __plan: _ignored, ...spec } = props;
  const plan = await buildPlan(spec);
  if ((spec as { __timeline?: boolean }).__timeline) {
    const rows = plan.layers.map((l) => ({
      layer: l.index,
      id: spec.layers[l.index]?.id,
      type: spec.layers[l.index]?.type,
      start: +l.start.toFixed(3),
      end: +l.end.toFixed(3),
      exit: l.exit ? [+l.exit.t0.toFixed(3), +l.exit.t1.toFixed(3)] : undefined,
    }));
    console.log("INKMOTION_TIMELINE " + JSON.stringify({ duration: +plan.duration.toFixed(3), layers: rows }));
  }
  return {
    width: plan.width,
    height: plan.height,
    fps: plan.fps,
    durationInFrames: Math.max(1, Math.round(plan.duration * plan.fps)),
    props: { ...spec, __plan: plan },
  };
};

export const Root: React.FC = () => (
  <Composition
    id="InkMotion"
    component={Scene}
    defaultProps={demo as SceneProps}
    calculateMetadata={calculateMetadata}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={150}
  />
);
