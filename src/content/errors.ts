/**
 * 例外を「何が起きたか・次に何をすればよいか」の文言にする。技術的な内容は detail に回す。
 */

import { DownloadError } from '../inference/modelStore';

export interface FriendlyError {
  readonly title: string;
  readonly action: string;
  readonly detail: string;
}

const detailOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function friendlyError(error: unknown): FriendlyError {
  const detail = detailOf(error);
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { title: '解析を中止しました', action: 'もう一度「解析をはじめる」を押すと、最初からやり直せます', detail };
  }
  if (error instanceof DownloadError) {
    return {
      title: 'ダウンロードに失敗しました',
      action: '通信の良い場所（できれば Wi-Fi）で「もう一度試す」を押してください',
      detail,
    };
  }
  if (detail.includes('デコード') || detail.includes('MP4/MOV') || detail.includes('映像トラック')) {
    return {
      title: 'この動画は読み込めませんでした',
      action: 'iPhone なら「設定 > カメラ > フォーマット」を「互換性優先」にして撮り直すと読み込めることがあります',
      detail,
    };
  }
  if (detail.includes('セッションを作れません')) {
    return {
      title: '解析の準備に失敗しました',
      action: 'ほかのアプリやタブを閉じてから、「はやい」モードで試してください',
      detail,
    };
  }
  return {
    title: 'うまく解析できませんでした',
    action: 'ページを再読み込みしてもう一度試してください。続く場合は「詳しい情報」をコピーして問い合わせてください',
    detail,
  };
}
