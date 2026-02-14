import io
import os
import threading
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from google.api_core.exceptions import ResourceExhausted
from PIL import Image, ImageDraw

from backend.modules.analyst_runtime.generation import generate_with_429_backoff
from backend.modules.ops.cost_guardrail import CostGuardrailService, InMemoryMonthlyUsageStorage


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
from backend.server import app  # noqa: E402


def _build_high_quality_bytes() -> bytes:
    img = Image.new("RGB", (600, 900), (230, 230, 230))
    draw = ImageDraw.Draw(img)
    for idx in range(20):
        y = 30 + idx * 40
        draw.text((30, y), f"INGREDIENTS LINE {idx:02d}", fill=(20, 20, 20))
    for x in range(0, 600, 24):
        draw.line((x, 0, x, 899), fill=(40, 40, 40), width=1)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


class _429Analyst:
    def __init__(self):
        self.label_model_name = "gemini-2.5-pro"

    def analyze_label_json(self, *_args, **_kwargs):
        return {
            "foodName": "Unknown",
            "safetyStatus": "CAUTION",
            "ingredients": [],
            "nutrition": {},
            "raw_result": "rate limited",
            "prompt_version": "label-v1.2-2pass-locale-country",
            "used_model": self.label_model_name,
            "_label_timings": {"extract_ms": 0, "assess_ms": 0},
            "_label_chargeable": False,
            "_label_error_type": "quota_exhausted_429",
        }


class Label429PolicyTests(unittest.TestCase):
    def test_backoff_retries_then_succeeds(self):
        model = Mock()
        model.generate_content.side_effect = [ResourceExhausted("429"), ResourceExhausted("429"), {"ok": True}]

        with (
            patch("backend.modules.analyst_runtime.generation.random.uniform", return_value=0.0),
            patch("backend.modules.analyst_runtime.generation.time.sleep", return_value=None),
        ):
            result = generate_with_429_backoff(
                model=model,
                contents=["x"],
                generation_config={},
                safety_settings={},
                semaphore=threading.Semaphore(1),
                max_attempts=3,
                initial_delay_s=0.0,
            )

        self.assertEqual(result, {"ok": True})
        self.assertEqual(model.generate_content.call_count, 3)

    def test_429_returns_503_when_flag_enabled(self):
        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_429_RETURNS_503_ENABLED": "1",
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            service = CostGuardrailService(InMemoryMonthlyUsageStorage(), monthly_budget_usd=100.0)
            app.state.analyst = _429Analyst()
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        self.assertEqual(response.status_code, 503)

    def test_non_chargeable_result_skips_cost_record(self):
        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_429_RETURNS_503_ENABLED": "0",
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            storage = InMemoryMonthlyUsageStorage()
            service = CostGuardrailService(storage, monthly_budget_usd=100.0)
            app.state.analyst = _429Analyst()
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service

            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

            period_key = service._period_key()
            usage = storage.get(period_key)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 0)


if __name__ == "__main__":
    unittest.main()
