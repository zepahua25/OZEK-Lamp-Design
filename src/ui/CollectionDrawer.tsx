import React, { useRef, useState } from 'react';
import {
  CopyPlus,
  Download,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { LampConfig, LampPreset } from '../types/lamp';
import { CURATED_PRESETS } from '../data/presets';
import { FamilyThumbnail } from './FamilyThumbnail';

interface CollectionDrawerProps {
  open: boolean;
  isNight: boolean;
  currentConfig: LampConfig;
  userPresets: LampPreset[];
  onClose: () => void;
  onSelectPreset: (preset: LampPreset) => void;
  onSaveToCollection: (name: string, collectionName: string, variantLabel: string) => void;
  onDeletePreset: (id: string) => void;
  onDeriveVariant: (variant: 'table' | 'mini' | 'pendant') => void;
  onExportPresetJSON: (preset: LampPreset) => void;
  onExportCollectionJSON: (collectionName: string, items: LampPreset[]) => void;
  onImportJSONFile: (file: File) => void;
}

export const CollectionDrawer: React.FC<CollectionDrawerProps> = ({
  open,
  isNight,
  userPresets,
  onClose,
  onSelectPreset,
  onSaveToCollection,
  onDeletePreset,
  onDeriveVariant,
  onExportPresetJSON,
  onExportCollectionJSON,
  onImportJSONFile,
}) => {
  const [name, setName] = useState('');
  const [collectionName, setCollectionName] = useState('Colección OZEK 01');
  const [variantLabel, setVariantLabel] = useState('Mesa');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  // Group user presets by collectionName
  const grouped = new Map<string, LampPreset[]>();
  for (const p of userPresets) {
    const key = p.collectionName || 'Sin colección';
    const list = grouped.get(key) ?? [];
    list.push(p);
    grouped.set(key, list);
  }

  const panelBg = isNight
    ? 'bg-zinc-900 border-zinc-700 text-zinc-100'
    : 'bg-white border-zinc-200 text-zinc-900';

  const cardBg = isNight
    ? 'bg-zinc-800/70 border-zinc-700/70 hover:border-amber-400/60'
    : 'bg-zinc-50 border-zinc-200/80 hover:border-zinc-900/40';

  const muted = isNight ? 'text-zinc-400' : 'text-zinc-500';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveToCollection(name || 'Nueva Lámpara OZEK', collectionName, variantLabel);
    setName('');
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/35 backdrop-blur-[2px]">
      <div className="fixed inset-0" onClick={onClose} />
      <div
        className={`relative z-10 w-[440px] max-w-[95vw] h-[calc(100vh-32px)] mr-4 rounded-[24px] border shadow-2xl flex flex-col overflow-hidden ${panelBg}`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isNight ? 'border-zinc-800' : 'border-zinc-100'
          }`}
        >
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
              Colecciones y Presets OZEK
            </h2>
            <p className={`text-[11.5px] ${muted}`}>
              Diseña series coordinadas (Mesa, Mini, Colgante) y guarda tus JSON locales
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-full transition-colors ${
              isNight ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-5">
          {/* Quick Collection Variant Generator */}
          <div
            className={`p-3.5 rounded-2xl border space-y-2.5 ${
              isNight ? 'bg-zinc-800/50 border-zinc-700/60' : 'bg-amber-50/60 border-amber-200/70'
            }`}
          >
            <div className="flex items-center gap-1.5 text-[12px] font-semibold">
              <CopyPlus className="w-3.5 h-3.5 text-amber-600" />
              Derivar variante desde diseño actual
            </div>
            <p className={`text-[11px] leading-snug ${muted}`}>
              Conserva el patrón y material exacto, adaptando silueta y socket al instante:
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'table', label: 'Mesa (LED 001)' },
                  { id: 'mini', label: 'Mini (LED 001)' },
                  { id: 'pendant', label: 'Colgante (E26)' },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    onDeriveVariant(v.id);
                    onClose();
                  }}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-medium border transition-colors ${
                    isNight
                      ? 'bg-zinc-900 border-zinc-700 hover:border-amber-400 text-zinc-100'
                      : 'bg-white border-zinc-200 hover:border-zinc-900 text-zinc-800'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save Current Design into Local Collection */}
          <form
            onSubmit={handleSave}
            className={`p-3.5 rounded-2xl border space-y-2.5 ${
              isNight ? 'bg-zinc-800/40 border-zinc-700/60' : 'bg-zinc-50 border-zinc-200/80'
            }`}
          >
            <div className="text-[12px] font-semibold">Guardar diseño actual en colección</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. F019 Acanalada"
                className={`px-3 py-1.5 rounded-xl border text-[12px] outline-none ${
                  isNight
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500'
                    : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
              <input
                type="text"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="Nombre colección"
                className={`px-3 py-1.5 rounded-xl border text-[12px] outline-none ${
                  isNight
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500'
                    : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={variantLabel}
                onChange={(e) => setVariantLabel(e.target.value)}
                className={`px-2.5 py-1.5 rounded-xl border text-[12px] outline-none ${
                  isNight
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-100'
                    : 'bg-white border-zinc-200 text-zinc-900'
                }`}
              >
                <option value="Mesa">Mesa</option>
                <option value="Mini">Mini</option>
                <option value="Colgante">Colgante</option>
                <option value="Edición Especial">Especial</option>
              </select>
              <button
                type="submit"
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-[12px] font-semibold transition-colors ${
                  isNight
                    ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
                    : 'bg-zinc-950 hover:bg-zinc-800 text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Guardar en colección
              </button>
            </div>
          </form>

          {/* Load Preset JSON from Disk */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportJSONFile(file);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-dashed text-[12px] font-medium transition-colors ${
                isNight
                  ? 'border-zinc-700 hover:border-amber-400 text-zinc-300'
                  : 'border-zinc-300 hover:border-zinc-900 text-zinc-700'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Cargar Preset o Colección desde archivo JSON
            </button>
          </div>

          {/* 4 Curated Presets */}
          <div className="space-y-2.5">
            <div className="text-[11.5px] font-semibold uppercase tracking-wider opacity-60">
              Presets Curados de Colección ({CURATED_PRESETS.length} Diseños)
            </div>
            <div className="space-y-2">
              {CURATED_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => {
                    onSelectPreset(preset);
                    onClose();
                  }}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border cursor-pointer transition-all ${cardBg}`}
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
                    <FamilyThumbnail family={preset.config.family} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold truncate">
                        {preset.name}
                      </span>
                    </div>
                    <p className={`text-[11px] line-clamp-1 ${muted}`}>
                      {preset.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Descargar JSON"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExportPresetJSON(preset);
                    }}
                    className={`p-1.5 rounded-lg opacity-60 hover:opacity-100 ${
                      isNight ? 'hover:bg-zinc-700' : 'hover:bg-zinc-200'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* User Saved Collections */}
          {grouped.size > 0 && (
            <div className="space-y-4">
              <div className="text-[11.5px] font-semibold uppercase tracking-wider opacity-60">
                Mis Colecciones Guardadas
              </div>
              {Array.from(grouped.entries()).map(([colName, items]) => (
                <div key={colName} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold">
                      {colName}{' '}
                      <span className={`font-normal ${muted}`}>({items.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onExportCollectionJSON(colName, items)}
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg ${
                        isNight
                          ? 'text-amber-300 hover:bg-zinc-800'
                          : 'text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      <Download className="w-3 h-3" />
                      Exportar colección JSON
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {items.map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => {
                          onSelectPreset(preset);
                          onClose();
                        }}
                        className={`flex items-center gap-3 p-2 rounded-2xl border cursor-pointer transition-all ${cardBg}`}
                      >
                        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
                          <FamilyThumbnail family={preset.config.family} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12.5px] font-medium truncate">
                              {preset.name}
                            </span>
                            {preset.variantLabel && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                  isNight
                                    ? 'bg-zinc-700 text-zinc-200'
                                    : 'bg-zinc-200/70 text-zinc-700'
                                }`}
                              >
                                {preset.variantLabel}
                              </span>
                            )}
                          </div>
                          <div className={`text-[10.5px] font-mono-num ${muted}`}>
                            H {preset.config.silhouette.height} mm ·{' '}
                            {preset.config.mount.type === 'led_kit_001'
                              ? 'LED Kit 001'
                              : 'E26/E27'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Exportar JSON"
                            onClick={(e) => {
                              e.stopPropagation();
                              onExportPresetJSON(preset);
                            }}
                            className={`p-1.5 rounded-lg opacity-60 hover:opacity-100 ${
                              isNight ? 'hover:bg-zinc-700' : 'hover:bg-zinc-200'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeletePreset(preset.id);
                            }}
                            className="p-1.5 rounded-lg text-rose-500 opacity-60 hover:opacity-100 hover:bg-rose-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
