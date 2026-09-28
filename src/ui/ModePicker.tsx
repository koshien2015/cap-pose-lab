import { formatDuration } from '../inference/eta';
import type { ModeId, PoseModel } from '../inference/manifest';

interface Props {
  readonly models: readonly PoseModel[];
  readonly allowed: readonly ModeId[];
  readonly recommended: ModeId | null;
  readonly estimateSec: (id: ModeId) => number;
  readonly selected: ModeId | null;
  readonly onSelect: (id: ModeId) => void;
}

export function ModePicker({ models, allowed, recommended, estimateSec, selected, onSelect }: Props) {
  return (
    <div role="radiogroup" aria-label="解析モード" className="space-y-3">
      {models.map((m) => {
        const enabled = allowed.includes(m.id);
        const active = selected === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-label={m.label}
            aria-checked={active}
            disabled={!enabled}
            onClick={() => enabled && onSelect(m.id)}
            className={`block w-full min-h-11 rounded-xl border-2 p-4 text-left disabled:opacity-40 ${
              active ? 'border-cyan-600 bg-cyan-600/10' : 'border-current/20'
            }`}
          >
            <span className="flex items-center gap-2 text-lg font-bold">
              {m.label}
              {recommended === m.id && enabled && (
                <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs text-white">おすすめ</span>
              )}
            </span>
            <span className="block text-sm">{m.description}</span>
            <span className="block text-sm opacity-80">
              ダウンロード 約 {Math.round(m.sizeMB)} MB・解析 {formatDuration(estimateSec(m.id) * 1000)}
            </span>
            {!enabled && <span className="block text-sm">この端末では選べません</span>}
          </button>
        );
      })}
    </div>
  );
}
