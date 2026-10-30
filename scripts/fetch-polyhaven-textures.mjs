/**
 * fetch-polyhaven-textures.mjs — CC0 PBR detail textures for v3 (plan 10 S4).
 *
 * For each Poly Haven texture id below: licence check (the asset must be a Poly
 * Haven texture, type 1, and https://polyhaven.com/license must still state CC0),
 * download the 1k JPEG maps (diffuse, OpenGL normal, ARM = AO/roughness/metal),
 * verify each file's md5 against the Poly Haven files API, encode KTX2 with toktx
 * (diffuse: ETC1S sRGB; ARM: ETC1S linear; normal: UASTC linear + zstd, RGB = XYZ
 * in the OpenGL convention, so three.js normalMap reads it without a swizzle),
 * and write public/assets/textures/<id>_{diff,nor,arm}.ktx2 plus
 * public/assets/textures/manifest.json (authors, source, licence, md5s, the
 * real-world size each texture covers, bytes).
 *
 * Usage: node scripts/fetch-polyhaven-textures.mjs
 * Needs: toktx 4.4.2 (TOOLS.md; default path ~/ktx-software/bin/toktx, or $TOKTX).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertLicence, checkLicencePage } from './lib/licence.mjs';

const TOKTX = process.env.TOKTX || join(homedir(), 'ktx-software/bin/toktx');
const OUT = 'public/assets/textures';
const TMP = 'tmp/polyhaven-textures';
const UA = { 'User-Agent': 'ImmersiveLearningPortfolio/3.0' };

/** id -> what it is used for in Muir Inlet (illustrative surface detail only). */
const TEXTURES = {
  snow_field_aerial: 'snowfields and the upper glacier surface (accumulation zone)',
  aerial_rocks_02: 'bare bedrock and talus seen from a distance',
  rock_face: 'scraped bedrock close up (photo station, nunataks)',
  gravel_ground_01: 'moraine and glacial till',
  mossy_rock: 'moss colonising till (succession stage 1)',
};

const getJson = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status} ${u}`); return r.json(); };
const getBuf = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status} ${u}`); return Buffer.from(await r.arrayBuffer()); };

await checkLicencePage('https://polyhaven.com/license', /CC0/);
assertLicence('polyhaven', 'CC0 1.0');
mkdirSync(OUT, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const manifest = {};
for (const [id, use] of Object.entries(TEXTURES)) {
  const [info, files] = await Promise.all([getJson(`https://api.polyhaven.com/info/${id}`), getJson(`https://api.polyhaven.com/files/${id}`)]);
  if (info.type !== 1) throw new Error(`${id} is not a Poly Haven texture (type ${info.type})`);
  const maps = { diff: files.Diffuse['1k'].jpg, nor: files.nor_gl['1k'].jpg, arm: files.arm['1k'].jpg };
  const entry = {
    id,
    name: info.name,
    authors: Object.keys(info.authors || {}).join(', '),
    source: `https://polyhaven.com/a/${id}`,
    license: 'CC0 1.0',
    use,
    realWorldSizeM: info.dimensions ? info.dimensions.map((mm) => mm / 1000) : null,
    files: {},
  };
  for (const [kind, f] of Object.entries(maps)) {
    const jpg = await getBuf(f.url);
    const md5 = createHash('md5').update(jpg).digest('hex');
    if (md5 !== f.md5) throw new Error(`${id} ${kind}: md5 ${md5} != API ${f.md5}`);
    const src = join(TMP, `${id}_${kind}.jpg`);
    writeFileSync(src, jpg);
    const out = join(OUT, `${id}_${kind}.ktx2`);
    const args = ['--t2', '--genmipmap'];
    if (kind === 'diff') args.push('--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--assign_oetf', 'srgb');
    if (kind === 'arm') args.push('--encode', 'etc1s', '--clevel', '4', '--qlevel', '192', '--assign_oetf', 'linear');
    if (kind === 'nor') args.push('--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '4', '--zcmp', '18', '--assign_oetf', 'linear');
    execFileSync(TOKTX, [...args, out, src]);
    entry.files[kind] = { file: out.replace(/^public\//, ''), sourceUrl: f.url, md5, bytes: statSync(out).size };
  }
  manifest[id] = entry;
  console.log(id, Object.values(entry.files).map((x) => x.bytes));
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
rmSync(TMP, { recursive: true, force: true });
