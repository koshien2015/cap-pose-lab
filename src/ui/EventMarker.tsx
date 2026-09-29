import { useMemo, useState } from 'react';

import type { Hand, PitchConfig } from '../analysis/analyzePitch';
import { type CompareInput, validateEvents } from '../flow/compare';
import { Choice } from './Choice';
import { FrameScrubber } from './FrameScrubber';

interface Props {
  readonly input: CompareInput;
  readonly onChange: (config: PitchConfig) => void;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

/** 1本分の指定: 足接地・リリースのコマ、投げ腕、打者の向き */
export function EventMarker({ input, onChange }: Props) {
  const { json, thumbnails, thumbStride, config } = input;
  const frames = useMemo(() => [...json.frames].sort((a, b) => a.frame_index - b.frame_index), [json]);
  const [position, setPosition] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const frame = frames[position]?.frame_index ?? null;

  const update = (next: PitchConfig) => {
    const reason = validateEvents(next.footContactFrame, next.releaseFrame);
    setProblem(reason);
    if (!reason) onChange(next);
  };

  return (
    <section className="space-y-3 rounded-xl border border-current/20 p-3">
      <p className="font-bold break-all">{config.pitchId}</p>
      <FrameScrubber frames={frames} thumbnails={thumbnails} thumbStride={thumbStride} size={input.size ?? null} position={position} onPosition={setPosition} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={button} onClick={() => update({ ...config, footContactFrame: frame })}>
          このコマを足接地にする
        </button>
        <button type="button" className={button} onClick={() => update({ ...config, releaseFrame: frame })}>
          このコマをリリースにする
        </button>
      </div>
      <p className="text-sm">
        足接地: {config.footContactFrame ?? '未指定'}
        {config.footContactFrame !== null && (
          <button type="button" className="ml-2 underline" onClick={() => update({ ...config, footContactFrame: null })}>
            取り消す
          </button>
        )}
        {' ／ '}リリース: {config.releaseFrame ?? '未指定'}
        {config.releaseFrame !== null && (
          <button type="button" className="ml-2 underline" onClick={() => update({ ...config, releaseFrame: null })}>
            取り消す
          </button>
        )}
      </p>
      {problem && <p className="text-sm text-red-600">{problem}</p>}
      <Choice<Hand> name="投げ腕" value={config.throwingHand} options={[['right', '右投げ'], ['left', '左投げ']]} onPick={(v) => update({ ...config, throwingHand: v })} />
      <Choice<'left' | 'right'>
        name="打者の向き"
        value={config.batterDirection}
        options={[['left', '打者は画面の左'], ['right', '打者は画面の右']]}
        onPick={(v) => update({ ...config, batterDirection: v })}
      />
    </section>
  );
}
