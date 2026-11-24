export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label?: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  dark?: boolean;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  dark = false,
}: SegmentedControlProps<T>) {
  return (
    <div className="space-y-1.5">
      {label && (
        <div
          className={`text-[12.5px] font-medium tracking-[-0.01em] ${
            dark ? 'text-zinc-200' : 'text-zinc-700'
          }`}
        >
          {label}
        </div>
      )}
      <div
        className={`grid gap-1 p-1 rounded-xl ${
          dark ? 'bg-zinc-800/90 border border-zinc-700/60' : 'bg-zinc-900/[0.05]'
        }`}
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-2 py-1.5 rounded-lg text-[11.5px] font-medium transition-all truncate ${
                active
                  ? dark
                    ? 'bg-zinc-100 text-zinc-900 shadow-sm'
                    : 'bg-white text-zinc-950 shadow-sm'
                  : dark
                    ? 'text-zinc-400 hover:text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
