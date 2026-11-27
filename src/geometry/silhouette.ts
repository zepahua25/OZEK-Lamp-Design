import {
  LampConfig,
  LampSizePreset,
  MountType,
  SculptStroke,
  SilhouetteParams,
  SplineControlPoint,
} from '../types/lamp';
import {
  BAYONET_DEPTH_MM,
  COMPACT_FLUSH_LUG_DEPTH_MM,
  SLENDER_E26_SHADE_HUB_OUTER_RADIUS_MM,
  THREAD_DEPTH_MM,
  couplingUsesBayonet,
  getEffectiveNeckRadius,
  isSlenderE26Mode,
} from './coupling';
import { getLedKit001Dimensions } from './mounts/ledKit001';
import { getSocketE26Dimensions } from './mounts/socketE26';

export const SHADE_SIZE_PRESETS: Record<
  LampSizePreset,
  { id: LampSizePreset; label: string; heightMm: number }
> = {
  XS: { id: 'XS', label: 'XS', heightMm: 125 },
  S: { id: 'S', label: 'S', heightMm: 150 },
  M: { id: 'M', label: 'M', heightMm: 170 },
  L: { id: 'L', label: 'L', heightMm: 200 },
  XL: { id: 'XL', label: 'XL', heightMm: 235 },
};

/** Continuous shade-only scale factor in [0.75, 1.40] (never affects base, socket, or coupling). */
export function getEffectiveShadeScale(p: SilhouetteParams): number {
  return clamp(p.shadeScale ?? 1.0, 0.75, 1.4);
}

/** Effective physical height (mm) of the shade after applying `shadeScale`, clamped to Bambu A1 bounds. */
export function getEffectiveShadeHeight(p: SilhouetteParams): number {
  return clamp(p.height * getEffectiveShadeScale(p), 90, 250);
}

/**
 * Computes the strict minimum outer base radius (mm) required for the shade to cleanly enclose
 * the fixed hardware mount / coupling ring (Ø75 compact flush base, Ø59.7 LED Kit 001, Ø40.5 E26/E27,
 * or bayonet/thread female hub). Guarantees scaling down the shade NEVER crushes the socket!
 */
export function getMinSafeShadeBaseRadius(config: LampConfig): number {
  const { silhouette, base, mount } = config;
  const wallT = clamp(mount.wallThickness, 1.6, 3.2);
  const isTwoPart = silhouette.buildMode === 'two_part' && mount.position === 'bottom';

  if (isTwoPart) {
    if (isSlenderE26Mode(config)) {
      return SLENDER_E26_SHADE_HUB_OUTER_RADIUS_MM + wallT + 2.0;
    }
    const rMaleBase = getEffectiveNeckRadius(config);
    const isCompactFlush = base.style === 'compact_flush';
    const extraCoupling = isCompactFlush
      ? COMPACT_FLUSH_LUG_DEPTH_MM + 0.25
      : couplingUsesBayonet(base)
        ? BAYONET_DEPTH_MM + 0.25
        : base.coupling === 'thread'
          ? THREAD_DEPTH_MM
          : 0;
    const clr =
      !isCompactFlush && base.coupling === 'gravity_seat'
        ? Math.max(0.4, base.couplingClearance)
        : clamp(base.couplingClearance, 0.2, 0.65);
    const rHubOut = rMaleBase + clr + extraCoupling + Math.max(2.6, wallT + 0.6);
    return rHubOut + wallT + 1.2;
  }

  if (mount.type === 'led_kit_001') {
    const led = getLedKit001Dimensions(mount);
    return led.cavityRadiusMm + wallT + 2.0;
  }
  const e26 = getSocketE26Dimensions(mount);
  return e26.hubOuterRadiusMm + wallT + 1.5;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Curated 5-point 2D spline templates for the interactive Silhouette Curve Editor */
export const SILHOUETTE_SPLINE_TEMPLATES: Record<
  'mushroom' | 'amphora' | 'conical' | 'hourglass' | 'cylinder' | 'sphere',
  { label: string; points: SplineControlPoint[] }
> = {
  mushroom: {
    label: 'Hongo',
    points: [
      { v: 0.0, r: 52 },
      { v: 0.28, r: 96 },
      { v: 0.56, r: 90 },
      { v: 0.82, r: 64 },
      { v: 1.0, r: 34 },
    ],
  },
  amphora: {
    label: 'Ánfora',
    points: [
      { v: 0.0, r: 50 },
      { v: 0.3, r: 78 },
      { v: 0.58, r: 84 },
      { v: 0.84, r: 54 },
      { v: 1.0, r: 44 },
    ],
  },
  conical: {
    label: 'Cónica',
    points: [
      { v: 0.0, r: 94 },
      { v: 0.25, r: 82 },
      { v: 0.5, r: 68 },
      { v: 0.75, r: 52 },
      { v: 1.0, r: 36 },
    ],
  },
  hourglass: {
    label: 'Reloj',
    points: [
      { v: 0.0, r: 78 },
      { v: 0.28, r: 62 },
      { v: 0.52, r: 48 },
      { v: 0.78, r: 66 },
      { v: 1.0, r: 78 },
    ],
  },
  cylinder: {
    label: 'Cilindro',
    points: [
      { v: 0.0, r: 68 },
      { v: 0.25, r: 70 },
      { v: 0.5, r: 70 },
      { v: 0.75, r: 70 },
      { v: 1.0, r: 68 },
    ],
  },
  sphere: {
    label: 'Esfera',
    points: [
      { v: 0.0, r: 44 },
      { v: 0.25, r: 80 },
      { v: 0.5, r: 94 },
      { v: 0.75, r: 80 },
      { v: 1.0, r: 44 },
    ],
  },
};

/**
 * Evaluates the radial multiplier for a superellipse cross-section.
 */
export function superellipseMultiplier(theta: number, n: number): number {
  if (n <= 2.02) return 1.0;
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  const raw = Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n);
  const norm = 1.0 / (1.0 + 0.13 * (1.0 - 2.0 / n));
  return raw * norm;
}

/**
 * Evaluates a smooth rounded regular polygon multiplier (6 - 12 sides).
 * rounding in [0, 1]: 0 = crisp architectural polygon with gentle print fillet, 1 = soft lobed circle.
 */
export function polygonMultiplier(theta: number, sidesRaw: number, roundingRaw: number): number {
  const sides = Math.max(6, Math.min(12, Math.round(sidesRaw)));
  const rounding = clamp(roundingRaw, 0, 1);
  const sector = (2 * Math.PI) / sides;
  const normTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const local = ((normTheta + sector * 0.5) % sector) - sector * 0.5;
  // Exact regular polygon radial distance: cos(PI/N) / cos(local)
  const exactPoly = Math.cos(Math.PI / sides) / Math.max(0.4, Math.cos(local));
  // Soft corner rounding via cosine power blending toward 1.0
  const softCorner = 1.0 + (exactPoly - 1.0) * (1.0 - rounding * 0.72);
  // Subtle C1 corner smoothing right near polygon vertices (|local| -> sector/2)
  const vertexProximity = smoothstep(sector * 0.34, sector * 0.5, Math.abs(local));
  const cornerFillet = 1.0 - vertexProximity * (0.015 + rounding * 0.025);
  return softCorner * cornerFillet;
}

/**
 * Evaluates an elliptical cross-section multiplier (aspect in [0.60, 1.00]), area-normalized.
 */
export function ellipseMultiplier(theta: number, aspectRaw: number): number {
  const aspect = clamp(aspectRaw, 0.58, 1.0);
  if (aspect >= 0.995) return 1.0;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const r = 1.0 / Math.sqrt(c * c + (s * s) / (aspect * aspect));
  // Normalize by 1/sqrt(aspect) so mean radius matches nominal silhouette radius
  return r / Math.sqrt(aspect);
}

/**
 * Evaluates a Concave Square ("Cuadrada Cóncava" — 4 sculpted rounded corners at 45°, 135°, 225°, 315°
 * with smooth inward-bowed concave sides at 0°, 90°, 180°, 270°, aligned with X-Corners spider arms!).
 */
export function concaveSquareMultiplier(theta: number, depthRaw = 0.2): number {
  const depth = clamp(depthRaw, 0.06, 0.32);
  // Peaks (+1) at 45°, 135°, 225°, 315°; troughs (-1) at 0°, 90°, 180°, 270°
  const c4 = Math.cos(4 * (theta - Math.PI / 4));
  const cornerPeak = Math.pow(0.5 + 0.5 * c4, 1.35);
  return 1.0 - depth * 0.45 + depth * 1.15 * cornerPeak;
}

/**
 * Evaluates a Flower / Petals ("Flor / Pétalos" — 6 to 10 plump rounded lobes with crisp smooth valleys).
 */
export function flowerMultiplier(theta: number, lobesRaw = 8, depthRaw = 0.13): number {
  const lobes = Math.max(6, Math.min(10, Math.round(lobesRaw)));
  const depth = clamp(depthRaw, 0.04, 0.24);
  const wave = 0.5 + 0.5 * Math.cos(lobes * theta);
  const petal = Math.pow(wave, 0.72);
  return 1.0 - depth * 0.55 + depth * petal;
}

/**
 * Unified Cross-Section Evaluator supporting Circle, Superellipse, Ellipse, Soft Polygon (6-12),
 * Concave Square (4 sculpted corners), and Flower / Petals (6-10 lobes),
 * combinable with progressive height twist (`sectionTwistDeg`) and mount-area circular blending!
 */
export function evaluateCrossSectionMultiplier(
  theta: number,
  v: number,
  p: SilhouetteParams,
  blendFactor = 1.0
): number {
  const b = clamp(blendFactor, 0, 1);
  if (b <= 0.001) return 1.0;

  const twistRad = (((p.sectionTwistDeg || 0) * Math.PI) / 180) * clamp(v, 0, 1);
  const tEff = theta + twistRad;
  const kind = p.crossSectionType ?? (p.superellipse > 2.05 ? 'superellipse' : 'circle');

  let raw = 1.0;
  if (kind === 'superellipse') {
    const effN = 2.0 + (Math.max(2.0, p.superellipse) - 2.0) * b;
    return superellipseMultiplier(tEff, effN);
  } else if (kind === 'ellipse') {
    raw = ellipseMultiplier(tEff, p.ellipseAspect ?? 0.78);
  } else if (kind === 'polygon') {
    raw = polygonMultiplier(tEff, p.polygonSides ?? 8, p.polygonRounding ?? 0.35);
  } else if (kind === 'concave_square') {
    raw = concaveSquareMultiplier(tEff, p.concaveDepth ?? 0.2);
  } else if (kind === 'flower') {
    raw = flowerMultiplier(tEff, p.flowerLobes ?? 8, p.flowerDepth ?? 0.13);
  } else {
    // Legacy compatibility: if crossSectionType === 'circle' but superellipse slider > 2.05, honor superellipse
    if (p.superellipse > 2.05) {
      const effN = 2.0 + (p.superellipse - 2.0) * b;
      return superellipseMultiplier(tEff, effN);
    }
    return 1.0;
  }

  return 1.0 + (raw - 1.0) * b;
}

/**
 * Evaluates a monotone cubic Hermite spline through sorted control points [(v0, r0)...(vk, rk)].
 * Zero overshoot/ringing -> always produces clean, printable designer curves!
 */
export function evaluateMonotoneSpline(
  vRaw: number,
  pointsInput: ReadonlyArray<SplineControlPoint>
): number {
  if (!pointsInput || pointsInput.length < 2) {
    return 65;
  }
  const pts = [...pointsInput]
    .map((pt) => ({ v: clamp(pt.v, 0, 1), r: clamp(pt.r, 22, 125) }))
    .sort((a, b) => a.v - b.v);

  const v = clamp(vRaw, pts[0].v, pts[pts.length - 1].v);
  const n = pts.length;

  // Compute secant slopes
  const d: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dv = Math.max(1e-4, pts[i + 1].v - pts[i].v);
    d[i] = (pts[i + 1].r - pts[i].r) / dv;
  }

  // Fritsch-Carlson monotone tangents
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (d[i - 1] + d[i]) * 0.5;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-6) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / d[i];
      const beta = m[i + 1] / d[i];
      const mag = Math.hypot(alpha, beta);
      if (mag > 3) {
        const scale = 3 / mag;
        m[i] = scale * alpha * d[i];
        m[i + 1] = scale * beta * d[i];
      }
    }
  }

  // Locate segment
  let seg = n - 2;
  for (let i = 0; i < n - 1; i++) {
    if (v <= pts[i + 1].v) {
      seg = i;
      break;
    }
  }
  const dv = Math.max(1e-4, pts[seg + 1].v - pts[seg].v);
  const t = clamp((v - pts[seg].v) / dv, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return clamp(
    h00 * pts[seg].r + h10 * dv * m[seg] + h01 * pts[seg + 1].r + h11 * dv * m[seg + 1],
    22,
    125
  );
}

/**
 * Evaluates the nominal silhouette radius R(v) in millimeters for normalized height v in [0, 1].
 * Supports 5 profiles: curve, stepped, conical, wavy, and v2.0 interactive custom_spline!
 */
export function evaluateSilhouetteRadius(
  vRaw: number,
  p: SilhouetteParams
): number {
  const v = clamp(vRaw, 0, 1);
  const scale = getEffectiveShadeScale(p);

  if (p.type === 'custom_spline' && p.controlPoints && p.controlPoints.length >= 2) {
    return clamp(evaluateMonotoneSpline(v, p.controlPoints) * scale, 22, 125);
  }

  const baseRadius = p.baseRadius * scale;
  const midRadius = p.midRadius * scale;
  const topRadius = p.topRadius * scale;
  const { curvature } = p;
  const effHeight = getEffectiveShadeHeight(p);

  if (p.type === 'curve') {
    const c = clamp(curvature, 0.15, 0.85);
    if (v <= c) {
      const t = v / c;
      const s = Math.sin(t * Math.PI * 0.5);
      const blend = 0.35 * (t * t * (3 - 2 * t)) + 0.65 * s;
      return clamp(baseRadius + (midRadius - baseRadius) * blend, 22, 125);
    } else {
      const t = (v - c) / (1 - c);
      const s = 1 - Math.cos(t * Math.PI * 0.5);
      const blend = 0.35 * (t * t * (3 - 2 * t)) + 0.65 * s;
      return clamp(midRadius + (topRadius - midRadius) * blend, 22, 125);
    }
  }

  if (p.type === 'stepped') {
    const split = clamp(p.stepHeightRatio, 0.22, 0.6);
    const deltaR = Math.max(0, midRadius - baseRadius);
    const minTransitionV = clamp((deltaR * 0.95) / Math.max(effHeight, 60), 0.06, 0.24);
    const t0 = clamp(split - minTransitionV * 0.35, 0.08, 0.72);
    const t1 = clamp(t0 + minTransitionV, t0 + 0.05, 0.88);

    const lowerR = baseRadius * (1.0 - 0.03 * (v / Math.max(split, 0.01)));
    const upperT = clamp((v - t1) / Math.max(1 - t1, 0.01), 0, 1);
    const upperR = midRadius + (topRadius - midRadius) * upperT;

    const blend = smoothstep(t0, t1, v);
    return clamp(lowerR * (1 - blend) + upperR * blend, 22, 125);
  }

  if (p.type === 'conical') {
    const split = clamp(p.stepHeightRatio, 0.25, 0.58);
    const neckR = baseRadius * 0.82;
    const flareSpan = clamp(((midRadius - neckR) * 0.85) / Math.max(effHeight, 80), 0.08, 0.22);
    const tFlareEnd = clamp(split + flareSpan, split + 0.06, 0.78);

    if (v <= split) {
      const t = v / split;
      return clamp(baseRadius + (neckR - baseRadius) * t, 22, 125);
    }
    if (v <= tFlareEnd) {
      const t = smoothstep(split, tFlareEnd, v);
      return clamp(neckR + (midRadius - neckR) * t, 22, 125);
    }
    const t = (v - tFlareEnd) / Math.max(1 - tFlareEnd, 0.01);
    const curvePower = 0.85 + 0.35 * (1 - curvature);
    return clamp(midRadius + (topRadius - midRadius) * Math.pow(t, curvePower), 22, 125);
  }

  // 'wavy' — UMINO S011 stacked pillowed rings
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
  const endFade = smoothstep(0.04, 0.14, v) * (1 - smoothstep(0.93, 1.0, v) * 0.55);
  const phase = v * rings * Math.PI;
  const pillow = Math.pow(Math.abs(Math.sin(phase)), 0.75) * 2.0 - 1.0;
  return clamp(baseEnv + pillow * (p.wavyDepth * scale * 0.5) * endFade, 22, 125);
}

/**
 * Detects whether the active SilhouetteParams correspond to the "Esfera" profile
 * (either directly from the Esfera button or proportionally scaled via S/M/L presets).
 */
export function isSphereSilhouette(p: SilhouetteParams): boolean {
  if (p.type === 'custom_spline' && p.controlPoints && p.controlPoints.length >= 5) {
    const pts = p.controlPoints;
    const r0 = pts[0].r;
    const r1 = pts[1].r;
    const r2 = pts[2].r;
    const r3 = pts[3].r;
    const r4 = pts[4].r;
    if (r2 <= 25) return false;
    const n0 = r0 / r2;
    const n1 = r1 / r2;
    const n3 = r3 / r2;
    const n4 = r4 / r2;
    // Matches SILHOUETTE_SPLINE_TEMPLATES.sphere ratios (44/94 ≈ 0.468, 80/94 ≈ 0.851) symmetrically
    return (
      Math.abs(n0 - n4) < 0.08 &&
      Math.abs(n1 - n3) < 0.08 &&
      Math.abs(n0 - 0.468) < 0.14 &&
      Math.abs(n1 - 0.851) < 0.12
    );
  }
  return false;
}

/**
 * Evaluates silhouette radius including optional smooth upper dome/sphere closure (`closeTopDome`):
 *  - When profile is "Esfera" + `closeTopDome` is active: bypasses the 5-point spline entirely and evaluates
 *    the EXACT mathematical sphere equation `r(y) = sqrt(max(0, R² - (y - yc)²))`, truncated cleanly at y = 0
 *    (-0.78 * R below sphere center yc) and closing perfectly to the North Pole at y = yc + R!
 *  - Other profiles + `closeTopDome`: smoothly closes upper crown to R = 0 mm (LED Kit 001) or Ø16 mm vent (E26/E27).
 */
export function evaluateEffectiveSilhouetteRadius(
  vRaw: number,
  p: SilhouetteParams,
  mountType: MountType,
  wallT: number,
  invertedForPendant = false
): number {
  const v = clamp(vRaw, 0, 1);

  if (p.closeTopDome && !invertedForPendant && isSphereSilhouette(p)) {
    // Exact mathematical sphere: base truncated at y = 0 => yc = 0.78 * R, North Pole at y = yc + R = 1.78 * R
    const H = Math.max(60, getEffectiveShadeHeight(p));
    const R = clamp(H / 1.78, 34, 118);
    const yc = 0.78 * R;
    const rTopTarget = mountType === 'led_kit_001' ? Math.max(2.4, wallT + 1.1) : 8.0 + wallT;
    // Exact sphere height where r(yTop) == rTopTarget (for LED 001 r=2.4 mm, yTop is within 0.03 mm of yc + R!)
    const yTopExact = yc + Math.sqrt(Math.max(0, R * R - rTopTarget * rTopTarget));
    const y = v * yTopExact;
    const dy = y - yc;
    const rExact = Math.sqrt(Math.max(0, R * R - dy * dy));
    return Math.max(rTopTarget, rExact);
  }

  const rawR = evaluateSilhouetteRadius(v, p);
  if (!p.closeTopDome || invertedForPendant) {
    return rawR;
  }

  const vDomeStart = 0.72;
  if (v <= vDomeStart) return rawR;

  const t = clamp((v - vDomeStart) / (1.0 - vDomeStart), 0, 1);
  const rStart = evaluateSilhouetteRadius(vDomeStart, p);
  const rTarget = mountType === 'led_kit_001' ? Math.max(2.6, wallT + 1.2) : 8.0 + wallT;

  const sphereArch = Math.cos(t * Math.PI * 0.5);
  const smoothBlend = 1 - smoothstep(0, 1, t);
  const factor = 0.65 * sphereArch + 0.35 * smoothBlend;
  return rTarget + Math.max(0, rStart - rTarget) * factor;
}

/**
 * Evaluates persistent interactive 3D Sculpt Brush strokes continuously on periodic (u, v) coordinates.
 * Guarantees C1 smooth deformation -> 100% watertight 2-manifold meshes!
 */
export function evaluateSculptField(
  u: number,
  v: number,
  heightMm: number,
  baseRadiusMm: number,
  strokes: ReadonlyArray<SculptStroke> | undefined
): { drMm: number; dThetaRad: number; smoothMask: number } {
  if (!strokes || strokes.length === 0) {
    return { drMm: 0, dThetaRad: 0, smoothMask: 0 };
  }

  const circumMm = Math.max(120, 2 * Math.PI * baseRadiusMm);
  let drMm = 0;
  let dThetaRad = 0;
  let smoothMask = 0;

  for (let i = 0; i < strokes.length; i++) {
    const st = strokes[i];
    const du = (((u - st.u) % 1) + 1.5) % 1 - 0.5;
    const dxMm = du * circumMm;
    const dyMm = (v - st.v) * heightMm;
    const distMm = Math.hypot(dxMm, dyMm);
    const rad = Math.max(10, st.radiusMm);
    if (distMm >= rad) continue;

    const q = 1 - distMm / rad;
    const falloff = q * q * (3 - 2 * q);
    const amp = clamp(st.strength, 0.05, 1.0) * falloff;

    if (st.tool === 'push') {
      drMm += amp * 12.0;
    } else if (st.tool === 'carve') {
      drMm -= amp * 10.0;
    } else if (st.tool === 'swirl') {
      dThetaRad += amp * 0.36;
      drMm += amp * 2.5;
    } else if (st.tool === 'smooth') {
      smoothMask = Math.min(1, smoothMask + amp * 0.85);
    }
  }

  return {
    drMm: clamp(drMm, -16, 22),
    dThetaRad: clamp(dThetaRad, -0.9, 0.9),
    smoothMask: clamp(smoothMask, 0, 0.92),
  };
}
