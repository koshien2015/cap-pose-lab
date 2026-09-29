import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import pair from '../analysis/__fixtures__/pair.json';
import { loadFixture } from '../analysis/fixtures';
import type { ViewerPayload } from '../analysis/payload';
import { ComparisonViewer } from './ComparisonViewer';

const payload = pair.payload as unknown as ViewerPayload;

describe('ComparisonViewer', () => {
  it('2投球の数値パネルを出し、コマ送りでカーソルが進む', async () => {
    render(<ComparisonViewer payload={payload} />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('肘角度')).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'コマ' }) as HTMLInputElement;
    const before = Number(slider.value);
    await userEvent.click(screen.getByRole('button', { name: '次のコマ' }));
    expect(Number(slider.value)).toBe(before + 1);
  });

  it('そろえ方を切り替えられる', async () => {
    render(<ComparisonViewer payload={payload} />);
    const select = screen.getByRole('combobox', { name: 'そろえ方' }) as HTMLSelectElement;
    await userEvent.selectOptions(select, 'release');
    expect(select.value).toBe('release');
  });

  it('足接地・リリースが無い投球では「進行率」を選べず、理由を出す', () => {
    const noEvents = loadFixture('no_events').expected.payload as unknown as ViewerPayload;
    render(<ComparisonViewer payload={noEvents} />);
    const option = screen.getByRole('option', { name: /進行率/ }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect(screen.getByText(/足接地とリリースを指定すると/)).toBeInTheDocument();
  });

  it('読み方の説明を折りたたみで出す（矢印は力そのものではない）', () => {
    render(<ComparisonViewer payload={payload} />);
    expect(screen.getByText('読み方')).toBeInTheDocument();
    expect(screen.getByText(/力そのものではありません/)).toBeInTheDocument();
  });
});

describe('ComparisonViewer のコマ送り', () => {
  it('「次のコマ」を続けて押すと、押した回数だけ進む', async () => {
    render(<ComparisonViewer payload={payload} />);
    const slider = screen.getByRole('slider', { name: 'コマ' }) as HTMLInputElement;
    const before = Number(slider.value);
    const next = screen.getByRole('button', { name: '次のコマ' });
    next.click();
    next.click();
    next.click();
    await screen.findByRole('slider', { name: 'コマ' });
    expect(Number(slider.value)).toBe(before + 3);
  });
});

const batterLike: ViewerPayload = {
  ...payload,
  anchor_label: 'インパクト',
  progress_label: 'トップ→インパクト',
  progress_hint: '「進行率」は、トップとインパクトを指定すると選べます。',
  event_labels: { release: 'インパクト' },
  arm_label: '両手',
  trail_label: '手の通り道を表示する',
  reading_notes: ['座標は胴の長さを 1 とした値です。'],
};

describe('ComparisonViewer の文言', () => {
  it('比較用データに書かれた文言で表示する（打者）', () => {
    render(<ComparisonViewer payload={batterLike} />);
    expect(screen.getByRole('option', { name: 'インパクトに合わせる' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '進行率（トップ→インパクト）' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '両手' })).toBeInTheDocument();
    expect(screen.getByText('手の通り道を表示する')).toBeInTheDocument();
    expect(screen.getByText('座標は胴の長さを 1 とした値です。')).toBeInTheDocument();
    expect(screen.getByText(/力そのものではありません/)).toBeInTheDocument();
  });

  it('書かれていなければ投手の文言のまま', () => {
    render(<ComparisonViewer payload={payload} />);
    expect(screen.getByRole('option', { name: 'リリースに合わせる' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '投げる腕' })).toBeInTheDocument();
    expect(screen.getByText('腕の通り道を表示する')).toBeInTheDocument();
  });
});

describe('2本目をずらす', () => {
  const frameRow = () => within(screen.getAllByRole('table').at(-1)!).getByText('フレーム').closest('tr')!;

  it('ボタンで1コマずつずらせて、0に戻せる。2本目の表示コマも変わる', async () => {
    render(<ComparisonViewer payload={payload} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'そろえ方' }), 'frame');
    const second = () => frameRow().querySelectorAll('td')[2].textContent;
    expect(second()).toBe(String(payload.pitches[1].frames[0].f));
    await userEvent.click(screen.getByRole('button', { name: '2本目を1コマ後ろへ' }));
    expect(screen.getByText('+1 コマ')).toBeInTheDocument();
    expect(second()).toBe('—');
    await userEvent.click(screen.getByRole('button', { name: '0に戻す' }));
    expect(screen.getByText('0 コマ')).toBeInTheDocument();
    expect(second()).toBe(String(payload.pitches[1].frames[0].f));
  });

  it('範囲の端より先へはずらさない', async () => {
    render(<ComparisonViewer payload={payload} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'そろえ方' }), 'frame');
    const limit = Math.max(...payload.pitches.map((p) => p.frames.length));
    fireEvent.change(screen.getByRole('slider', { name: '2本目のずれ' }), { target: { value: String(limit) } });
    await userEvent.click(screen.getByRole('button', { name: '2本目を1コマ後ろへ' }));
    expect(screen.getByText(`+${limit} コマ`)).toBeInTheDocument();
  });

  it('進行率でそろえているときは出さない', () => {
    render(<ComparisonViewer payload={payload} />);
    expect(screen.queryByRole('button', { name: '2本目を1コマ後ろへ' })).toBeNull();
  });

  it('1本だけのときは出さない', () => {
    const one = loadFixture('no_events').expected.payload as unknown as ViewerPayload;
    render(<ComparisonViewer payload={one} />);
    expect(screen.queryByRole('button', { name: '2本目を1コマ後ろへ' })).toBeNull();
  });
});
