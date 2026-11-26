import { BaseParams, LampConfig } from '../types/lamp';
import { getLedKit001Dimensions } from './mounts/ledKit001';
import { getSocketE26Dimensions } from './mounts/socketE26';

export const COUPLING_HEIGHT_MM = 10.5;
export const GRAVITY_STEP_HEIGHT_MM = 6.5;
export const THREAD_DEPTH_MM = 1.4;
export const BAYONET_DEPTH_MM = 1.8;

/**
 * Bayonet vertical geometry constants (mm, localY from collar bottom = 0):
 *  - Male lug lives strictly inside y ∈ [2.2, 7.2] (45° print chamfer up 2.2..3.6, plateau 3.6..6.4, down 6.4..7.2)
 *  - Female twist channel opens generously across y ∈ [1.2, 8.6] (full depth from 2.0..7.6)
 *    guaranteeing >= 0.4 mm vertical clearance BOTH above and below the male lug across the entire 38° rotation!
 */
export const BAYONET_MALE_Y_START = 2.2;
export const BAYONET_MALE_Y_END = 7.2;
export const BAYONET_FEMALE_TWIST_Y_LOW = 1.2;
export const BAYONET_FEMALE_TWIST_Y_HIGH = 8.6;
export const BAYONET_TWIST_END_DEG = 38;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Whether the current coupling uses bayonet locking lugs (either direct Bayonet or Spider+Bayonet). */
export function couplingUsesBayonet(base: BaseParams): boolean {
  return base.coupling === 'bayonet' || (base.coupling === 'spider' && base.spiderBayonet);
}

/** Active vertical engagement height of the Base-to-Shade coupling collar. */
export function getCouplingHeightMm(base: BaseParams): number {
  return base.coupling === 'gravity_seat' ? GRAVITY_STEP_HEIGHT_MM : COUPLING_HEIGHT_MM;
}

/**
 * Computes safe effective coupling neck radius (mm) so the Base collar always cleanly
 * encloses the selected hardware (LED Lamp Kit 001 or E26/E27 socket).
 */
export function getEffectiveNeckRadius(config: LampConfig): number {
  const { mount, base } = config;
  if (mount.type === 'led_kit_001') {
    const led = getLedKit001Dimensions(mount);
    // Upper LED Kit 001 cup sits right at the top of the base collar -> ensure solid >= 2.6 mm collar wall
    const minNeck = led.cavityRadiusMm + 2.6;
    return Math.max(minNeck, base.neckRadius);
  } else {
    const e26 = getSocketE26Dimensions(mount);
    const minNeck = e26.holeRadiusMm + 8.0;
    return Math.max(minNeck, base.neckRadius);
  }
}

/**
 * Computes the height (mm) at which the Shade's seating reference rests on top of the Base.
 */
export function getShadeSeatY(config: LampConfig): number {
  const { base, mount } = config;
  if (base.style === 'conkel') {
    return mount.type === 'led_kit_001' ? 11.2 : 8.0;
  }
  if (base.style === 'cylinder') {
    return base.height + base.collarRevealMm;
  }
  return base.height;
}

/** Trapezoidal 45°-flank printable coarse screw thread profile in [0, 1]. */
function threadWave(phaseRaw: number): number {
  const p = ((phaseRaw % 1) + 1) % 1;
  if (p < 0.15) return 0;
  if (p < 0.42) return (p - 0.15) / 0.27;
  if (p < 0.58) return 1;
  if (p < 0.85) return 1 - (p - 0.58) / 0.27;
  return 0;
}

/**
 * Evaluates male coupling radial offset (mm) on the Base collar for localY in [0, couplingH].
 */
export function evaluateMaleCouplingOffset(
  theta: number,
  localY: number,
  base: BaseParams
): number {
  const couplingH = getCouplingHeightMm(base);
  const y = clamp(localY, 0, couplingH);

  if (base.coupling === 'thread') {
    const pitch = clamp(base.threadPitch, 3.2, 5.5);
    const fadeIn = smoothstep(0.4, 1.8, y);
    const fadeOut = 1 - smoothstep(couplingH - 1.8, couplingH - 0.3, y);
    const phase = (y - 0.5) / pitch - theta / (2 * Math.PI);
    return THREAD_DEPTH_MM * threadWave(phase) * fadeIn * fadeOut;
  }

  if (couplingUsesBayonet(base)) {
    const lugs = Math.max(3, Math.min(4, Math.round(base.bayonetLugs)));
    const period = (2 * Math.PI) / lugs;
    const normTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const localAng = ((normTheta + period * 0.5) % period) - period * 0.5;
    const halfLug = (10.5 * Math.PI) / 180;
    const angMask = 1 - smoothstep(halfLug - 0.025, halfLug + 0.025, Math.abs(localAng));
    // 45° support-free bottom ramp (2.2..3.6), plateau (3.6..6.4), clean top taper (6.4..7.2)
    const vRampUp = smoothstep(BAYONET_MALE_Y_START, 3.6, y);
    const vRampDown = 1 - smoothstep(6.4, BAYONET_MALE_Y_END, y);
    return BAYONET_DEPTH_MM * angMask * vRampUp * vRampDown;
  }

  // 'gravity_seat', 'spider' (smooth), 'friction' — gentle lead-in chamfer at top
  if (y > couplingH - 1.8) {
    return -0.35 * smoothstep(couplingH - 1.8, couplingH, y);
  }
  return 0;
}

/**
 * Evaluates matching female coupling inner bore radius (mm) inside the Shade's mounting collar
 * for localY in [0, couplingH].
 * Includes:
 *  - >= 0.4 mm vertical clearance above & below male bayonet lug (inTwistY opens 1.2..2.0 up to 7.6..8.6 mm)
 *  - Tactile snap detent bump just before the 38° lock stop (at 30°..34°) so the bayonet clicks securely!
 */
export function evaluateFemaleCouplingRadius(
  rMaleBase: number,
  theta: number,
  localY: number,
  base: BaseParams
): number {
  const couplingH = getCouplingHeightMm(base);
  const y = clamp(localY, 0, couplingH);
  const clr =
    base.coupling === 'gravity_seat'
      ? Math.max(0.4, clamp(base.couplingClearance, 0.2, 0.65))
      : clamp(base.couplingClearance, 0.15, 0.65);

  if (base.coupling === 'thread') {
    const maleOff = evaluateMaleCouplingOffset(theta, y, base);
    const entryLead = 0.45 * (1 - smoothstep(0, 1.2, y));
    return rMaleBase + clr + maleOff + entryLead;
  }

  if (couplingUsesBayonet(base)) {
    const lugs = Math.max(3, Math.min(4, Math.round(base.bayonetLugs)));
    const period = (2 * Math.PI) / lugs;
    const normTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const localAng = ((normTheta + period * 0.5) % period) - period * 0.5;

    // 1. Vertical entry keyway from y = 0..8.8 (wider than male lug: ±13.5°)
    const halfKey = (13.5 * Math.PI) / 180;
    const inKeywayAng = 1 - smoothstep(halfKey - 0.025, halfKey + 0.025, Math.abs(localAng));
    const inKeywayY = 1 - smoothstep(8.2, 9.0, y);
    const keywayMask = inKeywayAng * inKeywayY;

    // 2. Horizontal twist channel extending from keyway to 38° (+ half lug margin so lug seats fully at 38°)
    const twistStart = -halfKey * 0.5;
    const twistEnd = ((BAYONET_TWIST_END_DEG + 11.5) * Math.PI) / 180;
    const inTwistAng =
      smoothstep(twistStart - 0.025, twistStart + 0.025, localAng) *
      (1 - smoothstep(twistEnd - 0.025, twistEnd + 0.025, localAng));

    // Generous vertical opening: 1.2..2.0 mm bottom ramp -> 7.6..8.6 mm top ramp (>= 0.4 mm free above & below male lug!)
    const inTwistY =
      smoothstep(BAYONET_FEMALE_TWIST_Y_LOW, 2.0, y) *
      (1 - smoothstep(7.6, BAYONET_FEMALE_TWIST_Y_HIGH, y));

    const twistMask = inTwistAng * inTwistY;

    // 3. Subtle tactile snap detent ridge at 29°..33° (gentle 0.30 mm radial pinch before the 38° locked stop pocket!)
    const detentCenter = (31 * Math.PI) / 180;
    const detentHalf = (2.2 * Math.PI) / 180;
    const detentAng = 1 - smoothstep(0, detentHalf, Math.abs(localAng - detentCenter));
    const detentBumpMm = 0.28 * detentAng * twistMask;

    const grooveDepth = Math.max(keywayMask, twistMask) * (BAYONET_DEPTH_MM + 0.35) - detentBumpMm;
    return rMaleBase + clr + Math.max(0, grooveDepth);
  }

  // 'gravity_seat', smooth 'spider', 'friction' — effortless drop-in slip bore with lead chamfer
  const entryLead = 0.35 * (1 - smoothstep(0, 1.4, y));
  return rMaleBase + clr + entryLead;
}
