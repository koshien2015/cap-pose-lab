import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PitchConfig } from '../analysis/analyzePitch';
import { loadFixture } from '../analysis/fixtures';
import { EventMarker } from './EventMarker';

const config: PitchConfig = {
  pitchId: 'a', label: '', throwingHand: 'right', batterDirection: 'left',
  fps: 60, footContactFrame: null, releaseFrame: null,
};

describe('EventMarker', () => {
  it('表示中のコマを足接地・リリースに指定でき、順番が逆なら理由を出す', async () => {
    const f = loadFixture('no_events');
    const onChange = vi.fn();
    const { rerender } = render(<EventMarker input={{ json: f.input, thumbnails: null, thumbStride: 1, config }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'このコマをリリースにする' }));
    const next = onChange.mock.calls.at(-1)?.[0] as PitchConfig;
    expect(next.releaseFrame).toBe(f.input.frames[0].frame_index);
    rerender(<EventMarker input={{ json: f.input, thumbnails: null, thumbStride: 1, config: next }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '次のコマ' }));
    await userEvent.click(screen.getByRole('button', { name: 'このコマを足接地にする' }));
    expect(screen.getByText(/リリースは足接地より後/)).toBeInTheDocument();
  });

  it('縮小画像が間引かれていても、1コマずつ送れる', async () => {
    const f = loadFixture('no_events');
    const thumbs = Array.from({ length: 20 }, () => ({ width: 10, height: 10, close: () => undefined }) as unknown as ImageBitmap);
    render(<EventMarker input={{ json: f.input, thumbnails: thumbs, thumbStride: 2, config }} onChange={() => undefined} />);
    const first = f.input.frames[0].frame_index;
    await userEvent.click(screen.getByRole('button', { name: '次のコマ' }));
    expect(screen.getByText(`コマ ${first + 1}`)).toBeInTheDocument();
  });

  it('投げ腕と打者の向きを切り替えられる', async () => {
    const f = loadFixture('no_events');
    const onChange = vi.fn();
    render(<EventMarker input={{ json: f.input, thumbnails: null, thumbStride: 1, config }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '左投げ' }));
    expect((onChange.mock.calls.at(-1)?.[0] as PitchConfig).throwingHand).toBe('left');
    await userEvent.click(screen.getByRole('radio', { name: '打者は画面の右' }));
    expect((onChange.mock.calls.at(-1)?.[0] as PitchConfig).batterDirection).toBe('right');
  });
});
