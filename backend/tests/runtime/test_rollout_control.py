import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.modules.ops.rollout_control import (
    InMemoryRolloutStateStore,
    JsonFileRolloutStateStore,
    KpiGateInput,
    KpiThresholds,
    LabelRolloutAutoManager,
    LabelRolloutController,
    RolloutConfig,
    RolloutRuntimeState,
    evaluate_kpi_gate,
)


class RolloutControlTests(unittest.TestCase):
    def test_same_request_id_is_stable(self) -> None:
        controller = LabelRolloutController(RolloutConfig(stage="canary-25", percentage=25, enabled=True))
        d1 = controller.decide("same-request-id", kpi_gate_passed=True)
        d2 = controller.decide("same-request-id", kpi_gate_passed=True)
        self.assertEqual(d1.bucket, d2.bucket)
        self.assertEqual(d1.route_to_new, d2.route_to_new)

    def test_stage_percentage_distribution_changes(self) -> None:
        keys = [f"req-{i}" for i in range(5000)]

        c10 = LabelRolloutController(RolloutConfig(stage="shadow-10", percentage=10, enabled=True))
        c50 = LabelRolloutController(RolloutConfig(stage="canary-50", percentage=50, enabled=True))

        routed10 = sum(1 for key in keys if c10.decide(key, kpi_gate_passed=True).route_to_new)
        routed50 = sum(1 for key in keys if c50.decide(key, kpi_gate_passed=True).route_to_new)

        ratio10 = routed10 / len(keys)
        ratio50 = routed50 / len(keys)

        self.assertTrue(0.07 <= ratio10 <= 0.13)
        self.assertTrue(0.45 <= ratio50 <= 0.55)
        self.assertGreater(ratio50, ratio10)

    def test_rollback_zero_percent_routes_none(self) -> None:
        controller = LabelRolloutController(RolloutConfig(stage="rollback-0", percentage=0, enabled=True))
        for idx in range(200):
            decision = controller.decide(f"req-{idx}", kpi_gate_passed=True)
            self.assertFalse(decision.route_to_new)

    def test_kpi_gate_blocks_rollout_when_degraded(self) -> None:
        thresholds = KpiThresholds(min_parse_success_rate=97.0, max_p95_total_ms=8000, max_error_5xx_rate=1.0)
        bad_metrics = KpiGateInput(parse_success_rate=96.0, p95_total_ms=7500, error_5xx_rate=0.1)
        good_metrics = KpiGateInput(parse_success_rate=99.0, p95_total_ms=6000, error_5xx_rate=0.2)
        self.assertFalse(evaluate_kpi_gate(bad_metrics, thresholds))
        self.assertTrue(evaluate_kpi_gate(good_metrics, thresholds))

    def test_env_zero_percent_immediate_rollback(self) -> None:
        with patch.dict(
            os.environ,
            {
                "LABEL_ROLLOUT_ENABLED": "1",
                "LABEL_ROLLOUT_STAGE": "canary-50",
                "LABEL_ROLLOUT_PERCENTAGE": "0",
            },
            clear=False,
        ):
            config = RolloutConfig.from_env()
        controller = LabelRolloutController(config)
        decision = controller.decide("req-force-rollback", kpi_gate_passed=True)
        self.assertEqual(config.percentage, 0)
        self.assertFalse(decision.route_to_new)

    def test_auto_manager_promotes_stage_after_passes(self) -> None:
        store = InMemoryRolloutStateStore()
        store.put(RolloutRuntimeState(stage="shadow-10", consecutive_passes=0))
        manager = LabelRolloutAutoManager(store, promote_after_passes=2, rollback_stage="rollback-0")
        base = RolloutConfig(stage="shadow-10", percentage=10, enabled=True)

        c1 = manager.reconcile(base, kpi_gate_passed=True)
        c2 = manager.reconcile(c1, kpi_gate_passed=True)

        self.assertEqual(c1.stage, "shadow-10")
        self.assertEqual(c2.stage, "canary-25")
        self.assertEqual(c2.percentage, 25)

    def test_auto_manager_rolls_back_on_kpi_failure(self) -> None:
        store = InMemoryRolloutStateStore()
        store.put(RolloutRuntimeState(stage="canary-50", consecutive_passes=1))
        manager = LabelRolloutAutoManager(store, promote_after_passes=2, rollback_stage="rollback-0")
        base = RolloutConfig(stage="canary-50", percentage=50, enabled=True)

        cfg = manager.reconcile(base, kpi_gate_passed=False)

        self.assertEqual(cfg.stage, "rollback-0")
        self.assertEqual(cfg.percentage, 0)

    def test_json_state_store_persists_stage(self) -> None:
        with TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "rollout_state.json")
            store = JsonFileRolloutStateStore(path)
            manager = LabelRolloutAutoManager(store, promote_after_passes=1, rollback_stage="rollback-0")
            cfg = manager.reconcile(RolloutConfig(stage="shadow-10", percentage=10, enabled=True), kpi_gate_passed=True)
            self.assertEqual(cfg.stage, "canary-25")

            reopened = JsonFileRolloutStateStore(path)
            state = reopened.get("shadow-10")
            self.assertEqual(state.stage, "canary-25")


if __name__ == "__main__":
    unittest.main()
