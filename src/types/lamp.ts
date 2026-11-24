export type LampFamilyId =
  | 'pleated'
  | 'japanese_flute'
  | 'helical'
  | 'louvers'
  | 'woven'
  | 'organic';

export type SilhouetteType = 'curve' | 'stepped' | 'conical' | 'wavy';

export type MountType = 'led_kit_001' | 'e26_e27';

export type MountPosition = 'bottom' | 'top';

export type BuildMode = 'two_part' | 'monoblock';

export type BaseStyleId = 'dome' | 'pedestal' | 'cylinder' | 'conkel' | 'tripod';

export type BaseFinish = 'smooth' | 'ribbed';

export type CouplingType = 'gravity_seat' | 'spider' | 'thread' | 'bayonet' | 'friction';

export type ViewAssemblyMode = 'assembled' | 'exploded' | 'shade_only' | 'base_only';

export type MaterialPresetId =
  | 'pla_white'
  | 'amber_translucent'
  | 'smoked_amber'
  | 'terracotta'
  | 'olive_green'
  | 'sand_wood'
  | 'stone_gray'
  | 'matte_black';

export interface SilhouetteParams {
  type: SilhouetteType;
  /** Shade height (in two_part mode) or total lamp height (in monoblock mode), mm */
  height: number; // 90 - 250 mm
  baseRadius: number; // 35 - 115 mm
  midRadius: number; // 35 - 122 mm
  topRadius: number; // 25 - 115 mm
  curvature: number; // 0.15 - 0.85
  superellipse: number; // 2.0 (circle) - 7.0 (rounded square)
  stepHeightRatio: number; // 0.25 - 0.60
  wavyRings: number; // 2 - 6 stacked lobes
  wavyDepth: number; // 4 - 22 mm lobe depth
  /** Organic wavy bottom skirt hem amplitude (0 - 15 mm) */
  skirtWaveAmp: number;
  /** Number of skirt waves around the perimeter (3 - 8) */
  skirtWaveCount: number;
  buildMode: BuildMode;
  splitRatio: number;
  fitClearance: number; // 0.15 - 0.50 mm
}

export interface BaseParams {
  /** Independent architectural base style (used when buildMode === 'two_part') */
  style: BaseStyleId;
  /** Surface finish on the base: smooth or finely ribbed (40 - 100 ribs) */
  finish: BaseFinish;
  /** Number of fine vertical ribs on the base when finish === 'ribbed' (40 - 100) */
  ribCount: number;
  /** Coupling mechanism between Base and Shade */
  coupling: CouplingType;
  /** Base height in mm (40 - 90 mm standard, 16 - 120 mm full range) */
  height: number;
  /** Outer bottom foot radius of the base (45 - 80 mm => Ø90 - 160 mm) */
  footRadius: number;
  /** Coupling neck radius where the shade seats/locks onto the base, mm */
  neckRadius: number;
  /** Radial clearance between base and shade (default 0.4 mm for gravity_seat, 0.35 mm for thread/bayonet/spider) */
  couplingClearance: number;
  /** Coarse printable screw pitch in mm (used for coupling === 'thread') */
  threadPitch: number;
  /** Number of bayonet locking lugs (used for coupling === 'bayonet' or spider with bayonet) */
  bayonetLugs: number;
  /** Enable bayonet lock notches on the 4-spoke internal spider collar */
  spiderBayonet: boolean;
  /** Spoked bottom ventilation flange on the shade */
  shadeVentilation: boolean;
  /** Slight vertical gap between cylinder top and shade (UMINO F017 floating collar look) */
  collarRevealMm: number;
}

export interface MountParams {
  type: MountType;
  position: MountPosition;
  wallThickness: number; // 1.6 - 3.2 mm
  ledTolerance: number; // -0.5 to +0.5 mm (nominal 59.5 mm)
  e26Diameter: number; // 36 - 44 mm (default 40.5 mm)
  e26LipThickness: number; // 2.4 - 4.5 mm (default 3.5 mm)
  ventSlots: number; // 4 - 10 radial ventilation slots
  autoFlipPendantExport: boolean;
}

export interface PleatedParams {
  count: number; // 12 - 80
  depth: number; // 1 - 14 mm
  waveProfile: 'sine' | 'triangle' | 'soft_square' | 'double_ridge';
  endTaper: number; // 0 - 1
}

export interface JapaneseFluteParams {
  /** Number of fine Japanese ceramic/washi flutes (40 - 100) */
  count: number;
  /** Subtle shallow flute relief depth (1.5 - 3.0 mm) */
  depth: number;
  /** Translucent wall thickness (0.8 - 2.4 mm) for warm light glow */
  wallThickness: number;
  /** Soft flute cross-section: 'soft_sine' (washi) or 'scallop' (ceramic flute) */
  profile: 'soft_sine' | 'scallop';
}

export interface HelicalParams {
  ribCount: number; // 12 - 64
  ribDepth: number; // 1.5 - 12 mm
  twistDeg: number; // 0 - 360 deg
  twistDirection: 1 | -1;
  profile: 'faceted' | 'sine' | 'sawtooth';
  doubleProfile: boolean;
  doubleMix: number; // 0.2 - 1.0
  bottomVentilation: boolean;
}

export interface LouversParams {
  finCount: number; // 16 - 56
  finDepth: number; // 6 - 24 mm
  bladeSharpness: number; // 0.35 - 0.92
  sweepDeg: number; // 0 - 180 deg
  waveAmplitude: number; // 0 - 1.0
}

export interface WovenParams {
  horizFreq: number; // 16 - 72
  vertFreq: number; // 24 - 90
  relief: number; // 0.6 - 2.8 mm (added onto 0.8 mm valley)
  pattern: 'basket_1x1' | 'twill' | 'double_2x2' | 'diamond';
  fdmSmoothing: number; // 0 - 1
}

export interface OrganicParams {
  mode: 'ribbons' | 'topo' | 'sculpt';
  scale: number; // 1.0 - 4.5
  warp: number; // 0.0 - 1.6
  bands: number; // 2 - 10
  depth: number; // 2 - 14 mm
  overhangSmoothing: number; // 0 - 1
  seed: number; // 1 - 9999
}

export interface VisualParams {
  material: MaterialPresetId;
  baseMaterial: MaterialPresetId;
  lightOn: boolean;
  lightIntensity: number; // 0.2 - 2.0
  lightWarmth: number; // 2200 - 4000 K
  showOverhangs: boolean;
  overhangAngle: number; // 20 - 65 deg (default 45)
  sceneTheme: 'studio_light' | 'warm_night';
  assemblyView: ViewAssemblyMode;
}

export interface LampConfig {
  family: LampFamilyId;
  silhouette: SilhouetteParams;
  base: BaseParams;
  mount: MountParams;
  pleated: PleatedParams;
  japaneseFlute: JapaneseFluteParams;
  helical: HelicalParams;
  louvers: LouversParams;
  woven: WovenParams;
  organic: OrganicParams;
  visual: VisualParams;
}

export interface MeshPartData {
  name: 'lamp' | 'base' | 'shade' | 'test_base';
  role: 'shade' | 'base';
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  thickness: Float32Array;
  overhang: Float32Array;
}

export interface ManifoldReport {
  isWatertight: boolean;
  openEdges: number;
  nonManifoldEdges: number;
  signedVolumeMm3: number;
  triangleCount: number;
}

export interface LampMetrics {
  volumeCm3: number;
  gramsPLA: number;
  baseGramsPLA: number;
  shadeGramsPLA: number;
  overhangPercent: number;
  overhangAngle: number;
  totalTriangles: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  fitsBambuA1: boolean;
  isWatertight: boolean;
  openEdges: number;
  nonManifoldEdges: number;
  generationMs: number;
}

export interface GeneratedLampResult {
  parts: MeshPartData[];
  metrics: LampMetrics;
}

export interface LampPreset {
  id: string;
  name: string;
  collectionName: string;
  variantLabel?: string;
  description?: string;
  createdAt: string;
  config: LampConfig;
  isBuiltIn?: boolean;
}
