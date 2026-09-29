import type { SwingConfig } from '../batting/analyzeSwing';
import { buildSwingComparison, type SwingCompareInput } from '../flow/swingCompare';
import { CompareShell } from './CompareShell';
import { SwingMarker } from './SwingMarker';

interface Props {
  readonly inputs: readonly SwingCompareInput[];
  readonly onExit: () => void;
  readonly exitLabel?: string;
}

const INTRO =
  'コマを送って、手が一番捕手側に来た瞬間を「トップ」、キャップを打った（空振りなら打つはずだった）瞬間を「インパクト」に指定してください。' +
  'インパクトを指定すると2本をその瞬間でそろえられ、トップも指定すると「進行率」でもそろえられます。' +
  '指定しなくても、比較画面で2本目をずらして合わせられます。';

/** トップ・インパクトの指定 → 比較ビューア（打者） */
export function SwingCompareFlow({ inputs, onExit, exitLabel = '最初に戻る' }: Props) {
  return (
    <CompareShell<SwingConfig>
      initial={inputs.map((i) => i.config)}
      intro={INTRO}
      renderMarker={(i, config, onChange) => <SwingMarker input={{ ...inputs[i], config }} onChange={onChange} />}
      build={(configs) => buildSwingComparison(inputs.map((input, i) => ({ ...input, config: configs[i] })))}
      onExit={onExit}
      exitLabel={exitLabel}
    />
  );
}
