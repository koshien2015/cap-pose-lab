import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { syntheticSwing } from '../batting/syntheticSwing';
import type { SwingCompareInput } from '../flow/swingCompare';
import { SwingCompareFlow } from './SwingCompareFlow';

const input = (swingId: string, impactFrame: number | null): SwingCompareInput => ({
  json: syntheticSwing({ bats: 'right' }),
  thumbnails: null,
  thumbStride: 1,
  config: { swingId, label: '', bats: 'right', fps: 60, topFrame: null, impactFrame },
});

describe('SwingCompareFlow', () => {
  it('トップとインパクトの説明を出し、「比べる」で打者の比較画面に進む', async () => {
    render(<SwingCompareFlow inputs={[input('a', 40), input('b', 42)]} onExit={() => undefined} />);
    expect(screen.getByText(/「トップ」/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '比べる' }));
    expect(screen.getByRole('option', { name: 'インパクトに合わせる' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'まとめ' })).toBeInTheDocument();
    expect(screen.getByText('開きの時間差')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '指定をやり直す' }));
    expect(screen.getByRole('button', { name: '比べる' })).toBeInTheDocument();
  });

  it('比べられないときは画面内に理由を出す', async () => {
    const all = Array.from({ length: 60 }, (_, i) => i);
    const broken: SwingCompareInput = {
      ...input('a', null),
      json: syntheticSwing({ bats: 'right', missing: [{ name: 'left_hip', frames: all }, { name: 'right_hip', frames: all }] }),
    };
    render(<SwingCompareFlow inputs={[broken]} onExit={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: '比べる' }));
    expect(screen.getByRole('alert')).toHaveTextContent('打者の上半身と腰');
  });
});
