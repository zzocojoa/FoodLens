import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
SCANNER_PATH = ROOT_DIR / ".github" / "scripts" / "scan_artifact_secrets.py"


def _load_scanner_module():
    spec = importlib.util.spec_from_file_location("scan_artifact_secrets", SCANNER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("scan_artifact_secrets.py could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ArtifactSecretScannerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scanner = _load_scanner_module()

    def test_scan_passes_redacted_postdeploy_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            (artifact_dir / "summary.md").write_text(
                "| media-cold-upload | PASS | fresh-render-url-redacted |\n",
                encoding="utf-8",
            )
            (artifact_dir / "auth-login.body").write_text(
                '{"redacted_token_count": 2}',
                encoding="utf-8",
            )
            (artifact_dir / "media-cold-smoke.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00")

            self.assertEqual(self.scanner.scan_artifacts(artifact_dir), [])

    def test_scan_finds_signed_media_render_url_without_leaking_value(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            (artifact_dir / "me-history.body").write_text(
                '{"image_render_url":"https://example.com/media/render/asset_1?exp=1&sig=secret"}',
                encoding="utf-8",
            )

            self.assertEqual(
                self.scanner.scan_artifacts(artifact_dir),
                [("me-history.body", "signed-media-render-url")],
            )

    def test_scan_finds_token_fields_and_bearer_headers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            (artifact_dir / "auth-login.body").write_text(
                '{"access_token":"secret-access","refresh_token":"secret-refresh"}',
                encoding="utf-8",
            )
            (artifact_dir / "request.headers").write_text(
                "Authorization: Bearer secret-token\n",
                encoding="utf-8",
            )

            self.assertEqual(
                self.scanner.scan_artifacts(artifact_dir),
                [
                    ("auth-login.body", "json-access-token"),
                    ("auth-login.body", "json-refresh-token"),
                    ("request.headers", "authorization-bearer"),
                ],
            )


if __name__ == "__main__":
    unittest.main()
