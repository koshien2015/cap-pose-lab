import { useMemo, useState } from 'react';

import { type Bats, type SwingConfig, validateSwingEvents } from '../batting/analyzeSwing';
import type { SwingCompareInput } from '../flow/swingCompare';
import { Choice } from './Choice';
import { FrameScrubber } from './FrameScrubber';

interface Props {
  readonly input: SwingCompareInput;
  readonly onChange: (config: SwingConfig) => void;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

/** 1本分の指定: トップ・インパクトのコマ、打ち方 */
export function SwingMarker({ input, onChange }: Props) {
  const { json, thumbnails, thumbStride, config } = input;
  const frames = useMemo(() => [...json.frames].sort((a, b) => a.frame_index - b.frame_index), [json]);
  const [position, setPosition] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const frame = frames[position]?.frame_index ?? null;

  const update = (next: SwingConfig) => {
    const reason = validateSwingEvents(next.topFrame, next.impactFrame);
    setProblem(reason);
    if (!reason) onChange(next);
  };

  return (
    <section className="space-y-3 rounded-xl border border-current/20 p-3">
      <p className="font-bold break-all">{config.swingId}</p>
      <FrameScrubber frames={frames} thumbnails={thumbnails} thumbStride={thumbStride} size={input.size ?? null} position={position} onPosition={setPosition} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={button} onClick={() => update({ ...config, topFrame: frame })}>
          このコマをトップにする
        </button>
        <button type="button" className={button} onClick={() => update({ ...config, impactFrame: frame })}>
          このコマをインパクトにする
        </button>
      </div>
      <p className="text-sm">
        トップ: {config.topFrame ?? '未指定'}
        {config.topFrame !== null && (
          <button type="button" aria-label="トップを取り消す" className="ml-2 underline" onClick={() => update({ ...config, topFrame: null })}>
            取り消す
          </button>
        )}
        {' ／ '}インパクト: {config.impactFrame ?? '未指定'}
        {config.impactFrame !== null && (
          <button type="button" aria-label="インパクトを取り消す" className="ml-2 underline" onClick={() => update({ ...config, impactFrame: null })}>
            取り消す
          </button>
        )}
      </p>
      {problem && <p className="text-sm text-red-600">{problem}</p>}
      <Choice<Bats> name="打ち方" value={config.bats} options={[['right', '右打ち'], ['left', '左打ち']]} onPick={(v) => update({ ...config, bats: v })} />
    </section>
  );
}
