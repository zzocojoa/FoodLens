from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path


STAGE_PERCENTAGE_MAP: dict[str, int] = {
    "shadow-10": 10,
    "canary-25": 25,
    "canary-50": 50,
    "general-100": 100,
    "rollback-0": 0,
}
STAGE_PROMOTION_ORDER = ["shadow-10", "canary-25", "canary-50", "general-100"]


@dataclass(frozen=True)
class RolloutConfig:
    stage: str = "general-100"
    percentage: int = 100
    enabled: bool = True

    @classmethod
    def from_env(cls) -> "RolloutConfig":
        stage = os.environ.get("LABEL_ROLLOUT_STAGE", "general-100").strip().lower()
        percentage = STAGE_PERCENTAGE_MAP.get(stage, 100)

        raw_override = os.environ.get("LABEL_ROLLOUT_PERCENTAGE")
        if raw_override is not None:
            try:
                percentage = int(raw_override)
            except ValueError:
                pass

        percentage = max(0, min(100, percentage))
        enabled = os.environ.get("LABEL_ROLLOUT_ENABLED", "1").strip() == "1"
        return cls(stage=stage, percentage=percentage, enabled=enabled)


@dataclass(frozen=True)
class KpiGateInput:
    parse_success_rate: float
    p95_total_ms: int
    error_5xx_rate: float


@dataclass(frozen=True)
class KpiThresholds:
    min_parse_success_rate: float = 97.0
    max_p95_total_ms: int = 8000
    max_error_5xx_rate: float = 1.0


@dataclass(frozen=True)
class RolloutDecision:
    stage: str
    percentage: int
    bucket: int
    kpi_gate_passed: bool
    enabled: bool
    route_to_new: bool


@dataclass(frozen=True)
class RolloutRuntimeState:
    stage: str
    consecutive_passes: int = 0


class RolloutStateStore:
    def get(self, default_stage: str) -> RolloutRuntimeState:
        raise NotImplementedError

    def put(self, state: RolloutRuntimeState) -> None:
        raise NotImplementedError


class JsonFileRolloutStateStore(RolloutStateStore):
    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("{}", encoding="utf-8")

    def get(self, default_stage: str) -> RolloutRuntimeState:
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = {}
        stage = str(payload.get("stage", default_stage)).lower()
        if stage not in STAGE_PERCENTAGE_MAP:
            stage = default_stage
        consecutive_passes = int(payload.get("consecutive_passes", 0))
        if consecutive_passes < 0:
            consecutive_passes = 0
        return RolloutRuntimeState(stage=stage, consecutive_passes=consecutive_passes)

    def put(self, state: RolloutRuntimeState) -> None:
        payload = {"stage": state.stage, "consecutive_passes": state.consecutive_passes}
        self.path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


class InMemoryRolloutStateStore(RolloutStateStore):
    def __init__(self) -> None:
        self._state = RolloutRuntimeState(stage="general-100", consecutive_passes=0)

    def get(self, default_stage: str) -> RolloutRuntimeState:
        if self._state.stage not in STAGE_PERCENTAGE_MAP:
            return RolloutRuntimeState(stage=default_stage, consecutive_passes=0)
        return self._state

    def put(self, state: RolloutRuntimeState) -> None:
        self._state = state


class LabelRolloutController:
    def __init__(self, config: RolloutConfig) -> None:
        self.config = config

    @staticmethod
    def stable_bucket(key: str) -> int:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return int(digest[:8], 16) % 100

    def decide(self, request_key: str, *, kpi_gate_passed: bool) -> RolloutDecision:
        bucket = self.stable_bucket(request_key)
        route_to_new = self.config.enabled and kpi_gate_passed and bucket < self.config.percentage
        return RolloutDecision(
            stage=self.config.stage,
            percentage=self.config.percentage,
            bucket=bucket,
            kpi_gate_passed=kpi_gate_passed,
            enabled=self.config.enabled,
            route_to_new=route_to_new,
        )


class LabelRolloutAutoManager:
    """
    Automatic rollout stage controller.
    - KPI pass accumulates toward promotion.
    - KPI fail immediately rolls back to rollback stage.
    """

    def __init__(
        self,
        state_store: RolloutStateStore,
        *,
        promote_after_passes: int = 3,
        rollback_stage: str = "rollback-0",
    ) -> None:
        self.state_store = state_store
        self.promote_after_passes = max(1, promote_after_passes)
        self.rollback_stage = rollback_stage if rollback_stage in STAGE_PERCENTAGE_MAP else "rollback-0"

    def reconcile(self, base_config: RolloutConfig, *, kpi_gate_passed: bool) -> RolloutConfig:
        state = self.state_store.get(base_config.stage)
        stage = state.stage
        consecutive_passes = state.consecutive_passes

        if not kpi_gate_passed:
            next_state = RolloutRuntimeState(stage=self.rollback_stage, consecutive_passes=0)
            self.state_store.put(next_state)
            return RolloutConfig(
                stage=next_state.stage,
                percentage=STAGE_PERCENTAGE_MAP[next_state.stage],
                enabled=base_config.enabled,
            )

        if stage in STAGE_PROMOTION_ORDER:
            consecutive_passes += 1
            current_idx = STAGE_PROMOTION_ORDER.index(stage)
            if consecutive_passes >= self.promote_after_passes and current_idx < len(STAGE_PROMOTION_ORDER) - 1:
                stage = STAGE_PROMOTION_ORDER[current_idx + 1]
                consecutive_passes = 0

        next_state = RolloutRuntimeState(stage=stage, consecutive_passes=consecutive_passes)
        self.state_store.put(next_state)
        return RolloutConfig(
            stage=next_state.stage,
            percentage=STAGE_PERCENTAGE_MAP.get(next_state.stage, base_config.percentage),
            enabled=base_config.enabled,
        )


def evaluate_kpi_gate(metrics: KpiGateInput, thresholds: KpiThresholds) -> bool:
    if metrics.parse_success_rate < thresholds.min_parse_success_rate:
        return False
    if metrics.p95_total_ms > thresholds.max_p95_total_ms:
        return False
    if metrics.error_5xx_rate > thresholds.max_error_5xx_rate:
        return False
    return True


def load_kpi_input_from_env() -> KpiGateInput:
    def _f(name: str, default: float) -> float:
        raw = os.environ.get(name)
        if raw is None:
            return default
        try:
            return float(raw)
        except ValueError:
            return default

    def _i(name: str, default: int) -> int:
        raw = os.environ.get(name)
        if raw is None:
            return default
        try:
            return int(raw)
        except ValueError:
            return default

    return KpiGateInput(
        parse_success_rate=_f("LABEL_ROLLOUT_KPI_PARSE_SUCCESS", 100.0),
        p95_total_ms=_i("LABEL_ROLLOUT_KPI_P95_MS", 0),
        error_5xx_rate=_f("LABEL_ROLLOUT_KPI_5XX_RATE", 0.0),
    )
