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
 * 1) OMOI 01 · 思い (Intención y Origen)
 * Plisado fino japonés (72 pliegues, 1.1 mm Arena), Falda = 0 mm, araña plana Z=0 con anillo central Ø 40.8 mm
 * sujetado directo con la tuerca E26/E27 sobre Cuello Esbelto real (Ø 17 mm × 16 mm, ensanche 45° a Ø 46 / Ø 40.5 mm)
 * y Base cúpula acanalada Gris Ónice + sello trasero Z☰ sobre el arco del cable, talla S (150 mm).
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
  cfg.silhouette.buildMode = 'two_part';

  cfg.japaneseFlute.count = 72;
  cfg.japaneseFlute.depth = 2.0;
  cfg.japaneseFlute.wallThickness = 1.1;
  cfg.japaneseFlute.profile = 'soft_sine';

  cfg.base.style = 'dome';
  cfg.base.finish = 'ribbed';
  cfg.base.ribCount = 68;
  cfg.base.height = 52; // 52 dome + 16 stem (Ø17) + 14.5 45°-flare + 3.5 E26 ring = 86 seatY => 86 + 150 = 236 mm (<= 245 mm A1!)
  cfg.base.domeStemHeightMm = 16;
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
 * Linterna Origami chōchin ovalada (~140 × 180 mm, 10 facetas × 4 niveles diamante marcados 11 mm,
 * edgeSoftness 0.08, pared 1.0 mm Arena, Modo Jarrón 0% soportes), abierta arriba y abajo,
 * sobre Base Compacta al ras (15 mm) Gris Ónice con LED Kit 001 y sello trasero Z☰.
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
  cfg.origami.depth = 11.0; // Pliegues geométricos profundos y escultóricos (10–12 mm)
  cfg.origami.twistDeg = 0;
  cfg.origami.edgeSoftness = 0.08; // Aristas vivas con mínimo bisel FDM
  cfg.origami.wallThickness = 1.0; // Pared translúcida 1.0 mm Modo Jarrón

  cfg.base.style = 'compact_flush';
  cfg.base.finish = 'smooth';
  cfg.base.height = 15;
  cfg.base.footRadius = 37.5;
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
 * Torre arquitectónica helicoidal marcada (48 pliegues profundos 3.8 mm, espiral real 240°) sobre silueta Reloj de Arena esbelta
 * con Cinturón ☰ (3 anillos en cintura), Pantalla Cobre (#C87D55), Base baja Gris Ónice (28 mm) + sello Z☰, talla L (205 mm).
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
  cfg.helical.twistDeg = 240;
  cfg.helical.twistDirection = 1;
  cfg.helical.profile = 'sawtooth';
  cfg.helical.doubleProfile = false;
  cfg.helical.obiBelt = true; // Cinturón ☰ de 3 anillos redondeados en la cintura!
  cfg.helical.bottomVentilation = false;

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 28;
  cfg.base.footRadius = 54;
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
 * Silueta trapezoidal arquitectónica con hombro diagonal a 45° (nace angosta en v=0.0, abre a máximo en v=0.22 y sube cónica)
 * + RippleMesh abierto (18 ondas radiales × 14 filas, 5.5 mm) en Gris Ónice (#252525) con acento Cobre (#C87D55)
 * + Doble Difusor Interno visible (1.0 mm Arena #F5F2EB), Base Gris Ónice con sello trasero Z☰, talla M (175 mm · E26/E27).
 */
function buildKobo04(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'woven';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 175; // Talla M (175 mm) -> 175 + 38 + 4 = 217 mm (<= 245 mm A1!)
  cfg.silhouette.shadeScale = 1.0;
  cfg.silhouette.controlPoints = [
    { v: 0.0, r: 47 },
    { v: 0.22, r: 80 }, // Hombro diagonal a ~41° (<= 45°, 0% soportes!)
    { v: 0.55, r: 74 },
    { v: 0.85, r: 66 },
    { v: 1.0, r: 62 },
  ];
  cfg.silhouette.baseRadius = 47;
  cfg.silhouette.midRadius = 74;
  cfg.silhouette.topRadius = 62;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = false;
  cfg.silhouette.includeDiffuser = true; // Doble Difusor Interno 1.0 mm Arena!
  cfg.silhouette.buildMode = 'two_part';

  cfg.woven.pattern = 'ripple_mesh';
  cfg.woven.horizFreq = 18;
  cfg.woven.vertFreq = 14;
  cfg.woven.rippleDepth = 5.5;
  cfg.woven.fdmSmoothing = 0.35;

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 38;
  cfg.base.footRadius = 46;
  cfg.base.neckRadius = 28.5;
  cfg.base.coupling = 'bayonet';
  cfg.base.bayonetLugs = 3;
  cfg.base.couplingClearance = 0.35;
  cfg.base.signatureGrooves = false;
  cfg.base.authorSeal = true;
  cfg.base.collarRevealMm = 4;

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
    subtitle: 'Plisado 72 (1.1 mm) · Cuello esbelto Ø17 mm E26 · S 150 mm',
    badge: '0% soportes',
    dfmSupportNote:
      'OMOI 01: 0% soportes en Base Cúpula con Cuello Esbelto Ø17 mm (ensanche 45° a anillo E26 Ø46 / Ø40.5 mm) y Pantalla (araña plana Z = 0 con aro Ø40.8 mm fijado con tuerca E26).',
    swatches: ['#F5F2EB', '#252525'],
    config: buildOmoi01(),
  },
  {
    id: 'zoukei-02',
    code: 'ZOUKEI 02',
    kanji: '造形',
    title: 'Dar forma y Esculpir',
    narrative: 'Linterna escultórica en pliegues de origami; luz y sombra arquitectónica en Modo Jarrón.',
    subtitle: 'Origami 10×4 (11 mm · Arena) · Base Al Ras 15 mm · 140×180 mm',
    badge: '0% soportes · Modo Jarrón',
    dfmSupportNote:
      'ZOUKEI 02: 0% soportes en Base Compacta al ras (15 mm) y Linterna Origami 10×4 (abierta arriba/abajo, ideal en Modo Jarrón o pared fina 1.0 mm).',
    swatches: ['#F5F2EB', '#252525'],
    config: buildZoukei02(),
  },
  {
    id: 'en-03',
    code: 'EN 03',
    kanji: '円 / ☰',
    title: 'Plenitud y Congruencia',
    narrative: 'Torre arquitectónica helicoidal ceñida por el trigrama ☰.',
    subtitle: 'Reloj de Arena 48 pliegues (240°) + Cinturón ☰ · L 205 mm',
    badge: '0% soportes',
    dfmSupportNote:
      'EN 03: 0% soportes en Base y Pantalla (espiral helicoidal 240° y cinturón ☰ de 3 anillos con flancos ≤ 45°).',
    swatches: ['#C87D55', '#252525'],
    config: buildEn03(),
  },
  {
    id: 'kobo-04',
    code: 'KŌBŌ 04',
    kanji: '工房',
    title: 'Taller de Autor',
    narrative: 'Artesanía táctil con doble profundidad luminosa.',
    subtitle: 'Trapezoide 45° · RippleMesh 18×14 + Difusor Arena · M 175 mm',
    badge: '0% soportes · Doble difusor',
    dfmSupportNote:
      'KŌBŌ 04: 0% soportes en Base, Pantalla trapezoidal con hombro a 45° (RippleMesh 18×14 abierto) y Difusor Interno (1.0 mm Arena).',
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
  if (config.family === 'woven' && config.woven.pattern === 'ripple_mesh' && config.silhouette.includeDiffuser) {
    return OZEK_SIGNATURE_COLLECTION[3];
  }
  return null;
}
