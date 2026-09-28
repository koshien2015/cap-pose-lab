import { useEffect, useMemo, useRef, useState } from 'react';

import type { Hand, PitchConfig } from '../analysis/analyzePitch';
import { type CompareInput, validateEvents } from '../flow/compare';
import { drawPoseFrame } from './drawPose';

interface Props {
  readonly input: CompareInput;
  readonly onChange: (config: PitchConfig) => void;
}

const button = 'min-h-11 rounded-xl border border-current/40 px-3';

function Choice<T extends string>({ name, value, options, onPick }: { name: string; value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void }) {
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

/** 1本分の指定: 足接地・リリースのコマ、投げ腕、打者の向き */
export function EventMarker({ input, onChange }: Props) {
  const { json, thumbnails, thumbStride, config } = input;
  const frames = useMemo(() => [...json.frames].sort((a, b) => a.frame_index - b.frame_index), [json]);
  const stride = thumbnails ? Math.max(1, thumbStride) : 1;
  const [position, setPosition] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = frames[position]?.frame_index ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 縮小画像は間引いてあるので、直前の縮小画像を出し、骨格はそのコマのものを描く
    const thumb = thumbnails ? (thumbnails[Math.min(thumbnails.length - 1, Math.floor(position / stride))] ?? null) : null;
    drawPoseFrame(canvas, frames, position, thumb, input.size ?? null);
  }, [frames, position, thumbnails, stride, input.size]);

  const update = (next: PitchConfig) => {
    const reason = validateEvents(next.footContactFrame, next.releaseFrame);
    setProblem(reason);
    if (!reason) onChange(next);
  };
  const move = (delta: number) => setPosition((p) => Math.min(frames.length - 1, Math.max(0, p + delta)));

  return (
    <section className="space-y-3 rounded-xl border border-current/20 p-3">
      <p className="font-bold break-all">{config.pitchId}</p>
      <canvas ref={canvasRef} className="w-full rounded-lg" />
      <input
        type="range"
        aria-label="コマ"
        min={0}
        max={Math.max(0, frames.length - 1)}
        step={1}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="h-11 w-full"
      />
      <div className="flex gap-2">
        <button type="button" aria-label="前のコマ" className={`${button} flex-1`} onClick={() => move(-1)}>
          ◀ 前
        </button>
        <span className="flex min-h-11 flex-1 items-center justify-center text-sm tabular-nums">コマ {frame ?? '—'}</span>
        <button type="button" aria-label="次のコマ" className={`${button} flex-1`} onClick={() => move(1)}>
          次 ▶
        </button>
      </div>
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
