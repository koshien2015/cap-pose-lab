import { useState } from 'react';

import type { PitchConfig } from '../analysis/analyzePitch';
import type { ViewerPayload } from '../analysis/payload';
import { buildComparison, type CompareInput } from '../flow/compare';
import { ComparisonViewer } from '../viewer/ComparisonViewer';
import { EventMarker } from './EventMarker';

interface Props {
  readonly inputs: readonly CompareInput[];
  readonly onExit: () => void;
  /** 戻るボタンの名前（解析結果から来たときは「解析結果に戻る」） */
  readonly exitLabel?: string;
}

const primary = 'w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white';
const secondary = 'w-full min-h-11 rounded-xl border border-current/40';

/** 足接地・リリースの指定 → 比較ビューア */
export function CompareFlow({ inputs, onExit, exitLabel = '最初に戻る' }: Props) {
  const [configs, setConfigs] = useState<PitchConfig[]>(() => inputs.map((i) => i.config));
  const [payload, setPayload] = useState<ViewerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compare = () => {
    const result = buildComparison(inputs.map((input, i) => ({ ...input, config: configs[i] })));
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setPayload(result.payload);
  };

  if (payload) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={secondary} onClick={() => setPayload(null)}>
            指定をやり直す
          </button>
          <button type="button" className={secondary} onClick={onExit}>
            {exitLabel}
          </button>
        </div>
        <ComparisonViewer payload={payload} />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <p className="text-sm">
        コマを送って、踏み出した足が地面に着いた瞬間を「足接地」、キャップが手から離れた瞬間を「リリース」に指定してください。
        指定しなくても比べられますが、「進行率」でのそろえ方は使えません。
      </p>
      {inputs.map((input, i) => (
        <EventMarker
          key={input.config.pitchId + i}
          input={{ ...input, config: configs[i] }}
          onChange={(next) => setConfigs((prev) => prev.map((c, k) => (k === i ? next : c)))}
        />
      ))}
      {error && (
        <p role="alert" className="rounded-xl border-2 border-red-500 p-3 text-sm">
          {error}
        </p>
      )}
      <button type="button" className={primary} onClick={compare}>
        比べる
      </button>
      <button type="button" className={secondary} onClick={onExit}>
        {exitLabel}
      </button>
    </section>
  );
}
