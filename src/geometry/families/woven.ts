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
 */
function roundedStripLengthProfile(sRaw: number, fullness: number): number {
  const s = ((sRaw % 1) + 1) % 1;
  const baseSin = Math.sin(s * Math.PI);
  const broadExp = clamp(0.42 + (1 - fullness) * 0.35, 0.35, 0.8);
  const arch = Math.pow(Math.max(0, baseSin), broadExp);
  const tuck = smoothstep(0.0, 0.14, s) * (1 - smoothstep(0.86, 1.0, s));
  return arch * (0.25 + 0.75 * tuck);
}

/**
 * Smooth rounded vertical cross-section of a horizontal wicker reed across row fraction t in [0, 1].
 */
function roundedReedCrossSection(tRaw: number, fdmSmooth: number): number {
  const t = ((tRaw % 1) + 1) % 1;
  const d = t * 2 - 1;
  const roundness = 1.65 + (1 - fdmSmooth) * 0.65;
  const core = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(d), roundness)), 0.58);
  const seamEase = smoothstep(0.0, 0.12, t) * (1 - smoothstep(0.88, 1.0, t));
  return core * (0.2 + 0.8 * seamEase);
}

/**
 * Estilo 6: Tejida / Textil 3D — 4 Real 3D FDM-Printable Sub-Patterns (all <= 45°, 0% supports, smooth inner wall):
 *  1. `basket_1x1`  ("Mimbre / Basketweave"): elongated rounded horizontal reeds alternating per row (0.8 -> 2.2 mm).
 *  2. `knitted`     ("Punto / Knitted Estambre"): vertical columns of rounded V-shaped chevron knit loops (0.8 -> 2.2 mm).
 *  3. `ripple_mesh` ("RippleMesh Celda profunda"): bold sculpted sinusoidal arches (~2.4 mm crests, 3.5–6.5 mm deep,
 *                   24–44 radial × 18–32 rows) surrounding ultra-thin ~0.65 mm translucent light cells at <= 45°.
 *  4. `grid_mesh`   ("Rejilla / Grid"): architectural orthogonal ribs & 45°-beveled horizontal rings framing
 *                   glowing ~0.65 mm translucent square windows (black/luminous lattice lamp reference).
 */
export const wovenFamily: LampFamilyDefinition = {
  id: 'woven',
  name: 'Tejida / Textil & Celda',
  shortName: 'Tejida',
  tagline: 'Mimbre, Punto (Knitted), RippleMesh profundo y Rejilla luminosa con pared interior lisa',

  getResolution(config: LampConfig, draft: boolean) {
    if (config.woven.pattern === 'open_lattice') {
      return { radialSegs: draft ? 72 : 120, heightSegs: draft ? 48 : 80 };
    }
    const isCellMode =
      config.woven.pattern === 'ripple_mesh' || config.woven.pattern === 'grid_mesh';
    const hf = isCellMode
      ? Math.round(clamp(config.woven.horizFreq, 16, 44))
      : Math.round(clamp(config.woven.horizFreq, 16, 72));
    const vf = isCellMode
      ? Math.round(clamp(config.woven.vertFreq, 12, 32))
      : Math.round(clamp(config.woven.vertFreq, 24, 90));

    // High final resolution (>= 280 radial × >= 200 vertical) so Knitted V-stitches,
    // deep RippleMesh arches, and Grid windows export razor-sharp in STL!
    const radialSegs = draft
      ? Math.min(208, Math.max(152, hf * 5))
      : Math.min(440, Math.max(288, hf * 10));
    const heightSegs = draft
      ? Math.min(140, Math.max(104, vf * 3))
      : Math.min(300, Math.max(208, vf * 7));
    return { radialSegs, heightSegs };
  },

  createEvaluator(config: LampConfig) {
    const { horizFreq, vertFreq, relief, rippleDepth, pattern, fdmSmoothing } = config.woven;
    const smooth = clamp(fdmSmoothing, 0, 1);

    const isRipple = pattern === 'ripple_mesh' || pattern === 'open_lattice';
    const isGrid = pattern === 'grid_mesh';
    const isCellMode = isRipple || isGrid;

    // Dedicated sculpted cell ranges for RippleMesh & Grid: 16–44 radial × 12–32 rows, 3.5–6.5 mm depth
    const hf = isCellMode
      ? Math.max(16, Math.min(44, Math.round(horizFreq)))
      : Math.max(16, Math.min(72, Math.round(horizFreq)));
    const vf = isCellMode
      ? Math.max(12, Math.min(32, Math.round(vertFreq)))
      : Math.max(24, Math.min(90, Math.round(vertFreq)));

    const minValleyWallMm = isCellMode ? 0.65 : 0.8;
    const requestedDepthMm = isCellMode
      ? clamp(rippleDepth ?? 4.8, 3.5, 6.5)
      : clamp(relief, 0.6, 2.8);

    // For deep RippleMesh / Grid, respect <= 45° vertical flank printability relative to physical row height!
    const rowHeightMm = Math.max(3.5, config.silhouette.height / vf);
    const max45DepthMm = Math.max(3.5, rowHeightMm * 0.92);
    const effectiveDepthMm = isCellMode
      ? Math.min(requestedDepthMm, max45DepthMm)
      : requestedDepthMm;

    return (ctx: DisplacementContext): DisplacementResult => {
      const uCell = ctx.u * hf;
      const vCell = ctx.v * vf;

      const rowIdx = Math.floor(vCell);
      const vFrac = vCell - rowIdx;

      let weave01 = 0;

      if (pattern === 'knitted') {
        // --- SUBMODO B: PUNTO / KNITTED (ESTAMBRE) ---
        const uF = ((uCell % 1) + 1) % 1;
        const dx = uF * 2 - 1;
        const absDx = Math.abs(dx);

        const vSkew = 0.56 * absDx;
        const vStitch = ((vCell - vSkew) % 1 + 1) % 1;

        const yarnRoundExp = 0.56 + smooth * 0.28;
        const yarnProfile = Math.pow(Math.max(0, Math.sin(vStitch * Math.PI)), yarnRoundExp);
        const columnGroove = smoothstep(0.0, 0.2, 1.0 - absDx);
        const centerVCrease = 0.28 + 0.72 * smoothstep(0.0, 0.22, absDx);
        const tuckWave = 0.88 + 0.12 * Math.sin(vStitch * Math.PI * 2 + (dx < 0 ? 0.45 : -0.45));

        weave01 = clamp(yarnProfile * columnGroove * centerVCrease * tuckWave, 0, 1);
      } else if (isRipple) {
        // --- SUBMODO C: RIPPLEMESH PROFUNDO (CELDA ESCULPIDA 3.5–6.5 mm, VALLE ~0.65 mm) ---
        // Bold counter-phased continuous sinusoidal arches (~2.4 mm crest width) framing deep sculpted
        // luminous cells (~0.65 mm translucent center) with smooth <= 45° printable sloped walls!
        const uAngle = uCell * Math.PI * 2;
        const waveAmp = 0.36;
        const vWaveA = vCell + waveAmp * Math.sin(uAngle);
        const vWaveB = vCell - waveAmp * Math.sin(uAngle);

        // Distance from exact arch centerline: 0 on crest, 1 at exact cell center
        const distA = Math.abs(Math.sin(vWaveA * Math.PI));
        const distB = Math.abs(Math.sin(vWaveB * Math.PI));

        // Broad rounded arch shoulder (~2.4 mm wide crest) dropping cleanly at <= 45° into the ~0.65 mm cell eye
        const archWidth = 0.42 + smooth * 0.12;
        const archA = 1.0 - smoothstep(0.14, 0.14 + archWidth, distA);
        const archB = 1.0 - smoothstep(0.14, 0.14 + archWidth, distB);

        // Slight diagonal pillowing at crossings makes the lattice look sculpted & plush (amber/blue reference!)
        const rawLattice = Math.max(archA, archB) + 0.18 * archA * archB;
        weave01 = clamp(Math.pow(clamp(rawLattice, 0, 1), 0.92), 0, 1);
      } else if (isGrid) {
        // --- SUBMODO D: REJILLA / GRID (LÁMPARA NEGRA DE VENTANAS LUMINOSAS) ---
        // Orthogonal architectural cage: crisp vertical mullions + 45°-chamfered horizontal rings
        // surrounding ~0.65 mm translucent square windows!
        const uF = ((uCell % 1) + 1) % 1;
        const dU = Math.abs(uF * 2 - 1); // 0 at vertical window center, 1 at vertical rib center
        const dV = Math.abs(vFrac * 2 - 1); // 0 at horizontal window center, 1 at horizontal ring center

        // Vertical rib: sturdy ~2.4 mm pillar with crisp rounded shoulder
        const vRib = smoothstep(0.46 - smooth * 0.08, 0.78, dU);
        // Horizontal ring: 45° chamfered bottom & top ramps so zero supports are needed!
        const hRing = smoothstep(0.36 - smooth * 0.08, 0.84, dV);

        // Soft corner fillet where vertical & horizontal bars meet (rounded square window!)
        const cornerFillet = smoothstep(0.68, 1.08, Math.hypot(dU, dV));
        const cage = Math.max(vRib, hRing * 0.92, cornerFillet * 0.85);
        weave01 = clamp(cage, 0, 1);
      } else {
        // --- SUBMODO A: MIMBRE (BASKETWEAVE) ---
        const uShifted = uCell + ((rowIdx & 1) === 0 ? 0.0 : 0.5);
        const stripArch = roundedStripLengthProfile(uShifted, 0.72);
        const reedSection = roundedReedCrossSection(vFrac, smooth);

        const warpPhase = uShifted + 0.5;
        const warpRibbon = Math.pow(
          Math.max(0, Math.sin((((warpPhase % 1) + 1) % 1) * Math.PI)),
          1.3
        );
        const underWarp = 0.22 * warpRibbon * (1 - stripArch * 0.75);

        weave01 = clamp(stripArch * reedSection + underWarp, 0, 1);
      }

      // Gently solidify the top 3 mm rim into a neat rounded binding collar so top edge prints strong,
      // and smoothly attenuate relief across the bottom 3 mm (v = 0..0.02) so shade seats 100% flush on the base drum!
      const topRimBlend = smoothstep(0.96, 1.0, ctx.v);
      const bottomFlushBlend = smoothstep(0.0, 0.02, ctx.v);
      const finalWeave01 = weave01 * (1 - topRimBlend) + 0.72 * topRimBlend;

      const rawWallMm = minValleyWallMm + finalWeave01 * effectiveDepthMm;
      const baseFlushWallMm = clamp(config.mount.wallThickness, 1.6, 3.2);
      const wallThicknessMm =
        baseFlushWallMm * (1 - bottomFlushBlend) + rawWallMm * bottomFlushBlend;

      return {
        outerOffset: 0,
        innerFollow: 0, // Strictly smooth, continuous inner wall!
        explicitWallThicknessMm: wallThicknessMm,
      };
    };
  },
};
