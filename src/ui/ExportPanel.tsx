interface Item {
  readonly fileName: string;
  readonly onSave: () => void;
}

export function ExportPanel({ items }: { readonly items: readonly Item[] }) {
  return (
    <section className="space-y-2">
      <p className="font-bold">解析結果を保存する</p>
      {items.map((i) => (
        <button
          key={i.fileName}
          type="button"
          onClick={i.onSave}
          className="block w-full min-h-11 rounded-xl bg-cyan-600 px-4 font-bold text-white break-all"
        >
          {i.fileName} を保存
        </button>
      ))}
      <p className="text-sm opacity-80">フォームの比較画面は準備中です。保存したファイルは、あとで比較に使えます。</p>
    </section>
  );
}
