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
 * Plisado fino japonés (72 pliegues, 1.1 mm Arena), Falda = 0 mm, araña plana Z=0 estilo Orgánico,
 * Base cúpula acanalada Gris Ónice + cuello elevado (14 mm · E26/E27) + sello trasero Z☰, talla S (150 mm).
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
  cfg.base.height = 54; // 54 dome + 14 stem + 16 45°-flare = 84 seatY => 84 + 150 = 234 mm (<= 245 mm A1!)
  cfg.base.domeStemHeightMm = 14;
  cfg.base.footRadius = 60;
  cfg.base.neckRadius = 28.5;
  cfg.base.coupling = 'spider';
  cfg.base.spiderStyle = 'organic_ovals';
  cfg.base.spiderArmCount = 5;
  cfg.base.spiderBayonet = true;
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
 * Linterna Origami chōchin (12 facetas × 5 niveles diamante nítidos, 1.0 mm Arena, Modo Jarrón 0% soportes),
 * abierta arriba y abajo, talla M (170 mm) sobre Base Compacta al ras (15 mm) Gris Ónice con LED Kit 001 y sello Z☰.
 */
function buildZoukei02(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'origami';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 170; // Talla M (170 mm)
  cfg.silhouette.shadeScale = 1.0;
  cfg.silhouette.controlPoints = [
    { v: 0.0, r: 52 },
    { v: 0.25, r: 82 },
    { v: 0.5, r: 90 },
    { v: 0.75, r: 82 },
    { v: 1.0, r: 52 },
  ];
  cfg.silhouette.baseRadius = 52;
  cfg.silhouette.midRadius = 90;
  cfg.silhouette.topRadius = 52;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = false; // Abierta limpia arriba y abajo -> 100% Modo Jarrón sin soportes!
  cfg.silhouette.includeDiffuser = false;
  cfg.silhouette.buildMode = 'two_part';

  cfg.origami.horizFacets = 12;
  cfg.origami.vertTiers = 5;
  cfg.origami.depth = 9.5;
  cfg.origami.twistDeg = 0;
  cfg.origami.edgeSoftness = 0.08; // Aristas de diamante nítidas con bisel FDM muy sutil!
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
  cfg.visual.lightIntensity = 1.6;
  cfg.visual.lightWarmth = 2650;
  cfg.sculptStrokes = [];
  return cfg;
}

/**
 * 3) EN 03 · 円 / ☰ (Plenitud y Congruencia)
 * Torre arquitectónica helicoidal fina (56 pliegues, torsión 105°) sobre silueta Reloj de Arena esbelta
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

  cfg.helical.ribCount = 56;
  cfg.helical.ribDepth = 3.0;
  cfg.helical.twistDeg = 105;
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
 * RippleMesh profundo abierto (20 ondas radiales × 16 filas, 5.5 mm) en Gris Ónice (#252525) con acento Cobre (#C87D55)
 * + Doble Difusor Interno visible (1.0 mm Arena #F5F2EB), Base Gris Ónice con sello trasero Z☰, talla M (175 mm · E26/E27).
 */
function buildKobo04(): LampConfig {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'woven';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 175; // Talla M (175 mm) -> 175 + 42 + 4 = 221 mm (<= 245 mm A1!)
  cfg.silhouette.shadeScale = 1.0;
  cfg.silhouette.controlPoints = [
    { v: 0.0, r: 58 },
    { v: 0.22, r: 74 },
    { v: 0.54, r: 76 },
    { v: 0.82, r: 68 },
    { v: 1.0, r: 56 },
  ];
  cfg.silhouette.baseRadius = 58;
  cfg.silhouette.midRadius = 76;
  cfg.silhouette.topRadius = 56;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = false;
  cfg.silhouette.includeDiffuser = true; // Doble Difusor Interno 1.0 mm Arena!
  cfg.silhouette.buildMode = 'two_part';

  cfg.woven.pattern = 'ripple_mesh';
  cfg.woven.horizFreq = 20;
  cfg.woven.vertFreq = 16;
  cfg.woven.rippleDepth = 5.5;
  cfg.woven.fdmSmoothing = 0.35;

  cfg.base.style = 'cylinder';
  cfg.base.finish = 'smooth';
  cfg.base.height = 42;
  cfg.base.footRadius = 56;
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
    subtitle: 'Plisado 72 (1.1 mm) · Cuello elevado 14 mm E26 · S 150 mm',
    badge: '0% soportes',
    dfmSupportNote:
      'OMOI 01: 0% soportes en Base Cúpula con cuello elevado E26/E27 (ensanche a 45°) y Pantalla (araña plana en Z = 0).',
    swatches: ['#F5F2EB', '#252525'],
    config: buildOmoi01(),
  },
  {
    id: 'zoukei-02',
    code: 'ZOUKEI 02',
    kanji: '造形',
    title: 'Dar forma y Esculpir',
    narrative: 'Linterna escultórica en pliegues de origami; luz y sombra arquitectónica en Modo Jarrón.',
    subtitle: 'Origami 12×5 (1.0 mm Arena) · Base Al Ras 15 mm · M 170 mm',
    badge: '0% soportes · Modo Jarrón',
    dfmSupportNote:
      'ZOUKEI 02: 0% soportes en Base Compacta al ras (15 mm) y Linterna Origami (abierta arriba/abajo, ideal en Modo Jarrón o 2 paredes finas de 1.0 mm).',
    swatches: ['#F5F2EB', '#252525'],
    config: buildZoukei02(),
  },
  {
    id: 'en-03',
    code: 'EN 03',
    kanji: '円 / ☰',
    title: 'Plenitud y Congruencia',
    narrative: 'Torre arquitectónica helicoidal ceñida por el trigrama ☰.',
    subtitle: 'Reloj de Arena 56 pliegues (105°) + Cinturón ☰ · L 205 mm',
    badge: '0% soportes',
    dfmSupportNote:
      'EN 03: 0% soportes en Base y Pantalla (torsión helicoidal 105° y cinturón ☰ de 3 anillos con flancos ≤ 45°).',
    swatches: ['#C87D55', '#252525'],
    config: buildEn03(),
  },
  {
    id: 'kobo-04',
    code: 'KŌBŌ 04',
    kanji: '工房',
    title: 'Taller de Autor',
    narrative: 'Artesanía táctil con doble profundidad luminosa.',
    subtitle: 'RippleMesh 20×16 (5.5 mm) + Difusor Arena 1 mm · M 175 mm',
    badge: '0% soportes · Doble difusor',
    dfmSupportNote:
      'KŌBŌ 04: 0% soportes en Base, Pantalla RippleMesh abierta (20×16 celdas) y Difusor Interno (1.0 mm Arena). Compatible con E26/E27 o Adaptador LED Kit 001.',
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
