import type { Presentation } from './presentation';
import { jointLabel, type SyncMode, type VectorMode } from './viewerMath';

export interface Settings {
  readonly sync: SyncMode;
  readonly vector: VectorMode;
  readonly target: string;
  readonly layout: 'side' | 'overlay';
  readonly arrowScale: number;
  readonly trail: boolean;
  readonly speed: number;
}

interface Props {
  readonly settings: Settings;
  readonly onChange: (next: Settings) => void;
  readonly joints: readonly string[];
  readonly progressAvailable: boolean;
  readonly presentation: Presentation;
}

const selectClass = 'min-h-11 w-full rounded-lg border border-current/30 bg-transparent px-2';

function Field({ id, label, children }: { readonly id: string; readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs opacity-70">
        {label}
      </label>
      {children}
    </div>
  );
}

export function ViewerSettings({ settings, onChange, joints, progressAvailable, presentation }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <Field id="sync" label="そろえ方">
        <select id="sync" className={selectClass} value={settings.sync} onChange={(e) => set('sync', e.target.value as SyncMode)}>
          <option value="progress" disabled={!progressAvailable}>
            進行率（{presentation.progressLabel}）
          </option>
          <option value="release">{presentation.anchorLabel}に合わせる</option>
          <option value="frame">コマ番号</option>
        </select>
      </Field>
      <Field id="layout" label="表示">
        <select id="layout" className={selectClass} value={settings.layout} onChange={(e) => set('layout', e.target.value as Settings['layout'])}>
          <option value="side">並べて</option>
          <option value="overlay">重ねて</option>
        </select>
      </Field>
      <Field id="vector" label="矢印">
        <select id="vector" className={selectClass} value={settings.vector} onChange={(e) => set('vector', e.target.value as VectorMode)}>
          <option value="none">なし</option>
          <option value="velocity">速度</option>
          <option value="accel">加速度（力の向き）</option>
        </select>
      </Field>
      <Field id="target" label="矢印を出す場所">
        <select id="target" className={selectClass} value={settings.target} onChange={(e) => set('target', e.target.value)}>
          <option value="__arm__">{presentation.armLabel}</option>
          <option value="__all__">全身</option>
          {joints.map((j) => (
            <option key={j} value={j}>
              {jointLabel(j)}
            </option>
          ))}
        </select>
      </Field>
      <Field id="speed" label="再生の速さ">
        <select id="speed" className={selectClass} value={settings.speed} onChange={(e) => set('speed', Number(e.target.value))}>
          <option value={0.25}>0.25 倍</option>
          <option value={0.5}>0.5 倍</option>
          <option value={1}>等倍</option>
        </select>
      </Field>
      <Field id="scale" label="矢印の長さ">
        <input
          id="scale"
          type="range"
          min={0.1}
          max={3}
          step={0.05}
          value={settings.arrowScale}
          onChange={(e) => set('arrowScale', Number(e.target.value))}
          className="h-11 w-full"
        />
      </Field>
      <label className="col-span-2 flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={settings.trail} onChange={(e) => set('trail', e.target.checked)} />
        {presentation.trailLabel}
      </label>
      {!progressAvailable && (
        <p className="col-span-2 text-xs opacity-80">{presentation.progressHint}</p>
      )}
    </div>
  );
}
