"""Python 版（pitching/）を実行して、TS 移植の数値一致テスト用 fixture を書き出す。

    PITCHING_ROOT=<ultralytics のフォーク> python tools/make_fixtures.py

入力は合成データ（pitching/examples/generate_sample_pose.py の姿勢）だけを使う。
実在の人物の動画から作った座標は公開リポジトリに入れない。
"""

from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import replace
from pathlib import Path

ROOT = os.environ.get("PITCHING_ROOT")
if not ROOT:
    sys.exit("PITCHING_ROOT に pitching/ の親ディレクトリ（ultralytics のフォーク）を指定してください")
sys.path.insert(0, ROOT)
sys.path.insert(0, str(Path(ROOT) / "pitching" / "examples"))

import numpy as np  # noqa: E402
from scipy.signal import savgol_filter  # noqa: E402

from generate_sample_pose import build_series  # noqa: E402
from pitching.analysis import analyze_pitch  # noqa: E402
from pitching.config import EventConfig, PitchConfig  # noqa: E402
from pitching.models import Keypoint, PoseFrame, PoseSeries  # noqa: E402
from pitching.visualization.viewer import ViewerError, build_payload  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "src" / "analysis" / "__fixtures__"
PANEL = (
    "elbow_angle_deg",
    "elbow_extension_velocity_deg_per_sec",
    "forearm_angle_deg",
    "lead_knee_angle_deg",
    "trunk_lean_deg",
)
CONTACT, RELEASE = 112, 130


def num(value):
    value = float(value)
    return None if not math.isfinite(value) else value


def pose_json(series: PoseSeries) -> dict:
    return {
        "schema_version": 1,
        "meta": {
            "pitch_id": series.pitch_id,
            "fps": series.fps,
            "video_path": "",
            "adapter": "synthetic",
            "notes": [],
        },
        "frames": [
            {
                "frame_index": f.frame_index,
                "timestamp_sec": f.timestamp_sec,
                "keypoints": {n: [num(k.x), num(k.y), k.confidence] for n, k in f.keypoints.items()},
            }
            for f in series.frames
        ],
    }


def with_keypoints(series: PoseSeries, edit) -> PoseSeries:
    frames = [
        replace(f, keypoints=edit(position, dict(f.keypoints)))
        for position, f in enumerate(series.frames)
    ]
    return replace(series, frames=frames)


def noisy_gaps() -> PoseSeries:
    rng = np.random.default_rng(7)
    base = build_series("noisy_gaps")

    def edit(position, kps):
        out = {n: Keypoint(k.x + rng.normal(0, 1.5), k.y + rng.normal(0, 1.5), k.confidence) for n, k in kps.items()}
        if 10 <= position <= 12:
            k = out["right_elbow"]
            out["right_elbow"] = Keypoint(k.x, k.y, 0.2)
        if 20 <= position <= 25:
            out["left_knee"] = Keypoint.missing()
        if position < 2:
            out["right_wrist"] = Keypoint.missing()
        return out

    return with_keypoints(base, edit)


def left_mirror() -> PoseSeries:
    def swap(name: str) -> str:
        if name.startswith("left_"):
            return "right_" + name[5:]
        if name.startswith("right_"):
            return "left_" + name[6:]
        return name

    def edit(_position, kps):
        return {swap(n): Keypoint(1000.0 - k.x, k.y, k.confidence) for n, k in kps.items()}

    return replace(with_keypoints(build_series("left_mirror"), edit), pitch_id="left_mirror")


def no_shoulders() -> PoseSeries:
    def edit(_position, kps):
        out = dict(kps)
        for name in ("left_shoulder", "right_shoulder"):
            k = out[name]
            out[name] = Keypoint(k.x, k.y, 0.1)
        return out

    return replace(with_keypoints(build_series("no_shoulders"), edit), pitch_id="no_shoulders")


def fps30() -> PoseSeries:
    base = build_series("fps30")
    frames = [
        replace(f, frame_index=100 + k, timestamp_sec=(100 + k) / 30.0)
        for k, f in enumerate(base.frames[::2])
    ]
    return replace(base, frames=frames, fps=30.0, pitch_id="fps30")


def config(pitch_id, hand="right", batter="left", fps=60.0, contact=CONTACT, release=RELEASE) -> PitchConfig:
    return PitchConfig(
        pitch_id=pitch_id,
        throwing_hand=hand,
        batter_direction=batter,
        fps=fps,
        events=EventConfig(stride_foot_contact_frame=contact, release_frame=release),
    )


def config_json(c: PitchConfig) -> dict:
    return {
        "pitch_id": c.pitch_id,
        "throwing_hand": c.throwing_hand.value,
        "batter_direction": c.batter_direction.value,
        "fps": c.fps,
        "foot_contact_frame": c.events.stride_foot_contact_frame,
        "release_frame": c.events.release_frame,
    }


def expected(series: PoseSeries, c: PitchConfig) -> dict:
    a = analyze_pitch(series, c)
    smoothed = {}
    for name in a.smoothed_series.frames[0].keypoints:
        smoothed[name] = [
            None if not f.keypoints[name].is_valid else [f.keypoints[name].x, f.keypoints[name].y]
            for f in a.smoothed_series.frames
        ]
    try:
        payload = build_payload([a])
    except ViewerError as error:
        payload = {"error": str(error)}
    return {
        "frame_indices": [int(v) for v in a.frame_indices],
        "scale_px": a.quality["body_scale"].get("scale_px"),
        "smoothed": smoothed,
        "series": {k: [num(v) for v in a.series[k]] for k in PANEL},
        "events": {name.value: event.frame_index for name, event in a.events.items()},
        "progress": [num(v) for v in a.progress_percent],
        "payload": payload,
    }


def write(name: str, data) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print("wrote", name)


def main() -> int:
    cases = {
        "clean_right": (replace(build_series("clean_right"), pitch_id="clean_right"), config("clean_right")),
        "noisy_gaps": (noisy_gaps(), config("noisy_gaps")),
        "left_mirror": (left_mirror(), config("left_mirror", hand="left", batter="right")),
        "no_events": (replace(build_series("no_events"), pitch_id="no_events"), config("no_events", contact=None, release=None)),
        "release_only": (replace(build_series("release_only"), pitch_id="release_only"), config("release_only", contact=None)),
        "no_shoulders": (no_shoulders(), config("no_shoulders")),
        "fps30": (fps30(), config("fps30", fps=30.0, contact=106, release=115)),
    }
    for name, (series, c) in cases.items():
        write(name, {"name": name, "config": config_json(c), "input": pose_json(series), "expected": expected(series, c)})

    pair_names = ("clean_right", "fps30")
    analyses = [analyze_pitch(*cases[n]) for n in pair_names]
    write("pair", {
        "inputs": [pose_json(cases[n][0]) for n in pair_names],
        "configs": [config_json(cases[n][1]) for n in pair_names],
        "payload": build_payload(analyses),
    })

    rng = np.random.default_rng(3)
    savgol_cases = []
    for length, window, polyorder in ((9, 9, 2), (12, 5, 2), (5, 3, 1), (40, 7, 3), (40, 9, 2)):
        values = rng.normal(0, 10, length).cumsum()
        savgol_cases.append({
            "values": values.tolist(),
            "window": window,
            "polyorder": polyorder,
            "expected": savgol_filter(values, window, polyorder).tolist(),
        })
    write("savgol", savgol_cases)
    return 0


if __name__ == "__main__":
    sys.exit(main())
