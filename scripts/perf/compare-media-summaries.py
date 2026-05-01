#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any, TypedDict


class MetricRule(TypedDict):
    name: str
    field: str
    direction: str


class ThresholdRule(TypedDict):
    name: str
    field: str
    max_value: float


class RequiredMetric(TypedDict):
    name: str
    field: str

METRIC_RULES: list[MetricRule] = [
    {"name": "http_req_failed", "field": "rate", "direction": "lower"},
    {"name": "render_failure_rate", "field": "rate", "direction": "lower"},
    {"name": "render_content_type_mismatch_rate", "field": "rate", "direction": "lower"},
    {"name": "render_latency", "field": "p(95)", "direction": "lower"},
    {"name": "render_cache_hit_failure_rate", "field": "rate", "direction": "lower"},
    {
        "name": "render_cache_hit_content_type_mismatch_rate",
        "field": "rate",
        "direction": "lower",
    },
    {"name": "render_cache_hit_latency", "field": "p(95)", "direction": "lower"},
    {"name": "render_cache_miss_failure_rate", "field": "rate", "direction": "lower"},
    {"name": "render_cache_miss_observed_rate", "field": "rate", "direction": "higher"},
    {"name": "render_cache_miss_observed_count", "field": "count", "direction": "higher"},
    {
        "name": "render_cache_miss_content_type_mismatch_rate",
        "field": "rate",
        "direction": "lower",
    },
    {"name": "render_cache_miss_latency", "field": "p(95)", "direction": "lower"},
    {"name": "render_stage_lookup_latency", "field": "p(95)", "direction": "lower"},
    {"name": "render_stage_fetch_latency", "field": "p(95)", "direction": "lower"},
    {"name": "render_stage_transform_latency", "field": "p(95)", "direction": "lower"},
    {"name": "render_stage_touch_latency", "field": "p(95)", "direction": "lower"},
    {"name": "render_stage_cache_set_latency", "field": "p(95)", "direction": "lower"},
    {"name": "render_cache_disabled_rate", "field": "rate", "direction": "lower"},
    {"name": "render_cache_unknown_rate", "field": "rate", "direction": "lower"},
    {"name": "profile_failure_rate", "field": "rate", "direction": "lower"},
    {"name": "profile_latency", "field": "p(95)", "direction": "lower"},
    {"name": "analyze_failure_rate", "field": "rate", "direction": "lower"},
    {"name": "analyze_latency", "field": "p(95)", "direction": "lower"},
]

BASE_THRESHOLD_RULES: list[ThresholdRule] = [
    {"name": "http_req_failed", "field": "rate", "max_value": 0.10},
    {"name": "render_failure_rate", "field": "rate", "max_value": 0.05},
    {"name": "render_content_type_mismatch_rate", "field": "rate", "max_value": 0.00001},
    {"name": "render_latency", "field": "p(95)", "max_value": 1500.0},
    {"name": "render_cache_hit_failure_rate", "field": "rate", "max_value": 0.05},
    {
        "name": "render_cache_hit_content_type_mismatch_rate",
        "field": "rate",
        "max_value": 0.00001,
    },
    {"name": "render_cache_hit_latency", "field": "p(95)", "max_value": 1500.0},
    {"name": "render_cache_miss_failure_rate", "field": "rate", "max_value": 0.05},
    {
        "name": "render_cache_miss_content_type_mismatch_rate",
        "field": "rate",
        "max_value": 0.00001,
    },
    {"name": "render_cache_miss_latency", "field": "p(95)", "max_value": 2500.0},
    {"name": "profile_failure_rate", "field": "rate", "max_value": 0.10},
    {"name": "profile_latency", "field": "p(95)", "max_value": 1200.0},
    {"name": "analyze_failure_rate", "field": "rate", "max_value": 0.20},
    {"name": "analyze_latency", "field": "p(95)", "max_value": 2500.0},
]

CACHE_HEADER_THRESHOLD_RULES: list[ThresholdRule] = [
    {"name": "render_cache_disabled_rate", "field": "rate", "max_value": 0.00001},
    {"name": "render_cache_unknown_rate", "field": "rate", "max_value": 0.00001},
]

CACHE_HEADER_REQUIRED_METRICS: list[RequiredMetric] = [
    {"name": "render_cache_disabled_rate", "field": "rate"},
    {"name": "render_cache_unknown_rate", "field": "rate"},
    {"name": "render_cache_miss_observed_rate", "field": "rate"},
    {"name": "render_cache_miss_observed_count", "field": "count"},
]


def _read_summary(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fp:
        raw: Any = json.load(fp)
    if not isinstance(raw, dict):
        raise ValueError(f"summary JSON must be an object: path={path}")
    return raw


def _extract_metric(summary: dict[str, Any], name: str, field: str) -> float | None:
    metrics = summary.get("metrics")
    if not isinstance(metrics, dict):
        return None
    metric = metrics.get(name)
    if not isinstance(metric, dict):
        return None
    values = metric.get("values")
    if isinstance(values, dict):
        raw = values.get(field)
    elif field == "rate":
        raw = metric.get("rate", metric.get("value"))
    else:
        raw = metric.get(field)
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _metric_is_missing(value: float | None) -> bool:
    return value is None or math.isnan(value) or math.isinf(value)


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


def _is_regression(
    before: float | None,
    after: float | None,
    direction: str,
    max_regression_percent: float,
    minimum_regression_delta: float,
) -> bool:
    if before is None or after is None:
        return False
    if direction == "lower":
        if after - before <= minimum_regression_delta:
            return False
        if before == 0:
            return after > before
        allowed_after = before * (1 + (max_regression_percent / 100))
        return after > allowed_after
    if before - after <= minimum_regression_delta:
        return False
    if before == 0:
        return after < before
    allowed_after = before * (1 - (max_regression_percent / 100))
    return after < allowed_after


def _is_threshold_failure(after: float | None, threshold: float | None) -> bool:
    if after is None or threshold is None:
        return False
    return after >= threshold


def _thresholds_by_metric(rules: list[ThresholdRule]) -> dict[str, float]:
    return {f"{rule['name']}.{rule['field']}": rule["max_value"] for rule in rules}


def _threshold_rules_for_run(*, require_cache_header: bool) -> list[ThresholdRule]:
    rules = [*BASE_THRESHOLD_RULES]
    if require_cache_header:
        rules.extend(CACHE_HEADER_THRESHOLD_RULES)
    return rules


def _parse_required_metric(raw: str) -> RequiredMetric:
    name, separator, field = raw.strip().rpartition(".")
    if not separator or not name or not field:
        raise argparse.ArgumentTypeError(
            f"required metric must use name.field format: value={raw}"
        )
    return {"name": name, "field": field}


def _required_metrics_for_run(
    *,
    enforce_thresholds: bool,
    require_cache_header: bool,
    requested_metrics: list[RequiredMetric],
) -> list[RequiredMetric]:
    merged: dict[str, RequiredMetric] = {}
    if enforce_thresholds and require_cache_header:
        for metric in CACHE_HEADER_REQUIRED_METRICS:
            merged[f"{metric['name']}.{metric['field']}"] = metric
    for metric in requested_metrics:
        merged[f"{metric['name']}.{metric['field']}"] = metric
    return list(merged.values())


def _non_negative_float(raw: str) -> float:
    try:
        value = float(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"must be a non-negative finite number: value={raw}"
        ) from exc
    if value < 0 or math.isnan(value) or math.isinf(value):
        raise argparse.ArgumentTypeError(
            f"must be a non-negative finite number: value={raw}"
        )
    return value


def _minimum_regression_delta(rule: MetricRule, min_latency_regression_ms: float) -> float:
    if rule["field"].startswith("p(") and (
        "latency" in rule["name"] or "duration" in rule["name"]
    ):
        return min_latency_regression_ms
    return 0.0


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare two k6 summary.json files.")
    parser.add_argument("--before", required=True, help="Path to baseline summary.json")
    parser.add_argument("--after", required=True, help="Path to new summary.json")
    parser.add_argument(
        "--fail-on-regression",
        action="store_true",
        help="Exit 1 if any tracked metric regresses.",
    )
    parser.add_argument(
        "--max-regression-percent",
        type=_non_negative_float,
        default=0.0,
        help="Allowed percent increase before lower-is-better metrics are flagged.",
    )
    parser.add_argument(
        "--min-latency-regression-ms",
        type=_non_negative_float,
        default=0.0,
        help="Ignore latency regressions smaller than this absolute p95 delta in milliseconds.",
    )
    parser.add_argument(
        "--enforce-thresholds",
        action="store_true",
        help="Exit 1 if the new summary violates tracked k6 absolute thresholds.",
    )
    parser.add_argument(
        "--require-metric",
        action="append",
        default=[],
        type=_parse_required_metric,
        help="Require an after summary metric in name.field format, e.g. render_cache_hit_latency.p(95).",
    )
    parser.add_argument(
        "--require-cache-header",
        action="store_true",
        help="Fail when media render cache status headers are missing, disabled, or unknown.",
    )
    args = parser.parse_args()

    before_path = Path(args.before)
    after_path = Path(args.after)
    before = _read_summary(before_path)
    after = _read_summary(after_path)

    regressions = 0
    threshold_failures = 0
    missing_required_metrics = 0
    thresholds = _thresholds_by_metric(
        _threshold_rules_for_run(require_cache_header=bool(args.require_cache_header))
    )
    if args.enforce_thresholds:
        header = f"{'metric':<42} {'before':>12} {'after':>12} {'delta':>10} {'threshold':>12} {'status':>18}"
    else:
        header = f"{'metric':<42} {'before':>12} {'after':>12} {'delta':>10} {'status':>12}"
    print(header)
    print("-" * len(header))
    for rule in METRIC_RULES:
        name = rule["name"]
        field = rule["field"]
        direction = rule["direction"]
        metric_key = f"{name}.{field}"
        before_value = _extract_metric(before, name, field)
        after_value = _extract_metric(after, name, field)
        regressed = _is_regression(
            before_value,
            after_value,
            direction,
            args.max_regression_percent,
            _minimum_regression_delta(rule, float(args.min_latency_regression_ms)),
        )
        threshold = thresholds.get(metric_key)
        threshold_failed = args.enforce_thresholds and _is_threshold_failure(after_value, threshold)
        if regressed:
            regressions += 1
        if threshold_failed:
            threshold_failures += 1
        status_parts: list[str] = []
        if regressed:
            status_parts.append("regressed")
        if threshold_failed:
            status_parts.append("threshold")
        status = ",".join(status_parts) if status_parts else "ok"
        if args.enforce_thresholds:
            print(
                f"{metric_key:<42} {_fmt(before_value):>12} {_fmt(after_value):>12} {_pct(before_value, after_value):>10} {_fmt(threshold):>12} {status:>18}"
            )
        else:
            print(
                f"{metric_key:<42} {_fmt(before_value):>12} {_fmt(after_value):>12} {_pct(before_value, after_value):>10} {status:>12}"
            )

    required_metrics = _required_metrics_for_run(
        enforce_thresholds=bool(args.enforce_thresholds),
        require_cache_header=bool(args.require_cache_header),
        requested_metrics=args.require_metric,
    )
    if required_metrics:
        print("")
        print("required metrics")
        print("-" * 16)
        for required_metric in required_metrics:
            metric_key = f"{required_metric['name']}.{required_metric['field']}"
            after_value = _extract_metric(
                after,
                required_metric["name"],
                required_metric["field"],
            )
            missing = _metric_is_missing(after_value)
            if missing:
                missing_required_metrics += 1
            status = "missing" if missing else "ok"
            print(f"{metric_key:<42} {_fmt(after_value):>12} {status:>12}")

    print("")
    print(f"before={before_path}")
    print(f"after={after_path}")
    if args.max_regression_percent > 0:
        print(f"max_regression_percent={args.max_regression_percent:.2f}")
    if args.min_latency_regression_ms > 0:
        print(f"min_latency_regression_ms={args.min_latency_regression_ms:.2f}")
    print(f"regressions={regressions}")
    if args.enforce_thresholds:
        print(f"threshold_failures={threshold_failures}")
    if required_metrics:
        print(f"missing_required_metrics={missing_required_metrics}")
    if args.fail_on_regression and regressions > 0:
        return 1
    if args.enforce_thresholds and threshold_failures > 0:
        return 1
    if missing_required_metrics > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
