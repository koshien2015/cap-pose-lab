import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SwingConfig } from '../batting/analyzeSwing';
import { syntheticSwing } from '../batting/syntheticSwing';
import { SwingMarker } from './SwingMarker';

const json = syntheticSwing({ bats: 'right' });
const config: SwingConfig = { swingId: 'a', label: '', bats: 'right', fps: 60, topFrame: null, impactFrame: null };

describe('SwingMarker', () => {
  it('表示中のコマをトップ・インパクトに指定でき、順番が逆なら理由を出す', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<SwingMarker input={{ json, thumbnails: null, thumbStride: 1, config }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '次のコマ' }));
    await userEvent.click(screen.getByRole('button', { name: 'このコマをトップにする' }));
    const next = onChange.mock.calls.at(-1)?.[0] as SwingConfig;
    expect(next.topFrame).toBe(1);
    rerender(<SwingMarker input={{ json, thumbnails: null, thumbStride: 1, config: next }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '前のコマ' }));
    await userEvent.click(screen.getByRole('button', { name: 'このコマをインパクトにする' }));
    expect(screen.getByText(/インパクトはトップより後/)).toBeInTheDocument();
  });

  it('打ち方を切り替えられる', async () => {
    const onChange = vi.fn();
    render(<SwingMarker input={{ json, thumbnails: null, thumbStride: 1, config }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '左打ち' }));
    expect((onChange.mock.calls.at(-1)?.[0] as SwingConfig).bats).toBe('left');
  });

  it('指定を取り消せる', async () => {
    const onChange = vi.fn();
    render(<SwingMarker input={{ json, thumbnails: null, thumbStride: 1, config: { ...config, impactFrame: 3 } }} onChange={onChange} />);
    expect(screen.getByText(/インパクト: 3/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'インパクトを取り消す' }));
    expect((onChange.mock.calls.at(-1)?.[0] as SwingConfig).impactFrame).toBeNull();
  });
});
