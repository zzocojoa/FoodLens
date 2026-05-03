import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPT_PATH = PROJECT_ROOT / "backend" / "scripts" / "gcp_cost_controls_evidence_gate.py"
TEMPLATE_PATH = PROJECT_ROOT / "docs" / "ops" / "gcp-cost-controls-evidence-template.csv"
RUNBOOK_PATH = PROJECT_ROOT / "docs" / "ops" / "gcp-cost-controls-runbook.md"


def _load_gate_module():
    spec = importlib.util.spec_from_file_location("gcp_cost_controls_evidence_gate", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("gcp_cost_controls_evidence_gate.py could not be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class GcpCostControlsEvidenceGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.gate = _load_gate_module()

    def _write_verified_evidence(self, evidence_path: Path) -> None:
        with evidence_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=self.gate.REQUIRED_COLUMNS)
            writer.writeheader()
            for control_id in self.gate.REQUIRED_CONTROL_IDS:
                writer.writerow(
                    {
                        "control_id": control_id,
                        "status": "verified",
                        "gcp_project_id_ref": "project-redacted",
                        "resource_ref_redacted": f"{control_id}-resource-redacted",
                        "console_area": "Google Cloud Console",
                        "verified_at": "2026-05-03",
                        "verified_by": "operator",
                        "evidence_ref": f"artifacts/private/gcp-cost-controls-evidence/{control_id}.md",
                        "official_source_url": self.gate.CONTROL_SOURCE_URL_PREFIXES[control_id][0],
                        "notes": "verified without calling model endpoints",
                    }
                )

    def test_template_lists_all_required_controls_as_pending(self) -> None:
        with TEMPLATE_PATH.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))

        self.assertEqual(
            tuple(row["control_id"] for row in rows),
            self.gate.REQUIRED_CONTROL_IDS,
        )
        self.assertTrue(all(row["status"] == "pending" for row in rows))

    def test_verified_private_evidence_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            evidence_path = Path(temp_dir) / "evidence.csv"
            self._write_verified_evidence(evidence_path)

            rows = self.gate._read_rows(evidence_path)
            outcome = self.gate.evaluate_rows(rows)

            self.assertEqual(outcome.status, "passed")
            self.assertEqual(outcome.issues, ())

    def test_pending_private_evidence_fails_closed(self) -> None:
        rows = self.gate._read_rows(TEMPLATE_PATH)
        outcome = self.gate.evaluate_rows(rows)

        self.assertEqual(outcome.status, "failed")
        self.assertIn("status must be verified", {issue.message for issue in outcome.issues})

    def test_gate_rejects_secret_like_values(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            evidence_path = Path(temp_dir) / "evidence.csv"
            with evidence_path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.gate.REQUIRED_COLUMNS)
                writer.writeheader()
                for control_id in self.gate.REQUIRED_CONTROL_IDS:
                    writer.writerow(
                        {
                            "control_id": control_id,
                            "status": "verified",
                            "gcp_project_id_ref": "project-redacted",
                            "resource_ref_redacted": "AIza" + "a" * 30,
                            "console_area": "Google Cloud Console",
                            "verified_at": "2026-05-03",
                            "verified_by": "operator",
                            "evidence_ref": f"artifacts/private/gcp-cost-controls-evidence/{control_id}.md",
                            "official_source_url": "https://cloud.google.com/billing/docs/how-to/budgets",
                            "notes": "verified without calling model endpoints",
                        }
                    )

            rows = self.gate._read_rows(evidence_path)
            outcome = self.gate.evaluate_rows(rows)

            self.assertEqual(outcome.status, "failed")
            self.assertIn("resource_ref_redacted appears to contain a secret", {issue.message for issue in outcome.issues})

    def test_gate_rejects_source_url_for_wrong_control(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            evidence_path = Path(temp_dir) / "evidence.csv"
            self._write_verified_evidence(evidence_path)
            rows = list(self.gate._read_rows(evidence_path))
            rows[-1] = self.gate.EvidenceRow(
                control_id=rows[-1].control_id,
                status=rows[-1].status,
                gcp_project_id_ref=rows[-1].gcp_project_id_ref,
                resource_ref_redacted=rows[-1].resource_ref_redacted,
                console_area=rows[-1].console_area,
                verified_at=rows[-1].verified_at,
                verified_by=rows[-1].verified_by,
                evidence_ref=rows[-1].evidence_ref,
                official_source_url="https://cloud.google.com/billing/docs/how-to/budgets",
                notes=rows[-1].notes,
            )

            outcome = self.gate.evaluate_rows(rows)

            self.assertEqual(outcome.status, "failed")
            self.assertIn(
                "official_source_url must match this control's official docs",
                {issue.message for issue in outcome.issues},
            )

    def test_gate_rejects_duplicate_control_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            evidence_path = Path(temp_dir) / "evidence.csv"
            self._write_verified_evidence(evidence_path)
            rows = list(self.gate._read_rows(evidence_path))
            rows.append(rows[0])

            outcome = self.gate.evaluate_rows(rows)

            self.assertEqual(outcome.status, "failed")
            self.assertIn("control_id must not be duplicated", {issue.message for issue in outcome.issues})

    def test_gate_rejects_notes_with_secret_like_values(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            evidence_path = Path(temp_dir) / "evidence.csv"
            self._write_verified_evidence(evidence_path)
            rows = list(self.gate._read_rows(evidence_path))
            rows[0] = self.gate.EvidenceRow(
                control_id=rows[0].control_id,
                status=rows[0].status,
                gcp_project_id_ref=rows[0].gcp_project_id_ref,
                resource_ref_redacted=rows[0].resource_ref_redacted,
                console_area=rows[0].console_area,
                verified_at=rows[0].verified_at,
                verified_by=rows[0].verified_by,
                evidence_ref=rows[0].evidence_ref,
                official_source_url=rows[0].official_source_url,
                notes='{"private_key":"secret-private-key"}',
            )

            outcome = self.gate.evaluate_rows(rows)

            self.assertEqual(outcome.status, "failed")
            self.assertIn("notes appears to contain a secret", {issue.message for issue in outcome.issues})

    def test_gate_rejects_prefix_impersonation_url(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            evidence_path = Path(temp_dir) / "evidence.csv"
            self._write_verified_evidence(evidence_path)
            rows = list(self.gate._read_rows(evidence_path))
            rows[0] = self.gate.EvidenceRow(
                control_id=rows[0].control_id,
                status=rows[0].status,
                gcp_project_id_ref=rows[0].gcp_project_id_ref,
                resource_ref_redacted=rows[0].resource_ref_redacted,
                console_area=rows[0].console_area,
                verified_at=rows[0].verified_at,
                verified_by=rows[0].verified_by,
                evidence_ref=rows[0].evidence_ref,
                official_source_url="https://cloud.google.com/billing/docs/how-to/budgets-unofficial",
                notes=rows[0].notes,
            )

            outcome = self.gate.evaluate_rows(rows)

            self.assertEqual(outcome.status, "failed")
            self.assertIn(
                "official_source_url must match this control's official docs",
                {issue.message for issue in outcome.issues},
            )

    def test_runbook_documents_zero_ai_call_policy_and_official_sources(self) -> None:
        runbook = RUNBOOK_PATH.read_text(encoding="utf-8")

        self.assertIn("Gemini, Vertex AI, `/analyze`, `/lookup/barcode`를 호출하지 않는다", runbook)
        self.assertIn("https://cloud.google.com/billing/docs/how-to/budgets", runbook)
        self.assertIn("https://cloud.google.com/vertex-ai/generative-ai/docs/quotas", runbook)
        self.assertIn("https://cloud.google.com/storage/docs/lifecycle", runbook)
        self.assertIn("https://developers.google.com/maps/api-security-best-practices", runbook)


if __name__ == "__main__":
    unittest.main()
