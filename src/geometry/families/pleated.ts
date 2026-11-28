import { LampConfig } from '../../types/lamp';
import { DisplacementContext, DisplacementResult, LampFamilyDefinition } from '../registry';

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Estilo 1: Plisada / Acanalada (Architectural UMINO-inspired fluted & pleated collection).
 */
export const pleatedFamily: LampFamilyDefinition = {
  id: 'pleated',
  name: 'Plisada / Acanalada',
  shortName: 'Plisada',
  tagline: 'Pliegues arquitectónicos minimalistas con perfiles de onda configurables',

  getResolution(config: LampConfig, draft: boolean) {
    const n = Math.max(12, Math.min(80, Math.round(config.pleated.count)));
    // CAD exact even integer multiple of pleat count (4 in draft, 8 or 6 in final) — ZERO destructive clamp aliasing!
    const perFold = draft ? 4 : n * 8 <= 480 ? 8 : n * 6 <= 480 ? 6 : 4;
    const radialSegs = Math.max(48, n * perFold);
    const heightSegs = draft ? 52 : 96;
    return { radialSegs, heightSegs };
  },

  getAxialTwistRad(): number {
    return 0;
  },

  createEvaluator(config: LampConfig) {
    const { count, depth, waveProfile, endTaper } = config.pleated;
    const n = Math.max(12, Math.min(80, Math.round(count)));
    const halfDepth = depth * 0.5;
    const tanhNorm = Math.tanh(3.2);

    return (ctx: DisplacementContext): DisplacementResult => {
      const phase = ctx.theta * n;
      let wave = 0;

      if (waveProfile === 'sine') {
        wave = Math.cos(phase);
      } else if (waveProfile === 'triangle') {
        // Softly filleted origami accordion fold for crisp 0.4mm nozzle printing
        const frac = ((ctx.theta * n) / (2 * Math.PI)) % 1;
        const f = frac < 0 ? frac + 1 : frac;
        const tri = 1 - 4 * Math.abs(f - 0.5); // -1 .. +1
        // Gentle cubic tip softening
        wave = tri * (1 - 0.08 * tri * tri);
      } else if (waveProfile === 'soft_square') {
        // Bold scalloped architectural ribs (UMINO F019 / F038)
        wave = Math.tanh(3.2 * Math.cos(phase)) / tanhNorm;
      } else {
        // double_ridge: twin-crested architectural reed
        wave = 0.72 * Math.cos(phase) + 0.28 * Math.cos(phase * 2);
      }

      // Optional taper near bottom & top rims
      let env = 1.0;
      if (endTaper > 0.01) {
        const span = 0.08 + endTaper * 0.2;
        const bot = smoothstep(0.02, 0.02 + span, ctx.v);
        const top = 1 - smoothstep(0.98 - span, 0.99, ctx.v);
        env = 1 - endTaper + endTaper * bot * top;
      }

      return {
        outerOffset: wave * halfDepth * env,
        innerFollow: 0.86,
      };
    };
  },
};
