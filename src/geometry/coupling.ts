import { BaseParams, LampConfig } from '../types/lamp';
import { getLedKit001Dimensions } from './mounts/ledKit001';
import { getSocketE26Dimensions } from './mounts/socketE26';

export const COUPLING_HEIGHT_MM = 10.5;
export const GRAVITY_STEP_HEIGHT_MM = 6.5;
export const THREAD_DEPTH_MM = 1.4;
export const BAYONET_DEPTH_MM = 1.8;

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
    const minNeck =
      base.style === 'conkel' || base.style === 'tripod'
        ? led.cavityRadiusMm + 2.6
        : Math.max(26, led.lightHoleRadiusMm + 4.5);
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
  // dome, pedestal, tripod: shade seats at top of base shoulder
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
    const halfLug = (11 * Math.PI) / 180;
    const angMask = 1 - smoothstep(halfLug - 0.03, halfLug + 0.03, Math.abs(localAng));
    const vRampUp = smoothstep(1.6, 3.6, y);
    const vRampDown = 1 - smoothstep(7.2, 8.4, y);
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
 */
export function evaluateFemaleCouplingRadius(
  rMaleBase: number,
  theta: number,
  localY: number,
  base: BaseParams
): number {
  const couplingH = getCouplingHeightMm(base);
  const y = clamp(localY, 0, couplingH);
  // Gravity seat defaults to >= 0.40 mm easy slip clearance; others use configured clearance
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

    const halfKey = (13.5 * Math.PI) / 180;
    const inKeywayAng = 1 - smoothstep(halfKey - 0.03, halfKey + 0.03, Math.abs(localAng));
    const inKeywayY = 1 - smoothstep(7.8, 8.8, y);
    const keywayMask = inKeywayAng * inKeywayY;

    const twistStart = -halfKey * 0.5;
    const twistEnd = (38 * Math.PI) / 180;
    const inTwistAng =
      smoothstep(twistStart - 0.03, twistStart + 0.03, localAng) *
      (1 - smoothstep(twistEnd - 0.03, twistEnd + 0.03, localAng));
    const inTwistY = smoothstep(2.8, 3.6, y) * (1 - smoothstep(7.4, 8.2, y));
    const twistMask = inTwistAng * inTwistY;

    const grooveDepth = Math.max(keywayMask, twistMask) * (BAYONET_DEPTH_MM + 0.25);
    return rMaleBase + clr + grooveDepth;
  }

  // 'gravity_seat', smooth 'spider', 'friction' — effortless drop-in slip bore with lead chamfer
  const entryLead = 0.35 * (1 - smoothstep(0, 1.4, y));
  return rMaleBase + clr + entryLead;
}
