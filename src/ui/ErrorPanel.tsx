import type { FriendlyError } from '../content/errors';

export function ErrorPanel({ error, onRetry }: { readonly error: FriendlyError; readonly onRetry?: () => void }) {
  return (
    <section role="alert" className="space-y-1 rounded-xl border-2 border-red-500 p-3 text-sm">
      <p className="font-bold">{error.title}</p>
      <p>{error.action}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="w-full min-h-11 rounded-xl bg-cyan-600 font-bold text-white">
          もう一度試す
        </button>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-2">詳しい情報</summary>
        <pre className="whitespace-pre-wrap break-all text-xs">{error.detail}</pre>
      </details>
    </section>
  );
}
