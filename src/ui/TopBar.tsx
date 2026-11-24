import React from 'react';
import { Layers, Lightbulb, Moon, Shuffle, Sun } from 'lucide-react';
import { BuildMode, ViewAssemblyMode } from '../types/lamp';

interface TopBarProps {
  lightOn: boolean;
  isNight: boolean;
  isBusy: boolean;
  buildMode: BuildMode;
  isTwoPartActive: boolean;
  assemblyView: ViewAssemblyMode;
  onShuffle: () => void;
  onToggleLight: () => void;
  onToggleTheme: () => void;
  onChangeBuildMode: (mode: BuildMode) => void;
  onChangeAssemblyView: (mode: ViewAssemblyMode) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  lightOn,
  isNight,
  isBusy,
  buildMode,
  isTwoPartActive,
  assemblyView,
  onShuffle,
  onToggleLight,
  onToggleTheme,
  onChangeBuildMode,
  onChangeAssemblyView,
}) => {
  const pillBase = isNight
    ? 'bg-zinc-900/80 border-zinc-700/70 text-zinc-100 hover:bg-zinc-800/90'
    : 'bg-white/85 border-black/[0.07] text-zinc-900 hover:bg-white';

  const groupPill = isNight
    ? 'bg-zinc-900/80 border-zinc-700/70'
    : 'bg-white/85 border-black/[0.07]';

  const activeChip = isNight
    ? 'bg-amber-400 text-zinc-950 shadow-sm'
    : 'bg-zinc-900 text-white shadow-sm';

  const idleChip = isNight
    ? 'text-zinc-300 hover:text-white'
    : 'text-zinc-600 hover:text-zinc-950';

  const viewModes: Array<{ id: ViewAssemblyMode; label: string }> = [
    { id: 'assembled', label: 'Armada' },
    { id: 'exploded', label: 'Vista Explotada' },
    { id: 'base_only', label: 'Base' },
    { id: 'shade_only', label: 'Pantalla' },
  ];

  return (
    <div className="fixed top-4 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-none max-w-[calc(100vw-430px)]">
      {/* Brand mark */}
      <div
        className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded-full border backdrop-blur-md shadow-sm ${
          isNight
            ? 'bg-zinc-900/75 border-zinc-700/60 text-zinc-100'
            : 'bg-white/80 border-black/[0.06] text-zinc-900'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.75)]" />
        <span className="text-[11.5px] font-semibold tracking-[0.09em] uppercase">
          OZEK Studio
        </span>
      </div>

      {/* Mode selector: 1 Pieza vs 2 Piezas (Base + Pantalla) */}
      <div
        className={`pointer-events-auto flex items-center gap-0.5 p-1 rounded-full border backdrop-blur-md shadow-sm ${groupPill}`}
        title="Modo de construcción: 1 Pieza unificada o 2 Piezas separadas (Base + Pantalla)"
      >
        <button
          type="button"
          onClick={() => onChangeBuildMode('monoblock')}
          className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-all ${
            buildMode === 'monoblock' ? activeChip : idleChip
          }`}
        >
          1 Pieza
        </button>
        <button
          type="button"
          onClick={() => onChangeBuildMode('two_part')}
          className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-all ${
            buildMode === 'two_part' ? activeChip : idleChip
          }`}
        >
          2 Piezas
        </button>
      </div>

      {/* Two-Part Assembly Inspector (Armada / Vista Explotada +50mm / Base / Pantalla) */}
      {isTwoPartActive && (
        <div
          className={`pointer-events-auto flex items-center gap-0.5 p-1 rounded-full border backdrop-blur-md shadow-sm ${groupPill}`}
          title="Inspecciona el encaje Base–Pantalla (Vista Explotada levanta 50 mm)"
        >
          <Layers
            className={`w-3.5 h-3.5 ml-1.5 mr-0.5 ${isNight ? 'text-amber-400' : 'text-zinc-500'}`}
          />
          {viewModes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onChangeAssemblyView(m.id)}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-all ${
                m.id === assemblyView ? activeChip : idleChip
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Mezclar pill */}
      <button
        type="button"
        onClick={onShuffle}
        className={`pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-full border backdrop-blur-md shadow-sm text-[12px] font-medium transition-all active:scale-95 ${pillBase}`}
        title="Generar variación estética imprimible dentro de esta familia"
      >
        <Shuffle className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
        <span>Mezclar</span>
      </button>

      {/* Warm internal light toggle */}
      <button
        type="button"
        onClick={onToggleLight}
        className={`pointer-events-auto flex items-center justify-center w-9 h-9 rounded-full border backdrop-blur-md shadow-sm transition-all ${
          lightOn
            ? isNight
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
              : 'bg-amber-50/90 border-amber-300/70 text-amber-900 hover:bg-amber-100/90'
            : pillBase
        }`}
        title={lightOn ? 'Apagar foco cálido interior' : 'Encender foco cálido interior'}
      >
        <Lightbulb className={`w-4 h-4 ${lightOn ? 'fill-amber-400 text-amber-500' : ''}`} />
      </button>

      {/* Studio Day / Warm Night theme toggle */}
      <button
        type="button"
        onClick={onToggleTheme}
        className={`pointer-events-auto flex items-center justify-center w-9 h-9 rounded-full border backdrop-blur-md shadow-sm transition-all ${pillBase}`}
        title={isNight ? 'Cambiar a Estudio Claro' : 'Cambiar a Noche Cálida'}
      >
        {isNight ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-zinc-600" />}
      </button>
    </div>
  );
};
