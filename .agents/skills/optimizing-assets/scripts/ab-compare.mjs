#!/usr/bin/env node
/*
 * ab-compare.mjs: the optimizing-assets skill's A/B numbers. It compares two captures of the same
 * view (the original asset and the candidate) and prints what verification.md gates on: luma SSIM,
 * the mean-luminance ratio and, given a capture of the view without the asset, the silhouette
 * ratio and SSIM on the object alone. It also writes a sheet to look at: original | candidate |
 * difference x4, at 100%. It warns when the object barely stands out from the plate (a dark or
 * storm capture), because the silhouette ratio then counts shading rather than the outline.
 *
 *   node ab-compare.mjs <original.png> <candidate.png> [--crop=x,y,w,h] [--plate=<no-asset.png>]
 *                       [--threshold=<1-255>] [--sheet=<out.png>] [--json]
 *
 * PNG needs nothing installed (Node's zlib), so it runs on any machine; other formats are read
 * with sharp from the shared tools when they are there. It captures nothing: take the screenshots
 * with the browser tooling you have, same camera, same viewport, quality tier pinned. Run it on two
 * captures of the ORIGINAL first: that SSIM is the noise floor, and a candidate difference smaller
 * than it is not caused by the asset.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const HELP = `ab-compare.mjs: A/B numbers for two captures of the same view

  node ab-compare.mjs <original.png> <candidate.png> [options]

  --crop=x,y,w,h      compare only this rectangle (the asset and a margin), in pixels
  --plate=<png>       the same view without the asset: adds the silhouette ratio and SSIM on the
                      object's pixels, and takes the luminance ratio over those pixels
  --threshold=<n>     how far (0-255, any channel) a pixel must differ from the plate to count as
                      the object (default 16)
  --sheet=<png>       write original | candidate | difference x4 of the crop, at 100%
  --json              print the numbers as JSON`;

const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const die = (msg) => { console.error(`ab-compare: ${msg}`); process.exit(2); };
if (flag('help') || argv.length === 0) { console.log(HELP); process.exit(0); }
const [origFile, candFile] = argv.filter((a) => !a.startsWith('--'));
if (!origFile || !candFile) die('usage: ab-compare.mjs <original.png> <candidate.png> [--crop=x,y,w,h] [--plate=<png>] [--sheet=<png>]  (--help)');

const orig = await readImage(origFile), cand = await readImage(candFile);
const plate = typeof flag('plate') === 'string' ? await readImage(flag('plate')) : null;
for (const [f, im] of [[candFile, cand], ...(plate ? [[flag('plate'), plate]] : [])]) {
  if (im.w !== orig.w || im.h !== orig.h) die(`${f} is ${im.w}x${im.h} but ${origFile} is ${orig.w}x${orig.h}: capture both at the same viewport`);
}
const crop = typeof flag('crop') === 'string' ? flag('crop').split(',').map(Number) : [0, 0, orig.w, orig.h];
if (crop.length !== 4 || crop.some((v) => !Number.isInteger(v) || v < 0) || crop[2] < 1 || crop[3] < 1 || crop[0] + crop[2] > orig.w || crop[1] + crop[3] > orig.h) {
  die(`--crop=${flag('crop')} must be x,y,w,h inside the ${orig.w}x${orig.h} capture`);
}
const threshold = flag('threshold') === undefined ? 16 : Number(flag('threshold'));
/**
 * Object pixels that clear the threshold by little (twice it, at most 32 more) barely count. Above
 * this share of them the silhouette ratio is flagged: SR's beacon at 40 m had 2-3% in golden light
 * and 69-79% in storm light, where its silhouette ratio read 0.89 and 1.01 for an unchanged outline.
 */
const LOW_CONTRAST = 0.1;
const nearLimit = threshold + Math.min(threshold, 32);
if (!(threshold >= 1 && threshold <= 255)) die('--threshold must be 1-255');

const [cx, cy, cw, ch] = crop;
const luma = (im) => {
  const y = new Float32Array(cw * ch);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const p = ((cy + j) * im.w + cx + i) * 4;
    y[j * cw + i] = 0.2126 * im.px[p] + 0.7152 * im.px[p + 1] + 0.0722 * im.px[p + 2];
  }
  return y;
};
const maxDiff = (a, b, k) => {   // largest channel difference at crop pixel k
  const p = ((cy + Math.floor(k / cw)) * a.w + cx + (k % cw)) * 4;
  return Math.max(Math.abs(a.px[p] - b.px[p]), Math.abs(a.px[p + 1] - b.px[p + 1]), Math.abs(a.px[p + 2] - b.px[p + 2]));
};
const n = cw * ch;
const [yo, yc] = [luma(orig), luma(cand)];
const map = ssimMap(yo, yc, cw, ch);
const border = cw >= 32 && ch >= 32 ? 5 : 0;
const inner = (k) => { const x = k % cw, y = Math.floor(k / cw); return x >= border && y >= border && x < cw - border && y < ch - border; };
const mean = (arr, pick) => { let s = 0, c = 0; for (let k = 0; k < n; k++) if (pick(k)) { s += arr[k]; c++; } return c ? s / c : NaN; };

const result = { original: origFile, candidate: candFile, crop: { x: cx, y: cy, w: cw, h: ch }, ssim: +mean(map, inner).toFixed(4) };
let object = () => true;
if (plate) {
  const inO = new Uint8Array(n), inC = new Uint8Array(n);
  for (let k = 0; k < n; k++) { inO[k] = maxDiff(orig, plate, k) > threshold ? 1 : 0; inC[k] = maxDiff(cand, plate, k) > threshold ? 1 : 0; }
  const count = (m) => m.reduce((s, v) => s + v, 0);
  if (!count(inO)) die(`no pixel of ${origFile} differs from the plate by more than ${threshold}: is the asset in the crop?`);
  object = (k) => inO[k] || inC[k];
  result.objectPixels = count(inO);
  result.silhouetteRatio = +(count(inC) / count(inO)).toFixed(4);
  result.objectSsim = +mean(map, (k) => object(k) && inner(k)).toFixed(4);
  // In a dark capture, dark parts of the object clear the plate by little, so shading decides
  // whether they count as object: the silhouette ratio then measures shading, not the outline.
  let near = 0;
  for (let k = 0; k < n; k++) if (inO[k] && maxDiff(orig, plate, k) <= nearLimit) near++;
  result.lowContrast = +(near / result.objectPixels).toFixed(4);
  if (result.lowContrast > LOW_CONTRAST) {
    result.warning = `low contrast: ${(result.lowContrast * 100).toFixed(0)}% of the object's pixels differ from the plate by ${nearLimit} or less, `
      + 'so the silhouette ratio is unreliable here. Gate the silhouette on the brightest capture, or on a mask capture (unlit white on black)';
  }
}
result.luminanceRatio = +(mean(yc, object) / mean(yo, object)).toFixed(4);
let changed = 0, worst = 0;
for (let k = 0; k < n; k++) { const d = maxDiff(orig, cand, k); if (d > 8) changed++; worst = Math.max(worst, d); }
result.changedPixels = +(changed / n).toFixed(4);
result.maxChannelDifference = worst;
if (typeof flag('sheet') === 'string') { writeSheet(flag('sheet')); result.sheet = flag('sheet'); }

if (flag('json')) console.log(JSON.stringify(result, null, 1));
else {
  const line = (label, value, why = '') => console.log(`  ${label.padEnd(22)} ${String(value).padEnd(10)} ${why}`);
  console.log(`${origFile} vs ${candFile}, crop ${cx},${cy} ${cw}x${ch}`);
  line('SSIM (luma, crop)', result.ssim);
  if (plate) line('SSIM (luma, object)', result.objectSsim, `${result.objectPixels} object pixels`);
  line('luminance ratio', result.luminanceRatio, plate ? 'candidate / original, object pixels' : 'candidate / original, whole crop');
  if (plate) line('silhouette ratio', result.silhouetteRatio, 'candidate / original object pixels');
  if (plate) line('low contrast', `${(result.lowContrast * 100).toFixed(1)}%`, `object pixels within ${nearLimit} of the plate`);
  line('changed pixels', `${(result.changedPixels * 100).toFixed(1)}%`, `a channel off by more than 8; largest ${worst}`);
  if (result.sheet) line('sheet', result.sheet, 'original | candidate | difference x4');
  if (result.warning) console.log(`  warning: ${result.warning}`);
}

// ---------------------------------------------------------------------------------------------- SSIM
/** Per-pixel SSIM of two luma planes: 11x11 Gaussian window, sigma 1.5, K1 0.01, K2 0.03 (Wang et al. 2004). */
function ssimMap(a, b, w, h) {
  const g = Array.from({ length: 11 }, (_, i) => Math.exp(-((i - 5) ** 2) / (2 * 1.5 * 1.5)));
  const gs = g.reduce((s, v) => s + v, 0);
  const k = g.map((v) => v / gs);
  const blur = (src) => {
    const tmp = new Float32Array(w * h), dst = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0; for (let i = -5; i <= 5; i++) s += k[i + 5] * src[y * w + Math.min(w - 1, Math.max(0, x + i))];
      tmp[y * w + x] = s;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0; for (let i = -5; i <= 5; i++) s += k[i + 5] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x];
      dst[y * w + x] = s;
    }
    return dst;
  };
  const prod = (p, q) => p.map((v, i) => v * q[i]);
  const [ma, mb] = [blur(a), blur(b)];
  const [saa, sbb, sab] = [blur(prod(a, a)), blur(prod(b, b)), blur(prod(a, b))];
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const va = saa[i] - ma[i] * ma[i], vb = sbb[i] - mb[i] * mb[i], cov = sab[i] - ma[i] * mb[i];
    out[i] = ((2 * ma[i] * mb[i] + C1) * (2 * cov + C2)) / ((ma[i] * ma[i] + mb[i] * mb[i] + C1) * (va + vb + C2));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- images
async function readImage(file) {
  if (!fs.existsSync(file)) die(`no ${file}`);
  const bytes = fs.readFileSync(file);
  if (bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47) return readPng(bytes, file);
  const sharpPath = path.join(process.env.BM_TOOLS ?? path.join(os.homedir(), '.bitmagic/tools'), 'gltf/node_modules/sharp/dist/index.mjs');
  if (!fs.existsSync(sharpPath)) die(`${file} is not a PNG; capture PNG, or install the shared tools (references/tools.md) to read other formats`);
  const sharp = (await import(pathToFileURL(sharpPath).href)).default;
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, px: data };
}

/** A PNG decoded to RGBA8: every colour type and bit depth, not interlaced (browsers never write Adam7). */
function readPng(b, file) {
  let o = 8, w = 0, h = 0, depth = 8, type = 6, plte = null, trns = null;
  const idat = [];
  while (o + 8 <= b.length) {
    const len = b.readUInt32BE(o), kind = b.toString('latin1', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    o += 12 + len;
    if (kind === 'IHDR') {
      [w, h, depth, type] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9]];
      if (data[12]) die(`${file} is an interlaced PNG; save it without interlacing`);
    } else if (kind === 'PLTE') plte = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels || !w || !h) die(`${file}: unsupported or broken PNG`);
  const stride = Math.ceil((w * channels * depth) / 8), bpp = Math.max(1, (channels * depth) >> 3);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const lines = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = lines.subarray(y * stride, (y + 1) * stride), prev = y ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, up = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
      const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][filter];
      if (pred === undefined) die(`${file}: bad PNG filter ${filter}`);
      cur[x] = (line[x] + pred) & 255;
    }
  }
  const sample = (y, i) => {   // component i of a row, scaled to 8 bits
    if (depth === 16) return lines[y * stride + i * 2];
    if (depth === 8) return lines[y * stride + i];
    const v = (lines[y * stride + ((i * depth) >> 3)] >> (8 - depth - ((i * depth) & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, s = x * channels;
    if (type === 3) {
      const i = sample(y, s);
      px.set([plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], trns && i < trns.length ? trns[i] : 255], p);
    } else if (type === 0 || type === 4) {
      const g = sample(y, s);
      px.set([g, g, g, type === 4 ? sample(y, s + 1) : 255], p);
    } else {
      px.set([sample(y, s), sample(y, s + 1), sample(y, s + 2), type === 6 ? sample(y, s + 3) : 255], p);
    }
  }
  return { w, h, px };
}

/** original | candidate | difference x4, over the crop, as an RGB PNG. */
function writeSheet(file) {
  const gap = 4, W = cw * 3 + gap * 2, rgb = Buffer.alloc(W * ch * 3, 96);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const p = ((cy + j) * orig.w + cx + i) * 4, q = (j * W + i) * 3;
    for (let c = 0; c < 3; c++) {
      rgb[q + c] = orig.px[p + c];
      rgb[q + (cw + gap) * 3 + c] = cand.px[p + c];
      rgb[q + (cw + gap) * 6 + c] = Math.min(255, Math.abs(orig.px[p + c] - cand.px[p + c]) * 4);
    }
  }
  const row = W * 3, raw = Buffer.alloc((row + 1) * ch);
  for (let j = 0; j < ch; j++) {   // filter 1 (Sub): each byte minus the one a pixel to its left
    raw[j * (row + 1)] = 1;
    for (let x = 0; x < row; x++) raw[j * (row + 1) + 1 + x] = (rgb[j * row + x] - (x >= 3 ? rgb[j * row + x - 3] : 0)) & 255;
  }
  const crcTable = Array.from({ length: 256 }, (_, c) => { for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (kind, data) => {
    const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]), head = Buffer.alloc(4), tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length); tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(ch, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
