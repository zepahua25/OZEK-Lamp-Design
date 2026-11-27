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
    const effTheta = theta + sculpt.dThetaRad * csBlend;
    const effR = Math.max(2.0, r0 + sculpt.drMm * 0.55 * (1 - smoothstep(0.84, 0.98, vDesign)));

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
    const nOut = normalize3(nRaw.x, nRaw.y, nRaw.z);
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

  const minAllowedY = seatY + 1.0;
  const maxAllowedY = seatY + shadeHeight - 0.5;

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
    const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
    const upperFade = isClosedDome
      ? 1 - smoothstep(0.8, 0.988, vD)
      : 1 - smoothstep(0.87, 0.94, vD);
    const endGuard = smoothstep(0.03, 0.1, vD) * upperFade;
    const taperSpan = Math.max(4, Math.round(K * 0.045));
    const openTaper = isClosed
      ? 1.0
      : smoothstep(0, taperSpan, i) * smoothstep(0, taperSpan, K - 1 - i);
    const uNorm = (((samples[i].theta / (2 * Math.PI)) % 1) + 1) % 1;
    const sculpt = evaluateSculptField(uNorm, vD, shadeHeight, 75, config.sculptStrokes);
    const sculptedDepth = Math.max(0.35, finDepthMm + sculpt.drMm * 0.45);
    const depthHere = Math.max(
      0.35,
      sculptedDepth *
        samples[i].depthScale *
        endGuard *
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
  const vEnd = isClosedDome ? 0.986 : 0.94;

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

      const halfFinAngle = (finThickness * 0.52 + 0.08) / Math.max(12, rLocal);
      const touchAmpAtV = Math.max(0, sectorHalf - halfFinAngle);

      const phase = t * waves * Math.PI * 2;
      const waveVal = (Math.sin(phase) + 0.1 * Math.sin(phase * 2)) / 1.07;

      const poleEnvelope = smoothstep(0.0, 0.06, t) * (1 - smoothstep(0.92, 1.0, t));
      const theta = baseTheta + sign * touchAmpAtV * 0.985 * waveVal * poleEnvelope;

      const petalFullness = 0.78 + 0.22 * Math.pow(Math.abs(Math.sin(phase * 0.5)), 0.75);
      const archEnv = Math.sin(t * Math.PI);
      const depthScale = clamp((0.32 + 0.68 * Math.pow(archEnv, 0.45)) * petalFullness, 0.18, 1.0);

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
// SUBMODE B: "Gravedad" — 2–8 CONTINUOUS F1-TRACK DIFFERENTIAL CURVE GROWTH CIRCUITS ON S²
// Starts from 2–8 small 24-node circles on opposite sides of the sphere, grows each closed loop
// over 72–125 iterations via dynamic midpoint subdivision (~180–320 nodes/circuit) with curvature
// stiffness, strict non-crossing repulsion (minSep = thickness + 0.5 mm), and tangential gravity,
// followed by 2-pass Chaikin smoothing and watertight 3D extrusion (18–24 mm deep, 1.3–1.6 mm wall).
// =================================================================================================

/**
 * Appends a smooth watertight Ø4.4 mm central polar union button at the exact North Pole (R = 0)
 * of a closed sphere so dense radial fins in "Crecimiento" and "Viento" merge seamlessly with
 * zero central pinhole!
 */
function appendPolarUnionButton(
  mb: SolidMeshBuilder,
  poleY: number,
  radiusMm = 2.2,
  crownHeightMm = 2.0
): void {
  const N = 28;
  const yBot = poleY - 1.25; // Embedded safely inside the 1.2 mm closed sphere core
  const yRim = poleY + 0.35;
  const yMid = poleY + crownHeightMm * 0.68;
  const yTop = poleY + crownHeightMm;

  const botCenter = mb.addVertex(0, yBot, 0, 2.4);
  const topCenter = mb.addVertex(0, yTop, 0, 1.8);

  const ringBot = new Int32Array(N);
  const ringRim = new Int32Array(N);
  const ringMid = new Int32Array(N);

  for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N;
    ringBot[i] = mb.addCyl(radiusMm, th, yBot, 2.4);
    ringRim[i] = mb.addCyl(radiusMm, th, yRim, 2.2);
    ringMid[i] = mb.addCyl(radiusMm * 0.58, th, yMid, 2.0);
  }

  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    // Bottom disk (-Y outward)
    mb.addTri(botCenter, ringBot[j], ringBot[i]);
    // Outer vertical collar (+r outward)
    mb.addQuad(ringBot[i], ringBot[j], ringRim[j], ringRim[i]);
    // Lower dome slope (+r/+Y outward)
    mb.addQuad(ringRim[i], ringRim[j], ringMid[j], ringMid[i]);
    // Upper dome crown to exact apex (+Y outward)
    mb.addTri(ringMid[i], ringMid[j], topCenter);
  }
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
 * SUBMODE B: "Gravedad" — 2–8 Long Continuous F1-Track Differential Curve Growth Circuits on S².
 * Zero Voronoi polygons! Spawns 2–8 small 24-node closed circles on opposite sides of the sphere
 * and grows each loop over 76 (draft) / 124 (export) iterations of real Differential Curve Growth:
 *  - Dynamic midpoint subdivision whenever an edge exceeds ~4.5 mm (reaching 180–320 nodes/circuit)
 *    so each ribbon snakes across the entire sphere in sweeping F1 meanders & hairpins.
 *  - Curvature stiffness ("Suavidad") keeping broad fluid bends without kinks.
 *  - Strict non-adjacent repulsion (same circuit + other circuits, minSep = thickness + 0.5 mm) so
 *    ribbons NEVER cross and stack side-by-side into parallel double/triple highways.
 *  - Tangential vertical gravity ("Gravedad") gently draping meanders downward over the sphere.
 *  - 2-pass closed Chaikin polish + watertight 18–24 mm deep extrusion clipped cleanly at Z = 0.
 */
function appendSphericalVoronoiCells(ctx: ExtraGeometryContext): void {
  const { mb, config, seatY, shadeHeight, draft, invertedForPendant } = ctx;
  const org = config.organic;
  const { silhouette, mount } = config;

  // Number of continuous F1-track circuits (2 to 8, default 4)
  const numStrands = Math.round(clamp(org.voronoiCells ?? 4, 2, 8));
  const dispersion = clamp(org.voronoiDispersion ?? 0.5, 0, 1);
  const softness = clamp(org.voronoiSoftness ?? 0.78, 0, 1);
  const gravNorm = clamp((org.gravityAccel ?? -7.8) / 9.8, -1.0, 1.0);
  const twistRadTotal = ((org.gravityTwistDeg ?? 0) * Math.PI) / 180;
  const finDepth = clamp(org.finDepth ?? 21, 18, 24);
  const finThickness = clamp(org.finThickness ?? 1.4, 1.3, 1.6);
  const liftFactor = clamp((org.finLift ?? 0.2) * 0.45 + gravNorm * 0.08, -0.18, 0.55);

  const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
  const useExactSphere = isClosedDome && isSphereSilhouette(silhouette);
  const sphereR = clamp(shadeHeight / 1.78, 34, 118);
  const sphereYc = 0.78 * sphereR;

  const bedYNorm = -0.78 + clamp(2.0 / sphereR, 0.016, 0.044);
  const hasTopOpening = !isClosedDome || mount.type === 'e26_e27';
  const topYNorm = !isClosedDome
    ? 0.92
    : mount.type === 'e26_e27'
      ? Math.sqrt(Math.max(0, 1 - Math.pow(9.8 / sphereR, 2)))
      : 0.999;

  const rand = createSeededRandom(org.seed || 3141);

  // 1. Place 2–8 seed centers with maximal spherical spread across BOTH upper & lower hemispheres
  //    (exact tetrahedral / Fibonacci spacing so circuits cover 100% of the sphere and NEVER start overlapped!)
  const centers: Vec3[] = [];
  const baseAzimuth = rand() * Math.PI * 2;
  if (numStrands === 4) {
    // Exact regular tetrahedron oriented on the visible sphere: 1 top dome + 3 lower-mid flanks 120° apart!
    const topAz = baseAzimuth;
    const topY = clamp(0.74 + (rand() - 0.5) * 0.14 * dispersion, 0.58, 0.86);
    const topR = Math.sqrt(Math.max(0.01, 1 - topY * topY));
    centers.push(normalize3(topR * Math.cos(topAz) * 0.4, topY, -topR * Math.sin(topAz) * 0.4));
    for (let k = 0; k < 3; k++) {
      const az = baseAzimuth + (2 * Math.PI * k) / 3 + (rand() - 0.5) * 0.28 * dispersion;
      const ny = clamp(-0.24 + (rand() - 0.5) * 0.22 * dispersion, bedYNorm + 0.34, 0.08);
      const rH = Math.sqrt(Math.max(0.01, 1 - ny * ny));
      centers.push(normalize3(rH * Math.cos(az), ny, -rH * Math.sin(az)));
    }
  } else {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let s = 0; s < numStrands; s++) {
      const frac = (s + 0.5) / numStrands;
      const nyRaw = (topYNorm - 0.18) - frac * ((topYNorm - 0.18) - (bedYNorm + 0.34));
      const ny = clamp(nyRaw + (rand() - 0.5) * 0.18 * dispersion, bedYNorm + 0.34, topYNorm - 0.16);
      const az = baseAzimuth + s * goldenAngle + (rand() - 0.5) * 0.25 * dispersion;
      const rH = Math.sqrt(Math.max(0.01, 1 - ny * ny));
      centers.push(normalize3(rH * Math.cos(az), ny, -rH * Math.sin(az)));
    }
  }

  // Compute minimum angular distance between any two seed centers to GUARANTEE zero initial overlap!
  let minPairAng = Math.PI;
  for (let a = 0; a < numStrands; a++) {
    for (let b = a + 1; b < numStrands; b++) {
      const ang = Math.acos(clamp(dot3(centers[a], centers[b]), -1, 1));
      if (ang < minPairAng) minPairAng = ang;
    }
  }

  // 2. Initialize each circuit as a clean 24-node closed circle on S² safely inside its non-overlapping radius
  interface TrackCircuit {
    pts: Vec3[];
    phase: number;
    lobeFreq: number;
    weightBias: number;
  }

  const initNodes = 24;
  const initRadiusRad = clamp(minPairAng * 0.32, 0.16, 0.34);
  const tracks: TrackCircuit[] = [];

  for (let s = 0; s < numStrands; s++) {
    const c = centers[s];
    const up: Vec3 = Math.abs(c.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const e1 = normalize3(
      up.y * c.z - up.z * c.y,
      up.z * c.x - up.x * c.z,
      up.x * c.y - up.y * c.x
    );
    const e2 = cross3(c, e1);
    const pPhase = rand() * Math.PI * 2;
    const lobeFreq = (s & 1) === 0 ? 3 : 2;

    const pts: Vec3[] = new Array(initNodes);
    for (let i = 0; i < initNodes; i++) {
      const ang = (2 * Math.PI * i) / initNodes;
      const rLocal = initRadiusRad * (1.0 + 0.14 * Math.sin(ang * lobeFreq + pPhase));
      const sinR = Math.sin(rLocal);
      const cosR = Math.cos(rLocal);
      const p = normalize3(
        c.x * cosR + sinR * (Math.cos(ang) * e1.x + Math.sin(ang) * e2.x),
        c.y * cosR + sinR * (Math.cos(ang) * e1.y + Math.sin(ang) * e2.y),
        c.z * cosR + sinR * (Math.cos(ang) * e1.z + Math.sin(ang) * e2.z)
      );
      pts[i] = clampUnitY(p, bedYNorm, topYNorm);
    }

    tracks.push({
      pts,
      phase: pPhase,
      lobeFreq,
      weightBias: 0.82 + 0.36 * rand(),
    });
  }

  // 3. Exact Point-to-Segment Spherical Differential Curve Growth on S² (96 draft / 136 export iters):
  //    - Point-to-segment repulsion closes EVERY gap between consecutive nodes -> 0 crossings possible!
  //    - Strict CFL step cap (maxStep <= 0.35 * minSepChord) -> 0 tunneling possible!
  //    - Smooth 2-stage expansion + Differential Curve Growth fills the entire sphere in parallel F1 tracks!
  const targetEdgeLen = clamp(4.6 / sphereR, 0.036, 0.068);
  const splitThreshold = targetEdgeLen * 1.15;
  // Impenetrable ribbon-to-ribbon minimum separation: finThickness + 0.55 mm
  const minSepChord = clamp((finThickness + 0.55) / sphereR, 0.017, 0.068);
  // Tight inter-circuit halo -> DIFFERENT circuits run tightly parallel side-by-side (double/triple tracks!)
  const interRange = Math.max(minSepChord * 2.5, targetEdgeLen * 1.25);
  // Broad self-repulsion halo -> SAME circuit forms wide sweeping "S" & "U" light channels!
  const selfRange = Math.max(minSepChord * 5.6, targetEdgeLen * 2.55);

  const densityScale = clamp(4.0 / Math.max(2, numStrands), 0.55, 1.45);
  const maxNodesPerTrack = Math.round(
    clamp((draft ? 225 : 295) * Math.sqrt(densityScale), 175, draft ? 260 : 320)
  );
  const totalIters = draft ? 96 : 136; // 60–100 draft, 110–150 high-res!
  const expandEndIter = Math.round(totalIters * 0.32);
  const growthStopIter = Math.round(totalIters * 0.86);

  // Zero-GC flat typed-array 3D spatial hash storing EDGE MIDPOINTS for exact point-to-segment queries!
  // Cell size >= max(selfRange, targetEdgeLen * 1.2) guarantees checking 3×3×3 voxels finds EVERY nearby segment!
  const cellSize = Math.max(selfRange + targetEdgeLen * 0.65, 0.055);
  const gridDim = clamp(Math.ceil(2.24 / cellSize), 8, 26);
  const gridTotal = gridDim * gridDim * gridDim;
  const maxTotalNodes = numStrands * maxNodesPerTrack;

  const bucketHead = new Int32Array(gridTotal);
  const segNext = new Int32Array(maxTotalNodes);
  const segTrack = new Int32Array(maxTotalNodes);
  const segIdx = new Int32Array(maxTotalNodes);
  const fxBuf = new Float64Array(maxTotalNodes);
  const fyBuf = new Float64Array(maxTotalNodes);
  const fzBuf = new Float64Array(maxTotalNodes);
  const crowdBuf = new Float64Array(maxTotalNodes);
  const trackOff = new Int32Array(numStrands);

  const hashCoord = (v: number): number => {
    const idx = Math.floor((v + 1.12) / cellSize);
    return idx < 0 ? 0 : idx >= gridDim ? gridDim - 1 : idx;
  };

  const kSpring = 0.4;
  const kCurvatureBase = 0.1 + softness * 0.15;
  const kInterHard = 1.05;
  const kInterSoft = 0.22;
  const kSelfHard = 0.98;
  const kSelfSoft = 0.24 + softness * 0.08;
  const gravStep = gravNorm * (0.001 + softness * 0.0016);
  // STRICT CFL NON-TUNNELING STEP CAP: always <= 0.35 * minSepChord so two curves NEVER pass through each other!
  const maxStep = minSepChord * 0.35;
  const yCeiling = hasTopOpening ? topYNorm : 0.999;

  for (let iter = 0; iter < totalIters; iter++) {
    const inStage1Expand = iter < expandEndIter;
    const isGrowing = iter < growthStopIter;
    const growProgress = iter / Math.max(1, growthStopIter);
    const growEnv = isGrowing ? 1.0 - 0.22 * growProgress : 0.0;
    // Extra smooth settling stiffness in final 14% iterations for glass-smooth bends everywhere!
    const kCurvature = inStage1Expand ? 0.07 : isGrowing ? kCurvatureBase : kCurvatureBase * 1.45;
    const activeSelfRange = inStage1Expand ? minSepChord * 2.6 : selfRange;

    // 3a. Rebuild 3D spatial hash indexing every EDGE MIDPOINT (a+b)/2 across all circuits
    bucketHead.fill(-1);
    let totalActive = 0;
    for (let s = 0; s < numStrands; s++) {
      trackOff[s] = totalActive;
      const pts = tracks[s].pts;
      const M = pts.length;
      for (let i = 0; i < M; i++) {
        const gId = totalActive++;
        const a = pts[i];
        const b = pts[(i + 1) % M];
        const mx = (a.x + b.x) * 0.5;
        const my = (a.y + b.y) * 0.5;
        const mz = (a.z + b.z) * 0.5;
        segTrack[gId] = s;
        segIdx[gId] = i;
        const bIdx = (hashCoord(mx) * gridDim + hashCoord(my)) * gridDim + hashCoord(mz);
        segNext[gId] = bucketHead[bIdx];
        bucketHead[bIdx] = gId;
        fxBuf[gId] = 0;
        fyBuf[gId] = 0;
        fzBuf[gId] = 0;
        crowdBuf[gId] = 0;
      }
    }

    // 3b. Accumulate Spring + Curvature + EXACT Point-to-Segment Repulsion + Outward Growth + Gravity
    for (let s = 0; s < numStrands; s++) {
      const trk = tracks[s];
      const pts = trk.pts;
      const M = pts.length;
      const base = trackOff[s];
      const canGrow = isGrowing && M < maxNodesPerTrack;
      const desiredEdge = canGrow ? targetEdgeLen * 1.08 : targetEdgeLen;

      for (let i = 0; i < M; i++) {
        const gId = base + i;
        const p = pts[i];
        const pPrev = pts[(i - 1 + M) % M];
        const pNext = pts[(i + 1) % M];

        let fx = 0;
        let fy = 0;
        let fz = 0;

        // (1) Edge length spring
        const dPrevX = pPrev.x - p.x;
        const dPrevY = pPrev.y - p.y;
        const dPrevZ = pPrev.z - p.z;
        const lPrev = Math.hypot(dPrevX, dPrevY, dPrevZ);
        if (lPrev > 1e-6) {
          const st = (lPrev - desiredEdge) / lPrev;
          fx += dPrevX * st * kSpring;
          fy += dPrevY * st * kSpring;
          fz += dPrevZ * st * kSpring;
        }

        const dNextX = pNext.x - p.x;
        const dNextY = pNext.y - p.y;
        const dNextZ = pNext.z - p.z;
        const lNext = Math.hypot(dNextX, dNextY, dNextZ);
        if (lNext > 1e-6) {
          const st = (lNext - desiredEdge) / lNext;
          fx += dNextX * st * kSpring;
          fy += dNextY * st * kSpring;
          fz += dNextZ * st * kSpring;
        }

        // (2) Curvature fairing (smooth fluid curves)
        const midX = 0.5 * (pPrev.x + pNext.x);
        const midY = 0.5 * (pPrev.y + pNext.y);
        const midZ = 0.5 * (pPrev.z + pNext.z);
        fx += (midX - p.x) * kCurvature;
        fy += (midY - p.y) * kCurvature;
        fz += (midZ - p.z) * kCurvature;

        // (3) EXACT Point-to-Segment Repulsion against ALL non-adjacent edges -> ZERO GAPS, ZERO CROSSINGS!
        let repX = 0;
        let repY = 0;
        let repZ = 0;
        let interCrowd = 0;
        let selfCrowd = 0;

        const gx = hashCoord(p.x);
        const gy = hashCoord(p.y);
        const gz = hashCoord(p.z);
        const x0 = gx > 0 ? gx - 1 : 0;
        const x1 = gx + 1 < gridDim ? gx + 1 : gridDim - 1;
        const y0 = gy > 0 ? gy - 1 : 0;
        const y1 = gy + 1 < gridDim ? gy + 1 : gridDim - 1;
        const z0 = gz > 0 ? gz - 1 : 0;
        const z1 = gz + 1 < gridDim ? gz + 1 : gridDim - 1;

        for (let bx = x0; bx <= x1; bx++) {
          const bxOff = bx * gridDim;
          for (let by = y0; by <= y1; by++) {
            const bxyOff = (bxOff + by) * gridDim;
            for (let bz = z0; bz <= z1; bz++) {
              let segId = bucketHead[bxyOff + bz];
              while (segId !== -1) {
                const otherS = segTrack[segId];
                const otherI = segIdx[segId];
                const otherPts = tracks[otherS].pts;
                const otherM = otherPts.length;

                // Skip incident / adjacent edges of the SAME circuit (distance < 3 edges)
                let skip = false;
                if (otherS === s) {
                  const d1 = Math.min(Math.abs(i - otherI), M - Math.abs(i - otherI));
                  const nextOther = (otherI + 1) % otherM;
                  const d2 = Math.min(Math.abs(i - nextOther), M - Math.abs(i - nextOther));
                  if (d1 < 3 || d2 < 3) skip = true;
                }

                if (!skip) {
                  const qa = otherPts[otherI];
                  const qb = otherPts[(otherI + 1) % otherM];
                  const ex = qb.x - qa.x;
                  const ey = qb.y - qa.y;
                  const ez = qb.z - qa.z;
                  const eLen2 = ex * ex + ey * ey + ez * ez;
                  let tProj = 0;
                  if (eLen2 > 1e-10) {
                    tProj = clamp(((p.x - qa.x) * ex + (p.y - qa.y) * ey + (p.z - qa.z) * ez) / eLen2, 0, 1);
                  }
                  const cx = qa.x + ex * tProj;
                  const cy = qa.y + ey * tProj;
                  const cz = qa.z + ez * tProj;

                  const dx = p.x - cx;
                  const dy = p.y - cy;
                  const dz = p.z - cz;
                  const d2 = dx * dx + dy * dy + dz * dz;

                  if (otherS !== s) {
                    if (d2 < interRange * interRange && d2 > 1e-12) {
                      const d = Math.sqrt(d2);
                      let push = 0;
                      if (d < minSepChord) {
                        push =
                          (minSepChord - d) * kInterHard +
                          (interRange - minSepChord) * kInterSoft * 0.25;
                        interCrowd += 1.5;
                      } else {
                        const u = (interRange - d) / (interRange - minSepChord);
                        push = u * u * (interRange - minSepChord) * kInterSoft;
                        interCrowd += u * 0.9;
                      }
                      const invD = push / d;
                      repX += dx * invD;
                      repY += dy * invD;
                      repZ += dz * invD;
                    }
                  } else if (d2 < activeSelfRange * activeSelfRange && d2 > 1e-12) {
                    const d = Math.sqrt(d2);
                    let push = 0;
                    if (d < minSepChord) {
                      push =
                        (minSepChord - d) * kSelfHard +
                        (activeSelfRange - minSepChord) * kSelfSoft * 0.25;
                      selfCrowd += 1.4;
                    } else {
                      const u = (activeSelfRange - d) / (activeSelfRange - minSepChord);
                      push = u * u * (activeSelfRange - minSepChord) * kSelfSoft;
                      selfCrowd += u * 0.55;
                    }
                    const invD = push / d;
                    repX += dx * invD;
                    repY += dy * invD;
                    repZ += dz * invD;
                  }
                }
                segId = segNext[segId];
              }
            }
          }
        }

        fx += repX;
        fy += repY;
        fz += repZ;
        const totalCrowd = interCrowd + selfCrowd;
        crowdBuf[gId] = totalCrowd;

        // (4) Signed Differential Curve Growth drive:
        //     - Stage 1: pure outward expansion until neighboring circuits meet cleanly across the sphere.
        //     - Stage 2: coupled inward/outward buckling! Inward peninsulas (-nOutLoop) dive into each loop's
        //       wide open interior while the neighboring circuit surges in right behind (+nOutLoop), forming
        //       long parallel double/triple F1-track hairpins across 100% of the sphere with ZERO crossings!
        if (canGrow) {
          const tCurve = normalize3(pNext.x - pPrev.x, pNext.y - pPrev.y, pNext.z - pPrev.z);
          const nOutLoop = normalize3(
            tCurve.y * p.z - tCurve.z * p.y,
            tCurve.z * p.x - tCurve.x * p.z,
            tCurve.x * p.y - tCurve.y * p.x
          );
          let growMag: number;
          if (inStage1Expand) {
            const openOut = 1.0 / (1.0 + totalCrowd * 2.2);
            growMag = targetEdgeLen * 0.46 * openOut;
          } else {
            const sPhase = (i / M) * Math.PI * 2;
            const signedWave =
              0.82 * Math.sin(sPhase * (trk.lobeFreq + 2) + trk.phase) +
              0.45 * Math.cos(sPhase * (trk.lobeFreq + 4) - trk.phase * 1.3);
            if (signedWave >= 0) {
              // Outward tongue expands into open gaps (e.g. chasing a neighbor's inward hairpin!)
              const openOut = 1.0 / (1.0 + totalCrowd * 2.4);
              growMag = targetEdgeLen * 0.52 * growEnv * openOut * signedWave;
            } else {
              // Inward peninsula dives into this circuit's own open interior (stopped cleanly by selfCrowd!)
              const openIn = 1.0 / (1.0 + selfCrowd * 2.6);
              growMag = targetEdgeLen * 0.54 * growEnv * openIn * signedWave;
            }
          }
          fx += nOutLoop.x * growMag;
          fy += nOutLoop.y * growMag;
          fz += nOutLoop.z * growMag;
        }

        // (5) Subtle tangential gravity in Stage 2
        if (Math.abs(gravStep) > 1e-6 && !inStage1Expand) {
          const latSin = Math.sqrt(Math.max(0, 1 - p.y * p.y));
          const gMag = gravStep * trk.weightBias * (0.45 + 0.65 * latSin);
          fx += -p.y * p.x * gMag;
          fy += (1 - p.y * p.y) * gMag;
          fz += -p.y * p.z * gMag;
        }

        // Clean floor cushion right above bedYNorm (Z = 0)
        if (p.y < bedYNorm + minSepChord * 1.2) {
          fy += (bedYNorm + minSepChord * 1.2 - p.y) * 0.75;
        }

        fxBuf[gId] = fx;
        fyBuf[gId] = fy;
        fzBuf[gId] = fz;
      }
    }

    // 3c. Integrate on S² tangent plane with STRICT CFL clamp + Dynamic Midpoint Subdivision
    for (let s = 0; s < numStrands; s++) {
      const trk = tracks[s];
      const pts = trk.pts;
      const M = pts.length;
      const base = trackOff[s];

      for (let i = 0; i < M; i++) {
        const gId = base + i;
        const p = pts[i];
        const fx = fxBuf[gId];
        const fy = fyBuf[gId];
        const fz = fzBuf[gId];

        const fDotP = fx * p.x + fy * p.y + fz * p.z;
        let tx = fx - fDotP * p.x;
        let ty = fy - fDotP * p.y;
        let tz = fz - fDotP * p.z;

        const tLen = Math.hypot(tx, ty, tz);
        if (tLen > maxStep) {
          const sc = maxStep / tLen;
          tx *= sc;
          ty *= sc;
          tz *= sc;
        }
        pts[i] = clampUnitY(normalize3(p.x + tx, p.y + ty, p.z + tz), bedYNorm, yCeiling);
      }

      if (isGrowing && M < maxNodesPerTrack) {
        const grown: Vec3[] = [];
        const activeSplitLen = inStage1Expand ? targetEdgeLen * 1.2 : splitThreshold;
        for (let i = 0; i < M; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % M];
          grown.push(a);
          const edgeLen = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
          const avgCrowd = 0.5 * (crowdBuf[base + i] + crowdBuf[base + ((i + 1) % M)]);
          const shouldSplit =
            edgeLen > activeSplitLen ||
            (!inStage1Expand && avgCrowd < 0.5 && edgeLen > targetEdgeLen * 0.88 && ((i + iter) % 5 === 0));
          if (shouldSplit && grown.length + (M - 1 - i) < maxNodesPerTrack) {
            grown.push(
              clampUnitY(
                normalize3((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5),
                bedYNorm,
                yCeiling
              )
            );
          }
        }
        if (grown.length > M) {
          trk.pts = grown;
        }
      }
    }
  }

  // 4. Two passes of closed Chaikin smoothing on S² + 2 hard separation sweeps for razor-smooth parallel ribbons!
  const chaikinRatio = 0.22;
  const finalLoops: Vec3[][] = new Array(numStrands);
  let totalSubNodes = 0;
  for (let s = 0; s < numStrands; s++) {
    let lp = tracks[s].pts;
    for (let pass = 0; pass < 2; pass++) {
      const M = lp.length;
      const next: Vec3[] = new Array(M * 2);
      for (let m = 0; m < M; m++) {
        const a = lp[m];
        const b = lp[(m + 1) % M];
        next[m * 2] = clampUnitY(
          normalize3(
            a.x * (1 - chaikinRatio) + b.x * chaikinRatio,
            a.y * (1 - chaikinRatio) + b.y * chaikinRatio,
            a.z * (1 - chaikinRatio) + b.z * chaikinRatio
          ),
          bedYNorm,
          yCeiling
        );
        next[m * 2 + 1] = clampUnitY(
          normalize3(
            a.x * chaikinRatio + b.x * (1 - chaikinRatio),
            a.y * chaikinRatio + b.y * (1 - chaikinRatio),
            a.z * chaikinRatio + b.z * (1 - chaikinRatio)
          ),
          bedYNorm,
          yCeiling
        );
      }
      lp = next;
    }
    finalLoops[s] = lp;
    totalSubNodes += lp.length;
  }

  // Post-Chaikin non-crossing guarantee sweeps (strictly respects minSepChord)
  const sepCellSize = Math.max(minSepChord * 1.4, 0.02);
  const sepDim = clamp(Math.ceil(2.24 / sepCellSize), 12, 44);
  const sepHead = new Int32Array(sepDim * sepDim * sepDim);
  const sepNext = new Int32Array(totalSubNodes);
  const sepTrack = new Int32Array(totalSubNodes);
  const sepIdx = new Int32Array(totalSubNodes);
  const sepFx = new Float64Array(totalSubNodes);
  const sepFy = new Float64Array(totalSubNodes);
  const sepFz = new Float64Array(totalSubNodes);
  const sepOff = new Int32Array(numStrands);
  const sepHash = (v: number): number => {
    const idx = Math.floor((v + 1.12) / sepCellSize);
    return idx < 0 ? 0 : idx >= sepDim ? sepDim - 1 : idx;
  };

  for (let sweep = 0; sweep < 2; sweep++) {
    sepHead.fill(-1);
    let gCount = 0;
    for (let s = 0; s < numStrands; s++) {
      sepOff[s] = gCount;
      const lp = finalLoops[s];
      for (let i = 0; i < lp.length; i++) {
        const gId = gCount++;
        const p = lp[i];
        sepTrack[gId] = s;
        sepIdx[gId] = i;
        const bIdx = (sepHash(p.x) * sepDim + sepHash(p.y)) * sepDim + sepHash(p.z);
        sepNext[gId] = sepHead[bIdx];
        sepHead[bIdx] = gId;
        sepFx[gId] = 0;
        sepFy[gId] = 0;
        sepFz[gId] = 0;
      }
    }
    for (let s = 0; s < numStrands; s++) {
      const lp = finalLoops[s];
      const M = lp.length;
      const base = sepOff[s];
      for (let i = 0; i < M; i++) {
        const p = lp[i];
        const gId = base + i;
        const gx = sepHash(p.x);
        const gy = sepHash(p.y);
        const gz = sepHash(p.z);
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
                if (otherId !== gId) {
                  const otherS = sepTrack[otherId];
                  const otherI = sepIdx[otherId];
                  const isNonAdj =
                    otherS !== s || Math.min(Math.abs(i - otherI), M - Math.abs(i - otherI)) >= 12;
                  if (isNonAdj) {
                    const q = finalLoops[otherS][otherI];
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
    for (let s = 0; s < numStrands; s++) {
      const lp = finalLoops[s];
      const base = sepOff[s];
      for (let i = 0; i < lp.length; i++) {
        const gId = base + i;
        const p = lp[i];
        const fx = sepFx[gId];
        const fy = sepFy[gId];
        const fz = sepFz[gId];
        if (fx * fx + fy * fy + fz * fz < 1e-12) continue;
        const fDot = fx * p.x + fy * p.y + fz * p.z;
        lp[i] = clampUnitY(
          normalize3(p.x + fx - fDot * p.x, p.y + fy - fDot * p.y, p.z + fz - fDot * p.z),
          bedYNorm,
          yCeiling
        );
      }
    }
  }

  // 5. Optional spiral twist + 3D watertight radial extrusion with per-circuit color ID (1..8)
  for (let s = 0; s < numStrands; s++) {
    let loop = finalLoops[s];
    if (Math.abs(twistRadTotal) > 1e-4) {
      loop = loop.map((p) => {
        const hFrac = clamp((p.y - bedYNorm) / Math.max(0.2, 1.0 - bedYNorm), 0, 1);
        const tw = twistRadTotal * hFrac;
        const ct = Math.cos(tw);
        const st = Math.sin(tw);
        return { x: p.x * ct - p.z * st, y: p.y, z: p.x * st + p.z * ct };
      });
    }

    extrudeClosedSphericalLoop(
      mb,
      loop,
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
      s + 1 // Strand color ID 1..8!
    );
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

      // Bold carnation/coral amplitude: neighboring outer edges nearly kiss across v = 0.08..0.92!
      const localSectorMm = (2 * Math.PI * Math.max(8, rEff + baseDepth * 0.72)) / finCount;
      const maxRuffleMm = Math.min(finDepth * 1.18, localSectorMm * 0.62);
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

  // Smooth watertight Ø4 mm central polar union button sealing any central micro-gap at R = 0.0 mm
  if (isClosedPoleLed) {
    appendPolarUnionButton(mb, seatY + shadeHeight, 2.0, 2.2);
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
  invertedForPendant: boolean
): void {
  const K = curveUnit.length;
  if (K < 5) return;

  const { silhouette, mount } = config;
  const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
  const isClosedPoleLed = isClosedDome && mount.type === 'led_kit_001';
  const baseHalfW = clamp(finThicknessMm, 0.9, 1.8) * 0.5;
  const embedMm = 0.65;

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
  const rootThick = finThicknessMm + 1.3;
  const tipThick = finThicknessMm + 0.4;

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
    // Delay radial height fade ONLY to the very last v >= 0.94 so fins converge lushly to R = 0!
    const poleRamp = isClosedPoleLed
      ? 1.0 - smoothstep(0.94, 0.999, vNorm)
      : 1.0 - smoothstep(0.88, 0.95, vNorm);
    // Only taper at the bottom bed end (not at the closed North Pole where poleRamp feathers cleanly)
    const startTaper = smoothstep(0, taperSpan, i);
    const endTaper = isClosedPoleLed ? 1.0 : smoothstep(0, taperSpan, K - 1 - i);

    const depthHere = Math.max(
      0.35,
      localDepths[i] * (0.18 + 0.82 * bedRamp) * (0.14 + 0.86 * poleRamp) * (0.3 + 0.7 * startTaper * endTaper)
    );

    // Gently slim fin half-width right at the exact pole center (v > 0.955) for a razor-crisp spiral eye
    const poleThin = isClosedPoleLed ? 1.0 - 0.56 * smoothstep(0.955, 0.999, vNorm) : 1.0;
    const hw = baseHalfW * poleThin;

    const rootX = pos.x - nOut.x * embedMm;
    const rootY = pos.y - nOut.y * embedMm;
    const rootZ = pos.z - nOut.z * embedMm;

    const tipX = pos.x + nOut.x * depthHere;
    const tipY = pos.y + nOut.y * depthHere;
    const tipZ = pos.z + nOut.z * depthHere;

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

  // Bijective smooth 3D diffeomorphism Φ: S² -> S² (mathematically non-crossing!)
  const applyWindFlow = (theta0: number, ny0: number): Vec3 => {
    const hFrac = clamp((ny0 - bedYNorm) / Math.max(0.25, 1.0 - bedYNorm), 0, 1);
    const poleEnv = smoothstep(0.0, 0.1, hFrac) * (1 - smoothstep(0.88, 1.0, hFrac));
    // Smooth central spiral twist for v > 0.80 closing the North Pole into a lush pinwheel!
    const polarSwirl = isClosedPoleLed ? 0.78 * Math.pow(smoothstep(0.80, 0.999, hFrac), 1.35) : 0;
    let theta = theta0 + polarSwirl;

    if (windType === 'breeze') {
      // Smooth diagonal breeze lean + gentle directional shear (∂theta'/∂theta >= 0.64 > 0)
      const diagSweep = intensity * (0.52 * hFrac + 0.14 * Math.sin(hFrac * Math.PI));
      const dirMod = 0.16 * intensity * Math.cos(theta0 - dirRad) * poleEnv;
      theta += diagSweep + dirMod;
    } else if (windType === 'gusts') {
      // 2–3 alternating smooth gust waves + bounded azimuthal density shift (∂theta'/∂theta >= 0.56 > 0)
      const waveSweep =
        intensity *
        (0.24 * Math.sin(2.6 * Math.PI * hFrac + dirRad) +
          0.11 * Math.sin(4.4 * Math.PI * hFrac - dirRad * 0.7)) *
        (0.35 + 0.65 * poleEnv);
      const bunching =
        0.21 *
        Math.min(intensity, 1.85) *
        Math.sin(theta0 - dirRad) *
        Math.sin(2.5 * Math.PI * hFrac) *
        poleEnv;
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
      const gamma = Math.acos(clamp(dot3(p, vortexAxis), -1, 1));
      const psi = intensity * 1.85 * Math.exp(-(gamma * gamma) / vortexTwoSigma2);
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

  // Smooth watertight Ø4 mm central polar union button sealing the North Pole completely (0.0 mm hole!)
  if (isClosedPoleLed) {
    appendPolarUnionButton(mb, seatY + shadeHeight, 2.0, 2.0);
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
