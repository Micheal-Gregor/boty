#!/usr/bin/env node
// Reusable batch asset optimizer. Walks a folder and, IN PLACE:
//   • images (.png/.jpg/.jpeg) → downscaled + re-encoded to .webp (source removed)
//   • videos (.mp4)            → downscaled + re-encoded H.264, audio stripped
// Everything is tunable via flags; --dry-run reports the inventory without touching files.
//
// Usage (from anywhere):
//   node tools/optimize-assets/optimize.mjs --dry-run
//   node tools/optimize-assets/optimize.mjs                       # optimize the default art dir
//   node tools/optimize-assets/optimize.mjs --dir some/other/dir --quality 82 --max-dim 1400
//
// Flags: --dir <path> --max-dim <px> --quality <1-100> --video-height <px> --crf <n>
//        --img-skip <bytes> --vid-skip <bytes> --images-only --videos-only --dry-run

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const val = (n, def) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def; };

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CFG = {
  root: path.resolve(val("dir", path.join(SCRIPT_DIR, "../../apps/web/src/assets/art"))),
  maxDim: +val("max-dim", 1280),       // longest image edge
  quality: +val("quality", 80),        // webp quality
  vidHeight: +val("video-height", 720),// max video height
  crf: +val("crf", 28),                // H.264 quality (lower = better/bigger)
  imgSkip: +val("img-skip", 100 * 1024),
  vidSkip: +val("vid-skip", 400 * 1024),
  dry: has("dry-run"),
  imagesOnly: has("images-only"),
  videosOnly: has("videos-only"),
};

const IMG_EXT = new Set([".png", ".jpg", ".jpeg"]);
const mb = (b) => (b / 1048576).toFixed(1) + " MB";
const kb = (b) => (b / 1024).toFixed(0) + " KB";

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const size = async (p) => (await fs.stat(p)).size;
const run = (bin, a) => new Promise((res, rej) => {
  const ps = spawn(bin, a, { stdio: ["ignore", "ignore", "pipe"] });
  let err = ""; ps.stderr.on("data", (d) => (err += d));
  ps.on("close", (c) => (c === 0 ? res() : rej(new Error(err.slice(-400)))));
});

async function optimizeImage(file) {
  const before = await size(file);
  if (before < CFG.imgSkip) return { before, after: before, skipped: "small" };
  const out = file.replace(/\.(png|jpe?g)$/i, ".webp");
  if (CFG.dry) return { before, after: null, planned: path.basename(out) };
  const buf = await sharp(file).resize({ width: CFG.maxDim, height: CFG.maxDim, fit: "inside", withoutEnlargement: true })
    .webp({ quality: CFG.quality }).toBuffer();
  await fs.writeFile(out, buf);
  if (out !== file) await fs.unlink(file); // drop the original ext so the art key (basename) is unique
  return { before, after: buf.length, out };
}

async function optimizeVideo(file) {
  const before = await size(file);
  if (before < CFG.vidSkip) return { before, after: before, skipped: "small" };
  if (CFG.dry) return { before, after: null, planned: path.basename(file) + " (re-encode)" };
  const tmp = file + ".tmp.mp4";
  // scale to at most vidHeight (keep even dims), H.264 CRF, strip audio, web-friendly faststart
  await run(ffmpegPath, ["-y", "-i", file,
    "-vf", `scale=-2:'min(${CFG.vidHeight},ih)'`, "-c:v", "libx264", "-crf", String(CFG.crf),
    "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", tmp]);
  const after = await size(tmp);
  if (after < before) { await fs.rm(file); await fs.rename(tmp, file); return { before, after, out: file }; }
  await fs.rm(tmp); return { before, after: before, skipped: "no-gain" }; // keep the smaller original
}

(async () => {
  console.log(`\n${CFG.dry ? "DRY RUN — " : ""}optimizing: ${CFG.root}`);
  console.log(`  images → webp q${CFG.quality}, max ${CFG.maxDim}px | videos → h264 crf${CFG.crf}, max ${CFG.vidHeight}px, no audio\n`);
  let tImgB = 0, tImgA = 0, nImg = 0, tVidB = 0, tVidA = 0, nVid = 0, skipped = 0, errs = 0;
  for await (const file of walk(CFG.root)) {
    const ext = path.extname(file).toLowerCase();
    try {
      if (IMG_EXT.has(ext) && !CFG.videosOnly) {
        const r = await optimizeImage(file);
        if (r.skipped) { skipped++; continue; }
        nImg++; tImgB += r.before; tImgA += r.after ?? 0;
        if (r.after != null && r.before / r.after > 3) console.log(`  🖼  ${mb(r.before)} → ${kb(r.after)}  ${path.relative(CFG.root, file)}`);
      } else if (ext === ".mp4" && !CFG.imagesOnly) {
        const r = await optimizeVideo(file);
        if (r.skipped) { skipped++; continue; }
        nVid++; tVidB += r.before; tVidA += r.after ?? 0;
        if (r.after != null) console.log(`  🎬 ${mb(r.before)} → ${mb(r.after)}  ${path.relative(CFG.root, file)}`);
      }
    } catch (e) { errs++; console.error(`  ✗ ${path.relative(CFG.root, file)}: ${e.message}`); }
  }
  console.log(`\n${CFG.dry ? "Would process" : "Processed"}: ${nImg} images (${mb(tImgB)}${CFG.dry ? "" : ` → ${mb(tImgA)}`}), ${nVid} videos (${mb(tVidB)}${CFG.dry ? "" : ` → ${mb(tVidA)}`}). Skipped ${skipped}, errors ${errs}.`);
  if (!CFG.dry) console.log(`Total: ${mb(tImgB + tVidB)} → ${mb(tImgA + tVidA)}  (saved ${mb(tImgB + tVidB - tImgA - tVidA)})`);
  console.log("");
})();
