import { LampConfig, LampPreset } from '../types/lamp';
import { CURATED_PRESETS, DEFAULT_CONFIG, cloneConfig } from './presets';

const STORAGE_KEY = 'ozek_lamp_studio_user_presets_v2';

export function loadUserPresets(): LampPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as LampPreset[];
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: LampPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore quota errors cleanly
  }
}

export function getAllPresets(userPresets: LampPreset[]): LampPreset[] {
  return [...CURATED_PRESETS, ...userPresets];
}

export function createUserPreset(
  name: string,
  collectionName: string,
  variantLabel: string,
  config: LampConfig
): LampPreset {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'Lámpara OZEK',
    collectionName: collectionName.trim() || 'Mi Colección',
    variantLabel,
    createdAt: new Date().toISOString(),
    config: cloneConfig(config),
  };
}

/**
 * Normalizes imported older JSON configs cleanly by filling in any missing base/louvers fields.
 */
export function normalizeLampConfig(partial: LampConfig): LampConfig {
  return {
    ...cloneConfig(DEFAULT_CONFIG),
    ...partial,
    silhouette: { ...DEFAULT_CONFIG.silhouette, ...(partial.silhouette ?? {}) },
    base: { ...DEFAULT_CONFIG.base, ...(partial.base ?? {}) },
    mount: { ...DEFAULT_CONFIG.mount, ...(partial.mount ?? {}) },
    pleated: { ...DEFAULT_CONFIG.pleated, ...(partial.pleated ?? {}) },
    japaneseFlute: { ...DEFAULT_CONFIG.japaneseFlute, ...(partial.japaneseFlute ?? {}) },
    helical: { ...DEFAULT_CONFIG.helical, ...(partial.helical ?? {}) },
    louvers: { ...DEFAULT_CONFIG.louvers, ...(partial.louvers ?? {}) },
    woven: { ...DEFAULT_CONFIG.woven, ...(partial.woven ?? {}) },
    organic: { ...DEFAULT_CONFIG.organic, ...(partial.organic ?? {}) },
    visual: { ...DEFAULT_CONFIG.visual, ...(partial.visual ?? {}) },
  };
}

/**
 * Collection Variant Generator (like Flowalistik HOTO S / M / L + Pendant E26):
 * Derives a cohesive Table / Mini / Pendant sibling preserving exact pattern DNA & coupling!
 */
export function deriveCollectionVariant(
  source: LampConfig,
  variant: 'table' | 'mini' | 'pendant'
): LampConfig {
  const next = cloneConfig(source);

  if (variant === 'table') {
    next.silhouette.buildMode = 'two_part';
    next.mount.position = 'bottom';
    next.silhouette.height = Math.max(145, Math.min(200, source.silhouette.height));
  } else if (variant === 'mini') {
    next.silhouette.buildMode = 'two_part';
    next.mount.type = 'led_kit_001';
    next.mount.position = 'bottom';
    next.base.style = 'conkel';
    next.base.height = 18;
    next.silhouette.height = Math.max(105, Math.min(130, Math.round(source.silhouette.height * 0.72)));
    next.silhouette.baseRadius = Math.max(46, Math.round(source.silhouette.baseRadius * 0.84));
    next.silhouette.midRadius = Math.max(52, Math.round(source.silhouette.midRadius * 0.8));
    next.silhouette.topRadius = Math.max(40, Math.round(source.silhouette.topRadius * 0.8));
  } else {
    next.mount.type = 'e26_e27';
    next.mount.position = 'top';
    next.silhouette.buildMode = 'monoblock';
    next.silhouette.type = source.silhouette.type === 'stepped' ? 'curve' : source.silhouette.type;
    next.silhouette.height = Math.max(165, Math.min(215, source.silhouette.height));
    next.silhouette.topRadius = Math.max(38, Math.min(54, Math.round(source.silhouette.topRadius * 0.75)));
    next.silhouette.midRadius = Math.max(72, Math.min(104, Math.round(source.silhouette.midRadius * 1.05)));
    next.silhouette.baseRadius = Math.max(54, Math.min(88, Math.round(source.silhouette.midRadius * 0.84)));
  }

  return next;
}

export function downloadPresetJSON(preset: LampPreset | LampConfig, filename: string): void {
  const payload = JSON.stringify(preset, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseImportedJSON(raw: string): {
  config?: LampConfig;
  presets?: LampPreset[];
} {
  const data = JSON.parse(raw) as Record<string, unknown>;
  if (Array.isArray(data)) {
    const valid = data
      .filter(
        (item): item is LampPreset =>
          typeof item === 'object' &&
          item !== null &&
          'config' in item &&
          typeof (item as LampPreset).config?.family === 'string'
      )
      .map((p) => ({ ...p, config: normalizeLampConfig(p.config) }));
    if (valid.length > 0) return { presets: valid };
  }
  if (data && typeof data === 'object') {
    if ('config' in data && typeof (data as unknown as LampPreset).config?.family === 'string') {
      return { config: normalizeLampConfig((data as unknown as LampPreset).config) };
    }
    if ('family' in data && 'silhouette' in data && 'mount' in data) {
      return { config: normalizeLampConfig(data as unknown as LampConfig) };
    }
  }
  throw new Error('Formato JSON no válido para OZEK Lamp Studio.');
}
