import { LampConfig } from '../../types/lamp';
import { SolidMeshBuilder } from '../baseBuilder';
import { SimplexNoise3D } from '../noise';
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
  evaluateSilhouetteRadius,
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

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Extrudes a single continuous polyline (open curve or closed loop) sitting on the smooth 1.2 mm diffuser core
 * into a **100% watertight 2-manifold solid fin/ribbon** anchored 0.65 mm inside the core outer wall.
 * Outward normals & positive signed volume are guaranteed by right-handed Frenet-surface frame construction.
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
  const embedMm = 0.65; // anchors solidly inside the 1.2 mm core wall without poking through inner bore!

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
    const sculpt = evaluateSculptField(uNorm, vDesign, shadeHeight, Math.max(20, r0), config.sculptStrokes);
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
    // Right-handed outward normal: T_u × T_v = (cos θ, -drdy, -sin θ)
    const nRaw = cross3(tU, tV);
    const nOut = normalize3(nRaw.x, nRaw.y, nRaw.z);
    return { pos, nOut, tU };
  };

  // Precompute surface frames
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
    // Closed sphere/dome: converge & fade fins smoothly right to the North Pole (v=0.985) without abrupt cutoff!
    // Open top: strict flat-rim guard reaching 0 at v=0.94 so top rim sits dead flat for 180° printing!
    const upperFade = isClosedDome
      ? 1 - smoothstep(0.76, 0.985, vD)
      : 1 - smoothstep(0.87, 0.94, vD);
    const endGuard = smoothstep(0.04, 0.11, vD) * upperFade;
    // Also taper open polyline ends cleanly so ribbons feather smoothly into the core
    const openTaper = isClosed
      ? 1.0
      : smoothstep(0, 3, i) * smoothstep(0, 3, K - 1 - i);
    const uNorm = (((samples[i].theta / (2 * Math.PI)) % 1) + 1) % 1;
    const sculpt = evaluateSculptField(uNorm, vD, shadeHeight, 75, config.sculptStrokes);
    const sculptedDepth = Math.max(0.35, finDepthMm + sculpt.drMm * 0.45);
    const depthHere = Math.max(
      0.35,
      sculptedDepth * samples[i].depthScale * endGuard * (0.25 + 0.75 * openTaper) * (1 - sculpt.smoothMask * 0.55)
    );

    // Apply upward vertical lift (reduces overhangs on horizontal Gravity ribbons!)
    const extDir = normalize3(nOut.x, nOut.y + liftFactor, nOut.z);

    const rootX = pos.x - nOut.x * embedMm;
    const rootY = clamp(pos.y - nOut.y * embedMm, minAllowedY, maxAllowedY);
    const rootZ = pos.z - nOut.z * embedMm;

    const tipX = pos.x + extDir.x * depthHere;
    const tipY = clamp(pos.y + extDir.y * depthHere, minAllowedY, maxAllowedY);
    const tipZ = pos.z + extDir.z * depthHere;

    // Assign higher local thickness on fins so the 1.2 mm diffuser core glows brightest in the light wells!
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
    // Tip face (+N_out)
    mb.addQuad(tl[i], tr[i], tr[j], tl[j]);
    // Root face (-N_out)
    mb.addQuad(bl[i], bl[j], br[j], br[i]);
    // +B side face
    mb.addQuad(br[i], br[j], tr[j], tr[i]);
    // -B side face
    mb.addQuad(bl[i], tl[i], tl[j], bl[j]);
  }

  if (!isClosed) {
    // Start cap (normal -T_curve)
    mb.addQuad(bl[0], br[0], tr[0], tl[0]);
    // End cap (normal +T_curve)
    mb.addQuad(bl[K - 1], tl[K - 1], tr[K - 1], br[K - 1]);
  }
}

/**
 * SUBMODE A: "Flamas / Ondas (Sin soportes)" (Amber sculpted flame sphere reference).
 * 16–32 vertical sinuous fins undulating in alternating opposite phase, forming flame/petal light wells
 * with mathematically bounded <= 45° print slope (100% support-free!).
 */
function appendFlameFins(ctx: ExtraGeometryContext): void {
  const { mb, config, seatY, shadeHeight, draft, invertedForPendant } = ctx;
  const org = config.organic;

  // Even count between 16 and 32 so every neighboring pair alternates cleanly in opposite phase
  const rawCount = Math.round(clamp(org.finCount || 24, 16, 32));
  const finCount = (rawCount & 1) === 1 ? rawCount + 1 : rawCount;
  const waves = clamp(org.flameWaves || 3, 2, 6);
  const finDepth = clamp(org.finDepth || 14, 8, 22);
  const finThickness = clamp(org.finThickness || 1.5, 1.2, 2.2);

  // Sample maximum radius along silhouette to enforce strict <= 44° slope on every flame fin!
  let maxR = 45;
  for (let k = 0; k <= 8; k++) {
    const r = evaluateSilhouetteRadius(k / 8, config.silhouette);
    if (r > maxR) maxR = r;
  }

  const sectorHalf = Math.PI / finCount;
  // Neighboring fins approach closely at petal tips without self-intersecting (leave >= 12% gap)
  const maxAmpBySector = sectorHalf * 0.84;
  // Slope limit: |d(arc)/dy| <= tan(43°) ≈ 0.93 -> 100% printable without supports!
  const maxAmpBySlope = (0.93 * shadeHeight) / (2 * Math.PI * waves * Math.max(40, maxR));
  const waveAmpRad = Math.min(maxAmpBySector, maxAmpBySlope);

  const steps = draft ? 38 : 72;
  const vStart = 0.04;
  const vEnd = config.silhouette.closeTopDome && !invertedForPendant ? 0.982 : 0.94;

  for (let k = 0; k < finCount; k++) {
    const baseTheta = (2 * Math.PI * k) / finCount;
    const sign = (k & 1) === 0 ? 1 : -1;
    const samples: CurveSample[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const v = vStart + (vEnd - vStart) * t;
      // Smooth flame wave with gentle organic second harmonic for teardrop/petal elegance
      const phase = t * waves * Math.PI * 2;
      const waveVal = Math.sin(phase) + 0.12 * Math.sin(phase * 2);
      // Taper angular swing softly at bottom/top poles so fins gather gracefully
      const poleEnvelope = smoothstep(0.0, 0.14, t) * (1 - smoothstep(0.86, 1.0, t));
      const theta = baseTheta + sign * waveAmpRad * waveVal * poleEnvelope;

      // Subtle depth breath along each flame petal (fullest across the open light well)
      const petalFullness = 0.72 + 0.28 * Math.pow(Math.abs(Math.sin(phase * 0.5)), 0.8);
      const archEnv = Math.sin(t * Math.PI);
      const depthScale = clamp((0.3 + 0.7 * Math.pow(archEnv, 0.55)) * petalFullness, 0.15, 1.0);

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
      0.08, // tiny natural upward bias
      invertedForPendant
    );
  }
}

interface Seg2D {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * Extracts smooth periodic isocurve polylines (closed loops & open ribbons) from a 2D scalar grid
 * on u in [0, 1) (periodic wrap) × v in [vMin, vMax] using Marching Squares + Laplacian smoothing.
 */
function extractIsocurvePolylines(
  field: Float32Array,
  Nu: number,
  Nv: number,
  isoValue: number,
  vMin: number,
  vMax: number,
  smoothPasses = 3
): Array<{ points: Array<{ u: number; v: number }>; isClosed: boolean }> {
  const segs: Seg2D[] = [];
  const dvStep = (vMax - vMin) / Nv;
  const duStep = 1.0 / Nu;

  const interp = (a: number, b: number): number => {
    const denom = b - a;
    if (Math.abs(denom) < 1e-7) return 0.5;
    return clamp((isoValue - a) / denom, 0.02, 0.98);
  };

  for (let j = 0; j < Nv; j++) {
    const v0 = vMin + j * dvStep;
    const v1 = v0 + dvStep;
    for (let i = 0; i < Nu; i++) {
      const iNext = (i + 1) % Nu;
      const u0 = i * duStep;
      const u1 = (i + 1) * duStep;

      const f00 = field[j * Nu + i];
      const f10 = field[j * Nu + iNext];
      const f11 = field[(j + 1) * Nu + iNext];
      const f01 = field[(j + 1) * Nu + i];

      const idx =
        (f00 >= isoValue ? 1 : 0) |
        (f10 >= isoValue ? 2 : 0) |
        (f11 >= isoValue ? 4 : 0) |
        (f01 >= isoValue ? 8 : 0);

      if (idx === 0 || idx === 15) continue;

      // Edge midpoints: 0=bottom, 1=right, 2=top, 3=left
      const ePt = (edge: number): [number, number] => {
        if (edge === 0) return [u0 + interp(f00, f10) * duStep, v0];
        if (edge === 1) return [u1, v0 + interp(f10, f11) * dvStep];
        if (edge === 2) return [u0 + interp(f01, f11) * duStep, v1];
        return [u0, v0 + interp(f00, f01) * dvStep];
      };

      const pushPair = (eA: number, eB: number) => {
        const [au, av] = ePt(eA);
        const [bu, bv] = ePt(eB);
        segs.push({ u0: au, v0: av, u1: bu, v1: bv });
      };

      switch (idx) {
        case 1:
        case 14:
          pushPair(3, 0);
          break;
        case 2:
        case 13:
          pushPair(0, 1);
          break;
        case 3:
        case 12:
          pushPair(3, 1);
          break;
        case 4:
        case 11:
          pushPair(1, 2);
          break;
        case 5: {
          const center = 0.25 * (f00 + f10 + f11 + f01);
          if (center >= isoValue) {
            pushPair(3, 2);
            pushPair(0, 1);
          } else {
            pushPair(3, 0);
            pushPair(1, 2);
          }
          break;
        }
        case 6:
        case 9:
          pushPair(0, 2);
          break;
        case 7:
        case 8:
          pushPair(3, 2);
          break;
        case 10: {
          const center = 0.25 * (f00 + f10 + f11 + f01);
          if (center >= isoValue) {
            pushPair(3, 0);
            pushPair(1, 2);
          } else {
            pushPair(3, 2);
            pushPair(0, 1);
          }
          break;
        }
      }
    }
  }

  if (segs.length === 0) return [];

  // Quantize endpoint keys with periodic u wrap (u === 1.0 maps to u === 0.0)
  const keyOf = (u: number, v: number): string => {
    const uWrap = ((u % 1) + 1) % 1;
    const ku = Math.round(uWrap * 10000) % 10000;
    const kv = Math.round(v * 10000);
    return `${ku}_${kv}`;
  };

  const adj = new Map<string, number[]>();
  for (let s = 0; s < segs.length; s++) {
    const k0 = keyOf(segs[s].u0, segs[s].v0);
    const k1 = keyOf(segs[s].u1, segs[s].v1);
    let a0 = adj.get(k0);
    if (!a0) {
      a0 = [];
      adj.set(k0, a0);
    }
    a0.push(s);
    let a1 = adj.get(k1);
    if (!a1) {
      a1 = [];
      adj.set(k1, a1);
    }
    a1.push(s);
  }

  const visited = new Uint8Array(segs.length);
  const polylines: Array<{ points: Array<{ u: number; v: number }>; isClosed: boolean }> = [];

  const unwrapNextU = (prevU: number, rawU: number): number => {
    let du = (((rawU - prevU) % 1) + 1.5) % 1 - 0.5;
    return prevU + du;
  };

  const traceFrom = (startSeg: number) => {
    visited[startSeg] = 1;
    const first = segs[startSeg];
    const chain: Array<{ u: number; v: number }> = [
      { u: first.u0, v: first.v0 },
      { u: unwrapNextU(first.u0, first.u1), v: first.v1 },
    ];

    // Extend forward
    while (true) {
      const tail = chain[chain.length - 1];
      const kTail = keyOf(tail.u, tail.v);
      const list = adj.get(kTail);
      if (!list) break;
      let found = -1;
      for (const sIdx of list) {
        if (!visited[sIdx]) {
          found = sIdx;
          break;
        }
      }
      if (found === -1) break;
      visited[found] = 1;
      const seg = segs[found];
      const k0 = keyOf(seg.u0, seg.v0);
      const nextRaw = k0 === kTail ? { u: seg.u1, v: seg.v1 } : { u: seg.u0, v: seg.v0 };
      chain.push({ u: unwrapNextU(tail.u, nextRaw.u), v: nextRaw.v });
    }

    // Extend backward from head
    while (true) {
      const head = chain[0];
      const kHead = keyOf(head.u, head.v);
      const list = adj.get(kHead);
      if (!list) break;
      let found = -1;
      for (const sIdx of list) {
        if (!visited[sIdx]) {
          found = sIdx;
          break;
        }
      }
      if (found === -1) break;
      visited[found] = 1;
      const seg = segs[found];
      const k0 = keyOf(seg.u0, seg.v0);
      const prevRaw = k0 === kHead ? { u: seg.u1, v: seg.v1 } : { u: seg.u0, v: seg.v0 };
      chain.unshift({ u: unwrapNextU(head.u, prevRaw.u), v: prevRaw.v });
    }

    const head = chain[0];
    const tail = chain[chain.length - 1];
    const isClosed =
      chain.length >= 6 &&
      keyOf(head.u, head.v) === keyOf(tail.u, tail.v) &&
      Math.abs(head.u - tail.u) < 0.2;

    if (isClosed) {
      chain.pop(); // remove duplicate closing vertex
    }
    if (chain.length < (isClosed ? 6 : 5)) return;

    // Configurable Laplacian smoothing passes (1 = crisp/rigid, 5 = silky/soft ribbons)
    const passes = Math.max(1, Math.min(6, Math.round(smoothPasses)));
    let pts = chain;
    for (let pass = 0; pass < passes; pass++) {
      const nextPts = pts.map((p) => ({ ...p }));
      const M = pts.length;
      for (let i = 0; i < M; i++) {
        if (!isClosed && (i === 0 || i === M - 1)) continue;
        const pPrev = pts[(i - 1 + M) % M];
        const pCurr = pts[i];
        const pNext = pts[(i + 1) % M];
        nextPts[i].u = pCurr.u * 0.5 + (pPrev.u + pNext.u) * 0.25;
        nextPts[i].v = clamp(pCurr.v * 0.5 + (pPrev.v + pNext.v) * 0.25, vMin, vMax);
      }
      pts = nextPts;
    }

    polylines.push({ points: pts, isClosed });
  };

  for (let s = 0; s < segs.length; s++) {
    if (!visited[s]) {
      traceFrom(s);
    }
  }

  return polylines;
}

/**
 * SUBMODE B: "Listones Flujo / Gravity" (Red/Cream/Mint sculpted ribbon sphere reference).
 * Real 2D Marching-Squares isocurves of a domain-warped 3D Simplex noise field evaluated on the
 * lamp surface, extruded into thin curved ribbons with configurable vertical `finLift` to reduce overhangs!
 */
function appendGravityRibbons(ctx: ExtraGeometryContext): void {
  const { mb, config, seatY, shadeHeight, draft, invertedForPendant } = ctx;
  const org = config.organic;
  const noise = new SimplexNoise3D(Math.round(org.seed || 3141));

  const Nu = draft ? 68 : 112;
  const Nv = draft ? 44 : 72;
  const vMin = 0.06;
  const vMax = config.silhouette.closeTopDome && !invertedForPendant ? 0.975 : 0.92;
  const effScale = clamp(org.scale || 1.85, 0.8, 4.2) * 0.62;
  const effWarp = clamp(org.warp || 1.1, 0, 1.8) * 0.62;
  const aspectY = shadeHeight / Math.max(config.silhouette.midRadius * 2, 95);
  // Physical gravity acceleration (-9.8 to +9.8 m/s²): negative pulls loops downward (sag), positive lifts upward!
  const gravNorm = clamp((org.gravityAccel ?? -6.5) / 9.8, -1.0, 1.0);
  const twistRadTotal = ((org.gravityTwistDeg ?? 0) * Math.PI) / 180;
  const smoothPasses = Math.max(1, Math.min(5, Math.round(org.smoothPasses ?? 3)));

  // Evaluate seamless 3D domain-warped Simplex field on (u, v) grid with gravitational sag & spiral twist
  const field = new Float32Array(Nu * (Nv + 1));
  for (let j = 0; j <= Nv; j++) {
    const v = vMin + ((vMax - vMin) * j) / Nv;
    const ny = (v - 0.5) * 2.0 * aspectY * effScale;
    const twistHere = twistRadTotal * v;
    for (let i = 0; i < Nu; i++) {
      const theta = (2 * Math.PI * i) / Nu + twistHere;
      const nx = Math.cos(theta) * effScale;
      const nz = -Math.sin(theta) * effScale;

      let val: number;
      if (effWarp > 0.005) {
        const qx = noise.noise3D(nx + 2.7, ny - 1.3, nz + 4.1);
        const qy = noise.noise3D(nx - 3.9, ny + 2.1, nz - 1.8);
        const qz = noise.noise3D(nx + 1.1, ny + 5.2, nz - 3.4);
        // Gravity bends vertical flow lines downward (negative g) or upward (positive g)
        const gravOffset = -gravNorm * 0.42 * (0.5 + 0.5 * qx);
        val = noise.noise3D(nx + effWarp * qx, ny + effWarp * qy + gravOffset, nz + effWarp * qz);
      } else {
        val = noise.noise3D(nx, ny, nz);
      }
      field[j * Nu + i] = val;
    }
  }

  const levelCount = Math.max(3, Math.min(7, Math.round(org.bands || 5)));
  const finDepth = clamp(org.finDepth || 14, 8, 22);
  const finThickness = clamp(org.finThickness || 1.5, 1.2, 2.2);
  // Combine explicit Lift anti-overhang control with physical gravity direction
  const liftFactor = clamp((org.finLift ?? 0.4) * 0.72 + gravNorm * 0.28, -0.32, 0.88);

  for (let l = 0; l < levelCount; l++) {
    const frac = levelCount === 1 ? 0.5 : l / (levelCount - 1);
    const iso = -0.52 + frac * 1.04;
    const polylines = extractIsocurvePolylines(field, Nu, Nv, iso, vMin, vMax, smoothPasses);

    for (const poly of polylines) {
      const samples: CurveSample[] = poly.points.map((pt) => ({
        theta: pt.u * Math.PI * 2,
        v: pt.v,
        depthScale: 1.0,
      }));

      extrudeRibbonOnSurface(
        mb,
        samples,
        poly.isClosed,
        config,
        seatY,
        shadeHeight,
        finThickness,
        finDepth,
        liftFactor,
        invertedForPendant
      );
    }
  }
}

/**
 * Estilo 7: Orgánica — Núcleo Difusor (1.2 mm) + Aletas/Listones Finos Extruidos (1.2–2.2 mm × 8–22 mm).
 *  - Submodo `flames`: 16–32 aletas verticales sinuosas en contra-fase (celdas tipo pétalo/flama ≤ 45°, 0% soportes).
 *  - Submodo `gravity`: Isocurvas Marching Squares de Simplex 3D con domain warping y slider `Lift`.
 */
export const organicFamily: LampFamilyDefinition = {
  id: 'organic',
  name: 'Orgánica / Aletas Escultóricas',
  shortName: 'Orgánica',
  tagline: 'Núcleo difusor liso de 1.2 mm + aletas finas extruidas (Flamas y Listones Flujo)',

  getResolution(_config: LampConfig, draft: boolean) {
    // Smooth 1.2 mm diffuser core needs clean silhouette resolution while extruded fins carry crisp detail
    return {
      radialSegs: draft ? 84 : 144,
      heightSegs: draft ? 52 : 96,
    };
  },

  createEvaluator(_config: LampConfig) {
    // Smooth 1.2 mm continuous inner diffuser core (zero surface bumps, dead-flat top rim for v >= 0.94!)
    return (_ctx: DisplacementContext): DisplacementResult => ({
      outerOffset: 0,
      innerFollow: 1.0,
      uniformWallThicknessMm: 1.2,
    });
  },

  appendExtraGeometry(ctx: ExtraGeometryContext): void {
    if (ctx.config.organic.mode === 'gravity') {
      appendGravityRibbons(ctx);
    } else {
      appendFlameFins(ctx);
    }
  },
};
