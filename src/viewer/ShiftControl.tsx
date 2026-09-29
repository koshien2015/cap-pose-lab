interface Props {
  readonly value: number;
  /** ずらせる幅（±） */
  readonly limit: number;
  readonly onChange: (next: number) => void;
}

const button = 'min-h-11 min-w-11 shrink-0 rounded-xl border border-current/40 px-2';

/** 2本目を前後にずらす（+n で2本目が n コマ後ろにずれる） */
export function ShiftControl({ value, limit, onChange }: Props) {
  const set = (next: number) => onChange(Math.max(-limit, Math.min(limit, next)));
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="opacity-70">2本目をずらす</span>
        <span className="flex-1 text-right tabular-nums">
          {value > 0 ? '+' : ''}
          {value} コマ
        </span>
        <button type="button" onClick={() => set(0)} disabled={value === 0} className={`${button} disabled:opacity-40`}>
          0に戻す
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="2本目を1コマ前へ" onClick={() => set(value - 1)} className={button}>
          −1
        </button>
        <input
          type="range"
          aria-label="2本目のずれ"
          min={-limit}
          max={limit}
          step={1}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="h-11 min-w-0 flex-1"
        />
        <button type="button" aria-label="2本目を1コマ後ろへ" onClick={() => set(value + 1)} className={button}>
          +1
        </button>
      </div>
    </div>
  );
}
