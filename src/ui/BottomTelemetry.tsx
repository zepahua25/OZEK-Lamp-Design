import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { LampMetrics } from '../types/lamp';

interface BottomTelemetryProps {
  metrics: LampMetrics | null;
  showOverhangs: boolean;
  onToggleOverhangs: () => void;
  isNight: boolean;
}

export const BottomTelemetry: React.FC<BottomTelemetryProps> = ({
  metrics,
  showOverhangs,
  onToggleOverhangs,
  isNight,
}) => {
  if (!metrics) return null;

  const ov = metrics.overhangPercent;
  const ovDotColor =
    ov < 2.5 ? 'bg-emerald-500' : ov < 10 ? 'bg-amber-500' : 'bg-rose-500';

  const dia = Math.round(Math.max(metrics.widthMm, metrics.depthMm));
  const h = Math.round(metrics.heightMm);
  const hasSplitWeights = metrics.baseGramsPLA > 1 && metrics.shadeGramsPLA > 1;

  return (
    <div className="fixed bottom-4 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-none max-w-[calc(100vw-400px)]">
      <div
        className={`pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-full border backdrop-blur-md shadow-sm text-[12px] whitespace-nowrap ${
          isNight
            ? 'bg-zinc-900/80 border-zinc-700/70 text-zinc-200'
            : 'bg-white/85 border-black/[0.07] text-zinc-700'
        }`}
      >
        {/* PLA Weight estimate with Base + Shade split */}
        <div
          className="flex items-center gap-1.5 whitespace-nowrap"
          title={`Volumen sólido total: ${metrics.volumeCm3.toFixed(1)} cm³ × 1.24 g/cm³ (PLA)`}
        >
          <span className="font-mono-num font-semibold">
            ≈ {Math.round(metrics.gramsPLA)} g
          </span>
          <span className={isNight ? 'text-zinc-400' : 'text-zinc-500'}>PLA</span>
          {hasSplitWeights && (
            <span className={`hidden xl:inline text-[11px] font-mono-num ${isNight ? 'text-zinc-400' : 'text-zinc-500'}`}>
              (Base {Math.round(metrics.baseGramsPLA)}g · Pant. {Math.round(metrics.shadeGramsPLA)}g
              {metrics.diffuserGramsPLA > 1 ? ` · Dif. ${Math.round(metrics.diffuserGramsPLA)}g` : ''})
            </span>
          )}
          <Info className="w-3 h-3 opacity-45 shrink-0" />
        </div>

        <span className={`w-px h-3.5 shrink-0 ${isNight ? 'bg-zinc-700' : 'bg-zinc-300'}`} />

        {/* Overhang percentage */}
        <button
          type="button"
          onClick={onToggleOverhangs}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-1.5 py-0.5 -mx-1 transition-colors ${
            showOverhangs
              ? 'bg-rose-500/15 text-rose-500'
              : isNight
                ? 'hover:bg-zinc-800'
                : 'hover:bg-zinc-100'
          }`}
          title="Clic para activar/desactivar visualización de voladizos en rojo"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${ovDotColor}`} />
          <span className="font-mono-num font-semibold">{ov.toFixed(1)}%</span>
          <span className={showOverhangs ? 'text-rose-500' : isNight ? 'text-zinc-400' : 'text-zinc-500'}>
            voladizo &gt; {metrics.overhangAngle}°
          </span>
        </button>

        <span className={`hidden md:inline-block w-px h-3.5 shrink-0 ${isNight ? 'bg-zinc-700' : 'bg-zinc-300'}`} />

        {/* Dimensions & Bambu Lab A1 fit badge */}
        <div className="hidden md:flex items-center gap-2 whitespace-nowrap">
          <span className="font-mono-num text-[12px]">
            Ø{dia} × {h} mm
          </span>
          {metrics.fitsBambuA1 ? (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                isNight
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-emerald-500/12 text-emerald-700'
              }`}
              title="Cabe en la cama de Bambu Lab A1 (256 × 256 × 256 mm)"
            >
              <CheckCircle2 className="w-3 h-3" />
              A1
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500"
              title="Excede el volumen de Bambu Lab A1 (256 mm)"
            >
              <AlertTriangle className="w-3 h-3" />
              &gt;256 mm
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
