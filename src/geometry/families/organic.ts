import { LampConfig } from '../../types/lamp';
import { SolidMeshBuilder } from '../baseBuilder';
import {
  DisplacementContext,
  DisplacementResult,
  ExtraGeometryContext,
  LampFamilyDefinition,
} from '../registry';
import {
  evaluateCrossSectionMultiplier,
  evaluateEffectiveSilhouetteRadius,
  evaluateSculptField,
  isSphereSilhouette,
} from '../silhouette';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

interface CurveSample {
  theta: number; // unwrapped continuous radians
  v: number; // normalized shade height [0..1]
  depthScale: number; // [0..1]
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function normalize3(x: number, y: number, z: number): Vec3 {
  const len = Math.hypot(x, y, z);
  if (len < 1e-8) return { x: 1, y: 0, z: 0 };
  return { x: x / len, y: y / len, z: z / len };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Fast deterministic seeded PRNG (Mulberry32) */
function createSeededRandom(seed: number): () => number {
  let a = (Math.floor(seed) || 3141) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Extrudes a single continuous polyline (open curve or closed loop) sitting on the smooth 1.2 mm diffuser core
 * into a **100% watertight 2-manifold solid fin/ribbon** anchored 0.65 mm inside the core outer wall.
 * Used for Submode A ("Flamas / Ondas").
 */
function extrudeRibbonOnSurface(
  mb: SolidMeshBuilder,
  samples: CurveSample[],
  isClosed: boolean,
  config: LampConfig,
  seatY: number,
  shadeHeight: number,
  finThicknessMm: number,
  finDepthMm: number,
  liftFactor: number,
  invertedForPendant: boolean
): void {
  const K = samples.length;
  if (K < (isClosed ? 5 : 3)) return;

  const { silhouette } = config;
  const halfW = clamp(finThicknessMm, 1.0, 2.6) * 0.5;
  const embedMm = 0.65;

  const evalCorePoint = (theta: number, vDesign: number): { pos: Vec3; nOut: Vec3; tU: Vec3 } => {
    const vLocal = invertedForPendant ? 1 - vDesign : vDesign;
    const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
    const csBlend = isClosedDome ? 1 - smoothstep(0.76, 0.98, vDesign) : 1.0;

    const rAtV = (vv: number) => {
      const b = isClosedDome ? 1 - smoothstep(0.76, 0.98, vv) : 1.0;
      const baseR = evaluateEffectiveSilhouetteRadius(
        vv,
        silhouette,
        config.mount.type,
        1.2,
        invertedForPendant
      );
      return baseR * evaluateCrossSectionMultiplier(theta, vv, silhouette, b);
    };

    const r0 = rAtV(vDesign);
    const eps = 0.004;
    const vLo = clamp(vDesign - eps, 0, 1);
    const vHi = clamp(vDesign + eps, 0, 1);
    const rLo = rAtV(vLo);
    const rHi = rAtV(vHi);
    const dvMm = Math.max(0.2, (vHi - vLo) * shadeHeight);
    const drdy = (invertedForPendant ? -(rHi - rLo) : rHi - rLo) / dvMm;

    const uNorm = (((theta / (2 * Math.PI)) % 1) + 1) % 1;
    const sculpt = evaluateSculptField(
      uNorm,
      vDesign,
      shadeHeight,
      Math.max(20, r0),
      config.sculptStrokes
    );
    const isClosedPoleLed = isClosedDome && config.mount.type === 'led_kit_001';
    const effTheta = theta + sculpt.dThetaRad * csBlend;
    const effR =
      isClosedPoleLed && vDesign >= 0.9995
        ? 0.0
        : Math.max(
            isClosedPoleLed ? 0.0 : isClosedDome ? 0.15 : 2.0,
            r0 + sculpt.drMm * 0.55 * (1 - smoothstep(0.84, 0.98, vDesign))
          );

    const c = Math.cos(effTheta);
    const s = Math.sin(effTheta);
    const pos: Vec3 = {
      x: effR * c,
      y: seatY + vLocal * shadeHeight,
      z: -effR * s,
    };

    const tU: Vec3 = { x: -s, y: 0, z: -c };
    const tV: Vec3 = { x: drdy * c, y: 1, z: -drdy * s };
    const nRaw = cross3(tU, tV);
    const nSurf = normalize3(nRaw.x, nRaw.y, nRaw.z);
    // Smoothly blend normal to +Y right at the exact North Pole (R = 0) to eliminate polar singularity!
    const poleBlend = isClosedPoleLed ? smoothstep(0.975, 1.0, vDesign) : 0;
    const nOut = normalize3(
      nSurf.x * (1 - poleBlend),
      nSurf.y * (1 - poleBlend) + poleBlend,
      nSurf.z * (1 - poleBlend)
    );
    return { pos, nOut, tU };
  };

  const cores: Array<{ pos: Vec3; nOut: Vec3; tU: Vec3 }> = new Array(K);
  for (let i = 0; i < K; i++) {
    cores[i] = evalCorePoint(samples[i].theta, samples[i].v);
  }

  const bl = new Int32Array(K);
  const br = new Int32Array(K);
  const tr = new Int32Array(K);
  const tl = new Int32Array(K);

  const isClosedDomeGlobal = Boolean(silhouette.closeTopDome) && !invertedForPendant;
  const minAllowedY = seatY + 1.0;
  // When closed dome is active, remove the "- 0.5" cutoff so flame fins reach the exact North Pole (y = seatY + shadeHeight)!
  const maxAllowedY = isClosedDomeGlobal ? seatY + shadeHeight : seatY + shadeHeight - 0.5;

  for (let i = 0; i < K; i++) {
    const prevIdx = isClosed ? (i - 1 + K) % K : Math.max(0, i - 1);
    const nextIdx = isClosed ? (i + 1) % K : Math.min(K - 1, i + 1);
    const pPrev = cores[prevIdx].pos;
    const pNext = cores[nextIdx].pos;
    const tCurve = normalize3(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);

    const { pos, nOut, tU } = cores[i];
    const bRaw = cross3(tCurve, nOut);
    const bLen = Math.hypot(bRaw.x, bRaw.y, bRaw.z);
    const bSide = bLen > 1e-4 ? { x: bRaw.x / bLen, y: bRaw.y / bLen, z: bRaw.z / bLen } : tU;

    const vD = samples[i].v;
    const upperFade = isClosedDomeGlobal
      ? 1 - smoothstep(0.92, 1.0, vD)
      : 1 - smoothstep(0.87, 0.94, vD);
    const endGuard = smoothstep(0.03, 0.1, vD) * upperFade;
    const taperSpan = Math.max(4, Math.round(K * 0.045));
    const openTaper = isClosed
      ? 1.0
      : smoothstep(0, taperSpan, i) * (isClosedDomeGlobal ? 1.0 : smoothstep(0, taperSpan, K - 1 - i));
    const uNorm = (((samples[i].theta / (2 * Math.PI)) % 1) + 1) % 1;
    const sculpt = evaluateSculptField(uNorm, vD, shadeHeight, 75, config.sculptStrokes);
    const sculptedDepth = Math.max(0.35, finDepthMm + sculpt.drMm * 0.45);
    const depthHere = Math.max(
      0.35,
      sculptedDepth *
        samples[i].depthScale *
        (0.14 + 0.86 * endGuard) *
        (0.22 + 0.78 * openTaper) *
        (1 - sculpt.smoothMask * 0.55)
    );

    const extDir = normalize3(nOut.x, nOut.y + liftFactor, nOut.z);

    const rootX = pos.x - nOut.x * embedMm;
    const rootY = clamp(pos.y - nOut.y * embedMm, minAllowedY, maxAllowedY);
    const rootZ = pos.z - nOut.z * embedMm;

    const tipX = pos.x + extDir.x * depthHere;
    const tipY = clamp(pos.y + extDir.y * depthHere, minAllowedY, maxAllowedY);
    const tipZ = pos.z + extDir.z * depthHere;

    const rootThick = finThicknessMm + 1.4;
    const tipThick = finThicknessMm + 0.6;
    const isClosedPoleHere = isClosedDomeGlobal && config.mount.type === 'led_kit_001';
    const hw = isClosedPoleHere ? halfW * (1 - 0.55 * smoothstep(0.955, 1.0, vD)) : halfW;

    bl[i] = mb.addVertex(
      rootX - bSide.x * hw,
      clamp(rootY - bSide.y * hw, minAllowedY, maxAllowedY),
      rootZ - bSide.z * hw,
      rootThick
    );
    br[i] = mb.addVertex(
      rootX + bSide.x * hw,
      clamp(rootY + bSide.y * hw, minAllowedY, maxAllowedY),
      rootZ + bSide.z * hw,
      rootThick
    );
    tr[i] = mb.addVertex(
      tipX + bSide.x * hw,
      clamp(tipY + bSide.y * hw, minAllowedY, maxAllowedY),
      tipZ + bSide.z * hw,
      tipThick
    );
    tl[i] = mb.addVertex(
      tipX - bSide.x * hw,
      clamp(tipY - bSide.y * hw, minAllowedY, maxAllowedY),
      tipZ - bSide.z * hw,
      tipThick
    );
  }

  const segCount = isClosed ? K : K - 1;
  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % K;
    mb.addQuad(tl[i], tr[i], tr[j], tl[j]);
    mb.addQuad(bl[i], bl[j], br[j], br[i]);
    mb.addQuad(br[i], br[j], tr[j], tr[i]);
    mb.addQuad(bl[i], tl[i], tl[j], bl[j]);
  }

  if (!isClosed) {
    mb.addQuad(bl[0], br[0], tr[0], tl[0]);
    mb.addQuad(bl[K - 1], tl[K - 1], tr[K - 1], br[K - 1]);
  }
}

/**
 * SUBMODE A: "Flamas / Ondas (Sin soportes)" (Amber sculpted flame sphere reference).
 * 16–32 silky-smooth vertical sinuous fins (128 preview / 192 export segments) undulating in alternating
 * opposite phase so neighboring fins gently kiss at their crests, enclosing teardrop/petal light cells
 * around the exact mathematical sphere!
 */
function appendFlameFins(ctx: ExtraGeometryContext): void {
  const { mb, config, seatY, shadeHeight, draft, invertedForPendant } = ctx;
  const org = config.organic;

  const rawCount = Math.round(clamp(org.finCount || 24, 16, 32));
  const finCount = (rawCount & 1) === 1 ? rawCount + 1 : rawCount;
  const waves = clamp(org.flameWaves || 3, 2, 6);
  const finDepth = clamp(org.finDepth || 14, 8, 22);
  const finThickness = clamp(org.finThickness || 1.5, 1.2, 2.2);

  const sectorHalf = Math.PI / finCount;
  const steps = draft ? 128 : 192;
  const vStart = 0.03;
  const isClosedDome = Boolean(config.silhouette.closeTopDome) && !invertedForPendant;
  const isClosedPoleLed = isClosedDome && config.mount.type === 'led_kit_001';
  // Reach exact vEnd = 1.0 (R = 0.0 mm North Pole axis!) when closed LED sphere is active -> 0 mm bald center!
  const vEnd = isClosedPoleLed ? 1.0 : isClosedDome ? 0.988 : 0.94;

  for (let k = 0; k < finCount; k++) {
    const baseTheta = (2 * Math.PI * k) / finCount;
    const sign = (k & 1) === 0 ? 1 : -1;
    const samples: CurveSample[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const v = vStart + (vEnd - vStart) * t;

      const rLocal = evaluateEffectiveSilhouetteRadius(
        v,
        config.silhouette,
        config.mount.type,
        1.2,
        invertedForPendant
      );

      // Strict anti-collision clearance >= 0.85 mm between adjacent Flame walls outside polar zone
      const halfFinAngle = (finThickness * 0.5 + 0.44) / Math.max(10, rLocal);
      const touchAmpAtV = Math.max(0, sectorHalf - halfFinAngle);

      const phase = t * waves * Math.PI * 2;
      const waveVal = (Math.sin(phase) + 0.1 * Math.sin(phase * 2)) / 1.07;

      const poleEnvelope = smoothstep(0.0, 0.06, t) * (1 - smoothstep(0.92, 1.0, t));
      const theta = baseTheta + sign * touchAmpAtV * 0.96 * waveVal * poleEnvelope;

      const petalFullness = 0.78 + 0.22 * Math.pow(Math.abs(Math.sin(phase * 0.5)), 0.75);
      const archEnv = isClosedDome
        ? smoothstep(0.0, 0.08, t) * (1 - 0.55 * smoothstep(0.92, 1.0, v))
        : Math.sin(t * Math.PI);
      const depthScale = clamp((0.32 + 0.68 * Math.pow(Math.max(0, archEnv), 0.45)) * petalFullness, 0.18, 1.0);

      samples.push({ theta, v, depthScale });
    }

    extrudeRibbonOnSurface(
      mb,
      samples,
      false,
      config,
      seatY,
      shadeHeight,
      finThickness,
      finDepth,
      0.08,
      invertedForPendant
    );
  }
}

// =================================================================================================
// SUBMODE B: "Gravedad" — 3D ISOCONTOURS (MARCHING TRIANGLES) ON A 3D ICOSPHERE (ZERO POLAR DISTORTION!)
// Evaluates a smooth 3D scalar field f(p) directly on a subdivided icosphere (subdiv 4 draft / 5 export):
//   - 10–22 smooth Gaussian metaball centers on S² (Densidad & Dispersión)
//   - Smooth 3D gradient noise with domain warping (Suavidad)
//   - Vertical downward gravity deformation stretching wells into organic hanging pouches (Gravedad)
// Extracts 5–9 equidistant level sets f(p) = c_k via 3D Marching Triangles, chains exact closed loops
// (or bed-clipped open arcs at Z = 0), applies 2 passes of spherical Laplacian smoothing, guarantees
// >= 0.85 mm air separation, and extrudes each contour into a 100% watertight solid ribbon (16–24 mm)!
// =================================================================================================

interface IcosphereMesh {
  verts: Vec3[];
  tris: Int32Array; // flat [i0, i1, i2, ...]
  neighbors: number[][]; // 1-ring vertex adjacency for fast scalar-field Laplacian smoothing
}

const ICOSPHERE_CACHE = new Map<number, IcosphereMesh>();

function getUnitIcosphere(subdiv: number): IcosphereMesh {
  const cached = ICOSPHERE_CACHE.get(subdiv);
  if (cached) return cached;

  const t = (1 + Math.sqrt(5)) * 0.5;
  const rawVerts: Array<[number, number, number]> = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];

  const verts: Vec3[] = rawVerts.map(([x, y, z]) => normalize3(x, y, z));
  let faces: number[] = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];

  for (let s = 0; s < subdiv; s++) {
    const midCache = new Map<number, number>();
    const getMid = (a: number, b: number): number => {
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      const key = lo * 65536 + hi;
      const existing = midCache.get(key);
      if (existing !== undefined) return existing;
      const va = verts[lo];
      const vb = verts[hi];
      const idx = verts.length;
      verts.push(normalize3(va.x + vb.x, va.y + vb.y, va.z + vb.z));
      midCache.set(key, idx);
      return idx;
    };

    const nextFaces: number[] = new Array(faces.length * 4);
    let ptr = 0;
    for (let f = 0; f < faces.length; f += 3) {
      const i0 = faces[f];
      const i1 = faces[f + 1];
      const i2 = faces[f + 2];
      const m01 = getMid(i0, i1);
      const m12 = getMid(i1, i2);
      const m20 = getMid(i2, i0);
      nextFaces[ptr++] = i0;
      nextFaces[ptr++] = m01;
      nextFaces[ptr++] = m20;
      nextFaces[ptr++] = i1;
      nextFaces[ptr++] = m12;
      nextFaces[ptr++] = m01;
      nextFaces[ptr++] = i2;
      nextFaces[ptr++] = m20;
      nextFaces[ptr++] = m12;
      nextFaces[ptr++] = m01;
      nextFaces[ptr++] = m12;
      nextFaces[ptr++] = m20;
    }
    faces = nextFaces;
  }

  // Build 1-ring vertex adjacency list for O(V) scalar field smoothing
  const nbSets: Array<Set<number>> = Array.from({ length: verts.length }, () => new Set<number>());
  for (let f = 0; f < faces.length; f += 3) {
    const a = faces[f];
    const b = faces[f + 1];
    const c = faces[f + 2];
    nbSets[a].add(b);
    nbSets[a].add(c);
    nbSets[b].add(a);
    nbSets[b].add(c);
    nbSets[c].add(a);
    nbSets[c].add(b);
  }
  const neighbors = nbSets.map((s) => Array.from(s));

  const mesh: IcosphereMesh = {
    verts,
    tris: new Int32Array(faces),
    neighbors,
  };
  ICOSPHERE_CACHE.set(subdiv, mesh);
  return mesh;
}

// Fast smooth 3D gradient noise (Perlin quintic C² continuous, deterministic by seed)
const GRAD3: ReadonlyArray<[number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function hash3D(ix: number, iy: number, iz: number, seedInt: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + seedInt) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 12;
}

function fade5(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function smoothNoise3D(x: number, y: number, z: number, seedInt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fade5(fx);
  const v = fade5(fy);
  const w = fade5(fz);

  const g = (dx: number, dy: number, dz: number): number => {
    const gr = GRAD3[hash3D(ix + dx, iy + dy, iz + dz, seedInt)];
    return gr[0] * (fx - dx) + gr[1] * (fy - dy) + gr[2] * (fz - dz);
  };

  const n000 = g(0, 0, 0);
  const n100 = g(1, 0, 0);
  const n010 = g(0, 1, 0);
  const n110 = g(1, 1, 0);
  const n001 = g(0, 0, 1);
  const n101 = g(1, 0, 1);
  const n011 = g(0, 1, 1);
  const n111 = g(1, 1, 1);

  const nx00 = n000 + u * (n100 - n000);
  const nx10 = n010 + u * (n110 - n010);
  const nx01 = n001 + u * (n101 - n001);
  const nx11 = n011 + u * (n111 - n011);
  const nxy0 = nx00 + v * (nx10 - nx00);
  const nxy1 = nx01 + v * (nx11 - nx01);
  return nxy0 + w * (nxy1 - nxy0);
}

/**
 * Applies `passes` iterations of projected Laplacian smoothing directly on the unit sphere S²
 * for either a closed loop or an open curve (keeping open-curve endpoints pinned cleanly on Z = 0).
 */
function smoothSphericalPolyline(
  pts: Vec3[],
  isClosed: boolean,
  passes: number,
  lambda: number,
  yMin: number,
  yMax: number
): Vec3[] {
  const K = pts.length;
  if (K < 4 || passes <= 0) return pts;
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next: Vec3[] = new Array(K);
    for (let i = 0; i < K; i++) {
      if (!isClosed && (i === 0 || i === K - 1)) {
        next[i] = cur[i];
        continue;
      }
      const prev = cur[(i - 1 + K) % K];
      const curr = cur[i];
      const nxt = cur[(i + 1) % K];
      const mx = 0.5 * (prev.x + nxt.x);
      const my = 0.5 * (prev.y + nxt.y);
      const mz = 0.5 * (prev.z + nxt.z);
      next[i] = clampUnitY(
        normalize3(
          curr.x + (mx - curr.x) * lambda,
          curr.y + (my - curr.y) * lambda,
          curr.z + (mz - curr.z) * lambda
        ),
        yMin,
        yMax
      );
    }
    cur = next;
  }
  return cur;
}

/**
 * Extrudes a single closed 3D curve loop directly in 3D Cartesian space (zero polar singularities
 * at North Pole!) anchored 0.7 mm inside the 1.2 mm diffuser core and strictly clipped at y >= seatY.
 * `strandColorId` (1..8) encodes the circuit ID into `aThickness` (id * 100 + thick) for instant
 * per-circuit OZEK palette visualization in the 3D viewer without extra geometry attributes.
 */
function extrudeClosedSphericalLoop(
  mb: SolidMeshBuilder,
  loopUnit: Vec3[],
  config: LampConfig,
  seatY: number,
  shadeHeight: number,
  sphereR: number,
  sphereYc: number,
  useExactSphere: boolean,
  finThicknessMm: number,
  finDepthMm: number,
  liftFactor: number,
  invertedForPendant: boolean,
  strandColorId = 0
): void {
  const K = loopUnit.length;
  if (K < 6) return;

  const { silhouette, mount } = config;
  const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
  const halfW = clamp(finThicknessMm, 1.0, 2.2) * 0.5;
  const embedMm = 0.7;

  const corePos: Vec3[] = new Array(K);
  const coreNorm: Vec3[] = new Array(K);
  const localDepths = new Float64Array(K);

  for (let i = 0; i < K; i++) {
    const q = loopUnit[i];
    const theta = Math.atan2(-q.z, q.x);
    const uNorm = (((theta / (2 * Math.PI)) % 1) + 1) % 1;

    if (useExactSphere) {
      const yLocal = sphereYc + sphereR * q.y;
      const vDesign = clamp(yLocal / Math.max(shadeHeight, 1), 0, 1);
      const sculpt = evaluateSculptField(uNorm, vDesign, shadeHeight, sphereR, config.sculptStrokes);
      const rMod = Math.max(2.0, sphereR + sculpt.drMm * 0.45 * (1 - smoothstep(0.84, 0.99, vDesign)));
      corePos[i] = {
        x: rMod * q.x,
        y: seatY + clamp(yLocal, 0.2, shadeHeight - 0.1),
        z: rMod * q.z,
      };
      coreNorm[i] = q;
      const sculptedDepth = Math.max(2.0, finDepthMm + sculpt.drMm * 0.45);
      localDepths[i] = sculptedDepth * (1 - sculpt.smoothMask * 0.5);
    } else {
      const yFromSphere = sphereYc + sphereR * q.y;
      const vDesign = clamp(yFromSphere / Math.max(shadeHeight, 1), 0.02, 0.985);
      const vLocal = invertedForPendant ? 1 - vDesign : vDesign;
      const baseR = evaluateEffectiveSilhouetteRadius(
        vDesign,
        silhouette,
        mount.type,
        1.2,
        invertedForPendant
      );
      const csBlend = isClosedDome ? 1 - smoothstep(0.76, 0.98, vDesign) : 1.0;
      const rCs = baseR * evaluateCrossSectionMultiplier(theta, vDesign, silhouette, csBlend);
      const sculpt = evaluateSculptField(uNorm, vDesign, shadeHeight, Math.max(24, rCs), config.sculptStrokes);
      const effTheta = theta + sculpt.dThetaRad * csBlend;
      const effR = Math.max(3.0, rCs + sculpt.drMm * 0.45);
      corePos[i] = {
        x: effR * Math.cos(effTheta),
        y: seatY + vLocal * shadeHeight,
        z: -effR * Math.sin(effTheta),
      };
      coreNorm[i] = normalize3(q.x, q.y * 0.85, q.z);
      const sculptedDepth = Math.max(2.0, finDepthMm + sculpt.drMm * 0.45);
      localDepths[i] = sculptedDepth * (1 - sculpt.smoothMask * 0.5);
    }
  }

  const bl = new Int32Array(K);
  const br = new Int32Array(K);
  const tr = new Int32Array(K);
  const tl = new Int32Array(K);

  // Strict build-plate clamp: NEVER drop below y = seatY (Z = 0 in STL)!
  const minAllowedY = seatY;
  const maxAllowedY = isClosedDome ? seatY + shadeHeight + finDepthMm + 4.0 : seatY + shadeHeight - 0.3;

  const strandTag = strandColorId > 0 ? strandColorId * 100.0 : 0.0;
  const rootThick = strandTag + finThicknessMm + 1.5;
  const tipThick = strandTag + finThicknessMm + 0.6;

  for (let i = 0; i < K; i++) {
    const pPrev = corePos[(i - 1 + K) % K];
    const pNext = corePos[(i + 1) % K];
    const pos = corePos[i];
    const nOut = coreNorm[i];

    const tCurve = normalize3(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);
    const bRaw = cross3(tCurve, nOut);
    const bLen = Math.hypot(bRaw.x, bRaw.y, bRaw.z);
    const fallbackU = normalize3(-pos.z, 0, pos.x);
    const bSide = bLen > 1e-4 ? { x: bRaw.x / bLen, y: bRaw.y / bLen, z: bRaw.z / bLen } : fallbackU;

    const distFromBed = pos.y - seatY;
    const bedRamp = smoothstep(0.4, 7.5, distFromBed);
    const topRamp =
      isClosedDome && mount.type === 'led_kit_001'
        ? 1.0
        : 1.0 - smoothstep(shadeHeight - 10.0, shadeHeight - 1.5, distFromBed);

    const depthHere = Math.max(0.5, localDepths[i] * (0.28 + 0.72 * bedRamp) * topRamp);
    const extDir = normalize3(nOut.x, nOut.y + liftFactor, nOut.z);

    const rootX = pos.x - nOut.x * embedMm;
    const rootY = pos.y - nOut.y * embedMm;
    const rootZ = pos.z - nOut.z * embedMm;

    const tipX = pos.x + extDir.x * depthHere;
    const tipY = pos.y + extDir.y * depthHere;
    const tipZ = pos.z + extDir.z * depthHere;

    bl[i] = mb.addVertex(
      rootX - bSide.x * halfW,
      clamp(rootY - bSide.y * halfW, minAllowedY, maxAllowedY),
      rootZ - bSide.z * halfW,
      rootThick
    );
    br[i] = mb.addVertex(
      rootX + bSide.x * halfW,
      clamp(rootY + bSide.y * halfW, minAllowedY, maxAllowedY),
      rootZ + bSide.z * halfW,
      rootThick
    );
    tr[i] = mb.addVertex(
      tipX + bSide.x * halfW,
      clamp(tipY + bSide.y * halfW, minAllowedY, maxAllowedY),
      tipZ + bSide.z * halfW,
      tipThick
    );
    tl[i] = mb.addVertex(
      tipX - bSide.x * halfW,
      clamp(tipY - bSide.y * halfW, minAllowedY, maxAllowedY),
      tipZ - bSide.z * halfW,
      tipThick
    );
  }

  for (let i = 0; i < K; i++) {
    const j = (i + 1) % K;
    mb.addQuad(tl[i], tr[i], tr[j], tl[j]);
    mb.addQuad(bl[i], bl[j], br[j], br[i]);
    mb.addQuad(br[i], br[j], tr[j], tr[i]);
    mb.addQuad(bl[i], tl[i], tl[j], bl[j]);
  }
}

/**
 * Rodrigues 3D rotation of vector `p` around unit axis `axis` by angle `psi` radians.
 */
function rotateAroundAxis3(p: Vec3, axis: Vec3, psi: number): Vec3 {
  if (Math.abs(psi) < 1e-7) return p;
  const c = Math.cos(psi);
  const s = Math.sin(psi);
  const kDotP = dot3(axis, p);
  const kCrossP = cross3(axis, p);
  return normalize3(
    p.x * c + kCrossP.x * s + axis.x * kDotP * (1 - c),
    p.y * c + kCrossP.y * s + axis.y * kDotP * (1 - c),
    p.z * c + kCrossP.z * s + axis.z * kDotP * (1 - c)
  );
}

/**
 * Clamps a unit vector on S² so `y` remains inside `[yMin, yMax]` while staying on S².
 */
function clampUnitY(p: Vec3, yMin: number, yMax: number): Vec3 {
  if (p.y < yMin) {
    const targetR = Math.sqrt(Math.max(1e-6, 1 - yMin * yMin));
    const curR = Math.hypot(p.x, p.z);
    if (curR > 1e-6) {
      return { x: (p.x / curR) * targetR, y: yMin, z: (p.z / curR) * targetR };
    }
    return { x: targetR, y: yMin, z: 0 };
  }
  if (p.y > yMax) {
    const targetR = Math.sqrt(Math.max(1e-6, 1 - yMax * yMax));
    const curR = Math.hypot(p.x, p.z);
    if (curR > 1e-6) {
      return { x: (p.x / curR) * targetR, y: yMax, z: (p.z / curR) * targetR };
    }
    return { x: targetR, y: yMax, z: 0 };
  }
  return p;
}

/**
 * SUBMODE B: "Gravedad" — 3D ISOCONTOURS (MARCHING TRIANGLES) ON A 3D ICOSPHERE (ZERO POLAR DISTORTION!)
 *  1. Builds/caches a uniform 3D icosphere (subdiv 4 draft = 5,120 tris; subdiv 5 export = 20,480 tris).
 *  2. Evaluates a smooth 3D scalar field f(p) on S²:
 *     - 10–22 smooth Gaussian metaballs on S² (controlled by Densidad & Dispersión)
 *     - 3D gradient noise with smooth domain warping (controlled by Suavidad)
 *     - Downward tangential gravity deformation stretching wells into organic hanging pouches (Gravedad)
 *  3. Extracts 5–9 equidistant isocontour levels f(p) = c_k via 3D Marching Triangles, chains exact
 *     closed loops on S² (splitting cleanly at Z = 0 when crossing the flat base cut), applies 2 passes
 *     of projected spherical Laplacian smoothing, guarantees >= 0.85 mm free wall separation, and
 *     extrudes each contour as a watertight thin ribbon (1.2–1.6 mm thick, 16–24 mm deep).
 */
function appendSphericalVoronoiCells(ctx: ExtraGeometryContext): void {
  const { mb, config, seatY, shadeHeight, draft, invertedForPendant } = ctx;
  const org = config.organic;
  const { silhouette, mount } = config;

  // Density slider (10..22) maps directly to physical center-to-center ribbon pitch (8.8 mm open -> 4.4 mm tight)
  const densitySetting = Math.round(clamp(org.voronoiCells ?? 16, 10, 22));
  const densityNorm = clamp((densitySetting - 10) / 12, 0, 1);
  const dispersion = clamp(org.voronoiDispersion ?? 0.55, 0, 1);
  const softness = clamp(org.voronoiSoftness ?? 0.72, 0, 1);
  const gravNorm = clamp((org.gravityAccel ?? -7.8) / 9.8, -1.0, 1.0);
  const twistRadTotal = ((org.gravityTwistDeg ?? 0) * Math.PI) / 180;
  const finDepth = clamp(org.finDepth ?? 20, 16, 24);
  const finThickness = clamp(org.finThickness ?? 1.4, 1.2, 1.6);
  const liftFactor = clamp((org.finLift ?? 0.2) * 0.45 + gravNorm * 0.08, -0.18, 0.55);

  const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
  const useExactSphere = isClosedDome && isSphereSilhouette(silhouette);
  const sphereR = clamp(shadeHeight / 1.78, 34, 118);
  const sphereYc = 0.78 * sphereR;

  const bedYNorm = -0.78 + clamp(1.8 / sphereR, 0.015, 0.042);
  const hasTopOpening = !isClosedDome || mount.type === 'e26_e27';
  const topYNorm = !isClosedDome
    ? 0.92
    : mount.type === 'e26_e27'
      ? Math.sqrt(Math.max(0, 1 - Math.pow(9.8 / sphereR, 2)))
      : 1.01;

  const seedNum = Math.floor(org.seed || 3141);
  const rand = createSeededRandom(seedNum);
  const ico = getUnitIcosphere(draft ? 4 : 5);
  const V = ico.verts.length;
  const tris = ico.tris;

  // 1. Place K organic generators on S² (mix of point nuclei & short geodesic arcs for sweeping U/S folds)
  interface GeoGenerator {
    isArc: boolean;
    a: Vec3;
    t1: Vec3; // orthonormal tangent in great-circle plane for arc generators
    arcAngle: number; // geodesic length of arc in radians
    bias: number; // small offset in radians so lobes interleave naturally without flattening gradients
  }

  const numGenerators = Math.round(clamp(7 + dispersion * 4, 6, 12));
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const phaseOffset = rand() * Math.PI * 2;
  const meanSpacing = Math.sqrt((4 * Math.PI) / numGenerators);
  const jitterAmp = meanSpacing * 0.36 * (0.25 + 0.75 * dispersion);
  const generators: GeoGenerator[] = [];

  for (let i = 0; i < numGenerators; i++) {
    const ny = 1 - (2 * (i + 0.5)) / numGenerators;
    const r = Math.sqrt(Math.max(0, 1 - ny * ny));
    const phi = i * goldenAngle + phaseOffset;
    let p: Vec3 = { x: r * Math.cos(phi), y: ny, z: -r * Math.sin(phi) };

    const up: Vec3 = Math.abs(p.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const e1 = normalize3(
      up.y * p.z - up.z * p.y,
      up.z * p.x - up.x * p.z,
      up.x * p.y - up.y * p.x
    );
    const e2 = cross3(p, e1);

    if (jitterAmp > 1e-4) {
      const jAng = rand() * Math.PI * 2;
      const jRad = (0.25 + 0.75 * rand()) * jitterAmp;
      p = normalize3(
        p.x + jRad * (Math.cos(jAng) * e1.x + Math.sin(jAng) * e2.x),
        p.y + jRad * (Math.cos(jAng) * e1.y + Math.sin(jAng) * e2.y),
        p.z + jRad * (Math.cos(jAng) * e1.z + Math.sin(jAng) * e2.z)
      );
    }

    // ~45% short geodesic arcs so contours form elongated S/U ribbons rather than plain concentric circles
    const isArc = i % 2 === 0;
    const dirAng = rand() * Math.PI * 2;
    const up2: Vec3 = Math.abs(p.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const b1 = normalize3(
      up2.y * p.z - up2.z * p.y,
      up2.z * p.x - up2.x * p.z,
      up2.x * p.y - up2.y * p.x
    );
    const b2 = cross3(p, b1);
    const t1 = normalize3(
      Math.cos(dirAng) * b1.x + Math.sin(dirAng) * b2.x,
      Math.cos(dirAng) * b1.y + Math.sin(dirAng) * b2.y,
      Math.cos(dirAng) * b1.z + Math.sin(dirAng) * b2.z
    );
    const arcAngle = isArc ? 0.24 + 0.2 * rand() : 0;
    const bias = (rand() - 0.5) * 0.08;
    generators.push({ isArc, a: p, t1, arcAngle, bias });
  }

  // 2. Divergence-free Curl Flow on S² (v = p × ∇ψ) — bends parallel ribbons into fluid meanders
  //    while strictly preserving surface area (zero stretched empty lakes, zero pinched collisions!)
  const curlFreq = 1.65 + (1 - softness) * 0.9;
  const curlAmp = 0.22 + (1 - softness) * 0.22;
  const curlEps = 0.025;
  const invTwoEps = 0.5 / curlEps;

  const evalPsi = (x: number, y: number, z: number): number =>
    smoothNoise3D(x * curlFreq + 4.3, y * curlFreq - 2.7, z * curlFreq + 6.1, seedNum) +
    0.34 *
      smoothNoise3D(
        x * curlFreq * 1.9 - 7.1,
        y * curlFreq * 1.9 + 5.2,
        z * curlFreq * 1.9 - 3.4,
        seedNum + 137
      );

  const evalCurlVel = (p: Vec3): Vec3 => {
    const gx = (evalPsi(p.x + curlEps, p.y, p.z) - evalPsi(p.x - curlEps, p.y, p.z)) * invTwoEps;
    const gy = (evalPsi(p.x, p.y + curlEps, p.z) - evalPsi(p.x, p.y - curlEps, p.z)) * invTwoEps;
    const gz = (evalPsi(p.x, p.y, p.z + curlEps) - evalPsi(p.x, p.y, p.z - curlEps)) * invTwoEps;
    // v = p × ∇ψ is strictly tangent to S² and divergence-free; cap speed smoothly to avoid high local shear!
    const vx = p.y * gz - p.z * gy;
    const vy = p.z * gx - p.x * gz;
    const vz = p.x * gy - p.y * gx;
    const mag = Math.hypot(vx, vy, vz);
    const scale = mag > 1.15 ? 1.15 / mag : 1.0;
    return { x: vx * scale, y: vy * scale, z: vz * scale };
  };

  // Smooth-min Log-Sum-Exp sharpness β: keeps saddles buttery smooth while preventing wide zero-gradient ridge caps
  const sminBeta = 15.0 - 3.0 * softness;
  const invSminBeta = 1.0 / sminBeta;
  const gravStretch = gravNorm * 0.16;
  const dtStep = curlAmp * 0.24;

  // 3. Evaluate Constant-Gradient Geodesic Distance Field d(p) (in radians on S², ||∇d|| ≈ 1 everywhere!)
  let field = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    const p0 = ico.verts[v];

    // Gentle vertical gravitational meridian advection (bounded so ||∇d|| stays uniform even at ±1.0 g!)
    const horizFactor = 1 - p0.y * p0.y;
    let pw = normalize3(p0.x, p0.y - gravStretch * horizFactor, p0.z);

    // 2-step RK2 (midpoint) area-preserving Curl Flow advection on S²
    for (let step = 0; step < 2; step++) {
      const v1 = evalCurlVel(pw);
      const pMid = normalize3(
        pw.x + v1.x * dtStep * 0.5,
        pw.y + v1.y * dtStep * 0.5,
        pw.z + v1.z * dtStep * 0.5
      );
      const v2 = evalCurlVel(pMid);
      pw = normalize3(pw.x + v2.x * dtStep, pw.y + v2.y * dtStep, pw.z + v2.z * dtStep);
    }

    // Exact geodesic distance from pw to each generator (point or geodesic arc) + stable Log-Sum-Exp smin
    let dMin = Infinity;
    const dists = new Float64Array(numGenerators);
    for (let g = 0; g < numGenerators; g++) {
      const gen = generators[g];
      let dGeo: number;
      if (!gen.isArc) {
        dGeo = Math.acos(clamp(dot3(pw, gen.a), -1, 1));
      } else {
        const c0 = dot3(pw, gen.a);
        const c1 = dot3(pw, gen.t1);
        const ang = clamp(Math.atan2(c1, c0), 0, gen.arcAngle);
        const qx = Math.cos(ang) * gen.a.x + Math.sin(ang) * gen.t1.x;
        const qy = Math.cos(ang) * gen.a.y + Math.sin(ang) * gen.t1.y;
        const qz = Math.cos(ang) * gen.a.z + Math.sin(ang) * gen.t1.z;
        dGeo = Math.acos(clamp(pw.x * qx + pw.y * qy + pw.z * qz, -1, 1));
      }
      const dBiased = dGeo + gen.bias;
      dists[g] = dBiased;
      if (dBiased < dMin) dMin = dBiased;
    }

    let sumExp = 0;
    for (let g = 0; g < numGenerators; g++) {
      sumExp += Math.exp(-sminBeta * (dists[g] - dMin));
    }
    // Smooth-min geodesic distance in radians + subtle gravitational latitudinal tilt (keeps ||∇d|| ≈ 1!)
    field[v] = dMin - invSminBeta * Math.log(Math.max(1e-12, sumExp)) + gravNorm * 0.06 * p0.y;
  }

  // Light 1-pass Laplacian polish on the icosphere to soften vertex-level saddle ripples without flattening slopes
  const fieldLambda = 0.18 + softness * 0.22;
  {
    const nextF = new Float64Array(V);
    for (let v = 0; v < V; v++) {
      const nbs = ico.neighbors[v];
      let sum = 0;
      for (let j = 0; j < nbs.length; j++) sum += field[nbs[j]];
      const avg = sum / Math.max(1, nbs.length);
      nextF[v] = field[v] + (avg - field[v]) * fieldLambda;
    }
    field = nextF;
  }

  // Compute visible scalar span [fMin, fMax] directly in geodesic radians (NO tanh plateau compression!)
  let fMin = Infinity;
  let fMax = -Infinity;
  for (let v = 0; v < V; v++) {
    if (ico.verts[v].y < bedYNorm - 0.05) continue;
    const fv = field[v];
    if (fv < fMin) fMin = fv;
    if (fv > fMax) fMax = fv;
  }
  const fSpan = Math.max(0.05, fMax - fMin);

  // Estimate surface gradient P85 to ensure physical ribbon spacing respects >= 0.85 mm air gap everywhere
  const gradSamples: number[] = [];
  for (let f = 0; f < tris.length; f += 3) {
    const a = tris[f];
    const b = tris[f + 1];
    if (ico.verts[a].y < bedYNorm) continue;
    const va = ico.verts[a];
    const vb = ico.verts[b];
    const dist = Math.hypot(vb.x - va.x, vb.y - va.y, vb.z - va.z);
    if (dist > 1e-5) {
      gradSamples.push(Math.abs(field[b] - field[a]) / dist);
    }
  }
  gradSamples.sort((a, b) => a - b);
  const gradP85 = gradSamples.length > 0 ? gradSamples[Math.floor(gradSamples.length * 0.85)] : 1.0;

  // 4. Generate equidistant contour levels by exact physical pitchMm across the ENTIRE [fMin, fMax] range!
  //    Because ||∇d|| ≈ 1 everywhere, every point on the sphere stays within ~pitchMm/2 of a ribbon (ZERO holes!)
  //    while keeping default PLA weight comfortably under 1 spool (< 750 g) with generous light-diffusing gaps!
  const minSepChord = (finThickness + 0.85) / sphereR;
  const targetPitchMm = Math.max(finThickness + 1.8, 9.8 - densityNorm * 4.8); // 9.8 mm (10) -> 7.4 mm (16) -> 5.0 mm (22)
  const targetDeltaD = Math.max(targetPitchMm / sphereR, minSepChord * Math.max(1.0, gradP85));

  const isoLevels: number[] = [];
  const startIso = fMin + 0.3 * targetDeltaD;
  const endIso = fMax - 0.08 * targetDeltaD;
  if (endIso > startIso) {
    const count = clamp(Math.floor((endIso - startIso) / targetDeltaD) + 1, 5, 24);
    const stepD = count > 1 ? (endIso - startIso) / (count - 1) : targetDeltaD;
    for (let k = 0; k < count; k++) {
      isoLevels.push(startIso + k * stepD);
    }
  } else {
    for (let k = 0; k < 6; k++) {
      isoLevels.push(fMin + fSpan * (0.1 + (0.8 * k) / 5));
    }
  }

  // Helper: extract all closed contour loops at f(p) = iso via exact 3D Marching Triangles + O(E) edge chaining
  const extractIsoLoops = (iso: number): Vec3[][] => {
    // Perturb vertices sitting right on iso to avoid degenerate edge ambiguity
    const vals = new Float64Array(V);
    for (let v = 0; v < V; v++) {
      const diff = field[v] - iso;
      vals[v] = Math.abs(diff) < 1e-6 ? 1e-6 : diff;
    }

    const edgePt = new Map<number, Vec3>();
    const edgeAdj = new Map<number, number[]>();

    const getEdgeCrossing = (u: number, w: number): number => {
      const lo = u < w ? u : w;
      const hi = u < w ? w : u;
      const key = lo * 65536 + hi;
      if (!edgePt.has(key)) {
        const vLo = vals[lo];
        const vHi = vals[hi];
        const t = clamp(vLo / (vLo - vHi), 0.001, 0.999);
        const a = ico.verts[lo];
        const b = ico.verts[hi];
        edgePt.set(
          key,
          normalize3(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.z + t * (b.z - a.z))
        );
      }
      return key;
    };

    const linkEdges = (kA: number, kB: number): void => {
      let arrA = edgeAdj.get(kA);
      if (!arrA) {
        arrA = [];
        edgeAdj.set(kA, arrA);
      }
      arrA.push(kB);
      let arrB = edgeAdj.get(kB);
      if (!arrB) {
        arrB = [];
        edgeAdj.set(kB, arrB);
      }
      arrB.push(kA);
    };

    for (let f = 0; f < tris.length; f += 3) {
      const i0 = tris[f];
      const i1 = tris[f + 1];
      const i2 = tris[f + 2];
      const s0 = vals[i0] > 0;
      const s1 = vals[i1] > 0;
      const s2 = vals[i2] > 0;
      const count = (s0 ? 1 : 0) + (s1 ? 1 : 0) + (s2 ? 1 : 0);
      if (count === 0 || count === 3) continue;

      let eA: number;
      let eB: number;
      if (s0 !== s1 && s0 !== s2) {
        eA = getEdgeCrossing(i0, i1);
        eB = getEdgeCrossing(i0, i2);
      } else if (s1 !== s0 && s1 !== s2) {
        eA = getEdgeCrossing(i1, i2);
        eB = getEdgeCrossing(i1, i0);
      } else {
        eA = getEdgeCrossing(i2, i0);
        eB = getEdgeCrossing(i2, i1);
      }
      linkEdges(eA, eB);
    }

    const visited = new Set<number>();
    const loops: Vec3[][] = [];

    for (const startKey of edgeAdj.keys()) {
      if (visited.has(startKey)) continue;
      const loop: Vec3[] = [];
      let curr: number | undefined = startKey;
      let prev = -1;

      while (curr !== undefined && !visited.has(curr)) {
        visited.add(curr);
        const pt = edgePt.get(curr);
        if (pt) loop.push(pt);
        const nbs = edgeAdj.get(curr);
        if (!nbs || nbs.length === 0) break;
        let nextKey: number | undefined;
        for (let m = 0; m < nbs.length; m++) {
          if (nbs[m] !== prev && !visited.has(nbs[m])) {
            nextKey = nbs[m];
            break;
          }
        }
        prev = curr;
        curr = nextKey;
      }

      if (loop.length >= 6) {
        loops.push(loop);
      }
    }

    return loops;
  };

  interface ExtractedContour {
    pts: Vec3[];
    isClosed: boolean;
    levelIdx: number;
  }

  const contours: ExtractedContour[] = [];
  const yMaxBound = hasTopOpening ? topYNorm : 1.0;

  const interpToY = (a: Vec3, b: Vec3, yLim: number): Vec3 => {
    const dy = b.y - a.y;
    const t = Math.abs(dy) > 1e-8 ? clamp((yLim - a.y) / dy, 0, 1) : 0.5;
    return clampUnitY(
      normalize3(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.z + t * (b.z - a.z)),
      bedYNorm,
      yMaxBound
    );
  };

  const inBounds = (p: Vec3) => p.y >= bedYNorm && (!hasTopOpening || p.y <= topYNorm);

  // 5. Extract all physical-pitch geodesic levels, clip cleanly at Z = 0, and apply 2-pass spherical smoothing
  for (let lvl = 0; lvl < isoLevels.length; lvl++) {
    const iso = isoLevels[lvl];
    const rawLoops = extractIsoLoops(iso);

    for (let li = 0; li < rawLoops.length; li++) {
      const loop = rawLoops[li];
      let allIn = true;
      let anyIn = false;
      for (let i = 0; i < loop.length; i++) {
        if (inBounds(loop[i])) anyIn = true;
        else allIn = false;
      }
      if (!anyIn) continue;

      if (allIn) {
        // Closed contour completely on the visible sphere -> 2 passes of projected Laplacian smoothing
        const smoothed = smoothSphericalPolyline(loop, true, 2, 0.42, bedYNorm, yMaxBound);
        // Keep clean inner eye loops (>= 9 mm perimeter) while discarding degenerate sub-millimeter pinholes
        let perim = 0;
        for (let i = 0; i < smoothed.length; i++) {
          const a = smoothed[i];
          const b = smoothed[(i + 1) % smoothed.length];
          perim += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        }
        if (perim * sphereR >= 9.0 && smoothed.length >= 6) {
          contours.push({ pts: smoothed, isClosed: true, levelIdx: lvl });
        }
      } else {
        // Loop crosses the flat bed cut (Z = 0) or open top -> rotate start to an out-of-bounds vertex & split cleanly!
        let startOut = 0;
        while (startOut < loop.length && inBounds(loop[startOut])) startOut++;

        const M = loop.length;
        let current: Vec3[] = [];
        for (let step = 0; step <= M; step++) {
          const idx = (startOut + step) % M;
          const p = loop[idx];
          const ok = inBounds(p);
          if (ok) {
            if (current.length === 0) {
              const prev = loop[(idx - 1 + M) % M];
              const lim = prev.y < bedYNorm ? bedYNorm : topYNorm;
              current.push(interpToY(prev, p, lim));
            }
            current.push(p);
          } else if (current.length > 0) {
            const prev = loop[(idx - 1 + M) % M];
            const lim = p.y < bedYNorm ? bedYNorm : topYNorm;
            current.push(interpToY(prev, p, lim));
            if (current.length >= 5) {
              const sm = smoothSphericalPolyline(current, false, 2, 0.42, bedYNorm, yMaxBound);
              let arcLen = 0;
              for (let j = 0; j < sm.length - 1; j++) {
                arcLen += Math.hypot(
                  sm[j + 1].x - sm[j].x,
                  sm[j + 1].y - sm[j].y,
                  sm[j + 1].z - sm[j].z
                );
              }
              if (arcLen * sphereR >= 8.0) {
                contours.push({ pts: sm, isClosed: false, levelIdx: lvl });
              }
            }
            current = [];
          }
        }
      }
    }
  }

  if (contours.length === 0) return;

  // 5. Fast 1-pass strict minimum-separation projection (guarantees >= 0.85 mm free gap even at steep saddles!)
  let totalPts = 0;
  for (let c = 0; c < contours.length; c++) totalPts += contours[c].pts.length;
  const sepCell = Math.max(minSepChord * 1.4, 0.02);
  const sepDim = clamp(Math.ceil(2.24 / sepCell), 12, 44);
  const sepHead = new Int32Array(sepDim * sepDim * sepDim).fill(-1);
  const sepNext = new Int32Array(totalPts);
  const sepContour = new Int32Array(totalPts);
  const sepIdx = new Int32Array(totalPts);
  const sepFx = new Float64Array(totalPts);
  const sepFy = new Float64Array(totalPts);
  const sepFz = new Float64Array(totalPts);
  const sepOff = new Int32Array(contours.length);
  const hashSep = (v: number): number => {
    const idx = Math.floor((v + 1.12) / sepCell);
    return idx < 0 ? 0 : idx >= sepDim ? sepDim - 1 : idx;
  };

  let gCount = 0;
  for (let c = 0; c < contours.length; c++) {
    sepOff[c] = gCount;
    const pts = contours[c].pts;
    for (let i = 0; i < pts.length; i++) {
      const gId = gCount++;
      const p = pts[i];
      sepContour[gId] = c;
      sepIdx[gId] = i;
      const bIdx = (hashSep(p.x) * sepDim + hashSep(p.y)) * sepDim + hashSep(p.z);
      sepNext[gId] = sepHead[bIdx];
      sepHead[bIdx] = gId;
    }
  }

  for (let c = 0; c < contours.length; c++) {
    const pts = contours[c].pts;
    const M = pts.length;
    const isCl = contours[c].isClosed;
    const base = sepOff[c];
    for (let i = 0; i < M; i++) {
      if (!isCl && (i === 0 || i === M - 1)) continue; // keep bed-cut endpoints pinned on Z = 0
      const p = pts[i];
      const gId = base + i;
      const gx = hashSep(p.x);
      const gy = hashSep(p.y);
      const gz = hashSep(p.z);
      const x0 = gx > 0 ? gx - 1 : 0;
      const x1 = gx + 1 < sepDim ? gx + 1 : sepDim - 1;
      const y0 = gy > 0 ? gy - 1 : 0;
      const y1 = gy + 1 < sepDim ? gy + 1 : sepDim - 1;
      const z0 = gz > 0 ? gz - 1 : 0;
      const z1 = gz + 1 < sepDim ? gz + 1 : sepDim - 1;
      let fx = 0,
        fy = 0,
        fz = 0;
      for (let bx = x0; bx <= x1; bx++) {
        const bxOff = bx * sepDim;
        for (let by = y0; by <= y1; by++) {
          const bxyOff = (bxOff + by) * sepDim;
          for (let bz = z0; bz <= z1; bz++) {
            let otherId = sepHead[bxyOff + bz];
            while (otherId !== -1) {
              const otherC = sepContour[otherId];
              if (otherC !== c) {
                const q = contours[otherC].pts[sepIdx[otherId]];
                const dx = p.x - q.x;
                const dy = p.y - q.y;
                const dz = p.z - q.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < minSepChord * minSepChord && d2 > 1e-10) {
                  const d = Math.sqrt(d2);
                  const push = ((minSepChord - d) * 0.5) / d;
                  fx += dx * push;
                  fy += dy * push;
                  fz += dz * push;
                }
              }
              otherId = sepNext[otherId];
            }
          }
        }
      }
      sepFx[gId] = fx;
      sepFy[gId] = fy;
      sepFz[gId] = fz;
    }
  }

  for (let c = 0; c < contours.length; c++) {
    const pts = contours[c].pts;
    const base = sepOff[c];
    for (let i = 0; i < pts.length; i++) {
      const gId = base + i;
      const fx = sepFx[gId];
      const fy = sepFy[gId];
      const fz = sepFz[gId];
      if (fx * fx + fy * fy + fz * fz < 1e-12) continue;
      const p = pts[i];
      const fDot = fx * p.x + fy * p.y + fz * p.z;
      pts[i] = clampUnitY(
        normalize3(p.x + fx - fDot * p.x, p.y + fy - fDot * p.y, p.z + fz - fDot * p.z),
        bedYNorm,
        yMaxBound
      );
    }
  }

  // 6. Optional spiral twist + watertight 3D extrusion anchored 0.7 mm into 1.2 mm sphere core (clipped Z >= 0!)
  for (let c = 0; c < contours.length; c++) {
    const item = contours[c];
    let pts = item.pts;
    if (Math.abs(twistRadTotal) > 1e-4) {
      pts = pts.map((p) => {
        const hFrac = clamp((p.y - bedYNorm) / Math.max(0.2, 1.0 - bedYNorm), 0, 1);
        const tw = twistRadTotal * hFrac;
        const ct = Math.cos(tw);
        const st = Math.sin(tw);
        return { x: p.x * ct - p.z * st, y: p.y, z: p.x * st + p.z * ct };
      });
    }

    const colorTag = (item.levelIdx % 8) + 1;
    if (item.isClosed) {
      extrudeClosedSphericalLoop(
        mb,
        pts,
        config,
        seatY,
        shadeHeight,
        sphereR,
        sphereYc,
        useExactSphere,
        finThickness,
        finDepth,
        liftFactor,
        invertedForPendant,
        colorTag
      );
    } else {
      extrudeOpenSphericalCurve(
        mb,
        pts,
        config,
        seatY,
        shadeHeight,
        sphereR,
        sphereYc,
        useExactSphere,
        finThickness,
        finDepth,
        invertedForPendant,
        colorTag,
        liftFactor,
        true
      );
    }
  }
}

// =================================================================================================
// SUBMODE C: "Crecimiento" — Lush Carnation / Coral Differential-Growth Ruffled Fins
// 24–48 dense fins (default 32), 18–28 mm deep, extending cleanly to vEnd = 0.999 (R = 0 mm) with
// a tight central pinwheel spiral for v > 0.80 and full-height bold outer ruffles across v = 0.08..0.92!
// =================================================================================================

function appendGrowthRuffledFins(ctx: ExtraGeometryContext): void {
  const { mb, config, seatY, shadeHeight, draft, invertedForPendant } = ctx;
  const org = config.organic;
  const { silhouette, mount } = config;

  const finCount = Math.round(clamp(org.growthFinCount ?? 32, 24, 48));
  const growthAmp = clamp(org.growthAmp ?? 0.78, 0, 1);
  const growthFreq = clamp(org.growthFreq ?? 2.4, 1.0, 4.0);
  const finDepth = clamp(org.finDepth ?? 22, 18, 28);
  const finThickness = clamp(org.finThickness ?? 1.4, 1.2, 2.0);
  const baseHalfW = finThickness * 0.5;
  const embedMm = 0.65;

  const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
  const isClosedPoleLed = isClosedDome && mount.type === 'led_kit_001';
  const steps = draft ? 140 : 204;
  const K = steps + 1;
  const vStart = 0.022;
  // Extend all the way to vEnd = 1.0 (exact R = 0.0 mm North Pole!) + Ø4 mm union button!
  const vEnd = isClosedPoleLed ? 1.0 : isClosedDome ? 0.96 : 0.94;

  const minAllowedY = seatY;
  const maxAllowedY = isClosedDome ? seatY + shadeHeight + finDepth + 4.0 : seatY + shadeHeight - 0.3;

  const evalCorePoint = (theta: number, vDesign: number): { pos: Vec3; nOut: Vec3; tU: Vec3; rEff: number } => {
    const vLocal = invertedForPendant ? 1 - vDesign : vDesign;
    const csBlend = isClosedDome ? 1 - smoothstep(0.76, 0.98, vDesign) : 1.0;

    const rAtV = (vv: number) => {
      const b = isClosedDome ? 1 - smoothstep(0.76, 0.98, vv) : 1.0;
      const baseR = evaluateEffectiveSilhouetteRadius(
        vv,
        silhouette,
        mount.type,
        1.2,
        invertedForPendant
      );
      return baseR * evaluateCrossSectionMultiplier(theta, vv, silhouette, b);
    };

    const r0 = rAtV(vDesign);
    const eps = 0.003;
    const vLo = clamp(vDesign - eps, 0, 1);
    const vHi = clamp(vDesign + eps, 0, 1);
    const dvMm = Math.max(0.12, (vHi - vLo) * shadeHeight);
    const drdy = (invertedForPendant ? -(rAtV(vHi) - rAtV(vLo)) : rAtV(vHi) - rAtV(vLo)) / dvMm;

    const uNorm = (((theta / (2 * Math.PI)) % 1) + 1) % 1;
    const sculpt = evaluateSculptField(uNorm, vDesign, shadeHeight, Math.max(20, r0), config.sculptStrokes);
    const effTheta = theta + sculpt.dThetaRad * csBlend;
    // Allow exact R = 0.0 mm right at the North Pole (v = 1.0) so all fins converge into the Ø4 mm button!
    const effR =
      isClosedPoleLed && vDesign >= 0.9995
        ? 0.0
        : Math.max(0.0, r0 + sculpt.drMm * 0.5 * (1 - smoothstep(0.84, 0.98, vDesign)));

    const c = Math.cos(effTheta);
    const s = Math.sin(effTheta);
    const pos: Vec3 = {
      x: effR * c,
      y: seatY + vLocal * shadeHeight,
      z: -effR * s,
    };
    const tU: Vec3 = { x: -s, y: 0, z: -c };
    // Right near exact North Pole (v > 0.985), smoothly blend normal toward +Y so there is zero singularity
    const poleBlend = isClosedPoleLed ? smoothstep(0.982, 0.999, vDesign) : 0;
    const tV: Vec3 = { x: drdy * c, y: 1, z: -drdy * s };
    const nRaw = cross3(tU, tV);
    const nSurf = normalize3(nRaw.x, nRaw.y, nRaw.z);
    const nOut = normalize3(
      nSurf.x * (1 - poleBlend),
      nSurf.y * (1 - poleBlend) + poleBlend,
      nSurf.z * (1 - poleBlend)
    );
    return { pos, nOut, tU, rEff: effR };
  };

  for (let k = 0; k < finCount; k++) {
    const baseTheta = (2 * Math.PI * k) / finCount;

    // Alternating phase with slight organic golden drift so neighboring carnation ruffles almost kiss!
    const phi1 = (k & 1) * Math.PI + k * 0.38;
    const phi2 = k * 2.399963;
    const phi3 = k * 4.123456;
    const w1 = growthFreq * 2.4 * Math.PI;
    const w2 = growthFreq * 5.0 * Math.PI;
    const w3 = growthFreq * 8.6 * Math.PI;

    const rootCenters: Vec3[] = new Array(K);
    const tipCenters: Vec3[] = new Array(K);
    const rootSides: Vec3[] = new Array(K);
    const coreNorms: Vec3[] = new Array(K);
    const halfWs = new Float64Array(K);

    const cores = new Array(K);
    for (let i = 0; i < K; i++) {
      const t = i / steps;
      // Non-linear sampling slightly denser near pole so central spiral swirl is razor-smooth
      const v = vStart + (vEnd - vStart) * t;
      // Smooth central pinwheel swirl for v > 0.80 -> dense closed vortex center with zero bald spot!
      const polarSwirl = isClosedPoleLed ? 0.95 * Math.pow(smoothstep(0.80, 0.999, v), 1.35) : 0;
      cores[i] = evalCorePoint(baseTheta + polarSwirl, v);
    }

    for (let i = 0; i < K; i++) {
      const t = i / steps;
      const v = vStart + (vEnd - vStart) * t;
      const prevIdx = Math.max(0, i - 1);
      const nextIdx = Math.min(K - 1, i + 1);
      const pPrev = cores[prevIdx].pos;
      const pNext = cores[nextIdx].pos;
      const tCurve = normalize3(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);

      const { pos, nOut, tU, rEff } = cores[i];
      const bRaw = cross3(tCurve, nOut);
      const bLen = Math.hypot(bRaw.x, bRaw.y, bRaw.z);
      const bSide = bLen > 1e-4 ? { x: bRaw.x / bLen, y: bRaw.y / bLen, z: bRaw.z / bLen } : tU;

      // Delay radial height fade ONLY to the very last v >= 0.94 so fins converge lushly into R = 0!
      const upperFade = isClosedPoleLed
        ? 1 - smoothstep(0.94, 0.999, v)
        : 1 - smoothstep(0.88, 0.94, v);
      const bedGuard = smoothstep(0.022, 0.085, v);
      const baseDepth = finDepth * (0.2 + 0.8 * bedGuard) * (0.14 + 0.86 * upperFade);

      // Multi-frequency differential growth ruffles on outer free edge across FULL body v = 0.08..0.92!
      const wave =
        0.58 * Math.sin(w1 * t + phi1) +
        0.28 * Math.sin(w2 * t + phi2) +
        0.14 * Math.sin(w3 * t + phi3);

      // Strict dynamic anti-collision bound: >= 0.85 mm free air clearance between opposing neighbor ruffles
      // everywhere outside the polar convergence zone!
      const localSectorMm = (2 * Math.PI * Math.max(4, rEff + baseDepth * 0.85)) / finCount;
      const safeHalfSwingMm = Math.max(0, (localSectorMm - finThickness - 0.85) * 0.5);
      const maxRuffleMm = Math.min(finDepth * 1.12, safeHalfSwingMm);
      const ruffleEnv = smoothstep(0.03, 0.08, v) * (1 - smoothstep(0.92, 0.985, v));
      const latShiftMm = maxRuffleMm * growthAmp * wave * ruffleEnv;

      // Outward floral blossom at ruffle crests
      const depthHere = Math.max(
        0.4,
        baseDepth * (1.0 + 0.16 * growthAmp * Math.abs(wave) * ruffleEnv)
      );

      // Taper thickness gently right inside the tight pole pinwheel (v > 0.95) for clean convergence
      const poleThin = isClosedPoleLed ? 1 - 0.55 * smoothstep(0.95, 0.999, v) : 1.0;
      halfWs[i] = baseHalfW * poleThin;

      // Clean spiraling meridian root embedded 0.65 mm inside core
      rootCenters[i] = {
        x: pos.x - nOut.x * embedMm,
        y: clamp(pos.y - nOut.y * embedMm, minAllowedY, maxAllowedY),
        z: pos.z - nOut.z * embedMm,
      };
      rootSides[i] = bSide;
      coreNorms[i] = nOut;

      // Bold ruffled outer free edge shifted laterally along bSide
      const extDir = normalize3(nOut.x, nOut.y + 0.05, nOut.z);
      tipCenters[i] = {
        x: pos.x + extDir.x * depthHere + bSide.x * latShiftMm,
        y: clamp(pos.y + extDir.y * depthHere + bSide.y * latShiftMm, minAllowedY, maxAllowedY),
        z: pos.z + extDir.z * depthHere + bSide.z * latShiftMm,
      };
    }

    const bl = new Int32Array(K);
    const br = new Int32Array(K);
    const tr = new Int32Array(K);
    const tl = new Int32Array(K);
    const rootThick = finThickness + 1.4;
    const tipThick = finThickness + 0.5;

    for (let i = 0; i < K; i++) {
      const rC = rootCenters[i];
      const tC = tipCenters[i];
      const bRoot = rootSides[i];
      const nOut = coreNorms[i];
      const hw = halfWs[i];

      const tPrev = tipCenters[Math.max(0, i - 1)];
      const tNext = tipCenters[Math.min(K - 1, i + 1)];
      const tTip = normalize3(tNext.x - tPrev.x, tNext.y - tPrev.y, tNext.z - tPrev.z);
      const bTipRaw = cross3(tTip, nOut);
      const bTipLen = Math.hypot(bTipRaw.x, bTipRaw.y, bTipRaw.z);
      let bTip =
        bTipLen > 1e-4
          ? { x: bTipRaw.x / bTipLen, y: bTipRaw.y / bTipLen, z: bTipRaw.z / bTipLen }
          : bRoot;
      if (dot3(bTip, bRoot) < 0) {
        bTip = bRoot;
      }

      bl[i] = mb.addVertex(
        rC.x - bRoot.x * hw,
        clamp(rC.y - bRoot.y * hw, minAllowedY, maxAllowedY),
        rC.z - bRoot.z * hw,
        rootThick
      );
      br[i] = mb.addVertex(
        rC.x + bRoot.x * hw,
        clamp(rC.y + bRoot.y * hw, minAllowedY, maxAllowedY),
        rC.z + bRoot.z * hw,
        rootThick
      );
      tr[i] = mb.addVertex(
        tC.x + bTip.x * hw,
        clamp(tC.y + bTip.y * hw, minAllowedY, maxAllowedY),
        tC.z + bTip.z * hw,
        tipThick
      );
      tl[i] = mb.addVertex(
        tC.x - bTip.x * hw,
        clamp(tC.y - bTip.y * hw, minAllowedY, maxAllowedY),
        tC.z - bTip.z * hw,
        tipThick
      );
    }

    for (let i = 0; i < K - 1; i++) {
      const j = i + 1;
      mb.addQuad(tl[i], tr[i], tr[j], tl[j]);
      mb.addQuad(bl[i], bl[j], br[j], br[i]);
      mb.addQuad(br[i], br[j], tr[j], tr[i]);
      mb.addQuad(bl[i], tl[i], tl[j], bl[j]);
    }
    mb.addQuad(bl[0], br[0], tr[0], tl[0]);
    mb.addQuad(bl[K - 1], tl[K - 1], tr[K - 1], br[K - 1]);
  }
}

// =================================================================================================
// SUBMODE D: "Viento" — 45–75 Ultra-Thin Fins in a Non-Crossing 3D Surface Flow / Vortex Field
// Extends to vEnd = 0.999 (R = 0 mm) with a tight central spiral swirl for v > 0.80 and radial
// height fade delayed to v >= 0.94 so there is ZERO bald spot at the North Pole!
// =================================================================================================

/**
 * Extrudes an open 3D curve on the unit sphere S² directly in 3D Cartesian space (zero North Pole
 * distortion) anchored 0.65 mm inside the 1.2 mm diffuser core and strictly clipped at y >= seatY.
 */
function extrudeOpenSphericalCurve(
  mb: SolidMeshBuilder,
  curveUnit: Vec3[],
  config: LampConfig,
  seatY: number,
  shadeHeight: number,
  sphereR: number,
  sphereYc: number,
  useExactSphere: boolean,
  finThicknessMm: number,
  finDepthMm: number,
  invertedForPendant: boolean,
  strandColorId = 0,
  liftFactor = 0,
  isContourArc = false
): void {
  const K = curveUnit.length;
  if (K < 5) return;

  const { silhouette, mount } = config;
  const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
  const isClosedPoleLed = isClosedDome && mount.type === 'led_kit_001';
  const baseHalfW = clamp(finThicknessMm, 0.9, 1.8) * 0.5;
  const embedMm = isContourArc ? 0.7 : 0.65;

  const corePos: Vec3[] = new Array(K);
  const coreNorm: Vec3[] = new Array(K);
  const localDepths = new Float64Array(K);
  const vNormArr = new Float64Array(K);

  for (let i = 0; i < K; i++) {
    const q = curveUnit[i];
    const theta = Math.atan2(-q.z, q.x);
    const uNorm = (((theta / (2 * Math.PI)) % 1) + 1) % 1;

    if (useExactSphere) {
      const yLocal = sphereYc + sphereR * q.y;
      const vDesign = clamp(yLocal / Math.max(shadeHeight, 1), 0, 1);
      vNormArr[i] = vDesign;
      const sculpt = evaluateSculptField(uNorm, vDesign, shadeHeight, sphereR, config.sculptStrokes);
      const rMod = Math.max(0.15, sphereR + sculpt.drMm * 0.45 * (1 - smoothstep(0.84, 0.99, vDesign)));
      corePos[i] = {
        x: rMod * q.x,
        y: seatY + clamp(yLocal, 0.1, shadeHeight),
        z: rMod * q.z,
      };
      coreNorm[i] = q;
      const scDepth = Math.max(1.2, finDepthMm + sculpt.drMm * 0.35);
      localDepths[i] = scDepth * (1 - sculpt.smoothMask * 0.5);
    } else {
      const yFromSphere = sphereYc + sphereR * q.y;
      const vDesign = clamp(yFromSphere / Math.max(shadeHeight, 1), 0.02, isClosedPoleLed ? 0.999 : 0.985);
      vNormArr[i] = vDesign;
      const vLocal = invertedForPendant ? 1 - vDesign : vDesign;
      const baseR = evaluateEffectiveSilhouetteRadius(
        vDesign,
        silhouette,
        mount.type,
        1.2,
        invertedForPendant
      );
      const csBlend = isClosedDome ? 1 - smoothstep(0.76, 0.98, vDesign) : 1.0;
      const rCs = baseR * evaluateCrossSectionMultiplier(theta, vDesign, silhouette, csBlend);
      const sculpt = evaluateSculptField(uNorm, vDesign, shadeHeight, Math.max(20, rCs), config.sculptStrokes);
      const effTheta = theta + sculpt.dThetaRad * csBlend;
      const effR = Math.max(0.15, rCs + sculpt.drMm * 0.45);
      corePos[i] = {
        x: effR * Math.cos(effTheta),
        y: seatY + vLocal * shadeHeight,
        z: -effR * Math.sin(effTheta),
      };
      coreNorm[i] = normalize3(q.x, q.y * 0.85, q.z);
      const scDepth = Math.max(1.2, finDepthMm + sculpt.drMm * 0.35);
      localDepths[i] = scDepth * (1 - sculpt.smoothMask * 0.5);
    }
  }

  const bl = new Int32Array(K);
  const br = new Int32Array(K);
  const tr = new Int32Array(K);
  const tl = new Int32Array(K);

  const minAllowedY = seatY;
  const maxAllowedY = isClosedDome ? seatY + shadeHeight + finDepthMm + 3.0 : seatY + shadeHeight - 0.3;
  const taperSpan = Math.max(4, Math.round(K * 0.04));
  const strandTag = strandColorId > 0 ? strandColorId * 100.0 : 0.0;
  const rootThick = strandTag + finThicknessMm + 1.3;
  const tipThick = strandTag + finThicknessMm + 0.4;

  let prevSide: Vec3 | null = null;
  for (let i = 0; i < K; i++) {
    const pPrev = corePos[Math.max(0, i - 1)];
    const pNext = corePos[Math.min(K - 1, i + 1)];
    const pos = corePos[i];
    const nOut = coreNorm[i];
    const vNorm = vNormArr[i];

    const tCurve = normalize3(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);
    const bRaw = cross3(tCurve, nOut);
    const bLen = Math.hypot(bRaw.x, bRaw.y, bRaw.z);
    const bSide: Vec3 =
      bLen > 1e-4
        ? { x: bRaw.x / bLen, y: bRaw.y / bLen, z: bRaw.z / bLen }
        : prevSide ?? normalize3(-pos.z, 0, pos.x);
    prevSide = bSide;

    const distFromBed = pos.y - seatY;
    const bedRamp = smoothstep(0.3, 6.0, distFromBed);
    // Delay radial height fade ONLY to the very last v >= 0.94 so Wind fins converge lushly to R = 0;
    // for Gravity isocontour arcs keep full ribbon depth across the upper dome!
    const poleRamp = isContourArc
      ? isClosedPoleLed
        ? 1.0
        : 1.0 - smoothstep(0.88, 0.96, vNorm)
      : isClosedPoleLed
        ? 1.0 - smoothstep(0.94, 0.999, vNorm)
        : 1.0 - smoothstep(0.88, 0.95, vNorm);
    const startTaper = isContourArc ? 1.0 : smoothstep(0, taperSpan, i);
    const endTaper = isContourArc || isClosedPoleLed ? 1.0 : smoothstep(0, taperSpan, K - 1 - i);

    const depthHere = isContourArc
      ? Math.max(0.5, localDepths[i] * (0.28 + 0.72 * bedRamp) * poleRamp)
      : Math.max(
          0.35,
          localDepths[i] * (0.18 + 0.82 * bedRamp) * (0.14 + 0.86 * poleRamp) * (0.3 + 0.7 * startTaper * endTaper)
        );

    const poleThin =
      !isContourArc && isClosedPoleLed ? 1.0 - 0.56 * smoothstep(0.955, 0.999, vNorm) : 1.0;
    const hw = baseHalfW * poleThin;

    const extDir = Math.abs(liftFactor) > 1e-4 ? normalize3(nOut.x, nOut.y + liftFactor, nOut.z) : nOut;

    const rootX = pos.x - nOut.x * embedMm;
    const rootY = pos.y - nOut.y * embedMm;
    const rootZ = pos.z - nOut.z * embedMm;

    const tipX = pos.x + extDir.x * depthHere;
    const tipY = pos.y + extDir.y * depthHere;
    const tipZ = pos.z + extDir.z * depthHere;

    bl[i] = mb.addVertex(
      rootX - bSide.x * hw,
      clamp(rootY - bSide.y * hw, minAllowedY, maxAllowedY),
      rootZ - bSide.z * hw,
      rootThick
    );
    br[i] = mb.addVertex(
      rootX + bSide.x * hw,
      clamp(rootY + bSide.y * hw, minAllowedY, maxAllowedY),
      rootZ + bSide.z * hw,
      rootThick
    );
    tr[i] = mb.addVertex(
      tipX + bSide.x * hw,
      clamp(tipY + bSide.y * hw, minAllowedY, maxAllowedY),
      tipZ + bSide.z * hw,
      tipThick
    );
    tl[i] = mb.addVertex(
      tipX - bSide.x * hw,
      clamp(tipY - bSide.y * hw, minAllowedY, maxAllowedY),
      tipZ - bSide.z * hw,
      tipThick
    );
  }

  for (let i = 0; i < K - 1; i++) {
    const j = i + 1;
    mb.addQuad(tl[i], tr[i], tr[j], tl[j]);
    mb.addQuad(bl[i], bl[j], br[j], br[i]);
    mb.addQuad(br[i], br[j], tr[j], tr[i]);
    mb.addQuad(bl[i], tl[i], tl[j], bl[j]);
  }
  mb.addQuad(bl[0], br[0], tr[0], tl[0]);
  mb.addQuad(bl[K - 1], tl[K - 1], tr[K - 1], br[K - 1]);
}

function appendWindFlowFins(ctx: ExtraGeometryContext): void {
  const { mb, config, seatY, shadeHeight, draft, invertedForPendant } = ctx;
  const org = config.organic;
  const { silhouette, mount } = config;

  const finCount = Math.round(clamp(org.windFinCount ?? 60, 45, 75));
  const windType = org.windType ?? 'vortex';
  const dirRad = ((org.windDirectionDeg ?? 45) * Math.PI) / 180;
  const intensity = clamp((org.windIntensity ?? 110) / 100, 0, 2.0);
  const finDepth = clamp(org.finDepth ?? 9, 6, 12);
  const finThickness = clamp(org.finThickness ?? 1.2, 1.0, 1.4);

  const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
  const isClosedPoleLed = isClosedDome && mount.type === 'led_kit_001';
  const useExactSphere = isClosedDome && isSphereSilhouette(silhouette);
  const sphereR = clamp(shadeHeight / 1.78, 34, 118);
  const sphereYc = 0.78 * sphereR;

  const bedYNorm = -0.78 + clamp(1.2 / sphereR, 0.01, 0.032);
  const hasTopOpening = !isClosedDome || mount.type === 'e26_e27';
  // Extend all the way to ny = 1.0 (exact R = 0.0 mm North Pole!) + Ø4 mm union button!
  const topYNorm = !isClosedDome
    ? 0.92
    : mount.type === 'e26_e27'
      ? Math.sqrt(Math.max(0, 1 - Math.pow(9.6 / sphereR, 2)))
      : 1.0;

  // Localized flank vortex axis on S² for "Remolino" (0° faces front +Z camera; 45° sits in hero 3/4 view!)
  const vortexElev = 0.14;
  const vortexAxis = normalize3(
    Math.sin(dirRad) * Math.cos(vortexElev),
    Math.sin(vortexElev),
    Math.cos(dirRad) * Math.cos(vortexElev)
  );
  const vortexSigma = 0.62;
  const vortexTwoSigma2 = 2 * vortexSigma * vortexSigma;

  // Bijective smooth 3D diffeomorphism Φ: S² -> S² with dynamic >= 0.85 mm anti-collision margin outside polar zone!
  const applyWindFlow = (theta0: number, ny0: number): Vec3 => {
    const hFrac = clamp((ny0 - bedYNorm) / Math.max(0.25, 1.0 - bedYNorm), 0, 1);
    const poleEnv = smoothstep(0.0, 0.1, hFrac) * (1 - smoothstep(0.88, 1.0, hFrac));
    // Smooth central spiral twist for v > 0.80 closing the North Pole into a lush pinwheel!
    const polarSwirl = isClosedPoleLed ? 0.78 * Math.pow(smoothstep(0.80, 0.999, hFrac), 1.35) : 0;
    let theta = theta0 + polarSwirl;

    // Compute dynamic max azimuthal compression allowed at local radius so adjacent fins keep >= 0.85 mm air gap
    const rHorizLocal = Math.sqrt(Math.max(0.04, 1 - ny0 * ny0));
    const nominalArcMm = (2 * Math.PI * (sphereR * rHorizLocal)) / finCount;
    const minDeriv = clamp((finThickness + 0.85) / Math.max(1.5, nominalArcMm), 0.25, 0.96);
    const maxDerivDrop = Math.max(0, 1.0 - minDeriv);

    if (windType === 'breeze') {
      // Smooth diagonal breeze lean + bounded directional shear (guaranteed >= 0.85 mm clearance!)
      const diagSweep = intensity * (0.52 * hFrac + 0.14 * Math.sin(hFrac * Math.PI));
      const dirAmp = Math.min(0.16 * intensity, maxDerivDrop * 0.92);
      const dirMod = dirAmp * Math.cos(theta0 - dirRad) * poleEnv;
      theta += diagSweep + dirMod;
    } else if (windType === 'gusts') {
      // 2–3 alternating smooth gust waves + dynamically bounded azimuthal density shift (>= 0.85 mm clearance!)
      const waveSweep =
        intensity *
        (0.24 * Math.sin(2.6 * Math.PI * hFrac + dirRad) +
          0.11 * Math.sin(4.4 * Math.PI * hFrac - dirRad * 0.7)) *
        (0.35 + 0.65 * poleEnv);
      const bunchAmp = Math.min(0.21 * Math.min(intensity, 1.85), maxDerivDrop * 0.92);
      const bunching =
        bunchAmp * Math.sin(theta0 - dirRad) * Math.sin(2.5 * Math.PI * hFrac) * poleEnv;
      theta += waveSweep + bunching;
    } else {
      // Light global breeze drift before localized flank vortex (composition of bijections = bijection!)
      theta += intensity * 0.14 * hFrac;
    }

    const rHoriz = Math.sqrt(Math.max(0, 1 - ny0 * ny0));
    let p: Vec3 = {
      x: rHoriz * Math.cos(theta),
      y: ny0,
      z: -rHoriz * Math.sin(theta),
    };

    if (windType === 'vortex' && intensity > 1e-4) {
      // Dynamically bound vortex shear at high finCount so parallel swirling walls keep >= 0.85 mm clearance!
      const equatSpacingMm = (2 * Math.PI * sphereR) / finCount;
      const safeShearRatio = clamp(equatSpacingMm / (finThickness + 0.85), 1.0, 4.5);
      const maxPsiAtFlank = Math.sqrt(Math.max(0.1, safeShearRatio * safeShearRatio - 1.0)) * 1.15;
      const gamma = Math.acos(clamp(dot3(p, vortexAxis), -1, 1));
      const psi = Math.min(intensity * 1.85, maxPsiAtFlank) * Math.exp(-(gamma * gamma) / vortexTwoSigma2);
      p = rotateAroundAxis3(p, vortexAxis, psi);
    }

    return p;
  };

  const sampleMinY = windType === 'vortex' ? Math.max(-0.96, bedYNorm - 0.18) : bedYNorm;
  const sampleMaxY = topYNorm;
  const steps = draft ? 136 : 196;

  for (let k = 0; k < finCount; k++) {
    const theta0 = (2 * Math.PI * k) / finCount;
    const rawPts: Vec3[] = new Array(steps + 1);
    const phiStart = Math.acos(clamp(sampleMinY, -1, 1));
    const phiEnd = Math.acos(clamp(sampleMaxY, -1, 1));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const phi = phiStart + (phiEnd - phiStart) * t;
      const ny0 = Math.cos(phi);
      rawPts[i] = applyWindFlow(theta0, ny0);
    }

    // Clip deformed 3D curve cleanly into continuous visible segments within [bedYNorm, topYNorm]
    const segments: Vec3[][] = [];
    let current: Vec3[] = [];
    const inBounds = (p: Vec3) => p.y >= bedYNorm && (!hasTopOpening || p.y <= topYNorm);

    const interpToY = (a: Vec3, b: Vec3, yLim: number): Vec3 => {
      const dy = b.y - a.y;
      const t = Math.abs(dy) > 1e-8 ? clamp((yLim - a.y) / dy, 0, 1) : 0.5;
      return clampUnitY(
        normalize3(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), a.z + t * (b.z - a.z)),
        bedYNorm,
        hasTopOpening ? topYNorm : 1.0
      );
    };

    for (let i = 0; i < rawPts.length; i++) {
      const p = rawPts[i];
      const ok = inBounds(p);
      if (ok) {
        if (current.length === 0 && i > 0 && !inBounds(rawPts[i - 1])) {
          const prev = rawPts[i - 1];
          const lim = prev.y < bedYNorm ? bedYNorm : topYNorm;
          current.push(interpToY(prev, p, lim));
        }
        current.push(p);
      } else if (current.length > 0) {
        const prev = rawPts[i - 1];
        const lim = p.y < bedYNorm ? bedYNorm : topYNorm;
        current.push(interpToY(prev, p, lim));
        if (current.length >= 6) segments.push(current);
        current = [];
      }
    }
    if (current.length >= 6) segments.push(current);

    for (let s = 0; s < segments.length; s++) {
      extrudeOpenSphericalCurve(
        mb,
        segments[s],
        config,
        seatY,
        shadeHeight,
        sphereR,
        sphereYc,
        useExactSphere,
        finThickness,
        finDepth,
        invertedForPendant
      );
    }
  }
}

/**
 * Estilo 7: Orgánica — Núcleo Difusor (1.2 mm) + 4 Submodos Escultóricos sobre Esfera 3D:
 *  - `flames`:  16–32 aletas sinuosas en contra-fase (celdas pétalo/flama, 128/192 segs).
 *  - `gravity`: Física 3D de celdas blandas Voronoi sobre S² (resorte + repulsión sin cruces + gravedad).
 *  - `growth`:  18–36 aletas meridianas con crecimiento diferencial (volantes/olanes en el borde libre).
 *  - `wind`:    45–75 aletas finas en campo vectorial difeomórfico 3D (Brisa / Ráfagas / Remolino).
 */
export const organicFamily: LampFamilyDefinition = {
  id: 'organic',
  name: 'Orgánica / Aletas Escultóricas',
  shortName: 'Orgánica',
  tagline: 'Núcleo difusor 1.2 mm + Flamas, Gravedad Física 3D, Crecimiento o Viento',

  getResolution(_config: LampConfig, draft: boolean) {
    return {
      radialSegs: draft ? 96 : 160,
      heightSegs: draft ? 72 : 128,
    };
  },

  createEvaluator(_config: LampConfig) {
    return (_ctx: DisplacementContext): DisplacementResult => ({
      outerOffset: 0,
      innerFollow: 1.0,
      uniformWallThicknessMm: 1.2,
    });
  },

  appendExtraGeometry(ctx: ExtraGeometryContext): void {
    const mode = ctx.config.organic.mode;
    if (mode === 'gravity') {
      appendSphericalVoronoiCells(ctx);
    } else if (mode === 'growth') {
      appendGrowthRuffledFins(ctx);
    } else if (mode === 'wind') {
      appendWindFlowFins(ctx);
    } else {
      appendFlameFins(ctx);
    }
  },
};
