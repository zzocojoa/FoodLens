import unittest

from backend.modules.contracts.analysis_job import (
    AnalysisJobStatusResponseContract,
    AnalysisJobSubmitResponseContract,
)


class AnalysisJobContractSnapshotTests(unittest.TestCase):
    def test_submit_contract_accepts_expected_payload(self) -> None:
        payload = {
            "job_id": "job_123",
            "request_id": "req_123",
            "status": "queued",
            "accepted_at": "2026-03-17T00:00:00Z",
            "poll_after_ms": 1000,
            "idempotency_reused": False,
        }

        normalized = AnalysisJobSubmitResponseContract.model_validate(payload).model_dump(exclude_none=True)
        self.assertDictEqual(normalized, payload)

    def test_status_contract_accepts_completed_payload(self) -> None:
        payload = {
            "job_id": "job_123",
            "request_id": "req_123",
            "status": "completed",
            "accepted_at": "2026-03-17T00:00:00Z",
            "started_at": "2026-03-17T00:00:01Z",
            "updated_at": "2026-03-17T00:00:10Z",
            "poll_after_ms": 0,
            "progress_hint": "completed",
            "used_model": "gemini-2.0-flash",
            "prompt_version": "food-v3.3.1-schema-compact",
            "latency_ms_by_stage": {
                "preprocessing": 12,
                "inference": 223,
                "nutrition": 12,
                "finalizing": 3,
            },
            "foodName": "Bibimbap",
            "foodName_en": "Bibimbap",
            "foodName_ko": "비빔밥",
            "safetyStatus": "SAFE",
            "decision_status": "OK",
            "analysis_origin": "food_photo",
            "recommended_action": "eat",
            "uncertainty_reason": "unknown",
            "decision_confidence": "high",
            "ingredients": [],
            "raw_result": "Safe to eat.",
            "raw_result_en": "Safe to eat.",
            "raw_result_ko": "안전하게 먹을 수 있습니다.",
        }

        normalized = AnalysisJobStatusResponseContract.model_validate(payload).model_dump(exclude_none=True)
        self.assertDictEqual(normalized, payload)


if __name__ == "__main__":
    unittest.main()
