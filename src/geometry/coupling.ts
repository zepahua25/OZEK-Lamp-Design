import { BaseParams, LampConfig } from '../types/lamp';
import { getLedKit001Dimensions } from './mounts/ledKit001';
import { getSocketE26Dimensions } from './mounts/socketE26';

export const COUPLING_HEIGHT_MM = 10.5;
export const GRAVITY_STEP_HEIGHT_MM = 6.5;
export const THREAD_DEPTH_MM = 1.4;
export const BAYONET_DEPTH_MM = 1.8;

/**
 * Compact Flush LED Kit 001 Housing ("Compacta / Al ras"):
 *  - Outer base rim Ø 75.0 mm (r = 37.50 mm) × 15.0 mm total height, flush with Z = 0
 *  - Lower rim y ∈ [0, 5.5], upper bayonet collar Ø 73.5 mm (r = 36.75 mm) y ∈ [5.5, 15.0]
 *  - 3 locking lugs protruding 1.5 mm radially at 60°, 180°, 300° (clear of rear USB slot at 0°)
 *  - Shade sits at seatY = 0 (100% flush on the table) with female bore Ø 74.2 mm (+0.35 mm radial clearance)
 */
export const COMPACT_FLUSH_HEIGHT_MM = 15.0;
export const COMPACT_FLUSH_OUTER_RADIUS_MM = 37.5;
export const COMPACT_FLUSH_RIM_HEIGHT_MM = 5.5;
export const COMPACT_FLUSH_COLLAR_RADIUS_MM = 36.75;
export const COMPACT_FLUSH_LUG_DEPTH_MM = 1.5;
export const COMPACT_FLUSH_LUG_Y_START = 7.3;
export const COMPACT_FLUSH_LUG_Y_END = 12.3;
export const COMPACT_FLUSH_TWIST_Y_LOW = 6.1;
export const COMPACT_FLUSH_TWIST_Y_HIGH = 13.8;

/**
 * Slender E26/E27 direct-nut neck ("Cuello Esbelto E26/E27", OMOI 01):
 *  - Hollow cylindrical stem Ø 17.0 mm outer (r = 8.5 mm) / Ø 9.0 mm cable bore (r = 4.5 mm), default 16 mm tall
 *  - 45° self-supporting flare strictly up to the compact E26/E27 socket ring: Ø 46.0 mm outer (r = 23.0 mm) / Ø 40.5 mm inner hole
 *  - Shade flat Z=0 spider closes to a Ø 40.8 mm central ring (r = 20.4 mm) clamped directly by the E26/E27 threaded nut!
 */
export const DOME_STEM_OUTER_RADIUS_MM = 8.5; // Ø 17.0 mm exterior
export const DOME_STEM_INNER_RADIUS_MM = 4.5; // Ø 9.0 mm cable bore
export const SLENDER_E26_SOCKET_OUTER_RADIUS_MM = 23.0; // Ø 46.0 mm compact E26/E27 socket ring outer
export const SLENDER_E26_RING_HEIGHT_MM = 3.5; // 3.5 mm flat E26/E27 seating ring (0% supports)
export const SLENDER_E26_SHADE_BORE_RADIUS_MM = 20.4; // Ø 40.8 mm spider inner ring clamped by E26 nut
export const SLENDER_E26_SHADE_HUB_OUTER_RADIUS_MM = 24.4; // Ø 48.8 mm spider hub outer (4.0 mm solid clamping flange)

/**
 * 3-Piece OMOI 01 Architecture ("3 Piezas: Base + Copa + Pantalla"):
 *  - Piece 1 (Base Ónice): Ribbed dome + ultra-slender Ø 15.0 mm outer / Ø 8.5 mm inner stem + Ø 13.0 × 8.0 mm upper spigot (NO dark funnel!)
 *  - Piece 2 (Copa Arena): Slip-fits onto the spigot (Ø 13.5 mm bore), flares at 45° (14 mm) to compact E26/E27 Ø 46.0 / Ø 40.5 mm ring (total 17.5 mm)
 *  - Piece 3 (Pantalla Arena): Flat Z=0 spider with Ø 40.8 mm central bore clamped directly onto Piece 2 by the E26/E27 nut!
 */
export const THREE_PART_STEM_OUTER_RADIUS_MM = 7.5; // Ø 15.0 mm exterior
export const THREE_PART_STEM_INNER_RADIUS_MM = 4.25; // Ø 8.5 mm cable bore
export const THREE_PART_TENON_OUTER_RADIUS_MM = 6.5; // Ø 13.0 mm upper cylindrical coupling spigot
export const THREE_PART_TENON_HEIGHT_MM = 8.0; // 8.0 mm press/slip engagement depth into Copa
export const THREE_PART_CUP_BASE_OUTER_RADIUS_MM = 9.25; // Ø 18.5 mm sleeve foot (2.5 mm solid wall around Ø13.5 mm bore)
export const THREE_PART_CUP_BORE_RADIUS_MM = 6.75; // Ø 13.5 mm slip-fit bore (+0.25 mm radial clearance for PLA)
export const THREE_PART_CUP_FLARE_HEIGHT_MM = 14.0; // 45° self-supporting flare from r=9.25 to r=23.0 mm (0% supports!)
export const THREE_PART_CUP_TOTAL_HEIGHT_MM =
  THREE_PART_CUP_FLARE_HEIGHT_MM + SLENDER_E26_RING_HEIGHT_MM; // 17.5 mm total Copa height

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

/** True when "3 Piezas (Base + Copa + Pantalla)" architecture is active (requires bottom E26/E27). */
export function isThreePartCupMode(config: LampConfig): boolean {
  return (
    config.silhouette.buildMode === 'three_part' &&
    config.mount.position === 'bottom' &&
    config.mount.type === 'e26_e27' &&
    config.base.style !== 'compact_flush'
  );
}

/** True when "Cuello Esbelto E26/E27" direct-nut coupling is active (requires E26/E27 mount). */
export function isSlenderE26Mode(config: LampConfig): boolean {
  if (isThreePartCupMode(config)) return true;
  return (
    config.mount.type === 'e26_e27' &&
    config.base.style !== 'compact_flush' &&
    (config.base.coupling === 'slender_e26' ||
      (config.base.style === 'dome' && (config.base.domeStemHeightMm ?? 0) > 0.1))
  );
}

/** Whether the current coupling uses bayonet locking lugs (Compact Flush, direct Bayonet, or Spider+Bayonet). */
export function couplingUsesBayonet(base: BaseParams): boolean {
  if (base.coupling === 'slender_e26') return false;
  return (
    base.style === 'compact_flush' ||
    base.coupling === 'bayonet' ||
    (base.coupling === 'spider' && base.spiderBayonet)
  );
}

/** Active vertical engagement height of the Base-to-Shade coupling collar. */
export function getCouplingHeightMm(base: BaseParams): number {
  if (base.style === 'compact_flush') return COMPACT_FLUSH_HEIGHT_MM;
  if (base.coupling === 'slender_e26') return SLENDER_E26_RING_HEIGHT_MM;
  return base.coupling === 'gravity_seat' ? GRAVITY_STEP_HEIGHT_MM : COUPLING_HEIGHT_MM;
}

/**
 * Computes safe effective coupling neck radius (mm) so the Base collar always cleanly
 * encloses the selected hardware (LED Lamp Kit 001 or E26/E27 socket).
 */
export function getEffectiveNeckRadius(config: LampConfig): number {
  const { mount, base } = config;
  if (base.style === 'compact_flush') {
    return COMPACT_FLUSH_COLLAR_RADIUS_MM;
  }
  if (isSlenderE26Mode(config)) {
    return SLENDER_E26_SOCKET_OUTER_RADIUS_MM;
  }
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
 * Active elevated hollow stem height (mm) on Dome bases (0 - 22 mm; default 16 mm for slender_e26).
 * Automatically disabled (0 mm) whenever Bambu LED Kit 001 (Ø 59.7 mm) is selected.
 */
export function getEffectiveDomeStemHeightMm(config: LampConfig): number {
  if (config.base.style !== 'dome' || config.mount.type !== 'e26_e27') {
    return 0;
  }
  if (isThreePartCupMode(config)) {
    return clamp(config.base.domeStemHeightMm ?? 14, 6, 22);
  }
  const fallback = config.base.coupling === 'slender_e26' ? 16 : 0;
  return clamp(config.base.domeStemHeightMm ?? fallback, 0, 22);
}

/**
 * Computes the vertical 45° self-supporting flare height (mm) above the slender dome stem
 * strictly up to the compact Ø 46 mm E26/E27 socket ring (14.5 mm => exact 45°).
 */
export function getDomeStemFlareHeightMm(config: LampConfig): number {
  const stemH = getEffectiveDomeStemHeightMm(config);
  if (stemH <= 0.1) return 0;
  if (isThreePartCupMode(config)) return THREE_PART_CUP_FLARE_HEIGHT_MM;
  return Math.max(4, SLENDER_E26_SOCKET_OUTER_RADIUS_MM - DOME_STEM_OUTER_RADIUS_MM);
}

/**
 * Computes the vertical Y (mm) where Piece 2 (Copa porta-socket) rests on Piece 1 (Base) in 3-piece mode.
 */
export function getThreePartCupSeatY(config: LampConfig): number {
  const { base } = config;
  if (base.style === 'dome') {
    const domeH = Math.max(36, base.height);
    return domeH + getEffectiveDomeStemHeightMm(config);
  }
  if (base.style === 'cylinder') {
    return Math.max(18, base.height);
  }
  return Math.max(26, base.height);
}

/**
 * Computes the height (mm) at which the Shade's seating reference rests on top of the Base (or Copa in 3-piece mode).
 * For 'compact_flush', the shade rests 100% flush on the table (seatY = 0) and the 15 mm base
 * locks into the embedded female bayonet socket inside the sphere's bottom opening.
 */
export function getShadeSeatY(config: LampConfig): number {
  const { base, mount } = config;
  if (base.style === 'compact_flush') {
    return 0;
  }
  if (isThreePartCupMode(config)) {
    return getThreePartCupSeatY(config) + THREE_PART_CUP_TOTAL_HEIGHT_MM;
  }
  if (base.style === 'conkel') {
    if (mount.type === 'led_kit_001') {
      return Math.max(11.2, base.height - getCouplingHeightMm(base));
    }
    return 8.0;
  }
  if (base.style === 'cylinder') {
    return Math.max(18, base.height) + base.collarRevealMm;
  }
  if (base.style === 'dome') {
    const domeH = Math.max(36, base.height);
    const stemH = getEffectiveDomeStemHeightMm(config);
    if (stemH > 0.1) {
      return domeH + stemH + getDomeStemFlareHeightMm(config) + SLENDER_E26_RING_HEIGHT_MM;
    }
    return domeH;
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

  if (base.style === 'compact_flush') {
    // 3 locking lugs protruding 1.5 mm radially at 60°, 180°, 300° (clear of rear USB cord slot at 0°)
    const lugs = 3;
    const period = (2 * Math.PI) / lugs;
    const shifted = theta - Math.PI / 3;
    const normTheta = ((shifted % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const localAng = ((normTheta + period * 0.5) % period) - period * 0.5;
    const halfLug = (10.5 * Math.PI) / 180;
    const angMask = 1 - smoothstep(halfLug - 0.025, halfLug + 0.025, Math.abs(localAng));
    // 45° support-free bottom ramp (7.3..8.8), plateau (8.8..11.5), clean top taper (11.5..12.3)
    const vRampUp = smoothstep(COMPACT_FLUSH_LUG_Y_START, 8.8, y);
    const vRampDown = 1 - smoothstep(11.5, COMPACT_FLUSH_LUG_Y_END, y);
    const topChamfer = y > 13.5 ? -0.3 * smoothstep(13.5, COMPACT_FLUSH_HEIGHT_MM, y) : 0;
    return COMPACT_FLUSH_LUG_DEPTH_MM * angMask * vRampUp * vRampDown + topChamfer;
  }

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
    base.coupling === 'gravity_seat' && base.style !== 'compact_flush'
      ? Math.max(0.4, clamp(base.couplingClearance, 0.2, 0.65))
      : clamp(base.couplingClearance, 0.2, 0.65);

  if (base.style === 'compact_flush') {
    // Upper bore Ø 73.5 + 2*0.35 = Ø 74.2 mm (r = 37.10 mm) with 3 aligned bayonet twist channels (+1.5 + 0.25 mm)
    // Lower counterbore (y ∈ [0, 5.5]) widens at 45° to Ø 75.0 + 2*0.35 = Ø 75.7 mm (r = 37.85 mm) for flush rim
    const lugs = 3;
    const period = (2 * Math.PI) / lugs;
    const shifted = theta - Math.PI / 3;
    const normTheta = ((shifted % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const localAng = ((normTheta + period * 0.5) % period) - period * 0.5;

    const rimStepExtra =
      (COMPACT_FLUSH_OUTER_RADIUS_MM - COMPACT_FLUSH_COLLAR_RADIUS_MM) *
      (1 - smoothstep(5.4, 6.2, y));

    // 1. Vertical entry keyway from y = 0 .. 13.7 (±13.5° centered on 60°, 180°, 300°)
    const halfKey = (13.5 * Math.PI) / 180;
    const inKeywayAng = 1 - smoothstep(halfKey - 0.025, halfKey + 0.025, Math.abs(localAng));
    const inKeywayY = 1 - smoothstep(12.9, 13.7, y);
    const keywayMask = inKeywayAng * inKeywayY;

    // 2. Horizontal twist channel (0..38° + half lug margin) with >= 0.4 mm vertical clearance above & below male lug
    const twistStart = -halfKey * 0.5;
    const twistEnd = ((BAYONET_TWIST_END_DEG + 11.5) * Math.PI) / 180;
    const inTwistAng =
      smoothstep(twistStart - 0.025, twistStart + 0.025, localAng) *
      (1 - smoothstep(twistEnd - 0.025, twistEnd + 0.025, localAng));
    const inTwistY =
      smoothstep(COMPACT_FLUSH_TWIST_Y_LOW, 6.9, y) *
      (1 - smoothstep(12.8, COMPACT_FLUSH_TWIST_Y_HIGH, y));
    const twistMask = inTwistAng * inTwistY;

    // 3. Subtle tactile snap detent ridge at 31° before locked 38° stop pocket
    const detentCenter = (31 * Math.PI) / 180;
    const detentHalf = (2.2 * Math.PI) / 180;
    const detentAng = 1 - smoothstep(0, detentHalf, Math.abs(localAng - detentCenter));
    const detentBumpMm = 0.25 * detentAng * twistMask;

    const grooveDepth =
      Math.max(keywayMask, twistMask) * (COMPACT_FLUSH_LUG_DEPTH_MM + 0.25) - detentBumpMm;
    return rMaleBase + clr + Math.max(rimStepExtra, Math.max(0, grooveDepth));
  }

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
