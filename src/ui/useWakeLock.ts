import { useEffect } from 'react';

/** active の間、画面が消えないようにする（対応していない端末では何もしない）。 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    navigator.wakeLock.request('screen').then(
      (s) => {
        sentinel = s;
      },
      () => undefined,
    );
    return () => {
      sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
