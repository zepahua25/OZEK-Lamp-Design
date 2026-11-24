import { LampConfig } from '../../types/lamp';
import { DisplacementContext, DisplacementResult, LampFamilyDefinition } from '../registry';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Estilo 2 (NUEVO): Plisado Fino (Flute / Japonés).
 * 40 a 100 pliegues ultra-finos y suaves (1.5 - 3.0 mm de profundidad) con grosor de pared
 * translúcido ajustable de 0.8 mm a 2.4 mm para difusión cálida tipo linterna washi/cerámica.
 */
export const japaneseFluteFamily: LampFamilyDefinition = {
  id: 'japanese_flute',
  name: 'Plisado Fino (Japonés)',
  shortName: 'Japonés',
  tagline: '40 a 100 pliegues suaves de baja profundidad y pared translúcida (0.8–2.4 mm)',

  getResolution(config: LampConfig, draft: boolean) {
    const count = Math.max(40, Math.min(100, Math.round(config.japaneseFlute.count)));
    // High angular sampling (5 verts/flute in final, up to 480) so 100 flutes render silky-smooth
    const radialSegs = draft
      ? Math.min(260, Math.max(160, count * 3))
      : Math.min(480, Math.max(300, count * 5));
    const heightSegs = draft ? 56 : 104;
    return { radialSegs, heightSegs };
  },

  createEvaluator(config: LampConfig) {
    const { count, depth, wallThickness, profile } = config.japaneseFlute;
    const n = Math.max(40, Math.min(100, Math.round(count)));
    const halfDepth = clamp(depth, 1.5, 3.0) * 0.5;
    const effWall = clamp(wallThickness, 0.8, 2.4);

    return (ctx: DisplacementContext): DisplacementResult => {
      const phase = ctx.theta * n;
      let wave: number;

      if (profile === 'scallop') {
        // Gentle architectural ceramic flute (soft concave troughs, softly rounded crests)
        const s = 0.5 + 0.5 * Math.cos(phase);
        wave = Math.pow(s, 0.72) * 2 - 1;
      } else {
        // 'soft_sine' — silky Japanese washi paper pleats
        wave = Math.cos(phase);
      }

      return {
        outerOffset: wave * halfDepth,
        innerFollow: 0.92,
        uniformWallThicknessMm: effWall,
      };
    };
  },
};
