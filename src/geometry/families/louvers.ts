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
    const fins = Math.round(config.louvers.finCount);
    // High angular sampling (7-8 verts per fin) so each sculptural blade is razor crisp
    const radialSegs = Math.min(384, Math.max(draft ? 140 : 256, fins * (draft ? 5 : 8)));
    const heightSegs = draft ? 68 : 136;
    return { radialSegs, heightSegs };
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
      const phase = ctx.theta * n + twist;

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
