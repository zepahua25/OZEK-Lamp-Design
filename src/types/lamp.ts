export type LampFamilyId =
  | 'pleated'
  | 'japanese_flute'
  | 'helical'
  | 'louvers'
  | 'origami'
  | 'woven'
  | 'organic';

export type SilhouetteType = 'curve' | 'stepped' | 'conical' | 'wavy' | 'custom_spline';

export type CrossSectionType =
  | 'circle'
  | 'superellipse'
  | 'ellipse'
  | 'polygon'
  | 'concave_square'
  | 'flower';

export type SpiderStyleId = 'radial' | 'organic_ovals' | 'x_corners' | 'spiral';

export type MountType = 'led_kit_001' | 'e26_e27';

export type MountPosition = 'bottom' | 'top';

export type BuildMode = 'two_part' | 'monoblock';

export type BaseStyleId = 'dome' | 'pedestal' | 'cylinder' | 'conkel' | 'tripod' | 'compact_flush';

export type BaseFinish = 'smooth' | 'ribbed';

export type CouplingType = 'gravity_seat' | 'spider' | 'thread' | 'bayonet' | 'friction';

export type ViewAssemblyMode = 'assembled' | 'exploded' | 'shade_only' | 'base_only';

export type UiMode = 'basic' | 'expert';

export type LampSizePreset = 'S' | 'M' | 'L';

export type MaterialPresetId =
  | 'ozek_sand'
  | 'ozek_onyx'
  | 'ozek_copper'
  | 'pla_white'
  | 'amber_translucent'
  | 'smoked_amber'
  | 'terracotta'
  | 'olive_green'
  | 'sand_wood'
  | 'stone_gray'
  | 'matte_black';

export type ColorMode = 'solid' | 'stripes' | 'edges' | 'strands';

export type SculptToolId = 'off' | 'push' | 'carve' | 'swirl' | 'smooth';

export interface SculptStroke {
  /** Normalized angular coordinate u in [0, 1) */
  u: number;
  /** Normalized height coordinate v in [0, 1] */
  v: number;
  /** Brush radius in mm (12 - 55 mm) */
  radiusMm: number;
  /** Brush intensity (0.1 - 1.0) */
  strength: number;
  tool: 'push' | 'carve' | 'swirl' | 'smooth';
}

export interface SplineControlPoint {
  /** Normalized height along the shade [0..1] */
  v: number;
  /** Physical radius in mm [22..122] */
  r: number;
}

export interface SilhouetteParams {
  type: SilhouetteType;
  /** Shade height (in two_part mode) or total lamp height (in monoblock mode), mm */
  height: number; // 90 - 250 mm
  baseRadius: number; // 35 - 115 mm
  midRadius: number; // 35 - 122 mm
  topRadius: number; // 25 - 115 mm
  curvature: number; // 0.15 - 0.85
  /** 5 draggable 2D spline control points (v in [0..1], r in mm) for visual silhouette editor */
  controlPoints: SplineControlPoint[];
  /** Cross-section profile type: circle, superellipse, ellipse, or soft polygon */
  crossSectionType: CrossSectionType;
  superellipse: number; // 2.0 (circle) - 7.0 (rounded square)
  /** Elliptical cross-section aspect ratio (0.60 - 1.00) */
  ellipseAspect: number;
  /** Polygonal cross-section side count (6 - 12 sides) */
  polygonSides: number;
  /** Polygonal corner rounding factor (0 = crisp bevel, 1 = very soft rounded polygon) */
  polygonRounding: number;
  /** Concave square inward curve depth (0.08 - 0.30, default 0.20) */
  concaveDepth: number;
  /** Flower / petal cross-section lobe count (6 - 10, default 8) */
  flowerLobes: number;
  /** Flower / petal depth amplitude (0.05 - 0.22, default 0.13) */
  flowerDepth: number;
  /** Progressive twist applied to cross-section along height (0 - 180 deg) */
  sectionTwistDeg: number;
  stepHeightRatio: number; // 0.25 - 0.60
  wavyRings: number; // 2 - 6 stacked lobes
  wavyDepth: number; // 4 - 22 mm lobe depth
  /** Organic wavy bottom skirt hem amplitude (0 - 15 mm) */
  skirtWaveAmp: number;
  /** Number of skirt waves around the perimeter (3 - 8) */
  skirtWaveCount: number;
  /** Optional smooth white translucent internal diffuser cylinder (1.0 mm wall) */
  includeDiffuser: boolean;
  /** Close top into a smooth full sphere/dome (R=0 mm for LED Kit 001, Ø16 mm discreet vent for E26/E27) */
  closeTopDome: boolean;
  buildMode: BuildMode;
  splitRatio: number;
  fitClearance: number; // 0.15 - 0.50 mm
}

export interface BaseParams {
  style: BaseStyleId;
  finish: BaseFinish;
  ribCount: number; // 40 - 100
  coupling: CouplingType;
  height: number; // 16 - 120 mm
  footRadius: number; // 45 - 80 mm (Ø90 - 160 mm)
  neckRadius: number; // 30 - 52 mm
  couplingClearance: number; // 0.20 - 0.55 mm
  threadPitch: number; // 3.5 - 5.0 mm
  bayonetLugs: number; // 3 or 4
  spiderBayonet: boolean;
  /** Flat Z=0 spider bracket style (radial, organic_ovals, x_corners, spiral) */
  spiderStyle: SpiderStyleId;
  /** Number of arms/windows for spider bracket (3, 4, 5, or 6 depending on style) */
  spiderArmCount: number;
  /** Signature OZ☰K (☰) seal: 3 minimalist horizontal 0.8 mm grooves spaced 2.5 mm around base body */
  signatureGrooves: boolean;
  shadeVentilation: boolean;
  collarRevealMm: number; // 0 - 14 mm
}

export interface MountParams {
  type: MountType;
  position: MountPosition;
  wallThickness: number; // 1.6 - 3.2 mm
  /** Nominal LED Kit 001 cavity = 59.5 + ledTolerance (default +0.2 mm => Ø59.7 mm for PLA) */
  ledTolerance: number; // -0.5 to +0.5 mm
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
  count: number; // 40 - 100
  depth: number; // 1.5 - 3.0 mm
  wallThickness: number; // 0.8 - 2.4 mm
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

export interface OrigamiParams {
  /** Number of geometric diamond pleats around circumference (6 - 24) */
  horizFacets: number;
  /** Number of stacked origami diamond tiers vertically (3 - 12) */
  vertTiers: number;
  /** Diamond fold protrusion depth (3 - 14 mm) */
  depth: number;
  /** Subtle progressive helical twist (0 - 180 deg) */
  twistDeg: number;
  /** Crease edge smoothing for clean FDM printing without ringing (0 - 1) */
  edgeSoftness: number;
}

export type WovenPattern = 'basket_1x1' | 'knitted' | 'ripple_mesh' | 'grid_mesh';

export interface WovenParams {
  horizFreq: number; // 16 - 72 (24 - 44 for RippleMesh / Grid)
  vertFreq: number; // 18 - 90 (18 - 32 for RippleMesh / Grid)
  relief: number; // 0.6 - 2.8 mm (Mimbre / Knitted)
  /** Deep sculpted cell depth for RippleMesh & Grid (3.5 - 6.5 mm, valleys ~0.65 mm) */
  rippleDepth: number;
  pattern: WovenPattern;
  fdmSmoothing: number; // 0 - 1
}

export type OrganicMode = 'flames' | 'gravity' | 'growth' | 'wind';

export type OrganicWindType = 'breeze' | 'gusts' | 'vortex';

export interface OrganicParams {
  /**
   * 'flames'  = support-free sinuous flame/petal fins (<=45°);
   * 'gravity' = 3D Spherical Voronoi soft-cell physics on S² (non-crossing U/S folds);
   * 'growth'  = meridional fins with differential-growth ruffled outer edge;
   * 'wind'    = dense thin fins deflected by a 3D surface flow / vortex field on S²
   */
  mode: OrganicMode;
  /** Number of sinuous flame fins (16 - 32) for 'flames' mode */
  finCount: number;
  /** Vertical petal wave cycles (2 - 6) for 'flames' mode */
  flameWaves: number;
  /** Number of continuous Differential Curve Growth circuits (2 - 8, default 4) for 'gravity' mode */
  voronoiCells: number;
  /** Curvature stiffness / softness (0 = crisp bends, 1 = broad fluid F1 curves) */
  voronoiSoftness: number;
  /** Seed jitter / dispersion (0 = symmetric opposing starts, 1 = organic asymmetric) */
  voronoiDispersion: number;
  /** Visual toggle: paint each continuous Gravity circuit in a distinct OZEK palette color in the 3D viewer */
  colorByStrand: boolean;
  /** Differential-growth ruffle amplitude on outer fin edge (0 - 1 => 0% - 100%) for 'growth' mode */
  growthAmp: number;
  /** Number of meridional ruffled fins (18 - 36) for 'growth' mode */
  growthFinCount: number;
  /** Ruffle wave frequency (1.0 wide ruffles - 4.0 fine frills) for 'growth' mode */
  growthFreq: number;
  /** 3D surface wind flow preset ('breeze' | 'gusts' | 'vortex') for 'wind' mode */
  windType: OrganicWindType;
  /** Dense thin fin count (45 - 75) for 'wind' mode */
  windFinCount: number;
  /** Wind azimuth direction in degrees (0 - 360) for 'wind' mode */
  windDirectionDeg: number;
  /** Wind flow intensity percentage (0 - 200) for 'wind' mode */
  windIntensity: number;
  /** Extruded fin/ribbon radial depth out from the 1.2 mm smooth core (6 - 24 mm depending on mode) */
  finDepth: number;
  /** Extruded fin/ribbon wall thickness (1.0 - 2.2 mm depending on mode) */
  finThickness: number;
  /** Upward tip inclination (0 - 1) to reduce overhangs on Voronoi ribbons */
  finLift: number;
  /** Physical gravity acceleration (-9.8 to +9.8 m/s² => -1.0 Down <-> 0 None <-> +1.0 Up) */
  gravityAccel: number;
  /** Spiral twist in degrees (0 - 180 deg) */
  gravityTwistDeg: number;
  /** Legacy smoothing pass count kept for backward JSON compatibility */
  smoothPasses: number;
  scale: number; // 1.0 - 4.5
  warp: number; // 0.0 - 1.6
  bands: number; // 3 - 7
  depth: number; // alias synchronized with finDepth
  overhangSmoothing: number; // 0 - 1
  seed: number; // 1 - 9999
}

export interface VisualParams {
  material: MaterialPresetId;
  baseMaterial: MaterialPresetId;
  /** AMS Multicolor preview mode */
  colorMode: ColorMode;
  accentMaterial: MaterialPresetId;
  thirdMaterial: MaterialPresetId;
  /** Horizontal stripe repeat count (1 - 8) when colorMode === 'stripes' */
  stripeRepeats: number;
  /** Edge/crest highlight threshold (1.0 - 4.0 mm) when colorMode === 'edges' */
  edgeDepthMm: number;
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
  origami: OrigamiParams;
  woven: WovenParams;
  organic: OrganicParams;
  visual: VisualParams;
  /** Persistent interactive 3D sculpt brush strokes applied continuously on UV */
  sculptStrokes: SculptStroke[];
}

export interface MeshPartData {
  name: 'lamp' | 'base' | 'shade' | 'diffuser' | 'test_base' | 'adapter';
  role: 'shade' | 'base' | 'diffuser';
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
  diffuserGramsPLA: number;
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
