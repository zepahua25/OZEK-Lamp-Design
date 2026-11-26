import { LampConfig, MaterialPresetId } from '../types/lamp';
import { SILHOUETTE_SPLINE_TEMPLATES } from '../geometry/silhouette';
import { DEFAULT_CONFIG, cloneConfig } from './presets';

export interface OzekColorSwatch {
  id: MaterialPresetId;
  name: string;
  hex: string;
  roleHint: string;
}

export const OZEK_OFFICIAL_PALETTE: OzekColorSwatch[] = [
  {
    id: 'ozek_onyx',
    name: 'Gris Ónice',
    hex: '#252525',
    roleHint: 'Mate profundo · Cuerpo / Base',
  },
  {
    id: 'ozek_sand',
    name: 'Arena Natural',
    hex: '#F5F2EB',
    roleHint: 'Translúcido cálido · Pantalla / Difusor',
  },
  {
    id: 'ozek_copper',
    name: 'Cobre / Bronce',
    hex: '#C87D55',
    roleHint: 'Acento cálido · Base firma',
  },
];

export interface OzekSignaturePiece {
  id: 'oku-01' | 'zen-02' | 'en-03' | 'ko-04';
  code: string;
  title: string;
  subtitle: string;
  badge: string;
  swatches: [string, string];
  config: LampConfig;
}

function buildOku01(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'woven';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 152;
  cfg.silhouette.controlPoints = [
    { v: 0.0, r: 58 },
    { v: 0.25, r: 72 },
    { v: 0.55, r: 74 },
    { v: 0.82, r: 66 },
    { v: 1.0, r: 54 },
  ];
  cfg.silhouette.baseRadius = 58;
  cfg.silhouette.midRadius = 74;
  cfg.silhouette.topRadius = 54;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = false;
  cfg.silhouette.includeDiffuser = true;
  cfg.silhouette.buildMode = 'two_part';

  cfg.woven.pattern = 'ripple_mesh';
  cfg.woven.horizFreq = 32;
  cfg.woven.vertFreq = 22;
  cfg.woven.rippleDepth = 5.0;
  cfg.woven.fdmSmoothing = 0.35;

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 50;
  cfg.base.footRadius = 56;
  cfg.base.coupling = 'bayonet';
  cfg.base.signatureGrooves = true;
  cfg.base.collarRevealMm = 4;

  cfg.mount.type = 'led_kit_001';
  cfg.mount.position = 'bottom';

  cfg.visual.material = 'ozek_onyx';
  cfg.visual.baseMaterial = 'ozek_onyx';
  cfg.visual.colorMode = 'solid';
  cfg.visual.lightOn = true;
  cfg.visual.lightIntensity = 1.7;
  cfg.visual.lightWarmth = 2600;
  cfg.sculptStrokes = [];
  return cfg;
}

function buildZen02(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'organic';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 172;
  cfg.silhouette.controlPoints = SILHOUETTE_SPLINE_TEMPLATES.sphere.points.map((p) => ({ ...p }));
  cfg.silhouette.baseRadius = 44;
  cfg.silhouette.midRadius = 94;
  cfg.silhouette.topRadius = 44;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = true; // Real closed sphere (R = 0 mm with LED Kit 001)!
  cfg.silhouette.includeDiffuser = false;
  cfg.silhouette.buildMode = 'two_part';

  cfg.organic.mode = 'flames';
  cfg.organic.finCount = 24;
  cfg.organic.flameWaves = 3;
  cfg.organic.finDepth = 14.0;
  cfg.organic.depth = 14.0;
  cfg.organic.finThickness = 1.5;
  cfg.organic.finLift = 0.35;

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 42;
  cfg.base.footRadius = 52;
  cfg.base.coupling = 'bayonet';
  cfg.base.signatureGrooves = true;
  cfg.base.collarRevealMm = 0;

  cfg.mount.type = 'led_kit_001';
  cfg.mount.position = 'bottom';

  cfg.visual.material = 'ozek_sand';
  cfg.visual.baseMaterial = 'ozek_onyx';
  cfg.visual.colorMode = 'solid';
  cfg.visual.lightOn = true;
  cfg.visual.lightIntensity = 1.55;
  cfg.visual.lightWarmth = 2650;
  cfg.sculptStrokes = [];
  return cfg;
}

function buildEn03(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'japanese_flute';
  cfg.silhouette.type = 'wavy';
  cfg.silhouette.height = 162;
  cfg.silhouette.baseRadius = 70;
  cfg.silhouette.midRadius = 76;
  cfg.silhouette.topRadius = 64;
  cfg.silhouette.wavyRings = 3; // 3 stacked sculpted tiers evoking OZ☰K!
  cfg.silhouette.wavyDepth = 13;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = false;
  cfg.silhouette.includeDiffuser = false;
  cfg.silhouette.buildMode = 'two_part';

  cfg.japaneseFlute.count = 76;
  cfg.japaneseFlute.depth = 2.0;
  cfg.japaneseFlute.wallThickness = 1.2;
  cfg.japaneseFlute.profile = 'soft_sine';

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 52;
  cfg.base.footRadius = 56;
  cfg.base.coupling = 'gravity_seat';
  cfg.base.couplingClearance = 0.4;
  cfg.base.signatureGrooves = true;
  cfg.base.collarRevealMm = 4;

  cfg.mount.type = 'led_kit_001';
  cfg.mount.position = 'bottom';

  cfg.visual.material = 'ozek_sand';
  cfg.visual.baseMaterial = 'ozek_copper';
  cfg.visual.colorMode = 'solid';
  cfg.visual.lightOn = true;
  cfg.visual.lightIntensity = 1.5;
  cfg.visual.lightWarmth = 2650;
  cfg.sculptStrokes = [];
  return cfg;
}

function buildKo04(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'woven';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 136;
  cfg.silhouette.controlPoints = SILHOUETTE_SPLINE_TEMPLATES.conical.points.map((p) => ({ ...p }));
  cfg.silhouette.baseRadius = 94;
  cfg.silhouette.midRadius = 68;
  cfg.silhouette.topRadius = 36;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0; // Flat bottom -> Z=0 spider with 0% supports!
  cfg.silhouette.closeTopDome = false;
  cfg.silhouette.includeDiffuser = false;
  cfg.silhouette.buildMode = 'two_part';

  cfg.woven.pattern = 'knitted';
  cfg.woven.horizFreq = 32;
  cfg.woven.vertFreq = 54;
  cfg.woven.relief = 1.4;
  cfg.woven.fdmSmoothing = 0.35;

  cfg.base.style = 'dome';
  cfg.base.finish = 'ribbed';
  cfg.base.ribCount = 68;
  cfg.base.height = 66;
  cfg.base.footRadius = 62;
  cfg.base.coupling = 'spider';
  cfg.base.spiderStyle = 'radial';
  cfg.base.spiderArmCount = 4;
  cfg.base.spiderBayonet = true;
  cfg.base.signatureGrooves = true;

  cfg.mount.type = 'e26_e27';
  cfg.mount.position = 'bottom';

  cfg.visual.material = 'ozek_sand';
  cfg.visual.baseMaterial = 'ozek_copper';
  cfg.visual.colorMode = 'solid';
  cfg.visual.lightOn = true;
  cfg.visual.lightIntensity = 1.5;
  cfg.visual.lightWarmth = 2650;
  cfg.sculptStrokes = [];
  return cfg;
}

export const OZEK_SIGNATURE_COLLECTION: OzekSignaturePiece[] = [
  {
    id: 'oku-01',
    code: 'OKU 01',
    title: 'Profundidad',
    subtitle: 'RippleMesh Ónice + Difusor Arena + Base ☰',
    badge: '3 Piezas · LED 001',
    swatches: ['#252525', '#F5F2EB'],
    config: buildOku01(),
  },
  {
    id: 'zen-02',
    code: 'ZEN 02',
    title: 'Equilibrio',
    subtitle: 'Esfera Cerrada Orgánica Flamas Arena + Base Ónice ☰',
    badge: 'Esfera R=0 · LED 001',
    swatches: ['#F5F2EB', '#252525'],
    config: buildZen02(),
  },
  {
    id: 'en-03',
    code: 'EN 03',
    title: 'Vínculo (☰)',
    subtitle: 'Plisado Japonés 3 niveles Arena + Base Cobre ☰',
    badge: '3 Niveles · LED 001',
    swatches: ['#F5F2EB', '#C87D55'],
    config: buildEn03(),
  },
  {
    id: 'ko-04',
    code: 'KŌ 04',
    title: 'Oficio',
    subtitle: 'Cónica Knitted Arena (Araña Z=0) + Cúpula Cobre ☰',
    badge: 'Knitted · Araña Z=0',
    swatches: ['#F5F2EB', '#C87D55'],
    config: buildKo04(),
  },
];
