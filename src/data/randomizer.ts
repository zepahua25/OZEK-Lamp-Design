import {
  BaseStyleId,
  CouplingType,
  LampConfig,
  MaterialPresetId,
  SilhouetteType,
} from '../types/lamp';
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

const BASE_STYLES: BaseStyleId[] = ['dome', 'pedestal', 'cylinder', 'conkel', 'tripod'];
const COUPLINGS: CouplingType[] = ['gravity_seat', 'spider', 'thread', 'bayonet', 'friction'];

export function shuffleLampConfig(current: LampConfig): LampConfig {
  const next = cloneConfig(current);
  const fam = next.family;

  const silhouettesForFamily: Record<typeof fam, SilhouetteType[]> = {
    pleated: ['curve', 'stepped', 'conical', 'wavy'],
    japanese_flute: ['curve', 'conical'],
    helical: ['curve', 'wavy'],
    louvers: ['curve', 'wavy'],
    woven: ['curve', 'conical'],
    organic: ['curve', 'wavy'],
  };

  const silType = pick(silhouettesForFamily[fam]);
  next.silhouette.type = silType;
  next.silhouette.height = roundStep(randRange(125, 195), 5);
  next.silhouette.skirtWaveAmp =
    fam === 'japanese_flute' || (silType === 'conical' && Math.random() < 0.4)
      ? roundStep(randRange(5, 13), 1)
      : 0;
  next.silhouette.skirtWaveCount = randInt(4, 7);

  if (next.silhouette.buildMode === 'two_part' && next.mount.position === 'bottom') {
    const style = pick(BASE_STYLES);
    next.base.style = style;
    next.base.finish = style !== 'tripod' && Math.random() < 0.45 ? 'ribbed' : 'smooth';
    next.base.ribCount = randInt(48, 88);
    next.base.coupling =
      next.silhouette.skirtWaveAmp > 0 ? 'spider' : pick(COUPLINGS);
    next.base.spiderBayonet = Math.random() < 0.5;
    if (style === 'dome') {
      next.base.height = roundStep(randRange(46, 82), 2);
      next.base.footRadius = roundStep(randRange(52, 74), 2);
      next.base.collarRevealMm = 0;
    } else if (style === 'conkel') {
      next.base.height = next.mount.type === 'e26_e27' ? 55 : 18;
      next.base.footRadius = roundStep(randRange(48, 60), 2);
      next.base.collarRevealMm = 0;
    } else if (style === 'pedestal') {
      next.base.height = roundStep(randRange(56, 90), 4);
      next.base.footRadius = roundStep(randRange(46, 62), 2);
      next.base.collarRevealMm = 0;
    } else if (style === 'cylinder') {
      next.base.height = roundStep(randRange(50, 82), 4);
      next.base.footRadius = roundStep(randRange(50, 68), 2);
      next.base.collarRevealMm = pick([0, 6, 8]);
    } else {
      next.base.height = roundStep(randRange(64, 86), 4);
      next.base.footRadius = roundStep(randRange(56, 68), 2);
      next.base.collarRevealMm = 0;
    }
    next.base.shadeVentilation = Math.random() < 0.55;
  }

  if (silType === 'curve') {
    const isConicalFlute = fam === 'japanese_flute';
    const baseR = isConicalFlute
      ? roundStep(randRange(82, 102), 2)
      : roundStep(randRange(52, 74), 2);
    const midR = isConicalFlute
      ? roundStep(randRange(64, 80), 2)
      : roundStep(randRange(Math.max(baseR + 4, 64), 92), 2);
    const topR = isConicalFlute
      ? roundStep(randRange(32, 46), 2)
      : roundStep(randRange(46, Math.min(midR, 78)), 2);
    next.silhouette.baseRadius = baseR;
    next.silhouette.midRadius = midR;
    next.silhouette.topRadius = topR;
    next.silhouette.curvature = roundStep(randRange(0.4, 0.6), 0.02);
    next.silhouette.superellipse =
      fam === 'louvers' || Math.random() < 0.22 ? roundStep(randRange(3.4, 5.2), 0.2) : 2.0;
  } else if (silType === 'stepped') {
    const baseR = roundStep(randRange(48, 58), 2);
    const shadeR = roundStep(randRange(baseR + 16, Math.min(90, baseR + 32)), 2);
    next.silhouette.baseRadius = baseR;
    next.silhouette.midRadius = shadeR;
    next.silhouette.topRadius = roundStep(shadeR + randRange(-6, 2), 2);
    next.silhouette.stepHeightRatio = roundStep(randRange(0.32, 0.44), 0.02);
    next.silhouette.superellipse = 2.0;
  } else if (silType === 'conical') {
    const baseR = roundStep(randRange(52, 66), 2);
    const flareR = roundStep(randRange(82, 104), 2);
    next.silhouette.baseRadius = baseR;
    next.silhouette.midRadius = flareR;
    next.silhouette.topRadius = roundStep(randRange(34, 52), 2);
    next.silhouette.stepHeightRatio = roundStep(randRange(0.32, 0.44), 0.02);
    next.silhouette.curvature = roundStep(randRange(0.45, 0.65), 0.02);
    next.silhouette.superellipse = 2.0;
  } else {
    const baseR = roundStep(randRange(58, 72), 2);
    const midR = roundStep(randRange(68, 84), 2);
    next.silhouette.baseRadius = baseR;
    next.silhouette.midRadius = midR;
    next.silhouette.topRadius = roundStep(randRange(56, midR), 2);
    next.silhouette.wavyRings = randInt(3, 5);
    next.silhouette.wavyDepth = roundStep(randRange(10, 16), 1);
    next.silhouette.superellipse = 2.0;
  }

  if (fam === 'pleated') {
    next.pleated.count = randInt(18, 60);
    next.pleated.depth = roundStep(randRange(3.5, 10.0), 0.5);
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
  } else if (fam === 'woven') {
    next.woven.horizFreq = roundStep(randRange(24, 42), 2);
    next.woven.vertFreq = roundStep(randRange(44, 72), 2);
    next.woven.relief = roundStep(randRange(1.2, 2.0), 0.1);
    next.woven.pattern = pick(['basket_1x1', 'twill', 'double_2x2', 'diamond']);
    next.woven.fdmSmoothing = roundStep(randRange(0.25, 0.55), 0.05);
  } else {
    next.organic.mode = pick(['ribbons', 'topo', 'sculpt']);
    next.organic.scale = roundStep(randRange(1.4, 2.8), 0.1);
    next.organic.warp = roundStep(randRange(0.6, 1.3), 0.05);
    next.organic.bands = roundStep(randRange(3.5, 7.0), 0.5);
    next.organic.depth = roundStep(randRange(5.5, 11.0), 0.5);
    next.organic.overhangSmoothing = roundStep(randRange(0.35, 0.65), 0.05);
    next.organic.seed = randInt(100, 9999);
  }

  next.visual.material = fam === 'japanese_flute' ? 'pla_white' : pick(SHADE_MATERIALS);
  next.visual.baseMaterial = pick(BASE_MATERIALS);

  return next;
}
