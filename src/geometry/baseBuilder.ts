import { LampConfig } from '../types/lamp';
import {
  BAYONET_DEPTH_MM,
  THREAD_DEPTH_MM,
  couplingUsesBayonet,
  evaluateMaleCouplingOffset,
  getCouplingHeightMm,
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
 * Generates a 100% watertight 2-manifold surface of revolution from a closed cross-section polygon
 * with an optional bottom cable exit slot (`widthMm x heightMm`) featuring a **45° peaked gable roof**
 * so the slot prints with ZERO sagging or supports on Bambu Lab A1!
 */
export function buildClosedRevolutionWithOptionalCordSlot(
  mb: SolidMeshBuilder,
  N: number,
  outerNodes: ProfileNode[],
  innerNodes: ProfileNode[],
  cordSlot: { widthMm: number; heightMm: number } | null
): void {
  const thetas = new Float64Array(N);
  let slotSegs = 0;

  if (cordSlot && cordSlot.widthMm > 0) {
    const rSlotRef = Math.max(15, innerNodes[innerNodes.length - 1].r);
    const halfAlpha = Math.asin(clamp((cordSlot.widthMm * 0.5) / rSlotRef, 0.03, 0.38));
    // Force EVEN slotSegs >= 4 so u = slotSegs / 2 is the exact crisp 45° gable apex!
    slotSegs = Math.max(4, Math.round((2 * halfAlpha) / ((2 * Math.PI) / N)));
    if ((slotSegs & 1) === 1) slotSegs += 1;
    if (slotSegs > Math.floor(N / 6)) {
      slotSegs = Math.max(4, Math.floor(N / 6) & ~1);
    }
    for (let u = 0; u <= slotSegs; u++) {
      thetas[u] = -halfAlpha + (2 * halfAlpha * u) / slotSegs;
    }
    const rest = N - slotSegs;
    const span = 2 * Math.PI - 2 * halfAlpha;
    for (let k = 1; k < rest; k++) {
      thetas[slotSegs + k] = halfAlpha + (span * k) / rest;
    }
  } else {
    for (let u = 0; u < N; u++) {
      thetas[u] = (2 * Math.PI * u) / N;
    }
  }

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
  inner.push({
    y: cupFloorY,
    r: rBore,
    rFn: (theta) => rWithNotch(theta, rBore),
  });

  const floorBotY = Math.max(minFloorY - 0.8, cupFloorY - led.cupFloorThicknessMm);
  if (floorBotY < cupFloorY - 0.2) {
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

  const isRibbed = base.finish === 'ribbed' && base.style !== 'tripod';
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

  // --- STYLE 1: DOME ---
  if (base.style === 'dome') {
    const domeH = Math.max(36, base.height);
    const fullTopY = domeH + couplingH;
    const maxClipY = clipHeightMm ? Math.min(fullTopY, clipHeightMm) : fullTopY;

    const rFoot = Math.max(rNeck + 10, base.footRadius);
    const rShoulder = rNeck + (base.coupling === 'gravity_seat' ? 5.5 : 4.0);

    const domeRAt = (y: number): number => {
      const t = clamp(y / domeH, 0, 1);
      const arch = Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.85)));
      return rShoulder + (rFoot - rShoulder) * arch;
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
    appendMaleCouplingNodes(outer, domeH, maxClipY);

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

    buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
      widthMm: slotW,
      heightMm: slotH,
    });
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

      buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
        widthMm: slotW,
        heightMm: slotH,
      });
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

      buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
        widthMm: slotW,
        heightMm: slotH,
      });
      return mb;
    }
  }

  // --- STYLE 3: PEDESTAL ---
  if (base.style === 'pedestal') {
    const pedH = Math.max(38, base.height);
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

    buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
      widthMm: slotW,
      heightMm: slotH,
    });
    return mb;
  }

  // --- STYLE 4: CYLINDER ---
  if (base.style === 'cylinder') {
    const drumH = Math.max(36, base.height);
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

    buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
      widthMm: slotW,
      heightMm: slotH,
    });
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

  buildClosedRevolutionWithOptionalCordSlot(mb, N, collarOuter, collarInner, null);

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
