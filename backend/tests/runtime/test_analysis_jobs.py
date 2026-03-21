import asyncio
import io
import os
import time
import unittest

from fastapi.testclient import TestClient
from PIL import Image

from backend.modules.analysis_jobs import (
    InMemoryAnalysisJobStore,
    InMemoryNutritionCacheStore,
    NutritionEnrichmentService,
    create_analysis_job_payload,
)


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["ANALYSIS_JOB_BACKEND"] = "memory"
os.environ["ANALYSIS_NUTRITION_CACHE_BACKEND"] = "memory"
from backend.server import app  # noqa: E402


def _build_image_bytes() -> bytes:
    image = Image.new("RGB", (320, 240), (220, 180, 120))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


class _AsyncJobAnalyst:
    model_name = "gemini-2.0-flash"
    label_model_name = "gemini-2.5-pro"

    def analyze_food_job_json(self, *_args, **_kwargs):
        return {
            "foodName": "Bibimbap",
            "foodName_en": "Bibimbap",
            "foodName_ko": "비빔밥",
            "foodOrigin": "korean",
            "safetyStatus": "SAFE",
            "ingredients": [{"name": "Rice", "bbox": [0, 0, 10, 10], "isAllergen": False}],
            "raw_result": "Safe to eat.",
            "raw_result_en": "Safe to eat.",
            "raw_result_ko": "안전하게 먹을 수 있습니다.",
            "used_model": self.model_name,
            "prompt_version": "food-v3.2-context-engineered",
        }

    def analyze_label_json(self, *_args, **_kwargs):
        return {
            "foodName": "Bibimbap Label",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "raw_result": "Safe to eat.",
            "used_model": self.label_model_name,
            "prompt_version": "label-v1.2-2pass-locale-country",
        }


class AnalysisJobRuntimeTests(unittest.TestCase):
    def test_submit_job_returns_202_and_poll_completes(self) -> None:
        with TestClient(app) as client:
            app.state.analyst = _AsyncJobAnalyst()
            for worker in app.state.analysis_job_workers:
                worker.nutrition_service = NutritionEnrichmentService(
                    cache_store=InMemoryNutritionCacheStore(),
                    lookup_func=lambda _name, _origin: {
                        "calories": 150.0,
                        "protein": 3.0,
                        "carbs": 20.0,
                        "fat": 4.0,
                        "fiber": 1.0,
                        "sodium": 10.0,
                        "sugar": 2.0,
                        "servingSize": "100g",
                        "dataSource": "TestCache",
                    },
                    budget_seconds=0.5,
                    max_parallelism=1,
                )

            submit = client.post(
                "/analyze/jobs",
                files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR", "mode": "food"},
                headers={"X-Request-Id": "req-analysis-job-1"},
            )

            self.assertEqual(submit.status_code, 202)
            payload = submit.json()
            self.assertEqual(payload["status"], "queued")
            self.assertIn("job_id", payload)

            terminal_payload = None
            for _ in range(40):
                polled = client.get(
                    f"/analyze/jobs/{payload['job_id']}",
                    headers={"X-Request-Id": "req-analysis-job-poll"},
                )
                self.assertEqual(polled.status_code, 200)
                terminal_payload = polled.json()
                if terminal_payload["status"] in {"completed", "fallback_completed", "failed"}:
                    break
                time.sleep(0.05)

        assert terminal_payload is not None
        self.assertEqual(terminal_payload["status"], "completed")
        self.assertEqual(terminal_payload["request_id"], "req-analysis-job-1")
        self.assertEqual(terminal_payload["foodName"], "Bibimbap")
        self.assertEqual(terminal_payload["foodName_en"], "Bibimbap")
        self.assertEqual(terminal_payload["foodName_ko"], "비빔밥")
        self.assertEqual(terminal_payload["used_model"], "gemini-2.0-flash")
        self.assertEqual(terminal_payload["prompt_version"], "food-v3.2-context-engineered")
        self.assertIn("latency_ms_by_stage", terminal_payload)
        self.assertEqual(terminal_payload["nutrition"]["dataSource"], "TestCache")

    def test_nutrition_service_returns_unavailable_when_budget_is_exceeded(self) -> None:
        service = NutritionEnrichmentService(
            cache_store=InMemoryNutritionCacheStore(),
            lookup_func=lambda _name, _origin: time.sleep(0.1) or None,
            budget_seconds=0.01,
            max_parallelism=1,
        )

        result = asyncio.run(
            service.enrich(
                result={
                    "foodName": "Slow Dish",
                    "foodOrigin": "unknown",
                    "safetyStatus": "SAFE",
                    "ingredients": [{"name": "Ingredient A", "bbox": [0, 0, 1, 1], "isAllergen": False}],
                }
            )
        )

        self.assertEqual(result.fallback_reason, "nutrition_unavailable")
        self.assertEqual(result.result["nutrition"]["dataSource"], "Unavailable")

    def test_in_memory_job_store_reclaims_expired_lease(self) -> None:
        store = InMemoryAnalysisJobStore()
        payload = create_analysis_job_payload(
            request_id="req-analysis-job-store",
            mode="food",
            allergy_info="None",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=b"abc",
            image_sha256="hash",
            poll_after_ms=1000,
        )
        store.create_job(
            job_id=payload.job_id,
            request_id=payload.request_id,
            mode=payload.mode,
            allergy_info=payload.allergy_info,
            iso_country_code=payload.iso_country_code,
            locale=payload.locale,
            content_type=payload.content_type,
            image_base64=payload.image_base64,
            image_sha256=payload.image_sha256,
            accepted_at=payload.accepted_at,
            poll_after_ms=payload.poll_after_ms,
        )

        first = store.claim_next_job(
            worker_id="worker-a",
            lease_seconds=60,
            now=payload.accepted_at,
        )
        assert first is not None
        store.update_job(
            job_id=payload.job_id,
            updates={"lease_expires_at": payload.accepted_at},
        )

        second = store.claim_next_job(
            worker_id="worker-b",
            lease_seconds=60,
            now=payload.accepted_at,
        )

        assert second is not None
        self.assertEqual(second["worker_id"], "worker-b")


if __name__ == "__main__":
    unittest.main()
