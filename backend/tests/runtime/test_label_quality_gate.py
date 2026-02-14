import io
import os
import unittest
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from backend.modules.quality.label_quality_gate import evaluate_label_image_quality


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
from backend.server import app  # noqa: E402


class _SpyAnalyst:
    def __init__(self):
        self.label_model_name = "gemini-2.5-pro"
        self.called = False

    def analyze_label_json(self, *_args, **_kwargs):
        self.called = True
        raise AssertionError("analyze_label_json should not be called when quality gate fails")


def _build_low_quality_bytes() -> bytes:
    img = Image.new("RGB", (256, 256), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _build_high_quality_image() -> Image.Image:
    img = Image.new("RGB", (600, 900), (230, 230, 230))
    draw = ImageDraw.Draw(img)
    for idx in range(20):
        y = 30 + idx * 40
        draw.text((30, y), f"INGREDIENTS LINE {idx:02d}", fill=(20, 20, 20))
    for x in range(0, 600, 24):
        draw.line((x, 0, x, 899), fill=(40, 40, 40), width=1)
    return img


class LabelQualityGateTests(unittest.TestCase):
    def test_quality_gate_rejects_blank_image(self):
        blank = Image.new("RGB", (300, 300), (255, 255, 255))
        result = evaluate_label_image_quality(blank)
        self.assertFalse(result.passed)
        self.assertGreaterEqual(len(result.failed_checks), 1)

    def test_quality_gate_accepts_label_like_image(self):
        label_like = _build_high_quality_image()
        result = evaluate_label_image_quality(label_like)
        self.assertTrue(result.passed)
        self.assertEqual(result.failed_checks, [])

    def test_endpoint_skips_gemini_when_quality_fails(self):
        spy = _SpyAnalyst()
        with TestClient(app) as client:
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_low_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(spy.called)
        self.assertIsNotNone(payload.get("request_id"))
        self.assertEqual(payload.get("prompt_version"), "label-v1.2-2pass-locale-country")
        self.assertEqual(payload.get("used_model"), "gemini-2.5-pro")
        self.assertEqual(payload.get("safetyStatus"), "CAUTION")


if __name__ == "__main__":
    unittest.main()
