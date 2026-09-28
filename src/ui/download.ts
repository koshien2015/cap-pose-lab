/** 保存が始まる前に URL を破棄すると iOS Safari で保存に失敗するため、しばらく待ってから破棄する */
const REVOKE_DELAY_MS = 60_000;

/** JSON をファイルとして保存させる（iOS Safari では「ファイル」アプリに保存される）。 */
export function downloadJson(fileName: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
