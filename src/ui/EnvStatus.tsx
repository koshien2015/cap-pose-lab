import type { CapabilityReport } from '../inference/capabilities';
import type { Recommendation } from '../inference/recommend';

const MARK = { ok: '◎', limited: '△', unsupported: '×' } as const;

export function EnvStatus({
  report,
  rec,
  messages,
}: {
  readonly report: CapabilityReport | null;
  readonly rec: Recommendation | null;
  /** 画面ごとに文言を差し替えるとき（省略時は rec.messages） */
  readonly messages?: readonly string[];
}) {
  if (!report || !rec) return <p className="text-sm opacity-70">この端末で解析できるか確認しています…</p>;
  const lines = messages ?? rec.messages;
  return (
    <section className="rounded-xl border border-current/20 p-3 text-sm">
      <p className="font-bold">
        {MARK[rec.verdict]} {lines[0]}
      </p>
      {lines.slice(1).map((m) => (
        <p key={m}>{m}</p>
      ))}
      <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2">詳しい情報</summary>
        <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(report, null, 2)}</pre>
      </details>
    </section>
  );
}
