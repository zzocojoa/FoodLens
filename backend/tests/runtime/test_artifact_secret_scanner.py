import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
SCANNER_PATH = ROOT_DIR / ".github" / "scripts" / "scan_artifact_secrets.py"
PERF_WORKFLOW_PATH = ROOT_DIR / ".github" / "workflows" / "backend-media-performance-regression.yml"


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

    def test_scan_finds_database_url_and_private_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            (artifact_dir / "render.log").write_text(
                'postgresql://user:password@example.com/db\n{"private_key":"secret-private-key"}',
                encoding="utf-8",
            )

            self.assertEqual(
                self.scanner.scan_artifacts(artifact_dir),
                [
                    ("render.log", "database-url"),
                    ("render.log", "json-private-key"),
                ],
            )

    def test_scan_passes_redacted_backend_performance_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            run_dir = artifact_dir / "backend-media-smoke-123"
            run_dir.mkdir()
            (run_dir / "summary.json").write_text(
                '{"metrics":{"render_latency":{"p(95)":123}}}',
                encoding="utf-8",
            )
            (run_dir / "k6.log").write_text(
                "GET <redacted-media-render-url> status=200\n",
                encoding="utf-8",
            )
            diagnostics_dir = artifact_dir / "url-resolution"
            diagnostics_dir.mkdir()
            (diagnostics_dir / "diagnostics.jsonl").write_text(
                '{"candidate_source":"history[0].image_render_url","url":"<redacted-media-render-url>"}\n',
                encoding="utf-8",
            )

            self.assertEqual(self.scanner.scan_artifacts(artifact_dir), [])

    def test_scan_finds_signed_media_render_url_in_backend_performance_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_dir = Path(temp_dir)
            run_dir = artifact_dir / "backend-media-smoke-123"
            run_dir.mkdir()
            (run_dir / "k6.log").write_text(
                "GET https://example.com/media/render/asset_1?exp=1&sig=secret status=200\n",
                encoding="utf-8",
            )
            (run_dir / "cache-miss-urls.txt").write_text(
                "https://example.com/media/render/asset_2?exp=2&sig=secret\n",
                encoding="utf-8",
            )

            self.assertEqual(
                self.scanner.scan_artifacts(artifact_dir),
                [
                    ("backend-media-smoke-123/cache-miss-urls.txt", "signed-media-render-url"),
                    ("backend-media-smoke-123/k6.log", "signed-media-render-url"),
                ],
            )

    def test_backend_media_performance_workflow_scans_before_artifact_upload(self) -> None:
        workflow = PERF_WORKFLOW_PATH.read_text(encoding="utf-8")

        scan_index = workflow.index("Scan performance artifacts for secret leaks")
        upload_index = workflow.index("Upload performance artifacts")

        self.assertLess(scan_index, upload_index)
        self.assertIn("python3 .github/scripts/scan_artifact_secrets.py artifacts/perf", workflow)
        self.assertIn("steps.artifact_secret_scan.outcome == 'success'", workflow)


if __name__ == "__main__":
    unittest.main()
