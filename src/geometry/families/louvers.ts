import { LampConfig } from '../../types/lamp';
import { DisplacementContext, DisplacementResult, LampFamilyDefinition } from '../registry';

/**
 * Estilo 3 (NUEVO): Láminas / Aletas Escultóricas (Flowalistik Studio inspired curved sweeping fins).
 * Creates crisp architectural fins protruding radially from a luminous translucent inner core,
 * with progressive S-curve twist so warm internal light spills dramatically between blades.
 */
export const louversFamily: LampFamilyDefinition = {
  id: 'louvers',
  name: 'Láminas / Aletas Twist',
  shortName: 'Láminas',
  tagline: 'Aletas escultóricas fluidas alrededor de un difusor interno luminoso',

  getResolution(config: LampConfig, draft: boolean) {
    const n = Math.max(16, Math.min(56, Math.round(config.louvers.finCount)));
    // CAD exact even integer multiple of finCount (4 in draft, 8 or 6 in final) — ZERO destructive clamp aliasing!
    const perFin = draft ? 4 : n * 8 <= 448 ? 8 : 6;
    const radialSegs = n * perFin;
    const heightSegs = draft ? 68 : 136;
    return { radialSegs, heightSegs };
  },

  getAxialTwistRad(config: LampConfig, v = 1): number {
    const n = Math.max(16, Math.min(56, Math.round(config.louvers.finCount)));
    const deg = config.louvers.sweepDeg || 0;
    if (Math.abs(deg) < 0.01) return 0;
    const totalSweepRad = (deg * Math.PI) / 180;
    const sCurve = v + 0.14 * Math.sin(v * Math.PI * 2);
    return (totalSweepRad * sCurve) / n;
  },

  createEvaluator(config: LampConfig) {
    const { finCount, finDepth, bladeSharpness, sweepDeg, waveAmplitude } = config.louvers;
    const n = Math.max(16, Math.min(56, Math.round(finCount)));
    const totalSweepRad = (sweepDeg * Math.PI) / 180;
    // Higher exponent produces narrower, crisper architectural fins separated by glowing valleys
    const sharpExp = 1.4 + bladeSharpness * 4.4;

    return (ctx: DisplacementContext): DisplacementResult => {
      // S-curve organic sweep twist (like Image 5: fluid sweeping flow along height)
      const sCurve = ctx.v + 0.14 * Math.sin(ctx.v * Math.PI * 2);
      const twist = totalSweepRad * sCurve;
      // When the mesh grid rings are already S-curve twisted (ctx.gridTwisted === true), evaluate strictly on
      // thetaBase without adding twist again so every mesh column tracks the exact fin blade!
      const phase = ctx.gridTwisted ? ctx.theta * n : ctx.theta * n + twist;

      // Normalized raised blade in [0, 1]
      const raw = 0.5 + 0.5 * Math.cos(phase);
      const blade = Math.pow(raw, sharpExp);

      // Optional organic wave modulation of fin length along height & angle
      const waveMod =
        waveAmplitude > 0.01
          ? 1 -
            waveAmplitude *
              0.38 *
              (0.5 + 0.5 * Math.sin(ctx.v * Math.PI * 2.5 + Math.cos(ctx.theta * 2) * 1.4))
          : 1.0;

      return {
        outerOffset: blade * finDepth * waveMod,
        // Keep the inner cylinder smooth so the diffuser core prints solid and glows warmly!
        innerFollow: 0.08,
      };
    };
  },
};
