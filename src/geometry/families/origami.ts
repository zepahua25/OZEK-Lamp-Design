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
 * Soft-filleted triangle wave in [-1, +1] for crisp yet FDM-friendly origami folds
 * (edgeSoftness in [0, 1] rounds razor peaks gently to eliminate 0.4 mm nozzle ringing).
 */
function softTriangle(phaseRaw: number, softness: number): number {
  const p = ((phaseRaw % 1) + 1) % 1;
  const tri = 1 - 4 * Math.abs(p - 0.5); // -1 .. +1
  const sine = Math.cos(p * 2 * Math.PI);
  // Subtle cubic fillet + cosine blend controlled by edgeSoftness
  const filleted = tri * (1 - 0.1 * tri * tri);
  return filleted * (1 - softness * 0.45) + sine * (softness * 0.45);
}

/**
 * Estilo 5 (v2.0 NUEVO): Origami / Facetado (Yoshimura geometric diamond tessellation).
 * Crisp folded paper-lantern diamond facets with FDM-safe softened creases and flat rim transitions.
 */
export const origamiFamily: LampFamilyDefinition = {
  id: 'origami',
  name: 'Origami / Facetado',
  shortName: 'Origami',
  tagline: 'Pliegues geométricos tipo diamante Yoshimura con aristas suavizadas para FDM',

  getResolution(config: LampConfig, draft: boolean) {
    const hf = Math.max(6, Math.min(24, Math.round(config.origami.horizFacets)));
    const vt = Math.max(3, Math.min(12, Math.round(config.origami.vertTiers)));
    // High vertex alignment along creases so diamond facets look crisp & architectural
    const radialSegs = Math.min(360, Math.max(draft ? 120 : 216, hf * (draft ? 8 : 14)));
    const heightSegs = Math.min(220, Math.max(draft ? 72 : 144, vt * (draft ? 8 : 14)));
    return { radialSegs, heightSegs };
  },

  createEvaluator(config: LampConfig) {
    const { horizFacets, vertTiers, depth, twistDeg, edgeSoftness } = config.origami;
    const hf = Math.max(6, Math.min(24, Math.round(horizFacets)));
    const vt = Math.max(3, Math.min(12, Math.round(vertTiers)));
    const halfDepth = clamp(depth, 3, 14) * 0.5;
    const twistRad = (clamp(twistDeg, 0, 180) * Math.PI) / 180;
    const soft = clamp(edgeSoftness, 0, 1);

    return (ctx: DisplacementContext): DisplacementResult => {
      const uEff = ctx.u + (twistRad * ctx.v) / (2 * Math.PI);
      const uPhase = uEff * hf;
      const vPhase = ctx.v * vt;

      // Yoshimura diamond origami tessellation:
      // Alternating staggered diagonal fold waves (u + 0.5*v) and (u - 0.5*v) + horizontal crease folds!
      const diagA = softTriangle(uPhase + vPhase * 0.5, soft);
      const diagB = softTriangle(uPhase - vPhase * 0.5, soft);
      const horizFold = softTriangle(vPhase, soft);

      // Diamond peak sits where diagonal ridges meet; concave valley sits cleanly between tiers
      const diamond = 0.52 * (diagA + diagB) * 0.5 + 0.48 * (diagA * diagB);
      const folded = clamp(diamond * 0.78 + horizFold * 0.22, -1, 1);

      // Smooth fade at top & bottom rims so the origami shade seats flat on Z = 0 either way!
      const endFade = smoothstep(0.02, 0.08, ctx.v) * (1 - smoothstep(0.93, 0.99, ctx.v));

      return {
        outerOffset: folded * halfDepth * endFade,
        // Follow creases closely on inner wall for light weight & uniform crisp wall thickness
        innerFollow: 0.78,
      };
    };
  },
};
