import { render, screen, within } from '@testing-library/react';
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
