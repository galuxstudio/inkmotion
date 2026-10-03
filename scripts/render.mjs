#!/usr/bin/env node
// Render an InkMotion spec.
//   node scripts/render.mjs <spec.json> <out.mp4|out.mov|out.png> [options]
// Options:
//   --timeline       print when each layer starts/ends (no render)
//   --alpha          transparent ProRes 4444 .mov (for Premiere / After Effects / ffmpeg overlay)
//   --still=<sec>    render a single PNG frame at that time ("end" = last frame)
//   --sheet          also write <out>_sheet.jpg, a 6x2 contact sheet of the result
//   --crf=<n>        H.264 quality (default 18)
//   --concurrency=<n>
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? true];
  }),
);
const [specPath, outArg] = args.filter((a) => !a.startsWith("--"));
if (!specPath || !outArg) {
  console.error("usage: node scripts/render.mjs <spec.json> <out.mp4|out.mov|out.png> [--alpha] [--still=SEC] [--sheet]");
  process.exit(1);
}
const specDir = path.dirname(path.resolve(specPath));
const out = path.resolve(outArg);
fs.mkdirSync(path.dirname(out), { recursive: true });
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

// Local files referenced by the spec are linked into public/_assets so the
// renderer can serve them.
const assetsDir = path.join(ROOT, "public", "_assets");
fs.mkdirSync(assetsDir, { recursive: true });
const ASSET_KEYS = new Set(["src", "fontFile", "font"]);
const toAsset = (value) => {
  if (typeof value !== "string" || /^(https?:|data:)/.test(value)) return value;
  const abs = path.isAbsolute(value) ? value : path.resolve(specDir, value);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return value;
  const name = crypto.createHash("sha1").update(abs).digest("hex").slice(0, 12) + path.extname(abs).toLowerCase();
  const dest = path.join(assetsDir, name);
  if (!fs.existsSync(dest)) {
    try {
      fs.linkSync(abs, dest);
    } catch {
      fs.copyFileSync(abs, dest);
    }
  }
  return `_assets/${name}`;
};
const walk = (node) => {
  if (Array.isArray(node)) return node.map(walk);
  if (node && typeof node === "object") {
    const o = {};
    for (const [k, v] of Object.entries(node)) o[k] = ASSET_KEYS.has(k) ? toAsset(v) : walk(v);
    return o;
  }
  return node;
};
const resolved = walk(spec);

const probeDuration = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return parseFloat(r.stdout);
};

// A background video sets the duration unless the spec says otherwise.
if (resolved.background?.type === "video" && resolved.duration === undefined) {
  const d = probeDuration(path.join(ROOT, "public", resolved.background.src));
  if (d) resolved.duration = Math.max(0.1, d - (resolved.background.startFrom ?? 0));
}
if (flags.alpha) resolved.background = { type: "transparent" };

const propsFile = path.join(os.tmpdir(), `inkmotion-props-${process.pid}.json`);
fs.writeFileSync(propsFile, JSON.stringify(resolved));

const bin = path.join(ROOT, "node_modules", ".bin", "remotion");

const readTimeline = () => {
  const tl = path.join(os.tmpdir(), `inkmotion-tl-${process.pid}.json`);
  fs.writeFileSync(tl, JSON.stringify({ ...resolved, __timeline: true }));
  const r = spawnSync(bin, ["compositions", "src/index.ts", `--props=${tl}`, "--log=verbose"], { cwd: ROOT, encoding: "utf8" });
  fs.rmSync(tl, { force: true });
  const line = `${r.stdout}\n${r.stderr}`.split("\n").find((l) => l.includes("INKMOTION_TIMELINE "));
  if (!line) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  return JSON.parse(line.slice(line.indexOf("INKMOTION_TIMELINE ") + 19).trim().replace(/^"|"$/g, ""));
};

if (flags.timeline) {
  const data = readTimeline();
  console.log(`duration ${data.duration}s`);
  for (const l of data.layers)
    console.log(`#${l.layer} ${(l.id ?? "").padEnd(10)} ${l.type.padEnd(7)} ${l.start.toFixed(2)} → ${l.end.toFixed(2)}${l.exit ? `   exit ${l.exit[0].toFixed(2)} → ${l.exit[1].toFixed(2)}` : ""}`);
  fs.rmSync(propsFile, { force: true });
  process.exit(0);
}
const common = ["src/index.ts", "InkMotion", out, `--props=${propsFile}`, "--log=warn"];
if (flags.concurrency) common.push(`--concurrency=${flags.concurrency}`);
let cmd;
if (flags.still !== undefined) {
  const fps = resolved.fps ?? 30;
  const sec = flags.still === "end" ? readTimeline().duration - 1 / fps : parseFloat(flags.still);
  cmd = ["still", ...common, `--frame=${Math.max(0, Math.round(sec * fps))}`, "--image-format=png"];
} else if (flags.alpha) {
  cmd = ["render", ...common, "--codec=prores", "--prores-profile=4444", "--pixel-format=yuva444p10le", "--image-format=png"];
} else {
  cmd = ["render", ...common, "--codec=h264", `--crf=${flags.crf ?? 18}`, "--pixel-format=yuv420p"];
}
const r = spawnSync(bin, cmd, { cwd: ROOT, stdio: "inherit" });
fs.rmSync(propsFile, { force: true });
if (r.status !== 0) process.exit(r.status ?? 1);

if (flags.sheet && flags.still === undefined) {
  const dur = probeDuration(out);
  const sheet = out.replace(/\.[^.]+$/, "") + "_sheet.jpg";
  const n = 12;
  spawnSync(
    "ffmpeg",
    ["-v", "error", "-y", "-i", out, "-vf", `fps=${n / dur},scale=300:-2,tile=6x2:padding=6:color=white`, "-frames:v", "1", sheet],
    { stdio: "inherit" },
  );
  console.log(`sheet: ${sheet}`);
}
console.log(`done: ${out}`);
