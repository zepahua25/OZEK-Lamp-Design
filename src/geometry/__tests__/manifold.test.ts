import { describe, expect, it } from 'vitest';
import '../families';
import { CURATED_PRESETS, cloneConfig } from '../../data/presets';
import { generateLampGeometry } from '../solidBuilder';
import { exportPartToBinarySTL } from '../stlExport';
import { validateManifold } from '../analyzer';
import { BaseStyleId, CouplingType, LampFamilyId } from '../../types/lamp';

describe('OZEK Lamp Studio — Modular 1-Piece & 2-Piece Manifold Engine', () => {
  it('generates 100% watertight 2-manifold Base + Shade meshes for all 7 curated designer presets', () => {
    expect(CURATED_PRESETS.length).toBe(7);
    for (const preset of CURATED_PRESETS) {
      const { parts, metrics } = generateLampGeometry(preset.config, {
        draft: false,
        validateManifold: true,
      });

      expect(parts.length, `${preset.name} part count`).toBe(2);
      expect(metrics.openEdges, `${preset.name} open edges`).toBe(0);
      expect(metrics.nonManifoldEdges, `${preset.name} non-manifold edges`).toBe(0);
      expect(metrics.isWatertight, `${preset.name} watertight`).toBe(true);
      expect(metrics.baseGramsPLA, `${preset.name} base PLA`).toBeGreaterThan(10);
      expect(metrics.shadeGramsPLA, `${preset.name} shade PLA`).toBeGreaterThan(20);
    }
  });

  const baseStyles: BaseStyleId[] = ['dome', 'pedestal', 'cylinder', 'conkel', 'tripod'];
  const couplings: CouplingType[] = ['gravity_seat', 'spider', 'thread', 'bayonet', 'friction'];

  it('maintains 100% watertight manifold topology across all 5 Base styles (smooth & ribbed) × 5 Couplings × LED 001 & E26/E27', () => {
    for (const style of baseStyles) {
      for (const coupling of couplings) {
        for (const mountType of ['led_kit_001', 'e26_e27'] as const) {
          const cfg = cloneConfig(CURATED_PRESETS[1].config); // Japanese Flute + Wavy Skirt baseline
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
          }
          expect(metrics.isWatertight).toBe(true);
        }
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
  ];

  it('maintains watertight manifold topology across all 6 families in 1-Piece & Pendant modes (including Wavy Skirt)', () => {
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

  it('generates high-res smooth Basketweave (0.8 -> 2.2 mm) and Japanese Flute (0.8 -> 2.4 mm) with exact Z-up STL export', () => {
    // 1. Basketweave check
    const wovenPreset = CURATED_PRESETS.find((p) => p.config.family === 'woven')!;
    const wovenRes = generateLampGeometry(wovenPreset.config, {
      draft: false,
      validateManifold: true,
    });
    const wovenShade = wovenRes.parts.find((p) => p.role === 'shade')!;
    expect(wovenRes.metrics.isWatertight).toBe(true);
    expect(wovenShade.indices.length / 3).toBeGreaterThan(150000);

    // 2. Japanese Flute + Ribbed Dome + 4-spoke Spider + Wavy Skirt check
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
});
