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
 * Estilo 2: Helicoidal / Espiral (Amber translucent twisted ribs, Faceted Diamond Lattice,
 * and optional 3-ring horizontal Obi belt "☰" for OZ☰K EN 03).
 */
export const helicalFamily: LampFamilyDefinition = {
  id: 'helical',
  name: 'Helicoidal / Espiral',
  shortName: 'Helicoidal',
  tagline: 'Costillas en espiral cálidas o torre reloj de arena ceñida con cinturón ☰',

  getResolution(config: LampConfig, draft: boolean) {
    const ribs = Math.max(12, Math.min(64, Math.round(config.helical.ribCount)));
    // Exact integer multiple of ribCount (4 samples/rib in draft, 8 or 4 in final) so EVERY crest & valley
    // lands directly on a mesh edge along the twisted helix — ZERO sawtooth aliasing & lighter CAD STL!
    const perRib = draft ? 4 : ribs * 8 <= 384 ? 8 : 4;
    const radialSegs = Math.max(48, ribs * perRib);
    // Because mesh columns follow the diagonal ribs directly, vertical resolution stays super clean & lean
    // (solidBuilder additionally injects dense local Y-rings right inside the 3-ring Obi belt!)
    const heightSegs = config.helical.doubleProfile
      ? draft
        ? 96
        : 180
      : draft
        ? 56
        : 112;
    return { radialSegs, heightSegs };
  },

  getAxialTwistRad(config: LampConfig, v = 1): number {
    if (config.helical.doubleProfile) return 0;
    const deg = config.helical.twistDeg || 0;
    if (Math.abs(deg) < 0.01) return 0;
    return ((deg * Math.PI) / 180) * config.helical.twistDirection * v;
  },

  wantsBottomVentilation(config: LampConfig): boolean {
    return config.helical.bottomVentilation;
  },

  createEvaluator(config: LampConfig) {
    const {
      ribCount,
      ribDepth,
      twistDeg,
      twistDirection,
      profile,
      doubleProfile,
      doubleMix,
      obiBelt,
    } = config.helical;

    const hasObiBelt = Boolean(obiBelt);
    const ribs = Math.max(12, Math.min(64, Math.round(ribCount)));
    const totalTwistRad = ((twistDeg * Math.PI) / 180) * twistDirection;
    const halfDepth = ribDepth * 0.5;

    const evalWave = (phase: number): number => {
      if (profile === 'sine') {
        return Math.cos(phase);
      }
      const norm = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
      if (profile === 'faceted') {
        // Sharp optical prism facets catching grazing warm light
        const tri = 1 - 4 * Math.abs(norm - 0.5);
        return Math.sign(tri) * Math.pow(Math.abs(tri), 0.78);
      }
      // 'sawtooth' — crisp angled directional blades (peakPos = 0.25 lands EXACTLY on mesh column u % 4 === 1!)
      const peakPos = 0.25;
      if (norm < peakPos) {
        return -1 + (2 * norm) / peakPos;
      }
      return 1 - (2 * (norm - peakPos)) / (1 - peakPos);
    };

    return (ctx: DisplacementContext): DisplacementResult => {
      const twistAtV = totalTwistRad * ctx.v;
      // When the mesh grid rings are already helix-aligned (ctx.gridTwisted === true), evaluate strictly on
      // thetaBase without adding twistAtV again so every mesh edge follows the exact diagonal crest & valley!
      const p1 = ctx.gridTwisted ? ctx.theta * ribs : (ctx.theta + twistAtV) * ribs;
      const primary = evalWave(p1);

      let combined = primary;
      if (doubleProfile) {
        // Crisp UMINO F017 Faceted Diamond Cell interference!
        const p2 = (ctx.theta - twistAtV) * ribs;
        const secondary = evalWave(p2);
        const mix = Math.max(0.2, Math.min(1.0, doubleMix));
        // Sharp diamond ridge borders around luminous concave/flat diamond windows
        const ridge1 = 1 - Math.abs(primary);
        const ridge2 = 1 - Math.abs(secondary);
        const diamondCell = Math.max(ridge1, ridge2 * mix) * 2 - 1;
        const classicCross = 0.5 * (primary + secondary * mix);
        combined =
          profile === 'faceted'
            ? diamondCell * 0.8 + classicCross * 0.2
            : classicCross * 0.65 + Math.max(primary, secondary * mix) * 0.35;
      }

      // Smoothly attenuate ribDepth to 0 over the bottom 3 mm (v = 0..0.015) so nothing overhangs the flush base!
      const bottomRibFade = smoothstep(0.0, 0.015, ctx.v);
      let outerOffset = combined * halfDepth * bottomRibFade;
      let innerFollow = doubleProfile ? 0.3 : 0.42;

      if (hasObiBelt) {
        // 3 horizontal rounded Obi rings ("☰") cinched at the waist (v ≈ 0.46–0.54):
        // +1.8 mm total relief, 2.5 mm spacing (-2.5, 0, +2.5 mm), <= 45° self-supporting flanks!
        const yWaist = (ctx.v - 0.5) * ctx.height;
        const absY = Math.abs(yWaist);
        if (absY < 7.2) {
          const beltEnv = 1 - smoothstep(3.85, 6.4, absY);
          const ribFade = 1 - beltEnv;

          let ringMax = 0;
          const ringCenters = [-2.5, 0, 2.5];
          for (let i = 0; i < 3; i++) {
            const dy = Math.abs(yWaist - ringCenters[i]);
            if (dy < 1.24) {
              const u = dy / 1.24;
              const profileVal = 0.5 * (1 + Math.cos(Math.PI * u));
              if (profileVal > ringMax) ringMax = profileVal;
            }
          }

          // Smooth raised collar (+0.95 mm over 2.55 mm -> 20°) + 3 rounded rings (+0.85 mm -> 1.80 mm total relief!)
          const obiOffset = 0.95 * beltEnv + 0.85 * ringMax;
          outerOffset = outerOffset * ribFade + obiOffset;
          innerFollow = innerFollow * ribFade;
        }
      }

      return {
        outerOffset,
        // Semi-smooth inner wall gives natural translucent thickness bands when backlit
        innerFollow,
      };
    };
  },
};
