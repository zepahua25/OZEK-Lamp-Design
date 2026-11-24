import { LampConfig } from '../../types/lamp';
import { SimplexNoise3D } from '../noise';
import { DisplacementContext, DisplacementResult, LampFamilyDefinition } from '../registry';

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Estilo 4: Orgánica / Ondas Fluidas (Sweeping, silky-smooth domain-warped 3D Simplex ribbons).
 */
export const organicFamily: LampFamilyDefinition = {
  id: 'organic',
  name: 'Orgánica / Ondas Fluidas',
  shortName: 'Orgánica',
  tagline: 'Listones fluidos y relieves escultóricos con ruido 3D Simplex anti-voladizo',

  getResolution(_config: LampConfig, draft: boolean) {
    return {
      radialSegs: draft ? 112 : 200,
      heightSegs: draft ? 84 : 160,
    };
  },

  createEvaluator(config: LampConfig) {
    const { mode, scale, warp, bands, depth, overhangSmoothing, seed } = config.organic;
    const noise = new SimplexNoise3D(seed);
    const aspectY = config.silhouette.height / Math.max(config.silhouette.midRadius * 2, 90);
    const halfDepth = depth * 0.5;
    const smooth = Math.max(0, Math.min(1, overhangSmoothing));

    // Broad, sweeping spatial scale so contours flow organically without jagged FDM spikes
    const effScale = scale * 0.42;
    const effWarp = warp * 0.55;

    return (ctx: DisplacementContext): DisplacementResult => {
      // Seamless 3D coordinates on cylinder surface -> zero seam at theta = 0/2*PI
      const nx = Math.cos(ctx.theta) * effScale;
      const nz = -Math.sin(ctx.theta) * effScale;
      const ny = (ctx.v - 0.5) * 2.0 * aspectY * effScale;

      // Single-octave smooth domain-warped Simplex field for fluid sweeping flow
      let field: number;
      if (effWarp > 0.001) {
        const qx = noise.noise3D(nx + 2.7, ny - 1.3, nz + 4.1);
        const qy = noise.noise3D(nx - 3.9, ny + 2.1, nz - 1.8);
        const qz = noise.noise3D(nx + 1.1, ny + 5.2, nz - 3.4);
        field = noise.noise3D(nx + effWarp * qx, ny + effWarp * qy, nz + effWarp * qz);
      } else {
        field = noise.noise3D(nx, ny, nz);
      }

      let wave = 0;

      if (mode === 'ribbons') {
        // Sweeping luminous organic ribbons (inspired by glowing sculptural sphere)
        const ribbonArg = (field * (bands * 0.36) + ctx.v * 1.15) * Math.PI;
        const primary = Math.sin(ribbonArg);
        // Smooth sculpted crest (wide valleys, silky flowing ridges)
        const ridge = Math.sign(primary) * Math.pow(Math.abs(primary), 0.78 + smooth * 0.32);
        const gentleHarmonic = Math.sin(ribbonArg * 2.0) * 0.14 * (1 - smooth * 0.7);
        wave = Math.max(-1.0, Math.min(1.0, ridge + gentleHarmonic));
      } else if (mode === 'topo') {
        // Soft flowing topographic contour bands
        const phase = (field * 0.45 + ctx.v * 0.85) * bands * 0.75;
        const smoothBand = Math.sin(phase * Math.PI * 2);
        const softTerrace = Math.tanh(smoothBand * (1.8 - smooth * 0.8));
        wave = softTerrace;
      } else {
        // 'sculpt' — pure serene fluid dunes
        wave = Math.tanh(field * (1.5 - smooth * 0.35));
      }

      // Anti-overhang polar damping: gently tapers relief near bottom/top rims
      const lowerGuard = smoothstep(0.04, 0.16 + smooth * 0.12, ctx.v);
      const upperGuard = 1 - smoothstep(0.84 - smooth * 0.1, 0.99, ctx.v) * (0.3 + smooth * 0.4);
      const ampGuard = lowerGuard * upperGuard * (1 - smooth * 0.22);

      return {
        outerOffset: wave * halfDepth * ampGuard,
        // Semi-smooth inner wall gives warm lithophane-like translucent light ribbons!
        innerFollow: 0.28 + smooth * 0.25,
      };
    };
  },
};
