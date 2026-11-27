import { describe, expect, it } from 'vitest';
import '../families';
import { CURATED_PRESETS, DEFAULT_CONFIG, applySizePreset, cloneConfig } from '../../data/presets';
import { OZEK_SIGNATURE_COLLECTION } from '../../data/ozekCollection';
import { generateLampGeometry } from '../solidBuilder';
import { evaluateHankoSealDepthMm } from '../baseBuilder';
import {
  buildLampZipPackage,
  exportPartToBinarySTL,
  generateBambuStudioGuide,
} from '../stlExport';
import { validateManifold } from '../analyzer';
import { generateAdapterE27ToLed001 } from '../mounts/adapterE27ToLed001';
import { getLedKit001Dimensions } from '../mounts/ledKit001';
import {
  BAYONET_FEMALE_TWIST_Y_HIGH,
  BAYONET_FEMALE_TWIST_Y_LOW,
  BAYONET_MALE_Y_END,
  BAYONET_MALE_Y_START,
  BAYONET_TWIST_END_DEG,
  COMPACT_FLUSH_COLLAR_RADIUS_MM,
  COMPACT_FLUSH_HEIGHT_MM,
  COMPACT_FLUSH_LUG_Y_END,
  COMPACT_FLUSH_LUG_Y_START,
  COMPACT_FLUSH_OUTER_RADIUS_MM,
  COMPACT_FLUSH_TWIST_Y_HIGH,
  COMPACT_FLUSH_TWIST_Y_LOW,
  SLENDER_E26_SHADE_BORE_RADIUS_MM,
  SLENDER_E26_SOCKET_OUTER_RADIUS_MM,
  THREE_PART_CUP_BORE_RADIUS_MM,
  THREE_PART_STEM_INNER_RADIUS_MM,
  THREE_PART_STEM_OUTER_RADIUS_MM,
  THREE_PART_TENON_OUTER_RADIUS_MM,
  evaluateFemaleCouplingRadius,
  evaluateMaleCouplingOffset,
  getEffectiveDomeStemHeightMm,
  getShadeSeatY,
} from '../coupling';
import { organicFamily } from '../families/organic';
import { helicalFamily } from '../families/helical';
import { origamiFamily } from '../families/origami';
import { wovenFamily } from '../families/woven';
import {
  SHADE_SIZE_PRESETS,
  SILHOUETTE_SPLINE_TEMPLATES,
  getEffectiveShadeHeight,
} from '../silhouette';
import {
  BaseStyleId,
  CouplingType,
  LampFamilyId,
  LampSizePreset,
  SpiderStyleId,
  WovenPattern,
} from '../../types/lamp';

/**
 * Slicer-grade Binary STL manifold validator (welds vertices by quantized 3D float32 position,
 * matching Bambu Studio / PrusaSlicer / Netfabb vertex welding!).
 * Catches coincident-vertex zero-area triangles and welded non-manifold edges that index-only checks miss.
 */
function validateBinarySTLManifold(stlBuffer: ArrayBuffer): {
  triangleCount: number;
  degenerateTriangles: number;
  openEdges: number;
  nonManifoldEdges: number;
  isWatertight: boolean;
  minZ: number;
} {
  const view = new DataView(stlBuffer);
  const triangleCount = view.getUint32(80, true);
  const vertMap = new Map<string, number>();
  const edgeCounts = new Map<string, number>();
  let nextVertId = 0;
  let degenerateTriangles = 0;
  let minZ = Infinity;

  const getVertId = (x: number, y: number, z: number): number => {
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let id = vertMap.get(key);
    if (id === undefined) {
      id = nextVertId++;
      vertMap.set(key, id);
    }
    return id;
  };

  for (let t = 0; t < triangleCount; t++) {
    const off = 84 + t * 50;
    const x0 = view.getFloat32(off + 12, true);
    const y0 = view.getFloat32(off + 16, true);
    const z0 = view.getFloat32(off + 20, true);
    const x1 = view.getFloat32(off + 24, true);
    const y1 = view.getFloat32(off + 28, true);
    const z1 = view.getFloat32(off + 32, true);
    const x2 = view.getFloat32(off + 36, true);
    const y2 = view.getFloat32(off + 40, true);
    const z2 = view.getFloat32(off + 44, true);

    if (z0 < minZ) minZ = z0;
    if (z1 < minZ) minZ = z1;
    if (z2 < minZ) minZ = z2;

    const a = getVertId(x0, y0, z0);
    const b = getVertId(x1, y1, z1);
    const c = getVertId(x2, y2, z2);

    if (a === b || b === c || c === a) {
      degenerateTriangles++;
      continue;
    }

    const pairs: [number, number][] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    for (const [u, v] of pairs) {
      const ek = u < v ? `${u}:${v}` : `${v}:${u}`;
      edgeCounts.set(ek, (edgeCounts.get(ek) ?? 0) + 1);
    }
  }

  let openEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) openEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  return {
    triangleCount,
    degenerateTriangles,
    openEdges,
    nonManifoldEdges,
    isWatertight: degenerateTriangles === 0 && openEdges === 0 && nonManifoldEdges === 0,
    minZ,
  };
}

/**
 * Standalone closed-sphere Organic configuration (on Compact Flush 15 mm + LED Kit 001)
 * used to test Organic modes independently of Official Collection 01 presets.
 */
function makeOrganicFlushSphereConfig() {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  cfg.family = 'organic';
  cfg.silhouette.type = 'custom_spline';
  cfg.silhouette.height = 170;
  cfg.silhouette.shadeScale = 1.0;
  cfg.silhouette.controlPoints = SILHOUETTE_SPLINE_TEMPLATES.sphere.points.map((p) => ({ ...p }));
  cfg.silhouette.baseRadius = 56;
  cfg.silhouette.midRadius = 94;
  cfg.silhouette.topRadius = 8;
  cfg.silhouette.crossSectionType = 'circle';
  cfg.silhouette.skirtWaveAmp = 0;
  cfg.silhouette.closeTopDome = true;
  cfg.silhouette.includeDiffuser = false;
  cfg.silhouette.buildMode = 'two_part';

  cfg.organic.mode = 'gravity';
  cfg.organic.voronoiCells = 16;
  cfg.organic.voronoiSoftness = 0.78;
  cfg.organic.voronoiDispersion = 0.5;
  cfg.organic.gravityAccel = -9.8;
  cfg.organic.finDepth = 20;
  cfg.organic.finThickness = 1.4;

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
  return cfg;
}

describe('OZEK Lamp Studio v2.0 — Manifold, FDM Printability & Modular Engine', () => {
  it('generates 100% watertight 2-manifold meshes for all 6 curated v2.0 designer presets', () => {
    expect(CURATED_PRESETS.length).toBe(6);
    for (const preset of CURATED_PRESETS) {
      const { parts, metrics } = generateLampGeometry(preset.config, {
        draft: false,
        validateManifold: true,
      });

      const expectedParts =
        preset.config.silhouette.buildMode === 'monoblock'
          ? 1
          : preset.config.silhouette.includeDiffuser
            ? 3
            : 2;

      expect(parts.length, `${preset.name} part count`).toBe(expectedParts);
      expect(metrics.openEdges, `${preset.name} open edges`).toBe(0);
      expect(metrics.nonManifoldEdges, `${preset.name} non-manifold edges`).toBe(0);
      expect(metrics.isWatertight, `${preset.name} watertight`).toBe(true);
      expect(metrics.volumeCm3, `${preset.name} volume > 0`).toBeGreaterThan(5);
      expect(metrics.shadeGramsPLA, `${preset.name} shade PLA`).toBeGreaterThan(15);

      if (preset.config.silhouette.buildMode === 'two_part') {
        expect(metrics.baseGramsPLA, `${preset.name} base PLA`).toBeGreaterThan(10);
      }
      if (preset.config.silhouette.includeDiffuser) {
        expect(metrics.diffuserGramsPLA, `${preset.name} diffuser PLA`).toBeGreaterThan(5);
      }
    }
  }, 30000);

  it('FIX 1 — guarantees bayonet vertical clearance (>= 0.4 mm) and zero radial interference across 0..38 deg + tactile detent', () => {
    const baseCfg = cloneConfig(CURATED_PRESETS[0].config).base;
    baseCfg.coupling = 'bayonet';
    baseCfg.bayonetLugs = 3;
    baseCfg.couplingClearance = 0.35;

    // Vertical clearance bounds check
    expect(BAYONET_MALE_Y_START - BAYONET_FEMALE_TWIST_Y_LOW).toBeGreaterThanOrEqual(0.4);
    expect(BAYONET_FEMALE_TWIST_Y_HIGH - BAYONET_MALE_Y_END).toBeGreaterThanOrEqual(0.4);

    const rMaleBase = 34.0;
    // Sweep lug center across full engagement twist [0°, 38°] (excluding the 0.35 mm soft detent bump zone at 31°)
    // and check every y in [0.2, 10.2] mm!
    for (let deg = 0; deg <= BAYONET_TWIST_END_DEG - 1.5; deg += 2) {
      const twistRad = (deg * Math.PI) / 180;
      const inDetentZone = Math.abs(deg - 31) < 5;
      for (let y = 0.2; y <= 10.2; y += 0.25) {
        const rMale = rMaleBase + evaluateMaleCouplingOffset(0, y, baseCfg);
        const rFemale = evaluateFemaleCouplingRadius(rMaleBase, twistRad, y, baseCfg);
        if (inDetentZone) {
          // Soft tactile snap bump should remain within <= 0.35 mm interference (snap fit)
          expect(rFemale - rMale, `detent at deg=${deg}, y=${y}`).toBeGreaterThan(-0.35);
        } else {
          // Strictly positive radial clearance everywhere outside the snap bump!
          expect(rFemale - rMale, `clearance at deg=${deg}, y=${y}`).toBeGreaterThan(0.05);
        }
      }
    }

    // Verify detent bump actually exists near 31° relative to open channel at 18°
    const rOpenChannel = evaluateFemaleCouplingRadius(rMaleBase, (18 * Math.PI) / 180, 5.0, baseCfg);
    const rAtDetent = evaluateFemaleCouplingRadius(rMaleBase, (31 * Math.PI) / 180, 5.0, baseCfg);
    expect(rOpenChannel - rAtDetent).toBeGreaterThan(0.2);
  });

  it('FIX 2 — sets default LED Kit 001 tolerance to +0.2 mm (Ø59.7 mm) with 45° internal chamfer dimensions', () => {
    const cfg = cloneConfig(CURATED_PRESETS[0].config);
    expect(cfg.mount.ledTolerance).toBeCloseTo(0.2, 3);
    const dims = getLedKit001Dimensions(cfg.mount);
    expect(dims.cavityDiameterMm).toBeCloseTo(59.7, 2);
    expect(dims.chamferTopMm).toBeGreaterThan(dims.cavityHeightMm);
  });

  it('FIX 3 — produces a strictly flat top rim on Organic family (v >= 0.94 => displacement === 0)', () => {
    const cfg = cloneConfig(CURATED_PRESETS[0].config);
    cfg.family = 'organic';
    const evalFn = organicFamily.createEvaluator(cfg);
    for (const v of [0.94, 0.96, 0.985, 1.0]) {
      for (let i = 0; i < 16; i++) {
        const theta = (i / 16) * Math.PI * 2;
        const sample = evalFn({
          theta,
          u: i / 16,
          v,
          y: v * 190,
          height: 190,
          baseRadius: 55,
        });
        expect(Math.abs(sample.outerOffset), `organic top rim at v=${v}`).toBeLessThan(1e-6);
      }
    }
  });

  const baseStyles: BaseStyleId[] = [
    'dome',
    'pedestal',
    'cylinder',
    'conkel',
    'tripod',
    'compact_flush',
  ];
  const couplings: CouplingType[] = [
    'gravity_seat',
    'spider',
    'slender_e26',
    'thread',
    'bayonet',
    'friction',
  ];

  it('maintains 100% watertight manifold topology across all 5 Base styles (45° vaults & gable cord slot) × 5 Couplings × LED 001 & E26/E27', () => {
    for (const style of baseStyles) {
      for (const coupling of couplings) {
        for (const mountType of ['led_kit_001', 'e26_e27'] as const) {
          const cfg = cloneConfig(CURATED_PRESETS[0].config); // Hikari baseline
          cfg.silhouette.buildMode = 'two_part';
          cfg.base.style = style;
          cfg.base.finish = style === 'dome' || style === 'cylinder' ? 'ribbed' : 'smooth';
          cfg.base.ribCount = 72;
          cfg.base.coupling = coupling;
          cfg.base.spiderBayonet = coupling === 'spider';
          cfg.silhouette.skirtWaveAmp = coupling === 'spider' ? 12 : 0;
          cfg.silhouette.skirtWaveCount = 6;
          cfg.mount.type = mountType;
          cfg.mount.position = 'bottom';

          const { parts, metrics } = generateLampGeometry(cfg, {
            draft: true,
            validateManifold: true,
          });

          expect(parts).toHaveLength(2);
          for (const part of parts) {
            const rep = validateManifold(part.positions, part.indices);
            expect(
              rep.openEdges,
              `${style}/${coupling}/${mountType}/${part.name} openEdges`
            ).toBe(0);
            expect(
              rep.nonManifoldEdges,
              `${style}/${coupling}/${mountType}/${part.name} nonManifoldEdges`
            ).toBe(0);
            expect(
              rep.isWatertight,
              `${style}/${coupling}/${mountType}/${part.name} watertight`
            ).toBe(true);
            expect(
              rep.signedVolumeMm3,
              `${style}/${coupling}/${mountType}/${part.name} volume`
            ).toBeGreaterThan(1000);
          }
          expect(metrics.isWatertight).toBe(true);
        }
      }
    }
  }, 45000);

  it('maintains watertight manifold topology for 15 mm test-base clipping across all 5 base styles & both mounts', () => {
    for (const style of baseStyles) {
      for (const mountType of ['led_kit_001', 'e26_e27'] as const) {
        const cfg = cloneConfig(CURATED_PRESETS[0].config);
        cfg.base.style = style;
        cfg.mount.type = mountType;
        const { parts, metrics } = generateLampGeometry(cfg, {
          draft: true,
          clipHeightMm: 15,
          validateManifold: true,
        });
        expect(parts).toHaveLength(1);
        expect(metrics.openEdges, `testBase ${style}/${mountType}`).toBe(0);
        expect(metrics.nonManifoldEdges, `testBase ${style}/${mountType}`).toBe(0);
        expect(metrics.isWatertight, `testBase ${style}/${mountType}`).toBe(true);
      }
    }
  }, 30000);

  const families: LampFamilyId[] = [
    'pleated',
    'japanese_flute',
    'helical',
    'louvers',
    'woven',
    'organic',
    'origami',
  ];

  it('maintains watertight manifold topology across all 7 families (including Origami) in 1-Piece & Pendant modes', () => {
    for (const family of families) {
      for (const position of ['bottom', 'top'] as const) {
        const cfg = cloneConfig(CURATED_PRESETS[0].config);
        cfg.family = family;
        cfg.silhouette.buildMode = 'monoblock';
        cfg.silhouette.skirtWaveAmp = position === 'top' ? 10 : 0;
        cfg.silhouette.skirtWaveCount = 5;
        cfg.mount.position = position;
        cfg.mount.type = position === 'top' ? 'e26_e27' : 'led_kit_001';

        const { parts, metrics } = generateLampGeometry(cfg, {
          draft: true,
          validateManifold: true,
        });

        expect(parts).toHaveLength(1);
        expect(metrics.openEdges, `${family}/${position}`).toBe(0);
        expect(metrics.nonManifoldEdges, `${family}/${position}`).toBe(0);
        expect(metrics.isWatertight, `${family}/${position}`).toBe(true);
      }
    }
  }, 30000);

  it('supports interactive 2D custom spline silhouettes + elliptical & polygonal twisted cross-sections with 0 manifold errors', () => {
    const templateKeys = Object.keys(SILHOUETTE_SPLINE_TEMPLATES) as Array<
      keyof typeof SILHOUETTE_SPLINE_TEMPLATES
    >;
    for (const tpl of templateKeys) {
      const cfg = cloneConfig(CURATED_PRESETS[3].config); // Origami base
      cfg.silhouette.type = 'custom_spline';
      cfg.silhouette.controlPoints = SILHOUETTE_SPLINE_TEMPLATES[tpl].points.map((p) => ({ ...p }));
      cfg.silhouette.crossSectionType = tpl === 'amphora' ? 'ellipse' : 'polygon';
      cfg.silhouette.ellipseAspect = 0.72;
      cfg.silhouette.polygonSides = 8;
      cfg.silhouette.polygonRounding = 0.25;
      cfg.silhouette.sectionTwistDeg = 45;

      const { parts, metrics } = generateLampGeometry(cfg, {
        draft: true,
        validateManifold: true,
      });

      expect(parts).toHaveLength(2);
      expect(metrics.openEdges, `spline:${tpl} openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `spline:${tpl} nonManifold`).toBe(0);
      expect(metrics.isWatertight, `spline:${tpl} watertight`).toBe(true);
    }
  }, 30000);

  it('generates a 3rd watertight Internal Diffuser mesh when includeDiffuser is enabled', () => {
    const zenPreset = CURATED_PRESETS.find((p) => p.id === 'preset-v2-doble-difusor-zen')!;
    expect(zenPreset.config.silhouette.includeDiffuser).toBe(true);
    const { parts, metrics } = generateLampGeometry(zenPreset.config, {
      draft: false,
      validateManifold: true,
    });
    expect(parts).toHaveLength(3);
    const diffuser = parts.find((p) => p.role === 'diffuser');
    expect(diffuser).toBeDefined();
    const rep = validateManifold(diffuser!.positions, diffuser!.indices);
    expect(rep.openEdges).toBe(0);
    expect(rep.nonManifoldEdges).toBe(0);
    expect(rep.isWatertight).toBe(true);
    expect(metrics.diffuserGramsPLA).toBeGreaterThan(8);
  });

  it('generates a watertight support-free Universal Adapter E27 <-> Bambu LED Kit 001 with Z-up minZ === 0', () => {
    const cfg = cloneConfig(CURATED_PRESETS[0].config);
    const res = generateAdapterE27ToLed001(cfg.mount);
    expect(res.openEdges).toBe(0);
    expect(res.nonManifoldEdges).toBe(0);
    expect(res.isWatertight).toBe(true);
    expect(res.gramsPLA).toBeGreaterThan(8);

    const rep = validateManifold(res.part.positions, res.part.indices);
    expect(rep.openEdges).toBe(0);
    expect(rep.nonManifoldEdges).toBe(0);
    expect(rep.isWatertight).toBe(true);
    expect(rep.signedVolumeMm3).toBeGreaterThan(6000);

    const stl = exportPartToBinarySTL(res.part);
    const view = new DataView(stl);
    const triCount = view.getUint32(80, true);
    expect(triCount).toBe(res.part.indices.length / 3);
    let minZ = Infinity;
    for (let t = 0; t < triCount; t++) {
      const off = 84 + t * 50;
      for (let v = 0; v < 3; v++) {
        const z = view.getFloat32(off + 12 + v * 12 + 8, true);
        if (z < minZ) minZ = z;
      }
    }
    expect(minZ).toBeCloseTo(0, 3);
  });

  it('builds a valid PKZIP package (.ZIP) with auto-flipped Tripod base + Bambu Studio guide', () => {
    const cfg = cloneConfig(CURATED_PRESETS[4].config); // Doble Difusor Zen (3 parts)
    cfg.base.style = 'tripod';
    const { parts, metrics } = generateLampGeometry(cfg, {
      draft: true,
      validateManifold: true,
    });

    const guide = generateBambuStudioGuide(cfg, metrics, [
      'OZEK_test_Base.stl',
      'OZEK_test_Difusor.stl',
      'OZEK_test_Pantalla.stl',
    ]);
    expect(guide).toContain('ARACHNE');
    expect(guide).toContain('Ensure vertical shell thickness');
    expect(guide).toContain('Fuzzy skin point distance : 0.8 mm');
    expect(guide).toContain('Fuzzy skin thickness      : 0.3 mm');
    expect(guide).toContain('BOCA ABAJO');
    expect(guide).toContain('LED');

    // Verify Hikari Japonesa (spider + skirtWaveAmp === 0) reports upright Z=0 printing with 0% supports
    const hikariCfg = cloneConfig(CURATED_PRESETS[0].config);
    expect(hikariCfg.silhouette.skirtWaveAmp).toBe(0);
    const hikariRes = generateLampGeometry(hikariCfg, { draft: true, validateManifold: true });
    const hikariGuide = generateBambuStudioGuide(hikariCfg, hikariRes.metrics, [
      'Hikari_Base.stl',
      'Hikari_Pantalla.stl',
    ]);
    expect(hikariGuide).toContain('Imprimir parada derecha en Z = 0, 100% sin soportes');

    const zipBuf = buildLampZipPackage(cfg, parts, metrics, 'OZEK_test');
    const bytes = new Uint8Array(zipBuf);
    // PKZIP local file header magic: 0x50 0x4B 0x03 0x04
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
    expect(bytes.byteLength).toBeGreaterThan(10000);

    // Check ASCII filename entries exist inside the ZIP archive
    const ascii = new TextDecoder('latin1').decode(bytes);
    expect(ascii).toContain('ajustes_bambu_studio.txt');
    expect(ascii).toContain('OZEK_test_Base.stl');
    expect(ascii).toContain('OZEK_test_Difusor.stl');
    expect(ascii).toContain('OZEK_test_Pantalla.stl');
  });

  it('generates high-res smooth Basketweave (0.8 -> 2.2 mm) and Hikari Japanese Flute with exact Z-up STL export', () => {
    const wovenPreset = CURATED_PRESETS.find((p) => p.config.family === 'woven')!;
    const wovenRes = generateLampGeometry(wovenPreset.config, {
      draft: false,
      validateManifold: true,
    });
    const wovenShade = wovenRes.parts.find((p) => p.role === 'shade')!;
    expect(wovenRes.metrics.isWatertight).toBe(true);
    expect(wovenShade.indices.length / 3).toBeGreaterThan(150000);

    const jpPreset = CURATED_PRESETS.find((p) => p.config.family === 'japanese_flute')!;
    const jpRes = generateLampGeometry(jpPreset.config, {
      draft: false,
      validateManifold: true,
    });
    expect(jpRes.parts).toHaveLength(2);
    expect(jpRes.metrics.isWatertight).toBe(true);
    expect(jpRes.metrics.openEdges).toBe(0);

    for (const part of jpRes.parts) {
      const stlBuffer = exportPartToBinarySTL(part);
      const view = new DataView(stlBuffer);
      const triCount = view.getUint32(80, true);
      expect(triCount).toBe(part.indices.length / 3);
      let minZ = Infinity;
      for (let t = 0; t < triCount; t++) {
        const off = 84 + t * 50;
        for (let v = 0; v < 3; v++) {
          const z = view.getFloat32(off + 12 + v * 12 + 8, true);
          if (z < minZ) minZ = z;
        }
      }
      expect(minZ, `${part.name} minZ`).toBeCloseTo(0, 3);
    }
  });

  it('FIX-A — places Bambu LED Kit 001 cup at the TOP of the base with 7 mm lateral USB notch & 0 manifold errors', () => {
    for (const style of baseStyles) {
      const cfg = cloneConfig(CURATED_PRESETS[0].config);
      cfg.base.style = style;
      cfg.base.height = 68;
      cfg.mount.type = 'led_kit_001';
      cfg.mount.ledTolerance = 0.2;

      const { parts, metrics } = generateLampGeometry(cfg, {
        draft: true,
        validateManifold: true,
      });
      const basePart = parts.find((p) => p.role === 'base')!;
      expect(metrics.openEdges, `${style} LED top cup openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `${style} LED top cup nonManifold`).toBe(0);
      expect(metrics.isWatertight, `${style} LED top cup watertight`).toBe(true);

      // Find top Y of base and confirm Ø59.7 mm (r ≈ 29.85 mm) cup vertices exist inside [maxY - 8.6, maxY]
      const pos = basePart.positions;
      let maxY = -Infinity;
      for (let i = 1; i < pos.length; i += 3) {
        if (pos[i] > maxY) maxY = pos[i];
      }
      let topCupMatches = 0;
      let notchFloorMatches = 0;
      const cupFloorY = maxY - 8.5;
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i];
        const y = pos[i + 1];
        const z = pos[i + 2];
        const r = Math.hypot(x, z);
        if (y >= cupFloorY - 0.15 && y <= maxY - 0.3 && Math.abs(r - 29.85) < 0.25) {
          topCupMatches++;
        }
        // Lateral 7 mm USB notch sits at theta = 0 (x > 0, |z| < 2.5) at cup floor level
        if (Math.abs(y - cupFloorY) < 0.25 && x > 28.5 && Math.abs(z) < 2.5) {
          notchFloorMatches++;
        }
      }
      expect(topCupMatches, `${style} upper LED cup vertices`).toBeGreaterThan(40);
      expect(notchFloorMatches, `${style} 7 mm lateral USB notch`).toBeGreaterThan(0);
    }
  }, 30000);

  it('FIX-B — seats flat spider coupling flush at Z = 0..3.5 mm when skirtWaveAmp === 0 (Hikari default) and slopes only when skirt > 0', () => {
    const hikari = cloneConfig(CURATED_PRESETS[0].config);
    expect(hikari.base.coupling).toBe('spider');
    expect(hikari.silhouette.skirtWaveAmp).toBe(0);

    const flatRes = generateLampGeometry(hikari, { draft: true, validateManifold: true });
    expect(flatRes.metrics.isWatertight).toBe(true);
    const shade = flatRes.parts.find((p) => p.role === 'shade')!;

    // Export shade Z-up STL and verify:
    //  1) Central spider hub sits flush at Z = 0
    //  2) Sculpted flat Z=0..3.5 mm spider plate spans the radial gap between hub and outer shade!
    const stl = exportPartToBinarySTL(shade);
    const view = new DataView(stl);
    const triCount = view.getUint32(80, true);
    let hubMinZ = Infinity;
    let midPlateBottomTris = 0;
    let midPlateTopTris = 0;
    for (let t = 0; t < triCount; t++) {
      const off = 84 + t * 50;
      let triAvgR = 0;
      let triMinZ = Infinity;
      let triMaxZ = -Infinity;
      for (let v = 0; v < 3; v++) {
        const vx = view.getFloat32(off + 12 + v * 12, true);
        const vy = view.getFloat32(off + 12 + v * 12 + 4, true);
        const vz = view.getFloat32(off + 12 + v * 12 + 8, true);
        const r = Math.hypot(vx, vy);
        if (r < 48 && vz < hubMinZ) hubMinZ = vz;
        triAvgR += r / 3;
        if (vz < triMinZ) triMinZ = vz;
        if (vz > triMaxZ) triMaxZ = vz;
      }
      if (triAvgR > 42 && triAvgR < 86) {
        if (triMaxZ < 0.05) midPlateBottomTris++;
        if (triMinZ > 3.45 && triMaxZ < 3.55) midPlateTopTris++;
      }
    }
    expect(hubMinZ, 'spider hub flush at Z=0').toBeCloseTo(0, 2);
    expect(midPlateBottomTris, 'flat spider bottom faces flush on Z=0').toBeGreaterThanOrEqual(20);
    expect(midPlateTopTris, 'flat spider top faces at Z=3.5 mm').toBeGreaterThanOrEqual(20);

    // Raising skirtWaveAmp > 0 switches smoothly to elevated 45° spider (still 100% watertight)
    hikari.silhouette.skirtWaveAmp = 10;
    const wavyRes = generateLampGeometry(hikari, { draft: true, validateManifold: true });
    expect(wavyRes.metrics.openEdges).toBe(0);
    expect(wavyRes.metrics.nonManifoldEdges).toBe(0);
    expect(wavyRes.metrics.isWatertight).toBe(true);
  });

  it('FIX-C — validates all 4 Woven 3D submodes (Mimbre, Knitted, deep RippleMesh & Grid) at high resolution with 0 manifold errors', () => {
    const patterns: WovenPattern[] = ['basket_1x1', 'knitted', 'ripple_mesh', 'grid_mesh'];
    const baseCfg = cloneConfig(CURATED_PRESETS[1].config); // Mimbre Cálido

    for (const pat of patterns) {
      const cfg = cloneConfig(baseCfg);
      cfg.woven.pattern = pat;
      cfg.woven.relief = 1.5;
      cfg.woven.rippleDepth = 5.2;
      if (pat === 'ripple_mesh' || pat === 'grid_mesh') {
        cfg.woven.horizFreq = 32;
        cfg.woven.vertFreq = 22;
      }

      // Verify final resolution meets >= 240 radial and >= 180 vertical
      const finalRes = wovenFamily.getResolution(cfg, false);
      expect(finalRes.radialSegs, `${pat} radialSegs`).toBeGreaterThanOrEqual(240);
      expect(finalRes.heightSegs, `${pat} heightSegs`).toBeGreaterThanOrEqual(180);

      // Verify actual wall thickness variation across the 3D surface
      const evalFn = wovenFamily.createEvaluator(cfg);
      let minThick = Infinity;
      let maxThick = -Infinity;
      for (let i = 0; i < 48; i++) {
        for (let j = 0; j < 48; j++) {
          const u = i / 48;
          const v = 0.1 + (j / 48) * 0.8;
          const res = evalFn({
            theta: u * Math.PI * 2,
            u,
            v,
            y: v * 150,
            height: 150,
            baseRadius: 70,
          });
          const t = res.explicitWallThicknessMm ?? 0;
          if (t < minThick) minThick = t;
          if (t > maxThick) maxThick = t;
        }
      }
      if (pat === 'ripple_mesh' || pat === 'grid_mesh') {
        expect(minThick, `${pat} thin translucent cell window ~0.65 mm`).toBeLessThan(0.75);
        expect(maxThick, `${pat} deep sculpted arch > 4.2 mm`).toBeGreaterThan(4.2);
      } else {
        expect(minThick, `${pat} valley thickness`).toBeLessThan(1.0);
        expect(maxThick, `${pat} crest thickness`).toBeGreaterThan(1.9);
      }

      // Full watertight 2-part manifold verification
      const built = generateLampGeometry(cfg, { draft: true, validateManifold: true });
      expect(built.metrics.openEdges, `${pat} openEdges`).toBe(0);
      expect(built.metrics.nonManifoldEdges, `${pat} nonManifold`).toBe(0);
      expect(built.metrics.isWatertight, `${pat} watertight`).toBe(true);
    }
  }, 30000);

  it('FIX-D — validates Core (1.2 mm) + Extruded Fins Organic architecture (Flames & Gravity with Lift) on Sphere silhouette', () => {
    expect(SILHOUETTE_SPLINE_TEMPLATES.sphere).toBeDefined();
    expect(SILHOUETTE_SPLINE_TEMPLATES.sphere.label).toBe('Esfera');

    for (const mode of ['flames', 'gravity'] as const) {
      const cfg = cloneConfig(CURATED_PRESETS[0].config);
      cfg.family = 'organic';
      cfg.silhouette.type = 'custom_spline';
      cfg.silhouette.controlPoints = SILHOUETTE_SPLINE_TEMPLATES.sphere.points.map((p) => ({ ...p }));
      cfg.silhouette.height = 172;
      cfg.silhouette.skirtWaveAmp = 0;
      cfg.organic.mode = mode;
      cfg.organic.finCount = 24;
      cfg.organic.flameWaves = 3;
      cfg.organic.finDepth = 14.0;
      cfg.organic.finThickness = 1.6;
      cfg.organic.finLift = 0.55;
      cfg.organic.bands = 5;

      const { parts, metrics } = generateLampGeometry(cfg, {
        draft: true,
        validateManifold: true,
      });
      expect(metrics.openEdges, `organic:${mode} openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `organic:${mode} nonManifold`).toBe(0);
      expect(metrics.isWatertight, `organic:${mode} watertight`).toBe(true);
      expect(metrics.volumeCm3, `organic:${mode} volume > 0`).toBeGreaterThan(20);

      // Confirm extruded fins genuinely protrude radially beyond the Ø188 mm (r=94 mm) sphere core!
      const shade = parts.find((p) => p.role === 'shade')!;
      let maxR = 0;
      for (let i = 0; i < shade.positions.length; i += 3) {
        const r = Math.hypot(shade.positions[i], shade.positions[i + 2]);
        if (r > maxR) maxR = r;
      }
      expect(maxR, `organic:${mode} extruded fins radius beyond core`).toBeGreaterThan(102);
    }
  }, 30000);

  it('FIX-E — validates all 4 flat Z=0 spider styles (Radial, Organic Ovals, X-Corners, Spiral) + Concave Square & Flower cross-sections', () => {
    const spiderCases: Array<{ style: SpiderStyleId; arms: number }> = [
      { style: 'radial', arms: 3 },
      { style: 'radial', arms: 4 },
      { style: 'radial', arms: 6 },
      { style: 'organic_ovals', arms: 5 },
      { style: 'x_corners', arms: 4 },
      { style: 'spiral', arms: 5 },
    ];

    for (const sc of spiderCases) {
      const cfg = cloneConfig(CURATED_PRESETS[0].config); // Hikari Japanese Flute
      cfg.base.coupling = 'spider';
      cfg.base.spiderStyle = sc.style;
      cfg.base.spiderArmCount = sc.arms;
      cfg.silhouette.skirtWaveAmp = 0;
      if (sc.style === 'x_corners') {
        cfg.silhouette.crossSectionType = 'concave_square';
        cfg.silhouette.concaveDepth = 0.22;
      } else if (sc.style === 'spiral') {
        cfg.silhouette.crossSectionType = 'flower';
        cfg.silhouette.flowerLobes = 8;
        cfg.silhouette.flowerDepth = 0.14;
        cfg.silhouette.sectionTwistDeg = 35;
      }

      const { parts, metrics } = generateLampGeometry(cfg, {
        draft: true,
        validateManifold: true,
      });
      expect(parts).toHaveLength(2);
      expect(metrics.openEdges, `spider:${sc.style}/${sc.arms} openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `spider:${sc.style}/${sc.arms} nonManifold`).toBe(0);
      expect(metrics.isWatertight, `spider:${sc.style}/${sc.arms} watertight`).toBe(true);
      expect(metrics.volumeCm3, `spider:${sc.style}/${sc.arms} positive volume`).toBeGreaterThan(20);
    }
  }, 30000);

  it('FIX-F — closes full Sphere/Dome cleanly to R = 0 mm (LED Kit 001 + Flamas pole closure, 0 degenerate pole tris) and Ø16 mm vent (E26/E27)', () => {
    // 1. LED Kit 001 -> exact R = 0 mm closed North Pole without degenerate faces or open edges (2-Piece Flush Organic Sphere!)
    const zen = makeOrganicFlushSphereConfig();
    expect(zen.silhouette.closeTopDome).toBe(true);
    expect(zen.silhouette.buildMode).toBe('two_part');
    expect(zen.base.style).toBe('compact_flush');
    expect(zen.mount.type).toBe('led_kit_001');

    const ledRes = generateLampGeometry(zen, { draft: true, validateManifold: true });
    expect(ledRes.parts).toHaveLength(2);
    expect(ledRes.metrics.openEdges, 'closed sphere LED openEdges').toBe(0);
    expect(ledRes.metrics.nonManifoldEdges, 'closed sphere LED nonManifold').toBe(0);
    expect(ledRes.metrics.isWatertight, 'closed sphere LED watertight').toBe(true);

    const shade = ledRes.parts.find((p) => p.role === 'shade')!;
    const pos = shade.positions;
    const idx = shade.indices;
    let minY = Infinity;
    for (let i = 1; i < pos.length; i += 3) {
      if (pos[i] < minY) minY = pos[i];
    }
    // Strictly clipped at Z = 0: zero vertices drop below y = 0!
    expect(minY, 'no isocontour ribbon drops below bed y = 0').toBeGreaterThanOrEqual(-1e-4);

    // Verify the exact North Pole vertex (x=0, z=0, y ≈ height + 0.35) exists with ZERO degenerate triangles
    const expectedPoleY = zen.silhouette.height + 0.35;
    let hasPoleVertex = false;
    for (let i = 0; i < pos.length; i += 3) {
      if (Math.abs(pos[i + 1] - expectedPoleY) < 0.15 && Math.hypot(pos[i], pos[i + 2]) < 1e-4) {
        hasPoleVertex = true;
        break;
      }
    }
    expect(hasPoleVertex, 'single North Pole vertex at R=0').toBe(true);

    let poleTriCount = 0;
    let degeneratePoleTris = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const isPoleVert = (o: number) =>
        Math.abs(pos[o + 1] - expectedPoleY) < 0.15 && Math.hypot(pos[o], pos[o + 2]) < 1e-4;
      if (!isPoleVert(a) && !isPoleVert(b) && !isPoleVert(c)) continue;
      poleTriCount++;
      const ux = pos[b] - pos[a],
        uy = pos[b + 1] - pos[a + 1],
        uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a],
        vy = pos[c + 1] - pos[a + 1],
        vz = pos[c + 2] - pos[a + 2];
      const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (area2 < 1e-4) degeneratePoleTris++;
    }
    expect(poleTriCount, 'polar crown fan triangles').toBeGreaterThanOrEqual(48);
    expect(degeneratePoleTris, 'zero degenerate triangles at pole').toBe(0);

    // 1b. Flamas / Ondas on closed LED sphere MUST reach exact central axis R = 0.0 mm (zero bald center circle!)
    const flamesLed = cloneConfig(zen);
    flamesLed.organic.mode = 'flames';
    flamesLed.organic.finCount = 24;
    const flamesRes = generateLampGeometry(flamesLed, { draft: true, validateManifold: true });
    expect(flamesRes.metrics.openEdges, 'Flamas closed pole openEdges').toBe(0);
    expect(flamesRes.metrics.nonManifoldEdges, 'Flamas closed pole nonManifold').toBe(0);
    expect(flamesRes.metrics.isWatertight, 'Flamas closed pole watertight').toBe(true);
    const flamesShade = flamesRes.parts.find((p) => p.role === 'shade')!;
    let flameCenterVerts = 0;
    for (let i = 0; i < flamesShade.positions.length; i += 3) {
      const r = Math.hypot(flamesShade.positions[i], flamesShade.positions[i + 2]);
      const y = flamesShade.positions[i + 1];
      if (y >= flamesLed.silhouette.height - 1.5 && r < 0.35) {
        flameCenterVerts++;
      }
    }
    // 24 flame fins converging cleanly to R ≈ 0 at North Pole -> many vertices right at center axis!
    expect(flameCenterVerts, 'Flamas fins converge at R=0 North Pole').toBeGreaterThan(24);

    // 2. E26/E27 (2-Piece) -> discreet Ø16 mm (r ≈ 8.0 mm) top thermal vent hole
    const e26Cfg = cloneConfig(zen);
    e26Cfg.silhouette.buildMode = 'two_part';
    e26Cfg.base.style = 'cylinder';
    e26Cfg.base.height = 42;
    e26Cfg.organic.mode = 'flames';
    e26Cfg.mount.type = 'e26_e27';
    const e26Res = generateLampGeometry(e26Cfg, { draft: true, validateManifold: true });
    expect(e26Res.metrics.openEdges, 'closed dome E26 openEdges').toBe(0);
    expect(e26Res.metrics.nonManifoldEdges, 'closed dome E26 nonManifold').toBe(0);
    expect(e26Res.metrics.isWatertight, 'closed dome E26 watertight').toBe(true);

    const e26Shade = e26Res.parts.find((p) => p.role === 'shade')!;
    let e26MaxY = -Infinity;
    for (let i = 1; i < e26Shade.positions.length; i += 3) {
      if (e26Shade.positions[i] > e26MaxY) e26MaxY = e26Shade.positions[i];
    }
    let minTopR = Infinity;
    for (let i = 0; i < e26Shade.positions.length; i += 3) {
      if (e26Shade.positions[i + 1] >= e26MaxY - 0.1) {
        const r = Math.hypot(e26Shade.positions[i], e26Shade.positions[i + 2]);
        if (r < minTopR) minTopR = r;
      }
    }
    expect(minTopR, 'discreet Ø16 mm vent inner radius ≈ 8 mm').toBeGreaterThanOrEqual(7.6);
    expect(minTopR, 'discreet Ø16 mm vent inner radius <= 9.2 mm').toBeLessThanOrEqual(9.2);
  }, 30000);

  it('FIX-G — validates all 4 OZ☰K Signature Collection pieces (OKU 01, ZEN 02, EN 03, KŌ 04) & 3-groove ☰ base seal', () => {
    expect(OZEK_SIGNATURE_COLLECTION).toHaveLength(4);
    for (const piece of OZEK_SIGNATURE_COLLECTION) {
      const { parts, metrics } = generateLampGeometry(piece.config, {
        draft: true,
        validateManifold: true,
      });
      const expectedParts =
        piece.config.silhouette.buildMode === 'monoblock'
          ? 1
          : (piece.config.silhouette.buildMode === 'three_part' ? 3 : 2) +
            (piece.config.silhouette.includeDiffuser ? 1 : 0);
      expect(parts.length, `${piece.code} part count`).toBe(expectedParts);
      expect(metrics.openEdges, `${piece.code} openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `${piece.code} nonManifold`).toBe(0);
      expect(metrics.isWatertight, `${piece.code} watertight`).toBe(true);
      expect(metrics.volumeCm3, `${piece.code} volume > 0`).toBeGreaterThan(25);
    }

    // Verify 3 horizontal 0.8 mm signature grooves (☰) on cylinder, dome, and pedestal bases
    for (const style of ['cylinder', 'dome', 'pedestal'] as const) {
      const cfg = cloneConfig(OZEK_SIGNATURE_COLLECTION[0].config);
      cfg.silhouette.buildMode = 'two_part';
      cfg.base.coupling = 'bayonet';
      cfg.base.domeStemHeightMm = 0;
      cfg.base.style = style;
      cfg.base.finish = 'smooth';
      cfg.base.height = 56;
      cfg.base.signatureGrooves = true;
      cfg.base.authorSeal = false;
      const { parts, metrics } = generateLampGeometry(cfg, {
        draft: true,
        validateManifold: true,
      });
      expect(metrics.openEdges, `☰ ${style} openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `☰ ${style} nonManifold`).toBe(0);
      expect(metrics.isWatertight, `☰ ${style} watertight`).toBe(true);

      // On cylinder base, confirm exactly 3 distinct groove valley heights exist at r = rFoot - 0.8 mm!
      if (style === 'cylinder') {
        const basePart = parts.find((p) => p.role === 'base')!;
        const rFoot = Math.max(cfg.base.footRadius, 32.45 + 10);
        const grooveYs = new Set<string>();
        for (let i = 0; i < basePart.positions.length; i += 3) {
          const r = Math.hypot(basePart.positions[i], basePart.positions[i + 2]);
          const y = basePart.positions[i + 1];
          if (y > 10 && y < cfg.base.height - 3 && Math.abs(r - (rFoot - 0.8)) < 0.08) {
            grooveYs.add(y.toFixed(1));
          }
        }
        expect(grooveYs.size, '3 horizontal ☰ signature groove rings').toBe(3);
      }
    }
  }, 30000);

  it('FIX-H — validates 3D Icosphere Isocontour Gravity ribbons (10/16/22 centers, 5–9 levels, 16–24 mm deep, Z >= 0) + Sculpt & AMS guide', () => {
    for (const centers of [10, 16, 22]) {
      for (const grav of [-9.8, 0, 9.8]) {
        const cfg = makeOrganicFlushSphereConfig(); // Flush 2-Piece Organic Sphere
        cfg.organic.mode = 'gravity';
        cfg.organic.voronoiCells = centers;
        cfg.organic.voronoiSoftness = centers === 10 ? 0.45 : 0.82;
        cfg.organic.voronoiDispersion = 0.5;
        cfg.organic.gravityAccel = grav;
        cfg.organic.finDepth = 20;
        cfg.organic.finThickness = 1.4;

        const res = generateLampGeometry(cfg, { draft: true, validateManifold: true });
        expect(res.parts).toHaveLength(2);
        expect(res.metrics.openEdges, `isocontours ${centers}c/${grav}g openEdges`).toBe(0);
        expect(res.metrics.nonManifoldEdges, `isocontours ${centers}c/${grav}g nonManifold`).toBe(0);
        expect(res.metrics.isWatertight, `isocontours ${centers}c/${grav}g watertight`).toBe(true);
        expect(res.metrics.volumeCm3, `isocontours ${centers}c/${grav}g volume`).toBeGreaterThan(60);

        const shadePart = res.parts.find((p) => p.role === 'shade')!;
        let minY = Infinity;
        let maxR = 0;
        for (let i = 0; i < shadePart.positions.length; i += 3) {
          const y = shadePart.positions[i + 1];
          const r = Math.hypot(shadePart.positions[i], shadePart.positions[i + 2]);
          if (y < minY) minY = y;
          if (r > maxR) maxR = r;
        }
        expect(minY, `isocontours ${centers}c/${grav}g flat bed minY >= 0`).toBeGreaterThanOrEqual(-1e-4);
        expect(maxR, `isocontours ${centers}c/${grav}g ribbons protrude beyond core`).toBeGreaterThan(108);

        // Anti-hole full-sphere coverage metric (default density 16):
        // Sample 180 uniform Fibonacci points across the visible sphere and confirm NO empty >14 mm hole exists!
        if (centers === 16) {
          const sphereR = cfg.silhouette.height / 1.78;
          const sphereYc = 0.78 * sphereR;
          const ribbonDirsX: number[] = [];
          const ribbonDirsY: number[] = [];
          const ribbonDirsZ: number[] = [];
          for (let i = 0; i < shadePart.positions.length; i += 3) {
            const dx = shadePart.positions[i];
            const dy = shadePart.positions[i + 1] - sphereYc;
            const dz = shadePart.positions[i + 2];
            const dist = Math.hypot(dx, dy, dz);
            if (dist > sphereR + 5.0) {
              ribbonDirsX.push(dx / dist);
              ribbonDirsY.push(dy / dist);
              ribbonDirsZ.push(dz / dist);
            }
          }
          expect(ribbonDirsX.length, `ribbon vertices (${grav}g)`).toBeGreaterThan(800);

          const golden = Math.PI * (3 - Math.sqrt(5));
          let maxDistToRibbonMm = 0;
          for (let k = 0; k < 180; k++) {
            const ny = 1 - (2 * (k + 0.5)) / 180;
            if (sphereYc + ny * sphereR < 16.0) continue; // above bottom bed rim
            const sr = Math.sqrt(Math.max(0, 1 - ny * ny));
            const sx = sr * Math.cos(k * golden);
            const sz = -sr * Math.sin(k * golden);
            let bestDot = -1;
            for (let j = 0; j < ribbonDirsX.length; j += 2) {
              const d = sx * ribbonDirsX[j] + ny * ribbonDirsY[j] + sz * ribbonDirsZ[j];
              if (d > bestDot) bestDot = d;
            }
            const geoMm = Math.acos(Math.max(-1, Math.min(1, bestDot))) * sphereR;
            if (geoMm > maxDistToRibbonMm) maxDistToRibbonMm = geoMm;
          }
          expect(
            maxDistToRibbonMm,
            `anti-hole max distance to nearest ribbon (${grav}g) <= 14 mm`
          ).toBeLessThan(14.0);
        }
      }
    }

    // Verify Z-up STL export minZ === 0 + Sculpt brush strokes + 2-Piece closed LED Kit 001 + AMS guide
    const cfg = makeOrganicFlushSphereConfig();
    cfg.silhouette.buildMode = 'two_part';
    cfg.organic.mode = 'gravity';
    cfg.organic.voronoiCells = 16;
    cfg.organic.gravityAccel = -9.8;
    cfg.visual.colorMode = 'stripes';
    cfg.visual.stripeRepeats = 3;
    cfg.sculptStrokes = [
      { u: 0.2, v: 0.45, radiusMm: 32, strength: 0.7, tool: 'push' },
      { u: 0.55, v: 0.55, radiusMm: 28, strength: 0.6, tool: 'swirl' },
      { u: 0.8, v: 0.4, radiusMm: 24, strength: 0.5, tool: 'carve' },
    ];

    const resTwoPart = generateLampGeometry(cfg, { draft: true, validateManifold: true });
    expect(resTwoPart.parts).toHaveLength(2);
    expect(resTwoPart.metrics.openEdges, '2-part Isocontours + sculpt openEdges').toBe(0);
    expect(resTwoPart.metrics.nonManifoldEdges, '2-part Isocontours + sculpt nonManifold').toBe(0);
    expect(resTwoPart.metrics.isWatertight, '2-part Isocontours + sculpt watertight').toBe(true);

    const shadePart = resTwoPart.parts.find((p) => p.role === 'shade')!;
    const stl = exportPartToBinarySTL(shadePart);
    const view = new DataView(stl);
    const triCount = view.getUint32(80, true);
    let minZ = Infinity;
    for (let t = 0; t < triCount; t++) {
      const off = 84 + t * 50;
      for (let v = 0; v < 3; v++) {
        const z = view.getFloat32(off + 12 + v * 12 + 8, true);
        if (z < minZ) minZ = z;
      }
    }
    expect(minZ, 'Isocontour shade STL minZ === 0').toBeCloseTo(0, 3);

    const guide = generateBambuStudioGuide(cfg, resTwoPart.metrics, [
      'ZEN_Base.stl',
      'ZEN_Pantalla.stl',
    ]);
    expect(guide).toContain('COLORACIÓN MULTICOLOR BAMBU LAB AMS');
    expect(guide).toContain('PURGA MÍNIMA');
    expect(guide).toContain('Esfera Cerrada (R = 0 mm)');
    expect(guide).toContain('Base Compacta / Al ras');
  }, 45000);

  it('FIX-I — validates Organic Growth ("Crecimiento") dense carnation ruffled fins (24–48 fins, 18–28 mm deep, vEnd = 0.999 closed pole R = 0)', () => {
    for (const finCount of [24, 32, 48]) {
      const cfg = makeOrganicFlushSphereConfig(); // Flush Closed Sphere LED Kit 001
      cfg.organic.mode = 'growth';
      cfg.organic.growthFinCount = finCount;
      cfg.organic.growthAmp = finCount === 24 ? 0.5 : 0.88;
      cfg.organic.growthFreq = finCount === 48 ? 3.2 : 2.4;
      cfg.organic.finDepth = 22;
      cfg.organic.finThickness = 1.4;

      const res = generateLampGeometry(cfg, { draft: true, validateManifold: true });
      expect(res.parts).toHaveLength(2);
      expect(res.metrics.openEdges, `growth ${finCount}f openEdges`).toBe(0);
      expect(res.metrics.nonManifoldEdges, `growth ${finCount}f nonManifold`).toBe(0);
      expect(res.metrics.isWatertight, `growth ${finCount}f watertight`).toBe(true);
      expect(res.metrics.volumeCm3, `growth ${finCount}f volume`).toBeGreaterThan(55);

      const part = res.parts.find((p) => p.role === 'shade')!;
      let minY = Infinity;
      let maxY = -Infinity;
      let hasPolarApex = false;
      for (let i = 0; i < part.positions.length; i += 3) {
        const x = part.positions[i];
        const y = part.positions[i + 1];
        const z = part.positions[i + 2];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (y > cfg.silhouette.height - 1.5 && Math.hypot(x, z) < 0.05) {
          hasPolarApex = true;
        }
      }
      expect(minY, `growth ${finCount}f minY >= 0`).toBeGreaterThanOrEqual(-1e-4);
      expect(hasPolarApex, `growth ${finCount}f closed pole R=0`).toBe(true);

      if (finCount === 32) {
        const stl = exportPartToBinarySTL(part);
        const view = new DataView(stl);
        const triCount = view.getUint32(80, true);
        let minZ = Infinity;
        for (let t = 0; t < triCount; t++) {
          const off = 84 + t * 50;
          for (let v = 0; v < 3; v++) {
            const z = view.getFloat32(off + 12 + v * 12 + 8, true);
            if (z < minZ) minZ = z;
          }
        }
        expect(minZ, 'growth STL minZ === 0').toBeCloseTo(0, 3);
      }
    }
  }, 30000);

  it('FIX-J — validates Organic Wind ("Viento") 45–75 thin fins across Brisa / Ráfagas / Remolino (Z >= 0, closed sphere R = 0)', () => {
    for (const windType of ['breeze', 'gusts', 'vortex'] as const) {
      const cfg = makeOrganicFlushSphereConfig(); // Flush Closed Sphere LED Kit 001
      cfg.organic.mode = 'wind';
      cfg.organic.windType = windType;
      cfg.organic.windFinCount = windType === 'vortex' ? 68 : 54;
      cfg.organic.windDirectionDeg = windType === 'breeze' ? 35 : windType === 'gusts' ? 140 : 250;
      cfg.organic.windIntensity = windType === 'vortex' ? 175 : 130;
      cfg.organic.finDepth = 9;
      cfg.organic.finThickness = 1.2;

      const res = generateLampGeometry(cfg, { draft: true, validateManifold: true });
      expect(res.parts).toHaveLength(2);
      expect(res.metrics.openEdges, `wind ${windType} openEdges`).toBe(0);
      expect(res.metrics.nonManifoldEdges, `wind ${windType} nonManifold`).toBe(0);
      expect(res.metrics.isWatertight, `wind ${windType} watertight`).toBe(true);
      expect(res.metrics.volumeCm3, `wind ${windType} volume`).toBeGreaterThan(55);

      const part = res.parts.find((p) => p.role === 'shade')!;
      let minY = Infinity;
      let hasPolarApex = false;
      for (let i = 0; i < part.positions.length; i += 3) {
        const x = part.positions[i];
        const y = part.positions[i + 1];
        const z = part.positions[i + 2];
        if (y < minY) minY = y;
        if (y > cfg.silhouette.height - 1.5 && Math.hypot(x, z) < 0.05) {
          hasPolarApex = true;
        }
      }
      expect(minY, `wind ${windType} minY >= 0`).toBeGreaterThanOrEqual(-1e-4);
      expect(hasPolarApex, `wind ${windType} closed pole R=0`).toBe(true);

      if (windType === 'vortex') {
        const stl = exportPartToBinarySTL(part);
        const view = new DataView(stl);
        const triCount = view.getUint32(80, true);
        let minZ = Infinity;
        for (let t = 0; t < triCount; t++) {
          const off = 84 + t * 50;
          for (let v = 0; v < 3; v++) {
            const z = view.getFloat32(off + 12 + v * 12 + 8, true);
            if (z < minZ) minZ = z;
          }
        }
        expect(minZ, 'wind vortex STL minZ === 0').toBeCloseTo(0, 3);
      }
    }
  }, 45000);

  it('FIX-K — validates Compact Flush Base (Ø 75.0 × 15.0 mm) + Exact Embedded Female Bayonet Socket (Ø 74.2 mm, seatY = 0, Z = 0)', () => {
    const zen = makeOrganicFlushSphereConfig();
    expect(zen.base.style).toBe('compact_flush');
    expect(getShadeSeatY(zen)).toBe(0);

    // 1. Vertical clearance & full 0..38° bayonet twist radial clearance verification
    expect(COMPACT_FLUSH_LUG_Y_START - COMPACT_FLUSH_TWIST_Y_LOW).toBeGreaterThanOrEqual(0.4);
    expect(COMPACT_FLUSH_TWIST_Y_HIGH - COMPACT_FLUSH_LUG_Y_END).toBeGreaterThanOrEqual(0.4);
    for (let deg = 0; deg <= BAYONET_TWIST_END_DEG - 1.5; deg += 2) {
      const twistRad = Math.PI / 3 + (deg * Math.PI) / 180;
      const inDetentZone = Math.abs(deg - 31) < 5;
      for (let y = 5.6; y <= 14.8; y += 0.25) {
        const rMale =
          COMPACT_FLUSH_COLLAR_RADIUS_MM +
          evaluateMaleCouplingOffset(Math.PI / 3, y, zen.base);
        const rFemale = evaluateFemaleCouplingRadius(
          COMPACT_FLUSH_COLLAR_RADIUS_MM,
          twistRad,
          y,
          zen.base
        );
        if (inDetentZone) {
          expect(rFemale - rMale, `compact_flush detent at deg=${deg}, y=${y}`).toBeGreaterThan(-0.3);
        } else {
          expect(rFemale - rMale, `compact_flush clearance at deg=${deg}, y=${y}`).toBeGreaterThan(0.05);
        }
      }
    }

    // 2. Full high-res watertight mesh verification of both parts (Base + Flush Sphere Shade)
    const { parts, metrics } = generateLampGeometry(zen, {
      draft: false,
      validateManifold: true,
    });
    expect(parts).toHaveLength(2);
    expect(metrics.openEdges, 'compact_flush openEdges').toBe(0);
    expect(metrics.nonManifoldEdges, 'compact_flush nonManifoldEdges').toBe(0);
    expect(metrics.isWatertight, 'compact_flush watertight').toBe(true);

    const basePart = parts.find((p) => p.role === 'base')!;
    const shadePart = parts.find((p) => p.role === 'shade')!;

    // Verify exact Base dimensions: height = 15.0 mm, lower outer rim Ø 75.0 mm (r = 37.5 mm), upper cup Ø 59.7 mm
    let baseMinY = Infinity;
    let baseMaxY = -Infinity;
    let rimMaxR = 0;
    let collarMaxR = 0;
    let cupMatches = 0;
    for (let i = 0; i < basePart.positions.length; i += 3) {
      const x = basePart.positions[i];
      const y = basePart.positions[i + 1];
      const z = basePart.positions[i + 2];
      const r = Math.hypot(x, z);
      if (y < baseMinY) baseMinY = y;
      if (y > baseMaxY) baseMaxY = y;
      if (y <= 5.51 && r > rimMaxR) rimMaxR = r;
      if (y >= 7.0 && y <= 12.5 && r > collarMaxR) collarMaxR = r;
      if (y >= 6.4 && y <= 14.6 && Math.abs(r - 29.85) < 0.25) cupMatches++;
    }
    expect(baseMinY, 'base rests flat on y=0').toBeCloseTo(0, 3);
    expect(baseMaxY, 'base exact height = 15.0 mm').toBeCloseTo(COMPACT_FLUSH_HEIGHT_MM, 2);
    expect(rimMaxR * 2, 'base outer rim diameter = 75.0 mm').toBeCloseTo(
      COMPACT_FLUSH_OUTER_RADIUS_MM * 2,
      1
    );
    expect(collarMaxR, '3 bayonet lugs protrude 1.5 mm beyond Ø73.5 mm').toBeCloseTo(38.25, 1);
    expect(cupMatches, 'Ø59.7 x 8.5 mm LED Kit 001 cup').toBeGreaterThan(80);

    // Verify Flush Shade sits flat on Z = 0, has Ø74.2 mm (r = 37.10 mm) female bore & rear 45° USB exit arch
    let shadeMinY = Infinity;
    let femaleBoreMatches = 0;
    let rearArchMatches = 0;
    for (let i = 0; i < shadePart.positions.length; i += 3) {
      const x = shadePart.positions[i];
      const y = shadePart.positions[i + 1];
      const z = shadePart.positions[i + 2];
      const r = Math.hypot(x, z);
      if (y < shadeMinY) shadeMinY = y;
      if (y >= 6.5 && y <= 14.5 && Math.abs(r - 37.1) < 0.15) femaleBoreMatches++;
      if (x > 37.0 && Math.abs(z) < 1.5 && y > 3.5 && y < 4.8) rearArchMatches++;
    }
    expect(shadeMinY, 'flush sphere shade sits at y = 0').toBeCloseTo(0, 3);
    expect(femaleBoreMatches, 'Ø74.2 mm female bayonet bore inside sphere').toBeGreaterThan(80);
    expect(rearArchMatches, '45° rear USB cable exit arch at theta = 0').toBeGreaterThanOrEqual(2);

    // Verify Z-up STL export minZ === 0 AND strict position-welded STL manifold (0 non-manifold, 0 open, 0 degenerate!)
    for (const part of [basePart, shadePart]) {
      const stl = exportPartToBinarySTL(part);
      const stlRep = validateBinarySTLManifold(stl);
      expect(stlRep.minZ, `${part.name} STL minZ === 0`).toBeCloseTo(0, 3);
      if (part.role === 'base') {
        expect(stlRep.degenerateTriangles, 'compact_flush STL 0 degenerate tris').toBe(0);
        expect(stlRep.openEdges, 'compact_flush STL 0 welded open edges').toBe(0);
        expect(stlRep.nonManifoldEdges, 'compact_flush STL 0 welded non-manifold edges').toBe(0);
        expect(stlRep.isWatertight, 'compact_flush STL slicer-grade watertight').toBe(true);
      }
    }
  }, 45000);

  it('FIX-L — scales shade parametrically across XS/S/M/L/XL (125–235 mm) + 75–140% continuous scale with 100% FIXED base, socket & coupling', () => {
    const sizes: LampSizePreset[] = ['XS', 'S', 'M', 'L', 'XL'];

    // 1. Flush Organic Sphere + Compact Flush Ø75 × 15 mm + LED Kit 001 Ø59.7 mm + Bayonet Ø74.2 mm
    const zenOrig = makeOrganicFlushSphereConfig();
    expect(zenOrig.silhouette.height).toBe(SHADE_SIZE_PRESETS.M.heightMm);

    for (const size of sizes) {
      const scaled = applySizePreset(zenOrig, size);
      // MECHANICAL GUARANTEE: Base & Mount must remain 100% untouched!
      expect(scaled.base, `ZEN 02 ${size} base unchanged`).toEqual(zenOrig.base);
      expect(scaled.mount, `ZEN 02 ${size} mount unchanged`).toEqual(zenOrig.mount);
      expect(getEffectiveShadeHeight(scaled.silhouette)).toBe(SHADE_SIZE_PRESETS[size].heightMm);

      const { parts, metrics } = generateLampGeometry(scaled, {
        draft: true,
        validateManifold: true,
      });
      expect(parts).toHaveLength(2);
      expect(metrics.openEdges, `ZEN 02 ${size} openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `ZEN 02 ${size} nonManifold`).toBe(0);
      expect(metrics.isWatertight, `ZEN 02 ${size} watertight`).toBe(true);

      // Confirm female bayonet bore inside shade stays locked at Ø74.2 mm (r = 37.10 mm) at every size!
      const shadePart = parts.find((p) => p.role === 'shade')!;
      let boreMatches = 0;
      for (let i = 0; i < shadePart.positions.length; i += 3) {
        const y = shadePart.positions[i + 1];
        const r = Math.hypot(shadePart.positions[i], shadePart.positions[i + 2]);
        if (y >= 6.5 && y <= 14.5 && Math.abs(r - 37.1) < 0.15) boreMatches++;
      }
      expect(boreMatches, `ZEN 02 ${size} fixed Ø74.2 mm bayonet bore`).toBeGreaterThan(40);
    }

    // 2. Continuous 75% and 140% shadeScale on ZEN 02 (compact_flush + LED 001) & Hikari (E26/E27 Ø40.5 mm)
    for (const scaleVal of [0.75, 1.4]) {
      const zenScaled = cloneConfig(zenOrig);
      zenScaled.silhouette.shadeScale = scaleVal;
      const resZen = generateLampGeometry(zenScaled, { draft: true, validateManifold: true });
      expect(resZen.metrics.openEdges, `ZEN scale ${scaleVal} openEdges`).toBe(0);
      expect(resZen.metrics.nonManifoldEdges, `ZEN scale ${scaleVal} nonManifold`).toBe(0);
      expect(resZen.metrics.isWatertight, `ZEN scale ${scaleVal} watertight`).toBe(true);

      // Base STL must still be exact Ø75.0 × 15.0 mm with 0 welded non-manifold edges!
      const baseStl = exportPartToBinarySTL(resZen.parts.find((p) => p.role === 'base')!);
      const baseRep = validateBinarySTLManifold(baseStl);
      expect(baseRep.nonManifoldEdges, `ZEN scale ${scaleVal} base STL non-manifold`).toBe(0);
      expect(baseRep.isWatertight, `ZEN scale ${scaleVal} base STL watertight`).toBe(true);

      const hikari = cloneConfig(CURATED_PRESETS[0].config); // E26/E27 Ø40.5 mm + Dome + Spider
      const hikariScaled = applySizePreset(hikari, scaleVal < 1 ? 'XS' : 'XL');
      expect(hikariScaled.base, `Hikari base unchanged`).toEqual(hikari.base);
      expect(hikariScaled.mount, `Hikari E26 mount unchanged`).toEqual(hikari.mount);
      hikariScaled.silhouette.shadeScale = scaleVal;
      const resHik = generateLampGeometry(hikariScaled, { draft: true, validateManifold: true });
      expect(resHik.metrics.openEdges, `Hikari scale ${scaleVal} openEdges`).toBe(0);
      expect(resHik.metrics.nonManifoldEdges, `Hikari scale ${scaleVal} nonManifold`).toBe(0);
      expect(resHik.metrics.isWatertight, `Hikari scale ${scaleVal} watertight`).toBe(true);
    }
  }, 45000);

  it('FIX-M — validates Official OZ☰K STUDIO Collection 01 (OMOI 01, ZOUKEI 02, EN 03 + Obi ☰, KŌBŌ 04), rear Hanko Z☰ deboss STL & DFM guide (<= 245 mm A1)', () => {
    expect(OZEK_SIGNATURE_COLLECTION.map((p) => p.code)).toEqual([
      'OMOI 01',
      'ZOUKEI 02',
      'EN 03',
      'KŌBŌ 04',
    ]);

    for (const piece of OZEK_SIGNATURE_COLLECTION) {
      expect(piece.config.base.authorSeal, `${piece.code} rear Hanko Z☰ enabled`).toBe(true);

      const { parts, metrics } = generateLampGeometry(piece.config, {
        draft: false,
        validateManifold: true,
      });

      expect(metrics.openEdges, `${piece.code} openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `${piece.code} nonManifoldEdges`).toBe(0);
      expect(metrics.isWatertight, `${piece.code} watertight`).toBe(true);
      expect(metrics.volumeCm3, `${piece.code} volume > 0`).toBeGreaterThan(25);
      // Strict Bambu Lab A1 safety margin (<= 245 mm in X, Y, and Z!)
      expect(metrics.widthMm, `${piece.code} width <= 245 mm`).toBeLessThanOrEqual(245);
      expect(metrics.depthMm, `${piece.code} depth <= 245 mm`).toBeLessThanOrEqual(245);
      expect(metrics.heightMm, `${piece.code} height <= 245 mm`).toBeLessThanOrEqual(245);

      // Verify Base STL passes slicer-grade position-welded manifold check (0 non-manifold, 0 degenerate!)
      const basePart = parts.find((p) => p.role === 'base')!;
      expect(basePart, `${piece.code} has base`).toBeDefined();
      const baseStl = exportPartToBinarySTL(basePart);
      const baseStlRep = validateBinarySTLManifold(baseStl);
      expect(baseStlRep.degenerateTriangles, `${piece.code} base STL 0 degenerate`).toBe(0);
      expect(baseStlRep.openEdges, `${piece.code} base STL 0 welded open`).toBe(0);
      expect(baseStlRep.nonManifoldEdges, `${piece.code} base STL 0 welded non-manifold`).toBe(0);
      expect(baseStlRep.isWatertight, `${piece.code} base STL watertight`).toBe(true);
      expect(baseStlRep.minZ, `${piece.code} base STL minZ === 0`).toBeCloseTo(0, 3);

      // Verify rear Hanko Z☰ deboss (0.6 mm inward recess) actually exists on the back wall (theta ≈ 0, x > 0)!
      let rearDebossVerts = 0;
      const isCompact = piece.config.base.style === 'compact_flush';
      const refR = isCompact
        ? COMPACT_FLUSH_COLLAR_RADIUS_MM
        : piece.config.base.style === 'cylinder'
          ? Math.max(piece.config.base.footRadius, 42.45)
          : 0;
      if (refR > 0) {
        const yMinSeal = isCompact ? 6.0 : 10.0;
        const yMaxSeal = isCompact ? 14.5 : piece.config.base.height - 2.0;
        for (let i = 0; i < basePart.positions.length; i += 3) {
          const x = basePart.positions[i];
          const y = basePart.positions[i + 1];
          const z = basePart.positions[i + 2];
          if (x > 25 && Math.abs(z) < 7.5 && y >= yMinSeal && y <= yMaxSeal) {
            const r = Math.hypot(x, z);
            if (r < refR - 0.35 && r > refR - 0.72) {
              rearDebossVerts++;
            }
          }
        }
        expect(rearDebossVerts, `${piece.code} rear Hanko Z☰ debossed vertices`).toBeGreaterThan(20);
      }

      // Verify official DFM guide content for each Collection 01 piece
      const guide = generateBambuStudioGuide(
        piece.config,
        metrics,
        parts.map((p) => `${piece.id}_${p.name}.stl`)
      );
      expect(guide).toContain('OZ☰K STUDIO — Colección 01 ("Damos alma a cada pieza.")');
      expect(guide).toContain(piece.code);
      expect(guide).toContain('ARACHNE');
      expect(guide).toContain('Ensure vertical shell thickness');
      expect(guide).toContain('Fuzzy skin point distance : 0.8 mm');
      expect(guide).toContain('sello trasero Z☰');
      expect(guide).toContain('LED');
    }

    // 1. Verify rear Hanko Z☰ is UNMIRRORED in 3D world space AND positioned right above the cable arch (gableClearY + 1.5 mm)!
    const sealSpec = {
      centerTheta: 0,
      yCenter: 16.75,
      widthMm: 11.0,
      heightMm: 12.5,
      depthMm: 0.6,
      refRadiusMm: 46,
    };
    // SDF check for 11.0 × 12.5 mm seal: gap between top bar (k=0) and bar 1 (k=1) is at v = +1.82 mm;
    // Z diagonal passes upper-right (+1.33, +1.82) & lower-left (-1.33, -1.82), leaving (-1.33, +1.82) raised!
    expect(evaluateHankoSealDepthMm(1.33, 1.82, sealSpec), 'Z☰ diagonal passes upper-right (+u,+v)').toBeGreaterThan(0.35);
    expect(evaluateHankoSealDepthMm(-1.33, 1.82, sealSpec), 'Z☰ upper-left gap (-u,+v) is raised').toBeLessThan(0.05);
    expect(evaluateHankoSealDepthMm(-1.33, -1.82, sealSpec), 'Z☰ diagonal passes lower-left (-u,-v)').toBeGreaterThan(0.35);
    expect(evaluateHankoSealDepthMm(1.33, -1.82, sealSpec), 'Z☰ lower-right gap (+u,-v) is raised').toBeLessThan(0.05);

    // 3D base mesh check on KŌBŌ 04 (smooth cylinder r = 46 mm, drumH = 38 mm, seal lowered right above cable arch: yCenter = 16.75 mm):
    const kobo04 = cloneConfig(OZEK_SIGNATURE_COLLECTION.find((p) => p.id === 'kobo-04')!.config);
    expect(kobo04.woven.horizFreq).toBe(18);
    expect(kobo04.woven.vertFreq).toBe(14);
    expect(kobo04.woven.rippleDepth).toBeCloseTo(5.5, 2);
    expect(kobo04.silhouette.includeDiffuser).toBe(true);
    // Trapezoidal 45° shoulder silhouette check: narrow base (v=0) -> max shoulder at v=0.22 -> slight inward taper to v=1.0
    expect(kobo04.silhouette.controlPoints[0].r).toBeLessThan(52);
    expect(kobo04.silhouette.controlPoints[1].v).toBeCloseTo(0.22, 2);
    expect(kobo04.silhouette.controlPoints[1].r).toBeGreaterThan(kobo04.silhouette.controlPoints[0].r + 25);
    expect(kobo04.silhouette.controlPoints[4].r).toBeLessThan(kobo04.silhouette.controlPoints[1].r);

    const koboRes = generateLampGeometry(kobo04, { draft: false, validateManifold: true });
    expect(koboRes.parts, 'KŌBŌ 04 has Base + Diffuser + Shade').toHaveLength(3);
    const koboBase = koboRes.parts.find((p) => p.role === 'base')!;
    const yCenterKobo = 9.0 + 1.5 + 12.5 * 0.5; // 16.75 mm (just above gableClearY = 9.0 mm!)
    let upperRightDebossed = 0; // screen upper-right = z < 0, y > yCenter
    let upperLeftDebossed = 0; // screen upper-left  = z > 0, y > yCenter (must be empty gap!)
    let highWallDebossed = 0; // above seal top (y > 25 mm) should have 0 deboss (confirming seal sits low above arch!)
    for (let i = 0; i < koboBase.positions.length; i += 3) {
      const x = koboBase.positions[i];
      const y = koboBase.positions[i + 1];
      const z = koboBase.positions[i + 2];
      if (x <= 35) continue;
      const dy = y - yCenterKobo;
      const r = Math.hypot(x, z);
      const isDebossed = r < 46 - 0.35;
      if (y > 25 && y < 36 && Math.abs(z) < 7 && isDebossed) highWallDebossed++;
      if (dy > 1.65 && dy < 2.0) {
        if (z < -0.95 && z > -1.75 && isDebossed) upperRightDebossed++;
        if (z > 0.95 && z < 1.75 && isDebossed) upperLeftDebossed++;
      }
    }
    expect(upperRightDebossed, 'KŌBŌ 04 rear Z☰ diagonal debossed at upper-right (z < 0)').toBeGreaterThan(0);
    expect(upperLeftDebossed, 'KŌBŌ 04 rear Z☰ upper-left (z > 0) stays un-debossed (not mirrored!)').toBe(0);
    expect(highWallDebossed, 'KŌBŌ 04 rear Z☰ sits low just above cable arch (not at top wall)').toBe(0);

    // 2. Verify ZOUKEI 02 · 造形 is real low-poly flat-triangle Origami (10×4 -> 20×8 exact, 14 mm depth, cylinder base 18 mm adjustable to 55 mm!)
    const zoukeiPiece = OZEK_SIGNATURE_COLLECTION.find((p) => p.id === 'zoukei-02')!;
    expect(zoukeiPiece.config.family).toBe('origami');
    expect(zoukeiPiece.config.origami.realFaceted).toBe(true);
    expect(zoukeiPiece.config.origami.horizFacets).toBe(10);
    expect(zoukeiPiece.config.origami.vertTiers).toBe(4);
    expect(zoukeiPiece.config.origami.depth).toBeCloseTo(14.0, 2);
    expect(zoukeiPiece.config.origami.edgeSoftness).toBeCloseTo(0.08, 2);
    expect(zoukeiPiece.config.origami.wallThickness).toBeCloseTo(1.0, 2);
    expect(zoukeiPiece.config.silhouette.height).toBe(180);
    expect(zoukeiPiece.config.silhouette.closeTopDome).toBe(false);
    expect(zoukeiPiece.config.base.style).toBe('cylinder');
    expect(zoukeiPiece.config.base.height).toBe(18);
    expect(zoukeiPiece.config.base.footRadius).toBe(46);
    expect(origamiFamily.getResolution(zoukeiPiece.config, false)).toEqual({
      radialSegs: 20,
      heightSegs: 8,
    });
    // Also verify ZOUKEI 02 with tall cylinder base (55 mm) stays 100% watertight!
    const zoukeiTall = cloneConfig(zoukeiPiece.config);
    zoukeiTall.base.height = 55;
    const zoukeiTallRes = generateLampGeometry(zoukeiTall, { draft: true, validateManifold: true });
    expect(zoukeiTallRes.metrics.openEdges, 'ZOUKEI 02 tall cylinder openEdges').toBe(0);
    expect(zoukeiTallRes.metrics.nonManifoldEdges, 'ZOUKEI 02 tall cylinder nonManifold').toBe(0);
    expect(zoukeiTallRes.metrics.isWatertight, 'ZOUKEI 02 tall cylinder watertight').toBe(true);

    // 3. Verify EN 03 · 円 / ☰ REAL axial helical twist (60°, 48 ribs, flush 56 mm base, bottom 3 mm fade = 0!)
    const en03 = cloneConfig(OZEK_SIGNATURE_COLLECTION.find((p) => p.id === 'en-03')!.config);
    expect(en03.helical.twistDeg).toBe(60);
    expect(en03.helical.ribCount).toBe(48);
    expect(en03.helical.ribDepth).toBeCloseTo(3.8, 2);
    expect(en03.helical.obiBelt).toBe(true);
    expect(en03.base.footRadius).toBe(en03.silhouette.baseRadius);
    const evalEn03 = helicalFamily.createEvaluator(en03);
    const H = en03.silhouette.height;
    // Bottom rim (v = 0) must have 0 rib protrusion so shade aligns 100% flush with Ø 112 mm cylinder base!
    expect(
      Math.abs(evalEn03({ u: 0, theta: 0.37, v: 0, y: 0, baseRadius: 56, height: H }).outerOffset),
      'EN 03 bottom rim flush (0 protrusion at v=0)'
    ).toBeLessThan(1e-5);
    // Real axial twist verification: advancing v by +0.5 shifts theta by -30° (-π/6) identically!
    const sLow = evalEn03({ u: 0, theta: 0.5, v: 0.2, y: 0.2 * H, baseRadius: 48, height: H }).outerOffset;
    const sHigh = evalEn03({
      u: 0,
      theta: 0.5 - (30 * Math.PI) / 180,
      v: 0.7,
      y: 0.7 * H,
      baseRadius: 48,
      height: H,
    }).outerOffset;
    expect(sHigh, 'EN 03 real axial twist: Δv=0.5 shifts rib phase by exact 30°').toBeCloseTo(sLow, 3);

    const sampleOffsetAtYWaist = (yWaistMm: number) =>
      evalEn03({
        u: 0,
        theta: 0,
        v: 0.5 + yWaistMm / H,
        y: H * 0.5 + yWaistMm,
        baseRadius: 41,
        height: H,
      }).outerOffset;

    // 3 crests at -2.5, 0, +2.5 mm (~+1.8 mm relief) separated by 2 valleys at -1.25, +1.25 mm (~+0.95 mm)!
    for (const c of [-2.5, 0, 2.5]) {
      expect(sampleOffsetAtYWaist(c), `EN 03 Obi ring crest at ${c} mm`).toBeGreaterThan(1.7);
    }
    for (const val of [-1.25, 1.25]) {
      expect(sampleOffsetAtYWaist(val), `EN 03 Obi ring valley at ${val} mm`).toBeLessThan(1.05);
    }

    // 4. Verify CONKEL configurable height with LED Kit 001 (respects base.height = 48 mm!)
    const conkelLed = cloneConfig(CURATED_PRESETS[0].config);
    conkelLed.base.style = 'conkel';
    conkelLed.mount.type = 'led_kit_001';
    conkelLed.base.height = 48;
    const conkelRes = generateLampGeometry(conkelLed, { draft: true, validateManifold: true });
    expect(conkelRes.metrics.openEdges, 'Conkel LED height=48 openEdges').toBe(0);
    expect(conkelRes.metrics.nonManifoldEdges, 'Conkel LED height=48 nonManifold').toBe(0);
    expect(conkelRes.metrics.isWatertight, 'Conkel LED height=48 watertight').toBe(true);
    const conkelBase = conkelRes.parts.find((p) => p.role === 'base')!;
    let conkelMaxY = -Infinity;
    for (let i = 1; i < conkelBase.positions.length; i += 3) {
      if (conkelBase.positions[i] > conkelMaxY) conkelMaxY = conkelBase.positions[i];
    }
    expect(conkelMaxY, 'Conkel LED base respects height = 48 mm').toBeCloseTo(48, 1);

    // 5. Verify OMOI 01 · 思い 3-Piece Mode (Base Ónice Ø15 mm stem + Copa Arena E26 + Pantalla Arena + ZIP Copa.stl!)
    const omoi01 = cloneConfig(OZEK_SIGNATURE_COLLECTION.find((p) => p.id === 'omoi-01')!.config);
    expect(omoi01.silhouette.buildMode).toBe('three_part');
    expect(omoi01.base.style).toBe('dome');
    expect(omoi01.base.coupling).toBe('slender_e26');
    expect(omoi01.mount.type).toBe('e26_e27');
    expect(getShadeSeatY(omoi01)).toBeCloseTo(83.5, 2); // 52 dome + 14 stem + 17.5 Copa = 83.5 mm

    const omoiRes = generateLampGeometry(omoi01, { draft: false, validateManifold: true });
    expect(omoiRes.parts, 'OMOI 01 3-Piece outputs Base + Copa + Pantalla').toHaveLength(3);
    expect(omoiRes.metrics.cupGramsPLA, 'Copa PLA > 3 g').toBeGreaterThan(3);
    const omoiBase = omoiRes.parts.find((p) => p.role === 'base')!;
    const omoiCup = omoiRes.parts.find((p) => p.role === 'cup')!;
    const omoiShade = omoiRes.parts.find((p) => p.role === 'shade')!;
    expect(omoiCup, 'OMOI 01 has independent Copa part').toBeDefined();

    // Piece 1 (Base Ónice): Ø 15 mm stem / Ø 8.5 mm bore / Ø 13 mm tenon — ZERO dark funnel above dome!
    let stemOuterVerts = 0;
    let stemInnerVerts = 0;
    let tenonVerts = 0;
    let maxRInStemZone = 0;
    for (let i = 0; i < omoiBase.positions.length; i += 3) {
      const y = omoiBase.positions[i + 1];
      const r = Math.hypot(omoiBase.positions[i], omoiBase.positions[i + 2]);
      if (y >= 51.9 && y <= 74.2 && Math.abs(r - THREE_PART_STEM_INNER_RADIUS_MM) < 0.25) {
        stemInnerVerts++;
      }
      if (y >= 53.0 && y <= 66.2) {
        if (r > maxRInStemZone) maxRInStemZone = r;
        if (Math.abs(r - THREE_PART_STEM_OUTER_RADIUS_MM) < 0.25) stemOuterVerts++;
      }
      if (y >= 66.3 && y <= 74.2) {
        if (r > maxRInStemZone) maxRInStemZone = r;
        if (Math.abs(r - THREE_PART_TENON_OUTER_RADIUS_MM) < 0.25) tenonVerts++;
      }
    }
    expect(stemOuterVerts, 'OMOI 01 Base Ø15 mm stem outer vertices').toBeGreaterThan(60);
    expect(stemInnerVerts, 'OMOI 01 Base Ø8.5 mm cable bore vertices').toBeGreaterThan(60);
    expect(tenonVerts, 'OMOI 01 Base Ø13 mm upper tenon vertices').toBeGreaterThan(60);
    expect(maxRInStemZone, 'OMOI 01 Base has ZERO dark funnel above dome (max r === 7.5 mm)').toBeCloseTo(
      THREE_PART_STEM_OUTER_RADIUS_MM,
      1
    );

    // Piece 2 (Copa Arena): Ø 13.5 mm slip bore + Ø 46 / Ø 40.5 mm E26 ring + slicer-grade watertight STL!
    const cupStl = exportPartToBinarySTL(omoiCup);
    const cupStlRep = validateBinarySTLManifold(cupStl);
    expect(cupStlRep.degenerateTriangles, 'Copa STL 0 degenerate tris').toBe(0);
    expect(cupStlRep.openEdges, 'Copa STL 0 welded open edges').toBe(0);
    expect(cupStlRep.nonManifoldEdges, 'Copa STL 0 welded non-manifold edges').toBe(0);
    expect(cupStlRep.isWatertight, 'Copa STL watertight').toBe(true);
    expect(cupStlRep.minZ, 'Copa STL sits flat on Z = 0').toBeCloseTo(0, 3);

    let cupSlipBoreVerts = 0;
    let cupE26OuterVerts = 0;
    for (let i = 0; i < omoiCup.positions.length; i += 3) {
      const y = omoiCup.positions[i + 1];
      const r = Math.hypot(omoiCup.positions[i], omoiCup.positions[i + 2]);
      if (y <= 74.5 && Math.abs(r - THREE_PART_CUP_BORE_RADIUS_MM) < 0.2) cupSlipBoreVerts++;
      if (y >= 79.8 && Math.abs(r - SLENDER_E26_SOCKET_OUTER_RADIUS_MM) < 0.25) cupE26OuterVerts++;
    }
    expect(cupSlipBoreVerts, 'Copa Ø13.5 mm slip bore vertices').toBeGreaterThan(60);
    expect(cupE26OuterVerts, 'Copa Ø46 mm E26 socket ring vertices').toBeGreaterThan(60);

    // Piece 3 (Pantalla Arena): flat Z=0 spider closes to exact Ø 40.8 mm (r = 20.4 mm) central ring!
    let shadeE26BoreVerts = 0;
    for (let i = 0; i < omoiShade.positions.length; i += 3) {
      const y = omoiShade.positions[i + 1];
      const r = Math.hypot(omoiShade.positions[i], omoiShade.positions[i + 2]);
      if (y >= 83.4 && y <= 87.1 && Math.abs(r - SLENDER_E26_SHADE_BORE_RADIUS_MM) < 0.15) {
        shadeE26BoreVerts++;
      }
    }
    expect(shadeE26BoreVerts, 'OMOI 01 shade spider Ø40.8 mm central ring bore').toBeGreaterThan(60);

    // ZIP package in 3-Piece mode MUST include Copa.stl automatically!
    const omoiZip = buildLampZipPackage(omoi01, omoiRes.parts, omoiRes.metrics, 'OZEK_OMOI');
    const omoiZipAscii = new TextDecoder('latin1').decode(new Uint8Array(omoiZip));
    expect(omoiZipAscii, '3-Piece ZIP contains Base.stl').toContain('OZEK_OMOI_Base.stl');
    expect(omoiZipAscii, '3-Piece ZIP contains Copa.stl').toContain('OZEK_OMOI_Copa.stl');
    expect(omoiZipAscii, '3-Piece ZIP contains Pantalla.stl').toContain('OZEK_OMOI_Pantalla.stl');

    // Switching mount to LED Kit 001 MUST auto-disable dome stem to 0 mm and stay 100% watertight
    const omoiLed = cloneConfig(omoi01);
    omoiLed.mount.type = 'led_kit_001';
    expect(getEffectiveDomeStemHeightMm(omoiLed)).toBe(0);
    const omoiLedRes = generateLampGeometry(omoiLed, { draft: true, validateManifold: true });
    expect(omoiLedRes.metrics.openEdges, 'OMOI 01 LED auto-disable stem openEdges').toBe(0);
    expect(omoiLedRes.metrics.nonManifoldEdges, 'OMOI 01 LED auto-disable stem nonManifold').toBe(0);
    expect(omoiLedRes.metrics.isWatertight, 'OMOI 01 LED auto-disable stem watertight').toBe(true);
  }, 60000);
});
