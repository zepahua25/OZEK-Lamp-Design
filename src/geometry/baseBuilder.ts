import { LampConfig } from '../types/lamp';
import {
  BAYONET_DEPTH_MM,
  COMPACT_FLUSH_COLLAR_RADIUS_MM,
  COMPACT_FLUSH_HEIGHT_MM,
  COMPACT_FLUSH_OUTER_RADIUS_MM,
  COMPACT_FLUSH_RIM_HEIGHT_MM,
  DOME_STEM_INNER_RADIUS_MM,
  DOME_STEM_OUTER_RADIUS_MM,
  THREAD_DEPTH_MM,
  couplingUsesBayonet,
  evaluateMaleCouplingOffset,
  getCouplingHeightMm,
  getDomeStemFlareHeightMm,
  getEffectiveDomeStemHeightMm,
  getEffectiveNeckRadius,
  getShadeSeatY,
} from './coupling';
import { getLedKit001Dimensions } from './mounts/ledKit001';
import { getSocketE26Dimensions } from './mounts/socketE26';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Standard bottom cable exit slot: 6.5 mm wide x 5.0 mm side walls + 45° peaked gable roof (0% sagging!) */
export const BASE_CORD_SLOT_WIDTH_MM = 6.5;
export const BASE_CORD_SLOT_HEIGHT_MM = 5.0;

/** Signature OZ☰K (☰) seal geometry: 3 horizontal 45° V-grooves, 0.8 mm deep, spaced 2.5 mm apart */
export const OZEK_GROOVE_DEPTH_MM = 0.8;
export const OZEK_GROOVE_SPACING_MM = 2.5;

/** Rear Hanko author seal ("Z☰") deboss depth (mm) — crisp with 0.4 mm nozzle & 0% supports */
export const OZEK_HANKO_SEAL_DEPTH_MM = 0.6;

export interface AuthorSealSpec {
  centerTheta: number;
  yCenter: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  refRadiusMm: number;
}

/** Exact 2D signed distance to a centered rounded rectangle (negative inside, positive outside). */
function sdRoundedBox2D(px: number, py: number, halfW: number, halfH: number, radius: number): number {
  const r = Math.min(radius, Math.min(halfW, halfH));
  const qx = Math.abs(px) - (halfW - r);
  const qy = Math.abs(py) - (halfH - r);
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inDist = Math.min(Math.max(qx, qy), 0);
  return outDist + inDist - r;
}

/** Exact 2D signed distance to a line segment (ax,ay)-(bx,by). */
function sdSegment2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = Math.max(1e-8, bax * bax + bay * bay);
  const h = clamp((pax * bax + pay * bay) / denom, 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

/**
 * Evaluates the OZ☰K Hanko author seal ("Z☰") deboss depth in mm at local surface coordinates
 * (uMm = left-to-right horizontal mm when viewing the base from outside, vMm = vertical mm from stamp center).
 * Geometry matches the official OZ☰K hanko stamp:
 *  - Double rounded-rectangle frame (outer + inner stroke >= 0.8 mm)
 *  - Center monogram "Z☰": 4 crisp horizontal bars cut diagonally by the Z stroke (strokes >= 0.8 mm)
 *  - 0.60 mm inward deboss with 45° printable bevel (0% supports!)
 */
export function evaluateHankoSealDepthMm(uMm: number, vMm: number, spec: AuthorSealSpec): number {
  const hw = spec.widthMm * 0.5;
  const hh = spec.heightMm * 0.5;
  if (Math.abs(uMm) > hw + 0.6 || Math.abs(vMm) > hh + 0.6) return 0;

  // Frame strokes guaranteed >= 0.80 mm for crisp 0.4 mm nozzle extrusion
  const outerStroke = clamp(spec.widthMm * 0.068, 0.8, 1.05);
  const innerStroke = Math.max(0.8, outerStroke * 0.92);
  const frameGap = clamp(spec.widthMm * 0.056, 0.52, 0.92);

  const hwOut = hw - outerStroke * 0.5;
  const hhOut = hh - outerStroke * 0.5;
  const rOut = Math.min(hw, hh) * 0.24;
  const dOuterFrame = Math.abs(sdRoundedBox2D(uMm, vMm, hwOut, hhOut, rOut)) - outerStroke * 0.5;

  const inset = outerStroke * 0.5 + frameGap + innerStroke * 0.5;
  const hwIn = Math.max(1.8, hwOut - inset);
  const hhIn = Math.max(1.8, hhOut - inset);
  const rIn = Math.max(0.55, rOut - inset * 0.65);
  const dInnerFrame = Math.abs(sdRoundedBox2D(uMm, vMm, hwIn, hhIn, rIn)) - innerStroke * 0.5;

  // Inner usable area for the "Z☰" monogram (4 horizontal bars + Z diagonal)
  const usableW = Math.max(3.2, (hwIn - innerStroke * 0.5) * 2);
  const usableH = Math.max(3.2, (hhIn - innerStroke * 0.5) * 2);
  const monoHalfW = usableW * 0.36;
  const barThick = clamp(usableH * 0.165, 0.8, 1.45);
  // Fit 4 horizontal bars cleanly inside usableH with clear gaps
  const spanY = Math.min(usableH * 0.82 - barThick, Math.max(barThick * 3.8, usableH * 0.68));
  const monoHalfH = spanY * 0.5;

  let dMono = Infinity;
  // 4 horizontal bars
  for (let k = 0; k < 4; k++) {
    const yc = monoHalfH - (spanY * k) / 3;
    const dBar = sdRoundedBox2D(uMm, vMm - yc, monoHalfW, barThick * 0.5, 0.05);
    if (dBar < dMono) dMono = dBar;
  }

  // Diagonal Z stroke from top-right to bottom-left, clipped cleanly to the top/bottom bar outer bounds
  const dxTip = Math.max(0.5, monoHalfW - barThick * 0.32);
  const dDiagRaw =
    sdSegment2D(uMm, vMm, dxTip, monoHalfH, -dxTip, -monoHalfH) - barThick * 0.54;
  const dDiagClip = Math.max(dDiagRaw, Math.abs(vMm) - (monoHalfH + barThick * 0.5));
  if (dDiagClip < dMono) dMono = dDiagClip;

  const dUnion = Math.min(dOuterFrame, dInnerFrame, dMono);
  // ~45° printable bevel across 0.24 mm transition into 0.60 mm deboss depth
  const bevel = 0.24;
  const mask = 1 - smoothstep(-bevel, bevel, dUnion);
  return spec.depthMm * mask;
}

/** Smooth 1 inside the Hanko seal cartouche (including a 1.3 mm clean frame margin), 0 outside. */
function evaluateHankoCartoucheMask(uMm: number, vMm: number, spec: AuthorSealSpec): number {
  const dBox = sdRoundedBox2D(
    uMm,
    vMm,
    spec.widthMm * 0.5 + 1.1,
    spec.heightMm * 0.5 + 1.1,
    Math.min(spec.widthMm, spec.heightMm) * 0.18
  );
  return 1 - smoothstep(0.0, 1.4, dBox);
}

export class SolidMeshBuilder {
  private pos: number[] = [];
  private thick: number[] = [];
  private idx: number[] = [];

  addVertex(x: number, y: number, z: number, thickness: number): number {
    const id = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.thick.push(thickness);
    return id;
  }

  /** Right-handed Y-up cylindrical vertex: x = r cos(t), z = -r sin(t) */
  addCyl(r: number, theta: number, y: number, thickness: number): number {
    return this.addVertex(r * Math.cos(theta), y, -r * Math.sin(theta), thickness);
  }

  addQuad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  addTri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  buildBuffers(flipYHeight?: number): {
    positions: Float32Array;
    indices: Uint32Array;
    thickness: Float32Array;
  } {
    const positions = new Float32Array(this.pos);
    const indices = new Uint32Array(this.idx);
    const thickness = new Float32Array(this.thick);

    if (flipYHeight !== undefined) {
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] = flipYHeight - positions[i];
      }
      for (let t = 0; t < indices.length; t += 3) {
        const tmp = indices[t + 1];
        indices[t + 1] = indices[t + 2];
        indices[t + 2] = tmp;
      }
    }

    return { positions, indices, thickness };
  }
}

export interface ProfileNode {
  y: number;
  r: number;
  /** Optional angular radius modulation (for fine base ribs, male screw thread, or bayonet lugs) */
  rFn?: (theta: number) => number;
}

/**
 * Locally refines outer profile nodes strictly inside the vertical window of the Hanko "Z☰" seal
 * and applies the 0.60 mm inward deboss (plus smooth rib flattening inside the seal cartouche).
 * Preserves outer[0] & outer[1] untouched when a bottom cord slot is present so the 45° gable roof
 * and STL manifold topology remain 100% invariant!
 */
function applyAuthorSealToOuterNodes(
  outerNodes: ProfileNode[],
  seal: AuthorSealSpec | null,
  hasCordSlot: boolean,
  draft: boolean
): ProfileNode[] {
  if (!seal) return outerNodes;

  const yMargin = Math.min(0.9, seal.heightMm * 0.045);
  const yBandLo = seal.yCenter - seal.heightMm * 0.5 - yMargin;
  const yBandHi = seal.yCenter + seal.heightMm * 0.5 + yMargin;
  const stepY = draft ? 0.52 : 0.28;
  const minProtectedIdx = hasCordSlot ? 2 : 0;

  // 1. Subdivide vertical segments overlapping [yBandLo, yBandHi] while preserving index 0 & 1 for cordSlot
  const refined: ProfileNode[] = [];
  for (let i = 0; i < outerNodes.length; i++) {
    const cur = outerNodes[i];
    refined.push(cur);
    if (i === outerNodes.length - 1) break;
    if (i < minProtectedIdx) continue;

    const nxt = outerNodes[i + 1];
    const dy = nxt.y - cur.y;
    if (dy <= stepY * 1.15) continue;
    if (nxt.y < yBandLo || cur.y > yBandHi) continue;

    const segStart = Math.max(cur.y + 0.14, yBandLo);
    const segEnd = Math.min(nxt.y - 0.14, yBandHi);
    if (segEnd <= segStart + 0.12) continue;

    // Insert boundary anchors if cur.y < segStart or nxt.y > segEnd so transition stays crisp
    const ys: number[] = [];
    if (segStart - cur.y > stepY * 1.2) {
      ys.push(segStart);
    }
    const subSpan = segEnd - segStart;
    const subSteps = Math.max(1, Math.round(subSpan / stepY));
    for (let s = 1; s < subSteps; s++) {
      ys.push(segStart + (subSpan * s) / subSteps);
    }
    if (nxt.y - segEnd > stepY * 1.2) {
      ys.push(segEnd);
    }

    let lastY = cur.y;
    for (const yMid of ys) {
      if (yMid - lastY < 0.14 || nxt.y - yMid < 0.14) continue;
      lastY = yMid;
      const frac = clamp((yMid - cur.y) / dy, 0, 1);
      const rMid = cur.r + (nxt.r - cur.r) * frac;
      const fnA = cur.rFn;
      const fnB = nxt.rFn;
      const rFnMid =
        fnA || fnB
          ? (theta: number) => {
              const ra = fnA ? fnA(theta) : cur.r;
              const rb = fnB ? fnB(theta) : nxt.r;
              return ra + (rb - ra) * frac;
            }
          : undefined;
      refined.push({ y: yMid, r: rMid, rFn: rFnMid });
    }
  }

  // 2. Wrap nodes inside [yBandLo, yBandHi] with the Hanko "Z☰" SDF deboss & smooth cartouche rib blend
  const halfAngCull = (seal.widthMm * 0.5 + 3.0) / Math.max(18, seal.refRadiusMm);
  return refined.map((node, idx) => {
    if (idx < minProtectedIdx) return node;
    if (node.y < yBandLo || node.y > yBandHi) return node;
    const prevFn = node.rFn;
    const baseR = node.r;
    const vMm = node.y - seal.yCenter;

    return {
      y: node.y,
      r: baseR,
      rFn: (theta: number) => {
        const rawR = prevFn ? prevFn(theta) : baseR;
        const dAng = Math.atan2(
          Math.sin(theta - seal.centerTheta),
          Math.cos(theta - seal.centerTheta)
        );
        if (Math.abs(dAng) > halfAngCull) return rawR;

        // Left-to-right horizontal arc mm when viewing the outside of the base (looking inward at +X with +Y up, +theta is right!)
        const uMm = dAng * Math.max(18, baseR);
        // Smoothly flatten vertical ribs inside the cartouche so the Hanko seal prints razor-sharp!
        const cartouche = evaluateHankoCartoucheMask(uMm, vMm, seal);
        const smoothWallR = rawR * (1 - cartouche) + baseR * cartouche;
        const deboss = evaluateHankoSealDepthMm(uMm, vMm, seal);
        return Math.max(12, smoothWallR - deboss);
      },
    };
  });
}

/**
 * Generates a 100% watertight 2-manifold surface of revolution from a closed cross-section polygon
 * with an optional bottom cable exit slot (`widthMm x heightMm`) featuring a **45° peaked gable roof**
 * and optional local angular refinement for the rear OZ☰K Hanko "Z☰" author seal!
 */
export function buildClosedRevolutionWithOptionalCordSlot(
  mb: SolidMeshBuilder,
  requestedN: number,
  outerNodesInput: ProfileNode[],
  innerNodes: ProfileNode[],
  cordSlot: { widthMm: number; heightMm: number } | null,
  authorSeal: AuthorSealSpec | null = null,
  draft = false
): void {
  const outerNodes = applyAuthorSealToOuterNodes(
    outerNodesInput,
    authorSeal,
    Boolean(cordSlot && cordSlot.widthMm > 0),
    draft
  );

  // Build strictly increasing unique angular samples (with local high-res packing inside the Hanko seal window!)
  const sealHalfAng = authorSeal
    ? clamp((authorSeal.widthMm * 0.5 + 1.4) / Math.max(18, authorSeal.refRadiusMm), 0.08, 0.55)
    : 0;
  const sealTargetDTheta = authorSeal
    ? (draft ? 0.5 : 0.27) / Math.max(18, authorSeal.refRadiusMm)
    : 1;

  let slotSegs = 0;
  const thetaList: number[] = [];

  if (cordSlot && cordSlot.widthMm > 0) {
    const rSlotRef = Math.max(15, innerNodes[innerNodes.length - 1].r);
    const halfAlpha = Math.asin(clamp((cordSlot.widthMm * 0.5) / rSlotRef, 0.03, 0.38));

    // Force EVEN slotSegs >= 4 so u = slotSegs / 2 is the exact crisp 45° gable apex!
    // When the Hanko seal is centered directly above the cord slot (centerTheta ≈ 0), pack extra fine steps inside the slot span!
    const sealAboveSlot = Boolean(authorSeal && Math.abs(authorSeal.centerTheta) < 0.05);
    let wantSlotSegs = Math.max(4, Math.round((2 * halfAlpha) / ((2 * Math.PI) / requestedN)));
    if (sealAboveSlot) {
      wantSlotSegs = Math.max(wantSlotSegs, Math.round((2 * halfAlpha) / sealTargetDTheta));
    }
    if ((wantSlotSegs & 1) === 1) wantSlotSegs += 1;
    slotSegs = clamp(wantSlotSegs, 4, sealAboveSlot ? 36 : Math.max(4, Math.floor(requestedN / 6) & ~1));
    if ((slotSegs & 1) === 1) slotSegs += 1;

    for (let u = 0; u <= slotSegs; u++) {
      thetaList.push(-halfAlpha + (2 * halfAlpha * u) / slotSegs);
    }

    // Collect remaining angles strictly inside (halfAlpha, 2π - halfAlpha)
    const restStart = halfAlpha;
    const restEnd = 2 * Math.PI - halfAlpha;
    const restSegs = Math.max(36, requestedN - Math.min(slotSegs, Math.floor(requestedN / 4)));
    const rawRest: number[] = [];
    for (let k = 1; k < restSegs; k++) {
      rawRest.push(restStart + ((restEnd - restStart) * k) / restSegs);
    }

    // Locally refine angular intervals overlapping the Hanko seal window
    if (authorSeal) {
      const addFineRange = (a: number, b: number) => {
        const lo = Math.max(restStart + 1e-3, a);
        const hi = Math.min(restEnd - 1e-3, b);
        if (hi <= lo + 1e-3) return;
        const steps = Math.max(2, Math.round((hi - lo) / sealTargetDTheta));
        for (let k = 0; k <= steps; k++) {
          rawRest.push(lo + ((hi - lo) * k) / steps);
        }
      };

      if (sealAboveSlot) {
        addFineRange(halfAlpha, sealHalfAng);
        addFineRange(2 * Math.PI - sealHalfAng, 2 * Math.PI - halfAlpha);
      } else {
        const cNorm = ((authorSeal.centerTheta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        addFineRange(cNorm - sealHalfAng, cNorm + sealHalfAng);
      }
    }

    rawRest.sort((a, b) => a - b);
    let lastA = halfAlpha;
    for (const ang of rawRest) {
      if (ang - lastA > 5e-4 && restEnd - ang > 5e-4) {
        thetaList.push(ang);
        lastA = ang;
      }
    }
  } else {
    const rawAngles: number[] = [];
    for (let u = 0; u < requestedN; u++) {
      rawAngles.push((2 * Math.PI * u) / requestedN);
    }
    if (authorSeal) {
      const cNorm = ((authorSeal.centerTheta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const steps = Math.max(8, Math.round((2 * sealHalfAng) / sealTargetDTheta));
      for (let k = 0; k <= steps; k++) {
        const ang = (((cNorm - sealHalfAng + (2 * sealHalfAng * k) / steps) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        rawAngles.push(ang);
      }
    }
    rawAngles.sort((a, b) => a - b);
    for (const ang of rawAngles) {
      if (thetaList.length === 0 || (ang - thetaList[thetaList.length - 1] > 5e-4 && 2 * Math.PI - ang > 5e-4)) {
        thetaList.push(ang);
      }
    }
  }

  const N = thetaList.length;
  const thetas = new Float64Array(thetaList);

  if (!cordSlot) {
    const loop = [...outerNodes, ...innerNodes];
    const K = loop.length;
    const rings: Int32Array[] = [];
    for (let k = 0; k < K; k++) {
      const node = loop[k];
      const arr = new Int32Array(N);
      for (let u = 0; u < N; u++) {
        const theta = thetas[u];
        const r = node.rFn ? node.rFn(theta) : node.r;
        arr[u] = mb.addCyl(r, theta, node.y, 4.0);
      }
      rings.push(arr);
    }
    for (let k = 0; k < K; k++) {
      const kn = (k + 1) % K;
      for (let s = 0; s < N; s++) {
        const u0 = s;
        const u1 = (s + 1) % N;
        mb.addQuad(rings[k][u0], rings[k][u1], rings[kn][u1], rings[kn][u0]);
      }
    }
    return;
  }

  const L_out = outerNodes.length;
  const L_in = innerNodes.length;

  // 45° peaked gable lift across the slot roof (capped safely below the next ring above so zero self-intersection!)
  const maxSafeOutLift =
    L_out > 2 ? Math.max(0.5, (outerNodes[2].y - outerNodes[1].y) * 0.78) : 2.5;
  const maxSafeInLift =
    L_in > 2 ? Math.max(0.5, (innerNodes[L_in - 3].y - innerNodes[L_in - 2].y) * 0.78) : 2.5;
  const gablePeakMm = Math.min(cordSlot.widthMm * 0.5, maxSafeOutLift, maxSafeInLift);

  const gableLiftAtU = (u: number): number => {
    if (u <= 0 || u >= slotSegs) return 0;
    const tri = 1 - Math.abs((2 * u) / slotSegs - 1); // 0 at edges -> 1 at exact center
    return tri * gablePeakMm;
  };

  const outRings: Int32Array[] = [];
  for (let k = 0; k < L_out; k++) {
    const node = outerNodes[k];
    const arr = new Int32Array(N).fill(-1);
    for (let u = 0; u < N; u++) {
      if (k === 0 && u > 0 && u < slotSegs) continue;
      const theta = thetas[u];
      const r = node.rFn ? node.rFn(theta) : node.r;
      const y = k === 1 ? node.y + gableLiftAtU(u) : node.y;
      arr[u] = mb.addCyl(r, theta, y, 4.0);
    }
    outRings.push(arr);
  }

  const inRings: Int32Array[] = [];
  for (let k = 0; k < L_in; k++) {
    const node = innerNodes[k];
    const arr = new Int32Array(N).fill(-1);
    for (let u = 0; u < N; u++) {
      if (k === L_in - 1 && u > 0 && u < slotSegs) continue;
      const theta = thetas[u];
      const r = node.rFn ? node.rFn(theta) : node.r;
      const y = k === L_in - 2 ? node.y + gableLiftAtU(u) : node.y;
      arr[u] = mb.addCyl(r, theta, y, 4.0);
    }
    inRings.push(arr);
  }

  for (let s = 0; s < N; s++) {
    const u0 = s;
    const u1 = (s + 1) % N;

    for (let k = 1; k < L_out - 1; k++) {
      mb.addQuad(outRings[k][u0], outRings[k][u1], outRings[k + 1][u1], outRings[k + 1][u0]);
    }
    mb.addQuad(
      outRings[L_out - 1][u0],
      outRings[L_out - 1][u1],
      inRings[0][u1],
      inRings[0][u0]
    );
    for (let k = 0; k < L_in - 2; k++) {
      mb.addQuad(inRings[k][u0], inRings[k][u1], inRings[k + 1][u1], inRings[k + 1][u0]);
    }

    if (s < slotSegs) {
      // 45° peaked gable roof ceiling bridging inner[L_in-2] -> outer[1]!
      mb.addQuad(
        inRings[L_in - 2][u0],
        inRings[L_in - 2][u1],
        outRings[1][u1],
        outRings[1][u0]
      );
    } else {
      mb.addQuad(outRings[0][u0], outRings[0][u1], outRings[1][u1], outRings[1][u0]);
      mb.addQuad(
        inRings[L_in - 2][u0],
        inRings[L_in - 2][u1],
        inRings[L_in - 1][u1],
        inRings[L_in - 1][u0]
      );
      mb.addQuad(
        inRings[L_in - 1][u0],
        inRings[L_in - 1][u1],
        outRings[0][u1],
        outRings[0][u0]
      );
    }
  }

  const iBot = inRings[L_in - 1];
  const iTop = inRings[L_in - 2];
  const oBot = outRings[0];
  const oTop = outRings[1];

  mb.addQuad(iBot[0], iTop[0], oTop[0], oBot[0]);
  mb.addQuad(iBot[slotSegs], oBot[slotSegs], oTop[slotSegs], iTop[slotSegs]);
}

function addWatertightTripodLeg(
  mb: SolidMeshBuilder,
  angleRad: number,
  yTop: number,
  rTopCenter: number,
  rBotCenter: number,
  topRadialThick: number,
  botRadialThick: number,
  topTangentialW: number,
  botTangentialW: number
): void {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const pt = (r: number, t: number, y: number) =>
    mb.addVertex(r * cosA - t * sinA, y, -r * sinA - t * cosA, 6.0);

  const bInL = pt(rBotCenter - botRadialThick * 0.5, -botTangentialW * 0.5, 0);
  const bOutL = pt(rBotCenter + botRadialThick * 0.5, -botTangentialW * 0.5, 0);
  const bOutR = pt(rBotCenter + botRadialThick * 0.5, botTangentialW * 0.5, 0);
  const bInR = pt(rBotCenter - botRadialThick * 0.5, botTangentialW * 0.5, 0);

  const tInL = pt(rTopCenter - topRadialThick * 0.5, -topTangentialW * 0.5, yTop);
  const tOutL = pt(rTopCenter + topRadialThick * 0.5, -topTangentialW * 0.5, yTop);
  const tOutR = pt(rTopCenter + topRadialThick * 0.5, topTangentialW * 0.5, yTop);
  const tInR = pt(rTopCenter - topRadialThick * 0.5, topTangentialW * 0.5, yTop);

  mb.addQuad(bOutL, bOutR, tOutR, tOutL);
  mb.addQuad(bInR, bInL, tInL, tInR);
  mb.addQuad(bOutR, bInR, tInR, tOutR);
  mb.addQuad(bInL, bOutL, tOutL, tInL);
  mb.addQuad(tInL, tOutL, tOutR, tInR);
  mb.addQuad(bInL, bInR, bOutR, bOutL);
}

/**
 * Helper: appends a 45° support-free internal vaulted cone descending from (ceilingBotY, holeR)
 * outward to (vaultBotY, cavityR) — eliminating 90° flat internal overhangs in E26/E27 bases!
 */
function appendE26Vault45(
  inner: ProfileNode[],
  ceilingBotY: number,
  holeR: number,
  cavityR: number,
  minSafeY: number
): number {
  const deltaR = Math.max(0, cavityR - holeR);
  if (deltaR <= 0.4) {
    inner.push({ y: ceilingBotY, r: cavityR });
    return ceilingBotY;
  }
  const vaultBotY = Math.max(minSafeY, ceilingBotY - deltaR);
  // If vertical height is tighter than deltaR, smoothly taper at exact 45° as far as possible
  const rAtVaultBot = holeR + Math.min(deltaR, Math.max(0.5, ceilingBotY - vaultBotY));
  inner.push({ y: vaultBotY, r: rAtVaultBot });
  if (rAtVaultBot < cavityR - 0.5 && vaultBotY > minSafeY + 0.5) {
    inner.push({ y: minSafeY, r: cavityR });
    return minSafeY;
  }
  return vaultBotY;
}

/**
 * Helper: builds the **top-mounted Bambu LED Kit 001 cup** (Ø59.7 mm nominal × 8.5 mm deep)
 * open upward flush with the top of the base collar, plus:
 *  - A 7.0 mm wide vertical side notch at theta = 0 (aligned directly above the Z=0 rear cord slot)
 *    so the LED puck's side USB cord drops straight into the hollow base interior.
 *  - A 45° self-supporting internal vault/chamfer descending from the cup floor bore to the
 *    base cavity & bottom cord exit slot (100% watertight & 0% supports!).
 */
function appendLedKit001TopCup(
  inner: ProfileNode[],
  led: ReturnType<typeof getLedKit001Dimensions>,
  cupTopY: number,
  rMaxCavAtY: (y: number) => number,
  slotH: number,
  gableClearY: number,
  includeBottomCordRegion = true,
  minBottomY = 0
): void {
  const rCup = led.cavityRadiusMm;
  const rBore = Math.min(led.cableConduitRadiusMm, rCup - 4.0);
  const halfNotchRad = Math.asin(clamp((led.cupCordNotchWidthMm * 0.5) / rCup, 0.04, 0.35));

  const rWithNotch = (theta: number, rBase: number): number => {
    const wrapped = Math.atan2(Math.sin(theta), Math.cos(theta));
    const mask = 1 - smoothstep(halfNotchRad - 0.025, halfNotchRad + 0.025, Math.abs(wrapped));
    return rBase + (rCup - rBase) * mask;
  };

  // Keep cup depth 8.5 mm whenever total height allows; gracefully clamp only for tiny 15 mm test prints
  const minFloorY = includeBottomCordRegion ? slotH + 1.8 : minBottomY + 2.5;
  const cupFloorY = Math.max(minFloorY, cupTopY - led.cavityHeightMm);
  const cupLipY = Math.max(cupFloorY + 0.6, cupTopY - 0.5);

  // 1. Open-top circular cup for LED Kit 001 (small 0.4 mm lead-in bevel at top rim)
  inner.push({ y: cupTopY, r: rCup + 0.4 });
  inner.push({ y: cupLipY, r: rCup });
  inner.push({ y: cupFloorY, r: rCup });

  // 2. Support shelf + 7.0 mm lateral USB cord pass-through notch at theta = 0
  //    Offset 0.20 mm below cupFloorY so inner wall vertices inside the notch NEVER coincide
  //    with the cup floor ring when welded by 3D position in Binary STL (0 non-manifold edges!).
  const shelfDropY = Math.max(minFloorY - 0.3, cupFloorY - 0.2);
  inner.push({
    y: shelfDropY,
    r: rBore,
    rFn: (theta) => rWithNotch(theta, rBore),
  });

  const floorBotY = Math.max(minFloorY - 0.8, cupFloorY - led.cupFloorThicknessMm);
  if (floorBotY < shelfDropY - 0.2) {
    inner.push({
      y: floorBotY,
      r: rBore,
      rFn: (theta) => rWithNotch(theta, rBore),
    });
  }

  // 3. 45° self-supporting internal vault descending from floorBotY down to base cavity & Z=0 cord slot
  const vaultEndY = includeBottomCordRegion ? Math.min(floorBotY, gableClearY) : minBottomY;
  const totalDrop = Math.max(0, floorBotY - vaultEndY);
  if (totalDrop > 0.6) {
    const segs = 4;
    for (let i = 1; i <= segs; i++) {
      const y = floorBotY - (totalDrop * i) / segs;
      const dropHere = floorBotY - y;
      const rWallLimit = Math.max(rBore, rMaxCavAtY(y));
      inner.push({
        y,
        r: Math.min(rWallLimit, rBore + dropHere),
        rFn: (theta) => {
          const rStart = rWithNotch(theta, rBore);
          return Math.min(rWallLimit, rStart + dropHere);
        },
      });
    }
  }

  if (includeBottomCordRegion) {
    const rFinalBase = Math.max(rBore, rMaxCavAtY(slotH));
    const maxDropToSlot = Math.max(0, floorBotY - slotH);
    const rSlotFn = (theta: number) => {
      const rStart = rWithNotch(theta, rBore);
      return Math.min(rFinalBase, rStart + maxDropToSlot);
    };
    inner.push({ y: slotH, r: Math.min(rFinalBase, rBore + maxDropToSlot), rFn: rSlotFn });
    inner.push({ y: 0, r: Math.min(rFinalBase, rBore + maxDropToSlot), rFn: rSlotFn });
  } else if (vaultEndY > minBottomY + 0.1) {
    const rBotLimit = Math.max(rBore, rMaxCavAtY(minBottomY));
    const dropBot = Math.max(0, floorBotY - minBottomY);
    inner.push({
      y: minBottomY,
      r: Math.min(rBotLimit, rBore + dropBot),
      rFn: (theta) => Math.min(rBotLimit, rWithNotch(theta, rBore) + dropBot),
    });
  }
}

/**
 * Generates an independent, 100% watertight 2-manifold Base mesh for Two-Part Lamp mode.
 * v2.0 FDM Upgrades:
 *  - 45° internal vaulted ceilings in ALL E26/E27 bases (0% internal 90° overhangs!)
 *  - 45° internal chamfer + Ø59.7 mm nominal (+0.2 mm) in LED Kit 001 cavities
 *  - 45° peaked gable roof on the 6.5 x 5.0 mm bottom cord slot (0% sagging!)
 *  - Tripod legs bounded < 42° for support-free 180° flipped STL export!
 */
export function buildIndependentBase(
  config: LampConfig,
  draft: boolean,
  clipHeightMm?: number
): SolidMeshBuilder {
  const mb = new SolidMeshBuilder();
  const { base, mount } = config;

  const isRibbed =
    base.finish === 'ribbed' && base.style !== 'tripod' && base.style !== 'compact_flush';
  const ribCount = Math.max(40, Math.min(100, Math.round(base.ribCount || 64)));
  const N = isRibbed
    ? draft
      ? Math.min(240, Math.max(120, ribCount * 2))
      : Math.min(384, Math.max(200, ribCount * 4))
    : draft
      ? 96
      : 168;

  const rNeck = getEffectiveNeckRadius(config);
  const seatY = getShadeSeatY(config);
  const couplingH = getCouplingHeightMm(base);
  const couplingSubdivs = draft ? 12 : 24;

  const isLed = mount.type === 'led_kit_001';
  const led = getLedKit001Dimensions(mount);
  const e26 = getSocketE26Dimensions(mount);
  const e26CeilingThick = Math.max(3.0, mount.e26LipThickness || 3.5);

  const makeRibbedNode = (
    y: number,
    rBase: number,
    yFadeStart: number,
    yFadeEnd: number,
    grooveAtten = 1.0
  ): ProfileNode => {
    if (!isRibbed || grooveAtten <= 0.05) return { y, r: rBase };
    const env =
      smoothstep(yFadeStart, yFadeStart + 4.5, y) *
      (1 - smoothstep(yFadeEnd - 4.0, yFadeEnd, y));
    if (env <= 0.005) return { y, r: rBase };
    const ribAmp = 1.25 * env * grooveAtten;
    return {
      y,
      r: rBase,
      rFn: (theta: number) => rBase + ribAmp * (0.5 + 0.5 * Math.cos(theta * ribCount)),
    };
  };

  /**
   * Appends outer profile nodes from yStart to yEnd with optional OZ☰K signature seal (☰):
   * 3 crisp horizontal 45° V-grooves (0.8 mm deep, spaced 2.5 mm apart, 0% supports, 100% watertight!).
   */
  const appendBodyProfileWithOptionalGrooves = (
    outer: ProfileNode[],
    yStart: number,
    yEnd: number,
    segs: number,
    rAtY: (y: number) => number,
    ribFadeStart: number,
    ribFadeEnd: number
  ): void => {
    // Anchor outer[2] explicitly at yStart (gableClearY = 9.0 mm) so the 45° cord gable stays isolated
    // in [outer[1], outer[2]] and the rear Hanko Z☰ seal subdivides cleanly across the entire body!
    if (outer.length === 0 || yStart > outer[outer.length - 1].y + 0.2) {
      outer.push(makeRibbedNode(yStart, rAtY(yStart), ribFadeStart, ribFadeEnd));
    }

    const wantGrooves = Boolean(base.signatureGrooves) && yEnd - yStart >= 9.0;
    if (!wantGrooves) {
      for (let i = 1; i <= segs; i++) {
        const y = yStart + ((yEnd - yStart) * i) / segs;
        outer.push(makeRibbedNode(y, rAtY(y), ribFadeStart, ribFadeEnd));
      }
      return;
    }

    const halfV = 0.85; // 0.8 mm depth over 0.85 mm vertical half-width -> 43° self-supporting V-groove!
    const bandHalf = OZEK_GROOVE_SPACING_MM + halfV + 0.6; // ~3.95 mm above & below center
    const yCenter = clamp(
      yStart + (yEnd - yStart) * 0.48,
      yStart + bandHalf + 0.5,
      yEnd - bandHalf - 0.5
    );
    const bandBot = yCenter - bandHalf;
    const bandTop = yCenter + bandHalf;

    // 1. Lower segment below ☰ signature band
    const lowSegs = Math.max(2, Math.round(segs * 0.45));
    for (let i = 1; i <= lowSegs; i++) {
      const y = yStart + ((bandBot - yStart) * i) / lowSegs;
      outer.push(makeRibbedNode(y, rAtY(y), ribFadeStart, ribFadeEnd));
    }

    // 2. Signature OZ☰K 3-groove horizontal seal (☰)
    const centers = [
      yCenter - OZEK_GROOVE_SPACING_MM,
      yCenter,
      yCenter + OZEK_GROOVE_SPACING_MM,
    ];
    for (const gc of centers) {
      const yLo = gc - halfV;
      const yHi = gc + halfV;
      outer.push(makeRibbedNode(yLo, rAtY(yLo), ribFadeStart, ribFadeEnd, 0.25));
      outer.push({ y: gc, r: Math.max(12, rAtY(gc) - OZEK_GROOVE_DEPTH_MM) });
      outer.push(makeRibbedNode(yHi, rAtY(yHi), ribFadeStart, ribFadeEnd, 0.25));
    }

    // 3. Upper segment above ☰ signature band
    const hiSegs = Math.max(2, Math.round(segs * 0.45));
    for (let i = 1; i <= hiSegs; i++) {
      const y = bandTop + ((yEnd - bandTop) * i) / hiSegs;
      outer.push(makeRibbedNode(y, rAtY(y), ribFadeStart, ribFadeEnd));
    }
  };

  const appendMaleCouplingNodes = (nodes: ProfileNode[], yStart: number, maxClipY: number) => {
    const yEnd = Math.min(yStart + couplingH, maxClipY);
    if (yEnd <= yStart + 0.2) return;
    for (let i = 0; i <= couplingSubdivs; i++) {
      const localY = ((yEnd - yStart) * i) / couplingSubdivs;
      const y = yStart + localY;
      nodes.push({
        y,
        r: rNeck,
        rFn: (theta: number) => rNeck + evaluateMaleCouplingOffset(theta, localY, base),
      });
    }
  };

  const slotH = BASE_CORD_SLOT_HEIGHT_MM; // 5.0 mm
  const slotW = BASE_CORD_SLOT_WIDTH_MM; // 6.5 mm
  const gableClearY = slotH + 4.0; // 9.0 mm safe ceiling above 45° peaked cord roof
  const wantAuthorSeal = base.authorSeal !== false && !clipHeightMm;

  // --- STYLE 0: COMPACT FLUSH (Ø 75.0 × 15.0 mm Bambu LED Kit 001 housing with 3-lug bayonet) ---
  if (base.style === 'compact_flush') {
    const totalH = clipHeightMm ? Math.min(COMPACT_FLUSH_HEIGHT_MM, Math.max(12.0, clipHeightMm)) : COMPACT_FLUSH_HEIGHT_MM;
    const rRim = COMPACT_FLUSH_OUTER_RADIUS_MM; // 37.50 mm (Ø 75.0 mm)
    const rCollar = COMPACT_FLUSH_COLLAR_RADIUS_MM; // 36.75 mm (Ø 73.5 mm)
    const rimH = COMPACT_FLUSH_RIM_HEIGHT_MM; // 5.5 mm
    const cfSlotH = 2.8; // 2.8 mm vertical walls + 45° gable peak (+2.1 mm) => 4.9 mm total clearance < 5.5 mm rim!
    const cfSlotW = 6.5;

    const outer: ProfileNode[] = [
      { y: 0, r: rRim },
      { y: cfSlotH, r: rRim },
      { y: rimH, r: rRim },
      { y: rimH, r: rCollar },
    ];

    // Bayonet collar y ∈ [5.5, totalH] with 3 locking lugs (+1.5 mm at 60°, 180°, 300°)
    const collarSegs = draft ? 14 : 26;
    for (let i = 1; i <= collarSegs; i++) {
      const y = rimH + ((totalH - rimH) * i) / collarSegs;
      outer.push({
        y,
        r: rCollar,
        rFn: (theta: number) => rCollar + evaluateMaleCouplingOffset(theta, y, base),
      });
    }

    const inner: ProfileNode[] = [];
    if (isLed) {
      // Exact Ø 59.7 mm (adjustable with ledTolerance) × 8.5 mm deep upper LED Kit 001 cup (y = 6.5..15.0)
      const rCup = Math.min(rCollar - 2.9, led.cavityRadiusMm);
      const rBore = Math.min(led.cableConduitRadiusMm, rCup - 4.0);
      const cupFloorY = Math.max(rimH + 0.8, totalH - led.cavityHeightMm); // 6.5 mm at totalH = 15.0 mm
      const halfNotchRad = Math.asin(clamp((led.cupCordNotchWidthMm * 0.5) / rCup, 0.04, 0.35));

      const rWithNotch = (theta: number, rBase: number): number => {
        const wrapped = Math.atan2(Math.sin(theta), Math.cos(theta));
        const mask = 1 - smoothstep(halfNotchRad - 0.025, halfNotchRad + 0.025, Math.abs(wrapped));
        return rBase + (rCup - rBase) * mask;
      };

      const rSlotIn = Math.min(rCup, rBore + (rimH - cfSlotH)); // 45° self-supporting bevel below shelf!
      const rSlotFn = (theta: number) => Math.min(rCup, rWithNotch(theta, rBore) + (rimH - cfSlotH));

      inner.push({ y: totalH, r: rCup + 0.35 });
      inner.push({ y: totalH - 0.45, r: rCup });
      inner.push({ y: cupFloorY, r: rCup });
      // Drop 0.20 mm below cupFloorY so vertices inside the 7 mm lateral notch NEVER coincide with
      // the cupFloorY ring when welded by 3D position in exported Binary STL (0 non-manifold edges!).
      inner.push({ y: cupFloorY - 0.2, r: rBore, rFn: (theta) => rWithNotch(theta, rBore) });
      // Floor thickness down to rimH (5.5 mm), strictly above 45° gable roof peak (4.9 mm)!
      inner.push({ y: rimH, r: rBore, rFn: (theta) => rWithNotch(theta, rBore) });
      inner.push({ y: cfSlotH, r: rSlotIn, rFn: rSlotFn });
      inner.push({ y: 0, r: rSlotIn, rFn: rSlotFn });
    } else {
      // Clean E26/E27 fallback inside the Ø 75 × 15 mm compact housing (100% watertight & 45° vaulted)
      const cBot = Math.max(rimH + 2.5, totalH - e26CeilingThick);
      const rHole = e26.holeRadiusMm;
      const rMid = Math.min(rCollar - 4.0, rHole + (cBot - rimH));
      const rBot = Math.min(rCollar - 3.5, rMid + (rimH - cfSlotH));
      inner.push({ y: totalH, r: rHole });
      inner.push({ y: cBot, r: rHole });
      inner.push({ y: rimH, r: rMid });
      inner.push({ y: cfSlotH, r: rBot });
      inner.push({ y: 0, r: rBot });
    }

    const compactSeal: AuthorSealSpec | null =
      wantAuthorSeal && totalH >= 14.5
        ? {
            centerTheta: 0, // Directly above rear USB cord slot, 100% clear of 3 bayonet lugs at 60°, 180°, 300°!
            yCenter: 10.25,
            widthMm: 10.0,
            heightMm: 8.8,
            depthMm: OZEK_HANKO_SEAL_DEPTH_MM,
            refRadiusMm: rCollar,
          }
        : null;

    buildClosedRevolutionWithOptionalCordSlot(
      mb,
      N,
      outer,
      inner,
      { widthMm: cfSlotW, heightMm: cfSlotH },
      compactSeal,
      draft
    );
    return mb;
  }

  // --- STYLE 1: DOME (with optional E26/E27 elevated slender stem "palito" + 45° flare!) ---
  if (base.style === 'dome') {
    const domeH = Math.max(36, base.height);
    const stemH = getEffectiveDomeStemHeightMm(config);
    const flareH = getDomeStemFlareHeightMm(config);
    const hasStem = stemH > 0.1 && !isLed;
    const couplingStartY = hasStem ? domeH + stemH + flareH : domeH;
    const fullTopY = couplingStartY + couplingH;
    const maxClipY = clipHeightMm ? Math.min(fullTopY, clipHeightMm) : fullTopY;

    const rFoot = Math.max(rNeck + 10, base.footRadius);
    const rShoulder = rNeck + (base.coupling === 'gravity_seat' ? 4.5 : hasStem ? 2.5 : 4.0);
    const rDomeCrown = hasStem ? DOME_STEM_OUTER_RADIUS_MM + 1.5 : rShoulder;

    const domeRAt = (y: number): number => {
      const t = clamp(y / domeH, 0, 1);
      const arch = Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.85)));
      return rDomeCrown + (rFoot - rDomeCrown) * arch;
    };

    if (clipHeightMm && clipHeightMm < domeH - 5) {
      const outer: ProfileNode[] = [
        { y: 0, r: rFoot },
        { y: slotH, r: domeRAt(slotH) },
        { y: maxClipY, r: domeRAt(maxClipY) },
      ];
      const rCav = isLed ? led.cavityRadiusMm : Math.max(e26.holeRadiusMm + 6, rFoot - 5.5);
      const inner: ProfileNode[] = [];
      if (isLed) {
        appendLedKit001TopCup(
          inner,
          led,
          maxClipY,
          (y) => Math.max(led.cavityRadiusMm, domeRAt(y) - 4.2),
          slotH,
          gableClearY,
          true,
          0
        );
      } else {
        const cBot = Math.max(gableClearY, maxClipY - e26CeilingThick);
        inner.push({ y: maxClipY, r: e26.holeRadiusMm });
        inner.push({ y: cBot, r: e26.holeRadiusMm });
        appendE26Vault45(inner, cBot, e26.holeRadiusMm, rCav, slotH + 1.0);
        inner.push({ y: slotH, r: rCav });
        inner.push({ y: 0, r: rCav });
      }
      buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
        widthMm: slotW,
        heightMm: slotH,
      });
      return mb;
    }

    const outer: ProfileNode[] = [
      { y: 0, r: rFoot },
      makeRibbedNode(slotH, domeRAt(slotH), slotH, domeH),
    ];
    const domeSegs = draft ? 10 : 18;
    appendBodyProfileWithOptionalGrooves(
      outer,
      gableClearY,
      domeH,
      domeSegs,
      domeRAt,
      slotH,
      domeH
    );

    if (hasStem) {
      const stemTopY = domeH + stemH;
      // Smooth neck transition into Ø 30 mm slender vertical stem, then 45° self-supporting flare up to E26 collar!
      outer.push({ y: domeH + 1.5, r: DOME_STEM_OUTER_RADIUS_MM });
      outer.push({ y: stemTopY, r: DOME_STEM_OUTER_RADIUS_MM });
      const flareSegs = 4;
      for (let i = 1; i <= flareSegs; i++) {
        const frac = i / flareSegs;
        outer.push({
          y: stemTopY + flareH * frac,
          r: DOME_STEM_OUTER_RADIUS_MM + (rShoulder - DOME_STEM_OUTER_RADIUS_MM) * frac,
        });
      }
    }

    appendMaleCouplingNodes(outer, couplingStartY, maxClipY);

    const inner: ProfileNode[] = [];
    if (isLed) {
      // LED Kit 001 cup open upward flush at top of collar + 7 mm lateral USB notch + 45° internal vault to Z=0 cord slot
      appendLedKit001TopCup(
        inner,
        led,
        maxClipY,
        (y) => (y >= domeH ? led.cavityRadiusMm : Math.max(led.cavityRadiusMm, domeRAt(y) - 4.2)),
        slotH,
        gableClearY,
        true,
        0
      );
    } else if (hasStem) {
      // Elevated E26/E27 support shelf at couplingStartY -> upward-facing funnel into Ø18 mm hollow stem -> 45° dome vault!
      const ceilingBotY = couplingStartY - e26CeilingThick;
      const stemTopY = domeH + stemH;
      const rStemIn = DOME_STEM_INNER_RADIUS_MM;
      inner.push({ y: maxClipY, r: Math.max(e26.holeRadiusMm + 1.5, rNeck - 3.2) });
      inner.push({ y: couplingStartY, r: e26.holeRadiusMm });
      inner.push({ y: ceilingBotY, r: e26.holeRadiusMm });
      // Smooth internal cable funnel from E26 hole inward to Ø 18 mm hollow stem bore (0% overhang!)
      if (ceilingBotY > stemTopY + 0.8) {
        inner.push({ y: stemTopY, r: rStemIn });
      }
      inner.push({ y: domeH, r: rStemIn });
      // 45° self-supporting dome vault expanding from rStemIn out to rBotCav inside the dome body!
      const rBotCav = Math.max(e26.holeRadiusMm + 6.0, rFoot - 4.8);
      const vaultSegs = 6;
      const totalVaultDrop = Math.min(domeH - gableClearY, Math.max(6, rBotCav - rStemIn));
      for (let i = 1; i <= vaultSegs; i++) {
        const frac = i / vaultSegs;
        const y = domeH - totalVaultDrop * frac;
        const r45 = rStemIn + (domeH - y); // strictly <= 45° overhang!
        const rWallBound = Math.max(rStemIn + 2.5, domeRAt(y) - 4.2);
        inner.push({ y, r: Math.min(r45, rWallBound, rBotCav) });
      }
      const rLowest = Math.min(rBotCav, rStemIn + (domeH - gableClearY));
      if (domeH - totalVaultDrop > gableClearY + 1.0) {
        inner.push({ y: gableClearY, r: rLowest });
      }
      inner.push({ y: slotH, r: rLowest });
      inner.push({ y: 0, r: rLowest });
    } else {
      // 45° vaulted internal dome ceiling -> 100% support-free!
      const ceilingBotY = domeH - e26CeilingThick;
      inner.push({ y: maxClipY, r: Math.max(e26.holeRadiusMm + 1.5, rNeck - 3.2) });
      inner.push({ y: domeH, r: e26.holeRadiusMm });
      inner.push({ y: ceilingBotY, r: e26.holeRadiusMm });
      const rBotCav = Math.max(e26.holeRadiusMm + 6.0, rFoot - 4.8);
      // Descend along a 45° self-supporting dome vault from holeRadiusMm out to rBotCav
      const vaultSegs = 6;
      const totalVaultDrop = Math.min(ceilingBotY - gableClearY, Math.max(4, rBotCav - e26.holeRadiusMm));
      for (let i = 1; i <= vaultSegs; i++) {
        const frac = i / vaultSegs;
        const y = ceilingBotY - totalVaultDrop * frac;
        const r45 = e26.holeRadiusMm + (ceilingBotY - y); // strictly <= 45° overhang!
        const rWallBound = Math.max(e26.holeRadiusMm + 2.5, domeRAt(y) - 4.2);
        inner.push({ y, r: Math.min(r45, rWallBound, rBotCav) });
      }
      const rLowest = Math.min(rBotCav, e26.holeRadiusMm + (ceilingBotY - gableClearY));
      if (ceilingBotY - totalVaultDrop > gableClearY + 1.0) {
        inner.push({ y: gableClearY, r: rLowest });
      }
      inner.push({ y: slotH, r: rLowest });
      inner.push({ y: 0, r: rLowest });
    }

    const domeAvailH = domeH - gableClearY - 2.4;
    const domeSealH = clamp(domeAvailH, 9.5, 16.0);
    const domeSealW = Math.min(14.0, domeSealH * 0.88);
    const domeSealY = clamp(
      gableClearY + domeAvailH * 0.5 + 1.2,
      gableClearY + domeSealH * 0.5 + 0.8,
      domeH - domeSealH * 0.5 - 1.2
    );
    const domeSeal: AuthorSealSpec | null =
      wantAuthorSeal && domeAvailH >= 10.0
        ? {
            centerTheta: 0,
            yCenter: domeSealY,
            widthMm: domeSealW,
            heightMm: domeSealH,
            depthMm: OZEK_HANKO_SEAL_DEPTH_MM,
            refRadiusMm: domeRAt(domeSealY),
          }
        : null;

    buildClosedRevolutionWithOptionalCordSlot(
      mb,
      N,
      outer,
      inner,
      { widthMm: slotW, heightMm: slotH },
      domeSeal,
      draft
    );
    return mb;
  }

  // --- STYLE 2: CONKEL ---
  if (base.style === 'conkel') {
    const flangeH = Math.max(seatY, isLed ? led.deckTopMm : 9.0);
    const rFoot = Math.max(
      rNeck + (couplingUsesBayonet(base) ? BAYONET_DEPTH_MM : THREAD_DEPTH_MM) + 9.0,
      base.footRadius
    );

    if (isLed) {
      const fullTopY = flangeH + couplingH;
      const maxClipY = clipHeightMm ? Math.min(fullTopY, clipHeightMm) : fullTopY;

      const outer: ProfileNode[] = [
        { y: 0, r: rFoot },
        { y: slotH, r: rFoot },
        { y: Math.min(flangeH - 0.8, maxClipY), r: rFoot },
        { y: Math.min(flangeH, maxClipY), r: rFoot - 0.8 },
      ];
      if (maxClipY > flangeH + 0.5) {
        appendMaleCouplingNodes(outer, flangeH, maxClipY);
      }

      const inner: ProfileNode[] = [];
      appendLedKit001TopCup(
        inner,
        led,
        maxClipY,
        (y) => (y >= flangeH - 1.0 ? led.cavityRadiusMm : Math.max(led.cavityRadiusMm, rFoot - 4.5)),
        slotH,
        gableClearY,
        true,
        0
      );

      const conkelLedSeal: AuthorSealSpec | null =
        wantAuthorSeal && maxClipY >= flangeH + 9.2
          ? {
              // Seated cleanly on rear collar at 180° (clear of cord slot & bayonet lugs)
              centerTheta: couplingUsesBayonet(base) ? Math.PI / 3 : Math.PI,
              yCenter: flangeH + couplingH * 0.5,
              widthMm: 9.6,
              heightMm: Math.min(9.0, couplingH - 1.4),
              depthMm: OZEK_HANKO_SEAL_DEPTH_MM,
              refRadiusMm: rNeck,
            }
          : null;

      buildClosedRevolutionWithOptionalCordSlot(
        mb,
        N,
        outer,
        inner,
        { widthMm: slotW, heightMm: slotH },
        conkelLedSeal,
        draft
      );
      return mb;
    } else {
      const coneTopY = Math.max(flangeH + couplingH + 12, base.height);
      const maxClipY = clipHeightMm ? Math.min(coneTopY, clipHeightMm) : coneTopY;
      const rConeTopOut = Math.min(rNeck - 2.0, e26.hubOuterRadiusMm + 2.5);
      const rConeInnerWall = Math.max(e26.holeRadiusMm + 4.5, rNeck - 4.0);

      const outer: ProfileNode[] = [
        { y: 0, r: rFoot },
        { y: slotH, r: rFoot },
        { y: Math.min(flangeH - 0.8, maxClipY), r: rFoot },
        { y: Math.min(flangeH, maxClipY), r: rFoot - 0.8 },
      ];

      if (maxClipY > flangeH + 0.5) {
        appendMaleCouplingNodes(outer, flangeH, maxClipY);
      }

      const couplingEndY = flangeH + couplingH;
      if (maxClipY > couplingEndY + 1.0) {
        outer.push({ y: couplingEndY + 1.2, r: rNeck - 0.5 });
        outer.push({ y: maxClipY - 1.0, r: rConeTopOut });
        outer.push({ y: maxClipY, r: rConeTopOut - 1.0 });
      }

      const inner: ProfileNode[] = [];
      if (maxClipY > couplingEndY + 4.0) {
        const cBot = maxClipY - e26CeilingThick;
        const rUpperCav = Math.max(e26.holeRadiusMm + 2.5, rConeTopOut - 3.0);
        inner.push({ y: maxClipY, r: e26.holeRadiusMm });
        inner.push({ y: cBot, r: e26.holeRadiusMm });
        // 45° internal chamfer from e26 hole out to upper cone wall
        appendE26Vault45(inner, cBot, e26.holeRadiusMm, rUpperCav, gableClearY + 1);
        inner.push({ y: gableClearY, r: rConeInnerWall });
        inner.push({ y: slotH, r: rConeInnerWall });
        inner.push({ y: 0, r: rConeInnerWall });
      } else {
        const cBot = Math.max(gableClearY, maxClipY - e26CeilingThick);
        inner.push({ y: maxClipY, r: e26.holeRadiusMm });
        inner.push({ y: cBot, r: e26.holeRadiusMm });
        appendE26Vault45(inner, cBot, e26.holeRadiusMm, rConeInnerWall, slotH + 1);
        inner.push({ y: slotH, r: rConeInnerWall });
        inner.push({ y: 0, r: rConeInnerWall });
      }

      const conkelConeSpan = maxClipY - (couplingEndY + 2.2);
      const conkelSealH = clamp(conkelConeSpan - 2.0, 9.5, 15.0);
      const conkelConeY = couplingEndY + 1.4 + conkelConeSpan * 0.5;
      const conkelE26Seal: AuthorSealSpec | null =
        wantAuthorSeal && conkelConeSpan >= 11.5
          ? {
              centerTheta: 0,
              yCenter: conkelConeY,
              widthMm: Math.min(13.5, conkelSealH * 0.88),
              heightMm: conkelSealH,
              depthMm: OZEK_HANKO_SEAL_DEPTH_MM,
              refRadiusMm: (rNeck + rConeTopOut) * 0.5,
            }
          : null;

      buildClosedRevolutionWithOptionalCordSlot(
        mb,
        N,
        outer,
        inner,
        { widthMm: slotW, heightMm: slotH },
        conkelE26Seal,
        draft
      );
      return mb;
    }
  }

  // --- STYLE 3: PEDESTAL ---
  if (base.style === 'pedestal') {
    const pedH = Math.max(26, base.height);
    const fullTopY = pedH + couplingH;
    const maxClipY = clipHeightMm ? Math.min(fullTopY, clipHeightMm) : fullTopY;

    const rFoot = Math.max(rNeck + 8, base.footRadius);
    const rShoulder = rNeck + (base.coupling === 'gravity_seat' ? 5.2 : 3.8);
    const coneRAt = (y: number) => rFoot + ((rShoulder - rFoot) * clamp(y / pedH, 0, 1));

    if (clipHeightMm && clipHeightMm < pedH - 5) {
      const outer: ProfileNode[] = [
        { y: 0, r: rFoot },
        { y: slotH, r: coneRAt(slotH) },
        { y: maxClipY, r: coneRAt(maxClipY) },
      ];
      const rIn = isLed ? led.cavityRadiusMm : Math.max(e26.holeRadiusMm + 6, rFoot - 5.5);
      const inner: ProfileNode[] = [];
      if (isLed) {
        appendLedKit001TopCup(
          inner,
          led,
          maxClipY,
          (y) => Math.max(led.cavityRadiusMm, coneRAt(y) - 4.2),
          slotH,
          gableClearY,
          true,
          0
        );
      } else {
        const cBot = Math.max(gableClearY, maxClipY - e26CeilingThick);
        inner.push({ y: maxClipY, r: e26.holeRadiusMm });
        inner.push({ y: cBot, r: e26.holeRadiusMm });
        appendE26Vault45(inner, cBot, e26.holeRadiusMm, rIn, slotH + 1);
        inner.push({ y: slotH, r: rIn });
        inner.push({ y: 0, r: rIn });
      }
      buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
        widthMm: slotW,
        heightMm: slotH,
      });
      return mb;
    }

    const outer: ProfileNode[] = [
      { y: 0, r: rFoot },
      makeRibbedNode(slotH, coneRAt(slotH), slotH, pedH),
    ];
    const bodySegs = isRibbed ? 8 : 3;
    appendBodyProfileWithOptionalGrooves(
      outer,
      gableClearY,
      pedH,
      bodySegs,
      coneRAt,
      slotH,
      pedH
    );
    appendMaleCouplingNodes(outer, pedH, maxClipY);

    const inner: ProfileNode[] = [];
    if (isLed) {
      appendLedKit001TopCup(
        inner,
        led,
        maxClipY,
        (y) => (y >= pedH ? led.cavityRadiusMm : Math.max(led.cavityRadiusMm, coneRAt(y) - 4.2)),
        slotH,
        gableClearY,
        true,
        0
      );
    } else {
      const cBot = pedH - e26CeilingThick;
      const rTopCav = Math.max(e26.holeRadiusMm + 3.0, rShoulder - 4.0);
      const rBotCav = Math.max(e26.holeRadiusMm + 6.0, rFoot - 4.5);
      inner.push({ y: maxClipY, r: Math.max(e26.holeRadiusMm + 1.5, rNeck - 3.2) });
      inner.push({ y: pedH, r: e26.holeRadiusMm });
      inner.push({ y: cBot, r: e26.holeRadiusMm });
      // 45° internal vaulted transition from e26 hole to inner cone cavity!
      const vBot = appendE26Vault45(inner, cBot, e26.holeRadiusMm, rTopCav, gableClearY + 1);
      if (vBot > gableClearY + 1) {
        inner.push({ y: gableClearY, r: Math.min(rBotCav, e26.holeRadiusMm + (cBot - gableClearY)) });
      }
      const rEnd = Math.min(rBotCav, e26.holeRadiusMm + (cBot - slotH));
      inner.push({ y: slotH, r: rEnd });
      inner.push({ y: 0, r: rEnd });
    }

    const pedAvailH = pedH - gableClearY - 2.0;
    const pedSealH = clamp(pedAvailH, 9.5, 16.0);
    const pedSealY = gableClearY + 1.0 + pedAvailH * 0.5;
    const pedSeal: AuthorSealSpec | null =
      wantAuthorSeal && pedAvailH >= 10.0
        ? {
            centerTheta: 0,
            yCenter: pedSealY,
            widthMm: Math.min(14.0, pedSealH * 0.88),
            heightMm: pedSealH,
            depthMm: OZEK_HANKO_SEAL_DEPTH_MM,
            refRadiusMm: coneRAt(pedSealY),
          }
        : null;

    buildClosedRevolutionWithOptionalCordSlot(
      mb,
      N,
      outer,
      inner,
      { widthMm: slotW, heightMm: slotH },
      pedSeal,
      draft
    );
    return mb;
  }

  // --- STYLE 4: CYLINDER ---
  if (base.style === 'cylinder') {
    const drumH = Math.max(26, base.height);
    const revealH = Math.max(0, base.collarRevealMm);
    const fullTopY = drumH + revealH + couplingH;
    const maxClipY = clipHeightMm ? Math.min(fullTopY, clipHeightMm) : fullTopY;

    const rDrum = Math.max(rNeck + 10, base.footRadius);

    if (clipHeightMm && clipHeightMm < drumH - 5) {
      const outer: ProfileNode[] = [
        { y: 0, r: rDrum },
        { y: slotH, r: rDrum },
        { y: maxClipY, r: rDrum },
      ];
      const rIn = isLed ? led.cavityRadiusMm : Math.max(e26.holeRadiusMm + 6, rDrum - 5.5);
      const inner: ProfileNode[] = [];
      if (isLed) {
        appendLedKit001TopCup(
          inner,
          led,
          maxClipY,
          () => Math.max(led.cavityRadiusMm, rDrum - 4.5),
          slotH,
          gableClearY,
          true,
          0
        );
      } else {
        const cBot = Math.max(gableClearY, maxClipY - e26CeilingThick);
        inner.push({ y: maxClipY, r: e26.holeRadiusMm });
        inner.push({ y: cBot, r: e26.holeRadiusMm });
        appendE26Vault45(inner, cBot, e26.holeRadiusMm, rIn, slotH + 1);
        inner.push({ y: slotH, r: rIn });
        inner.push({ y: 0, r: rIn });
      }
      buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
        widthMm: slotW,
        heightMm: slotH,
      });
      return mb;
    }

    const outer: ProfileNode[] = [
      { y: 0, r: rDrum },
      makeRibbedNode(slotH, rDrum, slotH, drumH),
    ];
    const bodySegs = isRibbed ? 6 : 2;
    appendBodyProfileWithOptionalGrooves(
      outer,
      gableClearY,
      drumH - 1.2,
      bodySegs,
      () => rDrum,
      slotH,
      drumH
    );
    outer.push({ y: drumH, r: rDrum - 1.2 });

    if (revealH > 0.5) {
      outer.push({ y: drumH, r: rNeck + 1.8 });
      outer.push({ y: drumH + revealH, r: rNeck + 1.8 });
    }
    appendMaleCouplingNodes(outer, drumH + revealH, maxClipY);

    const rDrumCav = Math.max(e26.holeRadiusMm + 6.0, rDrum - 4.5);
    const topDeckY = drumH + revealH;
    const inner: ProfileNode[] = [];
    if (isLed) {
      appendLedKit001TopCup(
        inner,
        led,
        maxClipY,
        (y) => (y >= drumH ? led.cavityRadiusMm : Math.max(led.cavityRadiusMm, rDrum - 4.5)),
        slotH,
        gableClearY,
        true,
        0
      );
    } else {
      const cBot = topDeckY - e26CeilingThick;
      inner.push({ y: maxClipY, r: Math.max(e26.holeRadiusMm + 1.5, rNeck - 3.2) });
      inner.push({ y: topDeckY, r: e26.holeRadiusMm });
      inner.push({ y: cBot, r: e26.holeRadiusMm });
      const vBot = appendE26Vault45(inner, cBot, e26.holeRadiusMm, rDrumCav, gableClearY + 1);
      const rSafeCav = Math.min(rDrumCav, e26.holeRadiusMm + (cBot - vBot));
      if (vBot > gableClearY + 1) {
        inner.push({ y: gableClearY, r: rSafeCav });
      }
      inner.push({ y: slotH, r: rSafeCav });
      inner.push({ y: 0, r: rSafeCav });
    }

    const cylAvailH = drumH - 1.4 - gableClearY - 1.4;
    const cylSealH = clamp(cylAvailH, 9.5, 16.0);
    const cylSealY = gableClearY + 0.7 + cylAvailH * 0.5;
    const cylSeal: AuthorSealSpec | null =
      wantAuthorSeal && cylAvailH >= 10.0
        ? {
            centerTheta: 0,
            yCenter: cylSealY,
            widthMm: Math.min(14.0, cylSealH * 0.88),
            heightMm: cylSealH,
            depthMm: OZEK_HANKO_SEAL_DEPTH_MM,
            refRadiusMm: rDrum,
          }
        : null;

    buildClosedRevolutionWithOptionalCordSlot(
      mb,
      N,
      outer,
      inner,
      { widthMm: slotW, heightMm: slotH },
      cylSeal,
      draft
    );
    return mb;
  }

  // --- STYLE 5: TRIPOD (Support-free when auto-flipped 180° on export: flat collar on Z=0, legs < 42°!) ---
  const ringTopY = Math.max(55, base.height);
  const ringThickH = isLed ? 15.0 : 14.0;
  const ringBotY = ringTopY - ringThickH;
  const fullTopY = ringTopY + couplingH;
  const maxClipY = clipHeightMm ? Math.max(ringBotY + 12.0, Math.min(fullTopY, ringBotY + clipHeightMm)) : fullTopY;

  const rCollarOut = rNeck + 5.5;
  const rInnerHole = isLed ? led.lightHoleRadiusMm : e26.holeRadiusMm;

  const collarOuter: ProfileNode[] = [
    { y: ringBotY, r: rCollarOut - 0.8 },
    { y: ringBotY + 1.0, r: rCollarOut },
    { y: ringTopY - 0.8, r: rCollarOut },
    { y: ringTopY, r: rCollarOut - 0.8 },
  ];
  appendMaleCouplingNodes(collarOuter, ringTopY, maxClipY);

  const collarInner: ProfileNode[] = [];
  if (isLed) {
    // Open-top LED Kit 001 cup flush at top of tripod collar + 7 mm side USB notch + 45° bottom chamfer
    appendLedKit001TopCup(
      collarInner,
      led,
      maxClipY,
      () => Math.min(rCollarOut - 3.2, led.cavityRadiusMm + 1.5),
      ringBotY,
      ringBotY,
      false,
      ringBotY
    );
  } else {
    const cBot = maxClipY - e26CeilingThick;
    collarInner.push({ y: maxClipY, r: rInnerHole });
    collarInner.push({ y: cBot, r: rInnerHole });
    appendE26Vault45(collarInner, cBot, rInnerHole, rInnerHole + 4.0, ringBotY + 1);
    collarInner.push({ y: ringBotY, r: rInnerHole + 4.0 });
  }

  const tripodSeal: AuthorSealSpec | null = wantAuthorSeal
    ? {
        centerTheta: Math.PI * 0.5, // Midpoint between tripod legs (30° and 150°)
        yCenter: (ringBotY + ringTopY) * 0.5,
        widthMm: 10.0,
        heightMm: Math.min(11.0, ringThickH - 3.0),
        depthMm: OZEK_HANKO_SEAL_DEPTH_MM,
        refRadiusMm: rCollarOut,
      }
    : null;

  buildClosedRevolutionWithOptionalCordSlot(
    mb,
    N,
    collarOuter,
    collarInner,
    null,
    tripodSeal,
    draft
  );

  // Clamp leg outward spread so leg angle is strictly < 42° when printed upside down (0% supports!)
  const rTopLeg = rCollarOut - 1.5;
  const maxSupportFreeSpread = rTopLeg + (ringTopY - 1.5) * 0.78;
  const legSpreadR = Math.min(maxSupportFreeSpread, Math.max(rCollarOut + 12, base.footRadius));
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3 + Math.PI / 6;
    addWatertightTripodLeg(
      mb,
      angle,
      ringTopY - 1.5,
      rTopLeg,
      legSpreadR,
      11.0,
      7.5,
      12.0,
      8.0
    );
  }

  return mb;
}
