import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { MaterialPresetId } from '../types/lamp';
import {
  OZEK_OFFICIAL_PALETTE,
  OZEK_SIGNATURE_COLLECTION,
  OzekSignaturePiece,
} from '../data/ozekCollection';

interface OzekCollectionPanelProps {
  activePieceId: string | null;
  isNight: boolean;
  onSelectPiece: (piece: OzekSignaturePiece, overrideOrganicMode?: 'gravity' | 'wind') => void;
  onApplyPaletteColor: (target: 'shade' | 'base', material: MaterialPresetId) => void;
}

export const OzekCollectionPanel: React.FC<OzekCollectionPanelProps> = ({
  activePieceId,
  isNight,
  onSelectPiece,
  onApplyPaletteColor,
}) => {
  const [open, setOpen] = useState(true);
  const [colorTarget, setColorTarget] = useState<'shade' | 'base'>('shade');

  const panelBg = isNight
    ? 'bg-zinc-900/86 border-zinc-700/70 text-zinc-100'
    : 'bg-white/88 border-black/[0.08] text-zinc-900';
  const mutedText = isNight ? 'text-zinc-400' : 'text-zinc-500';
  const cardBg = isNight
    ? 'bg-zinc-800/70 border-zinc-700/70 hover:bg-zinc-800'
    : 'bg-white/90 border-black/[0.07] hover:bg-zinc-50';
  const activeCardBg = isNight
    ? 'bg-amber-500/15 border-amber-400/60 ring-1 ring-amber-400/30'
    : 'bg-zinc-900 text-white border-zinc-900 shadow-md';

  if (!open) {
    return (
      <div className="fixed left-4 top-[178px] z-20 hidden md:block">
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Abrir Colección OZ☰K"
          className={`flex items-center gap-2 px-3 py-2 rounded-2xl border backdrop-blur-md shadow-sm text-[12px] font-semibold transition-all hover:scale-[1.02] ${panelBg}`}
        >
          <span className="tracking-widest">OZ☰K</span>
          <ChevronRight className="w-3.5 h-3.5 opacity-70" />
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`fixed left-4 top-[178px] bottom-[76px] w-[252px] z-20 hidden md:flex flex-col rounded-[24px] border backdrop-blur-xl shadow-[0_14px_38px_rgba(20,16,12,0.12)] overflow-hidden transition-colors ${panelBg}`}
    >
      {/* Header */}
      <div
        className={`px-4 pt-3.5 pb-2.5 border-b flex items-start justify-between gap-2 ${
          isNight ? 'border-zinc-800' : 'border-zinc-900/[0.07]'
        }`}
      >
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold tracking-[0.06em]">Colección 01 · OZ☰K</span>
          </div>
          <p className={`text-[11px] italic mt-0.5 ${mutedText}`}>
            “Damos alma a cada pieza.”
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Ocultar panel para ver el visor completo"
          className={`p-1.5 rounded-xl transition-colors ${
            isNight
              ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Official OZEK Palette Quick Swatches */}
      <div
        className={`px-3.5 py-2.5 border-b space-y-2 ${
          isNight ? 'border-zinc-800' : 'border-zinc-900/[0.07]'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-[10.5px] font-semibold uppercase tracking-wider ${mutedText}`}>
            Paleta Oficial
          </span>
          <div
            className={`inline-flex rounded-lg p-0.5 text-[10px] font-medium ${
              isNight ? 'bg-zinc-800' : 'bg-zinc-900/[0.06]'
            }`}
          >
            <button
              type="button"
              onClick={() => setColorTarget('shade')}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                colorTarget === 'shade'
                  ? isNight
                    ? 'bg-zinc-700 text-white'
                    : 'bg-white text-zinc-900 shadow-xs'
                  : mutedText
              }`}
            >
              Pantalla
            </button>
            <button
              type="button"
              onClick={() => setColorTarget('base')}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                colorTarget === 'base'
                  ? isNight
                    ? 'bg-zinc-700 text-white'
                    : 'bg-white text-zinc-900 shadow-xs'
                  : mutedText
              }`}
            >
              Base
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {OZEK_OFFICIAL_PALETTE.map((sw) => (
            <button
              key={sw.id}
              type="button"
              onClick={() => onApplyPaletteColor(colorTarget, sw.id)}
              title={`${sw.name} (${sw.hex}) · ${sw.roleHint}`}
              className={`group flex flex-col items-center gap-1 py-1.5 px-1 rounded-xl border transition-all active:scale-95 ${
                isNight
                  ? 'border-zinc-700/70 bg-zinc-800/60 hover:bg-zinc-800'
                  : 'border-black/[0.07] bg-white hover:bg-zinc-50'
              }`}
            >
              <span
                className="w-6 h-6 rounded-full border border-black/15 shadow-inner transition-transform group-hover:scale-110"
                style={{ backgroundColor: sw.hex }}
              />
              <span className="text-[9.5px] font-medium leading-tight text-center truncate w-full">
                {sw.name.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 4 Signature Lamp Cards */}
      <div className="flex-1 overflow-y-auto studio-scroll px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <span className={`text-[10.5px] font-semibold uppercase tracking-wider ${mutedText}`}>
            Piezas Firma
          </span>
          <Sparkles className="w-3 h-3 text-amber-500 opacity-80" />
        </div>

        {OZEK_SIGNATURE_COLLECTION.map((piece) => {
          const isActive = activePieceId === piece.id;
          return (
            <div
              key={piece.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectPiece(piece)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPiece(piece);
                }
              }}
              className={`w-full text-left p-2.5 rounded-2xl border transition-all cursor-pointer active:scale-[0.99] ${
                isActive ? activeCardBg : cardBg
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[12px] font-bold tracking-tight">
                  {piece.code}{' '}
                  <span className="opacity-80 font-medium">· {piece.kanji}</span>
                </span>
                <div className="flex items-center -space-x-1 shrink-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-white/80 shadow-xs"
                    style={{ backgroundColor: piece.swatches[0] }}
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-white/80 shadow-xs"
                    style={{ backgroundColor: piece.swatches[1] }}
                  />
                </div>
              </div>
              <div
                className={`text-[10.5px] font-semibold mt-0.5 ${
                  isActive ? (isNight ? 'text-amber-200' : 'text-zinc-100') : ''
                }`}
              >
                {piece.title}
              </div>
              <p
                className={`text-[10px] leading-snug mt-0.5 ${
                  isActive ? (isNight ? 'text-amber-100/80' : 'text-zinc-300') : mutedText
                }`}
              >
                {piece.narrative}
              </p>
              <div className="mt-1.5 flex items-center flex-wrap gap-1">
                <span
                  className={`inline-block text-[9px] font-medium px-2 py-0.5 rounded-full ${
                    isActive
                      ? isNight
                        ? 'bg-amber-400/20 text-amber-200'
                        : 'bg-white/15 text-zinc-100'
                      : isNight
                        ? 'bg-zinc-900 text-zinc-300'
                        : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {piece.badge}
                </span>
                {piece.quickWindShortcut && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPiece(piece, 'wind');
                    }}
                    title="Abrir ZOUKEI 02 directamente en variante Viento"
                    className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                      isActive
                        ? isNight
                          ? 'border-amber-300/50 text-amber-200 hover:bg-amber-400/20'
                          : 'border-white/30 text-white hover:bg-white/15'
                        : isNight
                          ? 'border-zinc-600 text-zinc-300 hover:bg-zinc-700'
                          : 'border-zinc-300 text-zinc-700 hover:bg-zinc-200/70'
                    }`}
                  >
                    Viento →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
