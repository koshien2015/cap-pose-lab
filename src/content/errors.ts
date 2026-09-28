/**
 * 例外を「何が起きたか・次に何をすればよいか」の文言にする。技術的な内容は detail に回す。
 */

import { DownloadError } from '../inference/modelStore';

export interface FriendlyError {
  readonly title: string;
  readonly action: string;
  readonly detail: string;
  /** 同じ操作をもう一度試せば直る見込みがある（「もう一度試す」ボタンを出す） */
  readonly retryable: boolean;
}

const detailOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function friendlyError(error: unknown): FriendlyError {
  const detail = detailOf(error);
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { title: '解析を中止しました', action: '「次へ」から、もう一度解析をはじめられます', detail, retryable: false };
  }
  if (error instanceof DownloadError) {
    return {
      title: 'ダウンロードに失敗しました',
      action: '通信の良い場所（できれば Wi-Fi）で「もう一度試す」を押してください',
      detail,
      retryable: true,
    };
  }
  if (detail.includes('デコード') || detail.includes('MP4/MOV') || detail.includes('映像トラック')) {
    return {
      title: 'この動画は読み込めませんでした',
      action: 'iPhone なら「設定 > カメラ > フォーマット」を「互換性優先」にして撮り直すと読み込めることがあります',
      detail,
      retryable: false,
    };
  }
  if (detail.includes('セッションを作れません')) {
    return {
      title: '解析の準備に失敗しました',
      action: 'メモリが足りない可能性があります。ほかのアプリやタブを閉じてから「もう一度試す」を押してください',
      detail,
      retryable: true,
    };
  }
  return {
    title: 'うまく解析できませんでした',
    action: '「もう一度試す」を押してください。続く場合は「詳しい情報」をコピーして問い合わせてください',
    detail,
    retryable: true,
  };
}
