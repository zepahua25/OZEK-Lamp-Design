import { LampConfig, MeshPartData } from '../types/lamp';
import { aggregateMetrics, finalizePartGeometry } from './analyzer';
import { buildIndependentBase, SolidMeshBuilder } from './baseBuilder';
import {
  BAYONET_DEPTH_MM,
  COMPACT_FLUSH_LUG_DEPTH_MM,
  COMPACT_FLUSH_RIM_HEIGHT_MM,
  SLENDER_E26_RING_HEIGHT_MM,
  SLENDER_E26_SHADE_BORE_RADIUS_MM,
  SLENDER_E26_SHADE_HUB_OUTER_RADIUS_MM,
  THREAD_DEPTH_MM,
  couplingUsesBayonet,
  evaluateFemaleCouplingRadius,
  getCouplingHeightMm,
  getEffectiveNeckRadius,
  getShadeSeatY,
  isSlenderE26Mode,
} from './coupling';
import { getLampFamily } from './registry';
import {
  evaluateCrossSectionMultiplier,
  evaluateEffectiveSilhouetteRadius,
  evaluateSculptField,
  evaluateSilhouetteRadius,
  getEffectiveShadeHeight,
} from './silhouette';
import { getLedKit001Dimensions } from './mounts/ledKit001';
import { getSocketE26Dimensions } from './mounts/socketE26';

export interface BuildOptions {
  /** Use lower grid density during live slider dragging */
  draft?: boolean;
  /** Clip geometry at this height (mm) from the mount plane (used for 15 mm test base) */
  clipHeightMm?: number;
  /** Force full topological manifold validation */
  validateManifold?: boolean;
  /** Override pendant flip (e.g. export flat on mount plane when autoFlipPendantExport is true) */
  keepMountAtBottom?: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

interface AngularLayout {
  N: number;
  thetas: Float64Array;
  usbSlotSegs: number;
  isSpoke: Uint8Array;
}

function buildAngularLayout(
  requestedN: number,
  usbHalfAngle: number | null,
  ventSlots: number,
  enableVentilation: boolean,
  spokeFillRatio = 0.34
): AngularLayout {
  const N = Math.max(48, Math.round(requestedN));
  const thetas = new Float64Array(N);
  let usbSlotSegs = 0;

  if (usbHalfAngle !== null && usbHalfAngle > 0) {
    usbSlotSegs = Math.max(4, Math.round((2 * usbHalfAngle) / ((2 * Math.PI) / N)));
    if ((usbSlotSegs & 1) === 1) usbSlotSegs += 1;
    if (usbSlotSegs > Math.floor(N / 6)) usbSlotSegs = Math.max(4, Math.floor(N / 6) & ~1);
    const restSegs = N - usbSlotSegs;
    for (let u = 0; u <= usbSlotSegs; u++) {
      thetas[u] = -usbHalfAngle + (2 * usbHalfAngle * u) / usbSlotSegs;
    }
    const span = 2 * Math.PI - 2 * usbHalfAngle;
    for (let k = 1; k < restSegs; k++) {
      thetas[usbSlotSegs + k] = usbHalfAngle + (span * k) / restSegs;
    }
  } else {
    for (let u = 0; u < N; u++) {
      thetas[u] = (2 * Math.PI * u) / N;
    }
  }

  const isSpoke = new Uint8Array(N);
  if (!enableVentilation || ventSlots <= 0) {
    isSpoke.fill(1);
  } else {
    const slots = Math.max(4, Math.min(12, Math.round(ventSlots)));
    const period = (2 * Math.PI) / slots;
    const spokeHalf = period * (clamp(spokeFillRatio, 0.05, 0.7) * 0.5);
    for (let s = 0; s < N; s++) {
      const u1 = (s + 1) % N;
      let t0 = thetas[s];
      let t1 = thetas[u1];
      if (t1 < t0) t1 += 2 * Math.PI;
      const mid = (t0 + t1) * 0.5;
      const mNorm = ((mid % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const localPhase = ((mNorm + period * 0.5) % period) - period * 0.5;
      if (Math.abs(localPhase) <= spokeHalf) {
        isSpoke[s] = 1;
      }
    }
    if (usbSlotSegs > 0) {
      const pad = Math.max(2, Math.round(N * 0.015));
      for (let s = 0; s < usbSlotSegs + pad; s++) {
        isSpoke[s % N] = 1;
      }
      for (let s = N - pad; s < N; s++) {
        isSpoke[s] = 1;
      }
    }
  }

  return { N, thetas, usbSlotSegs, isSpoke };
}

interface WallEvaluator {
  sampleOuterAndInner(
    u: number,
    theta: number,
    yLocal: number,
    totalHeight: number,
    minInnerR: number,
    mountFlatBandMm: number
  ): { rOut: number; rIn: number; localThickness: number };
}

function createWallEvaluator(
  config: LampConfig,
  invertedForPendant: boolean
): WallEvaluator {
  const familyDef = getLampFamily(config.family);
  const patternEval = familyDef.createEvaluator(config);
  const { silhouette, mount } = config;
  const wallT = clamp(mount.wallThickness, 1.6, 3.2);

  return {
    sampleOuterAndInner(
      u: number,
      theta: number,
      yLocal: number,
      totalHeight: number,
      minInnerR: number,
      mountFlatBandMm: number
    ) {
      const vLocal = clamp(yLocal / Math.max(totalHeight, 1), 0, 1);
      const vDesign = invertedForPendant ? 1 - vLocal : vLocal;
      const isClosedDome = Boolean(silhouette.closeTopDome) && !invertedForPendant;
      const isClosedPole = isClosedDome && mount.type === 'led_kit_001';
      const nominalCoreWall = config.family === 'organic' ? 1.2 : wallT;

      let baseR = evaluateEffectiveSilhouetteRadius(
        vDesign,
        silhouette,
        mount.type,
        nominalCoreWall,
        invertedForPendant
      );

      if (yLocal < 0) {
        const r0 = evaluateSilhouetteRadius(0, silhouette);
        const r1 = evaluateSilhouetteRadius(0.05, silhouette);
        const slope = clamp((r1 - r0) / (0.05 * Math.max(totalHeight, 40)), -0.9, 0.9);
        baseR = Math.max(minInnerR + 4, r0 + slope * yLocal);
      }

      const mountCircularBlend =
        baseR < minInnerR + wallT + 8
          ? smoothstep(mountFlatBandMm, mountFlatBandMm + 14, Math.max(0, yLocal))
          : 1.0;

      // Blend cross-section smoothly back to circular near closed dome crown so pole is strictly circular!
      const domeCircularBlend = isClosedDome ? 1 - smoothstep(0.74, 0.98, vDesign) : 1.0;

      // Persistent interactive 3D sculpt strokes (C1 smooth, 100% watertight!)
      const sculpt = evaluateSculptField(
        u,
        vDesign,
        totalHeight,
        Math.max(24, baseR),
        config.sculptStrokes
      );
      const sculptEnv =
        smoothstep(mountFlatBandMm * 0.5, mountFlatBandMm + 8, Math.max(0, yLocal)) *
        (isClosedDome ? 1 - smoothstep(0.76, 0.97, vDesign) : 1.0);
      const effTheta = theta + sculpt.dThetaRad * sculptEnv;

      // Cross-Section: Circle, Superellipse, Ellipse, Soft Polygon, Concave Square, or Flower + Twist
      baseR *= evaluateCrossSectionMultiplier(
        effTheta,
        vDesign,
        silhouette,
        mountCircularBlend * domeCircularBlend
      );
      baseR = Math.max(isClosedPole ? 2.4 : 8.0, baseR + sculpt.drMm * sculptEnv);

      const bottomFade =
        yLocal < 0
          ? 1.0
          : smoothstep(
              Math.max(1.2, mountFlatBandMm * 0.25),
              mountFlatBandMm + 5.5,
              yLocal
            );
      // Fade surface displacement smoothly to 0 right at the closed dome pole/vent crown
      const topDomeFade = isClosedDome ? 1 - smoothstep(0.78, 0.985, vDesign) : 1.0;
      const patternFade = bottomFade * topDomeFade * (1 - sculpt.smoothMask * 0.65 * sculptEnv);

      const disp = patternEval({
        u: (((effTheta / (2 * Math.PI)) % 1) + 1) % 1,
        theta: effTheta,
        v: vDesign,
        y: vDesign * totalHeight,
        baseRadius: baseR,
        height: totalHeight,
      });

      let rIn: number;
      let rOut: number;
      let minAllowedWall = wallT;

      if (disp.explicitWallThicknessMm !== undefined) {
        const effWall = wallT * (1 - topDomeFade) + nominalCoreWall * topDomeFade;
        rIn = baseR - effWall;
        const localWall =
          wallT * (1 - patternFade) + disp.explicitWallThicknessMm * patternFade;
        minAllowedWall = Math.min(wallT, Math.max(0.62, localWall));
        rOut = rIn + localWall;
      } else if (disp.uniformWallThicknessMm !== undefined) {
        const thinW = clamp(disp.uniformWallThicknessMm, 0.8, 3.2);
        const effWall = wallT * (1 - bottomFade) + thinW * bottomFade;
        const outerOffset = disp.outerOffset * patternFade;
        const innerOffset = outerOffset * clamp(disp.innerFollow, 0, 1);
        rIn = baseR - effWall + innerOffset;
        rOut = baseR + outerOffset;
        minAllowedWall = Math.min(effWall, 0.78);
      } else {
        const outerOffset = disp.outerOffset * patternFade;
        const innerOffset = outerOffset * clamp(disp.innerFollow, 0, 1);
        rIn = baseR - wallT + innerOffset;
        rOut = baseR + outerOffset;
      }

      const minInnerLimit = isClosedPole ? 1.2 : isClosedDome ? 8.0 : 10.0;
      if (yLocal >= 0 && yLocal <= mountFlatBandMm + 14) {
        const guardBlend = 1 - smoothstep(mountFlatBandMm, mountFlatBandMm + 14, yLocal);
        const minRHere = minInnerR * guardBlend + minInnerLimit * (1 - guardBlend);
        if (rIn < minRHere) rIn = minRHere;
      } else if (rIn < minInnerLimit) {
        rIn = minInnerLimit;
      }

      if (rOut < rIn + minAllowedWall) {
        rOut = rIn + minAllowedWall;
      }

      return {
        rOut,
        rIn,
        localThickness: rOut - rIn,
      };
    },
  };
}

function closeTopRimFlat(
  mb: SolidMeshBuilder,
  N: number,
  outTopRing: Int32Array,
  inTopRing: Int32Array
): void {
  for (let s = 0; s < N; s++) {
    const u0 = s;
    const u1 = (s + 1) % N;
    mb.addQuad(inTopRing[u0], outTopRing[u0], outTopRing[u1], inTopRing[u1]);
  }
}

/**
 * Watertight 2-manifold spherical pole closure to exact R = 0.0 mm (zero open edges, zero degenerate triangles!):
 * Uses a SINGLE outer North Pole vertex `(0, yPoleOut, 0)` and a SINGLE inner North Pole vertex
 * `(0, yPoleIn, 0)` preserving continuous wall thickness all the way to the crown!
 */
function closeTopDomePole(
  mb: SolidMeshBuilder,
  N: number,
  outTopRing: Int32Array,
  inTopRing: Int32Array,
  yTopRing: number,
  capWallMm: number
): void {
  const yPoleOut = yTopRing + 0.35;
  const yPoleIn = yTopRing - Math.max(0.8, capWallMm) + 0.15;
  const vPoleOut = mb.addVertex(0, yPoleOut, 0, capWallMm);
  const vPoleIn = mb.addVertex(0, yPoleIn, 0, capWallMm);

  for (let s = 0; s < N; s++) {
    const u0 = s;
    const u1 = (s + 1) % N;
    // Outer dome crown fan (+Y outward)
    mb.addTri(outTopRing[u0], outTopRing[u1], vPoleOut);
    // Inner dome vault fan (-Y into hollow interior = outward from solid shell!)
    mb.addTri(inTopRing[u1], inTopRing[u0], vPoleIn);
  }
}

/**
 * Generates a 100% watertight, flat Z=0..3.5 mm annular spider plate with K smoothly sculpted windows
 * anchored solidly into both the central female coupling hub and the outer shade inner wall.
 * Supports 4 styles (0% supports, printed upright on Z=0):
 *  - 'radial'        : 3, 4, or 6 straight radial arms with soft filleted corners
 *  - 'organic_ovals' : flat disc with 4–6 smooth oval/teardrop cutouts (red-base reference)
 *  - 'x_corners'     : 4 stylized arms rotated 45° toward corners (white 4-corner shade reference)
 *  - 'spiral'        : 4–6 graceful curved spiral/petal arms
 */
function appendSculptedFlatSpider(
  mb: SolidMeshBuilder,
  config: LampConfig,
  seatY: number,
  deckH: number,
  rHubOut: number,
  minInnerAtBottom: number,
  evalWall: WallEvaluator,
  draft: boolean
): void {
  const { base, silhouette } = config;
  const style = base.spiderStyle ?? 'radial';
  const rawArms = Math.round(base.spiderArmCount || 4);

  let K: number;
  if (style === 'x_corners') {
    K = 4;
  } else if (style === 'radial') {
    K = rawArms <= 3 ? 3 : rawArms >= 6 ? 6 : 4;
  } else {
    // 'organic_ovals' and 'spiral': 4, 5, or 6 windows/arms
    K = Math.max(4, Math.min(6, rawArms));
  }

  const S = draft ? 4 : 6; // segments per sector side -> P = 16 (draft) or 24 (final) vertices per window!
  const P = 4 * S;
  const sectorSpan = (2 * Math.PI) / K;
  // In 'x_corners', arms sit at 45°, 135°, 225°, 315° (windows centered at 0°, 90°, 180°, 270°)
  const angleOffset = style === 'x_corners' ? Math.PI / 4 : 0;
  const spiralTwistMax = style === 'spiral' ? 0.66 : 0; // ~38° graceful spiral sweep

  const yBot = seatY;
  const yTop = seatY + deckH;
  const rInnerAnchor = Math.max(12, rHubOut - 0.9); // embedded 0.9 mm into hub outer wall (clear of inner bore!)

  const rOuterAtTheta = (theta: number): number => {
    const normU = (((theta / (2 * Math.PI)) % 1) + 1) % 1;
    const sample = evalWall.sampleOuterAndInner(
      normU,
      theta,
      0,
      getEffectiveShadeHeight(silhouette),
      minInnerAtBottom,
      deckH + 1.5
    );
    // Anchor 0.8 mm into the shade inner wall (never exceeding outer wall!)
    return Math.min(sample.rOut - 0.3, Math.max(rInnerAnchor + 4.5, sample.rIn + 0.8));
  };

  const mapSectorToWorld = (k: number, u: number, t: number): { r: number; theta: number } => {
    const twist = spiralTwistMax * (t * t * (3 - 2 * t));
    const thetaCenter = angleOffset + (k + 0.5) * sectorSpan;
    const theta = thetaCenter + u * (sectorSpan * 0.5) + twist;
    const rOut = rOuterAtTheta(theta);
    const r = rInnerAnchor + (rOut - rInnerAnchor) * t;
    return { r, theta };
  };

  // Pre-allocate K shared radial seams (j = 0..S from t=0 to t=1 along u = -1 of sector k)
  const seamBot: Int32Array[] = [];
  const seamTop: Int32Array[] = [];
  for (let k = 0; k < K; k++) {
    const sb = new Int32Array(S + 1);
    const st = new Int32Array(S + 1);
    for (let j = 0; j <= S; j++) {
      const t = j / S;
      const { r, theta } = mapSectorToWorld(k, -1, t);
      sb[j] = mb.addCyl(r, theta, yBot, deckH);
      st[j] = mb.addCyl(r, theta, yTop, deckH);
    }
    seamBot.push(sb);
    seamTop.push(st);
  }

  // Evaluate sculpted window contour (uWin, tWin) aligned 1-to-1 with frame perimeter point (cx, cy)
  const evalWindowPoint = (cx: number, cy: number): { u: number; t: number } => {
    const phi = Math.atan2(cy, cx);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    if (style === 'organic_ovals') {
      // Plush oval / teardrop cutout with generous rounded fillets (red-base photo reference)
      const dropWiden = 1.0 + 0.14 * s;
      return {
        u: clamp(0.71 * dropWiden * c, -0.86, 0.86),
        t: clamp(0.5 + 0.34 * s, 0.14, 0.86),
      };
    }

    if (style === 'x_corners') {
      // Stylized wide fillets pointing cleanly into the 4 corners (white 4-point shade reference)
      const p = 2.6;
      const rSE = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
      return {
        u: clamp(0.78 * rSE * c, -0.88, 0.88),
        t: clamp(0.5 + 0.35 * rSE * s, 0.13, 0.87),
      };
    }

    if (style === 'spiral') {
      // Soft petal cutout twisted along the radial spiral
      const p = 2.4;
      const rSE = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
      return {
        u: clamp(0.74 * rSE * c, -0.86, 0.86),
        t: clamp(0.5 + 0.34 * rSE * s, 0.14, 0.86),
      };
    }

    // 'radial': classic 3 / 4 / 6 straight radial spokes with smooth filleted corners
    const p = 3.2;
    const rSE = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), -1 / p);
    const uScale = K === 3 ? 0.84 : K === 4 ? 0.81 : 0.76;
    return {
      u: clamp(uScale * rSE * c, -0.89, 0.89),
      t: clamp(0.5 + 0.36 * rSE * s, 0.13, 0.87),
    };
  };

  for (let k = 0; k < K; k++) {
    const kNext = (k + 1) % K;
    const frameBot = new Int32Array(P);
    const frameTop = new Int32Array(P);
    const winBot = new Int32Array(P);
    const winTop = new Int32Array(P);

    for (let p = 0; p < P; p++) {
      let cx: number;
      let cy: number;
      if (p < S) {
        // Bottom edge t = 0: u from -1 -> +1
        const f = p / S;
        cx = -1 + 2 * f;
        cy = -1;
        if (p === 0) {
          frameBot[p] = seamBot[k][0];
          frameTop[p] = seamTop[k][0];
        } else {
          const pt = mapSectorToWorld(k, cx, 0);
          frameBot[p] = mb.addCyl(pt.r, pt.theta, yBot, deckH);
          frameTop[p] = mb.addCyl(pt.r, pt.theta, yTop, deckH);
        }
      } else if (p < 2 * S) {
        // Right radial seam u = +1: t from 0 -> 1 (shared with seam[kNext]!)
        const j = p - S;
        cx = 1;
        cy = -1 + (2 * j) / S;
        frameBot[p] = seamBot[kNext][j];
        frameTop[p] = seamTop[kNext][j];
      } else if (p < 3 * S) {
        // Top edge t = 1: u from +1 -> -1
        const j = p - 2 * S;
        cx = 1 - (2 * j) / S;
        cy = 1;
        if (j === 0) {
          frameBot[p] = seamBot[kNext][S];
          frameTop[p] = seamTop[kNext][S];
        } else {
          const pt = mapSectorToWorld(k, cx, 1);
          frameBot[p] = mb.addCyl(pt.r, pt.theta, yBot, deckH);
          frameTop[p] = mb.addCyl(pt.r, pt.theta, yTop, deckH);
        }
      } else {
        // Left radial seam u = -1: t from 1 -> 0 (shared with seam[k]!)
        const j = 4 * S - p;
        cx = -1;
        cy = -1 + (2 * j) / S;
        frameBot[p] = seamBot[k][j];
        frameTop[p] = seamTop[k][j];
      }

      const w = evalWindowPoint(cx, cy);
      const wPt = mapSectorToWorld(k, w.u, w.t);
      winBot[p] = mb.addCyl(wPt.r, wPt.theta, yBot, deckH);
      winTop[p] = mb.addCyl(wPt.r, wPt.theta, yTop, deckH);
    }

    for (let p = 0; p < P; p++) {
      const pn = (p + 1) % P;
      // Top horizontal face (+Y)
      mb.addQuad(frameTop[p], winTop[p], winTop[pn], frameTop[pn]);
      // Bottom horizontal face (-Y)
      mb.addQuad(frameBot[p], frameBot[pn], winBot[pn], winBot[p]);
      // Inner window vertical wall (outward into open window cutout)
      mb.addQuad(winBot[p], winBot[pn], winTop[pn], winTop[p]);
      // Outer/Inner circular perimeter walls ONLY on t=0 (0..S-1) and t=1 (2S..3S-1), NEVER on shared radial seams!
      if (p < S || (p >= 2 * S && p < 3 * S)) {
        mb.addQuad(frameBot[p], frameTop[p], frameTop[pn], frameBot[pn]);
      }
    }
  }
}

/**
 * Builds the independent SHADE part for Two-Part Lamp mode!
 * v2.0 FDM Upgrade:
 *  - When `coupling === 'spider'`, the 4 thin (3 mm) radial spider arms slope UPWARD at **45°**
 *    from the central collar toward the shade's inner wall so that when the shade is flipped 180°
 *    upside-down onto its flat top rim in Bambu Studio, the arms & collar print 100% WITHOUT SUPPORTS!
 */
function buildCoupledShade(
  config: LampConfig,
  seatY: number,
  radialSegs: number,
  heightSegs: number,
  draft: boolean
): SolidMeshBuilder {
  const mb = new SolidMeshBuilder();
  const { silhouette, base, mount } = config;
  const shadeHeight = getEffectiveShadeHeight(silhouette);
  const wallT = clamp(mount.wallThickness, 1.6, 3.2);
  const evalWall = createWallEvaluator(config, false);

  const isCompactFlush = base.style === 'compact_flush';
  const isSlenderE26 = isSlenderE26Mode(config);
  const isSpider = !isCompactFlush && (base.coupling === 'spider' || isSlenderE26);
  const rMaleBase = getEffectiveNeckRadius(config);
  const extraCouplingDepth = isCompactFlush
    ? COMPACT_FLUSH_LUG_DEPTH_MM + 0.25
    : couplingUsesBayonet(base)
      ? BAYONET_DEPTH_MM + 0.25
      : base.coupling === 'thread'
        ? THREAD_DEPTH_MM
        : 0;
  const effectiveClr =
    !isCompactFlush && base.coupling === 'gravity_seat'
      ? Math.max(0.4, base.couplingClearance)
      : clamp(base.couplingClearance, 0.2, 0.65);
  const rHubOut = isSlenderE26
    ? SLENDER_E26_SHADE_HUB_OUTER_RADIUS_MM
    : rMaleBase + effectiveClr + extraCouplingDepth + Math.max(2.6, wallT + 0.6);

  // Optional Organic Wavy Bottom Skirt (0 - 15 mm, 3 - 8 waves; disabled when flush-embedded)
  const waveAmp = isCompactFlush ? 0 : clamp(silhouette.skirtWaveAmp || 0, 0, 15);
  const waveCount = Math.max(3, Math.min(8, Math.round(silhouette.skirtWaveCount || 5)));
  const hasWavySkirt = waveAmp > 0.15;

  // When coupling === 'spider' (or slender_e26) and skirtWaveAmp === 0, the central ring and flat spokes
  // sit FLUSH on Z = 0 .. 3.5 mm directly connected to the shade bottom rim (prints upright 0% supports!).
  // In slender_e26 mode, the central ring is strictly 3.5 mm tall with a Ø 40.8 mm inner bore clamped by the E26 nut!
  const deckH = isCompactFlush
    ? COMPACT_FLUSH_RIM_HEIGHT_MM
    : isSlenderE26
      ? SLENDER_E26_RING_HEIGHT_MM
      : isSpider && !hasWavySkirt
        ? 3.5
        : 3.2;
  const collarH = isSlenderE26 ? SLENDER_E26_RING_HEIGHT_MM : getCouplingHeightMm(base);

  const sampleBaseR = evaluateSilhouetteRadius(0, silhouette);
  const canVent = isCompactFlush
    ? false
    : isSpider
      ? sampleBaseR - wallT > rHubOut + 5.0
      : base.shadeVentilation && sampleBaseR - wallT > rHubOut + 8.5;

  let spokeCount = mount.ventSlots;
  let spokeFillRatio = 0.28;
  if (isSpider) {
    spokeCount = 4;
    const midArmR = Math.max(36, (rHubOut + Math.max(rHubOut + 10, sampleBaseR)) * 0.5);
    spokeFillRatio = clamp((4 * 3.2) / (2 * Math.PI * midArmR), 0.055, 0.16);
  }

  const layout = buildAngularLayout(radialSegs, null, spokeCount, canVent, spokeFillRatio);
  const { N, thetas, isSpoke } = layout;

  const deckSubdivs = isCompactFlush ? 1 : draft ? 3 : 6;
  const upperCollarSubdivs = isSlenderE26
    ? 0
    : isCompactFlush
      ? draft
        ? 14
        : 26
      : draft
        ? 8
        : 16;
  const D = deckSubdivs;
  const C = deckSubdivs + upperCollarSubdivs;

  // For Compact Flush (seatY = 0), lift row 0 around theta = 0 in a crisp 45° peaked arch (4.5 mm high, ~9.5 mm wide)
  // aligned directly with the Ø 75 × 15 mm base's rear USB cable slot so the cord exits flush under the sphere!
  const flushCordHalfRad = isCompactFlush
    ? Math.asin(clamp(4.7 / Math.max(38, sampleBaseR), 0.075, 0.16))
    : 0;
  const flushCordPeakMm = isCompactFlush ? 4.5 : 0;
  const flushCordArchAtTheta = (theta: number): number => {
    if (!isCompactFlush) return 0;
    const wrapped = Math.atan2(Math.sin(theta), Math.cos(theta));
    const a = Math.abs(wrapped);
    if (a >= flushCordHalfRad) return 0;
    return (1 - a / flushCordHalfRad) * flushCordPeakMm;
  };

  // Vertical rows for the female coupling hub (always sitting at seatY .. seatY + collarH)
  const collarY: number[] = [];
  for (let i = 0; i <= D; i++) {
    collarY.push(seatY + (deckH * i) / D);
  }
  for (let i = 1; i <= upperCollarSubdivs; i++) {
    collarY.push(seatY + deckH + ((collarH - deckH) * i) / upperCollarSubdivs);
  }

  // Only slope spider arms at 45° when a wavy skirt drops below seatY (so flipping 180° prints support-free).
  // With flat bottom (skirtWaveAmp === 0), spider uses our sculpted flat Z=0..3.5 mm bracket (4 selectable styles!).
  const useFlatSculptedSpider = isSpider && canVent && !hasWavySkirt;
  const useSlopedSpider = isSpider && canVent && hasWavySkirt;
  const nominalSpan = Math.max(0, sampleBaseR - wallT - rHubOut);
  const spiderWallAnchorOffsetMm = useSlopedSpider
    ? clamp(nominalSpan, 6.0, Math.max(10.0, shadeHeight * 0.42))
    : 0;

  // Build shade vertical rows:
  // If sloped spider:
  //   rows [0 .. S_LOW] cover seatY .. seatY + spiderWallAnchorOffsetMm (lower shade wall below spider arms)
  //   rows [S_LOW .. S_LOW + D] cover the exact anchor band [seatY + offset .. seatY + offset + deckH] matching hubOut[0..D]!
  //   rows [S_LOW + D .. M] cover the upper shade wall up to seatY + shadeHeight!
  // If flat flange: S_LOW = 0, so rows [0..D] sit at seatY .. seatY + deckH!
  const shellY: number[] = [];
  const S_LOW = useSlopedSpider ? Math.max(4, Math.round((spiderWallAnchorOffsetMm / shadeHeight) * heightSegs)) : 0;

  if (useSlopedSpider) {
    for (let i = 0; i < S_LOW; i++) {
      shellY.push(seatY + (spiderWallAnchorOffsetMm * i) / S_LOW);
    }
    for (let i = 0; i <= D; i++) {
      shellY.push(seatY + spiderWallAnchorOffsetMm + (deckH * i) / D);
    }
    const startUpper = spiderWallAnchorOffsetMm + deckH;
    const upperSpan = Math.max(10, shadeHeight - startUpper);
    const upperSegs = Math.max(10, heightSegs - S_LOW);
    for (let j = 1; j <= upperSegs; j++) {
      shellY.push(seatY + startUpper + (upperSpan * j) / upperSegs);
    }
  } else {
    for (let i = 0; i <= D; i++) {
      shellY.push(collarY[i]);
    }
    const restH = Math.max(10, shadeHeight - deckH);
    const bodySegs = Math.max(12, heightSegs);
    for (let j = 1; j <= bodySegs; j++) {
      shellY.push(seatY + deckH + (restH * j) / bodySegs);
    }
  }

  const M = shellY.length - 1;
  const ANCHOR_START = S_LOW;
  const ANCHOR_END = S_LOW + D;
  const minInnerAtBottom = canVent ? rHubOut + 5.5 : rHubOut + 1.2;

  // 1. Allocate outer & inner shade shell rings
  const isClosedPole = Boolean(silhouette.closeTopDome) && mount.type === 'led_kit_001';
  const capWallMm = config.family === 'organic' ? 1.2 : wallT;
  const outRing: Int32Array[] = [];
  const inRing: Int32Array[] = [];
  for (let row = 0; row <= M; row++) {
    const yWorld = shellY[row];
    const yLocal = yWorld - seatY;
    const vRow = clamp(yLocal / Math.max(shadeHeight, 1), 0, 1);
    const yInOffset = isClosedPole ? capWallMm * smoothstep(0.74, 1.0, vRow) : 0;
    const oArr = new Int32Array(N);
    const iArr = new Int32Array(N);
    for (let u = 0; u < N; u++) {
      const theta = thetas[u];
      const s = evalWall.sampleOuterAndInner(
        u / N,
        theta,
        yLocal,
        shadeHeight,
        minInnerAtBottom,
        deckH + 1.5
      );
      const yVert = row === 0 ? yWorld + flushCordArchAtTheta(theta) : yWorld;
      oArr[u] = mb.addCyl(s.rOut, theta, yVert, s.localThickness);
      iArr[u] = mb.addCyl(s.rIn, theta, yVert - yInOffset, s.localThickness);
    }
    outRing.push(oArr);
    inRing.push(iArr);
  }

  // 2. Optional Organic Wavy Bottom Skirt (0 - 15 mm, 3 - 8 waves)
  const S_SKIRT = hasWavySkirt ? (draft ? 4 : 8) : 0;

  const skirtOut: Int32Array[] = [];
  const skirtIn: Int32Array[] = [];
  if (hasWavySkirt) {
    skirtOut.push(outRing[0]);
    skirtIn.push(inRing[0]);
    const minSkirtDrop = 2.0;
    for (let k = 1; k <= S_SKIRT; k++) {
      const frac = k / S_SKIRT;
      const oArr = new Int32Array(N);
      const iArr = new Int32Array(N);
      for (let u = 0; u < N; u++) {
        const theta = thetas[u];
        const wave = 0.5 + 0.5 * Math.sin(theta * waveCount);
        const dropHere = minSkirtDrop + waveAmp * wave;
        const yLocal = -dropHere * frac;
        const yWorld = seatY + yLocal;
        const s = evalWall.sampleOuterAndInner(
          u / N,
          theta,
          yLocal,
          shadeHeight,
          minInnerAtBottom,
          deckH + 1.5
        );
        oArr[u] = mb.addCyl(s.rOut, theta, yWorld, s.localThickness);
        iArr[u] = mb.addCyl(s.rIn, theta, yWorld, s.localThickness);
      }
      skirtOut.push(oArr);
      skirtIn.push(iArr);
    }
  }

  // 3. Allocate female coupling collar rings (rows 0 .. C)
  const hubIn: Int32Array[] = [];
  const hubOut: Int32Array[] = [];
  for (let row = 0; row <= C; row++) {
    const yWorld = collarY[row];
    const hInArr = new Int32Array(N);
    const hOutArr = new Int32Array(N);
    for (let u = 0; u < N; u++) {
      const theta = thetas[u];
      const yVert = row === 0 ? yWorld + flushCordArchAtTheta(theta) : yWorld;
      const rInCollar = isSlenderE26
        ? SLENDER_E26_SHADE_BORE_RADIUS_MM
        : evaluateFemaleCouplingRadius(rMaleBase, theta, yVert - seatY, base);
      const safeRIn = Math.min(rInCollar, rHubOut - 1.4);
      hInArr[u] = mb.addCyl(safeRIn, theta, yVert, rHubOut - safeRIn);
      hOutArr[u] = mb.addCyl(rHubOut, theta, yVert, rHubOut - safeRIn);
    }
    hubIn.push(hInArr);
    hubOut.push(hOutArr);
  }

  // 4. Connect all watertight faces per sector
  for (let s = 0; s < N; s++) {
    const u0 = s;
    const u1 = (s + 1) % N;

    // Outer wall (0 .. M)
    for (let row = 0; row < M; row++) {
      mb.addQuad(outRing[row][u0], outRing[row][u1], outRing[row + 1][u1], outRing[row + 1][u0]);
    }
    // Inner wall below anchor band (0 .. ANCHOR_START) — only when sloped spider raises anchor above seatY!
    for (let row = 0; row < ANCHOR_START; row++) {
      mb.addQuad(inRing[row][u0], inRing[row + 1][u0], inRing[row + 1][u1], inRing[row][u1]);
    }
    // Inner wall above anchor band (ANCHOR_END .. M)
    for (let row = ANCHOR_END; row < M; row++) {
      mb.addQuad(inRing[row][u0], inRing[row + 1][u0], inRing[row + 1][u1], inRing[row][u1]);
    }

    // Female coupling hub inner bore (0 .. C)
    for (let row = 0; row < C; row++) {
      mb.addQuad(hubIn[row][u0], hubIn[row + 1][u0], hubIn[row + 1][u1], hubIn[row][u1]);
    }
    // Female coupling hub upper outer wall (D .. C)
    for (let row = D; row < C; row++) {
      mb.addQuad(hubOut[row][u0], hubOut[row][u1], hubOut[row + 1][u1], hubOut[row + 1][u0]);
    }
    // Hub top rim (+Y) and bottom rim (-Y)
    mb.addQuad(hubIn[C][u0], hubOut[C][u0], hubOut[C][u1], hubIn[C][u1]);
    mb.addQuad(hubIn[0][u0], hubIn[0][u1], hubOut[0][u1], hubOut[0][u0]);

    // Outer shell bottom closing (flat or wavy skirt!)
    if (!hasWavySkirt) {
      mb.addQuad(inRing[0][u0], inRing[0][u1], outRing[0][u1], outRing[0][u0]);
    } else {
      for (let k = 0; k < S_SKIRT; k++) {
        mb.addQuad(
          skirtOut[k + 1][u0],
          skirtOut[k + 1][u1],
          skirtOut[k][u1],
          skirtOut[k][u0]
        );
        mb.addQuad(
          skirtIn[k + 1][u0],
          skirtIn[k][u0],
          skirtIn[k][u1],
          skirtIn[k + 1][u1]
        );
      }
      mb.addQuad(
        skirtIn[S_SKIRT][u0],
        skirtIn[S_SKIRT][u1],
        skirtOut[S_SKIRT][u1],
        skirtOut[S_SKIRT][u0]
      );
    }

    if (!useFlatSculptedSpider && (!canVent || isSpoke[s])) {
      // Solid spoke / 45° inclined spider arm bridging hubOut[0..D] <-> inRing[ANCHOR_START..ANCHOR_END]!
      mb.addQuad(hubOut[D][u0], inRing[ANCHOR_END][u0], inRing[ANCHOR_END][u1], hubOut[D][u1]);
      mb.addQuad(hubOut[0][u0], hubOut[0][u1], inRing[ANCHOR_START][u1], inRing[ANCHOR_START][u0]);
    } else {
      // Open ventilation window / cleanly closed walls for sculpted flat Z=0 spider plate
      for (let row = 0; row < D; row++) {
        mb.addQuad(hubOut[row][u0], hubOut[row][u1], hubOut[row + 1][u1], hubOut[row + 1][u0]);
        mb.addQuad(
          inRing[ANCHOR_START + row][u0],
          inRing[ANCHOR_START + row + 1][u0],
          inRing[ANCHOR_START + row + 1][u1],
          inRing[ANCHOR_START + row][u1]
        );
      }
    }
  }

  // 5. Vertical/sloped side walls closing every spoke / 45° spider arm boundary (zero T-junctions!)
  if (canVent && !useFlatSculptedSpider) {
    for (let u = 0; u < N; u++) {
      const prev = isSpoke[(u - 1 + N) % N];
      const next = isSpoke[u];
      if (prev === next) continue;
      for (let row = 0; row < D; row++) {
        if (prev === 1 && next === 0) {
          mb.addQuad(
            hubOut[row][u],
            hubOut[row + 1][u],
            inRing[ANCHOR_START + row + 1][u],
            inRing[ANCHOR_START + row][u]
          );
        } else {
          mb.addQuad(
            hubOut[row][u],
            inRing[ANCHOR_START + row][u],
            inRing[ANCHOR_START + row + 1][u],
            hubOut[row + 1][u]
          );
        }
      }
    }
  }

  if (useFlatSculptedSpider) {
    appendSculptedFlatSpider(
      mb,
      config,
      seatY,
      deckH,
      rHubOut,
      minInnerAtBottom,
      evalWall,
      draft
    );
  }

  if (isClosedPole) {
    closeTopDomePole(mb, N, outRing[M], inRing[M], shellY[M], capWallMm);
  } else {
    closeTopRimFlat(mb, N, outRing[M], inRing[M]);
  }

  // Append optional family-specific extruded solids (e.g. Organic Core + Extruded Fins/Ribbons)
  getLampFamily(config.family).appendExtraGeometry?.({
    mb,
    config,
    seatY,
    shadeHeight,
    draft,
    invertedForPendant: false,
  });

  return mb;
}

/**
 * v2.0 Optional Dual Internal Diffuser Cylinder ("Difusor Interno"):
 * Independent smooth white translucent cylinder (1.0 mm wall thickness) that seats cleanly
 * inside the Base neck bore inside the outer shade, softening bulb glare!
 * 100% watertight 2-manifold!
 */
function buildInternalDiffuser(
  config: LampConfig,
  seatY: number,
  draft: boolean
): SolidMeshBuilder {
  const mb = new SolidMeshBuilder();
  const N = draft ? 64 : 112;
  const wallT = 1.0; // Exact 1.0 mm translucent wall!
  const rNeck = getEffectiveNeckRadius(config);
  const { silhouette, mount } = config;

  // Determine safe outer radius that seats cleanly on the top of the base collar without colliding with the LED puck!
  const baseInnerBore =
    mount.type === 'led_kit_001'
      ? Math.max(getLedKit001Dimensions(mount).cavityRadiusMm + 0.5, rNeck - 1.6)
      : Math.max(getSocketE26Dimensions(mount).holeRadiusMm + 1.5, rNeck - 3.2);

  // Sample minimum inner radius along shade height so diffuser never clips the outer shade
  let minShadeIn = Infinity;
  for (let i = 0; i <= 10; i++) {
    const r = evaluateSilhouetteRadius(i / 10, silhouette) - mount.wallThickness - 4.0;
    if (r < minShadeIn) minShadeIn = r;
  }

  const rSeatOut = Math.max(18, Math.min(baseInnerBore - 0.35, minShadeIn));
  const rBodyOut = Math.max(18, Math.min(rNeck - 2.0, minShadeIn));
  const rBodyIn = Math.max(16, rBodyOut - wallT);
  const rSeatIn = Math.max(16, rSeatOut - wallT);

  const collarClearY = mount.type === 'led_kit_001' ? getCouplingHeightMm(config.base) : 0;
  const diffHeight = Math.max(50, getEffectiveShadeHeight(silhouette) * 0.86 - collarClearY);
  const yStart = seatY + collarClearY;
  const ySeatStep = yStart + 4.5;
  const yFlareEnd = ySeatStep + Math.abs(rBodyOut - rSeatOut);
  const yEnd = Math.max(ySeatStep + 12, seatY + diffHeight);

  const yLevels =
    Math.abs(rBodyOut - rSeatOut) > 0.4
      ? [yStart, ySeatStep, Math.min(yEnd - 4, yFlareEnd), yEnd]
      : [yStart, ySeatStep, yEnd];

  const rOutLevels =
    yLevels.length === 4
      ? [rSeatOut, rSeatOut, rBodyOut, rBodyOut]
      : [rSeatOut, rBodyOut, rBodyOut];

  const rInLevels =
    yLevels.length === 4
      ? [rSeatIn, rSeatIn, rBodyIn, rBodyIn]
      : [rSeatIn, rBodyIn, rBodyIn];

  const K = yLevels.length;
  const outRings: Int32Array[] = [];
  const inRings: Int32Array[] = [];

  for (let k = 0; k < K; k++) {
    const oArr = new Int32Array(N);
    const iArr = new Int32Array(N);
    for (let u = 0; u < N; u++) {
      const theta = (2 * Math.PI * u) / N;
      oArr[u] = mb.addCyl(rOutLevels[k], theta, yLevels[k], wallT);
      iArr[u] = mb.addCyl(rInLevels[k], theta, yLevels[k], wallT);
    }
    outRings.push(oArr);
    inRings.push(iArr);
  }

  for (let s = 0; s < N; s++) {
    const u0 = s;
    const u1 = (s + 1) % N;
    for (let k = 0; k < K - 1; k++) {
      mb.addQuad(outRings[k][u0], outRings[k][u1], outRings[k + 1][u1], outRings[k + 1][u0]);
      mb.addQuad(inRings[k][u0], inRings[k + 1][u0], inRings[k + 1][u1], inRings[k][u1]);
    }
    // Top rim (+Y) & bottom seating rim (-Y)
    mb.addQuad(inRings[K - 1][u0], outRings[K - 1][u0], outRings[K - 1][u1], inRings[K - 1][u1]);
    mb.addQuad(inRings[0][u0], inRings[0][u1], outRings[0][u1], outRings[0][u0]);
  }

  return mb;
}

/** Monoblock LED Kit 001 shell (with 45° internal chamfer + 45° peaked USB cord roof!). */
function buildLedKit001Monoblock(
  config: LampConfig,
  yMaxLocal: number,
  radialSegs: number,
  heightSegs: number,
  invertedForPendant: boolean,
  wantsVentilation: boolean
): SolidMeshBuilder {
  const mb = new SolidMeshBuilder();
  const { silhouette, mount } = config;
  const totalHeight = getEffectiveShadeHeight(silhouette);
  const wallT = clamp(mount.wallThickness, 1.6, 3.2);
  const evalWall = createWallEvaluator(config, invertedForPendant);

  const dim = getLedKit001Dimensions(mount);
  const hSlot = dim.usbSlotHeightMm; // 5.0 mm
  const hCavity = dim.cavityHeightMm; // 8.5 mm
  const hChamfer = dim.chamferTopMm; // 12.5 mm (45° internal chamfer!)
  const hDeck = dim.deckTopMm; // 14.5 mm
  const rCav = dim.cavityRadiusMm;
  const rHole = dim.lightHoleRadiusMm;
  const rHubOut = dim.hubOuterRadiusMm;

  const sampleBaseR = evaluateSilhouetteRadius(invertedForPendant ? 1 : 0, silhouette);
  const canVent = wantsVentilation && sampleBaseR - wallT > rHubOut + 10.0;

  const usbHalfAngle = Math.asin(clamp((dim.usbSlotWidthMm * 0.5) / rCav, 0.03, 0.42));
  const layout = buildAngularLayout(radialSegs, usbHalfAngle, mount.ventSlots, canVent);
  const { N, thetas, usbSlotSegs, isSpoke } = layout;

  const yLevels: number[] = [0, hSlot, hCavity, hDeck];
  const remainingH = Math.max(1.5, yMaxLocal - hDeck);
  const bodySegs = Math.max(4, Math.round(heightSegs * (remainingH / Math.max(totalHeight, 1))));
  for (let j = 1; j <= bodySegs; j++) {
    yLevels.push(hDeck + (remainingH * j) / bodySegs);
  }
  const M = yLevels.length - 1;
  const DECK_ROW = 3;
  const minInnerAtMount = canVent ? rHubOut + 8.0 : rCav + 0.4;

  const waveAmp = invertedForPendant ? clamp(silhouette.skirtWaveAmp || 0, 0, 15) : 0;
  const waveCount = Math.max(3, Math.min(8, Math.round(silhouette.skirtWaveCount || 5)));

  // 45° peaked gable lift across USB cord slot roof (capped safely below hCavity!)
  const gablePeak = Math.min(dim.usbSlotWidthMm * 0.5, (hCavity - hSlot) * 0.78);
  const gableLiftAtU = (u: number) =>
    u <= 0 || u >= usbSlotSegs ? 0 : (1 - Math.abs((2 * u) / usbSlotSegs - 1)) * gablePeak;

  const outRing: Int32Array[] = [];
  const inRing: Int32Array[] = [];
  const isClosedPoleMono =
    Boolean(config.silhouette.closeTopDome) &&
    !invertedForPendant &&
    yMaxLocal >= totalHeight * 0.9;
  const monoCapWall = config.family === 'organic' ? 1.2 : wallT;

  for (let row = 0; row <= M; row++) {
    const yBase = yLevels[row];
    const vRow = clamp(yBase / Math.max(totalHeight, 1), 0, 1);
    const yInOffset = isClosedPoleMono ? monoCapWall * smoothstep(0.74, 1.0, vRow) : 0;
    const rowWaveBlend = waveAmp > 0.1 ? smoothstep(0.65, 1.0, row / M) : 0;
    const oArr = new Int32Array(N).fill(-1);
    const iArr = new Int32Array(N).fill(-1);
    for (let u = 0; u < N; u++) {
      const theta = thetas[u];
      const yLift = row === 1 ? gableLiftAtU(u) : 0;
      const y = yBase + yLift + rowWaveBlend * waveAmp * (0.5 + 0.5 * Math.sin(theta * waveCount));
      const s = evalWall.sampleOuterAndInner(
        u / N,
        theta,
        yBase,
        totalHeight,
        minInnerAtMount,
        hDeck
      );
      const insideUsbInterior = u > 0 && u < usbSlotSegs;
      if (!(row === 0 && insideUsbInterior)) {
        oArr[u] = mb.addCyl(s.rOut, theta, y, s.localThickness);
      }
      if (row >= DECK_ROW) {
        iArr[u] = mb.addCyl(s.rIn, theta, Math.max(hDeck, y - yInOffset), s.localThickness);
      } else if (canVent && !(row === 0 && insideUsbInterior)) {
        iArr[u] = mb.addCyl(s.rIn, theta, y, s.localThickness);
      }
    }
    outRing.push(oArr);
    inRing.push(iArr);
  }

  const cavRow0 = new Int32Array(N).fill(-1);
  const cavRowSlot = new Int32Array(N);
  const cavRowTop = new Int32Array(N);
  const holeRowBot = new Int32Array(N);
  const holeRowTop = new Int32Array(N);
  const hubOut0 = new Int32Array(N).fill(-1);
  const hubOutSlot = new Int32Array(N).fill(-1);
  const hubOutCav = new Int32Array(N).fill(-1);
  const hubOutDeck = new Int32Array(N).fill(-1);

  for (let u = 0; u < N; u++) {
    const theta = thetas[u];
    const insideUsbInterior = u > 0 && u < usbSlotSegs;
    const ySlotU = hSlot + gableLiftAtU(u);
    if (!insideUsbInterior) cavRow0[u] = mb.addCyl(rCav, theta, 0, wallT);
    cavRowSlot[u] = mb.addCyl(rCav, theta, ySlotU, wallT);
    cavRowTop[u] = mb.addCyl(rCav, theta, hCavity, wallT);
    // 45° internal chamfer: holeRowBot sits at hChamfer (12.5 mm) instead of flat hCavity (8.5 mm)!
    holeRowBot[u] = mb.addCyl(rHole, theta, hChamfer, dim.retainerThicknessMm);
    holeRowTop[u] = mb.addCyl(rHole, theta, hDeck, dim.retainerThicknessMm);
    if (canVent) {
      if (!insideUsbInterior) hubOut0[u] = mb.addCyl(rHubOut, theta, 0, wallT);
      hubOutSlot[u] = mb.addCyl(rHubOut, theta, ySlotU, wallT);
      hubOutCav[u] = mb.addCyl(rHubOut, theta, hCavity, wallT);
      hubOutDeck[u] = mb.addCyl(rHubOut, theta, hDeck, wallT);
    }
  }

  for (let s = 0; s < N; s++) {
    const u0 = s;
    const u1 = (s + 1) % N;

    for (let row = 1; row < M; row++) {
      mb.addQuad(outRing[row][u0], outRing[row][u1], outRing[row + 1][u1], outRing[row + 1][u0]);
    }
    for (let row = DECK_ROW; row < M; row++) {
      mb.addQuad(inRing[row][u0], inRing[row + 1][u0], inRing[row + 1][u1], inRing[row][u1]);
    }

    mb.addQuad(cavRowSlot[u0], cavRowTop[u0], cavRowTop[u1], cavRowSlot[u1]);
    // 45° self-supporting internal ceiling chamfer (cavRowTop at 8.5 mm -> holeRowBot at 12.5 mm)!
    mb.addQuad(holeRowBot[u0], holeRowBot[u1], cavRowTop[u1], cavRowTop[u0]);
    mb.addQuad(holeRowBot[u0], holeRowTop[u0], holeRowTop[u1], holeRowBot[u1]);

    if (!canVent) {
      mb.addQuad(holeRowTop[u0], inRing[DECK_ROW][u0], inRing[DECK_ROW][u1], holeRowTop[u1]);
      if (s < usbSlotSegs) {
        mb.addQuad(cavRowSlot[u0], cavRowSlot[u1], outRing[1][u1], outRing[1][u0]);
      } else {
        mb.addQuad(outRing[0][u0], outRing[0][u1], outRing[1][u1], outRing[1][u0]);
        mb.addQuad(cavRow0[u0], cavRowSlot[u0], cavRowSlot[u1], cavRow0[u1]);
        mb.addQuad(cavRow0[u0], cavRow0[u1], outRing[0][u1], outRing[0][u0]);
      }
    } else {
      mb.addQuad(holeRowTop[u0], hubOutDeck[u0], hubOutDeck[u1], holeRowTop[u1]);
      if (s < usbSlotSegs) {
        mb.addQuad(hubOutDeck[u0], inRing[DECK_ROW][u0], inRing[DECK_ROW][u1], hubOutDeck[u1]);
        mb.addQuad(cavRowSlot[u0], cavRowSlot[u1], hubOutSlot[u1], hubOutSlot[u0]);
        mb.addQuad(hubOutSlot[u0], hubOutSlot[u1], inRing[1][u1], inRing[1][u0]);
        mb.addQuad(inRing[1][u0], inRing[1][u1], outRing[1][u1], outRing[1][u0]);
      } else if (isSpoke[s]) {
        mb.addQuad(outRing[0][u0], outRing[0][u1], outRing[1][u1], outRing[1][u0]);
        mb.addQuad(cavRow0[u0], cavRowSlot[u0], cavRowSlot[u1], cavRow0[u1]);
        mb.addQuad(cavRow0[u0], cavRow0[u1], hubOut0[u1], hubOut0[u0]);
        mb.addQuad(hubOut0[u0], hubOut0[u1], inRing[0][u1], inRing[0][u0]);
        mb.addQuad(inRing[0][u0], inRing[0][u1], outRing[0][u1], outRing[0][u0]);
        mb.addQuad(hubOutDeck[u0], inRing[DECK_ROW][u0], inRing[DECK_ROW][u1], hubOutDeck[u1]);
      } else {
        mb.addQuad(cavRow0[u0], cavRow0[u1], hubOut0[u1], hubOut0[u0]);
        mb.addQuad(cavRow0[u0], cavRowSlot[u0], cavRowSlot[u1], cavRow0[u1]);
        mb.addQuad(hubOut0[u0], hubOut0[u1], hubOutSlot[u1], hubOutSlot[u0]);
        mb.addQuad(hubOutSlot[u0], hubOutSlot[u1], hubOutCav[u1], hubOutCav[u0]);
        mb.addQuad(hubOutCav[u0], hubOutCav[u1], hubOutDeck[u1], hubOutDeck[u0]);
        mb.addQuad(outRing[0][u0], outRing[0][u1], outRing[1][u1], outRing[1][u0]);
        mb.addQuad(inRing[0][u0], inRing[1][u0], inRing[1][u1], inRing[0][u1]);
        mb.addQuad(inRing[1][u0], inRing[2][u0], inRing[2][u1], inRing[1][u1]);
        mb.addQuad(inRing[2][u0], inRing[3][u0], inRing[3][u1], inRing[2][u1]);
        mb.addQuad(inRing[0][u0], inRing[0][u1], outRing[0][u1], outRing[0][u0]);
      }
    }
  }

  if (!canVent) {
    mb.addQuad(cavRow0[0], cavRowSlot[0], outRing[1][0], outRing[0][0]);
    mb.addQuad(
      cavRow0[usbSlotSegs],
      outRing[0][usbSlotSegs],
      outRing[1][usbSlotSegs],
      cavRowSlot[usbSlotSegs]
    );
  } else {
    const uL = 0;
    mb.addQuad(cavRow0[uL], cavRowSlot[uL], hubOutSlot[uL], hubOut0[uL]);
    mb.addQuad(hubOut0[uL], hubOutSlot[uL], inRing[1][uL], inRing[0][uL]);
    mb.addQuad(inRing[0][uL], inRing[1][uL], outRing[1][uL], outRing[0][uL]);

    const uR = usbSlotSegs;
    mb.addQuad(cavRow0[uR], hubOut0[uR], hubOutSlot[uR], cavRowSlot[uR]);
    mb.addQuad(hubOut0[uR], inRing[0][uR], inRing[1][uR], hubOutSlot[uR]);
    mb.addQuad(inRing[0][uR], outRing[0][uR], outRing[1][uR], inRing[1][uR]);

    for (let u = 0; u < N; u++) {
      const prev = isSpoke[(u - 1 + N) % N];
      const next = isSpoke[u];
      if (prev === next) continue;
      const hCol = [hubOut0[u], hubOutSlot[u], hubOutCav[u], hubOutDeck[u]];
      const iCol = [inRing[0][u], inRing[1][u], inRing[2][u], inRing[3][u]];
      for (let r = 0; r < 3; r++) {
        if (prev === 1 && next === 0) {
          mb.addQuad(hCol[r], hCol[r + 1], iCol[r + 1], iCol[r]);
        } else {
          mb.addQuad(hCol[r], iCol[r], iCol[r + 1], hCol[r + 1]);
        }
      }
    }
  }

  if (isClosedPoleMono) {
    closeTopDomePole(mb, N, outRing[M], inRing[M], yMaxLocal, monoCapWall);
  } else {
    closeTopRimFlat(mb, N, outRing[M], inRing[M]);
  }
  if (yMaxLocal >= totalHeight * 0.5) {
    getLampFamily(config.family).appendExtraGeometry?.({
      mb,
      config,
      seatY: 0,
      shadeHeight: yMaxLocal,
      draft: radialSegs <= 112,
      invertedForPendant,
    });
  }
  return mb;
}

/** Monoblock E26/E27 shell (for single-piece or pendant lamps). */
function buildE26Monoblock(
  config: LampConfig,
  yMaxLocal: number,
  radialSegs: number,
  heightSegs: number,
  invertedForPendant: boolean
): SolidMeshBuilder {
  const mb = new SolidMeshBuilder();
  const { silhouette, mount } = config;
  const totalHeight = getEffectiveShadeHeight(silhouette);
  const wallT = clamp(mount.wallThickness, 1.6, 3.2);
  const evalWall = createWallEvaluator(config, invertedForPendant);

  const dim = getSocketE26Dimensions(mount);
  const rHole = dim.holeRadiusMm;
  const rHubOut = dim.hubOuterRadiusMm;
  const lipH = dim.lipThicknessMm;

  const sampleBaseR = evaluateSilhouetteRadius(invertedForPendant ? 1 : 0, silhouette);
  const canVent = sampleBaseR - wallT > rHubOut + 6.5;
  const layout = buildAngularLayout(radialSegs, null, dim.ventSlots, canVent);
  const { N, thetas, isSpoke } = layout;

  const yLevels: number[] = [0, lipH];
  const remainingH = Math.max(1.5, yMaxLocal - lipH);
  const bodySegs = Math.max(4, Math.round(heightSegs * (remainingH / Math.max(totalHeight, 1))));
  for (let j = 1; j <= bodySegs; j++) {
    yLevels.push(lipH + (remainingH * j) / bodySegs);
  }
  const M = yLevels.length - 1;
  const minInnerAtMount = canVent ? rHubOut + 5.5 : rHubOut + 1.0;

  const waveAmp = invertedForPendant ? clamp(silhouette.skirtWaveAmp || 0, 0, 15) : 0;
  const waveCount = Math.max(3, Math.min(8, Math.round(silhouette.skirtWaveCount || 5)));

  const outRing: Int32Array[] = [];
  const inRing: Int32Array[] = [];

  for (let row = 0; row <= M; row++) {
    const yBase = yLevels[row];
    const rowWaveBlend = waveAmp > 0.1 ? smoothstep(0.65, 1.0, row / M) : 0;
    const oArr = new Int32Array(N);
    const iArr = new Int32Array(N);
    for (let u = 0; u < N; u++) {
      const theta = thetas[u];
      const y = yBase + rowWaveBlend * waveAmp * (0.5 + 0.5 * Math.sin(theta * waveCount));
      const s = evalWall.sampleOuterAndInner(
        u / N,
        theta,
        yBase,
        totalHeight,
        minInnerAtMount,
        lipH + 2
      );
      oArr[u] = mb.addCyl(s.rOut, theta, y, s.localThickness);
      iArr[u] = mb.addCyl(s.rIn, theta, y, s.localThickness);
    }
    outRing.push(oArr);
    inRing.push(iArr);
  }

  const holeBot = new Int32Array(N);
  const holeTop = new Int32Array(N);
  const hubBot = new Int32Array(N);
  const hubTop = new Int32Array(N);

  for (let u = 0; u < N; u++) {
    const theta = thetas[u];
    holeBot[u] = mb.addCyl(rHole, theta, 0, lipH);
    holeTop[u] = mb.addCyl(rHole, theta, lipH, lipH);
    hubBot[u] = mb.addCyl(rHubOut, theta, 0, lipH);
    hubTop[u] = mb.addCyl(rHubOut, theta, lipH, lipH);
  }

  for (let s = 0; s < N; s++) {
    const u0 = s;
    const u1 = (s + 1) % N;

    for (let row = 0; row < M; row++) {
      mb.addQuad(outRing[row][u0], outRing[row][u1], outRing[row + 1][u1], outRing[row + 1][u0]);
    }
    for (let row = 1; row < M; row++) {
      mb.addQuad(inRing[row][u0], inRing[row + 1][u0], inRing[row + 1][u1], inRing[row][u1]);
    }

    mb.addQuad(holeBot[u0], holeTop[u0], holeTop[u1], holeBot[u1]);
    mb.addQuad(holeTop[u0], hubTop[u0], hubTop[u1], holeTop[u1]);
    mb.addQuad(holeBot[u0], holeBot[u1], hubBot[u1], hubBot[u0]);
    mb.addQuad(inRing[0][u0], inRing[0][u1], outRing[0][u1], outRing[0][u0]);

    if (!canVent || isSpoke[s]) {
      mb.addQuad(hubTop[u0], inRing[1][u0], inRing[1][u1], hubTop[u1]);
      mb.addQuad(hubBot[u0], hubBot[u1], inRing[0][u1], inRing[0][u0]);
    } else {
      mb.addQuad(hubBot[u0], hubBot[u1], hubTop[u1], hubTop[u0]);
      mb.addQuad(inRing[0][u0], inRing[1][u0], inRing[1][u1], inRing[0][u1]);
    }
  }

  if (canVent) {
    for (let u = 0; u < N; u++) {
      const prev = isSpoke[(u - 1 + N) % N];
      const next = isSpoke[u];
      if (prev === next) continue;
      if (prev === 1 && next === 0) {
        mb.addQuad(hubBot[u], hubTop[u], inRing[1][u], inRing[0][u]);
      } else {
        mb.addQuad(hubBot[u], inRing[0][u], inRing[1][u], hubTop[u]);
      }
    }
  }

  closeTopRimFlat(mb, N, outRing[M], inRing[M]);
  if (yMaxLocal >= totalHeight * 0.5) {
    getLampFamily(config.family).appendExtraGeometry?.({
      mb,
      config,
      seatY: 0,
      shadeHeight: yMaxLocal,
      draft: radialSegs <= 112,
      invertedForPendant,
    });
  }
  return mb;
}

/**
 * Main entry point: generates watertight 3D lamp mesh(es) (Base, Shade, optional Internal Diffuser)
 * and real-time print metrics.
 */
export function generateLampGeometry(
  config: LampConfig,
  options: BuildOptions = {}
): {
  parts: MeshPartData[];
  metrics: ReturnType<typeof aggregateMetrics>;
} {
  const t0 = performance.now();
  const draft = options.draft ?? false;
  const clipHeightMm = options.clipHeightMm;
  const doValidate = options.validateManifold ?? !draft;

  const familyDef = getLampFamily(config.family);
  const { radialSegs, heightSegs } = familyDef.getResolution(config, draft);
  const wantsVent = familyDef.wantsBottomVentilation?.(config) ?? false;

  const isPendant = config.mount.position === 'top';
  const flipY = isPendant && !options.keepMountAtBottom;

  const parts: MeshPartData[] = [];
  const partStats: Array<ReturnType<typeof finalizePartGeometry>> = [];

  if (clipHeightMm !== undefined && clipHeightMm > 0) {
    const effShadeH = getEffectiveShadeHeight(config.silhouette);
    const clippedH = Math.min(effShadeH, Math.max(15, clipHeightMm));
    const mb =
      config.silhouette.buildMode === 'two_part' && !isPendant && config.base.style !== 'tripod'
        ? buildIndependentBase(config, draft, clippedH)
        : config.mount.type === 'led_kit_001'
          ? buildLedKit001Monoblock(
              config,
              clippedH,
              radialSegs,
              Math.max(12, Math.round(heightSegs * 0.25)),
              isPendant,
              wantsVent
            )
          : buildE26Monoblock(
              config,
              clippedH,
              radialSegs,
              Math.max(12, Math.round(heightSegs * 0.25)),
              isPendant
            );

    const raw = mb.buildBuffers(undefined);
    const fin = finalizePartGeometry(
      raw.positions,
      raw.indices,
      raw.thickness,
      config.visual.overhangAngle,
      !doValidate
    );
    parts.push({
      name: 'test_base',
      role: 'base',
      positions: raw.positions,
      normals: fin.normals,
      indices: raw.indices,
      thickness: raw.thickness,
      overhang: fin.overhang,
    });
    partStats.push(fin);
  } else if (config.silhouette.buildMode === 'two_part' && !isPendant) {
    const baseMb = buildIndependentBase(config, draft);
    const baseRaw = baseMb.buildBuffers(undefined);
    const baseFin = finalizePartGeometry(
      baseRaw.positions,
      baseRaw.indices,
      baseRaw.thickness,
      config.visual.overhangAngle,
      !doValidate
    );
    parts.push({
      name: 'base',
      role: 'base',
      positions: baseRaw.positions,
      normals: baseFin.normals,
      indices: baseRaw.indices,
      thickness: baseRaw.thickness,
      overhang: baseFin.overhang,
    });
    partStats.push(baseFin);

    const seatY = getShadeSeatY(config);
    const shadeMb = buildCoupledShade(config, seatY, radialSegs, heightSegs, draft);
    const shadeRaw = shadeMb.buildBuffers(undefined);
    const shadeFin = finalizePartGeometry(
      shadeRaw.positions,
      shadeRaw.indices,
      shadeRaw.thickness,
      config.visual.overhangAngle,
      !doValidate
    );
    parts.push({
      name: 'shade',
      role: 'shade',
      positions: shadeRaw.positions,
      normals: shadeFin.normals,
      indices: shadeRaw.indices,
      thickness: shadeRaw.thickness,
      overhang: shadeFin.overhang,
    });
    partStats.push(shadeFin);

    // Optional 3rd independent solid mesh: Dual Internal Diffuser (1.0 mm smooth white translucent cylinder)
    if (config.silhouette.includeDiffuser) {
      const diffMb = buildInternalDiffuser(config, seatY, draft);
      const diffRaw = diffMb.buildBuffers(undefined);
      const diffFin = finalizePartGeometry(
        diffRaw.positions,
        diffRaw.indices,
        diffRaw.thickness,
        config.visual.overhangAngle,
        !doValidate
      );
      parts.push({
        name: 'diffuser',
        role: 'diffuser',
        positions: diffRaw.positions,
        normals: diffFin.normals,
        indices: diffRaw.indices,
        thickness: diffRaw.thickness,
        overhang: diffFin.overhang,
      });
      partStats.push(diffFin);
    }
  } else {
    const effShadeH = getEffectiveShadeHeight(config.silhouette);
    const mb =
      config.mount.type === 'led_kit_001'
        ? buildLedKit001Monoblock(
            config,
            effShadeH,
            radialSegs,
            heightSegs,
            isPendant,
            wantsVent
          )
        : buildE26Monoblock(
            config,
            effShadeH,
            radialSegs,
            heightSegs,
            isPendant
          );

    const raw = mb.buildBuffers(flipY ? effShadeH : undefined);
    const fin = finalizePartGeometry(
      raw.positions,
      raw.indices,
      raw.thickness,
      config.visual.overhangAngle,
      !doValidate
    );
    parts.push({
      name: 'lamp',
      role: 'shade',
      positions: raw.positions,
      normals: fin.normals,
      indices: raw.indices,
      thickness: raw.thickness,
      overhang: fin.overhang,
    });
    partStats.push(fin);
  }

  const generationMs = performance.now() - t0;
  const metrics = aggregateMetrics(parts, partStats, config.visual.overhangAngle, generationMs);
  return { parts, metrics };
}
