import React from 'react';
import { RotateCcw } from 'lucide-react';

interface StudioSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  defaultValue?: number;
  minLabel?: string;
  maxLabel?: string;
  formatValue?: (v: number) => string;
  onChange: (value: number) => void;
  onCommit?: () => void;
  dark?: boolean;
}

export const StudioSlider: React.FC<StudioSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  defaultValue,
  minLabel,
  maxLabel,
  formatValue,
  onChange,
  onCommit,
  dark = false,
}) => {
  const pct = Math.max(0, Math.min(100, ((value - min) / Math.max(max - min, 1e-6)) * 100));
  const formatted = formatValue
    ? formatValue(value)
    : `${Number.isInteger(step) ? Math.round(value) : value.toFixed(step < 0.1 ? 2 : 1)}${unit ? ` ${unit}` : ''}`;

  const canReset = defaultValue !== undefined && Math.abs(value - defaultValue) > step * 0.4;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[12.5px] font-medium tracking-[-0.01em] ${
            dark ? 'text-zinc-200' : 'text-zinc-700'
          }`}
        >
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`font-mono-num text-[12px] font-medium ${
              dark ? 'text-zinc-100' : 'text-zinc-900'
            }`}
          >
            {formatted}
          </span>
          {defaultValue !== undefined && (
            <button
              type="button"
              title="Restablecer valor"
              disabled={!canReset}
              onClick={() => {
                onChange(defaultValue);
                onCommit?.();
              }}
              className={`p-0.5 rounded transition-opacity ${
                canReset
                  ? dark
                    ? 'text-zinc-400 hover:text-zinc-100 opacity-80 hover:opacity-100'
                    : 'text-zinc-400 hover:text-zinc-800 opacity-80 hover:opacity-100'
                  : 'opacity-20 cursor-default'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex items-center h-4">
        <div
          className={`absolute inset-x-0 h-[3px] rounded-full overflow-hidden pointer-events-none ${
            dark ? 'bg-zinc-700/80' : 'bg-zinc-900/12'
          }`}
        >
          <div
            className={`h-full rounded-full ${dark ? 'bg-amber-400' : 'bg-zinc-900'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          className="studio-range relative z-10"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerUp={() => onCommit?.()}
          onKeyUp={() => onCommit?.()}
        />
      </div>

      {(minLabel || maxLabel) && (
        <div
          className={`flex items-center justify-between text-[10.5px] ${
            dark ? 'text-zinc-500' : 'text-zinc-400'
          }`}
        >
          <span>{minLabel ?? ''}</span>
          <span>{maxLabel ?? ''}</span>
        </div>
      )}
    </div>
  );
};
