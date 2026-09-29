import type { SummaryItem, ViewerPayload } from '../analysis/payload';
import { COLORS } from './draw';
import { diffText } from './viewerMath';

/** 値と単位（出せなければ「—」） */
export function formatSummaryValue(item: SummaryItem): string {
  if (item.value === null) return '—';
  const number = item.value.toFixed(item.digits);
  return `${item.signed && item.value > 0 ? '+' : ''}${number}${item.unit}`;
}

function Cell({ item }: { readonly item: SummaryItem | null }) {
  if (!item) return <>—</>;
  return (
    <>
      <div>{formatSummaryValue(item)}</div>
      {item.text && <div className="text-xs">{item.text}</div>}
      {item.reason && <div className="text-xs opacity-70">{item.reason}</div>}
    </>
  );
}

/** 1本につき1つのまとめの値（打者のみ）。まとめが無ければ何も描かない */
export function SummaryTable({ payload }: { readonly payload: ViewerPayload }) {
  const pitches = payload.pitches;
  const heads = pitches.find((p) => p.summary && p.summary.length > 0)?.summary ?? [];
  if (heads.length === 0) return null;
  return (
    <table aria-label="まとめ" className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-current/20 text-left">
          <th className="py-1 font-normal opacity-70">まとめ</th>
          {[0, 1].map((i) => (
            <th key={i} className="py-1 text-right">
              {pitches[i] ? (
                <>
                  <span style={{ color: COLORS[i] }}>■</span> {pitches[i].display_name}
                </>
              ) : (
                '—'
              )}
            </th>
          ))}
          <th className="py-1 text-right font-normal opacity-70">差</th>
        </tr>
      </thead>
      <tbody>
        {heads.map((head) => {
          const items = [0, 1].map((i) => pitches[i]?.summary?.find((s) => s.key === head.key) ?? null);
          return (
            <tr key={head.key} className="border-b border-current/10 align-top">
              <td className="py-1 opacity-70">{head.label}</td>
              {items.map((item, i) => (
                <td key={i} className="py-1 text-right">
                  <Cell item={item} />
                </td>
              ))}
              <td className="py-1 text-right">{diffText(items.map((it) => it?.value ?? null), (v) => v.toFixed(head.digits))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
