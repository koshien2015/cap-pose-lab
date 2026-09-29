import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import pair from '../analysis/__fixtures__/pair.json';
import type { SummaryItem, ViewerPayload } from '../analysis/payload';
import { SummaryTable } from './SummaryTable';
import { formatSummaryValue } from './viewerMath';

const base = pair.payload as unknown as ViewerPayload;
const lag = (value: number | null, reason: string | null = null): SummaryItem => ({
  key: 'open_lag_ms', label: '開きの時間差', unit: ' ms', digits: 0, signed: true, value, text: value === null ? null : '腰が先', reason,
});
const head = (value: number | null): SummaryItem => ({
  key: 'head_max_move', label: '頭の最大移動（胴の長さ）', unit: '', digits: 2, signed: false, value, text: null,
  reason: value === null ? 'インパクトを指定すると出ます' : null,
});
const withSummary = (a: SummaryItem[], b: SummaryItem[]): ViewerPayload => ({
  ...base,
  pitches: [{ ...base.pitches[0], summary: a }, { ...base.pitches[1], summary: b }],
});

describe('SummaryTable', () => {
  it('まとめの値を1本目・2本目・差で並べる', () => {
    render(<SummaryTable payload={withSummary([lag(100), head(0.12)], [lag(60), head(0.05)])} />);
    const row = within(screen.getByRole('table', { name: 'まとめ' })).getByText('開きの時間差').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[1].textContent).toContain('+100 ms');
    expect(cells[1].textContent).toContain('腰が先');
    expect(cells[2].textContent).toContain('+60 ms');
    expect(cells[3].textContent).toBe('+40');
  });

  it('出せない値は「—」と理由を出し、差は空ける', () => {
    render(<SummaryTable payload={withSummary([lag(100), head(null)], [lag(60), head(0.05)])} />);
    const row = screen.getByText('頭の最大移動（胴の長さ）').closest('tr')!;
    const cells = row.querySelectorAll('td');
    expect(cells[1].textContent).toContain('—');
    expect(cells[1].textContent).toContain('インパクトを指定すると出ます');
    expect(cells[3].textContent).toBe('');
  });

  it('まとめの無い比較用データ（投手）では何も出さない', () => {
    const { container } = render(<SummaryTable payload={base} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('数値の書式（符号・桁・単位）', () => {
    expect(formatSummaryValue(lag(-35))).toBe('-35 ms');
    expect(formatSummaryValue(head(0.123))).toBe('0.12');
    expect(formatSummaryValue(lag(null))).toBe('—');
  });
});
