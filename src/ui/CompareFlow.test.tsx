import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { loadFixture } from '../analysis/fixtures';
import type { CompareInput } from '../flow/compare';
import { CompareFlow } from './CompareFlow';

const inputOf = (name: string): CompareInput => {
  const f = loadFixture(name);
  return {
    json: f.input,
    thumbnails: null,
    thumbStride: 1,
    config: {
      pitchId: name, label: '', throwingHand: f.config.throwing_hand, batterDirection: f.config.batter_direction,
      fps: f.config.fps, footContactFrame: f.config.foot_contact_frame, releaseFrame: f.config.release_frame,
    },
  };
};

describe('CompareFlow', () => {
  it('指定画面から「比べる」でビューアに進み、「指定をやり直す」で戻れる', async () => {
    render(<CompareFlow inputs={[inputOf('clean_right'), inputOf('fps30')]} onExit={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: '比べる' }));
    expect(screen.getByRole('slider', { name: 'コマ' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '指定をやり直す' }));
    expect(screen.getByRole('button', { name: '比べる' })).toBeInTheDocument();
  });

  it('戻り先のボタン名を指定できる（解析結果から来たときは解析結果に戻る）', async () => {
    let exited = false;
    render(<CompareFlow inputs={[inputOf('clean_right')]} exitLabel="解析結果に戻る" onExit={() => (exited = true)} />);
    await userEvent.click(screen.getByRole('button', { name: '解析結果に戻る' }));
    expect(exited).toBe(true);
  });

  it('比べられないときは画面内に理由を出す', async () => {
    render(<CompareFlow inputs={[inputOf('no_shoulders')]} onExit={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: '比べる' }));
    expect(screen.getByRole('alert')).toHaveTextContent('肩');
  });
});
