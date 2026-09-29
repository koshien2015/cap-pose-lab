import { useState } from 'react';

import type { PoseJsonInput, Subject } from '../analysis/types';
import { parsePoseFile } from '../flow/compare';

interface Props {
  readonly onLoad: (files: { name: string; json: PoseJsonInput }[]) => void;
  readonly subject: Subject;
}

/** 以前このサイトで保存した _pose.json を読み込む（最大2つ） */
export function PoseFileLoader({ onLoad, subject }: Props) {
  const [problems, setProblems] = useState<string[]>([]);

  const onPick = async (files: File[]) => {
    const results = await Promise.all(
      files.slice(0, 2).map(async (file) => {
        try {
          return { name: file.name, json: parsePoseFile(await file.text(), subject) };
        } catch (error) {
          return { name: file.name, problem: error instanceof Error ? error.message : String(error) };
        }
      }),
    );
    setProblems(results.flatMap((r) => ('problem' in r ? [`${r.name}: ${r.problem}`] : [])));
    const ok = results.filter((r): r is { name: string; json: PoseJsonInput } => 'json' in r);
    if (ok.length > 0 && ok.length === results.length) onLoad(ok);
  };

  return (
    <section className="space-y-2">
      <label className="block w-full min-h-11 cursor-pointer rounded-xl border-2 border-dashed border-current/40 p-4 text-center">
        保存した解析結果（_pose.json）を選ぶ（1つ または 2つ）
        <input type="file" accept=".json,application/json" multiple className="sr-only" onChange={(e) => onPick(Array.from(e.target.files ?? []))} />
      </label>
      {problems.map((p) => (
        <p key={p} className="text-sm text-red-600 break-all">
          {p}
        </p>
      ))}
    </section>
  );
}
