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
    id: 'ozek_sand',
    name: 'Arena Natural',
    hex: '#F5F2EB',
    roleHint: 'Translúcido cálido · Pantalla / Difusor',
  },
  {
    id: 'ozek_onyx',
    name: 'Gris Ónice',
    hex: '#252525',
    roleHint: 'Mate profundo · Cuerpo / Base',
  },
  {
    id: 'ozek_copper',
    name: 'Cobre / Bronce',
    hex: '#C87D55',
    roleHint: 'Acento cálido · Torre / Detalle',
  },
];

export interface OzekSignaturePiece {
  id: 'omoi-01' | 'zoukei-02' | 'en-03' | 'kobo-04';
  code: string;
  kanji: string;
  title: string;
  narrative: string;
  subtitle: string;
  badge: string;
  dfmSupportNote: string;
  swatches: [string, string];
  quickWindShortcut?: boolean;
  config: LampConfig;
}

/**
 * 1) OMOI 01 · 思い (Intención y Origen) — Arquitectura 3 Piezas (Base + Copa + Pantalla)
 * Pieza 1 (Base Ónice): Cúpula acanalada con palito delgado Ø 15 mm exterior × Ø 8.5 mm interior y espiga superior Ø 13 mm (sin embudo oscuro).
 * Pieza 2 (Copa Arena): Embona sobre el palito en color Arena, aloja el socket E26/E27 (Ø 40.5 mm) y soporta la pantalla (0% soportes).
 * Pieza 3 (Pantalla Arena): Plisado fino japonés (72 pliegues, 1.1 mm), araña plana Z=0 con aro central Ø 40.8 mm fijado con tuerca E26.
 */
function buildOmoi01(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'japanese_flute';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 150; // Talla S (150 mm)
  cfg.silhouette.shadeScale = 1.0;
  cfg.silhouette.controlPoints = SILHOUETTE_SPLINE_TEMPLATES.conical.points.map((p) => ({ ...p }));
  cfg.silhouette.baseRadius = 94;
  cfg.silhouette.midRadius = 68;
  cfg.silhouette.topRadius = 36;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0; // Flat Z=0 spider bracket -> 0% supports!
  cfg.silhouette.closeTopDome = false;
  cfg.silhouette.includeDiffuser = false;
  cfg.silhouette.buildMode = 'three_part'; // 3 Piezas: Base Ónice + Copa Arena + Pantalla Arena!

  cfg.japaneseFlute.count = 72;
  cfg.japaneseFlute.depth = 2.0;
  cfg.japaneseFlute.wallThickness = 1.1;
  cfg.japaneseFlute.profile = 'soft_sine';

  cfg.base.style = 'dome';
  cfg.base.finish = 'ribbed';
  cfg.base.ribCount = 68;
  cfg.base.height = 52; // 52 dome + 24 palito (Ø15.5) = 76 seatY (Copa Arena oculta 76..90 adentro!) => 76 + 150 = 226 mm (<= 245 mm A1!)
  cfg.base.domeStemHeightMm = 24;
  cfg.base.footRadius = 60;
  cfg.base.neckRadius = 23.0;
  cfg.base.coupling = 'slender_e26';
  cfg.base.spiderStyle = 'organic_ovals';
  cfg.base.spiderArmCount = 5;
  cfg.base.spiderBayonet = false;
  cfg.base.signatureGrooves = false;
  cfg.base.authorSeal = true;
  cfg.base.collarRevealMm = 0;

  cfg.mount.type = 'e26_e27';
  cfg.mount.position = 'bottom';

  cfg.visual.material = 'ozek_sand';
  cfg.visual.baseMaterial = 'ozek_onyx';
  cfg.visual.colorMode = 'solid';
  cfg.visual.lightOn = true;
  cfg.visual.lightIntensity = 1.5;
  cfg.visual.lightWarmth = 2650;
  cfg.sculptStrokes = [];
  return cfg;
}

/**
 * 2) ZOUKEI 02 · 造形 (Dar forma y Esculpir)
 * Linterna Origami chōchin ovalada (~140 × 180 mm) con rombos triangulares planos reales (10 × 4, profundidad 14 mm,
 * pared 1.0 mm Arena, Modo Jarrón 0% soportes), sobre Base Cilíndrica limpia en Gris Ónice (18 mm baja, ajustable 18–55 mm)
 * alineada al radio exacto (r = 46 mm) con Bambu LED Kit 001 y sello trasero Z☰.
 */
function buildZoukei02(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'origami';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 180; // Chōchin ovalada más alta que ancha (~140 × 180 mm)
  cfg.silhouette.shadeScale = 1.0;
  cfg.silhouette.controlPoints = [
    { v: 0.0, r: 46 },
    { v: 0.25, r: 65 },
    { v: 0.5, r: 70 },
    { v: 0.75, r: 65 },
    { v: 1.0, r: 46 },
  ];
  cfg.silhouette.baseRadius = 46;
  cfg.silhouette.midRadius = 70;
  cfg.silhouette.topRadius = 46;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = false; // Abierta limpia arriba y abajo -> 100% Modo Jarrón sin soportes!
  cfg.silhouette.includeDiffuser = false;
  cfg.silhouette.buildMode = 'two_part';

  cfg.origami.horizFacets = 10;
  cfg.origami.vertTiers = 4;
  cfg.origami.depth = 7.5; // Rombos elegantes doblados hacia adentro (7.5 mm)
  cfg.origami.twistDeg = 0;
  cfg.origami.edgeSoftness = 0.08;
  cfg.origami.wallThickness = 1.0; // Pared translúcida 1.0 mm Modo Jarrón
  cfg.origami.realFaceted = true; // Resolución exacta 2*horizFacets × 2*vertTiers (planos triangulares reales!)
  cfg.origami.invertFolds = true; // Pliegues hacia adentro (Origami clásico)

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 18; // Base cilíndrica limpia baja (18 mm), ajustable a alta (35–55 mm)!
  cfg.base.footRadius = 46; // Alineada al ras con el radio exacto de ZOUKEI 02 (46 mm)
  cfg.base.coupling = 'bayonet';
  cfg.base.bayonetLugs = 3;
  cfg.base.couplingClearance = 0.35;
  cfg.base.signatureGrooves = false;
  cfg.base.authorSeal = true;
  cfg.base.collarRevealMm = 0;

  cfg.mount.type = 'led_kit_001';
  cfg.mount.position = 'bottom';

  cfg.visual.material = 'ozek_sand';
  cfg.visual.baseMaterial = 'ozek_onyx';
  cfg.visual.colorMode = 'solid';
  cfg.visual.lightOn = true;
  cfg.visual.lightIntensity = 1.0;
  cfg.visual.lightWarmth = 2650;
  cfg.sculptStrokes = [];
  return cfg;
}

/**
 * 3) EN 03 · 円 / ☰ (Plenitud y Congruencia)
 * Torre arquitectónica helicoidal con giro real de 60° (48 costillas, 3.8 mm) sobre silueta Reloj de Arena esbelta
 * con Cinturón ☰ (3 anillos en cintura), Pantalla Cobre (#C87D55) alineada al ras sobre Base Gris Ónice (28 mm, r=56 mm) + sello Z☰.
 */
function buildEn03(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'helical';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 205; // Talla L (205 mm) -> 205 + 28 = 233 mm (<= 245 mm A1!)
  cfg.silhouette.shadeScale = 1.0;
  cfg.silhouette.controlPoints = [
    { v: 0.0, r: 56 },
    { v: 0.25, r: 48 },
    { v: 0.5, r: 41 },
    { v: 0.75, r: 49 },
    { v: 1.0, r: 58 },
  ];
  cfg.silhouette.baseRadius = 56;
  cfg.silhouette.midRadius = 41;
  cfg.silhouette.topRadius = 58;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = false;
  cfg.silhouette.includeDiffuser = false;
  cfg.silhouette.buildMode = 'two_part';

  cfg.helical.ribCount = 48;
  cfg.helical.ribDepth = 3.8;
  cfg.helical.twistDeg = 60; // 60° reales de giro axial de abajo hacia arriba (~35° diagonal elegante, <= 45°!)
  cfg.helical.twistDirection = 1;
  cfg.helical.profile = 'sawtooth';
  cfg.helical.doubleProfile = false;
  cfg.helical.obiBelt = true; // Cinturón ☰ de 3 anillos redondeados en la cintura!
  cfg.helical.bottomVentilation = false;

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 28;
  cfg.base.footRadius = 56; // Radio exacto del borde inferior de la pantalla (56 mm) -> unión al ras!
  cfg.base.coupling = 'bayonet';
  cfg.base.bayonetLugs = 3;
  cfg.base.couplingClearance = 0.35;
  cfg.base.signatureGrooves = false;
  cfg.base.authorSeal = true;
  cfg.base.collarRevealMm = 0;

  cfg.mount.type = 'led_kit_001';
  cfg.mount.position = 'bottom';

  cfg.visual.material = 'ozek_copper';
  cfg.visual.baseMaterial = 'ozek_onyx';
  cfg.visual.colorMode = 'solid';
  cfg.visual.lightOn = true;
  cfg.visual.lightIntensity = 1.65;
  cfg.visual.lightWarmth = 2600;
  cfg.sculptStrokes = [];
  return cfg;
}

/**
 * 4) KŌBŌ 04 · 工房 (Taller de Autor)
 * Silueta trapezoidal arquitectónica con hombro diagonal a 45° + Celosía Calada REAL con huecos pasantes
 * (18 barras cruzadas a ±45° por sentido, sección ~2.0 × 2.4 mm, 0% soportes) en Gris Ónice (#252525)
 * con Doble Difusor Interno blanco Arena (1.0 mm) visible físicamente a través de la malla, al ras de la base (r=48 mm).
 */
function buildKobo04(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'woven';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 175; // Talla M (175 mm) -> 175 + 38 = 213 mm (<= 245 mm A1!)
  cfg.silhouette.shadeScale = 1.0;
  cfg.silhouette.controlPoints = [
    { v: 0.0, r: 48 }, // Al ras exacto del tambor de la base (footRadius = 48 mm) sin ranura inferior!
    { v: 0.22, r: 80 }, // Hombro diagonal a ~40° (<= 45°, 0% soportes!)
    { v: 0.55, r: 74 },
    { v: 0.85, r: 66 },
    { v: 1.0, r: 62 },
  ];
  cfg.silhouette.baseRadius = 48;
  cfg.silhouette.midRadius = 74;
  cfg.silhouette.topRadius = 62;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = false;
  cfg.silhouette.includeDiffuser = true; // Doble Difusor Interno 1.0 mm Arena visible físicamente a través de la celosía!
  cfg.silhouette.buildMode = 'two_part';

  cfg.woven.pattern = 'open_lattice'; // Celosía Calada REAL con rombos pasantes!
  cfg.woven.horizFreq = 18; // 18 barras diagonales por sentido (+45° / -45°)
  cfg.woven.vertFreq = 14;
  cfg.woven.rippleDepth = 5.5;
  cfg.woven.fdmSmoothing = 0.35;

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 38;
  cfg.base.footRadius = 48; // Al ras exacto con el radio inferior de la pantalla (48 mm)!
  cfg.base.neckRadius = 28.5;
  cfg.base.coupling = 'bayonet';
  cfg.base.bayonetLugs = 3;
  cfg.base.couplingClearance = 0.35;
  cfg.base.signatureGrooves = false;
  cfg.base.authorSeal = true;
  cfg.base.collarRevealMm = 0; // Sin ranura inferior: pantalla asienta directo al ras sobre el tambor!

  cfg.mount.type = 'e26_e27';
  cfg.mount.position = 'bottom';

  cfg.visual.material = 'ozek_onyx';
  cfg.visual.baseMaterial = 'ozek_onyx';
  cfg.visual.accentMaterial = 'ozek_copper';
  cfg.visual.colorMode = 'solid';
  cfg.visual.lightOn = true;
  cfg.visual.lightIntensity = 1.7;
  cfg.visual.lightWarmth = 2600;
  cfg.sculptStrokes = [];
  return cfg;
}

export const OZEK_SIGNATURE_COLLECTION: OzekSignaturePiece[] = [
  {
    id: 'omoi-01',
    code: 'OMOI 01',
    kanji: '思い',
    title: 'Intención y Origen',
    narrative: 'Luz serena y proporción pura; plisado fino japonés sin deslumbramiento.',
    subtitle: '3 Piezas (Base Ø15 + Copa Arena + Plisado 72) · S 150 mm',
    badge: '0% soportes · 3 Piezas',
    dfmSupportNote:
      'OMOI 01 (3 Piezas): 0% soportes en Base Ónice (palito Ø15 mm + espiga Ø13 mm), Copa Arena porta-socket E26/E27 (Ø40.5 mm) y Pantalla cónica (araña Z = 0 con aro Ø40.8 mm).',
    swatches: ['#F5F2EB', '#252525'],
    config: buildOmoi01(),
  },
  {
    id: 'zoukei-02',
    code: 'ZOUKEI 02',
    kanji: '造形',
    title: 'Dar forma y Esculpir',
    narrative: 'Linterna escultórica en pliegues de origami; luz y sombra arquitectónica en Modo Jarrón.',
    subtitle: 'Origami 10×4 plano real (14 mm) · Base Cilindro 18 mm · 140×180 mm',
    badge: '0% soportes · Modo Jarrón',
    dfmSupportNote:
      'ZOUKEI 02: 0% soportes en Base Cilíndrica limpia (18–55 mm) y Linterna Origami 10×4 de rombos planos reales (abierta arriba/abajo, Modo Jarrón 1.0 mm).',
    swatches: ['#F5F2EB', '#252525'],
    config: buildZoukei02(),
  },
  {
    id: 'en-03',
    code: 'EN 03',
    kanji: '円 / ☰',
    title: 'Plenitud y Congruencia',
    narrative: 'Torre arquitectónica helicoidal ceñida por el trigrama ☰.',
    subtitle: 'Reloj de Arena 48 pliegues (60° reales) + Cinturón ☰ · L 205 mm',
    badge: '0% soportes',
    dfmSupportNote:
      'EN 03: 0% soportes en Base (al ras Ø112 mm) y Pantalla (giro axial real de 60° y cinturón ☰ de 3 anillos con flancos ≤ 45°).',
    swatches: ['#C87D55', '#252525'],
    config: buildEn03(),
  },
  {
    id: 'kobo-04',
    code: 'KŌBŌ 04',
    kanji: '工房',
    title: 'Taller de Autor',
    narrative: 'Artesanía táctil con doble profundidad luminosa.',
    subtitle: 'Trapezoide 45° · Celosía Calada 18 barras + Difusor Arena · M 175 mm',
    badge: '0% soportes · Celosía calada',
    dfmSupportNote:
      'KŌBŌ 04: 0% soportes en Base, Pantalla de Celosía Calada real (18 barras cruzadas a ≤ 45° con rombos pasantes) y Difusor Interno (1.0 mm Arena).',
    swatches: ['#252525', '#C87D55'],
    config: buildKobo04(),
  },
];

/**
 * Best-effort matcher identifying which official Collection 01 series the active config belongs to
 * (for dynamic Bambu Studio DFM guide generation).
 */
export function detectOzekCollectionPiece(config: LampConfig): OzekSignaturePiece | null {
  if (config.family === 'japanese_flute') return OZEK_SIGNATURE_COLLECTION[0];
  if (config.family === 'origami') return OZEK_SIGNATURE_COLLECTION[1];
  if (config.family === 'helical' && config.helical.obiBelt) return OZEK_SIGNATURE_COLLECTION[2];
  if (
    config.family === 'woven' &&
    (config.woven.pattern === 'open_lattice' || config.woven.pattern === 'ripple_mesh') &&
    config.silhouette.includeDiffuser
  ) {
    return OZEK_SIGNATURE_COLLECTION[3];
  }
  return null;
}
