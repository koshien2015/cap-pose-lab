import type { ViewerPayload } from '../analysis/payload';
import { COLORS } from './draw';
import { diffText, formatMagnitude, formatNumber, pitchCursor, realIndex, targetNames, vectorAt, type ViewState } from './viewerMath';

interface Props {
  readonly payload: ViewerPayload;
  readonly cursor: number;
  readonly state: ViewState;
  readonly joints: readonly string[];
}

/** その時点の数値（2球目が無いときも B 列は空けておく。列がずれると別の投球の値に見えるため） */
export function ReadoutTable({ payload, cursor, state, joints }: Props) {
  const pitches = payload.pitches;
  const positions = pitches.map((p, i) => realIndex(p, pitchCursor(cursor, i, state), state));
  const rows: [string, string, string, string][] = [];
  const pad = (values: string[]) => [values[0] ?? '—', values[1] ?? '—'] as const;

  rows.push(['フレーム', ...pad(pitches.map((p, i) => (positions[i] === null ? '—' : String(p.frames[positions[i]!].f)))), '']);
  rows.push([
    '進行率 %',
    ...pad(pitches.map((p, i) => (positions[i] === null || p.frames[positions[i]!].p === null ? '—' : formatNumber(p.frames[positions[i]!].p, 1)))),
    '',
  ]);
  Object.entries(payload.panel_series).forEach(([key, label]) => {
    const values = pitches.map((p, i) => {
      const index = positions[i];
      const series = p.series[key];
      return index === null || !series ? null : (series[index] ?? null);
    });
    rows.push([label, ...pad(values.map((v) => formatNumber(v))), diffText(values)]);
  });
  if (state.vector !== 'none') {
    const unit = state.sync === 'progress' ? '/1%' : '/秒';
    const magnitudes = pitches.map((p, i) => {
      const vectors = targetNames(p, state, joints)
        .map((name) => vectorAt(p, pitchCursor(cursor, i, state), name, state))
        .filter((v): v is [number, number] => v !== null);
      return vectors.length ? Math.max(...vectors.map(([x, y]) => Math.hypot(x, y))) : null;
    });
    const suffix = state.vector === 'accel' ? `身体長${unit}²` : `身体長${unit}`;
    rows.push([
      `最大 ${state.vector === 'accel' ? '加速度' : '速度'}（${suffix}）`,
      ...pad(magnitudes.map(formatMagnitude)),
      diffText(magnitudes, formatMagnitude),
    ]);
  }

  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b border-current/20 text-left">
          <th className="py-1 font-normal opacity-70">項目</th>
          <th className="py-1 text-right">
            {/* 骨格の色は暗い背景向けなので、明るい背景でも読めるよう色は印だけに付ける */}
            <span style={{ color: COLORS[0] }}>■</span> {pitches[0].display_name}
          </th>
          <th className="py-1 text-right">
            {pitches[1] ? (
              <>
                <span style={{ color: COLORS[1] }}>■</span> {pitches[1].display_name}
              </>
            ) : (
              '—'
            )}
          </th>
          <th className="py-1 text-right font-normal opacity-70">差</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([head, a, b, diff]) => (
          <tr key={head} className="border-b border-current/10">
            <td className="py-1 opacity-70">{head}</td>
            <td className="py-1 text-right">{a}</td>
            <td className="py-1 text-right">{b}</td>
            <td className="py-1 text-right">{diff}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
