import React, { useState } from 'react';
import {
  Bookmark,
  Download,
  FolderOpen,
  Layers,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  LampConfig,
  LampFamilyId,
  MaterialPresetId,
} from '../types/lamp';
import { listLampFamilies } from '../geometry/registry';
import { MATERIAL_LIST } from '../viewer/materials';
import { FamilyThumbnail } from './FamilyThumbnail';
import { StudioSlider } from './controls/StudioSlider';
import { SegmentedControl } from './controls/SegmentedControl';

type PanelTab = 'shape' | 'pattern' | 'base' | 'material';

interface RightPanelProps {
  config: LampConfig;
  defaultForFamily: LampConfig;
  isExporting: boolean;
  isNight: boolean;
  onChangeGeometry: (updater: (prev: LampConfig) => LampConfig, draft: boolean) => void;
  onCommitGeometry: () => void;
  onChangeVisual: (updater: (prev: LampConfig) => LampConfig, recomputeOverhangs?: boolean) => void;
  onSelectFamily: (family: LampFamilyId) => void;
  onExportFullSTL: () => void;
  onExportPartSTL: (part: 'base' | 'shade') => void;
  onExportTestBaseSTL: () => void;
  onOpenCollections: () => void;
  onQuickSaveJSON: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  config,
  defaultForFamily,
  isExporting,
  isNight,
  onChangeGeometry,
  onCommitGeometry,
  onChangeVisual,
  onSelectFamily,
  onExportFullSTL,
  onExportPartSTL,
  onExportTestBaseSTL,
  onOpenCollections,
  onQuickSaveJSON,
}) => {
  const [tab, setTab] = useState<PanelTab>('shape');
  const families = listLampFamilies();
  const activeFamily = families.find((f) => f.id === config.family) ?? families[0];
  const isTwoPart =
    config.silhouette.buildMode === 'two_part' && config.mount.position === 'bottom';

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
    { id: 'shape', label: '1 Pantalla' },
    { id: 'pattern', label: '2 Patrón' },
    { id: 'base', label: '3 Base' },
    { id: 'material', label: '4 Color' },
  ];

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
      className={`fixed top-4 right-4 bottom-4 z-20 w-[356px] max-w-[calc(100vw-32px)] rounded-[24px] border backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden ${surfaceClass}`}
    >
      {/* Top 6-Family Thumbnail Strip (all existing + new Plisado Fino Japonés) */}
      <div className={`px-3 pt-3 pb-2.5 border-b ${divider}`}>
        <div className="grid grid-cols-6 gap-1">
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
                <span className="text-[9px] font-semibold tracking-[-0.02em] truncate w-full text-center">
                  {fam.shortName}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-center">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">
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
            <SegmentedControl
              label="Modo de construcción"
              value={config.silhouette.buildMode}
              dark={isNight}
              options={[
                { value: 'two_part', label: '2 Piezas (Base+Pant.)' },
                { value: 'monoblock', label: '1 Pieza' },
              ]}
              onChange={(buildMode) => updateSilhouette({ buildMode }, false)}
            />

            <SegmentedControl
              label="Silueta de pantalla"
              value={config.silhouette.type}
              dark={isNight}
              options={[
                { value: 'curve', label: 'Curva' },
                { value: 'stepped', label: 'Escala' },
                { value: 'conical', label: 'Cónica' },
                { value: 'wavy', label: 'Anillos' },
              ]}
              onChange={(type) => updateSilhouette({ type }, false)}
            />

            <StudioSlider
              label={isTwoPart ? 'Altura de pantalla' : 'Altura total'}
              value={config.silhouette.height}
              defaultValue={defaultForFamily.silhouette.height}
              min={90}
              max={240}
              step={2}
              unit="mm"
              minLabel="Compacta"
              maxLabel="Alta"
              dark={isNight}
              onChange={(height) => updateSilhouette({ height }, true)}
              onCommit={onCommitGeometry}
            />

            <StudioSlider
              label="Radio inferior pantalla"
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

            {(config.silhouette.type === 'curve' || config.silhouette.type === 'conical') && (
              <StudioSlider
                label="Curvatura / vientre"
                value={config.silhouette.curvature}
                defaultValue={defaultForFamily.silhouette.curvature}
                min={0.18}
                max={0.82}
                step={0.02}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                dark={isNight}
                onChange={(curvature) => updateSilhouette({ curvature }, true)}
                onCommit={onCommitGeometry}
              />
            )}

            {(config.silhouette.type === 'stepped' || config.silhouette.type === 'conical') && (
              <StudioSlider
                label="Altura del escalón"
                value={config.silhouette.stepHeightRatio}
                defaultValue={defaultForFamily.silhouette.stepHeightRatio}
                min={0.25}
                max={0.58}
                step={0.02}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                dark={isNight}
                onChange={(stepHeightRatio) => updateSilhouette({ stepHeightRatio }, true)}
                onCommit={onCommitGeometry}
              />
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

            {/* NEW: Onda en borde inferior (Falda) 0 - 15 mm, 3 - 8 ondas */}
            <div className={`pt-2 border-t ${divider} space-y-3`}>
              <StudioSlider
                label="Onda en borde inferior (Falda)"
                value={config.silhouette.skirtWaveAmp}
                defaultValue={defaultForFamily.silhouette.skirtWaveAmp}
                min={0}
                max={15}
                step={0.5}
                unit="mm"
                minLabel="Recto (0 mm)"
                maxLabel="Orgánico (15 mm)"
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
            </div>

            <StudioSlider
              label="Sección transversal"
              value={config.silhouette.superellipse}
              defaultValue={defaultForFamily.silhouette.superellipse}
              min={2.0}
              max={6.4}
              step={0.2}
              formatValue={(v) =>
                v <= 2.1 ? 'Circular' : v >= 5.0 ? 'Cuadrada' : `Super ${v.toFixed(1)}`
              }
              minLabel="Circular"
              maxLabel="Cuadrada suave"
              dark={isNight}
              onChange={(superellipse) => updateSilhouette({ superellipse }, true)}
              onCommit={onCommitGeometry}
            />
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
              minLabel="40"
              maxLabel="100"
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
              minLabel="1.5 mm"
              maxLabel="3.0 mm"
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
              minLabel="0.8 mm (muy luminosa)"
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
            <div className={`pt-2 border-t ${divider} space-y-3`}>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-[12.5px] font-medium">Doble perfil diamante (F017)</div>
                  <div className={`text-[10.5px] ${mutedText}`}>
                    Cruce óptico estilo vidrio ahumado facetado
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.helical.doubleProfile}
                  onChange={(e) => updateHelical({ doubleProfile: e.target.checked }, false)}
                  className="w-4 h-4 accent-zinc-900 rounded cursor-pointer"
                />
              </label>
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
            </div>
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
              minLabel="Gruesas"
              maxLabel="Finas"
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
              label="Esbeltez de lámina"
              value={config.louvers.bladeSharpness}
              defaultValue={defaultForFamily.louvers.bladeSharpness}
              min={0.35}
              max={0.92}
              step={0.02}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              minLabel="Suave"
              maxLabel="Afilada"
              dark={isNight}
              onChange={(bladeSharpness) => updateLouvers({ bladeSharpness }, true)}
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

        {tab === 'pattern' && config.family === 'woven' && (
          <>
            <SegmentedControl
              label="Tipo de tejido mimbre / canasta"
              value={config.woven.pattern}
              dark={isNight}
              options={[
                { value: 'basket_1x1', label: 'Mimbre 1×1' },
                { value: 'twill', label: 'Espiga' },
                { value: 'double_2x2', label: 'Doble 2×2' },
                { value: 'diamond', label: 'Diamante' },
              ]}
              onChange={(pattern) => updateWoven({ pattern }, false)}
            />
            <StudioSlider
              label="Tiras por vuelta (horizontal)"
              value={config.woven.horizFreq}
              defaultValue={defaultForFamily.woven.horizFreq}
              min={16}
              max={64}
              step={2}
              minLabel="Tiras largas"
              maxLabel="Tiras cortas"
              dark={isNight}
              onChange={(horizFreq) => updateWoven({ horizFreq }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Filas alternadas (vertical)"
              value={config.woven.vertFreq}
              defaultValue={defaultForFamily.woven.vertFreq}
              min={24}
              max={88}
              step={2}
              minLabel="Gruesas"
              maxLabel="Finas"
              dark={isNight}
              onChange={(vertFreq) => updateWoven({ vertFreq }, true)}
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
              minLabel="Sutil (1.4 mm)"
              maxLabel="Pronunciado (3.4 mm)"
              dark={isNight}
              onChange={(relief) => updateWoven({ relief }, true)}
              onCommit={onCommitGeometry}
            />
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
            <div
              className={`p-2.5 rounded-xl text-[11px] leading-snug ${
                isNight ? 'bg-zinc-800/60 text-zinc-300' : 'bg-zinc-900/[0.03] text-zinc-600'
              }`}
            >
              Pared interior <strong>100% lisa</strong> · Valles de{' '}
              <span className="font-mono-num font-semibold">0.8 mm</span> y crestas redondeadas de{' '}
              <span className="font-mono-num font-semibold">
                {(0.8 + config.woven.relief).toFixed(1)} mm
              </span>{' '}
              (320–440 segs radiales).
            </div>
          </>
        )}

        {tab === 'pattern' && config.family === 'organic' && (
          <>
            <SegmentedControl
              label="Estilo orgánico"
              value={config.organic.mode}
              dark={isNight}
              options={[
                { value: 'ribbons', label: 'Listones' },
                { value: 'topo', label: 'Topográfico' },
                { value: 'sculpt', label: 'Dunas' },
              ]}
              onChange={(mode) => updateOrganic({ mode }, false)}
            />
            <StudioSlider
              label="Escala de ruido 3D"
              value={config.organic.scale}
              defaultValue={defaultForFamily.organic.scale}
              min={1.0}
              max={4.0}
              step={0.1}
              dark={isNight}
              onChange={(scale) => updateOrganic({ scale }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Flujo / Distorsión"
              value={config.organic.warp}
              defaultValue={defaultForFamily.organic.warp}
              min={0.0}
              max={1.6}
              step={0.05}
              dark={isNight}
              onChange={(warp) => updateOrganic({ warp }, true)}
              onCommit={onCommitGeometry}
            />
            {config.organic.mode !== 'sculpt' && (
              <StudioSlider
                label="Capas / Listones"
                value={config.organic.bands}
                defaultValue={defaultForFamily.organic.bands}
                min={2}
                max={10}
                step={0.5}
                dark={isNight}
                onChange={(bands) => updateOrganic({ bands }, true)}
                onCommit={onCommitGeometry}
              />
            )}
            <StudioSlider
              label="Profundidad de onda"
              value={config.organic.depth}
              defaultValue={defaultForFamily.organic.depth}
              min={2.0}
              max={14.0}
              step={0.5}
              unit="mm"
              dark={isNight}
              onChange={(depth) => updateOrganic({ depth }, true)}
              onCommit={onCommitGeometry}
            />
            <StudioSlider
              label="Suavizado anti-voladizo"
              value={config.organic.overhangSmoothing}
              defaultValue={defaultForFamily.organic.overhangSmoothing}
              min={0}
              max={1}
              step={0.05}
              formatValue={(v) => `${Math.round(v * 100)}%`}
              dark={isNight}
              onChange={(overhangSmoothing) => updateOrganic({ overhangSmoothing }, true)}
              onCommit={onCommitGeometry}
            />
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
                      { value: 'conkel', label: 'Conkel (Flowalistik)' },
                      { value: 'tripod', label: 'Trípode (3 patas)' },
                    ]}
                    onChange={(style) => {
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

                {/* Base Surface Finish: Lisa vs Acanalada fina (40 - 100 costillas) */}
                {config.base.style !== 'tripod' && (
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
                    {config.base.finish === 'ribbed' && (
                      <StudioSlider
                        label="Costillas finas en base"
                        value={config.base.ribCount}
                        defaultValue={64}
                        min={40}
                        max={100}
                        step={2}
                        minLabel="40"
                        maxLabel="100"
                        dark={isNight}
                        onChange={(ribCount) => updateBase({ ribCount }, true)}
                        onCommit={onCommitGeometry}
                      />
                    )}
                  </>
                )}

                <StudioSlider
                  label="Altura de base"
                  value={config.base.height}
                  defaultValue={defaultForFamily.base.height}
                  min={config.base.style === 'conkel' ? 16 : 40}
                  max={110}
                  step={2}
                  unit="mm"
                  minLabel="40 mm"
                  maxLabel="90+ mm"
                  dark={isNight}
                  onChange={(height) => updateBase({ height }, true)}
                  onCommit={onCommitGeometry}
                />

                <StudioSlider
                  label="Diámetro de base"
                  value={config.base.footRadius * 2}
                  defaultValue={defaultForFamily.base.footRadius * 2}
                  min={90}
                  max={160}
                  step={2}
                  unit="mm"
                  minLabel="Ø90 mm"
                  maxLabel="Ø160 mm"
                  dark={isNight}
                  onChange={(dia) => updateBase({ footRadius: dia * 0.5 }, true)}
                  onCommit={onCommitGeometry}
                />

                {config.base.style === 'cylinder' && (
                  <StudioSlider
                    label="Cuello flotante visible"
                    value={config.base.collarRevealMm}
                    defaultValue={8}
                    min={0}
                    max={14}
                    step={1}
                    unit="mm"
                    dark={isNight}
                    onChange={(collarRevealMm) => updateBase({ collarRevealMm }, true)}
                    onCommit={onCommitGeometry}
                  />
                )}

                {/* Coupling selector: Asiento directo / Araña flotante / Rosca 3D / Bayoneta */}
                <div className={`pt-2 border-t ${divider} space-y-2.5`}>
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
                      { value: 'spider', label: 'Araña flotante' },
                    ]}
                    onChange={(coupling) =>
                      updateBase(
                        {
                          coupling,
                          couplingClearance: coupling === 'gravity_seat' ? 0.4 : 0.35,
                        },
                        false
                      )
                    }
                  />
                  <SegmentedControl
                    value={config.base.coupling}
                    dark={isNight}
                    options={[
                      { value: 'thread', label: 'Rosca 3D' },
                      { value: 'bayonet', label: 'Bayoneta ¼' },
                      { value: 'friction', label: 'Presión' },
                    ]}
                    onChange={(coupling) => updateBase({ coupling }, false)}
                  />

                  {config.base.coupling === 'spider' && (
                    <label className="flex items-center justify-between cursor-pointer pt-0.5">
                      <div>
                        <div className="text-[12px] font-medium">
                          Muescas tipo bayoneta en araña
                        </div>
                        <div className={`text-[10.5px] ${mutedText}`}>
                          4 radios delgados (3 mm) con seguro de giro en cuello
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={config.base.spiderBayonet}
                        onChange={(e) =>
                          updateBase({ spiderBayonet: e.target.checked }, false)
                        }
                        className="w-4 h-4 accent-zinc-900 rounded cursor-pointer"
                      />
                    </label>
                  )}

                  <StudioSlider
                    label="Holgura de encaje (clearance)"
                    value={config.base.couplingClearance}
                    defaultValue={config.base.coupling === 'gravity_seat' ? 0.4 : 0.35}
                    min={0.2}
                    max={0.55}
                    step={0.05}
                    unit="mm"
                    minLabel="Ajustado"
                    maxLabel="Holgado"
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
                    <label className="flex items-center justify-between cursor-pointer pt-0.5">
                      <div>
                        <div className="text-[12px] font-medium">
                          Ventilación radial en pantalla
                        </div>
                        <div className={`text-[10.5px] ${mutedText}`}>
                          Ventanas inferiores alrededor del collarín
                        </div>
                      </div>
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
              label="Posición"
              value={config.mount.position}
              dark={isNight}
              options={[
                { value: 'bottom', label: 'Mesa (Abajo)' },
                { value: 'top', label: 'Colgante (Arriba)' },
              ]}
              onChange={(position) => updateMount({ position }, false)}
            />

            <StudioSlider
              label="Grosor de pared"
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
              <div
                className={`p-2.5 rounded-xl border space-y-2 ${
                  isNight
                    ? 'bg-zinc-800/50 border-zinc-700/60'
                    : 'bg-zinc-900/[0.03] border-zinc-900/[0.06]'
                }`}
              >
                <div className={`text-[10.5px] leading-relaxed ${mutedText}`}>
                  Cavidad{' '}
                  <span className="font-mono-num font-medium">
                    Ø{(59.5 + config.mount.ledTolerance).toFixed(2)} × 8.5 mm
                  </span>{' '}
                  conectada a ranura USB de{' '}
                  <span className="font-mono-num font-medium">6.5 × 5 mm</span>.
                </div>
                <StudioSlider
                  label="Tolerancia LED Kit 001"
                  value={config.mount.ledTolerance}
                  defaultValue={0}
                  min={-0.5}
                  max={0.5}
                  step={0.05}
                  formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} mm`}
                  dark={isNight}
                  onChange={(ledTolerance) => updateMount({ ledTolerance }, true)}
                  onCommit={onCommitGeometry}
                />
              </div>
            ) : (
              <div
                className={`p-2.5 rounded-xl border space-y-2.5 ${
                  isNight
                    ? 'bg-zinc-800/50 border-zinc-700/60'
                    : 'bg-zinc-900/[0.03] border-zinc-900/[0.06]'
                }`}
              >
                <div className={`text-[10.5px] leading-relaxed ${mutedText}`}>
                  Cavidad inferior amplia + techo de{' '}
                  <span className="font-mono-num font-medium">
                    {config.mount.e26LipThickness.toFixed(1)} mm
                  </span>{' '}
                  + ranura cable plano{' '}
                  <span className="font-mono-num font-medium">6.5 × 5 mm</span>.
                </div>
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
                  label="Espesor techo superior"
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
            </div>

            <div className={`pt-3 border-t ${divider} space-y-3`}>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-[12.5px] font-medium">Ver voladizos en rojo</div>
                  <div className={`text-[10.5px] ${mutedText}`}>
                    Resalta caras que superen el ángulo límite
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
            </div>
          </>
        )}
      </div>

      {/* Sticky Footer: Collections + Export Base.stl & Export Pantalla.stl */}
      <div className={`p-3.5 border-t space-y-2 ${divider}`}>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenCollections}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border text-[12px] font-medium transition-colors ${
              isNight
                ? 'border-zinc-700 bg-zinc-800/70 hover:bg-zinc-800 text-zinc-100'
                : 'border-zinc-900/10 bg-zinc-900/[0.03] hover:bg-zinc-900/[0.07] text-zinc-800'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Colecciones
          </button>

          <button
            type="button"
            onClick={onQuickSaveJSON}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl border text-[12px] font-medium transition-colors ${
              isNight
                ? 'border-zinc-700 bg-zinc-800/70 hover:bg-zinc-800 text-zinc-100'
                : 'border-zinc-900/10 bg-zinc-900/[0.03] hover:bg-zinc-900/[0.07] text-zinc-800'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Guardar JSON
          </button>
        </div>

        {isTwoPart ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => onExportPartSTL('base')}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-[12px] font-semibold tracking-[-0.01em] transition-all active:scale-[0.99] disabled:opacity-60 ${
                  isNight
                    ? 'bg-zinc-100 hover:bg-white text-zinc-950 shadow-md'
                    : 'bg-zinc-950 hover:bg-zinc-800 text-white shadow-md shadow-zinc-900/15'
                }`}
                title="Descargar malla sólida watertight de la Base (Z-up, mm)"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Exportar Base.stl</span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={() => onExportPartSTL('shade')}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-[12px] font-semibold tracking-[-0.01em] transition-all active:scale-[0.99] disabled:opacity-60 ${
                  isNight
                    ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-md shadow-amber-500/15'
                    : 'bg-zinc-950 hover:bg-zinc-800 text-white shadow-md shadow-zinc-900/15'
                }`}
                title="Descargar malla sólida watertight de la Pantalla (Z-up, mm)"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>Exportar Pantalla.stl</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={isExporting}
                onClick={onExportFullSTL}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-medium transition-colors ${
                  isNight
                    ? 'bg-zinc-800/70 text-zinc-200 hover:bg-zinc-800'
                    : 'bg-zinc-900/[0.04] text-zinc-700 hover:bg-zinc-900/[0.08]'
                }`}
              >
                Descargar ambos STL
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={onExportTestBaseSTL}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-medium transition-colors ${
                  isNight
                    ? 'bg-zinc-800/70 text-zinc-200 hover:bg-zinc-800'
                    : 'bg-zinc-900/[0.04] text-zinc-700 hover:bg-zinc-900/[0.08]'
                }`}
                title="Recorte de 15 mm de la base para prueba rápida de encaje"
              >
                Base de prueba (15 mm)
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isExporting}
              onClick={onExportFullSTL}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[13px] font-semibold tracking-[-0.01em] transition-all active:scale-[0.99] disabled:opacity-60 ${
                isNight
                  ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-lg shadow-amber-500/15'
                  : 'bg-zinc-950 hover:bg-zinc-800 text-white shadow-lg shadow-zinc-900/15'
              }`}
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>Exportar STL Completo</span>
            </button>
            <button
              type="button"
              disabled={isExporting}
              onClick={onExportTestBaseSTL}
              className={`w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-[11.5px] font-medium transition-colors ${
                isNight
                  ? 'text-zinc-300 hover:bg-zinc-800'
                  : 'text-zinc-600 hover:bg-zinc-900/[0.05] hover:text-zinc-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Exportar Solo Base de Prueba (15 mm)
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
