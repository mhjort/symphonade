#!/usr/bin/env node
/*
 * optimize-glb.mjs: the optimizing-assets skill's encoder. It compresses one GLB's textures and
 * vertex buffers using a preset for its asset class, and it enforces the rules shipped games learned
 * the hard way instead of trusting the next run to remember them. It runs on the shared tools in
 * ~/.bitmagic/tools (glTF-Transform, meshoptimizer, sharp and gltf-validator, plus KTX-Software for
 * KTX2 textures); set BM_TOOLS to use another folder. Only --audit touches the network: a HEAD
 * request for each row whose size world.json does not record.
 *
 *   node optimize-glb.mjs <in.glb> <out.glb> --preset=<class> [overrides]   compress one file
 *   node optimize-glb.mjs --report <a.glb> [<b.glb> ...]                   measure, change nothing
 *   node optimize-glb.mjs --audit <src/work/world.json>                    list every asset by size
 *   node optimize-glb.mjs --help
 *
 * Rules applied on every run, whatever the flags say:
 *   - The vertex layout is SEPARATE. Interleaved quantized buffers crash three's WebGPU pipelines.
 *   - Normals and tangents are int8. int16 normals drew blotches on WebGPU.
 *   - Skinned or morphed files keep float32 positions. quantize() rewrites the inverse bind matrices.
 *   - Mesh nodes that code reads by name keep float positions and their exact TRS. These are
 *     BM_* engine nodes, names the game's src/ or the vendored engine/ compares node names against
 *     (literals, startsWith/includes arguments, regex words; any case), and --keep-float. Every
 *     other named mesh node whose transform quantization changes is listed, so a miss is visible.
 *   - Empty nodes are never pruned (markers), nodes and materials are never renamed, and textures
 *     are never folded into material factors (a solid-white mask is still a texture code paints).
 *   - Simplification locks bounding-box vertices, because the engine fits targetHeight and
 *     re-centres on the loaded bounds.
 *   - A KTX2 texture that already has the slot's encoding at no more than its edge is kept as it
 *     is: a re-encode is a second lossy generation. Lossless formats keep every alpha value.
 * It runs from the project root (or with --code=<dir>): the node-name scan reads src/ and engine/.
 * Exit code 1 means a check failed and the output must not ship.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PRESETS = {
  'distant-prop': {
    about: 'seen from ~30 m or more: landmarks, scenery, silhouettes. Simplified; one 512 ETC1S base map with AO baked in',
    simplify: 0.002, pos: 14, uv: 12, normals: 'octahedral', order: 'cache', ao: 0.6, resample: true,
    tex: { base: 'etc1s:512:255', emissive: 'etc1s:512:255', normal: 'drop', orm: 'drop' },
  },
  'hero-prop': {
    about: 'closest approach ~10-20 m: sculpts, buildings the player passes. No simplification, float positions',
    simplify: 0, pos: 0, uv: 14, normals: 'exact', order: 'cache', ao: 0, resample: true,
    tex: { base: 'jpeg:1024:90', emissive: 'jpeg:1024:90', normal: 'jpeg:1024:92', orm: 'uastc:512:2' },
  },
  character: {
    about: 'skinned or animated characters: float positions, exact normals, every animation key kept, UASTC atlas',
    simplify: 0, pos: 0, uv: 16, normals: 'exact', order: 'cache', ao: 0, resample: false,
    tex: { base: 'uastc:1024:4', emissive: 'uastc:1024:4', normal: 'keep', orm: 'uastc:512:2' },
  },
  'code-driven': {
    about: 'vehicles and props whose vertices, node positions or pixels code reads: float positions, never KTX2; base maps kept, the ORM/mask slot stored as lossless WebP (same pixels)',
    simplify: 0, pos: 0, uv: 16, normals: 'exact', order: 'cache', ao: 0, resample: true, noKtx: true, pairs: true,
    tex: { base: 'keep', emissive: 'keep', normal: 'keep', orm: 'webp-lossless' },
  },
  level: {
    about: 'stages and level meshes: float positions and triangle order kept, normals int8, UVs 16-bit, clips and textures untouched',
    simplify: 0, pos: 0, uv: 16, normals: 'exact', order: 'first-use', ao: 0, resample: false,
    tex: { base: 'keep', emissive: 'keep', normal: 'keep', orm: 'keep' },
  },
};
const FORMATS = ['etc1s', 'uastc', 'jpeg', 'webp', 'webp-lossless', 'png'];
const ENGINE_NODE_PREFIXES = ['BM_'];   // anchors, slots, parts, wheels: the engine looks these up by name
const KINDS = { BaseColor: 'base', Emissive: 'emissive', Normal: 'normal', Occlusion: 'orm', MetallicRoughness: 'orm' };
/** The versions this script was tested with; references/tools.md installs exactly these. */
const TESTED = {
  '@gltf-transform/core': '4.5.0', '@gltf-transform/extensions': '4.5.0', '@gltf-transform/functions': '4.5.0',
  meshoptimizer: '1.2.0', sharp: '0.35.5',
};
/** Row names and file names that look like an optimized copy rather than an original. */
const VARIANT_NAME = /(?:^|[_\-.])(?:hq|mobile|lite|slim|opt|optimi[sz]ed|meshopt|ktx2?|phone|lod)\d*$/i;
const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MiB` : `${(n / 1024).toFixed(1)} KiB`);

const HELP = `optimize-glb.mjs: texture + vertex-buffer compression by asset class

  node optimize-glb.mjs <in.glb> <out.glb> --preset=<class> [overrides]
  node optimize-glb.mjs --report <a.glb> [<b.glb> ...]
  node optimize-glb.mjs --audit <src/work/world.json>

Presets:
${Object.entries(PRESETS).map(([k, p]) => `  ${k.padEnd(13)} ${p.about}`).join('\n')}

Overrides (each replaces the preset's value):
  --simplify=<f>            error bound as a fraction of the model's largest dimension; 0 = off
  --base= --emissive= --normal= --orm=<spec>
                            keep | <format>[:<max edge px>][:<quality>], and drop for normal/orm;
                            ${FORMATS.join(', ')}; quality = etc1s qlevel 1-255,
                            uastc RDO lambda (0 = off), jpeg/webp 1-100
  --max-texture=<px>        cap every texture's edge (a phone variant: 512). A slot the preset
                            keeps is resized in its own format; lossless stays lossless
  --ao=<0-1>                AO baked into the base map when the ORM map is dropped
  --pos-bits=<0|10-16>      position quantization; 0 = float32 (forced for skins and morphs)
  --uv-bits=<8-16>
  --normals=exact|octahedral  int8 either way; octahedral is ~10% smaller, ~1 degree off,
                            and lossy on animation
  --keep-float=<a,b,c*>     more mesh nodes that keep float positions and exact TRS
  --code=<dir>|none         source scanned for node names code reads (default: src and engine)
  --meshopt=off             quantization only, for an engine without the meshopt decoder
  --resample=on|off         drop animation keys their neighbours reproduce within 1e-4. It moved
                            a rider's hands by ~1 mm for 1-2% of the file: off for character
  --only-default-scene      drop every other scene and the nodes, meshes, skins and clips only
                            it used
  --drop-animations         drop every clip (only if the game plays none from this file)
  --json                    print the report as JSON`;

// ---------------------------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const files = argv.filter((a) => !a.startsWith('--'));
const die = (msg, code = 2) => { console.error(`optimize-glb: ${msg}`); process.exit(code); };
if (flag('help') || argv.length === 0) { console.log(HELP); process.exit(0); }

if (flag('audit')) { await audit(files[0] ?? 'src/work/world.json'); process.exit(0); }

// The node-name scan reads ./src and ./engine. Anywhere else it finds nothing, and distant-prop
// would quantize and simplify the lamps and anchors code reads, with exit 0. Checked before the
// tools load, so it holds (and is tested) on any machine.
if (!flag('report')) {
  if (flag('code') === true) die('--code takes a folder, or none');
  if (typeof flag('code') === 'string' && flag('code') !== 'none' && !fs.existsSync(flag('code'))) die(`--code=${flag('code')}: no such folder`);
  if (flag('code') === undefined && !fs.existsSync('src') && !fs.existsSync('engine')) {
    die('no src/ or engine/ here, so the node names code reads cannot be scanned. Run from the project root, '
      + 'or pass --code=<the game source folder> (--code=none only when no code reads this model)');
  }
}

// ---------------------------------------------------------------------------------------------- tools
const TOOLS = process.env.BM_TOOLS ?? path.join(os.homedir(), '.bitmagic/tools');
const G = path.join(TOOLS, 'gltf', 'node_modules');
const tool = (p) => import(pathToFileURL(path.join(G, p)).href);   // file URLs, so Windows paths import too
if (!fs.existsSync(path.join(G, '@gltf-transform/core'))) {
  die(`the shared tools are missing (${G}). Installing them is a download: ask the creator, then follow the skill's references/tools.md.`);
}
process.env.PATH = path.join(TOOLS, 'ktx/bin') + path.delimiter + process.env.PATH;
const { NodeIO, VertexLayout, Logger } = await tool('@gltf-transform/core/dist/index.js');
const X = await tool('@gltf-transform/extensions/dist/index.js');
const { dedup, weld, prune, quantize, reorder, resample, compactPrimitive, getBounds } = await tool('@gltf-transform/functions/dist/index.js');
const { MeshoptEncoder } = await tool('meshoptimizer/meshopt_encoder.js');
const { MeshoptDecoder } = await tool('meshoptimizer/meshopt_decoder.mjs');
const { MeshoptSimplifier } = await tool('meshoptimizer/meshopt_simplifier.js');
const sharp = (await tool('sharp/dist/index.mjs')).default;
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);

const notes = [];
const ktxState = { checked: false };   // `ktx --version` is read once, on first use
/** glTF-Transform's own warnings, with the harmless UV one turned into a single plain note. */
class NoteLogger extends Logger {
  warn(text) {
    const uv = /Skipping (TEXCOORD_\d+); out of \[0,1\] range/.exec(text);
    if (!uv) return super.warn(text);
    const note = `${uv[1]} leaves 0-1 (tiling UVs) on some meshes, so those stay float. Harmless: it is what glTF-Transform's "Skipping" line meant`;
    if (!notes.includes(note)) notes.push(note);
  }
}
const io = new NodeIO().registerExtensions(X.ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
io.setVertexLayout(VertexLayout.SEPARATE).setLogger(new NoteLogger(Logger.Verbosity.WARN));
const PRUNE = { keepLeaves: true, keepAttributes: true, keepExtras: true, keepSolidTextures: true };

if (flag('report')) {
  for (const f of files) printStats(f, stats(await io.read(f), fs.statSync(f).size));
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------- settings
const [src, dst] = files;
const P = PRESETS[flag('preset')];
if (!src || !dst || !P) die(`usage: optimize-glb.mjs <in.glb> <out.glb> --preset=${Object.keys(PRESETS).join('|')}  (--help)`);
if (path.resolve(src) === path.resolve(dst)) die('refusing to overwrite the input: keep the original as the fallback.');
const num = (name, fallback, lo, hi) => {
  const v = flag(name); if (v === undefined) return fallback;
  const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) die(`--${name} must be ${lo}-${hi}`);
  return n;
};
const S = {
  simplify: num('simplify', P.simplify, 0, 0.1), ao: num('ao', P.ao, 0, 1),
  pos: num('pos-bits', P.pos, 0, 16), uv: num('uv-bits', P.uv, 8, 16), maxTex: num('max-texture', 0, 4, 16384),
  normals: flag('normals') ?? P.normals, order: P.order, meshopt: flag('meshopt') !== 'off',
  resample: flag('resample') === undefined ? P.resample : flag('resample') === 'on',
  tex: Object.fromEntries(['base', 'emissive', 'normal', 'orm'].map((k) => [k, parseSpec(flag(k) ?? P.tex[k], k)])),
  /** Slots given on the command line: an explicit KTX2 spec re-encodes a KTX2 source that already matches. */
  explicit: new Set(['base', 'emissive', 'normal', 'orm'].filter((k) => flag(k) !== undefined)),
};
if (S.pos > 0 && S.pos < 10) die('--pos-bits must be 0 (float) or 10-16');
if (!['exact', 'octahedral'].includes(S.normals)) die('--normals must be exact or octahedral');
if (flag('resample') !== undefined && !['on', 'off'].includes(flag('resample'))) die('--resample must be on or off');
function parseSpec(spec, slot) {
  if (spec === 'drop' && (slot === 'base' || slot === 'emissive')) die(`--${slot}=drop: only --normal and --orm can be dropped`);
  if (spec === 'keep' || spec === 'drop') return { kind: spec };
  const [format, edge, quality] = String(spec).split(':');
  if (!FORMATS.includes(format)) die(`--${slot}=${spec}: format must be keep, drop or one of ${FORMATS.join(', ')}`);
  if (P.noKtx && (format === 'etc1s' || format === 'uastc')) die(`--${slot}=${spec}: this preset's pixels are read by code; KTX2 makes them unreadable`);
  return { kind: 'encode', format, edge: edge ? Number(edge) : 0, quality: quality === undefined ? undefined : Number(quality) };
}
checkToolVersions();

// ---------------------------------------------------------------------------------------------- run
const before = await io.read(src);
const statsBefore = stats(before, fs.statSync(src).size);
const doc = await io.read(src);
const root = doc.getRoot();
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const carried = statsBefore.extensions.filter((e) => e === 'KHR_mesh_quantization' || e === 'KHR_texture_basisu');
if (statsBefore.extensions.includes('EXT_meshopt_compression')) {
  notes.push('warning: the input is already EXT_meshopt_compression, so it is probably an optimized variant. Start from the original '
    + 'asset: a second pass encodes lossy textures again and barely moves the bytes');
} else if (carried.length) {
  notes.push(`the input already carries ${carried.join(' and ')} (some exporters quantize, library characters ship KTX2). `
    + 'If this file is itself an optimized variant, start from its original instead');
}

// 1. Clean-up that cannot change a pixel.
const code = scanCode();
const clipsIn = root.listAnimations().map((a) => a.getName());
if (flag('only-default-scene')) await dropOtherScenes();
const namesIn = nodeNames(doc);   // after the scene drop: what the output must still name
if (flag('drop-animations')) {
  for (const a of root.listAnimations()) { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((s) => s.dispose()); a.dispose(); }
  notes.push(`dropped every animation clip${clipsIn.length ? `: ${clipsIn.filter(Boolean).join(', ')}` : ''}`);
}
warnClipsCodeNames();
await doc.transform(dedup({ keepUniqueNames: true }), weld(), ...(S.resample && root.listAnimations().length ? [resample()] : []));

// 2. What must stay exact.
const deforming = root.listSkins().length > 0 || root.listMeshes().some((m) => m.listPrimitives().some((p) => p.listTargets().length));
if (deforming && S.pos) { S.pos = 0; notes.push('positions kept float32: the file has skins or morph targets'); }
// Keeping a node exact only changes anything when positions are quantized or meshes simplified.
const keep = S.pos || S.simplify ? keepFloatNodes(doc, code.patterns) : new Map();
for (const [n, why] of keep) notes.push(`kept exact (not simplified, float positions, same TRS): ${n.getName()} (${why})`);
for (const f of code.glbParsers) {
  notes.push(`warning: ${f} reads GLB bytes itself and never mentions meshopt. The engine's decoder does not reach it: give it the `
    + 'meshopt decoder and make it read normalized int8/int16 attributes, or use --meshopt=off and still check the int8 normals');
}
if (S.normals === 'octahedral' && root.listAnimations().length) notes.push('warning: octahedral mode also filters animation (quaternion 16-bit, translation/scale 12-bit)');
const droppedKinds = new Set([...(S.tex.normal.kind === 'drop' ? ['Normal'] : []), ...(S.tex.orm.kind === 'drop' ? ['Occlusion', 'MetallicRoughness'] : [])]);
const slotsIn = root.listMaterials().flatMap((mat) => Object.keys(KINDS).filter((k) => mat[`get${k}Texture`]()).map((kind) => ({ mat, kind })));
const sizesIn = new Map(root.listMaterials().map((mat) => [mat, textureSizes(mat)]));

// 3. Simplify.
if (S.simplify > 0) simplifyAll();

// 4. Textures (before quantization: gutter fill and AO bake read float UVs).
await processTextures();
await doc.transform(prune(PRUNE));

// 5. Quantize. Kept nodes are restored afterwards, which is simpler than excluding them.
const snap = [...keep.keys()].map((n) => ({ n, t: n.getTranslation(), r: n.getRotation(), s: n.getScale(), mesh: n.getMesh(),
  pos: n.getMesh().listPrimitives().map((p) => [p, p.getAttribute('POSITION'), p.getMaterial()]) }));
const trs = (n) => [...n.getTranslation(), ...n.getRotation(), ...n.getScale()];
const named = root.listNodes().filter((n) => n.getName() && n.getMesh() && !keep.has(n)).map((n) => ({ n, mesh: n.getMesh(), trs: trs(n) }));
const semantics = ['NORMAL', 'TANGENT', 'TEXCOORD_\\d+', 'JOINTS_\\d+', 'WEIGHTS_\\d+', ...(S.pos ? ['POSITION'] : [])];
await doc.transform(quantize({ pattern: new RegExp(`^(${semantics.join('|')})$`), quantizePosition: S.pos || 14,
  quantizeNormal: 8, quantizeTexcoord: S.uv, quantizeWeight: 8, cleanup: false }));
for (const k of snap) {
  if (k.n.getMesh() !== k.mesh) {   // quantize() moved the mesh onto a new unnamed child: move it back
    const child = k.n.listChildren().find((c) => c.getMesh() === k.mesh && !c.getName());
    child?.setMesh(null); child?.dispose(); k.n.setMesh(k.mesh);
  }
  k.n.setTranslation(k.t).setRotation(k.r).setScale(k.s);
  for (const [p, a, m] of k.pos) p.setAttribute('POSITION', a).setMaterial(m);   // quantize() rescales volume thickness
}
const moved = named.filter((x) => x.n.getMesh() !== x.mesh || trs(x.n).some((v, i) => Math.abs(v - x.trs[i]) > 1e-6)).map((x) => x.n.getName());
if (moved.length) {
  notes.push(`positions quantized: ${moved.length} named mesh node(s) now carry a different transform (origin); the mesh still draws in `
    + `place: ${moved.slice(0, 20).join(', ')}${moved.length > 20 ? `, and ${moved.length - 20} more` : ''}. If code reads the position `
    + 'of any of them (lamps, anchors, attach points), rerun with --keep-float=<names>');
}
await doc.transform(prune(PRUNE), dedup({ keepUniqueNames: true }));
// quantize() declares KHR_mesh_quantization only when positions are quantized; int8 normals need it too.
const needsQuant = root.listMeshes().flatMap((m) => m.listPrimitives()).some((p) => ['POSITION', 'NORMAL', 'TANGENT']
  .some((sem) => p.getAttribute(sem) && p.getAttribute(sem).getComponentType() !== 5126));
if (needsQuant) doc.createExtension(X.KHRMeshQuantization).setRequired(true);
const liveSlots = slotsIn.filter(({ mat, kind }) => !mat.isDisposed() && !droppedKinds.has(kind));
const lostSlots = liveSlots.filter(({ mat, kind }) => !mat[`get${kind}Texture`]()).map(({ mat, kind }) => `${mat.getName() || 'material'}.${kind}`);
const unpaired = P.pairs ? pairingBreaks() : [];

// 6. Vertex order, then meshopt.
if (S.order === 'cache') await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
else renumberByFirstUse();
if (S.meshopt) {
  doc.createExtension(X.EXTMeshoptCompression).setRequired(true).setEncoderOptions({
    method: S.normals === 'octahedral' ? X.EXTMeshoptCompression.EncoderMethod.FILTER : X.EXTMeshoptCompression.EncoderMethod.QUANTIZE });
} else {
  root.listExtensionsUsed().find((e) => e.extensionName === 'EXT_meshopt_compression')?.dispose();
}
await io.write(dst, doc);

// 7. Check what was written, as a loader will read it.
const bytes = fs.readFileSync(dst);
const out = await io.read(dst);
const statsAfter = stats(out, bytes.length);
const checks = checkOutput(out, bytes);
checks.push(await validate(bytes, fs.readFileSync(src)));
if (flag('json')) console.log(JSON.stringify({ src, dst, preset: flag('preset'), before: statsBefore, after: statsAfter, notes, checks }, null, 1));
else printReport();
process.exit(checks.some((c) => c.fail) ? 1 : 0);

// ============================================================================================== steps

/**
 * --only-default-scene: the other scenes go, and so does every node only they reached (a library
 * character's second "static eyes" rig), with the meshes, skins and animation channels only those
 * nodes used. Nodes the default scene reaches (children, skin joints) always stay.
 */
async function dropOtherScenes() {
  const reached = new Set();
  const visit = (n) => {
    if (reached.has(n)) return;
    reached.add(n);
    n.listChildren().forEach(visit);
    const skin = n.getSkin();
    if (skin) { skin.listJoints().forEach(visit); if (skin.getSkeleton()) visit(skin.getSkeleton()); }
  };
  scene.listChildren().forEach(visit);
  const others = root.listScenes().filter((s) => s !== scene);
  if (!others.length) return;
  const orphans = new Set();
  const collect = (n) => { if (orphans.has(n) || reached.has(n)) return; orphans.add(n); n.listChildren().forEach(collect); };
  for (const s of others) { s.listChildren().forEach(collect); s.dispose(); }
  const names = [...orphans].map((n) => n.getName()).filter(Boolean);
  for (const n of orphans) n.dispose();
  const clips = [];
  for (const a of root.listAnimations()) {
    for (const c of a.listChannels()) if (!c.getTargetNode()) c.dispose();
    const used = new Set(a.listChannels().map((c) => c.getSampler()));
    for (const s of a.listSamplers()) if (!used.has(s)) s.dispose();
    if (!a.listChannels().length) { clips.push(a.getName() || '(unnamed)'); a.dispose(); }
  }
  await doc.transform(prune(PRUNE));   // their meshes, skins, materials and textures, before anything encodes them
  notes.push(`dropped ${others.length} non-default scene(s) and the ${orphans.size} node(s) only they used`
    + `${names.length ? `: ${names.slice(0, 8).join(', ')}${names.length > 8 ? `, and ${names.length - 8} more` : ''}` : ''}`
    + `${clips.length ? `; and the ${clips.length} clip(s) that animated only those nodes: ${clips.join(', ')}` : ''}`);
}

/**
 * A clip the output no longer has, whose name code compares against (the same scan as node names;
 * exact matches, because a clip is looked up by its whole name: findByName, clipAction, ===).
 */
function warnClipsCodeNames() {
  const left = new Set(root.listAnimations().map((a) => a.getName()));
  for (const name of new Set(clipsIn.filter((n) => n && !left.has(n)))) {
    const hit = code.patterns.find((p) => p.mode === 'exact' && p.text === (p.ci ? name.toLowerCase() : name));
    if (hit) {
      notes.push(`warning: ${hit.where} names the clip "${name}", which this output no longer has. If that code plays it on this `
        + 'model, keep the clip: rerun without the flag that dropped it');
    }
  }
}

/** Mesh nodes whose position or TRS code relies on: engine prefixes, --keep-float, names code compares against. */
function keepFloatNodes(d, patterns) {
  const kept = new Map();
  const extra = String(flag('keep-float') ?? '').split(',').filter(Boolean);
  const sanitize = (s) => s.replace(/\s/g, '_').replace(/[[\].:/]/g, '');   // three's PropertyBinding.sanitizeNodeName
  for (const n of d.getRoot().listNodes()) {
    const name = n.getName();
    if (!n.getMesh() || !name) continue;
    let why = ENGINE_NODE_PREFIXES.find((p) => name.startsWith(p)) && 'engine name prefix';
    why ||= extra.find((e) => (e.endsWith('*') ? name.startsWith(e.slice(0, -1)) : name === e)) && '--keep-float';
    for (const raw of why ? [] : new Set([name, sanitize(name)])) {
      const hit = patterns.find((p) => {
        const cand = p.ci ? raw.toLowerCase() : raw;
        return p.mode === 'exact' ? cand === p.text : p.mode === 'prefix' ? cand.startsWith(p.text) : cand.includes(p.text);
      });
      if (hit) { why = `${hit.mode === 'exact' ? '' : `${hit.mode} `}"${hit.text}"${hit.ci ? ' (any case)' : ''} in ${hit.where}`; break; }
    }
    if (why) kept.set(n, why);
  }
  // A mesh shared with other nodes stays exact for all of them, or their transforms would disagree.
  for (const n of [...kept.keys()]) for (const p of n.getMesh().listParents()) if (p.propertyType === 'Node' && !kept.has(p)) kept.set(p, `shares a mesh with ${n.getName()}`);
  return kept;
}

/** Source files under a folder, as [path, text]. */
function sourceFiles(dir) {
  const found = [];
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === '__tests__') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 12) walk(p, depth + 1); continue; }
      if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name) && !e.name.endsWith('.d.ts')) found.push([p, fs.readFileSync(p, 'utf8')]);
    }
  };
  if (fs.existsSync(dir)) walk(dir, 0);
  return found;
}

/**
 * What code compares node names against. From the game's src/: every string literal (exact),
 * startsWith/includes/endsWith arguments and template heads (prefix or substring), and the words
 * of every regex literal (substring; prefix when anchored). From the vendored engine/: the same,
 * but only where a name is being compared, because its other strings are not node names. A
 * comparison ignores case when the code does: a toLowerCase()/toUpperCase() just before it, or a
 * regex with the i flag. A superset only costs bytes, a miss moves a lamp; but an exact literal
 * matched in any case would keep a landmark's whole hull unsimplified because some object has the
 * key 'trawler'. Also returns the src/ files that parse GLB bytes themselves.
 */
function scanCode() {
  const dirs = flag('code') === 'none' ? [] : flag('code') ? [[flag('code'), false]] : [['src', false], ['engine', true]];
  const patterns = new Map();
  const glbParsers = [];
  const add = (text, mode, ci, where) => {
    const t = ci ? text.trim().toLowerCase() : text.trim();
    if (t.length < 3 || t.length > 200 || !/[a-z]/i.test(t)) return;
    if (!patterns.has(`${mode}:${ci}:${t}`)) patterns.set(`${mode}:${ci}:${t}`, { text: t, mode, ci, where });
  };
  const regexWords = (body, ci, where) => {
    const anchored = body.startsWith('^');
    const plain = body.replace(/\[(?:\\.|[^\]\\])*\]/g, ' ').replace(/\\[dDwWsSbB]/g, ' ').replace(/\\(.)/g, '$1');
    const words = plain.match(/[A-Za-z][A-Za-z0-9_]{2,}/g) ?? [];
    words.forEach((w, i) => add(w, anchored && i === 0 && plain.slice(1).startsWith(w) ? 'prefix' : 'substring', ci, where));
  };
  for (const [dir, lookupsOnly] of dirs) {
    for (const [file, text] of sourceFiles(dir)) {
      const where = path.relative('.', file);
      for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
        const lit = m[2];
        const lead = text.slice(Math.max(0, m.index - 48), m.index);
        const ctx = /\.startsWith\(\s*$/.test(lead) ? 'prefix'
          : /\.(includes|indexOf|lastIndexOf|endsWith|search|match)\(\s*$/.test(lead) ? 'substring'
            : /RegExp\(\s*$/.test(lead) ? 'regex'
              : /(getObjectByName|getNodeByName|name\S{0,24}\s*[!=]==?)\s*\(?\s*$/.test(lead) ? 'exact' : '';
        if (lookupsOnly && !ctx) continue;
        const ci = /to(Lower|Upper)Case\(\)[^;]{0,24}$/.test(lead);
        if (ctx === 'regex') { regexWords(lit, /^\s*,\s*['"`][a-z]*i/.test(text.slice(m.index + m[0].length, m.index + m[0].length + 12)), where); continue; }
        if (m[1] === '`' && lit.includes('${')) { add(lit.split('${')[0], 'prefix', ci, where); continue; }   // `Emissive_${x}` reads every Emissive_*
        add(lit, ctx || (/[_\-.:]$/.test(lit) ? 'prefix' : 'exact'), ci, where);
      }
      for (const m of text.matchAll(/(?:^|[=(,:!&|?{};[]|\breturn)\s*\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])*)\/([dgimsuvy]*)/gm)) {
        if (lookupsOnly && !/name/i.test(text.slice(m.index, m.index + m[0].length + 40))) continue;
        regexWords(m[1], m[2].includes('i'), where);
      }
      if (!lookupsOnly && /bufferViews|0x46546c67|0x4e4f534a/i.test(text) && !/meshopt/i.test(text)) glbParsers.push(where);
    }
  }
  return { patterns: [...patterns.values()], glbParsers };
}

/** Error-bounded simplification, weighting normals (0.1) so shading detail survives, bounds locked. */
function simplifyAll() {
  const b = getBounds(scene);
  const extent = Math.max(...[0, 1, 2].map((k) => b.max[k] - b.min[k]));
  const keptMeshes = new Set([...keep.keys()].map((n) => n.getMesh()));
  for (const mesh of root.listMeshes()) {
    if (keptMeshes.has(mesh)) continue;
    const scales = mesh.listParents().filter((p) => p.propertyType === 'Node').map(worldScale);
    const scale = scales.length ? Math.max(1e-9, ...scales) : 1;
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), I = prim.getIndices();
      if (prim.getMode() !== 4 || !I || prim.listTargets().length || prim.getAttribute('JOINTS_0') || P.getComponentType() !== 5126) continue;
      const pos = P.getArray(), n = P.getCount(), before = I.getCount() / 3;
      const lock = new Uint8Array(n);
      for (let k = 0; k < 3; k++) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < n; i++) { lo = Math.min(lo, pos[i * 3 + k]); hi = Math.max(hi, pos[i * 3 + k]); }
        for (let i = 0; i < n; i++) if (pos[i * 3 + k] === lo || pos[i * 3 + k] === hi) lock[i] = 1;
      }
      const N = prim.getAttribute('NORMAL');
      const attr = N && N.getComponentType() === 5126 ? new Float32Array(N.getArray()) : new Float32Array(0);
      const [idx] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(I.getArray()), new Float32Array(pos), 3, attr,
        attr.length ? 3 : 0, attr.length ? [0.1, 0.1, 0.1] : [], lock, 0, S.simplify * extent / scale, ['ErrorAbsolute']);
      if (idx.length / 3 >= before * 0.98) continue;
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(I.getBuffer()));
      compactPrimitive(prim);
      notes.push(`simplified ${mesh.getName() || 'mesh'}: ${before} -> ${idx.length / 3} triangles`);
    }
  }
}
function worldScale(node) {
  const m = node.getWorldMatrix();
  return Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
}

/** Level geometry: vertices renumbered by first use; triangle order (draw order of coplanar faces) untouched. */
function renumberByFirstUse() {
  for (const prim of root.listMeshes().flatMap((m) => m.listPrimitives())) {
    const I = prim.getIndices(); if (!I) continue;
    const n = prim.getAttribute('POSITION').getCount(), ia = I.getArray();
    const map = new Int32Array(n).fill(-1); let next = 0;
    const ni = new ia.constructor(ia.length);
    for (let t = 0; t < ia.length; t++) { if (map[ia[t]] < 0) map[ia[t]] = next++; ni[t] = map[ia[t]]; }
    for (const sem of prim.listSemantics()) {   // fresh accessors: after dedup, primitives can share one
      const a = prim.getAttribute(sem), es = a.getElementSize(), arr = a.getArray(), o = new arr.constructor(next * es);
      for (let v = 0; v < n; v++) if (map[v] >= 0) for (let c = 0; c < es; c++) o[map[v] * es + c] = arr[v * es + c];
      prim.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(o).setNormalized(a.getNormalized()).setBuffer(a.getBuffer()));
    }
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(ni).setBuffer(I.getBuffer()));
  }
  // Only the replaced accessors go; nodes are never pruned.
  for (const a of root.listAccessors()) if (a.listParents().every((p) => p.propertyType === 'Root')) a.dispose();
}

// ---------------------------------------------------------------------------------------------- textures
function textureUses(d) {
  const uses = new Map();
  for (const mat of d.getRoot().listMaterials()) {
    for (const [kind, slot] of Object.entries(KINDS)) {
      const tex = mat[`get${kind}Texture`](); if (!tex) continue;
      const info = mat[`get${kind}TextureInfo`]();
      const u = uses.get(tex) ?? { slots: new Set(), refs: [] };
      u.slots.add(slot); u.refs.push({ mat, kind, texCoord: info.getTexCoord(), transformed: !!info.getExtension('KHR_texture_transform') });
      uses.set(tex, u);
    }
  }
  for (const u of uses.values()) u.slot = u.slots.size === 1 ? [...u.slots][0] : [...u.slots].every((s) => s === 'base' || s === 'emissive') ? 'base' : 'other';
  return uses;
}
/** kind -> "WxH" for every texture a material uses, for the pairing check. */
function textureSizes(mat) {
  return new Map(Object.keys(KINDS).map((k) => [k, mat[`get${k}Texture`]()?.getSize()?.join('x')]).filter(([, s]) => s));
}
/** code-driven: textures of one material that had the same size (a base and the mask code pairs with it) must still match. */
function pairingBreaks() {
  const bad = [];
  for (const [mat, was] of sizesIn) {
    if (mat.isDisposed()) continue;
    const now = textureSizes(mat);
    const kinds = [...was.keys()].filter((k) => now.has(k));
    for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
      const [a, b] = [kinds[i], kinds[j]];
      if (was.get(a) === was.get(b) && now.get(a) !== now.get(b)) bad.push(`${mat.getName() || 'material'} ${a} ${now.get(a)} vs ${b} ${now.get(b)}`);
    }
  }
  return bad;
}

/** A slot the preset keeps, resized under --max-texture: the texture's own format, lossless staying lossless. */
function ownFormat(tex, slot) {
  const mime = tex.getMimeType(), img = tex.getImage();
  if (mime === 'image/jpeg') return { kind: 'encode', format: 'jpeg', edge: 0, quality: slot === 'normal' ? 92 : 90 };
  if (mime === 'image/png') return { kind: 'encode', format: 'png', edge: 0 };
  if (mime === 'image/webp') return { kind: 'encode', format: webpIsLossless(img) ? 'webp-lossless' : 'webp', edge: 0, quality: 90 };
  if (mime === 'image/ktx2' && !P.noKtx) {
    return ktx2Encoding(tex) === 'etc1s' ? { kind: 'encode', format: 'etc1s', edge: 0, quality: 255 } : { kind: 'encode', format: 'uastc', edge: 0, quality: 2 };
  }
  return null;
}
/** 'etc1s' or 'uastc' for a Basis Universal KTX2 image, otherwise null. */
function ktx2Encoding(tex) {
  const img = tex.getImage();
  if (tex.getMimeType() !== 'image/ktx2' || !img || img.byteLength < 80) return null;
  const v = new DataView(img.buffer, img.byteOffset, img.byteLength);
  if (v.getUint32(44, true) === 1) return 'etc1s';   // supercompressionScheme 1: BasisLZ
  const dfd = v.getUint32(48, true);                  // the data format descriptor's colour model
  return dfd + 16 <= img.byteLength && v.getUint8(dfd + 12) === 166 ? 'uastc' : null;   // KHR_DF_MODEL_UASTC
}
function webpIsLossless(img) {
  const b = Buffer.from(img.buffer, img.byteOffset, img.byteLength);
  for (let o = 12; o + 8 <= b.length; o += 8 + b.readUInt32LE(o + 4) + (b.readUInt32LE(o + 4) & 1)) {
    const cc = b.toString('latin1', o, o + 4);
    if (cc === 'VP8L') return true;
    if (cc === 'VP8 ') return false;
  }
  return false;
}

async function processTextures() {
  const uses = textureUses(doc);
  const decoded = new Map();
  const get = async (tex) => decoded.get(tex) ?? decoded.set(tex, await decode(tex)).get(tex);
  const prims = (mat) => root.listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial() === mat);

  // ORM dropped: constant roughness/metalness from the map's mean, and its AO kept for the base map
  // when both maps read the same UVs the same way (the bake copies texel for texel).
  const aoFor = new Map();
  const keptKtx2 = [];
  if (S.tex.orm.kind === 'drop') {
    for (const mat of root.listMaterials()) {
      const mr = mat.getMetallicRoughnessTexture(), occ = mat.getOcclusionTexture(), base = mat.getBaseColorTexture();
      if (mr) {
        const img = await get(mr), cov = coverage(img.w, img.h, [{ mat, texCoord: mat.getMetallicRoughnessTextureInfo().getTexCoord() }]);
        const any = cov?.some(Boolean);
        let g = 0, bl = 0, c = 0;
        for (let i = 0; i < img.w * img.h; i++) if (!any || cov[i]) { g += img.px[i * 4 + 1]; bl += img.px[i * 4 + 2]; c++; }
        const rough = +(mat.getRoughnessFactor() * g / c / 255).toFixed(2), metal = +(mat.getMetallicFactor() * bl / c / 255).toFixed(2);
        mat.setRoughnessFactor(rough).setMetallicFactor(metal);
        notes.push(`${mat.getName() || 'material'}: ORM dropped, roughness ${rough}, metalness ${metal}${metal > 0.1 ? ' (warning: metal loses its map; consider --orm=uastc:512)' : ''}`);
      }
      if (occ && base && S.ao > 0) {
        const oi = mat.getOcclusionTextureInfo(), bi = mat.getBaseColorTextureInfo();
        const why = oi.getTexCoord() !== bi.getTexCoord() ? `the occlusion map reads TEXCOORD_${oi.getTexCoord()} and the base map TEXCOORD_${bi.getTexCoord()}`
          : oi.getExtension('KHR_texture_transform') || bi.getExtension('KHR_texture_transform') ? 'a KHR_texture_transform moves one of them'
            : aoFor.has(base) && aoFor.get(base).occ !== occ ? 'another material pairs the same base map with a different occlusion map' : '';
        if (why) { aoFor.set(base, { skip: true, occ }); notes.push(`AO not baked into ${base.getName() || 'the base map'}: ${why}. Check the dark-scene A/B`); }
        else if (!aoFor.get(base)?.skip) aoFor.set(base, { occ, img: await get(occ) });
      }
      mat.setMetallicRoughnessTexture(null).setOcclusionTexture(null);
    }
  }
  if (S.tex.normal.kind === 'drop') {
    for (const mat of root.listMaterials()) {
      if (!mat.getNormalTexture()) continue;
      mat.setNormalTexture(null);
      for (const p of prims(mat)) p.setAttribute('TANGENT', null);
    }
  }

  for (const [tex, u] of uses) {
    if (!u.refs.some((r) => r.mat[`get${r.kind}Texture`]() === tex)) continue;   // every slot it filled was dropped
    let spec = u.slot === 'other' ? { kind: 'keep' } : S.tex[u.slot];
    if (u.slot === 'other') notes.push(`texture ${tex.getName() || '?'} kept: used in several different slots`);
    const [w0, h0] = tex.getSize() ?? [0, 0];
    if (spec.kind === 'keep' && S.maxTex && Math.max(w0, h0) > S.maxTex) {
      const own = ownFormat(tex, u.slot);
      if (own) { spec = own; notes.push(`texture ${tex.getName() || '?'} (${u.slot}, kept by the preset) resized to the ${S.maxTex} cap as ${own.format}`); }
      else notes.push(`warning: texture ${tex.getName() || '?'} stays ${w0}x${h0}, over --max-texture: this preset cannot re-encode ${tex.getMimeType()}`);
    }
    const ao = aoFor.get(tex);
    if (spec.kind !== 'encode' && ao?.img) notes.push(`AO not baked into ${tex.getName() || 'the base map'}: it is kept as it is`);
    if (spec.kind !== 'encode') continue;
    // A library character's atlas is already UASTC: re-encoding it is a second lossy generation.
    const has = ktx2Encoding(tex);
    if (has === spec.format && Math.max(w0, h0) <= Math.min(spec.edge || Infinity, S.maxTex || Infinity) && !ao?.img && !S.explicit.has(u.slot)) {
      keptKtx2.push({ name: `${tex.getName() || '?'} (${has} ${w0}x${h0})`, slot: u.slot, format: has });
      continue;
    }
    const img = await get(tex);
    let changed = false;
    if (ao?.img) { bakeAO(img, ao.img, S.ao); changed = true; notes.push(`AO baked into ${tex.getName() || 'base map'} (weight ${S.ao})`); }
    const edge = Math.min(spec.edge || Infinity, S.maxTex || Infinity);
    const ktx = spec.format === 'etc1s' || spec.format === 'uastc';
    const scale = Math.min(1, edge / Math.max(img.w, img.h));
    let w = Math.max(1, Math.round(img.w * scale)), h = Math.max(1, Math.round(img.h * scale));
    if (ktx) { w = Math.max(4, Math.round(w / 4) * 4); h = Math.max(4, Math.round(h / 4) * 4); }
    const mime = { jpeg: 'image/jpeg', webp: 'image/webp', 'webp-lossless': 'image/webp', png: 'image/png' }[spec.format] ?? 'image/ktx2';
    if (!changed && w === img.w && h === img.h && mime === tex.getMimeType() && mime !== 'image/ktx2') continue;   // no second-generation loss
    if (img.deep && (spec.format === 'png' || spec.format === 'webp-lossless')) {   // "lossless" here means 8 bits per channel
      if (!changed && w === img.w && h === img.h) { notes.push(`texture ${tex.getName() || '?'} kept as it is: it is 16-bit, and ${spec.format} would cut it to 8 bits per channel`); continue; }
      notes.push(`warning: texture ${tex.getName() || '?'} is 16-bit; resized, it is written with 8 bits per channel`);
    }
    if (w * 2 <= img.w) {
      const cov = u.refs.some((r) => r.transformed) ? null : coverage(img.w, img.h, u.refs.map((r) => ({ mat: r.mat, texCoord: r.texCoord })));
      if (cov) fillGutters(img, cov);
    }
    const srgb = u.slot === 'base' || u.slot === 'emissive';
    const encoded = await encode(img, w, h, spec, srgb);
    if (!changed && w === img.w && h === img.h && encoded.bytes.length >= tex.getImage().byteLength) {
      notes.push(`texture ${tex.getName() || '?'} kept: the ${spec.format} re-encode was not smaller than the original`);
      continue;
    }
    tex.setImage(new Uint8Array(encoded.bytes)).setMimeType(encoded.mime);
  }

  if (keptKtx2.length) {
    const [first] = keptKtx2;
    const example = String(P.tex[first.slot]).startsWith(`${first.format}:`) ? P.tex[first.slot] : `${first.format}:1024`;
    notes.push(`KTX2 kept as it is, already in the slot's encoding at no more than its edge (a re-encode is a second lossy generation): `
      + `${keptKtx2.map((k) => k.name).join(', ')}. An explicit spec such as --${first.slot}=${example} re-encodes it for fewer `
      + 'bytes; that output then has to pass the A/B');
  }
  const mimes = new Set(root.listTextures().map((t) => t.getMimeType()));
  for (const [ext, mime] of [[X.KHRTextureBasisu, 'image/ktx2'], [X.EXTTextureWebP, 'image/webp']]) {
    const used = root.listExtensionsUsed().find((e) => e.extensionName === ext.EXTENSION_NAME);
    if (mimes.has(mime)) doc.createExtension(ext).setRequired(true);
    else used?.dispose();
  }
}

function ktxTool(args) {
  if (!ktxState.checked) {
    ktxState.checked = true;
    try {
      const v = execFileSync('ktx', ['--version'], { stdio: 'pipe' }).toString().trim();
      if (!/(?:^|\D)4\.4\./.test(v)) notes.push(`warning: KTX-Software reports "${v}", not the 4.4 this script was tested with (references/tools.md)`);
    } catch { /* the real call below reports a missing tool */ }
  }
  execFileSync('ktx', args, { stdio: 'pipe' });
}

async function decode(tex) {
  let bytes = Buffer.from(tex.getImage());
  if (tex.getMimeType() === 'image/ktx2') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'optglb-'));
    try {
      fs.writeFileSync(path.join(dir, 'in.ktx2'), bytes);
      ktxTool(['extract', '--transcode', 'rgba8', path.join(dir, 'in.ktx2'), path.join(dir, 'out.png')]);
      bytes = fs.readFileSync(path.join(dir, 'out.png'));
    } catch (e) {
      die(`cannot decode the KTX2 texture ${tex.getName() || ''} (${e.message.split('\n')[0]}). Is KTX-Software installed? See references/tools.md.`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const deep = (await sharp(bytes).metadata()).depth === 'ushort';
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minAlpha = 255;
  for (let i = 3; i < data.length && minAlpha; i += 4) minAlpha = Math.min(minAlpha, data[i]);
  // Lossy encodes treat alpha 250+ as opaque; lossless ones keep every value (minAlpha).
  return { px: data, w: info.width, h: info.height, alpha: minAlpha < 250, minAlpha, deep };
}

/** base x (1 - w(1 - ao)) in linear light, AO from the occlusion map's red channel. */
function bakeAO(img, ao, weight) {
  const aoPx = resizeNearest(ao, img.w, img.h);
  const lin = Array.from({ length: 256 }, (_, c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const enc = (l) => Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055));
  for (let i = 0; i < img.w * img.h; i++) {
    const f = 1 - weight * (1 - aoPx[i * 4] / 255);
    for (let c = 0; c < 3; c++) img.px[i * 4 + c] = enc(lin[img.px[i * 4 + c]] * f);
  }
}
/** Nearest-neighbour resize of decoded RGBA (the AO map only needs to line up, not to be pretty). */
function resizeNearest(img, w, h) {
  if (img.w === w && img.h === h) return img.px;
  const res = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (Math.min(img.h - 1, Math.floor((y + 0.5) * img.h / h)) * img.w + Math.min(img.w - 1, Math.floor((x + 0.5) * img.w / w))) * 4;
    res.set(img.px.subarray(s, s + 4), (y * w + x) * 4);
  }
  return res;
}

/** Texels any triangle covers (1 px conservative), or null when UVs tile and gutters do not exist. */
function coverage(w, h, refs) {
  const mask = new Uint8Array(w * h);
  const el = [0, 0];
  for (const { mat, texCoord } of refs) {
    for (const prim of root.listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial() === mat)) {
      const uv = prim.getAttribute(`TEXCOORD_${texCoord}`), I = prim.getIndices();
      if (!uv || !I) return null;
      const U = new Float32Array(uv.getCount() * 2);
      for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, el); U[i * 2] = el[0] * w; U[i * 2 + 1] = el[1] * h; }
      if (U.some((v, i) => v < -0.01 * (i % 2 ? h : w) || v > 1.01 * (i % 2 ? h : w))) return null;
      const ia = I.getArray();
      for (let t = 0; t < ia.length; t += 3) {
        const [ax, ay, bx, by, cx, cy] = [U[ia[t] * 2], U[ia[t] * 2 + 1], U[ia[t + 1] * 2], U[ia[t + 1] * 2 + 1], U[ia[t + 2] * 2], U[ia[t + 2] * 2 + 1]];
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (!area) continue;
        const s = Math.sign(area);
        const edges = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]].map(([x0, y0, x1, y1]) => [x0, y0, x1 - x0, y1 - y0, Math.hypot(x1 - x0, y1 - y0) || 1]);
        for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1)); y <= Math.min(h - 1, Math.ceil(Math.max(ay, by, cy) + 1)); y++) {
          for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1)); x <= Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx) + 1)); x++) {
            if (edges.every(([x0, y0, dx, dy, len]) => s * (dx * (y + 0.5 - y0) - dy * (x + 0.5 - x0)) / len >= -1)) mask[y * w + x] = 1;
          }
        }
      }
    }
  }
  return mask;
}

/** Push-pull: every uncovered texel takes the average of the covered ones nearest it, so seams do not bleed when downsized. */
function fillGutters(img, mask) {
  const pull = (px, m, w, h) => {
    if (w <= 1 && h <= 1) return;
    const W = Math.ceil(w / 2), H = Math.ceil(h / 2), cp = new Float32Array(W * H * 4), cm = new Float32Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!m[i]) continue;
      const j = (y >> 1) * W + (x >> 1); cm[j]++;
      for (let c = 0; c < 4; c++) cp[j * 4 + c] += px[i * 4 + c];
    }
    let holes = false;
    for (let j = 0; j < W * H; j++) if (cm[j]) { for (let c = 0; c < 4; c++) cp[j * 4 + c] /= cm[j]; cm[j] = 1; } else holes = true;
    if (holes) pull(cp, cm, W, H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (m[i]) continue;
      const j = (y >> 1) * W + (x >> 1);
      for (let c = 0; c < 4; c++) px[i * 4 + c] = cp[j * 4 + c];
    }
  };
  if (!mask.some(Boolean)) return;
  const f = Float32Array.from(img.px);
  pull(f, mask, img.w, img.h);
  for (let i = 0; i < f.length; i++) img.px[i] = Math.round(f[i]);
}

async function encode(img, w, h, spec, srgb) {
  const base = sharp(img.px, { raw: { width: img.w, height: img.h, channels: 4 } }).resize(w, h, { kernel: 'lanczos3', fit: 'fill' });
  const lossless = spec.format === 'png' || spec.format === 'webp-lossless';
  const s = (lossless ? img.minAlpha < 255 : img.alpha) ? base : base.removeAlpha();
  const q = spec.quality;
  if (spec.format === 'jpeg' && !img.alpha) return { bytes: await s.jpeg({ quality: q ?? 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer(), mime: 'image/jpeg' };
  if (spec.format === 'jpeg') notes.push('a texture with transparency was written as WebP: JPEG has no alpha');
  if (spec.format === 'webp' || spec.format === 'jpeg') return { bytes: await s.webp({ quality: q ?? 90, effort: 6, smartSubsample: false, alphaQuality: 100 }).toBuffer(), mime: 'image/webp' };
  // exact: libwebp otherwise rewrites the colour under fully transparent texels, and code may read it.
  if (spec.format === 'webp-lossless') return { bytes: await s.webp({ lossless: true, exact: true, effort: 6 }).toBuffer(), mime: 'image/webp' };
  if (spec.format === 'png') return { bytes: await s.png({ compressionLevel: 9, effort: 10 }).toBuffer(), mime: 'image/png' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'optglb-'));
  try {
    fs.writeFileSync(path.join(dir, 'in.png'), await s.png({ compressionLevel: 1 }).toBuffer());
    const args = ['create', '--generate-mipmap', '--mipmap-filter', 'lanczos4', '--threads', '4',
      '--format', `${img.alpha ? 'R8G8B8A8' : 'R8G8B8'}_${srgb ? 'SRGB' : 'UNORM'}`,
      '--assign-tf', srgb ? 'srgb' : 'linear', '--assign-primaries', srgb ? 'bt709' : 'none'];
    if (spec.format === 'etc1s') args.push('--encode', 'basis-lz', '--clevel', '4', '--qlevel', String(q ?? 255));
    else args.push('--encode', 'uastc', '--uastc-quality', '2', '--zstd', '18', ...((q ?? 2) > 0 ? ['--uastc-rdo', '--uastc-rdo-l', String(q ?? 2)] : []));
    ktxTool([...args, path.join(dir, 'in.png'), path.join(dir, 'out.ktx2')]);
    return { bytes: fs.readFileSync(path.join(dir, 'out.ktx2')), mime: 'image/ktx2' };
  } catch (e) {
    die(`ktx failed (${e.message.split('\n')[0]}). Is KTX-Software on PATH? See references/tools.md.`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------------------------- checks + report
function nodeNames(d) { return d.getRoot().listNodes().map((n) => n.getName()).filter(Boolean).sort(); }

function checkToolVersions() {
  const off = Object.entries(TESTED).map(([pkg, want]) => {
    try { return [pkg, want, JSON.parse(fs.readFileSync(path.join(G, pkg, 'package.json'), 'utf8')).version]; } catch { return [pkg, want, 'missing']; }
  }).filter(([, want, got]) => got !== want);
  if (off.length) {
    notes.push(`warning: the shared tools differ from the versions this script was tested with (${off.map(([p, w, g]) => `${p} ${g}, tested ${w}`).join('; ')}). `
      + 'Their defaults can change between versions: reinstall them as references/tools.md pins them');
  }
}

function checkOutput(o, glb) {
  const c = [];
  const got = nodeNames(o);
  const missing = namesIn.filter((n, i, a) => got.filter((g) => g === n).length < a.filter((x) => x === n).length);
  c.push({ name: 'node names', fail: missing.length > 0, detail: missing.length ? `missing: ${[...new Set(missing)].slice(0, 5).join(', ')}` : `${namesIn.length} kept` });
  c.push({ name: 'texture slots', fail: lostSlots.length > 0, detail: lostSlots.length ? `lost: ${lostSlots.slice(0, 5).join(', ')}` : `${liveSlots.length} kept` });
  if (P.pairs) {
    c.push({ name: 'paired sizes', fail: unpaired.length > 0,
      detail: unpaired.length ? `${unpaired.slice(0, 3).join('; ')} (code pairing a base map with its mask falls back to the stock look)` : 'same-size textures still match' });
  }
  // SEPARATE layout: no buffer view holds more than one vertex attribute.
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const perView = new Map();
  for (const m of json.meshes ?? []) for (const p of m.primitives) for (const a of Object.values(p.attributes)) {
    const v = json.accessors[a].bufferView; if (v === undefined) continue;
    perView.set(v, (perView.get(v) ?? new Set()).add(a));
  }
  const inter = [...perView.values()].filter((s) => s.size > 1).length;
  c.push({ name: 'vertex layout', fail: inter > 0, detail: inter ? `${inter} interleaved buffer views (WebGPU crash)` : 'separate' });
  const bad = [];
  for (const k of snap) {
    const n = o.getRoot().listNodes().find((x) => x.getName() === k.n.getName());
    const same = n && [...n.getTranslation(), ...n.getRotation(), ...n.getScale()].every((v, i) => Math.abs(v - [...k.t, ...k.r, ...k.s][i]) < 1e-6);
    const float = n?.getMesh()?.listPrimitives().every((p) => p.getAttribute('POSITION').getComponentType() === 5126);
    if (!same || !float) bad.push(k.n.getName());
  }
  if (snap.length) c.push({ name: 'kept-exact nodes', fail: bad.length > 0, detail: bad.length ? `moved: ${bad.join(', ')}` : `${snap.length} unchanged` });
  const skinnedQuantized = o.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).some((p) => p.getAttribute('JOINTS_0') && p.getAttribute('POSITION').getComponentType() !== 5126);
  if (deforming) c.push({ name: 'skinned positions', fail: skinnedQuantized, detail: skinnedQuantized ? 'quantized: bind pose moves' : 'float32' });
  const [b0, b1] = [getBounds(before.getRoot().getDefaultScene() ?? before.getRoot().listScenes()[0]), getBounds(o.getRoot().getDefaultScene() ?? o.getRoot().listScenes()[0])];
  const ext = Math.max(...[0, 1, 2].map((k) => b0.max[k] - b0.min[k])) || 1;
  const drift = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(b1.min[k] - b0.min[k]), Math.abs(b1.max[k] - b0.max[k])])) / ext;
  c.push({ name: 'bounds', fail: drift > 0.005, detail: `${(drift * 100).toFixed(3)}% of size${drift > 0.005 ? ' (the engine rescales and re-centres on these)' : ''}` });
  const smaller = glb.length < statsBefore.bytes;
  c.push({ name: 'smaller', fail: !smaller, detail: smaller ? `${mb(statsBefore.bytes - glb.length)} saved` : 'the output is not smaller than the input: keep the original' });
  return c;
}

async function validate(glb, original) {
  let validator;
  try { validator = createRequire(import.meta.url)(path.join(G, 'gltf-validator')); } catch { return { name: 'Khronos validator', detail: 'not installed, skipped' }; }
  // This validator build predates KTX2 images: it flags their mime type and format. Not a defect.
  const ktx = (m) => /^\/images\/\d+/.test(m.pointer ?? '') && ['VALUE_NOT_IN_LIST', 'IMAGE_UNRECOGNIZED_FORMAT'].includes(m.code);
  const issues = async (b, severity) => (await validator.validateBytes(new Uint8Array(b), { maxIssues: 200 })).issues.messages
    .filter((m) => m.severity === severity && !ktx(m));
  const [errs, warns, had] = [await issues(glb, 0), await issues(glb, 1), new Set((await issues(original, 0)).map((m) => m.code))];
  const fresh = errs.filter((m) => !had.has(m.code));   // an error the original already had is not this run's doing
  return { name: 'Khronos validator', fail: fresh.length > 0,
    detail: `${errs.length} errors (${fresh.length} new), ${warns.length} warnings${[...fresh, ...warns].slice(0, 3).map((m) => `; ${m.code} ${m.pointer ?? ''}`).join('')}` };
}

function stats(d, fileBytes) {
  const r = d.getRoot();
  const prims = r.listMeshes().flatMap((m) => m.listPrimitives());
  const acc = new Set(prims.flatMap((p) => [...p.listAttributes(), p.getIndices()].filter(Boolean)));
  const uses = textureUses(d);
  const textures = r.listTextures().map((t) => {
    const [w, h] = t.getSize() ?? [0, 0];
    const ktx = t.getMimeType() === 'image/ktx2';
    return { name: t.getName() || t.getURI() || '?', slot: uses.get(t)?.slot ?? '-', w, h, mime: t.getMimeType().replace('image/', ''),
      bytes: t.getImage()?.byteLength ?? 0, gpu: Math.round(w * h * (ktx ? 1 : 4) * 4 / 3) };
  });
  return {
    bytes: fileBytes,
    triangles: prims.reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0),
    vertices: [...new Set(prims.map((p) => p.getAttribute('POSITION')))].reduce((n, a) => n + a.getCount(), 0),
    nodes: r.listNodes().length, skins: r.listSkins().length, animations: r.listAnimations().length,
    gpuGeometry: [...acc].reduce((n, a) => n + a.getByteLength(), 0),
    gpuTextures: textures.reduce((n, t) => n + t.gpu, 0),
    textures,
    extensions: r.listExtensionsUsed().map((e) => e.extensionName),
  };
}

function printStats(file, s) {
  console.log(`${file}: ${mb(s.bytes)}, ${s.triangles.toLocaleString()} triangles, ${s.vertices.toLocaleString()} vertices, ${s.nodes} nodes, ${s.skins} skins, ${s.animations} clips`);
  console.log(`  GPU estimate: textures ${mb(s.gpuTextures)}, geometry ${mb(s.gpuGeometry)}`);
  for (const t of s.textures) console.log(`  texture ${t.name.slice(0, 28).padEnd(28)} ${t.slot.padEnd(8)} ${`${t.w}x${t.h}`.padEnd(9)} ${t.mime.padEnd(5)} ${mb(t.bytes).padStart(10)}  GPU ${mb(t.gpu)}`);
  console.log(`  extensions: ${s.extensions.join(', ') || 'none'}`);
  if (s.extensions.includes('EXT_meshopt_compression')) console.log('  already EXT_meshopt_compression: probably an optimized variant. Optimize its original instead');
}
function printReport() {
  const pct = (a, b) => (a ? `${b <= a ? '-' : '+'}${Math.abs(100 - (b / a) * 100).toFixed(0)}%` : '');
  const row = (label, a, b, f = (v) => v.toLocaleString()) => console.log(`  ${label.padEnd(20)} ${f(a).padStart(12)} -> ${f(b).padStart(12)}  ${pct(a, b)}`);
  console.log(`${src} -> ${dst}   preset ${flag('preset')}`);
  row('file (transfer)', statsBefore.bytes, statsAfter.bytes, mb);
  row('triangles', statsBefore.triangles, statsAfter.triangles);
  row('GPU textures (est)', statsBefore.gpuTextures, statsAfter.gpuTextures, mb);
  row('GPU geometry (est)', statsBefore.gpuGeometry, statsAfter.gpuGeometry, mb);
  console.log('  textures after:');
  for (const t of statsAfter.textures) console.log(`    ${t.name.slice(0, 28).padEnd(28)} ${t.slot.padEnd(8)} ${`${t.w}x${t.h}`.padEnd(9)} ${t.mime.padEnd(5)} ${mb(t.bytes).padStart(10)}`);
  if (statsAfter.extensions.includes('KHR_texture_basisu') && !statsBefore.extensions.includes('KHR_texture_basisu')) {
    notes.push('first KTX2 texture in this file: if no other asset in the game uses KTX2, players also download the Basis transcoder (~0.25 MB). '
      + 'On WebGPU, an engine without the KTX2 wait fails a KTX2 file that loads during boot (SKILL.md step 5)');
  }
  if (S.meshopt) notes.push('EXT_meshopt_compression: needs an engine that attaches the meshopt decoder, or a game-side one (SKILL.md step 5)');
  for (const n of notes) console.log(`  note: ${n}`);
  for (const c of checks) console.log(`  ${c.fail ? 'FAIL' : 'ok  '} ${c.name}: ${c.detail}`);
}

/** Download size of a URL from a HEAD request (the transfer size when the CDN compresses it), or 0. */
async function headSize(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    const n = Number(r.headers.get('content-length'));
    return r.ok && n > 0 ? n : 0;
  } catch { return 0; }
}

async function audit(worldPath) {
  if (!fs.existsSync(worldPath)) die(`no ${worldPath}`);
  const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
  const elsewhere = JSON.stringify({ ...world, assets: undefined });
  if (!fs.existsSync('src')) console.log('warning: no src/ here, so the "used" column cannot see code. Run the audit from the project root.');
  const source = sourceFiles('src').map(([, text]) => text).join('\n');
  const quoted = (s) => ['\'', '"', '`'].some((q) => source.includes(`${q}${s}${q}`));
  const rows = (world.assets ?? []).map((a) => {
    const url = String(a.url ?? ''), file = url.split('?')[0].split('/').pop() ?? '', name = String(a.name ?? '');
    const inCode = source.includes(a.id) || (url !== '' && source.includes(url)) || (file.length >= 8 && source.includes(file)) || (name.length >= 3 && quoted(name));
    return { id: a.id, name, type: a.type ?? '?', size: Number(a.size) || 0, headed: false, url, file: file.slice(-44),
      used: elsewhere.includes(a.id) || (url !== '' && elsewhere.includes(url)) ? 'world' : inCode ? 'code' : '-',
      variant: VARIANT_NAME.test(name) || VARIANT_NAME.test(file.replace(/\.[a-z0-9]+$/i, '')) };
  });
  const unsized = rows.filter((r) => !r.size && /^https?:\/\//.test(r.url));
  for (let i = 0; i < unsized.length; i += 6) {
    await Promise.all(unsized.slice(i, i + 6).map(async (r) => { r.size = await headSize(r.url); r.headed = r.size > 0; }));
  }
  rows.sort((a, b) => (Number(!a.size) - Number(!b.size)) * -1 || b.size - a.size);   // unknown sizes first: those need a look
  const total = rows.reduce((n, r) => n + r.size, 0);
  let running = 0;
  console.log('       size  cum%  used   type      name                           id  file');
  for (const r of rows) {
    running += r.size;
    const size = r.size ? `${r.headed ? '~' : ''}${mb(r.size)}` : 'unknown';
    const cum = r.size ? `${((running / (total || 1)) * 100).toFixed(0)}%` : '?';
    console.log(`${size.padStart(11)} ${cum.padStart(5)}  ${r.used.padEnd(6)} ${r.type.padEnd(9)} ${r.name.slice(0, 30).padEnd(30)} ${r.id}  ${r.file}${r.variant ? '  (variant?)' : ''}`);
  }
  const unknown = rows.filter((r) => !r.size).length, headed = rows.filter((r) => r.headed).length;
  console.log(`${mb(total).padStart(11)}  over ${rows.length} rows${headed ? ` (${headed} sized by a HEAD request, marked ~)` : ''}${unknown ? `; ${unknown} of unknown size, listed first: check them` : ''}.`);
  console.log('used: world = referenced elsewhere in world.json; code = its id, url, file name or quoted name is in src/; - = neither.');
  console.log('Neither "-" nor "world"/"code" proves what the game fetches: confirm the real download in the network panel.');
  if (rows.some((r) => r.variant)) console.log('(variant?) = the name looks like an optimized copy: optimize the original row, not the copy.');
}
