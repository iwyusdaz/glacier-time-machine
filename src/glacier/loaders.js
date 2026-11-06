/**
 * loaders.js — shared KTX2 and glTF loaders with self-hosted decoders
 * (build contract 08 §5.1; same approach as lunar-field-expedition). The
 * Basis transcoder is served from `${BASE_URL}decoders/basis/` by
 * vite-plugin-decoders.js (template T-24: no string evaluation, so it decodes
 * under the showcase CSP); the meshopt decoder is bundled from the pinned three.
 * @module glacier/loaders
 */
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const BASE = import.meta.env?.BASE_URL || './';
let ktx2 = null, gltf = null;

export function getKTX2(renderer) {
  if (ktx2) return ktx2;
  ktx2 = new KTX2Loader().setTranscoderPath(`${BASE}decoders/basis/`).detectSupport(renderer);
  return ktx2;
}

export function getGLTF(renderer) {
  if (gltf) return gltf;
  gltf = new GLTFLoader().setKTX2Loader(getKTX2(renderer)).setMeshoptDecoder(MeshoptDecoder);
  return gltf;
}

/** Load a KTX2 texture (colour textures in sRGB, data textures linear). */
export async function loadKTX2(renderer, path, { srgb = true, repeat = false, anisotropy = 8 } = {}) {
  const tex = await getKTX2(renderer).loadAsync(`${BASE}${path}`);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

const glbCache = new Map();
/** Load a GLB once (later calls share the parsed scene; clone what you place). */
export function loadGLB(renderer, path) {
  if (!glbCache.has(path)) glbCache.set(path, getGLTF(renderer).loadAsync(`${BASE}${path}`));
  return glbCache.get(path);
}

/** Seeded RNG (never Math.random: the security hook flags it). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * A geometry with every attribute as plain Float32 values. The GLBs are
 * meshopt-quantized (KHR_mesh_quantization: normalized Int16 positions, the
 * dequantizing scale in the node matrix), so applyMatrix4 on the raw attribute
 * would clamp each vertex to [-1, 1] and squash a 17 m serac or a 28 m spruce
 * into a 2 m cube.
 */
export function floatGeometry(geo) {
  const g = geo.clone();
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k];
    if (!a.isInterleavedBufferAttribute && a.array instanceof Float32Array && !a.normalized) continue;
    const n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
    const get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) arr[i * s + j] = get[j].call(a, i);
    g.setAttribute(k, new THREE.BufferAttribute(arr, s));
  }
  return g;
}
/**
 * One glTF mesh's geometry at its authored size (node transform baked in),
 * centred on x/z with its own y kept (bergs keep their waterline at y = 0).
 */
export function bakedNodeGeometry(mesh) {
  mesh.updateWorldMatrix(true, false);
  const g = floatGeometry(mesh.geometry).applyMatrix4(mesh.matrixWorld);
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, 0, -c.z);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
