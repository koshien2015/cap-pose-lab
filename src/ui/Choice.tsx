/** 2〜3択のボタン（ラジオ） */
export function Choice<T extends string>({
  name,
  value,
  options,
  onPick,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onPick: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-2">
      {options.map(([v, label]) => (
        <label key={v} className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border-2 ${value === v ? 'border-cyan-600' : 'border-current/20'}`}>
          <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onPick(v)} aria-label={label} />
          {label}
        </label>
      ))}
    </div>
  );
}
