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
    const vt = Math.max(3, Math.min(12, Math.round(config.origami.vertTiers)));
    // Exact EVEN integer multiples of hf and vt so vertices align directly on every diamond crease!
    const uMult = draft
      ? Math.max(6, Math.min(12, Math.floor(144 / hf) & ~1))
      : Math.max(10, Math.min(20, Math.floor(288 / hf) & ~1));
    const vMult = draft
      ? Math.max(8, Math.min(14, Math.floor(96 / vt) & ~1))
      : Math.max(12, Math.min(22, Math.floor(192 / vt) & ~1));
    const radialSegs = Math.min(384, Math.max(72, hf * Math.max(4, uMult)));
    const heightSegs = Math.min(240, Math.max(48, vt * Math.max(4, vMult)));
    return { radialSegs, heightSegs };
  },

  createEvaluator(config: LampConfig) {
    const { horizFacets, vertTiers, depth, twistDeg, edgeSoftness, wallThickness } = config.origami;
    const hf = Math.max(6, Math.min(24, Math.round(horizFacets)));
    const vt = Math.max(3, Math.min(12, Math.round(vertTiers)));
    const halfDepth = clamp(depth, 3, 14) * 0.5;
    const twistRad = (clamp(twistDeg, 0, 180) * Math.PI) / 180;
    const soft = clamp(edgeSoftness, 0, 1);
    // Crisp crease bevel: eps = 0.008 at soft=0 (architectural knife-edge) up to 0.085 at soft=1
    const creaseEps = 0.008 + soft * 0.077;
    const thinWall = wallThickness !== undefined ? clamp(wallThickness, 0.8, 2.4) : undefined;

    return (ctx: DisplacementContext): DisplacementResult => {
      const uEff = ctx.u + (twistRad * ctx.v) / (2 * Math.PI);
      const uPhase = uEff * hf;
      const vPhase = ctx.v * vt;

      // Exact piecewise-linear Yoshimura diamond tessellation:
      // da + db = constant along flat planar triangular facets meeting at crisp diagonal & horizontal creases!
      const da = beveledTriangle01(uPhase + vPhase * 0.5, creaseEps);
      const db = beveledTriangle01(uPhase - vPhase * 0.5, creaseEps);
      const diamondFacet = 1.0 - (da + db); // +1 at peak, -1 at trough, flat planes between creases!
      const horizFold = 1.0 - 2.0 * beveledTriangle01(vPhase, creaseEps);
      const folded = clamp(diamondFacet * 0.88 + horizFold * 0.12, -1, 1);

      // Clean compact rim fade so top & bottom edges sit flat on Z = 0 for Vase Mode printing!
      const endFade = smoothstep(0.015, 0.055, ctx.v) * (1 - smoothstep(0.945, 0.985, ctx.v));

      return {
        outerOffset: folded * halfDepth * endFade,
        // Follow creases tightly on inner wall for uniform translucent origami paper thickness
        innerFollow: thinWall !== undefined ? 0.92 : 0.84,
        ...(thinWall !== undefined ? { uniformWallThicknessMm: thinWall } : {}),
      };
    };
  },
};
