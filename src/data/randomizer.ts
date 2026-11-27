import {
  BaseStyleId,
  CouplingType,
  CrossSectionType,
  LampConfig,
  MaterialPresetId,
} from '../types/lamp';
import { SILHOUETTE_SPLINE_TEMPLATES } from '../geometry/silhouette';
import { cloneConfig } from './presets';

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(randRange(min, max + 1));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function roundStep(val: number, step: number): number {
  return Math.round(val / step) * step;
}

const SHADE_MATERIALS: MaterialPresetId[] = [
  'pla_white',
  'amber_translucent',
  'smoked_amber',
  'terracotta',
  'olive_green',
  'matte_black',
];

const BASE_MATERIALS: MaterialPresetId[] = [
  'matte_black',
  'stone_gray',
  'sand_wood',
  'terracotta',
  'olive_green',
  'pla_white',
];

const BASE_STYLES: BaseStyleId[] = [
  'dome',
  'pedestal',
  'cylinder',
  'conkel',
  'tripod',
  'compact_flush',
];
const COUPLINGS: CouplingType[] = ['gravity_seat', 'spider', 'thread', 'bayonet', 'friction'];
const SPLINE_KEYS = ['mushroom', 'amphora', 'conical', 'hourglass', 'cylinder', 'sphere'] as const;

export function shuffleLampConfig(current: LampConfig): LampConfig {
  const next = cloneConfig(current);
  const fam = next.family;

  next.silhouette.height = roundStep(randRange(125, 190), 5);

  // Pick a clean curated spline template + organic jitter so every shuffle looks architectural
  const tplKey =
    fam === 'japanese_flute'
      ? pick(['conical', 'mushroom', 'amphora'] as const)
      : pick(SPLINE_KEYS);
  const pts = SILHOUETTE_SPLINE_TEMPLATES[tplKey].points.map((pt) => ({
    v: pt.v,
    r: Math.max(32, Math.min(110, Math.round(pt.r + randRange(-8, 8)))),
  }));
  next.silhouette.type = 'custom_spline';
  next.silhouette.controlPoints = pts;
  next.silhouette.baseRadius = pts[0].r;
  next.silhouette.midRadius = pts[2].r;
  next.silhouette.topRadius = pts[4].r;

  // Cross-section variety (circle / superellipse / ellipse / polygon / concave_square / flower + twist)
  const csChoices: CrossSectionType[] =
    fam === 'origami'
      ? ['circle', 'polygon']
      : fam === 'japanese_flute' || fam === 'pleated'
        ? ['circle', 'concave_square', 'flower', 'ellipse', 'polygon']
        : fam === 'louvers'
          ? ['superellipse', 'circle', 'ellipse', 'concave_square']
          : ['circle', 'circle', 'ellipse', 'polygon', 'flower', 'concave_square'];
  const cs = pick(csChoices);
  next.silhouette.crossSectionType = cs;
  next.silhouette.superellipse = cs === 'superellipse' ? roundStep(randRange(3.4, 5.2), 0.2) : 2.0;
  next.silhouette.ellipseAspect = cs === 'ellipse' ? roundStep(randRange(0.72, 0.9), 0.02) : 0.85;
  next.silhouette.polygonSides = cs === 'polygon' ? randInt(6, 12) : 8;
  next.silhouette.polygonRounding = roundStep(randRange(0.25, 0.6), 0.05);
  next.silhouette.concaveDepth = cs === 'concave_square' ? roundStep(randRange(0.14, 0.24), 0.02) : 0.2;
  next.silhouette.flowerLobes = cs === 'flower' ? randInt(6, 10) : 8;
  next.silhouette.flowerDepth = cs === 'flower' ? roundStep(randRange(0.09, 0.17), 0.02) : 0.13;
  next.silhouette.sectionTwistDeg =
    cs !== 'circle' && Math.random() < 0.45 ? roundStep(randRange(15, 75), 15) : 0;

  next.silhouette.skirtWaveAmp =
    fam === 'japanese_flute' || (tplKey === 'conical' && Math.random() < 0.45)
      ? roundStep(randRange(5, 13), 1)
      : 0;
  next.silhouette.skirtWaveCount = randInt(4, 7);

  if (next.silhouette.buildMode === 'two_part' && next.mount.position === 'bottom') {
    const style = pick(BASE_STYLES);
    next.base.style = style;
    next.base.finish =
      style !== 'tripod' && style !== 'compact_flush' && Math.random() < 0.45
        ? 'ribbed'
        : 'smooth';
    next.base.ribCount = randInt(48, 88);
    next.base.coupling =
      style === 'compact_flush'
        ? 'bayonet'
        : next.silhouette.skirtWaveAmp > 0
          ? 'spider'
          : pick(COUPLINGS);
    next.base.spiderBayonet = Math.random() < 0.6;
    next.base.spiderStyle =
      next.silhouette.crossSectionType === 'concave_square'
        ? 'x_corners'
        : pick(['radial', 'organic_ovals', 'x_corners', 'spiral'] as const);
    next.base.spiderArmCount =
      next.base.spiderStyle === 'x_corners'
        ? 4
        : next.base.spiderStyle === 'radial'
          ? pick([3, 4, 6])
          : pick([4, 5, 6]);
    if (style === 'compact_flush') {
      next.base.height = 15;
      next.base.footRadius = 37.5;
      next.base.bayonetLugs = 3;
      next.base.couplingClearance = 0.35;
      next.base.collarRevealMm = 0;
    } else if (style === 'dome') {
      next.base.height = roundStep(randRange(48, 80), 2);
      next.base.footRadius = roundStep(randRange(52, 72), 2);
      next.base.collarRevealMm = 0;
    } else if (style === 'conkel') {
      next.base.height = next.mount.type === 'e26_e27' ? 55 : 18;
      next.base.footRadius = roundStep(randRange(48, 60), 2);
      next.base.collarRevealMm = 0;
    } else if (style === 'pedestal') {
      next.base.height = roundStep(randRange(54, 88), 4);
      next.base.footRadius = roundStep(randRange(46, 62), 2);
      next.base.collarRevealMm = 0;
    } else if (style === 'cylinder') {
      next.base.height = roundStep(randRange(50, 80), 4);
      next.base.footRadius = roundStep(randRange(50, 68), 2);
      next.base.collarRevealMm = pick([0, 6, 8]);
    } else {
      next.base.height = roundStep(randRange(64, 82), 4);
      next.base.footRadius = roundStep(randRange(56, 66), 2);
      next.base.collarRevealMm = 0;
    }
    next.base.shadeVentilation = Math.random() < 0.55;
  }

  if (fam === 'pleated') {
    next.pleated.count = randInt(18, 60);
    next.pleated.depth = roundStep(randRange(3.5, 9.5), 0.5);
    next.pleated.waveProfile = pick(['sine', 'triangle', 'soft_square', 'double_ridge']);
    next.pleated.endTaper = Math.random() < 0.5 ? 0 : roundStep(randRange(0.15, 0.5), 0.05);
  } else if (fam === 'japanese_flute') {
    next.japaneseFlute.count = randInt(48, 92);
    next.japaneseFlute.depth = roundStep(randRange(1.6, 2.8), 0.1);
    next.japaneseFlute.wallThickness = roundStep(randRange(0.9, 1.8), 0.1);
    next.japaneseFlute.profile = pick(['soft_sine', 'scallop']);
  } else if (fam === 'helical') {
    next.helical.ribCount = randInt(16, 48);
    next.helical.ribDepth = roundStep(randRange(3.5, 8.0), 0.5);
    next.helical.twistDeg = roundStep(randRange(65, 220), 15);
    next.helical.twistDirection = Math.random() < 0.5 ? 1 : -1;
    next.helical.profile = pick(['faceted', 'sine', 'sawtooth']);
    next.helical.doubleProfile = Math.random() < 0.45;
    next.helical.doubleMix = roundStep(randRange(0.55, 0.95), 0.05);
    next.helical.bottomVentilation = Math.random() < 0.7;
  } else if (fam === 'louvers') {
    next.louvers.finCount = randInt(24, 44);
    next.louvers.finDepth = roundStep(randRange(10, 20), 1);
    next.louvers.bladeSharpness = roundStep(randRange(0.62, 0.88), 0.02);
    next.louvers.sweepDeg = roundStep(randRange(45, 145), 10);
    next.louvers.waveAmplitude = roundStep(randRange(0.15, 0.75), 0.05);
  } else if (fam === 'origami') {
    next.origami.horizFacets = randInt(8, 18);
    next.origami.vertTiers = randInt(4, 9);
    next.origami.depth = roundStep(randRange(5.5, 11.5), 0.5);
    next.origami.twistDeg = roundStep(randRange(0, 90), 15);
    next.origami.edgeSoftness = roundStep(randRange(0.2, 0.55), 0.05);
  } else if (fam === 'woven') {
    const pat = pick(['basket_1x1', 'knitted', 'ripple_mesh', 'grid_mesh'] as const);
    next.woven.pattern = pat;
    if (pat === 'ripple_mesh' || pat === 'grid_mesh') {
      next.woven.horizFreq = roundStep(randRange(26, 40), 2);
      next.woven.vertFreq = roundStep(randRange(20, 30), 2);
      next.woven.rippleDepth = roundStep(randRange(4.0, 6.0), 0.2);
    } else {
      next.woven.horizFreq = roundStep(randRange(24, 42), 2);
      next.woven.vertFreq = roundStep(randRange(44, 72), 2);
      next.woven.relief = roundStep(randRange(1.2, 1.8), 0.1);
    }
    next.woven.fdmSmoothing = roundStep(randRange(0.25, 0.55), 0.05);
  } else {
    const mode = pick(['flames', 'gravity', 'growth', 'wind'] as const);
    next.organic.mode = mode;
    next.organic.finCount = roundStep(randRange(18, 30), 2);
    next.organic.flameWaves = randInt(2, 5);
    next.organic.voronoiCells = randInt(12, 20);
    next.organic.voronoiSoftness = roundStep(randRange(0.55, 0.92), 0.05);
    next.organic.voronoiDispersion = roundStep(randRange(0.25, 0.85), 0.05);
    next.organic.gravityAccel = roundStep(randRange(-9.8, 3.0), 0.4);
    next.organic.growthAmp = roundStep(randRange(0.55, 0.95), 0.05);
    next.organic.growthFinCount = roundStep(randRange(26, 44), 2);
    next.organic.growthFreq = roundStep(randRange(1.6, 3.4), 0.2);
    next.organic.windType = pick(['breeze', 'gusts', 'vortex'] as const);
    next.organic.windFinCount = roundStep(randRange(48, 72), 2);
    next.organic.windDirectionDeg = roundStep(randRange(0, 350), 10);
    next.organic.windIntensity = roundStep(randRange(70, 170), 10);
    if (mode === 'wind') {
      next.organic.finDepth = roundStep(randRange(7, 11), 1);
      next.organic.finThickness = roundStep(randRange(1.0, 1.4), 0.1);
    } else if (mode === 'gravity') {
      next.organic.finDepth = roundStep(randRange(16, 24), 1);
      next.organic.finThickness = roundStep(randRange(1.2, 1.6), 0.1);
    } else if (mode === 'growth') {
      next.organic.finDepth = roundStep(randRange(18, 26), 1);
      next.organic.finThickness = roundStep(randRange(1.2, 1.7), 0.1);
    } else {
      next.organic.finDepth = roundStep(randRange(12, 20), 1);
      next.organic.finThickness = roundStep(randRange(1.2, 1.8), 0.1);
    }
    next.organic.depth = next.organic.finDepth;
    next.organic.finLift = roundStep(randRange(0.15, 0.55), 0.05);
    next.organic.scale = roundStep(randRange(1.5, 2.6), 0.1);
    next.organic.warp = roundStep(randRange(0.6, 1.3), 0.05);
    next.organic.bands = randInt(3, 6);
    next.organic.overhangSmoothing = roundStep(randRange(0.35, 0.65), 0.05);
    next.organic.seed = randInt(100, 9999);
  }

  next.visual.material = fam === 'japanese_flute' ? 'pla_white' : pick(SHADE_MATERIALS);
  next.visual.baseMaterial = pick(BASE_MATERIALS);

  return next;
}
