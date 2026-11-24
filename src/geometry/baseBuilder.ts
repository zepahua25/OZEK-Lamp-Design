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

/** Standard straight bottom cable exit slot: 6.5 mm wide x 5.0 mm high for flat/braided lamp cord & USB */
export const BASE_CORD_SLOT_WIDTH_MM = 6.5;
export const BASE_CORD_SLOT_HEIGHT_MM = 5.0;

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

interface ProfileNode {
  y: number;
  r: number;
  /** Optional angular radius modulation (for fine base ribs, male screw thread, or bayonet lugs) */
  rFn?: (theta: number) => number;
}

/**
 * Generates a 100% watertight 2-manifold surface of revolution from a closed cross-section polygon
 * with an optional straight bottom cable exit slot (`widthMm x heightMm`).
 */
function buildClosedRevolutionWithOptionalCordSlot(
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
    slotSegs = Math.max(2, Math.round((2 * halfAlpha) / ((2 * Math.PI) / N)));
    if (slotSegs > Math.floor(N / 6)) slotSegs = Math.floor(N / 6);
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

  const outRings: Int32Array[] = [];
  for (let k = 0; k < L_out; k++) {
    const node = outerNodes[k];
    const arr = new Int32Array(N).fill(-1);
    for (let u = 0; u < N; u++) {
      if (k === 0 && u > 0 && u < slotSegs) continue;
      const theta = thetas[u];
      const r = node.rFn ? node.rFn(theta) : node.r;
      arr[u] = mb.addCyl(r, theta, node.y, 4.0);
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
      arr[u] = mb.addCyl(r, theta, node.y, 4.0);
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
 * Generates an independent, 100% watertight 2-manifold Base mesh for Two-Part Lamp mode.
 * Supports 5 architectural Base silhouettes:
 *  - dome (Smooth architectural dome — height 40-90 mm, Ø90-160 mm)
 *  - pedestal (Conical UMINO tower)
 *  - cylinder (Minimalist concrete drum + optional floating reveal neck)
 *  - conkel (Flowalistik raised E27 socket cone + flange / low LED disk)
 *  - tripod (UMINO S011 3-leg sculptural collar stand)
 * Supports Smooth OR Finely Ribbed (40-100 flutes) base finish!
 * Always includes 6.5 x 5.0 mm straight bottom cord slot, wide E26/E27 underside cavity + 3.5 mm / 40.5 mm top ceiling,
 * OR exact Bambu LED Kit 001 (59.5 x 8.5 mm) cavity!
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

  // Subtle fine vertical ribbing helper for Base body (fades cleanly at bottom & top shoulder)
  const makeRibbedNode = (
    y: number,
    rBase: number,
    yFadeStart: number,
    yFadeEnd: number
  ): ProfileNode => {
    if (!isRibbed) return { y, r: rBase };
    const env =
      smoothstep(yFadeStart, yFadeStart + 4.5, y) *
      (1 - smoothstep(yFadeEnd - 4.0, yFadeEnd, y));
    if (env <= 0.005) return { y, r: rBase };
    const ribAmp = 1.25 * env;
    return {
      y,
      r: rBase,
      rFn: (theta: number) => rBase + ribAmp * (0.5 + 0.5 * Math.cos(theta * ribCount)),
    };
  };

  // Appends the male coupling collar [yStart .. yStart + couplingH]
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

  // --- STYLE 1: DOME (Smooth Architectural Dome Base, H 40-90 mm, Ø90-160 mm) ---
  if (base.style === 'dome') {
    const domeH = Math.max(36, base.height);
    const fullTopY = domeH + couplingH;
    const maxClipY = clipHeightMm ? Math.min(fullTopY, clipHeightMm) : fullTopY;

    const rFoot = Math.max(rNeck + 10, base.footRadius);
    const rShoulder = rNeck + (base.coupling === 'gravity_seat' ? 5.5 : 4.0);

    // Smooth dome curve R(t) for t in [0, 1]: gentle bulbous belly curving smoothly into top shoulder
    const domeRAt = (y: number): number => {
      const t = clamp(y / domeH, 0, 1);
      // Elliptical arch from rFoot -> rShoulder with subtle lower rounding
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
      const inner: ProfileNode[] = isLed
        ? [
            { y: maxClipY, r: led.lightHoleRadiusMm },
            { y: Math.min(led.cavityHeightMm, maxClipY - 2), r: led.lightHoleRadiusMm },
            { y: Math.min(led.cavityHeightMm, maxClipY - 2), r: led.cavityRadiusMm },
            { y: slotH, r: led.cavityRadiusMm },
            { y: 0, r: led.cavityRadiusMm },
          ]
        : [
            { y: maxClipY, r: e26.holeRadiusMm },
            { y: Math.max(slotH + 1, maxClipY - e26CeilingThick), r: e26.holeRadiusMm },
            { y: Math.max(slotH + 1, maxClipY - e26CeilingThick), r: rCav },
            { y: slotH, r: rCav },
            { y: 0, r: rCav },
          ];
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
    for (let i = 1; i <= domeSegs; i++) {
      const y = slotH + ((domeH - slotH) * i) / domeSegs;
      outer.push(makeRibbedNode(y, domeRAt(y), slotH, domeH));
    }
    appendMaleCouplingNodes(outer, domeH, maxClipY);

    // Interior: wide spacious cavity under dome + 3.5 mm top ceiling with 40.5 mm E26 hole, OR LED Kit 001 bottom pocket!
    const inner: ProfileNode[] = [];
    if (isLed) {
      // LED Kit 001 cavity at bottom (connected directly to 6.5x5mm USB slot!) + smooth light bore up through dome
      inner.push({ y: maxClipY, r: Math.max(led.lightHoleRadiusMm, rNeck - 3.2) });
      inner.push({ y: domeH, r: led.lightHoleRadiusMm });
      inner.push({ y: led.cavityHeightMm, r: led.lightHoleRadiusMm });
      inner.push({ y: led.cavityHeightMm, r: led.cavityRadiusMm });
      inner.push({ y: slotH, r: led.cavityRadiusMm });
      inner.push({ y: 0, r: led.cavityRadiusMm });
    } else {
      // E26/E27: solid 3.5 mm top ceiling with central Ø40.5 mm hole + wide hollow dome cavity underneath to insert socket from below!
      const ceilingBotY = domeH - e26CeilingThick;
      inner.push({ y: maxClipY, r: Math.max(e26.holeRadiusMm + 1.5, rNeck - 3.2) });
      inner.push({ y: domeH, r: e26.holeRadiusMm });
      inner.push({ y: ceilingBotY, r: e26.holeRadiusMm });
      // Wide hollow cavity following the inside of the dome (3.8 mm shell wall)
      const cavSegs = 6;
      for (let i = cavSegs; i >= 1; i--) {
        const y = slotH + ((ceilingBotY - slotH) * i) / cavSegs;
        const rInHere = Math.max(e26.holeRadiusMm + 3.0, domeRAt(y) - 4.0);
        inner.push({ y, r: rInHere });
      }
      const rBotCav = Math.max(e26.holeRadiusMm + 6.0, rFoot - 4.5);
      inner.push({ y: slotH, r: rBotCav });
      inner.push({ y: 0, r: rBotCav });
    }

    buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
      widthMm: slotW,
      heightMm: slotH,
    });
    return mb;
  }

  // --- STYLE 2: CONKEL (Flowalistik Raised E27 Cone + Flange / Low LED Disk) ---
  if (base.style === 'conkel') {
    const flangeH = seatY;
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

      const rInnerNeck = Math.max(led.lightHoleRadiusMm, rNeck - 3.2);
      const inner: ProfileNode[] = [
        { y: maxClipY, r: rInnerNeck },
        { y: Math.min(flangeH, maxClipY), r: led.lightHoleRadiusMm },
        { y: Math.min(led.cavityHeightMm, maxClipY - 0.5), r: led.lightHoleRadiusMm },
        { y: Math.min(led.cavityHeightMm, maxClipY - 0.5), r: led.cavityRadiusMm },
        { y: slotH, r: led.cavityRadiusMm },
        { y: 0, r: led.cavityRadiusMm },
      ];

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

      const inner: ProfileNode[] =
        maxClipY > couplingEndY + 4.0
          ? [
              { y: maxClipY, r: e26.holeRadiusMm },
              { y: maxClipY - e26CeilingThick, r: e26.holeRadiusMm },
              { y: maxClipY - e26CeilingThick, r: Math.max(e26.holeRadiusMm + 2.5, rConeTopOut - 3.0) },
              { y: slotH, r: rConeInnerWall },
              { y: 0, r: rConeInnerWall },
            ]
          : [
              { y: maxClipY, r: e26.holeRadiusMm },
              { y: Math.max(slotH + 0.5, maxClipY - e26CeilingThick), r: e26.holeRadiusMm },
              { y: Math.max(slotH + 0.5, maxClipY - e26CeilingThick), r: rConeInnerWall },
              { y: slotH, r: rConeInnerWall },
              { y: 0, r: rConeInnerWall },
            ];

      buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
        widthMm: slotW,
        heightMm: slotH,
      });
      return mb;
    }
  }

  // --- STYLE 3: PEDESTAL (Conical Base, H 40-120 mm, smooth or fine ribbed) ---
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
      const inner: ProfileNode[] = isLed
        ? [
            { y: maxClipY, r: led.lightHoleRadiusMm },
            { y: Math.min(led.cavityHeightMm, maxClipY - 2), r: led.lightHoleRadiusMm },
            { y: Math.min(led.cavityHeightMm, maxClipY - 2), r: led.cavityRadiusMm },
            { y: slotH, r: led.cavityRadiusMm },
            { y: 0, r: led.cavityRadiusMm },
          ]
        : [
            { y: maxClipY, r: e26.holeRadiusMm },
            { y: Math.max(slotH + 1, maxClipY - e26CeilingThick), r: e26.holeRadiusMm },
            { y: Math.max(slotH + 1, maxClipY - e26CeilingThick), r: rIn },
            { y: slotH, r: rIn },
            { y: 0, r: rIn },
          ];
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
    for (let i = 1; i <= bodySegs; i++) {
      const y = slotH + ((pedH - slotH) * i) / bodySegs;
      outer.push(makeRibbedNode(y, coneRAt(y), slotH, pedH));
    }
    appendMaleCouplingNodes(outer, pedH, maxClipY);

    const inner: ProfileNode[] = isLed
      ? [
          { y: maxClipY, r: Math.max(led.lightHoleRadiusMm, rNeck - 3.2) },
          { y: pedH, r: led.lightHoleRadiusMm },
          { y: led.cavityHeightMm, r: led.lightHoleRadiusMm },
          { y: led.cavityHeightMm, r: led.cavityRadiusMm },
          { y: slotH, r: led.cavityRadiusMm },
          { y: 0, r: led.cavityRadiusMm },
        ]
      : [
          { y: maxClipY, r: Math.max(e26.holeRadiusMm + 1.5, rNeck - 3.2) },
          { y: pedH, r: e26.holeRadiusMm },
          { y: pedH - e26CeilingThick, r: e26.holeRadiusMm },
          { y: pedH - e26CeilingThick, r: Math.max(e26.holeRadiusMm + 3.0, rShoulder - 4.0) },
          { y: slotH, r: Math.max(e26.holeRadiusMm + 6.0, rFoot - 4.5) },
          { y: 0, r: Math.max(e26.holeRadiusMm + 6.0, rFoot - 4.5) },
        ];

    buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
      widthMm: slotW,
      heightMm: slotH,
    });
    return mb;
  }

  // --- STYLE 4: CYLINDER (Minimalist Cylindrical Base, smooth or fine ribbed) ---
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
      const inner: ProfileNode[] = isLed
        ? [
            { y: maxClipY, r: led.lightHoleRadiusMm },
            { y: Math.min(led.cavityHeightMm, maxClipY - 2), r: led.lightHoleRadiusMm },
            { y: Math.min(led.cavityHeightMm, maxClipY - 2), r: led.cavityRadiusMm },
            { y: slotH, r: led.cavityRadiusMm },
            { y: 0, r: led.cavityRadiusMm },
          ]
        : [
            { y: maxClipY, r: e26.holeRadiusMm },
            { y: Math.max(slotH + 1, maxClipY - e26CeilingThick), r: e26.holeRadiusMm },
            { y: Math.max(slotH + 1, maxClipY - e26CeilingThick), r: rIn },
            { y: slotH, r: rIn },
            { y: 0, r: rIn },
          ];
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
    for (let i = 1; i <= bodySegs; i++) {
      const y = slotH + ((drumH - 1.2 - slotH) * i) / bodySegs;
      outer.push(makeRibbedNode(y, rDrum, slotH, drumH));
    }
    outer.push({ y: drumH, r: rDrum - 1.2 });

    if (revealH > 0.5) {
      outer.push({ y: drumH, r: rNeck + 1.8 });
      outer.push({ y: drumH + revealH, r: rNeck + 1.8 });
    }
    appendMaleCouplingNodes(outer, drumH + revealH, maxClipY);

    const rDrumCav = Math.max(e26.holeRadiusMm + 6.0, rDrum - 4.5);
    const topDeckY = drumH + revealH;
    const inner: ProfileNode[] = isLed
      ? [
          { y: maxClipY, r: Math.max(led.lightHoleRadiusMm, rNeck - 3.2) },
          { y: topDeckY, r: led.lightHoleRadiusMm },
          { y: led.cavityHeightMm, r: led.lightHoleRadiusMm },
          { y: led.cavityHeightMm, r: led.cavityRadiusMm },
          { y: slotH, r: led.cavityRadiusMm },
          { y: 0, r: led.cavityRadiusMm },
        ]
      : [
          { y: maxClipY, r: Math.max(e26.holeRadiusMm + 1.5, rNeck - 3.2) },
          { y: topDeckY, r: e26.holeRadiusMm },
          { y: topDeckY - e26CeilingThick, r: e26.holeRadiusMm },
          { y: topDeckY - e26CeilingThick, r: rDrumCav },
          { y: slotH, r: rDrumCav },
          { y: 0, r: rDrumCav },
        ];

    buildClosedRevolutionWithOptionalCordSlot(mb, N, outer, inner, {
      widthMm: slotW,
      heightMm: slotH,
    });
    return mb;
  }

  // --- STYLE 5: TRIPOD (UMINO S011 Sculptural 3-Leg Stand) ---
  const ringTopY = Math.max(55, base.height);
  const ringThickH = 14.0;
  const ringBotY = ringTopY - ringThickH;
  const fullTopY = ringTopY + couplingH;
  const maxClipY = clipHeightMm ? Math.min(fullTopY, clipHeightMm) : fullTopY;

  const rCollarOut = rNeck + 5.5;
  const rInnerHole = isLed ? led.lightHoleRadiusMm : e26.holeRadiusMm;

  const collarOuter: ProfileNode[] = [
    { y: ringBotY, r: rCollarOut - 0.8 },
    { y: ringBotY + 1.0, r: rCollarOut },
    { y: ringTopY - 0.8, r: rCollarOut },
    { y: ringTopY, r: rCollarOut - 0.8 },
  ];
  appendMaleCouplingNodes(collarOuter, ringTopY, maxClipY);

  const collarInner: ProfileNode[] = isLed
    ? [
        { y: maxClipY, r: Math.max(rInnerHole, rNeck - 3.0) },
        { y: ringTopY, r: rInnerHole },
        { y: ringBotY + led.cavityHeightMm, r: rInnerHole },
        { y: ringBotY + led.cavityHeightMm, r: led.cavityRadiusMm },
        { y: ringBotY, r: led.cavityRadiusMm },
      ]
    : [
        { y: maxClipY, r: rInnerHole },
        { y: maxClipY - e26CeilingThick, r: rInnerHole },
        { y: maxClipY - e26CeilingThick, r: rInnerHole + 3.5 },
        { y: ringBotY, r: rInnerHole + 3.5 },
      ];

  buildClosedRevolutionWithOptionalCordSlot(mb, N, collarOuter, collarInner, null);

  const legSpreadR = Math.max(rCollarOut + 14, base.footRadius);
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3 + Math.PI / 6;
    addWatertightTripodLeg(
      mb,
      angle,
      ringTopY - 1.5,
      rCollarOut - 1.5,
      legSpreadR,
      11.0,
      7.5,
      12.0,
      8.0
    );
  }

  return mb;
}
