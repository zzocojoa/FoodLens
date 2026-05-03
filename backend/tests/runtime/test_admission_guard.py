import io
import os
import threading
import time
import unittest

from fastapi.testclient import TestClient
from PIL import Image

from backend.modules.ops.api_edge_guard import InMemoryEndpointAdmissionLimiter


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
from backend.server import app  # noqa: E402


def _build_image_bytes() -> bytes:
    img = Image.new("RGB", (64, 64), (120, 120, 120))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


class _SlowAnalyst:
    label_model_name = "gemini-2.5-flash"

    def analyze_food_json(self, *_args, **_kwargs):
        time.sleep(0.35)
        return {
            "foodName": "Toast",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "used_model": "gemini-2.5-pro",
            "prompt_version": "food-v3.2-context-engineered",
        }


class AdmissionGuardTests(unittest.TestCase):
    def test_analyze_returns_429_when_inflight_capacity_exceeded(self):
        with TestClient(app) as client:
            app.state.analyst = _SlowAnalyst()
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.analysis_rate_limiter = None
            app.state.analysis_admission_limiter = InMemoryEndpointAdmissionLimiter(
                endpoint_max_inflight={"/analyze": 1}
            )
            app.state.analysis_admission_retry_after_seconds = 2

            results: dict[str, tuple[int, dict, str | None]] = {}

            def _call(name: str) -> None:
                response = client.post(
                    "/analyze",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={"allergy_info": "None", "locale": "ko-KR"},
                    headers={"X-Request-Id": f"req-admission-{name}"},
                )
                body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                results[name] = (
                    response.status_code,
                    body,
                    response.headers.get("Retry-After"),
                )

            first = threading.Thread(target=_call, args=("first",), daemon=True)
            second = threading.Thread(target=_call, args=("second",), daemon=True)
            first.start()
            time.sleep(0.05)
            second.start()
            first.join()
            second.join()

        statuses = sorted([results["first"][0], results["second"][0]])
        self.assertEqual(statuses, [200, 429])
        blocked = results["first"] if results["first"][0] == 429 else results["second"]
        self.assertEqual(blocked[2], "2")
        self.assertEqual(blocked[1]["detail"]["code"], "API_RATE_LIMITED")
        self.assertIn("request_id", blocked[1]["detail"])


if __name__ == "__main__":
    unittest.main()
