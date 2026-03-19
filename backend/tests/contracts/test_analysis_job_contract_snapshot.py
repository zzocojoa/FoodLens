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
            "prompt_version": "food-v3.2-context-engineered",
            "latency_ms_by_stage": {
                "preprocessing": 12,
                "inference": 223,
                "nutrition": 12,
                "finalizing": 3,
            },
            "foodName": "Bibimbap",
            "safetyStatus": "SAFE",
            "ingredients": [],
        }

        normalized = AnalysisJobStatusResponseContract.model_validate(payload).model_dump(exclude_none=True)
        self.assertDictEqual(normalized, payload)


if __name__ == "__main__":
    unittest.main()
