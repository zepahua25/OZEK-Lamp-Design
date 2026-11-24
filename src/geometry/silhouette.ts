import { SilhouetteParams } from '../types/lamp';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates the radial multiplier for a superellipse cross-section.
 * n = 2 -> exact circle (1.0 everywhere).
 * n = 4..7 -> rounded square / squircle (UMINO 006 ALT / twisted square aesthetic).
 * Normalized so mean radius stays near 1.0 across n.
 */
export function superellipseMultiplier(theta: number, n: number): number {
  if (n <= 2.02) return 1.0;
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  const raw = Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n);
  // Area-preserving normalization factor so superellipse doesn't balloon unexpectedly
  // For n=2 -> 1.0, n=4 -> ~0.927, n=7 -> ~0.895
  const norm = 1.0 / (1.0 + 0.13 * (1.0 - 2.0 / n));
  return raw * norm;
}

/**
 * Evaluates the nominal silhouette radius R(v) in millimeters for normalized height v in [0, 1].
 * Supports 4 collection-ready profiles: curve, stepped (UMINO pedestal), conical (mushroom), wavy (stacked rings).
 */
export function evaluateSilhouetteRadius(
  vRaw: number,
  p: SilhouetteParams
): number {
  const v = clamp(vRaw, 0, 1);
  const { baseRadius, midRadius, topRadius, curvature } = p;

  if (p.type === 'curve') {
    // Two-segment smooth C1 Hermite/cosine interpolation peaking at v = curvature
    const c = clamp(curvature, 0.15, 0.85);
    if (v <= c) {
      const t = v / c;
      // Smooth ease-out-in toward belly
      const s = Math.sin(t * Math.PI * 0.5);
      const blend = 0.35 * (t * t * (3 - 2 * t)) + 0.65 * s;
      return baseRadius + (midRadius - baseRadius) * blend;
    } else {
      const t = (v - c) / (1 - c);
      const s = 1 - Math.cos(t * Math.PI * 0.5);
      const blend = 0.35 * (t * t * (3 - 2 * t)) + 0.65 * s;
      return midRadius + (topRadius - midRadius) * blend;
    }
  }

  if (p.type === 'stepped') {
    // UMINO F019 / F038 architectural pedestal + shade with printable ~45-50° transition
    const split = clamp(p.stepHeightRatio, 0.22, 0.6);
    const deltaR = Math.max(0, midRadius - baseRadius);
    // Keep transition slope <= ~48° for support-free Bambu Lab A1 printing
    const minTransitionV = clamp((deltaR * 0.95) / Math.max(p.height, 60), 0.06, 0.24);
    const t0 = clamp(split - minTransitionV * 0.35, 0.08, 0.72);
    const t1 = clamp(t0 + minTransitionV, t0 + 0.05, 0.88);

    // Subtle taper on lower pedestal and upper shade
    const lowerR = baseRadius * (1.0 - 0.03 * (v / Math.max(split, 0.01)));
    const upperT = clamp((v - t1) / Math.max(1 - t1, 0.01), 0, 1);
    const upperR = midRadius + (topRadius - midRadius) * upperT;

    const blend = smoothstep(t0, t1, v);
    return lowerR * (1 - blend) + upperR * blend;
  }

  if (p.type === 'conical') {
    // UMINO F006 iconic tapered stem + wide conical pleated shade
    const split = clamp(p.stepHeightRatio, 0.25, 0.58);
    const neckR = baseRadius * 0.82;
    const flareSpan = clamp(((midRadius - neckR) * 0.85) / Math.max(p.height, 80), 0.08, 0.22);
    const tFlareEnd = clamp(split + flareSpan, split + 0.06, 0.78);

    if (v <= split) {
      const t = v / split;
      return baseRadius + (neckR - baseRadius) * t;
    }
    if (v <= tFlareEnd) {
      const t = smoothstep(split, tFlareEnd, v);
      return neckR + (midRadius - neckR) * t;
    }
    const t = (v - tFlareEnd) / Math.max(1 - tFlareEnd, 0.01);
    // Slight architectural concavity/linearity up to topRadius
    const curvePower = 0.85 + 0.35 * (1 - curvature);
    return midRadius + (topRadius - midRadius) * Math.pow(t, curvePower);
  }

  // 'wavy' — UMINO S011 / Wavy Table Lamp stacked pillowed rings
  const baseEnv = (() => {
    const c = clamp(curvature, 0.2, 0.8);
    if (v <= c) {
      const t = smoothstep(0, c, v);
      return baseRadius + (midRadius - baseRadius) * t;
    }
    const t = smoothstep(c, 1, v);
    return midRadius + (topRadius - midRadius) * t;
  })();

  const rings = Math.max(2, Math.round(p.wavyRings));
  // Fade lobes smoothly near bottom mount (v < 0.08) and top rim (v > 0.96)
  const endFade = smoothstep(0.04, 0.14, v) * (1 - smoothstep(0.93, 1.0, v) * 0.55);
  // Pillowed wave: |sin| creates soft rounded bellows with crisp creases like S011
  const phase = v * rings * Math.PI;
  const pillow = Math.pow(Math.abs(Math.sin(phase)), 0.75) * 2.0 - 1.0;
  return Math.max(20, baseEnv + pillow * (p.wavyDepth * 0.5) * endFade);
}
