import { LampConfig } from '../../types/lamp';
import { DisplacementContext, DisplacementResult, LampFamilyDefinition } from '../registry';

/**
 * Estilo 2: Helicoidal / Espiral (Amber translucent twisted ribs + UMINO F017 Faceted Diamond Lattice).
 */
export const helicalFamily: LampFamilyDefinition = {
  id: 'helical',
  name: 'Helicoidal / Espiral',
  shortName: 'Helicoidal',
  tagline: 'Costillas en espiral ámbar o facetas diamante dobles con refracción cálida',

  getResolution(config: LampConfig, draft: boolean) {
    const ribs = Math.round(config.helical.ribCount);
    const radialSegs = Math.min(360, Math.max(draft ? 128 : 220, ribs * (draft ? 4 : 7)));
    const heightSegs = draft ? 76 : 150;
    return { radialSegs, heightSegs };
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
    } = config.helical;

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
      // 'sawtooth' — crisp angled directional blades like UMINO Amber Spiral (Image 1)
      const peakPos = 0.2;
      if (norm < peakPos) {
        return -1 + (2 * norm) / peakPos;
      }
      return 1 - (2 * (norm - peakPos)) / (1 - peakPos);
    };

    return (ctx: DisplacementContext): DisplacementResult => {
      const twistAtV = totalTwistRad * ctx.v;
      const p1 = ctx.theta * ribs + twistAtV;
      const primary = evalWave(p1);

      let combined = primary;
      if (doubleProfile) {
        // Crisp UMINO F017 Faceted Diamond Cell interference!
        const p2 = ctx.theta * ribs - twistAtV;
        const secondary = evalWave(p2);
        const mix = Math.max(0.2, Math.min(1.0, doubleMix));
        // Sharp diamond ridge borders around luminous concave/flat diamond windows
        const ridge1 = 1 - Math.abs(primary);
        const ridge2 = 1 - Math.abs(secondary);
        const diamondCell = Math.max(ridge1, ridge2 * mix) * 2 - 1;
        const classicCross = 0.5 * (primary + secondary * mix);
        combined = profile === 'faceted' ? diamondCell * 0.8 + classicCross * 0.2 : classicCross * 0.65 + Math.max(primary, secondary * mix) * 0.35;
      }

      return {
        outerOffset: combined * halfDepth,
        // Semi-smooth inner wall gives natural translucent thickness bands when backlit
        innerFollow: doubleProfile ? 0.3 : 0.42,
      };
    };
  },
};
