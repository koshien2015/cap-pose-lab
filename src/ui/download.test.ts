import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadJson } from './download';

describe('downloadJson', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('保存を始めたあと、URL をすぐには破棄しない（iOS Safari で保存に失敗しないように）', () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    downloadJson('a_pose.json', { a: 1 });
    expect(click).toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});
