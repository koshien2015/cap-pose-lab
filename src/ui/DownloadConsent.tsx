export interface DownloadItem {
  readonly label: string;
  readonly sizeMB: number;
}

interface Props {
  readonly items: readonly DownloadItem[];
  readonly onAccept: () => void;
  readonly onCancel: () => void;
}

export function DownloadConsent({ items, onAccept, onCancel }: Props) {
  const total = items.reduce((s, i) => s + i.sizeMB, 0);
  return (
    <section role="alertdialog" aria-label="ダウンロードの確認" className="space-y-3 rounded-xl border-2 border-amber-500 p-4">
      {items.length === 0 ? (
        <p>必要なデータはこの端末に保存済みです。すぐに解析できます。</p>
      ) : (
        <>
          <p className="font-bold">解析のために、約 {Math.round(total)} MB をダウンロードします</p>
          <ul className="list-disc pl-5 text-sm">
            {items.map((i) => (
              <li key={i.label}>
                {i.label}（約 {Math.round(i.sizeMB)} MB）
              </li>
            ))}
          </ul>
          <p className="text-sm">Wi-Fi での利用をおすすめします。一度ダウンロードすると、次からは不要です。</p>
        </>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onAccept} className="flex-1 min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
          解析をはじめる
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-current/40 px-4">
          やめる
        </button>
      </div>
    </section>
  );
}
