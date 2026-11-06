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
