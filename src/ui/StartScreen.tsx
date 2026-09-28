export function StartScreen({ onStart }: { readonly onStart: () => void }) {
  return (
    <section className="space-y-4">
      <p>スマホで撮った投球動画から、投手の体の動き（骨格）を取り出します。</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>動画はこの端末の中だけで解析します。どこにも送信しません</li>
        <li>投手の真横から、全身が入るように撮った数秒の動画が向いています</li>
        <li>2本選ぶと、あとでフォームを比べられます</li>
      </ul>
      <button type="button" onClick={onStart} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
        はじめる
      </button>
    </section>
  );
}
