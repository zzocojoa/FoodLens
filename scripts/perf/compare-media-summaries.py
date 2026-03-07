#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

MetricRule = dict[str, str]

METRIC_RULES: list[MetricRule] = [
    {"name": "http_req_failed", "field": "rate", "direction": "lower"},
    {"name": "render_failure_rate", "field": "rate", "direction": "lower"},
    {"name": "render_latency", "field": "p(95)", "direction": "lower"},
    {"name": "profile_failure_rate", "field": "rate", "direction": "lower"},
    {"name": "profile_latency", "field": "p(95)", "direction": "lower"},
    {"name": "analyze_failure_rate", "field": "rate", "direction": "lower"},
    {"name": "analyze_latency", "field": "p(95)", "direction": "lower"},
]


def _read_summary(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _extract_metric(summary: dict, name: str, field: str) -> float | None:
    metrics = summary.get("metrics") or {}
    metric = metrics.get(name) or {}
    values = metric.get("values") or {}
    raw = values.get(field)
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _fmt(value: float | None) -> str:
    if value is None:
        return "n/a"
    if math.isnan(value) or math.isinf(value):
        return "n/a"
    if abs(value) >= 100:
        return f"{value:.2f}"
    if abs(value) >= 1:
        return f"{value:.3f}"
    return f"{value:.5f}"


def _pct(before: float | None, after: float | None) -> str:
    if before is None or after is None or before == 0:
        return "n/a"
    return f"{((after - before) / before) * 100:+.2f}%"


def _is_regression(before: float | None, after: float | None, direction: str) -> bool:
    if before is None or after is None:
        return False
    if direction == "lower":
        return after > before
    return after < before


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two k6 summary.json files.")
    parser.add_argument("--before", required=True, help="Path to baseline summary.json")
    parser.add_argument("--after", required=True, help="Path to new summary.json")
    parser.add_argument(
        "--fail-on-regression",
        action="store_true",
        help="Exit 1 if any tracked metric regresses.",
    )
    args = parser.parse_args()

    before_path = Path(args.before)
    after_path = Path(args.after)
    before = _read_summary(before_path)
    after = _read_summary(after_path)

    regressions = 0
    header = f"{'metric':<24} {'before':>12} {'after':>12} {'delta':>10} {'status':>12}"
    print(header)
    print("-" * len(header))
    for rule in METRIC_RULES:
        name = rule["name"]
        field = rule["field"]
        direction = rule["direction"]
        before_value = _extract_metric(before, name, field)
        after_value = _extract_metric(after, name, field)
        regressed = _is_regression(before_value, after_value, direction)
        if regressed:
            regressions += 1
        status = "regressed" if regressed else "ok"
        print(
            f"{name + '.' + field:<24} {_fmt(before_value):>12} {_fmt(after_value):>12} {_pct(before_value, after_value):>10} {status:>12}"
        )

    print("")
    print(f"before={before_path}")
    print(f"after={after_path}")
    print(f"regressions={regressions}")
    if args.fail_on_regression and regressions > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
