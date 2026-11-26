import React from 'react';
import {
  Flame,
  Grid3x3,
  Maximize2,
  Scissors,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface ViewportToolsProps {
  showOverhangs: boolean;
  sectionCut: boolean;
  showBuildPlate: boolean;
  isNight: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
  onToggleOverhangs: () => void;
  onToggleSectionCut: () => void;
  onToggleBuildPlate: () => void;
}

export const ViewportTools: React.FC<ViewportToolsProps> = ({
  showOverhangs,
  sectionCut,
  showBuildPlate,
  isNight,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  onToggleOverhangs,
  onToggleSectionCut,
  onToggleBuildPlate,
}) => {
  const btnBase = isNight
    ? 'bg-zinc-900/80 border-zinc-700/70 text-zinc-200 hover:bg-zinc-800'
    : 'bg-white/85 border-black/[0.07] text-zinc-700 hover:bg-white hover:text-zinc-950';

  const activeBtn = isNight
    ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
    : 'bg-zinc-900 border-zinc-900 text-white';

  const overhangActive = 'bg-rose-600 border-rose-600 text-white shadow-rose-500/30';

  return (
    <div className="fixed top-4 right-[388px] z-20 hidden sm:flex flex-col gap-2">
      <button
        type="button"
        onClick={onZoomIn}
        title="Acercar"
        className={`w-9 h-9 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all active:scale-95 ${btnBase}`}
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        title="Alejar"
        className={`w-9 h-9 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all active:scale-95 ${btnBase}`}
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onResetCamera}
        title="Centrar vista"
        className={`w-9 h-9 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all active:scale-95 ${btnBase}`}
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      <div className={`h-px w-5 mx-auto my-0.5 ${isNight ? 'bg-zinc-700' : 'bg-zinc-300'}`} />

      <button
        type="button"
        onClick={onToggleOverhangs}
        title="Ver voladizos en rojo (ángulo límite)"
        className={`w-9 h-9 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all active:scale-95 ${
          showOverhangs ? overhangActive : btnBase
        }`}
      >
        <Flame className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onToggleSectionCut}
        title="Corte de sección (inspeccionar montura y pared interna)"
        className={`w-9 h-9 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all active:scale-95 ${
          sectionCut ? activeBtn : btnBase
        }`}
      >
        <Scissors className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onToggleBuildPlate}
        title="Mostrar volumen de impresión Bambu Lab A1 (256 × 256 × 256 mm)"
        className={`w-9 h-9 rounded-full border backdrop-blur-md shadow-sm flex items-center justify-center transition-all active:scale-95 ${
          showBuildPlate ? activeBtn : btnBase
        }`}
      >
        <Grid3x3 className="w-4 h-4" />
      </button>
    </div>
  );
};
