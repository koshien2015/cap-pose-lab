import type { PitchConfig } from '../analysis/analyzePitch';
import { buildComparison, type CompareInput } from '../flow/compare';
import { CompareShell } from './CompareShell';
import { EventMarker } from './EventMarker';

interface Props {
  readonly inputs: readonly CompareInput[];
  readonly onExit: () => void;
  /** 戻るボタンの名前（解析結果から来たときは「解析結果に戻る」） */
  readonly exitLabel?: string;
}

/** 足接地・リリースの指定 → 比較ビューア */
export function CompareFlow({ inputs, onExit, exitLabel = '最初に戻る' }: Props) {
  return (
    <CompareShell<PitchConfig>
      initial={inputs.map((i) => i.config)}
      intro={
        <>
          コマを送って、踏み出した足が地面に着いた瞬間を「足接地」、キャップが手から離れた瞬間を「リリース」に指定してください。
          指定しなくても比べられますが、「進行率」でのそろえ方は使えません。
        </>
      }
      renderMarker={(i, config, onChange) => <EventMarker input={{ ...inputs[i], config }} onChange={onChange} />}
      build={(configs) => buildComparison(inputs.map((input, i) => ({ ...input, config: configs[i] })))}
      onExit={onExit}
      exitLabel={exitLabel}
    />
  );
}
