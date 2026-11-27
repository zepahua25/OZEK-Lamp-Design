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
 * Exact piecewise-linear triangle fold distance in [0, 1] with a subtle hyperbolic crease bevel (`eps`).
 * Keeps triangular facets dead-flat & architectural while preventing razor-edge nozzle ringing!
 */
function beveledTriangle01(phaseRaw: number, eps: number): number {
  const p = ((phaseRaw % 1) + 1) % 1;
  const d = p - 0.5; // -0.5 .. +0.5
  const maxVal = Math.sqrt(0.25 + eps * eps) - eps;
  const val = Math.sqrt(d * d + eps * eps) - eps;
  return clamp(val / Math.max(1e-5, maxVal), 0, 1);
}

/**
 * Estilo 5 (v2.0): Origami / Facetado (Yoshimura geometric diamond tessellation).
 * Razor-crisp planar folded paper-lantern diamond facets with subtle FDM crease bevel & Vase Mode support.
 */
export const origamiFamily: LampFamilyDefinition = {
  id: 'origami',
  name: 'Origami / Facetado',
  shortName: 'Origami',
  tagline: 'Pliegues geométricos tipo diamante Yoshimura nítidos en Modo Jarrón (0% soportes)',

  getResolution(config: LampConfig, draft: boolean) {
    const hf = Math.max(6, Math.min(24, Math.round(config.origami.horizFacets)));
    const vt = Math.max(2, Math.min(12, Math.round(config.origami.vertTiers)));
    // True low-poly flat triangular Yoshimura origami mode (default ON):
    // Exact 2*horizFacets × 2*vertTiers lattice so every diamond face is a pure, dead-flat architectural triangle!
    if (config.origami.realFaceted !== false) {
      return { radialSegs: hf * 2, heightSegs: vt * 2 };
    }
    // High-resolution FDM-beveled Yoshimura lattice (optional smooth mode)
    const vMult = draft
      ? Math.max(6, Math.min(12, Math.floor(144 / (2 * hf)) & ~1))
      : Math.max(10, Math.min(16, Math.floor(280 / (2 * hf)) & ~1));
    const uMult = Math.max(8, vMult * 2);
    const radialSegs = Math.min(384, Math.max(80, hf * uMult));
    const heightSegs = Math.min(240, Math.max(24, vt * vMult));
    return { radialSegs, heightSegs };
  },

  createEvaluator(config: LampConfig) {
    const {
      horizFacets,
      vertTiers,
      depth,
      twistDeg,
      edgeSoftness,
      wallThickness,
      realFaceted,
      invertFolds,
    } = config.origami;
    const hf = Math.max(6, Math.min(24, Math.round(horizFacets)));
    const vt = Math.max(2, Math.min(12, Math.round(vertTiers)));
    const isRealFaceted = realFaceted !== false;
    const dirSign = invertFolds ? -1 : 1; // -1 = inward origami diamonds, +1 = outward crystal/urchin pyramids
    const halfDepth = clamp(depth, 2.0, 16.0) * 0.5;
    const twistRad = (clamp(twistDeg, 0, 180) * Math.PI) / 180;
    const soft = clamp(edgeSoftness, 0, 1);
    const creaseEps = isRealFaceted ? 0.0005 : 0.008 + soft * 0.077;
    const thinWall = wallThickness !== undefined ? clamp(wallThickness, 0.8, 2.4) : undefined;

    return (ctx: DisplacementContext): DisplacementResult => {
      const uEff = ctx.u + (twistRad * ctx.v) / (2 * Math.PI);
      const uPhase = uEff * hf;
      const vPhase = ctx.v * vt;

      if (isRealFaceted) {
        // Exact Yoshimura diamond checkerboard lattice on (2*hf) × (2*vt) grid:
        //  - invertFolds = false (+1): outward crystal pyramids ("Erizo / Cristal")
        //  - invertFolds = true  (-1): inward concave folded origami diamonds ("Origami")
        const da = beveledTriangle01(uPhase + vPhase, creaseEps);
        const db = beveledTriangle01(uPhase - vPhase, creaseEps);
        const diamondFacet = (1.0 - (da + db)) * dirSign;
        const endFade = ctx.v <= 0.005 || ctx.v >= 0.995 ? 0 : 1;
        return {
          outerOffset: diamondFacet * halfDepth * endFade,
          innerFollow: thinWall !== undefined ? 0.95 : 0.88,
          ...(thinWall !== undefined ? { uniformWallThicknessMm: thinWall } : {}),
        };
      }

      // High-res beveled Yoshimura diamond tessellation:
      const da = beveledTriangle01(uPhase + vPhase * 0.5, creaseEps);
      const db = beveledTriangle01(uPhase - vPhase * 0.5, creaseEps);
      const diamondFacet = 1.0 - (da + db);
      const horizFold = 1.0 - 2.0 * beveledTriangle01(vPhase, creaseEps);
      const folded = clamp(diamondFacet * 0.88 + horizFold * 0.12, -1, 1) * dirSign;

      const endFade = smoothstep(0.015, 0.055, ctx.v) * (1 - smoothstep(0.945, 0.985, ctx.v));

      return {
        outerOffset: folded * halfDepth * endFade,
        innerFollow: thinWall !== undefined ? 0.92 : 0.84,
        ...(thinWall !== undefined ? { uniformWallThicknessMm: thinWall } : {}),
      };
    };
  },
};
