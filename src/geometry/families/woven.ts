import { LampConfig } from '../../types/lamp';
import { DisplacementContext, DisplacementResult, LampFamilyDefinition } from '../registry';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Smooth, broad-crested rounded wicker strip profile across a single strip's horizontal span s in [0, 1].
 * Rises gently from 0 at the crossing seam (s=0), holds a wide rounded arch across the middle
 * (NO pointy spikes!), and tucks smoothly back to 0 at s=1.
 */
function roundedStripLengthProfile(sRaw: number, fullness: number): number {
  const s = ((sRaw % 1) + 1) % 1;
  // sin(PI * s) is 0 at ends, 1 at center; raising to power < 1 flattens & broadens the top into a smooth ribbon!
  const baseSin = Math.sin(s * Math.PI);
  // Blend between smooth cosine arch and broad flat-crested super-arch
  const broadExp = clamp(0.42 + (1 - fullness) * 0.35, 0.35, 0.8);
  const arch = Math.pow(Math.max(0, baseSin), broadExp);
  // Subtle C1 tuck easing right at the crossing edge so adjacent strips weave smoothly underneath
  const tuck = smoothstep(0.0, 0.14, s) * (1 - smoothstep(0.86, 1.0, s));
  return arch * (0.25 + 0.75 * tuck);
}

/**
 * Smooth rounded vertical cross-section of a horizontal wicker reed across row fraction t in [0, 1].
 * Shaped like a rounded half-oval / D-rod (softly chamfered at bottom/top edges for clean FDM printing < 45°).
 */
function roundedReedCrossSection(tRaw: number, fdmSmooth: number): number {
  const t = ((tRaw % 1) + 1) % 1;
  // Centered coordinate d in [-1, 1]
  const d = t * 2 - 1;
  // Super-elliptical rounded reed profile: smooth convex top, zero sharp points, printable flank slope!
  const roundness = 1.65 + (1 - fdmSmooth) * 0.65; // ~1.65..2.30 -> plush rounded reed
  const core = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(d), roundness)), 0.58);
  // Soft seam groove between stacked rows so rows read as distinct woven courses without sharp crevices
  const seamEase = smoothstep(0.0, 0.12, t) * (1 - smoothstep(0.88, 1.0, t));
  return core * (0.2 + 0.8 * seamEase);
}

/**
 * Estilo 4: Tejida / Basketweave (True elongated rounded wicker/rattan strips — zero pineapple spikes!).
 * - Completely smooth, continuous inner wall (`innerFollow: 0`).
 * - Outer wall sculpts alternating elongated rounded horizontal reeds:
 *   minimum 0.8 mm thickness in translucent valleys -> 2.2 mm (default) at rounded strip crests!
 * - High radial and vertical mesh density so every curve renders silky-smooth up close.
 */
export const wovenFamily: LampFamilyDefinition = {
  id: 'woven',
  name: 'Tejida / Basketweave',
  shortName: 'Tejida',
  tagline: 'Tiras alargadas y redondeadas tipo mimbre/canasta con pared interior lisa',

  getResolution(config: LampConfig, draft: boolean) {
    const hf = Math.round(config.woven.horizFreq);
    const vf = Math.round(config.woven.vertFreq);
    // High resolution (10-12 verts per horizontal strip, 5-6 vertical verts per reed course)
    // so curved wicker arches have ZERO flat facets when zooming in!
    const radialSegs = draft
      ? Math.min(200, Math.max(140, hf * 5))
      : Math.min(440, Math.max(320, hf * 10));
    const heightSegs = draft
      ? Math.min(130, Math.max(96, vf * 2))
      : Math.min(300, Math.max(220, vf * 5));
    return { radialSegs, heightSegs };
  },

  createEvaluator(config: LampConfig) {
    const { horizFreq, vertFreq, relief, pattern, fdmSmoothing } = config.woven;
    // Note: elongated basketweave strips have fewer horizontal strands than vertical rows (e.g. 28-44 × 48-76)
    const hf = Math.max(16, Math.min(72, Math.round(horizFreq)));
    const vf = Math.max(24, Math.min(90, Math.round(vertFreq)));
    const smooth = clamp(fdmSmoothing, 0, 1);

    // Exact requested FDM translucent basketweave wall profile:
    // 0.8 mm minimum in valleys (lets warm light pass cleanly!) -> 0.8 + relief (default 1.4 -> 2.2 mm at crests!)
    const MIN_VALLEY_WALL_MM = 0.8;
    const effectiveReliefMm = clamp(relief, 0.6, 2.8);

    return (ctx: DisplacementContext): DisplacementResult => {
      const uCell = ctx.u * hf;
      const vCell = ctx.v * vf;

      const rowIdx = Math.floor(vCell);
      const vFrac = vCell - rowIdx;

      let weave01 = 0;

      if (pattern === 'basket_1x1') {
        // Authentic alternating brick-staggered wicker / basketweave (mimbre)
        // Row A: elongated rounded horizontal strip; Row B: shifted half a strip length (0.5)
        const uShifted = uCell + ((rowIdx & 1) === 0 ? 0.0 : 0.5);
        const stripArch = roundedStripLengthProfile(uShifted, 0.72);
        const reedSection = roundedReedCrossSection(vFrac, smooth);

        // Subtle vertical warp binder visible in the tucked gaps between horizontal reeds
        const warpPhase = uShifted + 0.5;
        const warpRibbon = Math.pow(Math.max(0, Math.sin((((warpPhase % 1) + 1) % 1) * Math.PI)), 1.3);
        const underWarp = 0.22 * warpRibbon * (1 - stripArch * 0.75);

        weave01 = clamp(stripArch * reedSection + underWarp, 0, 1);
      } else if (pattern === 'twill') {
        // Diagonal 2/1 woven textile twill (each course shifts smoothly by 1/3 strip width)
        const uShifted = uCell + rowIdx * 0.3333;
        const stripArch = roundedStripLengthProfile(uShifted, 0.78);
        const reedSection = roundedReedCrossSection(vFrac, smooth);
        const underWarp = 0.18 * (1 - stripArch);
        weave01 = clamp(stripArch * reedSection + underWarp, 0, 1);
      } else if (pattern === 'double_2x2') {
        // Paired double-reed rattan basketweave (2 parallel reeds share phase, then alternate)
        const pairIdx = Math.floor(rowIdx / 2);
        const uShifted = uCell + ((pairIdx & 1) === 0 ? 0.0 : 0.5);
        const stripArch = roundedStripLengthProfile(uShifted, 0.8);
        const reedSection = roundedReedCrossSection(vFrac, smooth);
        const underWarp = 0.2 * (1 - stripArch * 0.8);
        weave01 = clamp(stripArch * reedSection + underWarp, 0, 1);
      } else {
        // 'diamond' — soft rounded woven chevron / diamond rattan strips (zero sharp points!)
        const halfA = roundedStripLengthProfile(uCell + vCell * 0.5, 0.65);
        const halfB = roundedStripLengthProfile(uCell - vCell * 0.5, 0.65);
        const reedSection = roundedReedCrossSection(vFrac, smooth);
        weave01 = clamp(Math.max(halfA, halfB) * (0.35 + 0.65 * reedSection), 0, 1);
      }

      // Gently solidify the top 3 mm rim into a neat rounded binding collar so top edge prints strong
      const topRimBlend = smoothstep(0.96, 1.0, ctx.v);
      const finalWeave01 = weave01 * (1 - topRimBlend) + 0.75 * topRimBlend;

      // Exact wall thickness: 0.8 mm in valleys -> 0.8 + relief (2.2 mm default) on crests
      const wallThicknessMm = MIN_VALLEY_WALL_MM + finalWeave01 * effectiveReliefMm;

      return {
        outerOffset: 0,
        innerFollow: 0, // Strictly smooth, continuous inner wall!
        explicitWallThicknessMm: wallThicknessMm,
      };
    };
  },
};
