import React, { useState } from 'react';
import {
  Bookmark,
  Brush,
  Download,
  FolderOpen,
  Layers,
  Loader2,
  Package,
  Plug,
  Sparkles,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  LampConfig,
  LampFamilyId,
  LampSizePreset,
  MaterialPresetId,
  SculptToolId,
  UiMode,
} from '../types/lamp';
import { listLampFamilies } from '../geometry/registry';
import {
  SHADE_SIZE_PRESETS,
  getEffectiveShadeHeight,
  getEffectiveShadeScale,
} from '../geometry/silhouette';
import { MATERIAL_LIST } from '../viewer/materials';
import { FamilyThumbnail } from './FamilyThumbnail';
import { StudioSlider } from './controls/StudioSlider';
import { SegmentedControl } from './controls/SegmentedControl';
import { SilhouetteCurveEditor } from './controls/SilhouetteCurveEditor';

type PanelTab = 'shape' | 'pattern' | 'base' | 'material' | 'sculpt';

function clampNum(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface RightPanelProps {
  config: LampConfig;
  defaultForFamily: LampConfig;
  uiMode: UiMode;
  isExporting: boolean;
  isNight: boolean;
  sculptTool: SculptToolId;
  sculptRadiusMm: number;
  sculptStrength: number;
  onChangeSculptTool: (tool: SculptToolId) => void;
  onChangeSculptRadius: (radiusMm: number) => void;
  onChangeSculptStrength: (strength: number) => void;
  onUndoSculpt: () => void;
  onClearSculpt: () => void;
  onChangeGeometry: (updater: (prev: LampConfig) => LampConfig, draft: boolean) => void;
  onCommitGeometry: () => void;
  onChangeVisual: (updater: (prev: LampConfig) => LampConfig, recomputeOverhangs?: boolean) => void;
  onSelectFamily: (family: LampFamilyId) => void;
  onApplySizePreset: (size: LampSizePreset) => void;
  onExportFullSTL: () => void;
  onExportPartSTL: (part: 'base' | 'cup' | 'shade' | 'diffuser') => void;
  onExportTestBaseSTL: () => void;
  onExportAdapterSTL: () => void;
  onExportZipPackage: () => void;
  onOpenCollections: () => void;
  onQuickSaveJSON: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  config,
  defaultForFamily,
  uiMode,
  isExporting,
  isNight,
  sculptTool,
  sculptRadiusMm,
  sculptStrength,
  onChangeSculptTool,
  onChangeSculptRadius,
  onChangeSculptStrength,
  onUndoSculpt,
  onClearSculpt,
  onChangeGeometry,
  onCommitGeometry,
  onChangeVisual,
  onSelectFamily,
  onApplySizePreset,
  onExportFullSTL,
  onExportPartSTL,
  onExportTestBaseSTL,
  onExportAdapterSTL,
  onExportZipPackage,
  onOpenCollections,
  onQuickSaveJSON,
}) => {
  const [tab, setTab] = useState<PanelTab>('shape');
  const families = listLampFamilies();
  const activeFamily = families.find((f) => f.id === config.family) ?? families[0];
  const isTwoPart =
    (config.silhouette.buildMode === 'two_part' ||
      config.silhouette.buildMode === 'three_part') &&
    config.mount.position === 'bottom';
  const isThreePart =
    config.silhouette.buildMode === 'three_part' &&
    config.mount.position === 'bottom' &&
    config.mount.type === 'e26_e27' &&
    config.base.style !== 'compact_flush';
  const isExpert = uiMode === 'expert';

  const surfaceClass = isNight
    ? 'bg-zinc-900/88 border-zinc-700/70 text-zinc-100'
    : 'bg-white/90 border-black/[0.07] text-zinc-900';

  const mutedText = isNight ? 'text-zinc-400' : 'text-zinc-500';
  const divider = isNight ? 'border-zinc-800' : 'border-zinc-900/[0.07]';

  const updateSilhouette = (patch: Partial<LampConfig['silhouette']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, silhouette: { ...prev.silhouette, ...patch } }),
      draft
    );

  const updateBase = (patch: Partial<LampConfig['base']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, base: { ...prev.base, ...patch } }),
      draft
    );

  const updateMount = (patch: Partial<LampConfig['mount']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, mount: { ...prev.mount, ...patch } }),
      draft
    );

  const updatePleated = (patch: Partial<LampConfig['pleated']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, pleated: { ...prev.pleated, ...patch } }),
      draft
    );

  const updateJapaneseFlute = (
    patch: Partial<LampConfig['japaneseFlute']>,
    draft = true
  ) =>
    onChangeGeometry(
      (prev) => ({ ...prev, japaneseFlute: { ...prev.japaneseFlute, ...patch } }),
      draft
    );

  const updateHelical = (patch: Partial<LampConfig['helical']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, helical: { ...prev.helical, ...patch } }),
      draft
    );

  const updateLouvers = (patch: Partial<LampConfig['louvers']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, louvers: { ...prev.louvers, ...patch } }),
      draft
    );

  const updateOrigami = (patch: Partial<LampConfig['origami']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, origami: { ...prev.origami, ...patch } }),
      draft
    );

  const updateWoven = (patch: Partial<LampConfig['woven']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, woven: { ...prev.woven, ...patch } }),
      draft
    );

  const updateOrganic = (patch: Partial<LampConfig['organic']>, draft = true) =>
    onChangeGeometry(
      (prev) => ({ ...prev, organic: { ...prev.organic, ...patch } }),
      draft
    );

  const tabs: Array<{ id: PanelTab; label: string }> = [
    { id: 'shape', label: '1 Forma' },
    { id: 'pattern', label: '2 Patrón' },
    { id: 'base', label: '3 Base' },
    { id: 'material', label: '4 Color' },
    { id: 'sculpt', label: '5 Esculpir' },
  ];

  // Effective shade height (after continuous 75%-140% scale) to highlight closest XS/S/M/L/XL badge
  const effShadeH = getEffectiveShadeHeight(config.silhouette);
  const effShadeScalePct = Math.round(getEffectiveShadeScale(config.silhouette) * 100);
  const activeSize: LampSizePreset =
    effShadeH < 138
      ? 'XS'
      : effShadeH < 160
        ? 'S'
        : effShadeH < 185
          ? 'M'
          : effShadeH < 218
            ? 'L'
            : 'XL';

  const renderMaterialSwatches = (
    selected: MaterialPresetId,
    onSelect: (id: MaterialPresetId) => void,
    title: string
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-[12.5px] font-medium ${isNight ? 'text-zinc-200' : 'text-zinc-700'}`}>
          {title}
        </span>
        <span className={`text-[11px] ${mutedText}`}>
          {MATERIAL_LIST.find((m) => m.id === selected)?.name}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {MATERIAL_LIST.map((m) => {
          const isSel = m.id === selected;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              title={m.name}
              className={`group flex flex-col items-center gap-1 p-1.5 rounded-xl border transition-all ${
                isSel
                  ? isNight
                    ? 'border-amber-400 bg-zinc-800'
                    : 'border-zinc-900 bg-zinc-900/[0.04]'
                  : isNight
                    ? 'border-transparent hover:bg-zinc-800/70'
                    : 'border-transparent hover:bg-zinc-900/[0.03]'
              }`}
            >
              <span
                className="w-6 h-6 rounded-full shadow-inner transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: m.swatchHex,
                  boxShadow: `inset 0 0 0 1.5px ${m.swatchRingHex}`,
                }}
              />
              <span className="text-[10px] font-medium truncate w-full text-center">
                {m.shortName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside
      className={`fixed top-4 right-4 bottom-4 z-20 w-[364px] max-w-[calc(100vw-32px)] rounded-[24px] border backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden ${surfaceClass}`}
    >
      {/* Top 7-Family Thumbnail Strip (all 6 existing + Origami v2.0) */}
      <div className={`px-3 pt-3 pb-2 border-b ${divider}`}>
        <div className="grid grid-cols-7 gap-1">
          {families.map((fam) => {
            const active = fam.id === config.family;
            return (
              <button
                key={fam.id}
                type="button"
                onClick={() => onSelectFamily(fam.id)}
                title={fam.name}
                className={`group flex flex-col items-center gap-0.5 p-0.5 rounded-xl border-2 transition-all ${
                  active
                    ? isNight
                      ? 'border-amber-400 bg-zinc-800/80 shadow-sm'
                      : 'border-zinc-900 bg-white shadow-sm'
                    : isNight
                      ? 'border-transparent hover:bg-zinc-800/50 opacity-75 hover:opacity-100'
                      : 'border-transparent hover:bg-zinc-900/[0.04] opacity-80 hover:opacity-100'
                }`}
              >
                <div className="w-full aspect-square rounded-lg overflow-hidden shadow-inner">
                  <FamilyThumbnail family={fam.id} />
                </div>
                <span className="text-[8.5px] font-semibold tracking-[-0.02em] truncate w-full text-center">
                  {fam.shortName}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 text-center">
          <div className="text-[12.5px] font-semibold tracking-[-0.01em]">
            {activeFamily.name}
          </div>
          <p className={`text-[10.5px] leading-snug mt-0.5 ${mutedText}`}>
            {activeFamily.tagline}
          </p>
        </div>
      </div>

      {/* 4 Tabs */}
      <div className={`grid grid-cols-4 px-3 pt-2 border-b ${divider}`}>
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`pb-2 text-[11.5px] font-medium transition-colors border-b-2 -mb-px ${
                active
                  ? isNight
                    ? 'border-amber-400 text-zinc-50'
                    : 'border-zinc-900 text-zinc-950'
                  : isNight
                    ? 'border-transparent text-zinc-500 hover:text-zinc-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-700'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto studio-scroll px-4 py-3.5 space-y-3.5">
        {tab === 'shape' && (
          <>
            {/* 5 Quick Shade Sizes (XS 125 / S 150 / M 170 / L 200 / XL 235 mm) + Continuous 75–140% Scale */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className={`text-[12px] font-medium ${
                    isNight ? 'text-zinc-200' : 'text-zinc-700'
                  }`}
                >
                  Talla de pantalla
                </span>
                <span className={`font-mono-num text-[11px] ${mutedText}`}>
                  ≈ {Math.round(effShadeH)} mm pantalla
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {(
                  [
                    SHADE_SIZE_PRESETS.XS,
                    SHADE_SIZE_PRESETS.S,
                    SHADE_SIZE_PRESETS.M,
                    SHADE_SIZE_PRESETS.L,
                    SHADE_SIZE_PRESETS.XL,
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onApplySizePreset(s.id)}
                    title={`${s.label} (${s.heightMm} mm · socket y base fijos)`}
                    className={`py-1.5 px-1 rounded-xl text-[10.5px] font-semibold border transition-all flex flex-col items-center leading-tight ${
                      activeSize === s.id
                        ? isNight
                          ? 'bg-amber-400 border-amber-400 text-zinc-950'
                          : 'bg-zinc-900 border-zinc-900 text-white'
                        : isNight
                          ? 'bg-zinc-800/70 border-zinc-700/70 text-zinc-300 hover:bg-zinc-800'
                          : 'bg-zinc-900/[0.03] border-zinc-900/10 text-zinc-700 hover:bg-zinc-900/[0.07]'
                    }`}
                  >
                    <span>{s.label}</span>
                    <span className="font-mono-num text-[9px] opacity-75">{s.heightMm}</span>
                  </button>
                ))}
              </div>
              <StudioSlider
                label="Escala de pantalla"
                value={effShadeScalePct}
                defaultValue={100}
                min={75}
                max={140}
                step={1}
                unit="%"
                minLabel="75%"
                maxLabel="140%"
                dark={isNight}
                onChange={(pct) => updateSilhouette({ shadeScale: pct / 100 }, true)}
                onCommit={onCommitGeometry}
              />
              <div className={`text-[10px] leading-snug ${mutedText}`}>
                Encastre y socket fijos: Base Ø 75 mm · LED 001 Ø 59.7 mm · E26/E27 Ø 40.5 mm
              </div>
            </div>

            {/* Interactive 2D Draggable Silhouette Spline Editor */}
            <SilhouetteCurveEditor
              points={config.silhouette.controlPoints}
              heightMm={Math.round(effShadeH)}
              dark={isNight}
              onChange={(controlPoints) =>
                updateSilhouette(
                  {
                    type: 'custom_spline',
                    controlPoints,
                    baseRadius: controlPoints[0].r,
                    midRadius: controlPoints[Math.floor(controlPoints.length / 2)].r,
                    topRadius: controlPoints[controlPoints.length - 1].r,
                  },
                  true
                )
              }
              onCommit={onCommitGeometry}
            />

            {/* Optional Dual Internal Diffuser Toggle (1.0 mm translucent white cylinder) */}
            {isTwoPart && (
              <label
                className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer ${
                  config.silhouette.includeDiffuser
                    ? isNight
                      ? 'bg-amber-500/10 border-amber-400/40'
                      : 'bg-amber-50/70 border-amber-300/70'
                    : isNight
                      ? 'bg-zinc-800/40 border-zinc-700/60'
                      : 'bg-zinc-900/[0.025] border-zinc-900/[0.07]'
                }`}
              >
                <div>
                  <div className="text-[12px] font-semibold">
                    Incluir Difusor Interno (1.0 mm)
                  </div>
                  <div className={`text-[10.5px] ${mutedText}`}>
                    Cilindro blanco translúcido independiente que suaviza el foco
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.silhouette.includeDiffuser}
                  onChange={(e) =>
                    updateSilhouette({ includeDiffuser: e.target.checked }, false)
                  }
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>
            )}

            {/* Real Closed Sphere / Dome Top Cap Toggle */}
            {config.mount.position !== 'top' && (
              <label
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                  config.silhouette.closeTopDome
                    ? isNight
                      ? 'bg-emerald-500/12 border-emerald-400/40'
                      : 'bg-emerald-50/80 border-emerald-300/80'
                    : isNight
                      ? 'bg-zinc-800/40 border-zinc-700/60'
                      : 'bg-zinc-900/[0.02] border-zinc-900/[0.08]'
                }`}
              >
                <div>
                  <div className="text-[12px] font-semibold">
                    Cerrar parte superior (Esfera completa)
                  </div>
                  <div className={`text-[10.5px] ${mutedText}`}>
                    {config.mount.type === 'led_kit_001'
                      ? `Cúpula continua cerrada hasta R = 0 mm (${isTwoPart ? '2 Piezas' : '1 Pieza integrada'} · LED Kit 001)`
                      : 'E26/E27 requiere respiro térmico superior: deja orificio discreto Ø 16 mm'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(config.silhouette.closeTopDome)}
                  onChange={(e) =>
                    updateSilhouette({ closeTopDome: e.target.checked }, false)
                  }
                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                />
              </label>
            )}

            {/* Wavy bottom skirt hem (available in both Basic & Expert!) */}
            <StudioSlider
              label="Onda en borde inferior (Falda)"
              value={config.silhouette.skirtWaveAmp}
              defaultValue={defaultForFamily.silhouette.skirtWaveAmp}
              min={0}
              max={15}
              step={0.5}
              unit="mm"
              minLabel="Recto"
              maxLabel="Orgánico 15 mm"
              dark={isNight}
              onChange={(skirtWaveAmp) => updateSilhouette({ skirtWaveAmp }, true)}
              onCommit={onCommitGeometry}
            />
            {config.silhouette.skirtWaveAmp > 0.1 && (
              <StudioSlider
                label="Número de ondas de falda"
                value={config.silhouette.skirtWaveCount}
                defaultValue={defaultForFamily.silhouette.skirtWaveCount}
                min={3}
                max={8}
                step={1}
                dark={isNight}
                onChange={(skirtWaveCount) => updateSilhouette({ skirtWaveCount }, true)}
                onCommit={onCommitGeometry}
              />
            )}

            {/* EXPERT MODE: Full parametric silhouette & elliptical/polygonal cross-sections */}
            {isExpert && (
              <div className={`pt-3 border-t ${divider} space-y-3.5`}>
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
                  Parámetros avanzados de silueta y sección
                </div>

                <SegmentedControl
                  label="Modo matemático de silueta"
                  value={config.silhouette.type}
                  dark={isNight}
                  options={[
                    { value: 'custom_spline', label: 'Spline 2D' },
                    { value: 'curve', label: 'Curva' },
                    { value: 'stepped', label: 'Escala' },
                    { value: 'wavy', label: 'Anillos' },
                  ]}
                  onChange={(type) => updateSilhouette({ type }, false)}
                />

                <StudioSlider
                  label={isTwoPart ? 'Altura exacta de pantalla' : 'Altura total'}
                  value={config.silhouette.height}
                  defaultValue={defaultForFamily.silhouette.height}
                  min={90}
                  max={245}
                  step={2}
                  unit="mm"
                  dark={isNight}
                  onChange={(height) => updateSilhouette({ height }, true)}
                  onCommit={onCommitGeometry}
                />

                {config.silhouette.type !== 'custom_spline' && (
                  <>
                    <StudioSlider
                      label="Radio inferior"
                      value={config.silhouette.baseRadius}
                      defaultValue={defaultForFamily.silhouette.baseRadius}
                      min={42}
                      max={114}
                      step={1}
                      unit="mm"
                      dark={isNight}
                      onChange={(baseRadius) => updateSilhouette({ baseRadius }, true)}
                      onCommit={onCommitGeometry}
                    />
                    <StudioSlider
                      label="Radio medio"
                      value={config.silhouette.midRadius}
                      defaultValue={defaultForFamily.silhouette.midRadius}
                      min={42}
                      max={120}
                      step={1}
                      unit="mm"
                      dark={isNight}
                      onChange={(midRadius) => updateSilhouette({ midRadius }, true)}
                      onCommit={onCommitGeometry}
                    />
                    <StudioSlider
                      label="Radio superior"
                      value={config.silhouette.topRadius}
                      defaultValue={defaultForFamily.silhouette.topRadius}
                      min={26}
                      max={110}
                      step={1}
                      unit="mm"
                      dark={isNight}
                      onChange={(topRadius) => updateSilhouette({ topRadius }, true)}
                      onCommit={onCommitGeometry}
                    />
                  </>
                )}

                {config.silhouette.type === 'wavy' && (
                  <>
                    <StudioSlider
                      label="Número de anillos"
                      value={config.silhouette.wavyRings}
                      defaultValue={defaultForFamily.silhouette.wavyRings}
                      min={2}
                      max={6}
                      step={1}
                      dark={isNight}
                      onChange={(wavyRings) => updateSilhouette({ wavyRings }, true)}
                      onCommit={onCommitGeometry}
                    />
                    <StudioSlider
                      label="Volumen de ondas"
                      value={config.silhouette.wavyDepth}
                      defaultValue={defaultForFamily.silhouette.wavyDepth}
                      min={4}
                      max={22}
                      step={0.5}
                      unit="mm"
                      dark={isNight}
                      onChange={(wavyDepth) => updateSilhouette({ wavyDepth }, true)}
                      onCommit={onCommitGeometry}
                    />
                  </>
                )}

                {/* Cross-Section Type: Circle / Superellipse / Ellipse / Soft Polygon (6-12) + Twist */}
                <div className="space-y-1.5">
                  <div
                    className={`text-[12px] font-medium ${
                      isNight ? 'text-zinc-200' : 'text-zinc-700'
                    }`}
                  >
                    Sección transversal
                  </div>
                  <SegmentedControl
                    value={config.silhouette.crossSectionType}
                    dark={isNight}
                    options={[
                      { value: 'circle', label: 'Circular' },
                      { value: 'superellipse', label: 'Cuadrada' },
                      { value: 'ellipse', label: 'Elíptica' },
                    ]}
                    onChange={(crossSectionType) =>
                      updateSilhouette(
                        {
                          crossSectionType,
                          superellipse:
                            crossSectionType === 'superellipse'
                              ? Math.max(3.6, config.silhouette.superellipse)
                              : 2.0,
                        },
                        false
                      )
                    }
                  />
                  <SegmentedControl
                    value={config.silhouette.crossSectionType}
                    dark={isNight}
                    options={[
                      { value: 'polygon', label: 'Poligonal' },
                      { value: 'concave_square', label: 'Cuad. Cóncava' },
                      { value: 'flower', label: 'Flor / Pétalos' },
                    ]}
                    onChange={(crossSectionType) =>
                      updateSilhouette(
                        {
                          crossSectionType,
                          superellipse: 2.0,
                        },
                        false
                      )
                    }
                  />
                </div>

                {config.silhouette.crossSectionType === 'concave_square' && (
                  <StudioSlider
                    label="Curvatura cóncava (4 esquinas)"
                    value={config.silhouette.concaveDepth ?? 0.2}
                    defaultValue={0.2}
                    min={0.08}
                    max={0.3}
                    step={0.02}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    minLabel="Suave"
                    maxLabel="Marcada"
                    dark={isNight}
                    onChange={(concaveDepth) => updateSilhouette({ concaveDepth }, true)}
                    onCommit={onCommitGeometry}
                  />
                )}

                {config.silhouette.crossSectionType === 'flower' && (
                  <>
                    <StudioSlider
                      label="Lóbulos / pétalos"
                      value={config.silhouette.flowerLobes ?? 8}
                      defaultValue={8}
                      min={6}
                      max={10}
                      step={1}
                      dark={isNight}
                      onChange={(flowerLobes) => updateSilhouette({ flowerLobes }, true)}
                      onCommit={onCommitGeometry}
                    />
                    <StudioSlider
                      label="Profundidad de pétalos"
                      value={config.silhouette.flowerDepth ?? 0.13}
                      defaultValue={0.13}
                      min={0.05}
                      max={0.22}
                      step={0.01}
                      formatValue={(v) => `${Math.round(v * 100)}%`}
                      dark={isNight}
                      onChange={(flowerDepth) => updateSilhouette({ flowerDepth }, true)}
                      onCommit={onCommitGeometry}
                    />
                  </>
                )}

                {config.silhouette.crossSectionType === 'superellipse' && (
                  <StudioSlider
                    label="Cuadratura (Superelipse)"
                    value={config.silhouette.superellipse}
                    defaultValue={4.0}
                    min={2.2}
                    max={6.4}
                    step={0.2}
                    dark={isNight}
                    onChange={(superellipse) => updateSilhouette({ superellipse }, true)}
                    onCommit={onCommitGeometry}
                  />
                )}

                {config.silhouette.crossSectionType === 'ellipse' && (
                  <StudioSlider
                    label="Relación elíptica (óvalo)"
                    value={config.silhouette.ellipseAspect}
                    defaultValue={0.78}
                    min={0.6}
                    max={1.0}
                    step={0.02}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    minLabel="Alargada"
                    maxLabel="Redonda"
                    dark={isNight}
                    onChange={(ellipseAspect) => updateSilhouette({ ellipseAspect }, true)}
                    onCommit={onCommitGeometry}
                  />
                )}

                {config.silhouette.crossSectionType === 'polygon' && (
                  <>
                    <StudioSlider
                      label="Lados del polígono"
                      value={config.silhouette.polygonSides}
                      defaultValue={8}
                      min={6}
                      max={12}
                      step={1}
                      dark={isNight}
                      onChange={(polygonSides) => updateSilhouette({ polygonSides }, true)}
                      onCommit={onCommitGeometry}
                    />
                    <StudioSlider
                      label="Suavizado de aristas"
                      value={config.silhouette.polygonRounding}
                      defaultValue={0.35}
                      min={0}
                      max={1}
                      step={0.05}
                      formatValue={(v) => `${Math.round(v * 100)}%`}
                      dark={isNight}
                      onChange={(polygonRounding) => updateSilhouette({ polygonRounding }, true)}
                      onCommit={onCommitGeometry}
                    />
                  </>
                )}

                {config.silhouette.crossSectionType !== 'circle' && (
                  <StudioSlider
                    label="Torsión de sección (Twist)"
                    value={config.silhouette.sectionTwistDeg}
                    defaultValue={0}
                    min={0}
                    max={180}
                    step={5}
                    unit="°"
                    dark={isNight}
                    onChange={(sectionTwistDeg) => updateSilhouette({ sectionTwistDeg }, true)}
                    onCommit={onCommitGeometry}
                  />
                )}
              </div>
            )}
          </>
        )}

        {tab === 'pattern' && config.family === 'pleated' && (
          <>
            <SegmentedControl
              label="Perfil de onda"
              value={config.pleated.waveProfile}
              dark={isNight}
              options={[
                { value: 'sine', label: 'Senoidal' },
                { value: 'triangle', label: 'Acordeón' },
                { value: 'soft_square', label: 'Cuadrada' },
                { value: 'double_ridge', label: 'Doble' },
              ]}
              onChange={(waveProfile) => updatePleated({ waveProfile }, false)}
            />
            <StudioSlider
              label="Número de pliegues"
              value={config.pleated.count}
              defaultValue={defaultForFamily.pleated.count}
              min={12}
              max={80}
              step={1}
              dark={isNight}
              onChange={(count) => updatePleated({ count }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Profundidad de pliegue"
              value={config.pleated.depth}
              defaultValue={defaultForFamily.pleated.depth}
              min={1.0}
              max={14.0}
              step={0.5}
              unit="mm"
              dark={isNight}
              onChange={(depth) => updatePleated({ depth }, true)}
              onCommit={onCommitGeometry}
            />
            {isExpert && (
              <StudioSlider
                label="Suavizado en bordes"
                value={config.pleated.endTaper}
                defaultValue={defaultForFamily.pleated.endTaper}
                min={0}
                max={1}
                step={0.05}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                dark={isNight}
                onChange={(endTaper) => updatePleated({ endTaper }, true)}
                onCommit={onCommitGeometry}
              />
            )}
          </>
        )}

        {tab === 'pattern' && config.family === 'japanese_flute' && (
          <>
            <SegmentedControl
              label="Perfil de plisado fino"
              value={config.japaneseFlute.profile}
              dark={isNight}
              options={[
                { value: 'soft_sine', label: 'Washi suave' },
                { value: 'scallop', label: 'Cerámica Flute' },
              ]}
              onChange={(profile) => updateJapaneseFlute({ profile }, false)}
            />
            <StudioSlider
              label="Número de pliegues finos"
              value={config.japaneseFlute.count}
              defaultValue={defaultForFamily.japaneseFlute.count}
              min={40}
              max={100}
              step={2}
              dark={isNight}
              onChange={(count) => updateJapaneseFlute({ count }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Profundidad suave"
              value={config.japaneseFlute.depth}
              defaultValue={defaultForFamily.japaneseFlute.depth}
              min={1.5}
              max={3.0}
              step={0.1}
              unit="mm"
              dark={isNight}
              onChange={(depth) => updateJapaneseFlute({ depth }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Grosor pared translúcida"
              value={config.japaneseFlute.wallThickness}
              defaultValue={defaultForFamily.japaneseFlute.wallThickness}
              min={0.8}
              max={2.4}
              step={0.1}
              unit="mm"
              minLabel="0.8 mm (luminosa)"
              maxLabel="2.4 mm (sólida)"
              dark={isNight}
              onChange={(wallThickness) => updateJapaneseFlute({ wallThickness }, true)}
              onCommit={onCommitGeometry}
            />
          </>
        )}

        {tab === 'pattern' && config.family === 'helical' && (
          <>
            <SegmentedControl
              label="Perfil de costilla"
              value={config.helical.profile}
              dark={isNight}
              options={[
                { value: 'sawtooth', label: 'Ámbar' },
                { value: 'faceted', label: 'Diamante' },
                { value: 'sine', label: 'Senoidal' },
              ]}
              onChange={(profile) => updateHelical({ profile }, false)}
            />
            <StudioSlider
              label="Torsión progresiva (Twist)"
              value={config.helical.twistDeg}
              defaultValue={defaultForFamily.helical.twistDeg}
              min={0}
              max={360}
              step={5}
              unit="°"
              dark={isNight}
              onChange={(twistDeg) => updateHelical({ twistDeg }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Número de costillas"
              value={config.helical.ribCount}
              defaultValue={defaultForFamily.helical.ribCount}
              min={12}
              max={64}
              step={1}
              dark={isNight}
              onChange={(ribCount) => updateHelical({ ribCount }, true)}
              onCommit={onCommitGeometry}
            />
            <label
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                config.helical.obiBelt
                  ? isNight
                    ? 'bg-amber-500/12 border-amber-400/40'
                    : 'bg-amber-50/80 border-amber-300/80'
                  : isNight
                    ? 'bg-zinc-800/40 border-zinc-700/60'
                    : 'bg-zinc-900/[0.02] border-zinc-900/[0.08]'
              }`}
            >
              <div>
                <div className="text-[12px] font-semibold">Cinturón ☰ (3 anillos en cintura)</div>
                <div className={`text-[10.5px] ${mutedText}`}>
                  3 anillos redondeados (1.8 mm · ≤ 45°, 0% soportes · EN 03)
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(config.helical.obiBelt)}
                onChange={(e) => updateHelical({ obiBelt: e.target.checked }, false)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer pt-1">
              <span className="text-[12.5px] font-medium">Doble perfil diamante (F017)</span>
              <input
                type="checkbox"
                checked={config.helical.doubleProfile}
                onChange={(e) => updateHelical({ doubleProfile: e.target.checked }, false)}
                className="w-4 h-4 accent-zinc-900 rounded cursor-pointer"
              />
            </label>
            {isExpert && (
              <>
                <StudioSlider
                  label="Relieve de costillas"
                  value={config.helical.ribDepth}
                  defaultValue={defaultForFamily.helical.ribDepth}
                  min={1.5}
                  max={12.0}
                  step={0.5}
                  unit="mm"
                  dark={isNight}
                  onChange={(ribDepth) => updateHelical({ ribDepth }, true)}
                  onCommit={onCommitGeometry}
                />
                <SegmentedControl
                  label="Sentido de giro"
                  value={String(config.helical.twistDirection)}
                  dark={isNight}
                  options={[
                    { value: '1', label: 'Horario (CW)' },
                    { value: '-1', label: 'Antihorario (CCW)' },
                  ]}
                  onChange={(v) => updateHelical({ twistDirection: v === '1' ? 1 : -1 }, false)}
                />
                {config.helical.doubleProfile && (
                  <StudioSlider
                    label="Intensidad diamante"
                    value={config.helical.doubleMix}
                    defaultValue={0.85}
                    min={0.2}
                    max={1.0}
                    step={0.05}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    dark={isNight}
                    onChange={(doubleMix) => updateHelical({ doubleMix }, true)}
                    onCommit={onCommitGeometry}
                  />
                )}
              </>
            )}
          </>
        )}

        {tab === 'pattern' && config.family === 'louvers' && (
          <>
            <StudioSlider
              label="Número de láminas / aletas"
              value={config.louvers.finCount}
              defaultValue={defaultForFamily.louvers.finCount}
              min={16}
              max={56}
              step={1}
              dark={isNight}
              onChange={(finCount) => updateLouvers({ finCount }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Profundidad de aletas"
              value={config.louvers.finDepth}
              defaultValue={defaultForFamily.louvers.finDepth}
              min={6}
              max={24}
              step={0.5}
              unit="mm"
              dark={isNight}
              onChange={(finDepth) => updateLouvers({ finDepth }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Giro fluido S-Curve"
              value={config.louvers.sweepDeg}
              defaultValue={defaultForFamily.louvers.sweepDeg}
              min={0}
              max={180}
              step={5}
              unit="°"
              dark={isNight}
              onChange={(sweepDeg) => updateLouvers({ sweepDeg }, true)}
              onCommit={onCommitGeometry}
            />
            {isExpert && (
              <>
                <StudioSlider
                  label="Esbeltez de lámina"
                  value={config.louvers.bladeSharpness}
                  defaultValue={defaultForFamily.louvers.bladeSharpness}
                  min={0.35}
                  max={0.92}
                  step={0.02}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  dark={isNight}
                  onChange={(bladeSharpness) => updateLouvers({ bladeSharpness }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Ondulación orgánica"
                  value={config.louvers.waveAmplitude}
                  defaultValue={defaultForFamily.louvers.waveAmplitude}
                  min={0}
                  max={1}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  dark={isNight}
                  onChange={(waveAmplitude) => updateLouvers({ waveAmplitude }, true)}
                  onCommit={onCommitGeometry}
                />
              </>
            )}
          </>
        )}

        {tab === 'pattern' && config.family === 'origami' && (
          <>
            <SegmentedControl
              label="Dirección de pliegues"
              value={config.origami.invertFolds ? 'inward' : 'outward'}
              dark={isNight}
              options={[
                { value: 'outward', label: 'Hacia afuera (Erizo / Cristal)' },
                { value: 'inward', label: 'Hacia adentro (Origami)' },
              ]}
              onChange={(dir) => updateOrigami({ invertFolds: dir === 'inward' }, false)}
            />
            <StudioSlider
              label="Facetas diamante por vuelta"
              value={config.origami.horizFacets}
              defaultValue={defaultForFamily.origami.horizFacets}
              min={6}
              max={24}
              step={1}
              minLabel="6 (grandes)"
              maxLabel="24 (finas)"
              dark={isNight}
              onChange={(horizFacets) => updateOrigami({ horizFacets }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Niveles verticales de pliegue"
              value={config.origami.vertTiers}
              defaultValue={defaultForFamily.origami.vertTiers}
              min={2}
              max={12}
              step={1}
              minLabel="2 (amplios)"
              maxLabel="12 (piquitos)"
              dark={isNight}
              onChange={(vertTiers) => updateOrigami({ vertTiers }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Profundidad geométrica"
              value={config.origami.depth}
              defaultValue={defaultForFamily.origami.depth}
              min={2.0}
              max={16.0}
              step={0.5}
              unit="mm"
              dark={isNight}
              onChange={(depth) => updateOrigami({ depth }, true)}
              onCommit={onCommitGeometry}
            />
            <label
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                config.origami.realFaceted !== false
                  ? isNight
                    ? 'bg-amber-500/12 border-amber-400/40'
                    : 'bg-amber-50/80 border-amber-300/80'
                  : isNight
                    ? 'bg-zinc-800/40 border-zinc-700/60'
                    : 'bg-zinc-900/[0.02] border-zinc-900/[0.08]'
              }`}
            >
              <div>
                <div className="text-[12px] font-semibold">Facetado Origami Real</div>
                <div className={`text-[10.5px] ${mutedText}`}>
                  Planos triangulares exactos (2× facetas · aristas 100% rectas)
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.origami.realFaceted !== false}
                onChange={(e) => updateOrigami({ realFaceted: e.target.checked }, false)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </label>
            {isExpert && (
              <>
                <StudioSlider
                  label="Torsión helicoidal"
                  value={config.origami.twistDeg}
                  defaultValue={defaultForFamily.origami.twistDeg}
                  min={0}
                  max={180}
                  step={5}
                  unit="°"
                  dark={isNight}
                  onChange={(twistDeg) => updateOrigami({ twistDeg }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Suavizado de aristas FDM"
                  value={config.origami.edgeSoftness}
                  defaultValue={defaultForFamily.origami.edgeSoftness}
                  min={0}
                  max={1}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  minLabel="Afilado"
                  maxLabel="Suave"
                  dark={isNight}
                  onChange={(edgeSoftness) => updateOrigami({ edgeSoftness }, true)}
                  onCommit={onCommitGeometry}
                />
              </>
            )}
          </>
        )}

        {tab === 'pattern' && config.family === 'woven' && (
          <>
            <div className="space-y-1.5">
              <div
                className={`text-[12.5px] font-medium tracking-[-0.01em] ${
                  isNight ? 'text-zinc-200' : 'text-zinc-700'
                }`}
              >
                Submodo de tejido / celda 3D
              </div>
              <SegmentedControl
                value={config.woven.pattern}
                dark={isNight}
                options={[
                  { value: 'basket_1x1', label: 'Mimbre' },
                  { value: 'knitted', label: 'Punto (Knitted)' },
                ]}
                onChange={(pattern) =>
                  updateWoven(
                    {
                      pattern,
                      horizFreq: Math.min(64, Math.max(18, config.woven.horizFreq)),
                      vertFreq: Math.min(88, Math.max(32, config.woven.vertFreq)),
                    },
                    false
                  )
                }
              />
              <SegmentedControl
                value={config.woven.pattern}
                dark={isNight}
                options={[
                  { value: 'ripple_mesh', label: 'RippleMesh' },
                  { value: 'grid_mesh', label: 'Rejilla (Grid)' },
                ]}
                onChange={(pattern) =>
                  updateWoven(
                    {
                      pattern,
                      horizFreq: Math.min(44, Math.max(16, Math.min(34, config.woven.horizFreq))),
                      vertFreq: Math.min(32, Math.max(12, Math.min(24, config.woven.vertFreq))),
                      rippleDepth: config.woven.rippleDepth ?? 5.5,
                    },
                    false
                  )
                }
              />
            </div>

            {config.woven.pattern === 'ripple_mesh' || config.woven.pattern === 'grid_mesh' ? (
              <>
                <StudioSlider
                  label={
                    config.woven.pattern === 'ripple_mesh'
                      ? 'Ondas radiales (celdas)'
                      : 'Columnas de rejilla'
                  }
                  value={Math.min(44, Math.max(16, config.woven.horizFreq))}
                  defaultValue={20}
                  min={16}
                  max={44}
                  step={2}
                  dark={isNight}
                  onChange={(horizFreq) => updateWoven({ horizFreq }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Filas verticales de celdas"
                  value={Math.min(32, Math.max(12, config.woven.vertFreq))}
                  defaultValue={16}
                  min={12}
                  max={32}
                  step={2}
                  dark={isNight}
                  onChange={(vertFreq) => updateWoven({ vertFreq }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Profundidad esculpida (arcos ≤ 45°)"
                  value={config.woven.rippleDepth ?? 4.8}
                  defaultValue={4.8}
                  min={3.5}
                  max={6.5}
                  step={0.2}
                  formatValue={(v) => `0.65 → ${(0.65 + v).toFixed(1)} mm`}
                  dark={isNight}
                  onChange={(rippleDepth) => updateWoven({ rippleDepth }, true)}
                  onCommit={onCommitGeometry}
                />
              </>
            ) : (
              <>
                <StudioSlider
                  label={
                    config.woven.pattern === 'knitted'
                      ? 'Columnas de punto (V)'
                      : 'Tiras por vuelta (horizontal)'
                  }
                  value={config.woven.horizFreq}
                  defaultValue={defaultForFamily.woven.horizFreq}
                  min={16}
                  max={64}
                  step={2}
                  dark={isNight}
                  onChange={(horizFreq) => updateWoven({ horizFreq }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Grosor valles → crestas"
                  value={config.woven.relief}
                  defaultValue={defaultForFamily.woven.relief}
                  min={0.6}
                  max={2.6}
                  step={0.1}
                  formatValue={(v) => `0.8 → ${(0.8 + v).toFixed(1)} mm`}
                  dark={isNight}
                  onChange={(relief) => updateWoven({ relief }, true)}
                  onCommit={onCommitGeometry}
                />
                {isExpert && (
                  <StudioSlider
                    label="Filas alternadas (vertical)"
                    value={config.woven.vertFreq}
                    defaultValue={defaultForFamily.woven.vertFreq}
                    min={24}
                    max={88}
                    step={2}
                    dark={isNight}
                    onChange={(vertFreq) => updateWoven({ vertFreq }, true)}
                    onCommit={onCommitGeometry}
                  />
                )}
              </>
            )}

            {isExpert && (
              <StudioSlider
                label="Suavizado de curvas FDM"
                value={config.woven.fdmSmoothing}
                defaultValue={defaultForFamily.woven.fdmSmoothing}
                min={0}
                max={1}
                step={0.05}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                dark={isNight}
                onChange={(fdmSmoothing) => updateWoven({ fdmSmoothing }, true)}
                onCommit={onCommitGeometry}
              />
            )}
          </>
        )}

        {tab === 'pattern' && config.family === 'organic' && (
          <>
            <div className="space-y-1.5">
              <div
                className={`text-[12.5px] font-medium tracking-[-0.01em] ${
                  isNight ? 'text-zinc-200' : 'text-zinc-700'
                }`}
              >
                Patrón orgánico (Núcleo 1.2 mm + Aletas)
              </div>
              <SegmentedControl
                value={config.organic.mode}
                dark={isNight}
                options={[
                  { value: 'flames', label: 'Flamas / Ondas' },
                  { value: 'gravity', label: 'Gravedad' },
                ]}
                onChange={(mode) => {
                  if (mode === 'gravity') {
                    const depth = clampNum(config.organic.finDepth ?? 20, 16, 24);
                    const thick = clampNum(config.organic.finThickness ?? 1.4, 1.2, 1.6);
                    const rawCenters = config.organic.voronoiCells ?? 16;
                    const centers = clampNum(rawCenters < 10 ? 16 : rawCenters, 10, 22);
                    updateOrganic(
                      { mode, finDepth: depth, depth, finThickness: thick, voronoiCells: centers },
                      false
                    );
                  } else {
                    const depth = clampNum(config.organic.finDepth ?? 14, 8, 22);
                    const thick = clampNum(config.organic.finThickness ?? 1.5, 1.2, 2.2);
                    updateOrganic({ mode, finDepth: depth, depth, finThickness: thick }, false);
                  }
                }}
              />
              <SegmentedControl
                value={config.organic.mode}
                dark={isNight}
                options={[
                  { value: 'growth', label: 'Crecimiento' },
                  { value: 'wind', label: 'Viento' },
                ]}
                onChange={(mode) => {
                  if (mode === 'wind') {
                    const depth = clampNum(config.organic.finDepth ?? 9, 6, 12);
                    const thick = clampNum(config.organic.finThickness ?? 1.2, 1.0, 1.4);
                    updateOrganic({ mode, finDepth: depth, depth, finThickness: thick }, false);
                  } else {
                    const depth = clampNum(config.organic.finDepth ?? 22, 18, 28);
                    const thick = clampNum(config.organic.finThickness ?? 1.4, 1.2, 2.0);
                    const fins = clampNum(config.organic.growthFinCount ?? 32, 24, 48);
                    updateOrganic(
                      { mode, finDepth: depth, depth, finThickness: thick, growthFinCount: fins },
                      false
                    );
                  }
                }}
              />
            </div>

            {config.organic.mode === 'flames' && (
              <>
                <StudioSlider
                  label="Número de aletas sinuosas"
                  value={config.organic.finCount ?? 24}
                  defaultValue={24}
                  min={16}
                  max={32}
                  step={2}
                  dark={isNight}
                  onChange={(finCount) => updateOrganic({ finCount }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Ondas verticales (pétalos)"
                  value={config.organic.flameWaves ?? 3}
                  defaultValue={3}
                  min={2}
                  max={6}
                  step={1}
                  dark={isNight}
                  onChange={(flameWaves) => updateOrganic({ flameWaves }, true)}
                  onCommit={onCommitGeometry}
                />
              </>
            )}

            {config.organic.mode === 'gravity' && (
              <>
                <StudioSlider
                  label="Densidad de cintas"
                  value={clampNum(
                    (config.organic.voronoiCells ?? 16) < 10
                      ? 16
                      : (config.organic.voronoiCells ?? 16),
                    10,
                    22
                  )}
                  defaultValue={16}
                  min={10}
                  max={22}
                  step={1}
                  formatValue={(v) => {
                    const pitch = 9.8 - ((v - 10) / 12) * 4.8;
                    return `${v} (~${pitch.toFixed(1)} mm)`;
                  }}
                  minLabel="Abiertas (~9.8 mm)"
                  maxLabel="Tupidas (~5.0 mm)"
                  dark={isNight}
                  onChange={(voronoiCells) => updateOrganic({ voronoiCells }, true)}
                  onCommit={onCommitGeometry}
                />
                <label
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                    config.organic.colorByStrand
                      ? isNight
                        ? 'bg-amber-500/12 border-amber-400/40'
                        : 'bg-amber-50/80 border-amber-300/80'
                      : isNight
                        ? 'bg-zinc-800/40 border-zinc-700/60'
                        : 'bg-zinc-900/[0.02] border-zinc-900/[0.08]'
                  }`}
                >
                  <div>
                    <div className="text-[12px] font-semibold">Colorear cada nivel</div>
                    <div className={`text-[10.5px] ${mutedText}`}>
                      Paleta OZEK por isocontorno en visor 3D
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(config.organic.colorByStrand)}
                    onChange={(e) =>
                      onChangeVisual((prev) => ({
                        ...prev,
                        organic: { ...prev.organic, colorByStrand: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>
                <StudioSlider
                  label="Suavidad"
                  value={config.organic.voronoiSoftness ?? 0.8}
                  defaultValue={0.8}
                  min={0}
                  max={1}
                  step={0.05}
                  formatValue={(v) => (v < 0.35 ? 'Rígida' : v < 0.72 ? 'Media' : 'Blanda')}
                  minLabel="Rígida"
                  maxLabel="Blanda"
                  dark={isNight}
                  onChange={(voronoiSoftness) => updateOrganic({ voronoiSoftness }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Gravedad"
                  value={config.organic.gravityAccel ?? -7.8}
                  defaultValue={-7.8}
                  min={-9.8}
                  max={9.8}
                  step={0.4}
                  formatValue={(v) => `${(v / 9.8) > 0 ? '+' : ''}${(v / 9.8).toFixed(2)} g`}
                  minLabel="Abajo (-1.0)"
                  maxLabel="Arriba (+1.0)"
                  dark={isNight}
                  onChange={(gravityAccel) => updateOrganic({ gravityAccel }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Dispersión"
                  value={config.organic.voronoiDispersion ?? 0.55}
                  defaultValue={0.55}
                  min={0}
                  max={1}
                  step={0.05}
                  formatValue={(v) => `${Math.round(v * 100)}%`}
                  minLabel="Agrupado"
                  maxLabel="Disperso"
                  dark={isNight}
                  onChange={(voronoiDispersion) => updateOrganic({ voronoiDispersion }, true)}
                  onCommit={onCommitGeometry}
                />
                {isExpert && (
                  <>
                    <StudioSlider
                      label="Elevación anti-voladizo (Lift)"
                      value={config.organic.finLift ?? 0.25}
                      defaultValue={0.25}
                      min={0}
                      max={1}
                      step={0.05}
                      formatValue={(v) => `${Math.round(v * 100)}%`}
                      minLabel="Perpendicular"
                      maxLabel="Elevadas"
                      dark={isNight}
                      onChange={(finLift) => updateOrganic({ finLift }, true)}
                      onCommit={onCommitGeometry}
                    />
                    <StudioSlider
                      label="Giro espiral"
                      value={config.organic.gravityTwistDeg ?? 0}
                      defaultValue={0}
                      min={0}
                      max={180}
                      step={10}
                      unit="°"
                      dark={isNight}
                      onChange={(gravityTwistDeg) => updateOrganic({ gravityTwistDeg }, true)}
                      onCommit={onCommitGeometry}
                    />
                  </>
                )}
              </>
            )}

            {config.organic.mode === 'growth' && (
              <>
                <StudioSlider
                  label="Crecimiento (Volantes)"
                  value={Math.round(clampNum((config.organic.growthAmp ?? 0.72) * 100, 0, 100))}
                  defaultValue={72}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  minLabel="Rectas"
                  maxLabel="Olanes extremos"
                  dark={isNight}
                  onChange={(pct) => updateOrganic({ growthAmp: pct / 100 }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Densidad de aletas"
                  value={clampNum(config.organic.growthFinCount ?? 32, 24, 48)}
                  defaultValue={32}
                  min={24}
                  max={48}
                  step={2}
                  minLabel="24 (abiertas)"
                  maxLabel="48 (muy tupidas)"
                  dark={isNight}
                  onChange={(growthFinCount) => updateOrganic({ growthFinCount }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Frecuencia de volantes"
                  value={clampNum(config.organic.growthFreq ?? 2.2, 1.0, 4.0)}
                  defaultValue={2.2}
                  min={1.0}
                  max={4.0}
                  step={0.2}
                  formatValue={(v) => (v < 1.8 ? 'Amplios' : v < 3.0 ? 'Medios' : 'Finos')}
                  minLabel="Amplios"
                  maxLabel="Finos"
                  dark={isNight}
                  onChange={(growthFreq) => updateOrganic({ growthFreq }, true)}
                  onCommit={onCommitGeometry}
                />
              </>
            )}

            {config.organic.mode === 'wind' && (
              <>
                <SegmentedControl
                  label="Tipo de viento (Campo 3D)"
                  value={config.organic.windType ?? 'vortex'}
                  dark={isNight}
                  options={[
                    { value: 'breeze', label: 'Brisa' },
                    { value: 'gusts', label: 'Ráfagas' },
                    { value: 'vortex', label: 'Remolino' },
                  ]}
                  onChange={(windType) => updateOrganic({ windType }, false)}
                />
                <StudioSlider
                  label="Dirección"
                  value={clampNum(config.organic.windDirectionDeg ?? 45, 0, 360)}
                  defaultValue={45}
                  min={0}
                  max={360}
                  step={5}
                  unit="°"
                  minLabel="0°"
                  maxLabel="360°"
                  dark={isNight}
                  onChange={(windDirectionDeg) => updateOrganic({ windDirectionDeg }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Intensidad"
                  value={clampNum(config.organic.windIntensity ?? 110, 0, 200)}
                  defaultValue={110}
                  min={0}
                  max={200}
                  step={5}
                  unit="%"
                  minLabel="0% (calma)"
                  maxLabel="200% (fuerte)"
                  dark={isNight}
                  onChange={(windIntensity) => updateOrganic({ windIntensity }, true)}
                  onCommit={onCommitGeometry}
                />
                <StudioSlider
                  label="Densidad de aletas finas"
                  value={clampNum(config.organic.windFinCount ?? 60, 45, 75)}
                  defaultValue={60}
                  min={45}
                  max={75}
                  step={1}
                  minLabel="45"
                  maxLabel="75"
                  dark={isNight}
                  onChange={(windFinCount) => updateOrganic({ windFinCount }, true)}
                  onCommit={onCommitGeometry}
                />
              </>
            )}

            <StudioSlider
              label={
                config.organic.mode === 'gravity'
                  ? 'Profundidad de cinta'
                  : config.organic.mode === 'wind'
                    ? 'Profundidad de aleta fina'
                    : 'Profundidad de aleta'
              }
              value={clampNum(
                config.organic.finDepth ?? config.organic.depth,
                config.organic.mode === 'gravity'
                  ? 16
                  : config.organic.mode === 'growth'
                    ? 18
                    : config.organic.mode === 'wind'
                      ? 6
                      : 8,
                config.organic.mode === 'wind'
                  ? 12
                  : config.organic.mode === 'growth'
                    ? 28
                    : config.organic.mode === 'gravity'
                      ? 24
                      : 22
              )}
              defaultValue={
                config.organic.mode === 'gravity'
                  ? 20.0
                  : config.organic.mode === 'growth'
                    ? 22.0
                    : config.organic.mode === 'wind'
                      ? 9.0
                      : 14.0
              }
              min={
                config.organic.mode === 'gravity'
                  ? 16.0
                  : config.organic.mode === 'growth'
                    ? 18.0
                    : config.organic.mode === 'wind'
                      ? 6.0
                      : 8.0
              }
              max={
                config.organic.mode === 'wind'
                  ? 12.0
                  : config.organic.mode === 'growth'
                    ? 28.0
                    : config.organic.mode === 'gravity'
                      ? 24.0
                      : 22.0
              }
              step={1.0}
              unit="mm"
              dark={isNight}
              onChange={(finDepth) => updateOrganic({ finDepth, depth: finDepth }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label={
                config.organic.mode === 'gravity'
                  ? 'Grosor de cinta'
                  : config.organic.mode === 'wind'
                    ? 'Grosor de aleta fina'
                    : 'Grosor de aletas'
              }
              value={clampNum(
                config.organic.finThickness ?? (config.organic.mode === 'wind' ? 1.2 : 1.4),
                config.organic.mode === 'wind' ? 1.0 : 1.2,
                config.organic.mode === 'wind'
                  ? 1.4
                  : config.organic.mode === 'gravity'
                    ? 1.6
                    : config.organic.mode === 'growth'
                      ? 2.0
                      : 2.2
              )}
              defaultValue={config.organic.mode === 'wind' ? 1.2 : 1.4}
              min={config.organic.mode === 'wind' ? 1.0 : 1.2}
              max={
                config.organic.mode === 'wind'
                  ? 1.4
                  : config.organic.mode === 'gravity'
                    ? 1.6
                    : config.organic.mode === 'growth'
                      ? 2.0
                      : 2.2
              }
              step={0.1}
              unit="mm"
              dark={isNight}
              onChange={(finThickness) => updateOrganic({ finThickness }, true)}
              onCommit={onCommitGeometry}
            />

            {config.organic.mode === 'gravity' && (
              <div className="flex items-center justify-between pt-1">
                <span className={`text-[12px] ${mutedText}`}>
                  Semilla: <strong className="font-mono-num">#{config.organic.seed}</strong>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateOrganic({ seed: Math.floor(100 + Math.random() * 9800) }, false)
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium border transition-colors ${
                    isNight
                      ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                      : 'border-zinc-200 hover:bg-zinc-100 text-zinc-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Nueva semilla
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'base' && (
          <>
            {isTwoPart && (
              <>
                <div className="space-y-1.5">
                  <div
                    className={`text-[12.5px] font-medium tracking-[-0.01em] ${
                      isNight ? 'text-zinc-200' : 'text-zinc-700'
                    }`}
                  >
                    Forma de la base
                  </div>
                  <SegmentedControl
                    value={config.base.style}
                    dark={isNight}
                    options={[
                      { value: 'dome', label: 'Cúpula' },
                      { value: 'pedestal', label: 'Cónica' },
                      { value: 'cylinder', label: 'Cilíndrica' },
                    ]}
                    onChange={(style) => {
                      const defaultH =
                        style === 'dome' ? 66 : style === 'pedestal' ? 80 : 72;
                      updateBase({ style, height: defaultH }, false);
                    }}
                  />
                  <SegmentedControl
                    value={config.base.style}
                    dark={isNight}
                    options={[
                      { value: 'compact_flush', label: 'Compacta / Al ras (15 mm)' },
                      { value: 'conkel', label: 'Conkel' },
                      { value: 'tripod', label: 'Trípode' },
                    ]}
                    onChange={(style) => {
                      if (style === 'compact_flush') {
                        onChangeGeometry(
                          (prev) => ({
                            ...prev,
                            mount: { ...prev.mount, type: 'led_kit_001' },
                            base: {
                              ...prev.base,
                              style: 'compact_flush',
                              finish: 'smooth',
                              height: 15,
                              footRadius: 37.5,
                              coupling: 'bayonet',
                              bayonetLugs: 3,
                              couplingClearance: 0.35,
                              signatureGrooves: false,
                              collarRevealMm: 0,
                            },
                          }),
                          false
                        );
                        return;
                      }
                      const defaultH =
                        style === 'conkel'
                          ? config.mount.type === 'e26_e27'
                            ? 55
                            : 18
                          : 74;
                      updateBase({ style, height: defaultH }, false);
                    }}
                  />
                </div>

                {config.base.style === 'compact_flush' && (
                  <div
                    className={`px-3 py-2.5 rounded-xl border text-[11px] space-y-1 ${
                      isNight
                        ? 'bg-emerald-500/10 border-emerald-400/35 text-emerald-100'
                        : 'bg-emerald-50/80 border-emerald-300/80 text-emerald-950'
                    }`}
                  >
                    <div className="font-semibold">
                      Carcasa Empotrada Al Ras · Ø 75.0 × 15.0 mm
                    </div>
                    <div className="opacity-80 leading-snug">
                      Copa LED Kit 001 (Ø {(59.5 + config.mount.ledTolerance).toFixed(1)} × 8.5 mm) ·
                      Bayoneta de 3 pestañas (Ø 73.5 → Ø {(73.5 + 2 * config.base.couplingClearance).toFixed(1)} mm) ·
                      La pantalla descansa al ras en Z = 0 con paso trasero de cable a 45°.
                    </div>
                  </div>
                )}

                {/* Rear Hanko Author Seal "Z☰" toggle — available across ALL base styles! */}
                <label
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                    config.base.authorSeal !== false
                      ? isNight
                        ? 'bg-amber-500/12 border-amber-400/40'
                        : 'bg-amber-50/80 border-amber-300/80'
                      : isNight
                        ? 'bg-zinc-800/40 border-zinc-700/60'
                        : 'bg-zinc-900/[0.02] border-zinc-900/[0.08]'
                  }`}
                >
                  <div>
                    <div className="text-[12px] font-semibold">
                      Sello de autor OZ☰K (Trasero)
                    </div>
                    <div className={`text-[10.5px] ${mutedText}`}>
                      Hanko Z☰ en bajorrelieve (0.6 mm · 0% soportes)
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.base.authorSeal !== false}
                    onChange={(e) => updateBase({ authorSeal: e.target.checked }, false)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </label>

                {(config.base.style === 'conkel' || config.base.style === 'cylinder') && (
                  <div className="space-y-2">
                    <StudioSlider
                      label="Altura de base"
                      value={config.base.height}
                      defaultValue={config.base.style === 'conkel' ? 18 : 28}
                      min={config.base.style === 'conkel' ? 16 : 18}
                      max={110}
                      step={2}
                      unit="mm"
                      dark={isNight}
                      onChange={(height) => updateBase({ height }, true)}
                      onCommit={onCommitGeometry}
                    />
                    {config.base.style === 'cylinder' && (
                      <div className="grid grid-cols-3 gap-1">
                        {[
                          { label: 'Baja (18 mm)', h: 18 },
                          { label: 'Media (38 mm)', h: 38 },
                          { label: 'Alta (55 mm)', h: 55 },
                        ].map((opt) => (
                          <button
                            key={opt.h}
                            type="button"
                            onClick={() => updateBase({ height: opt.h }, false)}
                            className={`py-1 px-1.5 rounded-lg text-[10.5px] font-medium border transition-colors ${
                              Math.abs(config.base.height - opt.h) <= 2
                                ? isNight
                                  ? 'bg-amber-400 text-zinc-950 border-amber-400'
                                  : 'bg-zinc-900 text-white border-zinc-900'
                                : isNight
                                  ? 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                  : 'border-zinc-900/10 text-zinc-600 hover:bg-zinc-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {config.base.style === 'dome' && (
                  config.mount.type === 'e26_e27' ? (
                    <div className="space-y-2">
                      <label
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                          isThreePart
                            ? isNight
                              ? 'bg-emerald-500/15 border-emerald-400/45'
                              : 'bg-emerald-50/90 border-emerald-300/90'
                            : isNight
                              ? 'bg-zinc-800/40 border-zinc-700/60'
                              : 'bg-zinc-900/[0.02] border-zinc-900/[0.08]'
                        }`}
                      >
                        <div>
                          <div className="text-[12px] font-semibold">
                            3 Piezas (Palito fino + Copa interna)
                          </div>
                          <div className={`text-[10.5px] ${mutedText}`}>
                            Palito Ø 15.5 mm · Copa E26 oculta adentro de la pantalla
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isThreePart}
                          onChange={(e) => {
                            const enable = e.target.checked;
                            onChangeGeometry(
                              (prev) => ({
                                ...prev,
                                silhouette: {
                                  ...prev.silhouette,
                                  buildMode: enable ? 'three_part' : 'two_part',
                                },
                                mount: enable
                                  ? { ...prev.mount, position: 'bottom', type: 'e26_e27' }
                                  : prev.mount,
                                base: {
                                  ...prev.base,
                                  coupling: enable ? 'slender_e26' : prev.base.coupling,
                                  spiderBayonet: enable ? false : prev.base.spiderBayonet,
                                  domeStemHeightMm: enable
                                    ? clampNum(prev.base.domeStemHeightMm ?? 24, 12, 40)
                                    : prev.base.domeStemHeightMm,
                                },
                              }),
                              false
                            );
                          }}
                          className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                        />
                      </label>
                      <StudioSlider
                        label="Largo del palito"
                        value={clampNum(
                          config.base.domeStemHeightMm ?? (isThreePart ? 24 : 0),
                          isThreePart ? 12 : 0,
                          40
                        )}
                        defaultValue={24}
                        min={isThreePart ? 12 : 0}
                        max={40}
                        step={1}
                        unit="mm"
                        minLabel={isThreePart ? '12 mm' : 'Sin cuello'}
                        maxLabel="40 mm"
                        dark={isNight}
                        onChange={(domeStemHeightMm) =>
                          updateBase(
                            {
                              domeStemHeightMm,
                              ...(domeStemHeightMm > 0
                                ? { coupling: 'slender_e26', spiderBayonet: false }
                                : {}),
                            },
                            true
                          )
                        }
                        onCommit={onCommitGeometry}
                      />
                    </div>
                  ) : (
                    <div className={`text-[10.5px] px-2.5 py-1.5 rounded-lg border ${divider} ${mutedText}`}>
                      Modo 3 Piezas y palito fino disponibles al seleccionar Socket E26/E27 (desactivado con LED Kit 001 Ø 59.7 mm).
                    </div>
                  )
                )}

                {config.base.style !== 'tripod' && config.base.style !== 'compact_flush' && (
                  <>
                    <SegmentedControl
                      label="Acabado de la base"
                      value={config.base.finish}
                      dark={isNight}
                      options={[
                        { value: 'smooth', label: 'Lisa' },
                        { value: 'ribbed', label: 'Acanalada fina' },
                      ]}
                      onChange={(finish) => updateBase({ finish }, false)}
                    />
                    {config.base.finish === 'ribbed' && isExpert && (
                      <StudioSlider
                        label="Costillas finas en base"
                        value={config.base.ribCount}
                        defaultValue={64}
                        min={40}
                        max={100}
                        step={2}
                        dark={isNight}
                        onChange={(ribCount) => updateBase({ ribCount }, true)}
                        onCommit={onCommitGeometry}
                      />
                    )}
                    <label
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                        config.base.signatureGrooves
                          ? isNight
                            ? 'bg-amber-500/12 border-amber-400/40'
                            : 'bg-amber-50/80 border-amber-300/80'
                          : isNight
                            ? 'bg-zinc-800/40 border-zinc-700/60'
                            : 'bg-zinc-900/[0.02] border-zinc-900/[0.08]'
                      }`}
                    >
                      <div>
                        <div className="text-[12px] font-semibold">
                          Detalle firma OZ☰K (☰)
                        </div>
                        <div className={`text-[10.5px] ${mutedText}`}>
                          3 surcos horizontales de 0.8 mm espaciados 2.5 mm
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(config.base.signatureGrooves)}
                        onChange={(e) =>
                          updateBase({ signatureGrooves: e.target.checked }, false)
                        }
                        className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                      />
                    </label>
                  </>
                )}

                {config.base.style !== 'compact_flush' && (
                  <div className={`pt-2 border-t ${divider} space-y-2`}>
                  <div
                    className={`text-[12.5px] font-medium tracking-[-0.01em] ${
                      isNight ? 'text-zinc-200' : 'text-zinc-700'
                    }`}
                  >
                    Tipo de encaje Base–Pantalla
                  </div>
                  <SegmentedControl
                    value={config.base.coupling}
                    dark={isNight}
                    options={[
                      { value: 'gravity_seat', label: 'Asiento directo' },
                      {
                        value: 'spider',
                        label: config.silhouette.skirtWaveAmp > 0.15 ? 'Araña 45°' : 'Araña Z=0',
                      },
                      { value: 'slender_e26', label: 'Cuello E26' },
                    ]}
                    onChange={(coupling) => {
                      if (coupling === 'slender_e26') {
                        onChangeGeometry(
                          (prev) => ({
                            ...prev,
                            mount: { ...prev.mount, type: 'e26_e27' },
                            base: {
                              ...prev.base,
                              coupling: 'slender_e26',
                              spiderBayonet: false,
                              domeStemHeightMm:
                                prev.base.style === 'dome'
                                  ? Math.max(12, prev.base.domeStemHeightMm ?? 16)
                                  : prev.base.domeStemHeightMm,
                            },
                          }),
                          false
                        );
                        return;
                      }
                      updateBase(
                        {
                          coupling,
                          couplingClearance: coupling === 'gravity_seat' ? 0.4 : 0.35,
                          ...(config.base.style === 'dome' ? { domeStemHeightMm: 0 } : {}),
                        },
                        false
                      );
                    }}
                  />
                  <SegmentedControl
                    value={config.base.coupling}
                    dark={isNight}
                    options={[
                      { value: 'thread', label: 'Rosca 3D' },
                      { value: 'bayonet', label: 'Bayoneta ¼' },
                      { value: 'friction', label: 'Presión' },
                    ]}
                    onChange={(coupling) =>
                      updateBase(
                        {
                          coupling,
                          ...(config.base.style === 'dome' ? { domeStemHeightMm: 0 } : {}),
                        },
                        false
                      )
                    }
                  />
                  {config.base.coupling === 'slender_e26' && (
                    <div
                      className={`px-3 py-2 rounded-xl border text-[11px] leading-snug ${
                        isNight
                          ? 'bg-emerald-500/10 border-emerald-400/35 text-emerald-100'
                          : 'bg-emerald-50/80 border-emerald-300/80 text-emerald-950'
                      }`}
                    >
                      <div className="font-semibold">Cuello Esbelto E26/E27 (Sin bayoneta)</div>
                      <div className="opacity-80 mt-0.5">
                        Tubo Ø 17 mm (conducto Ø 9 mm) → ensanche 45° a anillo E26 Ø 46 / Ø 40.5 mm.
                        Araña en Z=0 con aro Ø 40.8 mm fijado directo con la tuerca del socket.
                      </div>
                    </div>
                  )}
                  {(config.base.coupling === 'spider' || config.base.coupling === 'slender_e26') && (
                    <div className="space-y-2 pt-1">
                      {config.silhouette.skirtWaveAmp <= 0.15 && (
                        <>
                          <div
                            className={`text-[12px] font-medium ${
                              isNight ? 'text-zinc-300' : 'text-zinc-600'
                            }`}
                          >
                            Estilo de sujetador (Araña en Z=0)
                          </div>
                          <SegmentedControl
                            value={config.base.spiderStyle ?? 'radial'}
                            dark={isNight}
                            options={[
                              { value: 'radial', label: 'Radial Clásico' },
                              { value: 'organic_ovals', label: 'Ventanas Ovaladas' },
                            ]}
                            onChange={(spiderStyle) =>
                              updateBase(
                                {
                                  spiderStyle,
                                  spiderArmCount:
                                    spiderStyle === 'organic_ovals'
                                      ? Math.max(4, Math.min(6, config.base.spiderArmCount || 4))
                                      : config.base.spiderArmCount || 4,
                                },
                                false
                              )
                            }
                          />
                          <SegmentedControl
                            value={config.base.spiderStyle ?? 'radial'}
                            dark={isNight}
                            options={[
                              { value: 'x_corners', label: 'En X (Esquinas)' },
                              { value: 'spiral', label: 'Espiral / Pétalos' },
                            ]}
                            onChange={(spiderStyle) =>
                              updateBase(
                                {
                                  spiderStyle,
                                  spiderArmCount:
                                    spiderStyle === 'x_corners'
                                      ? 4
                                      : Math.max(4, Math.min(6, config.base.spiderArmCount || 5)),
                                },
                                false
                              )
                            }
                          />

                          {(config.base.spiderStyle ?? 'radial') === 'radial' && (
                            <SegmentedControl
                              label="Número de brazos"
                              value={String(
                                (config.base.spiderArmCount ?? 4) <= 3
                                  ? 3
                                  : (config.base.spiderArmCount ?? 4) >= 6
                                    ? 6
                                    : 4
                              )}
                              dark={isNight}
                              options={[
                                { value: '3', label: '3 brazos' },
                                { value: '4', label: '4 brazos' },
                                { value: '6', label: '6 brazos' },
                              ]}
                              onChange={(v) => updateBase({ spiderArmCount: Number(v) }, false)}
                            />
                          )}

                          {((config.base.spiderStyle ?? 'radial') === 'organic_ovals' ||
                            (config.base.spiderStyle ?? 'radial') === 'spiral') && (
                            <SegmentedControl
                              label={
                                config.base.spiderStyle === 'organic_ovals'
                                  ? 'Ventanas ovaladas'
                                  : 'Brazos en espiral'
                              }
                              value={String(
                                Math.max(4, Math.min(6, config.base.spiderArmCount || 4))
                              )}
                              dark={isNight}
                              options={[
                                { value: '4', label: '4' },
                                { value: '5', label: '5' },
                                { value: '6', label: '6' },
                              ]}
                              onChange={(v) => updateBase({ spiderArmCount: Number(v) }, false)}
                            />
                          )}
                        </>
                      )}

                      <label className="flex items-center justify-between cursor-pointer pt-0.5">
                        <span className="text-[12px] font-medium">
                          Muescas bayoneta con clic en araña
                        </span>
                        <input
                          type="checkbox"
                          checked={config.base.spiderBayonet}
                          onChange={(e) =>
                            updateBase({ spiderBayonet: e.target.checked }, false)
                          }
                          className="w-4 h-4 accent-zinc-900 rounded cursor-pointer"
                        />
                      </label>
                    </div>
                  )}
                </div>
                )}

                {isExpert && (
                  <div className={`pt-2 border-t ${divider} space-y-3`}>
                    {config.base.style !== 'compact_flush' && (
                      <>
                        {config.base.style !== 'conkel' && config.base.style !== 'cylinder' && (
                          <StudioSlider
                            label="Altura de base"
                            value={config.base.height}
                            defaultValue={defaultForFamily.base.height}
                            min={config.base.style === 'pedestal' ? 26 : 40}
                            max={110}
                            step={2}
                            unit="mm"
                            dark={isNight}
                            onChange={(height) => updateBase({ height }, true)}
                            onCommit={onCommitGeometry}
                          />
                        )}
                        <StudioSlider
                          label="Diámetro de base"
                          value={config.base.footRadius * 2}
                          defaultValue={defaultForFamily.base.footRadius * 2}
                          min={90}
                          max={160}
                          step={2}
                          unit="mm"
                          dark={isNight}
                          onChange={(dia) => updateBase({ footRadius: dia * 0.5 }, true)}
                          onCommit={onCommitGeometry}
                        />
                      </>
                    )}
                    {config.base.style === 'cylinder' && (
                      <StudioSlider
                        label="Cuello flotante visible"
                        value={config.base.collarRevealMm}
                        defaultValue={6}
                        min={0}
                        max={14}
                        step={1}
                        unit="mm"
                        dark={isNight}
                        onChange={(collarRevealMm) => updateBase({ collarRevealMm }, true)}
                        onCommit={onCommitGeometry}
                      />
                    )}
                    <StudioSlider
                      label="Holgura de encaje (clearance)"
                      value={config.base.couplingClearance}
                      defaultValue={config.base.coupling === 'gravity_seat' ? 0.4 : 0.35}
                      min={0.2}
                      max={0.55}
                      step={0.05}
                      unit="mm"
                      dark={isNight}
                      onChange={(couplingClearance) => updateBase({ couplingClearance }, true)}
                      onCommit={onCommitGeometry}
                    />
                    {config.base.coupling === 'thread' && (
                      <StudioSlider
                        label="Paso de rosca (Pitch)"
                        value={config.base.threadPitch}
                        defaultValue={4.0}
                        min={3.5}
                        max={5.0}
                        step={0.25}
                        unit="mm"
                        dark={isNight}
                        onChange={(threadPitch) => updateBase({ threadPitch }, true)}
                        onCommit={onCommitGeometry}
                      />
                    )}
                    {config.base.coupling !== 'spider' && (
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-[12px] font-medium">
                          Ventilación radial inferior en pantalla
                        </span>
                        <input
                          type="checkbox"
                          checked={config.base.shadeVentilation}
                          onChange={(e) =>
                            updateBase({ shadeVentilation: e.target.checked }, false)
                          }
                          className="w-4 h-4 accent-zinc-900 rounded cursor-pointer"
                        />
                      </label>
                    )}
                  </div>
                )}

                <div className={`border-t pt-3 ${divider}`} />
              </>
            )}

            <SegmentedControl
              label="Hardware eléctrico en base"
              value={config.mount.type}
              dark={isNight}
              options={[
                { value: 'e26_e27', label: 'Socket E26 / E27' },
                { value: 'led_kit_001', label: 'Bambu LED Kit 001' },
              ]}
              onChange={(type) => {
                onChangeGeometry(
                  (prev) => ({
                    ...prev,
                    mount: { ...prev.mount, type },
                    base:
                      prev.base.style === 'conkel'
                        ? { ...prev.base, height: type === 'e26_e27' ? 55 : 18 }
                        : prev.base,
                  }),
                  false
                );
              }}
            />

            <SegmentedControl
              label="Posición de montura"
              value={config.mount.position}
              dark={isNight}
              options={[
                { value: 'bottom', label: 'Mesa (Abajo)' },
                { value: 'top', label: 'Colgante (Arriba)' },
              ]}
              onChange={(position) => updateMount({ position }, false)}
            />

            {/* Universal E27 <-> Bambu LED Kit 001 Adapter STL Export */}
            <button
              type="button"
              disabled={isExporting}
              onClick={onExportAdapterSTL}
              className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-[11.5px] font-medium transition-colors ${
                isNight
                  ? 'border-amber-400/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200'
                  : 'border-amber-300/80 bg-amber-50/70 hover:bg-amber-100/80 text-amber-950'
              }`}
              title="Permite montar el Bambu LED Kit 001 (Ø59.7 mm) dentro de cualquier base E26/E27 (Ø40.5 mm) sin soportes"
            >
              <Plug className="w-3.5 h-3.5" />
              <span>Exportar Adaptador E27 ↔ LED 001 (.STL)</span>
            </button>

            {isExpert && (
              <div className={`pt-2 border-t ${divider} space-y-3`}>
                <StudioSlider
                  label="Grosor de pared sólido"
                  value={config.mount.wallThickness}
                  defaultValue={2.0}
                  min={1.6}
                  max={3.2}
                  step={0.2}
                  unit="mm"
                  dark={isNight}
                  onChange={(wallThickness) => updateMount({ wallThickness }, true)}
                  onCommit={onCommitGeometry}
                />

                {config.mount.type === 'led_kit_001' ? (
                  <StudioSlider
                    label={`Tolerancia LED 001 (Ø${(59.5 + config.mount.ledTolerance).toFixed(1)} mm)`}
                    value={config.mount.ledTolerance}
                    defaultValue={0.2}
                    min={-0.5}
                    max={0.5}
                    step={0.05}
                    formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} mm`}
                    dark={isNight}
                    onChange={(ledTolerance) => updateMount({ ledTolerance }, true)}
                    onCommit={onCommitGeometry}
                  />
                ) : (
                  <>
                    <StudioSlider
                      label="Orificio central E26/E27"
                      value={config.mount.e26Diameter}
                      defaultValue={40.5}
                      min={36}
                      max={44}
                      step={0.5}
                      unit="mm"
                      dark={isNight}
                      onChange={(e26Diameter) => updateMount({ e26Diameter }, true)}
                      onCommit={onCommitGeometry}
                    />
                    <StudioSlider
                      label="Espesor techo superior (bóveda 45°)"
                      value={config.mount.e26LipThickness}
                      defaultValue={3.5}
                      min={2.4}
                      max={4.5}
                      step={0.1}
                      unit="mm"
                      dark={isNight}
                      onChange={(e26LipThickness) => updateMount({ e26LipThickness }, true)}
                      onCommit={onCommitGeometry}
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'material' && (
          <>
            {renderMaterialSwatches(
              config.visual.material,
              (material) =>
                onChangeVisual((prev) => ({ ...prev, visual: { ...prev.visual, material } })),
              isTwoPart ? 'Color Pantalla' : 'Filamento visual'
            )}

            {isTwoPart && (
              <div className={`pt-2 border-t ${divider}`}>
                {renderMaterialSwatches(
                  config.visual.baseMaterial,
                  (baseMaterial) =>
                    onChangeVisual((prev) => ({
                      ...prev,
                      visual: { ...prev.visual, baseMaterial },
                    })),
                  'Color Base'
                )}
              </div>
            )}

            <div className={`pt-2 border-t ${divider} space-y-2.5`}>
              <div className="text-[12px] font-semibold">Coloración Bambu Lab AMS</div>
              <SegmentedControl
                value={config.visual.colorMode ?? 'solid'}
                dark={isNight}
                options={[
                  { value: 'solid', label: 'Un color' },
                  { value: 'stripes', label: 'Rayas Z' },
                  { value: 'edges', label: 'Bordes' },
                  { value: 'strands', label: 'Hilos' },
                ]}
                onChange={(colorMode) =>
                  onChangeVisual((prev) => ({
                    ...prev,
                    visual: { ...prev.visual, colorMode },
                  }))
                }
              />

              {(config.visual.colorMode ?? 'solid') !== 'solid' && (
                <div className="space-y-2.5">
                  <div
                    className={`text-[10.5px] px-2.5 py-1.5 rounded-xl border ${
                      config.visual.colorMode === 'stripes'
                        ? isNight
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : isNight
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {config.visual.colorMode === 'stripes'
                      ? 'AMS óptimo: solo cambios por altura Z (purga mínima). Las alturas exactas se incluyen en ajustes_bambu_studio.txt.'
                      : 'Vista multicolor AMS por capa: usa filamento bicolor o Color Painting en Bambu Studio.'}
                  </div>

                  {renderMaterialSwatches(
                    config.visual.accentMaterial ?? 'ozek_copper',
                    (accentMaterial) =>
                      onChangeVisual((prev) => ({
                        ...prev,
                        visual: { ...prev.visual, accentMaterial },
                      })),
                    'Color 2 (Acento / Crestas)'
                  )}

                  {(config.visual.colorMode === 'stripes' ||
                    config.visual.colorMode === 'strands') &&
                    renderMaterialSwatches(
                      config.visual.thirdMaterial ?? 'ozek_onyx',
                      (thirdMaterial) =>
                        onChangeVisual((prev) => ({
                          ...prev,
                          visual: { ...prev.visual, thirdMaterial },
                        })),
                      'Color 3 (Contraste)'
                    )}

                  {config.visual.colorMode === 'stripes' && (
                    <StudioSlider
                      label="Repeticiones de franjas"
                      value={config.visual.stripeRepeats ?? 2}
                      defaultValue={2}
                      min={1}
                      max={8}
                      step={1}
                      formatValue={(v) => `${v}×`}
                      dark={isNight}
                      onChange={(stripeRepeats) =>
                        onChangeVisual((prev) => ({
                          ...prev,
                          visual: { ...prev.visual, stripeRepeats },
                        }))
                      }
                    />
                  )}

                  {config.visual.colorMode === 'edges' && (
                    <StudioSlider
                      label="Profundidad de acento en crestas"
                      value={config.visual.edgeDepthMm ?? 2.0}
                      defaultValue={2.0}
                      min={1.0}
                      max={4.0}
                      step={0.1}
                      unit="mm"
                      dark={isNight}
                      onChange={(edgeDepthMm) =>
                        onChangeVisual((prev) => ({
                          ...prev,
                          visual: { ...prev.visual, edgeDepthMm },
                        }))
                      }
                    />
                  )}
                </div>
              )}
            </div>

            <div className={`pt-3 border-t ${divider} space-y-3`}>
              <StudioSlider
                label="Intensidad de luz interna"
                value={config.visual.lightIntensity}
                defaultValue={1.5}
                min={0.2}
                max={2.0}
                step={0.05}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                dark={isNight}
                onChange={(lightIntensity) =>
                  onChangeVisual((prev) => ({
                    ...prev,
                    visual: { ...prev.visual, lightIntensity, lightOn: true },
                  }))
                }
              />
              {isExpert && (
                <StudioSlider
                  label="Temperatura de luz"
                  value={config.visual.lightWarmth}
                  defaultValue={2600}
                  min={2200}
                  max={4000}
                  step={50}
                  unit="K"
                  dark={isNight}
                  onChange={(lightWarmth) =>
                    onChangeVisual((prev) => ({
                      ...prev,
                      visual: { ...prev.visual, lightWarmth },
                    }))
                  }
                />
              )}
            </div>

            <div className={`pt-3 border-t ${divider} space-y-3`}>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-[12.5px] font-medium">Ver voladizos en rojo</div>
                  <div className={`text-[10.5px] ${mutedText}`}>
                    Resalta caras sobre el ángulo límite ({config.visual.overhangAngle}°)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.visual.showOverhangs}
                  onChange={(e) =>
                    onChangeVisual((prev) => ({
                      ...prev,
                      visual: { ...prev.visual, showOverhangs: e.target.checked },
                    }))
                  }
                  className="w-4 h-4 accent-rose-600 rounded cursor-pointer"
                />
              </label>

              {isExpert && (
                <StudioSlider
                  label="Ángulo límite de voladizo"
                  value={config.visual.overhangAngle}
                  defaultValue={45}
                  min={20}
                  max={65}
                  step={1}
                  unit="°"
                  dark={isNight}
                  onChange={(overhangAngle) =>
                    onChangeVisual(
                      (prev) => ({ ...prev, visual: { ...prev.visual, overhangAngle } }),
                      true
                    )
                  }
                />
              )}
            </div>
          </>
        )}

        {tab === 'sculpt' && (
          <div className="space-y-3.5">
            <div
              className={`p-3 rounded-2xl border text-[11.5px] leading-relaxed ${
                sculptTool !== 'off'
                  ? isNight
                    ? 'bg-amber-500/12 border-amber-400/40 text-amber-100'
                    : 'bg-amber-50 border-amber-300/80 text-amber-950'
                  : isNight
                    ? 'bg-zinc-800/60 border-zinc-700/70 text-zinc-300'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-700'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                <Brush className="w-3.5 h-3.5" />
                <span>Pincel 3D Interactivo (Estudio)</span>
              </div>
              {sculptTool === 'off'
                ? 'Selecciona una herramienta para esculpir directamente sobre la pantalla 3D. Tus trazos persisten aunque cambies el patrón y mantienen la malla 100% watertight.'
                : 'Arrastra directamente sobre la pantalla 3D para esculpir. Arrastra fuera de la lámpara para rotar la cámara.'}
            </div>

            <div className="space-y-1.5">
              <div className="text-[12px] font-medium">Herramienta de pincel</div>
              <SegmentedControl
                value={sculptTool}
                dark={isNight}
                options={[
                  { value: 'off', label: 'Rotar (Off)' },
                  { value: 'push', label: 'Abultar' },
                  { value: 'carve', label: 'Hundir' },
                ]}
                onChange={onChangeSculptTool}
              />
              <SegmentedControl
                value={sculptTool}
                dark={isNight}
                options={[
                  { value: 'swirl', label: 'Remolino' },
                  { value: 'smooth', label: 'Suavizar' },
                ]}
                onChange={onChangeSculptTool}
              />
            </div>

            <StudioSlider
              label="Tamaño del pincel"
              value={sculptRadiusMm}
              defaultValue={28}
              min={12}
              max={55}
              step={2}
              unit="mm"
              dark={isNight}
              onChange={onChangeSculptRadius}
            />

            <StudioSlider
              label="Intensidad del trazo"
              value={sculptStrength}
              defaultValue={0.55}
              min={0.15}
              max={1.0}
              step={0.05}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              dark={isNight}
              onChange={onChangeSculptStrength}
            />

            <div className={`pt-2 border-t ${divider} flex items-center justify-between gap-2`}>
              <span className={`text-[11.5px] font-mono-num ${mutedText}`}>
                {config.sculptStrokes?.length ?? 0} trazos activos
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!config.sculptStrokes?.length}
                  onClick={onUndoSculpt}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-40 ${
                    isNight
                      ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                      : 'border-zinc-200 hover:bg-zinc-100 text-zinc-800'
                  }`}
                >
                  <Undo2 className="w-3 h-3" />
                  Deshacer
                </button>
                <button
                  type="button"
                  disabled={!config.sculptStrokes?.length}
                  onClick={onClearSculpt}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors disabled:opacity-40 ${
                    isNight
                      ? 'border-rose-500/40 hover:bg-rose-500/15 text-rose-300'
                      : 'border-rose-200 hover:bg-rose-50 text-rose-700'
                  }`}
                >
                  <Trash2 className="w-3 h-3" />
                  Borrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Footer: Galería + Paquete .ZIP + Exportar Base / Pantalla / Difusor */}
      <div className={`p-3 border-t space-y-2 ${divider}`}>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onOpenCollections}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl border text-[11.5px] font-medium transition-colors ${
              isNight
                ? 'border-zinc-700 bg-zinc-800/70 hover:bg-zinc-800 text-zinc-100'
                : 'border-zinc-900/10 bg-zinc-900/[0.03] hover:bg-zinc-900/[0.07] text-zinc-800'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Galería / Presets
          </button>

          <button
            type="button"
            onClick={onQuickSaveJSON}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl border text-[11.5px] font-medium transition-colors ${
              isNight
                ? 'border-zinc-700 bg-zinc-800/70 hover:bg-zinc-800 text-zinc-100'
                : 'border-zinc-900/10 bg-zinc-900/[0.03] hover:bg-zinc-900/[0.07] text-zinc-800'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Guardar JSON
          </button>
        </div>

        {/* Primary CTA: Complete ZIP package with STLs + dynamic Bambu Studio guide */}
        <button
          type="button"
          disabled={isExporting}
          onClick={onExportZipPackage}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[12.5px] font-semibold tracking-[-0.01em] transition-all active:scale-[0.99] disabled:opacity-60 ${
            isNight
              ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-lg shadow-amber-500/15'
              : 'bg-zinc-950 hover:bg-zinc-800 text-white shadow-lg shadow-zinc-900/15'
          }`}
          title="Descarga todos los STLs activos + ajustes_bambu_studio.txt con orientación y parámetros recomendados"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Package className="w-4 h-4" />
          )}
          <span>Descargar Paquete Completo (.ZIP)</span>
        </button>

        {isTwoPart ? (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => onExportPartSTL('base')}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11.5px] font-semibold transition-colors ${
                  isNight
                    ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                    : 'bg-zinc-900/[0.06] text-zinc-900 hover:bg-zinc-900/[0.11]'
                }`}
              >
                <Download className="w-3 h-3" />
                Exportar Base.stl
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => onExportPartSTL('shade')}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11.5px] font-semibold transition-colors ${
                  isNight
                    ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                    : 'bg-zinc-900/[0.06] text-zinc-900 hover:bg-zinc-900/[0.11]'
                }`}
              >
                <Download className="w-3 h-3" />
                Exportar Pantalla.stl
              </button>
            </div>
            <div
              className={`grid gap-1.5 ${
                isThreePart || config.silhouette.includeDiffuser ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {isThreePart && (
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => onExportPartSTL('cup')}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-colors ${
                    isNight
                      ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                      : 'bg-emerald-100/80 text-emerald-950 hover:bg-emerald-200/80'
                  }`}
                >
                  <Download className="w-3 h-3" />
                  Exportar Copa.stl
                </button>
              )}
              {config.silhouette.includeDiffuser && (
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => onExportPartSTL('diffuser')}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-medium transition-colors ${
                    isNight
                      ? 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                      : 'bg-amber-100/80 text-amber-950 hover:bg-amber-200/80'
                  }`}
                >
                  <Download className="w-3 h-3" />
                  Exportar Difusor.stl
                </button>
              )}
              <button
                type="button"
                disabled={isExporting}
                onClick={onExportTestBaseSTL}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-medium transition-colors ${
                  isThreePart && config.silhouette.includeDiffuser ? 'col-span-2 ' : ''
                }${
                  isNight
                    ? 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800'
                    : 'bg-zinc-900/[0.03] text-zinc-600 hover:bg-zinc-900/[0.07]'
                }`}
              >
                <Layers className="w-3 h-3" />
                Base de prueba (15 mm)
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isExporting}
              onClick={onExportFullSTL}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11.5px] font-semibold transition-colors ${
                isNight
                  ? 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                  : 'bg-zinc-900/[0.06] text-zinc-900 hover:bg-zinc-900/[0.11]'
              }`}
            >
              <Download className="w-3 h-3" />
              Exportar STL
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={onExportTestBaseSTL}
              className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-medium transition-colors ${
                isNight
                  ? 'bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-zinc-900/[0.03] text-zinc-600 hover:bg-zinc-900/[0.07]'
              }`}
            >
              <Layers className="w-3 h-3" />
              Base prueba 15 mm
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
