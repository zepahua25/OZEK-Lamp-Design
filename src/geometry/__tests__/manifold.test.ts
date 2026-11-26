import { describe, expect, it } from 'vitest';
import '../families';
import { CURATED_PRESETS, cloneConfig } from '../../data/presets';
import { OZEK_SIGNATURE_COLLECTION } from '../../data/ozekCollection';
import { generateLampGeometry } from '../solidBuilder';
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
  evaluateFemaleCouplingRadius,
  evaluateMaleCouplingOffset,
} from '../coupling';
import { organicFamily } from '../families/organic';
import { wovenFamily } from '../families/woven';
import { SILHOUETTE_SPLINE_TEMPLATES } from '../silhouette';
import { BaseStyleId, CouplingType, LampFamilyId, SpiderStyleId, WovenPattern } from '../../types/lamp';

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

  const baseStyles: BaseStyleId[] = ['dome', 'pedestal', 'cylinder', 'conkel', 'tripod'];
  const couplings: CouplingType[] = ['gravity_seat', 'spider', 'thread', 'bayonet', 'friction'];

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

  it('FIX-F — closes full Sphere/Dome cleanly to R = 0 mm (LED Kit 001, 0 degenerate pole tris) and Ø16 mm vent (E26/E27)', () => {
    // 1. LED Kit 001 -> exact R = 0 mm closed North Pole without degenerate faces or open edges
    const zen = cloneConfig(OZEK_SIGNATURE_COLLECTION.find((p) => p.id === 'zen-02')!.config);
    expect(zen.silhouette.closeTopDome).toBe(true);
    expect(zen.mount.type).toBe('led_kit_001');

    const ledRes = generateLampGeometry(zen, { draft: true, validateManifold: true });
    expect(ledRes.metrics.openEdges, 'closed sphere LED openEdges').toBe(0);
    expect(ledRes.metrics.nonManifoldEdges, 'closed sphere LED nonManifold').toBe(0);
    expect(ledRes.metrics.isWatertight, 'closed sphere LED watertight').toBe(true);

    const shade = ledRes.parts.find((p) => p.role === 'shade')!;
    const pos = shade.positions;
    const idx = shade.indices;
    let maxY = -Infinity;
    for (let i = 1; i < pos.length; i += 3) {
      if (pos[i] > maxY) maxY = pos[i];
    }
    // Verify polar vertex exists at R = 0.0 mm right at the North Pole!
    let hasPoleVertex = false;
    for (let i = 0; i < pos.length; i += 3) {
      if (Math.abs(pos[i + 1] - maxY) < 0.05 && Math.hypot(pos[i], pos[i + 2]) < 1e-4) {
        hasPoleVertex = true;
        break;
      }
    }
    expect(hasPoleVertex, 'single North Pole vertex at R=0').toBe(true);

    // Verify ZERO degenerate triangles touching the North Pole (area > 1e-5 mm²)
    let poleTriCount = 0;
    let degeneratePoleTris = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const touchesPole =
        Math.abs(pos[a + 1] - maxY) < 0.05 ||
        Math.abs(pos[b + 1] - maxY) < 0.05 ||
        Math.abs(pos[c + 1] - maxY) < 0.05;
      if (!touchesPole) continue;
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

    // 2. E26/E27 -> discreet Ø16 mm (r ≈ 8.0 mm) top thermal vent hole
    const e26Cfg = cloneConfig(zen);
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
      const expectedParts = piece.config.silhouette.includeDiffuser ? 3 : 2;
      expect(parts.length, `${piece.code} part count`).toBe(expectedParts);
      expect(metrics.openEdges, `${piece.code} openEdges`).toBe(0);
      expect(metrics.nonManifoldEdges, `${piece.code} nonManifold`).toBe(0);
      expect(metrics.isWatertight, `${piece.code} watertight`).toBe(true);
      expect(metrics.volumeCm3, `${piece.code} volume > 0`).toBeGreaterThan(25);
    }

    // Verify 3 horizontal 0.8 mm signature grooves (☰) on cylinder, dome, and pedestal bases
    for (const style of ['cylinder', 'dome', 'pedestal'] as const) {
      const cfg = cloneConfig(OZEK_SIGNATURE_COLLECTION[0].config);
      cfg.base.style = style;
      cfg.base.finish = 'smooth';
      cfg.base.height = 56;
      cfg.base.signatureGrooves = true;
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

  it('FIX-H — validates interactive 3D Sculpt brush strokes, Gravity -9.8/+9.8 m/s² & AMS Z-stripe guide', () => {
    const cfg = cloneConfig(OZEK_SIGNATURE_COLLECTION[1].config); // ZEN 02 sphere
    cfg.organic.mode = 'gravity';
    cfg.organic.gravityAccel = -9.8;
    cfg.organic.gravityTwistDeg = 45;
    cfg.organic.smoothPasses = 4;
    cfg.visual.colorMode = 'stripes';
    cfg.visual.stripeRepeats = 3;
    cfg.sculptStrokes = [
      { u: 0.2, v: 0.45, radiusMm: 32, strength: 0.7, tool: 'push' },
      { u: 0.55, v: 0.55, radiusMm: 28, strength: 0.6, tool: 'swirl' },
      { u: 0.8, v: 0.4, radiusMm: 24, strength: 0.5, tool: 'carve' },
    ];

    const resDown = generateLampGeometry(cfg, { draft: true, validateManifold: true });
    expect(resDown.metrics.openEdges, 'sculpt + gravity -9.8 openEdges').toBe(0);
    expect(resDown.metrics.nonManifoldEdges, 'sculpt + gravity -9.8 nonManifold').toBe(0);
    expect(resDown.metrics.isWatertight, 'sculpt + gravity -9.8 watertight').toBe(true);

    cfg.organic.gravityAccel = 9.8;
    const resUp = generateLampGeometry(cfg, { draft: true, validateManifold: true });
    expect(resUp.metrics.openEdges, 'sculpt + gravity +9.8 openEdges').toBe(0);
    expect(resUp.metrics.nonManifoldEdges, 'sculpt + gravity +9.8 nonManifold').toBe(0);
    expect(resUp.metrics.isWatertight, 'sculpt + gravity +9.8 watertight').toBe(true);

    const guide = generateBambuStudioGuide(cfg, resUp.metrics, ['ZEN_Base.stl', 'ZEN_Pantalla.stl']);
    expect(guide).toContain('COLORACIÓN MULTICOLOR BAMBU LAB AMS');
    expect(guide).toContain('PURGA MÍNIMA');
    expect(guide).toContain('Esfera Cerrada (R = 0 mm)');
  }, 30000);
});
