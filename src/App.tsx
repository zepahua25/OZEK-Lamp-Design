import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './geometry/families';
import {
  GeneratedLampResult,
  LampConfig,
  LampFamilyId,
  LampMetrics,
  LampPreset,
  LampSizePreset,
  MaterialPresetId,
  SculptStroke,
  SculptToolId,
  UiMode,
  ViewAssemblyMode,
} from './types/lamp';
import {
  CURATED_PRESETS,
  DEFAULT_CONFIG,
  applySizePreset,
  cloneConfig,
} from './data/presets';
import { shuffleLampConfig } from './data/randomizer';
import {
  createUserPreset,
  deriveCollectionVariant,
  downloadPresetJSON,
  loadUserPresets,
  parseImportedJSON,
  saveUserPresets,
} from './data/collections';
import { generateLampGeometry } from './geometry/solidBuilder';
import { SILHOUETTE_SPLINE_TEMPLATES } from './geometry/silhouette';
import { generateAdapterE27ToLed001 } from './geometry/mounts/adapterE27ToLed001';
import {
  buildLampZipPackage,
  exportPartToBinarySTL,
  triggerBinaryDownload,
} from './geometry/stlExport';
import type { WorkerRequest, WorkerResponse } from './geometry/worker';
import { LampScene } from './viewer/LampScene';
import { TopBar } from './ui/TopBar';
import { BottomTelemetry } from './ui/BottomTelemetry';
import { ViewportTools } from './ui/ViewportTools';
import { RightPanel } from './ui/RightPanel';
import { CollectionDrawer } from './ui/CollectionDrawer';
import { OzekCollectionPanel } from './ui/OzekCollectionPanel';
import type { OzekSignaturePiece } from './data/ozekCollection';

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export const App: React.FC = () => {
  const [config, setConfig] = useState<LampConfig>(() => cloneConfig(DEFAULT_CONFIG));
  const [uiMode, setUiMode] = useState<UiMode>('basic');
  const [metrics, setMetrics] = useState<LampMetrics | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [sectionCut, setSectionCut] = useState<boolean>(false);
  const [showBuildPlate, setShowBuildPlate] = useState<boolean>(false);
  const [collectionsOpen, setCollectionsOpen] = useState<boolean>(false);
  const [userPresets, setUserPresets] = useState<LampPreset[]>(() => loadUserPresets());
  const [toast, setToast] = useState<string | null>(null);
  const [activeOzekPieceId, setActiveOzekPieceId] = useState<string | null>(null);
  const [sculptTool, setSculptTool] = useState<SculptToolId>('off');
  const [sculptRadiusMm, setSculptRadiusMm] = useState<number>(28);
  const [sculptStrength, setSculptStrength] = useState<number>(0.55);

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LampScene | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef<number>(0);
  const latestConfigRef = useRef<LampConfig>(config);
  const draftThrottleRef = useRef<number | null>(null);
  const pendingDraftRef = useRef<LampConfig | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  latestConfigRef.current = config;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const dispatchGeometryBuild = useCallback((cfg: LampConfig, draft: boolean) => {
    const worker = workerRef.current;
    if (!worker) return;
    const id = ++reqIdRef.current;
    setIsBusy(true);
    const payload: WorkerRequest = {
      id,
      config: cfg,
      options: { draft, validateManifold: !draft },
    };
    worker.postMessage(payload);
  }, []);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const scene = new LampScene(host);
    sceneRef.current = scene;

    const worker = new Worker(new URL('./geometry/worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, result, error } = event.data;
      if (id !== reqIdRef.current) return;
      setIsBusy(false);
      if (error) {
        console.error('Geometry worker error:', error);
        return;
      }
      if (result) {
        sceneRef.current?.updateMeshes(result.parts, latestConfigRef.current);
        setMetrics(result.metrics);
      }
    };

    dispatchGeometryBuild(latestConfigRef.current, false);

    return () => {
      worker.terminate();
      workerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, [dispatchGeometryBuild]);

  const scheduleDraftBuild = useCallback(
    (nextCfg: LampConfig) => {
      pendingDraftRef.current = nextCfg;
      if (draftThrottleRef.current !== null) return;
      draftThrottleRef.current = window.setTimeout(() => {
        draftThrottleRef.current = null;
        if (pendingDraftRef.current) {
          const toBuild = pendingDraftRef.current;
          pendingDraftRef.current = null;
          dispatchGeometryBuild(toBuild, true);
        }
      }, 36);
    },
    [dispatchGeometryBuild]
  );

  const handleChangeGeometry = useCallback(
    (updater: (prev: LampConfig) => LampConfig, draft: boolean) => {
      setConfig((prev) => {
        const next = updater(prev);
        latestConfigRef.current = next;
        if (draft) {
          scheduleDraftBuild(next);
        } else {
          dispatchGeometryBuild(next, false);
        }
        return next;
      });
    },
    [dispatchGeometryBuild, scheduleDraftBuild]
  );

  const handleCommitGeometry = useCallback(() => {
    if (draftThrottleRef.current !== null) {
      window.clearTimeout(draftThrottleRef.current);
      draftThrottleRef.current = null;
      pendingDraftRef.current = null;
    }
    dispatchGeometryBuild(latestConfigRef.current, false);
  }, [dispatchGeometryBuild]);

  const handleChangeVisual = useCallback(
    (updater: (prev: LampConfig) => LampConfig, recomputeOverhangs = false) => {
      setConfig((prev) => {
        const next = updater(prev);
        latestConfigRef.current = next;
        sceneRef.current?.updateVisualSettings(next);
        if (recomputeOverhangs) {
          scheduleDraftBuild(next);
        }
        return next;
      });
    },
    [scheduleDraftBuild]
  );

  const handleSelectFamily = useCallback(
    (family: LampFamilyId) => {
      setActiveOzekPieceId(null);
      const curated = CURATED_PRESETS.find((p) => p.config.family === family);
      setConfig((prev) => {
        const base = curated ? cloneConfig(curated.config) : cloneConfig(prev);
        base.family = family;
        if (family === 'organic') {
          const spherePts = SILHOUETTE_SPLINE_TEMPLATES.sphere.points.map((pt) => ({ ...pt }));
          base.silhouette.type = 'custom_spline';
          base.silhouette.controlPoints = spherePts;
          base.silhouette.baseRadius = spherePts[0].r;
          base.silhouette.midRadius = spherePts[2].r;
          base.silhouette.topRadius = spherePts[4].r;
          base.silhouette.height = 170;
          base.silhouette.shadeScale = 1.0;
          base.silhouette.skirtWaveAmp = 0;
          base.silhouette.closeTopDome = true; // Closed full sphere by default for Organic Sphere!
        }
        base.sculptStrokes = prev.sculptStrokes ?? [];
        base.visual.showOverhangs = prev.visual.showOverhangs;
        base.visual.overhangAngle = prev.visual.overhangAngle;
        base.visual.sceneTheme = prev.visual.sceneTheme;
        base.visual.assemblyView = prev.visual.assemblyView;
        latestConfigRef.current = base;
        dispatchGeometryBuild(base, false);
        return base;
      });
    },
    [dispatchGeometryBuild]
  );

  const handleSelectOzekPiece = useCallback(
    (piece: OzekSignaturePiece, overrideOrganicMode?: 'gravity' | 'wind') => {
      setActiveOzekPieceId(piece.id);
      const next = cloneConfig(piece.config);
      if (overrideOrganicMode === 'wind') {
        next.organic.mode = 'wind';
        next.organic.finDepth = 9;
        next.organic.depth = 9;
        next.organic.finThickness = 1.2;
      }
      next.visual.sceneTheme = latestConfigRef.current.visual.sceneTheme;
      setConfig(next);
      latestConfigRef.current = next;
      dispatchGeometryBuild(next, false);
      showToast(
        `Colección 01: ${piece.code} · ${piece.kanji} (${piece.title})${overrideOrganicMode === 'wind' ? ' · Viento' : ''}`
      );
    },
    [dispatchGeometryBuild, showToast]
  );

  const handleApplyOzekColor = useCallback(
    (target: 'shade' | 'base', material: MaterialPresetId) => {
      handleChangeVisual((prev) => ({
        ...prev,
        visual:
          target === 'shade'
            ? { ...prev.visual, material }
            : { ...prev.visual, baseMaterial: material },
      }));
    },
    [handleChangeVisual]
  );

  const handleSculptStroke = useCallback(
    (stroke: SculptStroke) => {
      setConfig((prev) => {
        const nextStrokes = [...(prev.sculptStrokes ?? []), stroke].slice(-80);
        const next = { ...prev, sculptStrokes: nextStrokes };
        latestConfigRef.current = next;
        scheduleDraftBuild(next);
        return next;
      });
    },
    [scheduleDraftBuild]
  );

  const handleUndoSculpt = useCallback(() => {
    setConfig((prev) => {
      const nextStrokes = (prev.sculptStrokes ?? []).slice(0, -1);
      const next = { ...prev, sculptStrokes: nextStrokes };
      latestConfigRef.current = next;
      dispatchGeometryBuild(next, false);
      return next;
    });
  }, [dispatchGeometryBuild]);

  const handleClearSculpt = useCallback(() => {
    setConfig((prev) => {
      const next = { ...prev, sculptStrokes: [] };
      latestConfigRef.current = next;
      dispatchGeometryBuild(next, false);
      return next;
    });
    showToast('Trazos de esculpido eliminados');
  }, [dispatchGeometryBuild, showToast]);

  useEffect(() => {
    sceneRef.current?.setSculptBrush(
      sculptTool,
      sculptRadiusMm,
      sculptStrength,
      handleSculptStroke,
      handleCommitGeometry
    );
  }, [sculptTool, sculptRadiusMm, sculptStrength, handleSculptStroke, handleCommitGeometry]);

  const handleApplySizePreset = useCallback(
    (size: LampSizePreset) => {
      setConfig((prev) => {
        const scaled = applySizePreset(prev, size);
        latestConfigRef.current = scaled;
        dispatchGeometryBuild(scaled, false);
        return scaled;
      });
    },
    [dispatchGeometryBuild]
  );

  const handleShuffle = useCallback(() => {
    setConfig((prev) => {
      const next = shuffleLampConfig(prev);
      latestConfigRef.current = next;
      dispatchGeometryBuild(next, false);
      return next;
    });
  }, [dispatchGeometryBuild]);

  const handleExportFullSTL = useCallback(() => {
    setIsExporting(true);
    window.setTimeout(() => {
      try {
        const cfg = latestConfigRef.current;
        const keepMountAtBottom =
          cfg.mount.position === 'top' && cfg.mount.autoFlipPendantExport;

        const res: GeneratedLampResult = generateLampGeometry(cfg, {
          draft: false,
          validateManifold: true,
          keepMountAtBottom,
        });

        const baseName = `OZEK_${slugify(cfg.family)}_${cfg.base.coupling}`;

        if (res.parts.length === 1) {
          const stl = exportPartToBinarySTL(res.parts[0]);
          triggerBinaryDownload(stl, `${baseName}.stl`);
          showToast(
            `STL exportado (${baseName}.stl · ${Math.round(res.metrics.gramsPLA)} g PLA · Z-up mm)`
          );
        } else {
          for (const part of res.parts) {
            const flipTripod = part.name === 'base' && cfg.base.style === 'tripod';
            const stl = exportPartToBinarySTL(part, { flipUpsideDown: flipTripod });
            const suffix =
              part.name === 'base'
                ? `Base_${cfg.base.style}`
                : part.name === 'cup'
                  ? 'Copa'
                  : part.name === 'diffuser'
                    ? 'Difusor'
                    : 'Pantalla';
            triggerBinaryDownload(stl, `${baseName}_${suffix}.stl`);
          }
          showToast(`Exportados ${res.parts.length} STL listos para Bambu Studio`);
        }
      } catch (err) {
        console.error(err);
        showToast('Error al exportar STL');
      } finally {
        setIsExporting(false);
      }
    }, 30);
  }, [showToast]);

  const handleExportPartSTL = useCallback(
    (targetRole: 'base' | 'cup' | 'shade' | 'diffuser') => {
      setIsExporting(true);
      window.setTimeout(() => {
        try {
          const cfg = latestConfigRef.current;
          const res = generateLampGeometry(cfg, { draft: false, validateManifold: true });
          const part = res.parts.find((p) => p.role === targetRole);
          if (!part) return;
          const flipTripod = targetRole === 'base' && cfg.base.style === 'tripod';
          const stl = exportPartToBinarySTL(part, { flipUpsideDown: flipTripod });
          const tag =
            targetRole === 'base'
              ? `OZEK_Base_${cfg.base.style}_${cfg.base.coupling}.stl`
              : targetRole === 'cup'
                ? `OZEK_Copa_E26.stl`
                : targetRole === 'diffuser'
                  ? `OZEK_Difusor_1mm.stl`
                  : `OZEK_Pantalla_${slugify(cfg.family)}_${cfg.base.coupling}.stl`;
          triggerBinaryDownload(stl, tag);
          const grams =
            targetRole === 'base'
              ? Math.round(res.metrics.baseGramsPLA)
              : targetRole === 'cup'
                ? Math.round(res.metrics.cupGramsPLA)
                : targetRole === 'diffuser'
                  ? Math.round(res.metrics.diffuserGramsPLA)
                  : Math.round(res.metrics.shadeGramsPLA);
          const flipNote = flipTripod ? ' · volteado 180° sin soportes' : '';
          showToast(`Exportado ${tag} (${grams} g PLA · Z-up mm${flipNote})`);
        } catch (err) {
          console.error(err);
          showToast('Error al exportar pieza STL');
        } finally {
          setIsExporting(false);
        }
      }, 30);
    },
    [showToast]
  );

  const handleExportAdapterSTL = useCallback(() => {
    setIsExporting(true);
    window.setTimeout(() => {
      try {
        const cfg = latestConfigRef.current;
        const adapter = generateAdapterE27ToLed001(cfg.mount);
        const stl = exportPartToBinarySTL(adapter.part);
        const filename = `OZEK_Adaptador_E27_a_LED001.stl`;
        triggerBinaryDownload(stl, filename);
        showToast(
          `Adaptador E27 ↔ LED 001 exportado (${Math.round(adapter.gramsPLA)} g PLA · 0% soportes)`
        );
      } catch (err) {
        console.error(err);
        showToast('Error al exportar adaptador');
      } finally {
        setIsExporting(false);
      }
    }, 30);
  }, [showToast]);

  const handleExportZipPackage = useCallback(() => {
    setIsExporting(true);
    window.setTimeout(() => {
      try {
        const cfg = latestConfigRef.current;
        const keepMountAtBottom =
          cfg.mount.position === 'top' && cfg.mount.autoFlipPendantExport;
        const res = generateLampGeometry(cfg, {
          draft: false,
          validateManifold: true,
          keepMountAtBottom,
        });
        const slug = `OZEK_${slugify(cfg.family)}`;
        const zipBuf = buildLampZipPackage(cfg, res.parts, res.metrics, slug);
        triggerBinaryDownload(zipBuf, `${slug}_Paquete_BambuStudio.zip`);
        showToast(
          `Paquete .ZIP descargado (${res.parts.length} STL + ajustes_bambu_studio.txt)`
        );
      } catch (err) {
        console.error(err);
        showToast('Error al generar paquete .ZIP');
      } finally {
        setIsExporting(false);
      }
    }, 30);
  }, [showToast]);

  const handleExportTestBaseSTL = useCallback(() => {
    setIsExporting(true);
    window.setTimeout(() => {
      try {
        const cfg = latestConfigRef.current;
        const res = generateLampGeometry(cfg, {
          draft: false,
          clipHeightMm: 16,
          validateManifold: true,
        });
        const stl = exportPartToBinarySTL(res.parts[0]);
        const mountTag =
          cfg.mount.type === 'led_kit_001' ? 'LED001' : `E26_${cfg.mount.e26Diameter}mm`;
        const fileName = `OZEK_test_base_15mm_${mountTag}.stl`;
        triggerBinaryDownload(stl, fileName);
        showToast(`Base de prueba 15 mm exportada (${Math.round(res.metrics.gramsPLA)} g PLA)`);
      } catch (err) {
        console.error(err);
        showToast('Error al exportar base de prueba');
      } finally {
        setIsExporting(false);
      }
    }, 30);
  }, [showToast]);

  const handleQuickSaveJSON = useCallback(() => {
    const cfg = latestConfigRef.current;
    const preset = createUserPreset(
      `OZEK ${cfg.family} ${cfg.base.style}`,
      'Exportado',
      cfg.mount.position === 'top' ? 'Colgante' : 'Mesa',
      cfg
    );
    downloadPresetJSON(preset, `ozek_${cfg.family}_${cfg.base.style}.json`);
    showToast('Preset guardado en archivo JSON local');
  }, [showToast]);

  const handleSaveToCollection = useCallback(
    (name: string, collectionName: string, variantLabel: string) => {
      const preset = createUserPreset(name, collectionName, variantLabel, latestConfigRef.current);
      setUserPresets((prev) => {
        const next = [preset, ...prev];
        saveUserPresets(next);
        return next;
      });
      showToast(`Guardado "${preset.name}" en ${preset.collectionName}`);
    },
    [showToast]
  );

  const handleDeletePreset = useCallback((id: string) => {
    setUserPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      saveUserPresets(next);
      return next;
    });
  }, []);

  const handleSelectPreset = useCallback(
    (preset: LampPreset) => {
      const loaded = cloneConfig(preset.config);
      latestConfigRef.current = loaded;
      setConfig(loaded);
      dispatchGeometryBuild(loaded, false);
      showToast(`Cargado: ${preset.name}`);
    },
    [dispatchGeometryBuild, showToast]
  );

  const handleDeriveVariant = useCallback(
    (variant: 'table' | 'mini' | 'pendant') => {
      setConfig((prev) => {
        const derived = deriveCollectionVariant(prev, variant);
        latestConfigRef.current = derived;
        dispatchGeometryBuild(derived, false);
        return derived;
      });
      const label =
        variant === 'table'
          ? 'Mesa (2 Piezas)'
          : variant === 'mini'
            ? 'Mini LED 001'
            : 'Colgante E26/E27';
      showToast(`Variante de colección creada: ${label}`);
    },
    [dispatchGeometryBuild, showToast]
  );

  const handleImportJSONFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = parseImportedJSON(String(reader.result ?? ''));
          if (parsed.presets && parsed.presets.length > 0) {
            setUserPresets((prev) => {
              const next = [...parsed.presets!, ...prev];
              saveUserPresets(next);
              return next;
            });
            handleSelectPreset(parsed.presets[0]);
            showToast(`Importada colección con ${parsed.presets.length} lámparas`);
          } else if (parsed.config) {
            const loaded = cloneConfig(parsed.config);
            latestConfigRef.current = loaded;
            setConfig(loaded);
            dispatchGeometryBuild(loaded, false);
            showToast(`Preset JSON cargado: ${file.name}`);
          }
        } catch {
          showToast('El archivo JSON no corresponde a un preset válido');
        }
      };
      reader.readAsText(file);
    },
    [dispatchGeometryBuild, handleSelectPreset, showToast]
  );

  const defaultForFamily = useMemo(() => {
    return (
      CURATED_PRESETS.find((p) => p.config.family === config.family)?.config ?? DEFAULT_CONFIG
    );
  }, [config.family]);

  const isNight = config.visual.sceneTheme === 'warm_night';
  const isTwoPart =
    (config.silhouette.buildMode === 'two_part' ||
      config.silhouette.buildMode === 'three_part') &&
    config.mount.position === 'bottom';

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div ref={canvasHostRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <TopBar
        lightOn={config.visual.lightOn}
        isNight={isNight}
        isBusy={isBusy}
        buildMode={config.silhouette.buildMode}
        uiMode={uiMode}
        isTwoPartActive={isTwoPart}
        assemblyView={config.visual.assemblyView}
        onShuffle={handleShuffle}
        onToggleLight={() =>
          handleChangeVisual((prev) => ({
            ...prev,
            visual: { ...prev.visual, lightOn: !prev.visual.lightOn },
          }))
        }
        onToggleTheme={() =>
          handleChangeVisual((prev) => ({
            ...prev,
            visual: {
              ...prev.visual,
              sceneTheme:
                prev.visual.sceneTheme === 'studio_light' ? 'warm_night' : 'studio_light',
            },
          }))
        }
        onChangeUiMode={setUiMode}
        onChangeBuildMode={(buildMode) =>
          handleChangeGeometry(
            (prev) => {
              if (buildMode === 'three_part') {
                return {
                  ...prev,
                  silhouette: { ...prev.silhouette, buildMode: 'three_part' },
                  mount: { ...prev.mount, position: 'bottom', type: 'e26_e27' },
                  base: {
                    ...prev.base,
                    style: prev.base.style === 'compact_flush' ? 'dome' : prev.base.style,
                    coupling: 'slender_e26',
                    spiderBayonet: false,
                    domeStemHeightMm: Math.max(12, Math.min(40, prev.base.domeStemHeightMm ?? 24)),
                  },
                };
              }
              return {
                ...prev,
                silhouette: { ...prev.silhouette, buildMode },
                mount:
                  buildMode === 'two_part'
                    ? { ...prev.mount, position: 'bottom' }
                    : prev.mount,
              };
            },
            false
          )
        }
        onChangeAssemblyView={(assemblyView: ViewAssemblyMode) =>
          handleChangeVisual((prev) => ({
            ...prev,
            visual: { ...prev.visual, assemblyView },
          }))
        }
      />

      <OzekCollectionPanel
        activePieceId={activeOzekPieceId}
        isNight={isNight}
        onSelectPiece={handleSelectOzekPiece}
        onApplyPaletteColor={handleApplyOzekColor}
      />

      <BottomTelemetry
        metrics={metrics}
        showOverhangs={config.visual.showOverhangs}
        isNight={isNight}
        onToggleOverhangs={() =>
          handleChangeVisual((prev) => ({
            ...prev,
            visual: { ...prev.visual, showOverhangs: !prev.visual.showOverhangs },
          }))
        }
      />

      <ViewportTools
        showOverhangs={config.visual.showOverhangs}
        sectionCut={sectionCut}
        showBuildPlate={showBuildPlate}
        isNight={isNight}
        onZoomIn={() => sceneRef.current?.zoom(0.82)}
        onZoomOut={() => sceneRef.current?.zoom(1.22)}
        onResetCamera={() => sceneRef.current?.resetCamera()}
        onToggleOverhangs={() =>
          handleChangeVisual((prev) => ({
            ...prev,
            visual: { ...prev.visual, showOverhangs: !prev.visual.showOverhangs },
          }))
        }
        onToggleSectionCut={() => {
          const next = !sectionCut;
          setSectionCut(next);
          sceneRef.current?.setSectionCut(next);
        }}
        onToggleBuildPlate={() => {
          const next = !showBuildPlate;
          setShowBuildPlate(next);
          sceneRef.current?.setShowBuildPlate(next);
        }}
      />

      <RightPanel
        config={config}
        defaultForFamily={defaultForFamily}
        uiMode={uiMode}
        isExporting={isExporting}
        isNight={isNight}
        sculptTool={sculptTool}
        sculptRadiusMm={sculptRadiusMm}
        sculptStrength={sculptStrength}
        onChangeSculptTool={setSculptTool}
        onChangeSculptRadius={setSculptRadiusMm}
        onChangeSculptStrength={setSculptStrength}
        onUndoSculpt={handleUndoSculpt}
        onClearSculpt={handleClearSculpt}
        onChangeGeometry={handleChangeGeometry}
        onCommitGeometry={handleCommitGeometry}
        onChangeVisual={handleChangeVisual}
        onSelectFamily={handleSelectFamily}
        onApplySizePreset={handleApplySizePreset}
        onExportFullSTL={handleExportFullSTL}
        onExportPartSTL={handleExportPartSTL}
        onExportTestBaseSTL={handleExportTestBaseSTL}
        onExportAdapterSTL={handleExportAdapterSTL}
        onExportZipPackage={handleExportZipPackage}
        onOpenCollections={() => setCollectionsOpen(true)}
        onQuickSaveJSON={handleQuickSaveJSON}
      />

      <CollectionDrawer
        open={collectionsOpen}
        isNight={isNight}
        currentConfig={config}
        userPresets={userPresets}
        onClose={() => setCollectionsOpen(false)}
        onSelectPreset={handleSelectPreset}
        onSaveToCollection={handleSaveToCollection}
        onDeletePreset={handleDeletePreset}
        onDeriveVariant={handleDeriveVariant}
        onExportPresetJSON={(preset) =>
          downloadPresetJSON(preset, `${slugify(preset.name)}.json`)
        }
        onExportCollectionJSON={(colName, items) => {
          const blob = new Blob([JSON.stringify(items, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ozek_coleccion_${slugify(colName)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          showToast(`Colección "${colName}" exportada en JSON`);
        }}
        onImportJSONFile={handleImportJSONFile}
      />

      {toast && (
        <div className="fixed bottom-[72px] left-4 z-30 px-4 py-2.5 rounded-2xl bg-zinc-950/90 text-white text-[12.5px] font-medium shadow-xl backdrop-blur-md border border-white/10">
          {toast}
        </div>
      )}
    </div>
  );
};

export default App;
