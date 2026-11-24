import { LampConfig, MeshPartData } from '../types/lamp';
import { aggregateMetrics, finalizePartGeometry } from './analyzer';
import { buildIndependentBase, SolidMeshBuilder } from './baseBuilder';
import {
  BAYONET_DEPTH_MM,
  THREAD_DEPTH_MM,
  couplingUsesBayonet,
  evaluateFemaleCouplingRadius,
  getCouplingHeightMm,
  getEffectiveNeckRadius,
  getShadeSeatY,
} from './coupling';
import { getLampFamily } from './registry';
import { evaluateSilhouetteRadius, superellipseMultiplier } from './silhouette';
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
    usbSlotSegs = Math.max(2, Math.round((2 * usbHalfAngle) / ((2 * Math.PI) / N)));
    if (usbSlotSegs > Math.floor(N / 6)) usbSlotSegs = Math.floor(N / 6);
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

      let baseR = evaluateSilhouetteRadius(vDesign, silhouette);

      // Smoothly extrapolate conical flare if yLocal < 0 (hanging wavy skirt below spider ring!)
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
      const effSuperN = 2.0 + (silhouette.superellipse - 2.0) * mountCircularBlend;
      baseR *= superellipseMultiplier(theta, effSuperN);

      const bottomFade =
        yLocal < 0
          ? 1.0
          : smoothstep(
              Math.max(1.2, mountFlatBandMm * 0.25),
              mountFlatBandMm + 5.5,
              yLocal
            );

      const disp = patternEval({
        u,
        theta,
        v: vDesign,
        y: vDesign * totalHeight,
        baseRadius: baseR,
        height: totalHeight,
      });

      let rIn: number;
      let rOut: number;
      let minAllowedWall = wallT;

      if (disp.explicitWallThicknessMm !== undefined) {
        // Completely smooth continuous inner wall; only outer wall carries relief (Basketweave 0.8 -> 2.2 mm)
        rIn = baseR - wallT;
        const localWall =
          wallT * (1 - bottomFade) + disp.explicitWallThicknessMm * bottomFade;
        minAllowedWall = Math.min(wallT, Math.max(0.75, localWall));
        rOut = rIn + localWall;
      } else if (disp.uniformWallThicknessMm !== undefined) {
        // Translucent uniform thin-wall family (Japanese Flute 0.8 - 2.4 mm)
        const thinW = clamp(disp.uniformWallThicknessMm, 0.8, 3.2);
        const effWall = wallT * (1 - bottomFade) + thinW * bottomFade;
        const outerOffset = disp.outerOffset * bottomFade;
        const innerOffset = outerOffset * clamp(disp.innerFollow, 0, 1);
        rIn = baseR - effWall + innerOffset;
        rOut = baseR + outerOffset;
        minAllowedWall = Math.min(effWall, 0.78);
      } else {
        const outerOffset = disp.outerOffset * bottomFade;
        const innerOffset = outerOffset * clamp(disp.innerFollow, 0, 1);
        rIn = baseR - wallT + innerOffset;
        rOut = baseR + outerOffset;
      }

      if (yLocal >= 0 && yLocal <= mountFlatBandMm + 14) {
        const guardBlend = 1 - smoothstep(mountFlatBandMm, mountFlatBandMm + 14, yLocal);
        const minRHere = minInnerR * guardBlend + 10 * (1 - guardBlend);
        if (rIn < minRHere) rIn = minRHere;
      } else if (rIn < 10) {
        rIn = 10;
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
 * Builds the independent SHADE part for Two-Part Lamp mode!
 * Supports:
 *  - Gravity Seat ("Asiento directo"), Floating 4-Spoke 3 mm Spider ("Araña interna" with optional bayonet),
 *    Helical 3D Screw Thread ("Rosca 3D"), Bayonet ("Bayoneta ¼"), and Friction Collar!
 *  - Optional organic Wavy Bottom Skirt ("Onda en borde inferior", 0 - 15 mm, 3 - 8 waves) hanging
 *    gracefully below the internal collar/spider ring, 100% watertight 2-manifold!
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
  const shadeHeight = silhouette.height;
  const wallT = clamp(mount.wallThickness, 1.6, 3.2);
  const evalWall = createWallEvaluator(config, false);

  const isSpider = base.coupling === 'spider';
  const rMaleBase = getEffectiveNeckRadius(config);
  const extraCouplingDepth = couplingUsesBayonet(base)
    ? BAYONET_DEPTH_MM + 0.25
    : base.coupling === 'thread'
      ? THREAD_DEPTH_MM
      : 0;
  const effectiveClr =
    base.coupling === 'gravity_seat'
      ? Math.max(0.4, base.couplingClearance)
      : base.couplingClearance;
  const rHubOut =
    rMaleBase + effectiveClr + extraCouplingDepth + Math.max(2.6, wallT + 0.6);

  const deckH = 3.2; // Structural bottom flange / 4-spoke spider arm vertical thickness
  const collarH = getCouplingHeightMm(base);

  const sampleBaseR = evaluateSilhouetteRadius(0, silhouette);
  const canVent = isSpider
    ? sampleBaseR - wallT > rHubOut + 5.0
    : base.shadeVentilation && sampleBaseR - wallT > rHubOut + 8.5;

  // For Floating Spider ("Araña interna"): exact 4 slender ~3 mm radial arms!
  let spokeCount = mount.ventSlots;
  let spokeFillRatio = 0.28;
  if (isSpider) {
    spokeCount = 4;
    const midArmR = Math.max(36, (rHubOut + Math.max(rHubOut + 10, sampleBaseR)) * 0.5);
    // 4 arms each ~3.2 mm wide -> total angular fill = (4 * 3.2) / (2 * PI * midArmR)
    spokeFillRatio = clamp((4 * 3.2) / (2 * Math.PI * midArmR), 0.055, 0.16);
  }

  const layout = buildAngularLayout(radialSegs, null, spokeCount, canVent, spokeFillRatio);
  const { N, thetas, isSpoke } = layout;

  const deckSubdivs = draft ? 3 : 6;
  const upperCollarSubdivs = draft ? 8 : 16;
  const D = deckSubdivs;
  const C = deckSubdivs + upperCollarSubdivs;

  const collarY: number[] = [];
  for (let i = 0; i <= D; i++) {
    collarY.push(seatY + (deckH * i) / D);
  }
  for (let i = 1; i <= upperCollarSubdivs; i++) {
    collarY.push(seatY + deckH + ((collarH - deckH) * i) / upperCollarSubdivs);
  }

  const shellY: number[] = [];
  for (let i = 0; i <= D; i++) {
    shellY.push(collarY[i]);
  }
  const restH = Math.max(10, shadeHeight - deckH);
  const bodySegs = Math.max(12, heightSegs);
  for (let j = 1; j <= bodySegs; j++) {
    shellY.push(seatY + deckH + (restH * j) / bodySegs);
  }
  const M = shellY.length - 1;

  const minInnerAtBottom = canVent ? rHubOut + 5.5 : rHubOut + 1.2;

  // 1. Allocate outer & inner shade shell rings (rows 0 .. M)
  const outRing: Int32Array[] = [];
  const inRing: Int32Array[] = [];
  for (let row = 0; row <= M; row++) {
    const yWorld = shellY[row];
    const yLocal = yWorld - seatY;
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
      oArr[u] = mb.addCyl(s.rOut, theta, yWorld, s.localThickness);
      iArr[u] = mb.addCyl(s.rIn, theta, yWorld, s.localThickness);
    }
    outRing.push(oArr);
    inRing.push(iArr);
  }

  // 2. Optional Organic Wavy Bottom Skirt ("Onda en borde inferior / Falda", 0 - 15 mm, 3 - 8 waves)
  const waveAmp = clamp(silhouette.skirtWaveAmp || 0, 0, 15);
  const waveCount = Math.max(3, Math.min(8, Math.round(silhouette.skirtWaveCount || 5)));
  const hasWavySkirt = waveAmp > 0.15;
  const S_SKIRT = hasWavySkirt ? (draft ? 4 : 8) : 0;

  const skirtOut: Int32Array[] = [];
  const skirtIn: Int32Array[] = [];
  if (hasWavySkirt) {
    // skirtOut[0] shares exact indices with outRing[0]; skirtIn[0] shares exact indices with inRing[0]!
    skirtOut.push(outRing[0]);
    skirtIn.push(inRing[0]);
    const minSkirtDrop = 2.0; // clean solid skirt rim even at wave peaks
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
    const localY = yWorld - seatY;
    const hInArr = new Int32Array(N);
    const hOutArr = new Int32Array(N);
    for (let u = 0; u < N; u++) {
      const theta = thetas[u];
      const rInCollar = evaluateFemaleCouplingRadius(rMaleBase, theta, localY, base);
      const safeRIn = Math.min(rInCollar, rHubOut - 1.4);
      hInArr[u] = mb.addCyl(safeRIn, theta, yWorld, rHubOut - safeRIn);
      hOutArr[u] = mb.addCyl(rHubOut, theta, yWorld, rHubOut - safeRIn);
    }
    hubIn.push(hInArr);
    hubOut.push(hOutArr);
  }

  // 4. Connect all watertight faces per sector
  for (let s = 0; s < N; s++) {
    const u0 = s;
    const u1 = (s + 1) % N;

    // Shade outer wall (0 .. M)
    for (let row = 0; row < M; row++) {
      mb.addQuad(outRing[row][u0], outRing[row][u1], outRing[row + 1][u1], outRing[row + 1][u0]);
    }
    // Shade inner wall above bottom flange (D .. M)
    for (let row = D; row < M; row++) {
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
    // Female coupling hub top rim (+Y at row = C)
    mb.addQuad(hubIn[C][u0], hubOut[C][u0], hubOut[C][u1], hubIn[C][u1]);

    // Hub bottom rim (-Y at row = 0)
    mb.addQuad(hubIn[0][u0], hubIn[0][u1], hubOut[0][u1], hubOut[0][u0]);

    // Outer shell bottom closing: either flat at row = 0 OR extended downward into the Wavy Skirt!
    if (!hasWavySkirt) {
      mb.addQuad(inRing[0][u0], inRing[0][u1], outRing[0][u1], outRing[0][u0]);
    } else {
      for (let k = 0; k < S_SKIRT; k++) {
        // Outer skirt descending: skirtOut[k+1] is BELOW skirtOut[k], so outward CCW is (k+1, u0) -> (k+1, u1) -> (k, u1) -> (k, u0)
        mb.addQuad(
          skirtOut[k + 1][u0],
          skirtOut[k + 1][u1],
          skirtOut[k][u1],
          skirtOut[k][u0]
        );
        // Inner skirt descending (inward facing)
        mb.addQuad(
          skirtIn[k + 1][u0],
          skirtIn[k][u0],
          skirtIn[k][u1],
          skirtIn[k + 1][u1]
        );
      }
      // Close bottom wavy edge (-Y) at row = S_SKIRT
      mb.addQuad(
        skirtIn[S_SKIRT][u0],
        skirtIn[S_SKIRT][u1],
        skirtOut[S_SKIRT][u1],
        skirtOut[S_SKIRT][u0]
      );
    }

    if (!canVent || isSpoke[s]) {
      // Solid spoke / spider arm / flange bridging hubOut <-> inRing
      mb.addQuad(hubOut[D][u0], inRing[D][u0], inRing[D][u1], hubOut[D][u1]);
      mb.addQuad(hubOut[0][u0], hubOut[0][u1], inRing[0][u1], inRing[0][u0]);
    } else {
      // Open radial ventilation window / spider opening!
      for (let row = 0; row < D; row++) {
        mb.addQuad(hubOut[row][u0], hubOut[row][u1], hubOut[row + 1][u1], hubOut[row + 1][u0]);
        mb.addQuad(inRing[row][u0], inRing[row + 1][u0], inRing[row + 1][u1], inRing[row][u1]);
      }
    }
  }

  // 5. Vertical side walls closing every spoke / spider arm boundary
  if (canVent) {
    for (let u = 0; u < N; u++) {
      const prev = isSpoke[(u - 1 + N) % N];
      const next = isSpoke[u];
      if (prev === next) continue;
      for (let row = 0; row < D; row++) {
        if (prev === 1 && next === 0) {
          mb.addQuad(hubOut[row][u], hubOut[row + 1][u], inRing[row + 1][u], inRing[row][u]);
        } else {
          mb.addQuad(hubOut[row][u], inRing[row][u], inRing[row + 1][u], hubOut[row + 1][u]);
        }
      }
    }
  }

  closeTopRimFlat(mb, N, outRing[M], inRing[M]);
  return mb;
}

/** Monoblock LED Kit 001 shell (for single-piece or pendant lamps). */
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
  const totalHeight = silhouette.height;
  const wallT = clamp(mount.wallThickness, 1.6, 3.2);
  const evalWall = createWallEvaluator(config, invertedForPendant);

  const dim = getLedKit001Dimensions(mount);
  const hSlot = dim.usbSlotHeightMm;
  const hCavity = dim.cavityHeightMm;
  const hDeck = dim.deckTopMm;
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

  // Optional wavy open rim for Pendant mode (`invertedForPendant === true` => open rim is at row M!)
  const waveAmp = invertedForPendant ? clamp(silhouette.skirtWaveAmp || 0, 0, 15) : 0;
  const waveCount = Math.max(3, Math.min(8, Math.round(silhouette.skirtWaveCount || 5)));

  const outRing: Int32Array[] = [];
  const inRing: Int32Array[] = [];

  for (let row = 0; row <= M; row++) {
    const yBase = yLevels[row];
    const rowWaveBlend = waveAmp > 0.1 ? smoothstep(0.65, 1.0, row / M) : 0;
    const oArr = new Int32Array(N).fill(-1);
    const iArr = new Int32Array(N).fill(-1);
    for (let u = 0; u < N; u++) {
      const theta = thetas[u];
      const y = yBase + rowWaveBlend * waveAmp * (0.5 + 0.5 * Math.sin(theta * waveCount));
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
        iArr[u] = mb.addCyl(s.rIn, theta, y, s.localThickness);
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
    if (!insideUsbInterior) cavRow0[u] = mb.addCyl(rCav, theta, 0, wallT);
    cavRowSlot[u] = mb.addCyl(rCav, theta, hSlot, wallT);
    cavRowTop[u] = mb.addCyl(rCav, theta, hCavity, wallT);
    holeRowBot[u] = mb.addCyl(rHole, theta, hCavity, dim.retainerThicknessMm);
    holeRowTop[u] = mb.addCyl(rHole, theta, hDeck, dim.retainerThicknessMm);
    if (canVent) {
      if (!insideUsbInterior) hubOut0[u] = mb.addCyl(rHubOut, theta, 0, wallT);
      hubOutSlot[u] = mb.addCyl(rHubOut, theta, hSlot, wallT);
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

  closeTopRimFlat(mb, N, outRing[M], inRing[M]);
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
  const totalHeight = silhouette.height;
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
  return mb;
}

/**
 * Main entry point: generates watertight 3D lamp mesh(es) and real-time print metrics.
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
    const clippedH = Math.min(config.silhouette.height, Math.max(12, clipHeightMm));
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
  } else {
    const mb =
      config.mount.type === 'led_kit_001'
        ? buildLedKit001Monoblock(
            config,
            config.silhouette.height,
            radialSegs,
            heightSegs,
            isPendant,
            wantsVent
          )
        : buildE26Monoblock(
            config,
            config.silhouette.height,
            radialSegs,
            heightSegs,
            isPendant
          );

    const raw = mb.buildBuffers(flipY ? config.silhouette.height : undefined);
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
