import { Fragment, type ReactNode, useState } from 'react';

import type { ViewerPayload } from '../analysis/payload';
import { ComparisonViewer } from '../viewer/ComparisonViewer';

interface Props<C> {
  readonly initial: readonly C[];
  /** 指定画面の説明 */
  readonly intro: ReactNode;
  readonly renderMarker: (index: number, config: C, onChange: (next: C) => void) => ReactNode;
  readonly build: (configs: readonly C[]) => { payload: ViewerPayload } | { error: string };
  readonly onExit: () => void;
  readonly exitLabel: string;
}

const primary = 'w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white';
const secondary = 'w-full min-h-11 rounded-xl border border-current/40';

/** 瞬間の指定 → 比較ビューア（投手・打者で共通の段取り） */
export function CompareShell<C>({ initial, intro, renderMarker, build, onExit, exitLabel }: Props<C>) {
  const [configs, setConfigs] = useState<C[]>(() => [...initial]);
  const [payload, setPayload] = useState<ViewerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compare = () => {
    const result = build(configs);
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
      <p className="text-sm">{intro}</p>
      {configs.map((config, i) => (
        <Fragment key={i}>
          {renderMarker(i, config, (next) => setConfigs((prev) => prev.map((c, k) => (k === i ? next : c))))}
        </Fragment>
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
