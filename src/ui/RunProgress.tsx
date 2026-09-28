export interface ProgressState {
  readonly label: string;
  readonly done: number;
  readonly total: number;
  readonly eta: string;
}

export function RunProgress({ state, onCancel }: { readonly state: ProgressState; readonly onCancel: () => void }) {
  const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <section className="space-y-3" aria-live="polite">
      <p className="font-bold">{state.label}</p>
      <progress className="h-3 w-full" value={percent} max={100} />
      <p className="text-sm">
        {percent}%{state.eta && `・残り ${state.eta}`}
      </p>
      <p className="text-sm opacity-80">解析中はこの画面のままにしてください。ほかのアプリに切り替えると止まります。</p>
      <button type="button" onClick={onCancel} className="w-full min-h-11 rounded-xl border border-current/40">
        中止する
      </button>
    </section>
  );
}
