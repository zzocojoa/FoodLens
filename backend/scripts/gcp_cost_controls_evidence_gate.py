#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal, Sequence


GateStatus = Literal["passed", "failed"]

REQUIRED_CONTROL_IDS = (
    "gcp_budget_alert",
    "vertex_ai_quota",
    "service_account_minimum_iam",
    "gcs_lifecycle_policy",
    "google_maps_api_key_restriction",
)
REQUIRED_COLUMNS = (
    "control_id",
    "status",
    "gcp_project_id_ref",
    "resource_ref_redacted",
    "console_area",
    "verified_at",
    "verified_by",
    "evidence_ref",
    "official_source_url",
    "notes",
)
CONTROL_SOURCE_URL_PREFIXES: dict[str, tuple[str, ...]] = {
    "gcp_budget_alert": (
        "https://cloud.google.com/billing/docs/how-to/budgets",
    ),
    "vertex_ai_quota": (
        "https://cloud.google.com/vertex-ai/docs/quotas",
        "https://cloud.google.com/vertex-ai/generative-ai/docs/quotas",
    ),
    "service_account_minimum_iam": (
        "https://cloud.google.com/iam/docs",
    ),
    "gcs_lifecycle_policy": (
        "https://cloud.google.com/storage/docs/lifecycle",
        "https://cloud.google.com/storage/docs/managing-lifecycles",
    ),
    "google_maps_api_key_restriction": (
        "https://developers.google.com/maps/api-security-best-practices",
        "https://cloud.google.com/docs/authentication/api-keys",
    ),
}
SECRET_PATTERNS = (
    re.compile(r"AIza[0-9A-Za-z_\-]{20,}"),
    re.compile(r"postgres(?:ql)?://[^\s\"'<>]+", re.IGNORECASE),
    re.compile(r"authorization\s*:\s*bearer\s+[\w.\-~+/=]+", re.IGNORECASE),
    re.compile(r'"(?:access_token|refresh_token|id_token|private_key)"\s*:\s*"[^"]+"', re.IGNORECASE),
)


@dataclass(frozen=True)
class EvidenceRow:
    control_id: str
    status: str
    gcp_project_id_ref: str
    resource_ref_redacted: str
    console_area: str
    verified_at: str
    verified_by: str
    evidence_ref: str
    official_source_url: str
    notes: str


@dataclass(frozen=True)
class GateIssue:
    control_id: str
    message: str


@dataclass(frozen=True)
class GateOutcome:
    status: GateStatus
    checked_control_count: int
    issues: tuple[GateIssue, ...]


def _emit_event(event: str, payload: dict[str, object]) -> None:
    body = {"event": event}
    body.update(payload)
    print(json.dumps(body, ensure_ascii=False, sort_keys=True))


def _read_rows(path: Path) -> tuple[EvidenceRow, ...]:
    if not path.exists():
        raise FileNotFoundError(f"GCP cost controls evidence file does not exist: {path}")
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fieldnames = tuple(reader.fieldnames or ())
        missing_columns = tuple(column for column in REQUIRED_COLUMNS if column not in fieldnames)
        if missing_columns:
            missing_text = ", ".join(missing_columns)
            raise ValueError(f"GCP cost controls evidence file is missing columns: {missing_text}")
        rows = []
        for raw_row in reader:
            rows.append(
                EvidenceRow(
                    control_id=(raw_row.get("control_id") or "").strip(),
                    status=(raw_row.get("status") or "").strip(),
                    gcp_project_id_ref=(raw_row.get("gcp_project_id_ref") or "").strip(),
                    resource_ref_redacted=(raw_row.get("resource_ref_redacted") or "").strip(),
                    console_area=(raw_row.get("console_area") or "").strip(),
                    verified_at=(raw_row.get("verified_at") or "").strip(),
                    verified_by=(raw_row.get("verified_by") or "").strip(),
                    evidence_ref=(raw_row.get("evidence_ref") or "").strip(),
                    official_source_url=(raw_row.get("official_source_url") or "").strip(),
                    notes=(raw_row.get("notes") or "").strip(),
                )
            )
    return tuple(rows)


def _is_iso_date(value: str) -> bool:
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return False
    return True


def _contains_secret(value: str) -> bool:
    return any(pattern.search(value) is not None for pattern in SECRET_PATTERNS)


def _source_url_allowed(control_id: str, value: str) -> bool:
    if "?" in value or "#" in value:
        return False
    allowed_prefixes = CONTROL_SOURCE_URL_PREFIXES.get(control_id, ())
    return any(value == prefix or value.startswith(f"{prefix}/") for prefix in allowed_prefixes)


def _validate_row(row: EvidenceRow) -> tuple[GateIssue, ...]:
    issues: list[GateIssue] = []
    if row.status != "verified":
        issues.append(GateIssue(control_id=row.control_id, message="status must be verified"))
    for field_name, field_value in (
        ("gcp_project_id_ref", row.gcp_project_id_ref),
        ("resource_ref_redacted", row.resource_ref_redacted),
        ("console_area", row.console_area),
        ("verified_by", row.verified_by),
        ("evidence_ref", row.evidence_ref),
        ("official_source_url", row.official_source_url),
    ):
        if not field_value:
            issues.append(GateIssue(control_id=row.control_id, message=f"{field_name} is required"))
        if _contains_secret(field_value):
            issues.append(GateIssue(control_id=row.control_id, message=f"{field_name} appears to contain a secret"))
    if not _is_iso_date(row.verified_at):
        issues.append(GateIssue(control_id=row.control_id, message="verified_at must use YYYY-MM-DD"))
    if row.notes and _contains_secret(row.notes):
        issues.append(GateIssue(control_id=row.control_id, message="notes appears to contain a secret"))
    if row.official_source_url and not _source_url_allowed(row.control_id, row.official_source_url):
        issues.append(
            GateIssue(control_id=row.control_id, message="official_source_url must match this control's official docs")
        )
    if row.evidence_ref.startswith("http://") or row.evidence_ref.startswith("https://"):
        issues.append(GateIssue(control_id=row.control_id, message="evidence_ref must not be a live console URL"))
    return tuple(issues)


def evaluate_rows(rows: Sequence[EvidenceRow]) -> GateOutcome:
    issues: list[GateIssue] = []
    rows_by_control_id: dict[str, EvidenceRow] = {}
    for row in rows:
        if not row.control_id:
            issues.append(GateIssue(control_id="<blank>", message="control_id is required"))
            continue
        if row.control_id not in REQUIRED_CONTROL_IDS:
            issues.append(GateIssue(control_id=row.control_id, message="control_id is not recognized"))
            continue
        if row.control_id in rows_by_control_id:
            issues.append(GateIssue(control_id=row.control_id, message="control_id must not be duplicated"))
            continue
        rows_by_control_id[row.control_id] = row
    for control_id in REQUIRED_CONTROL_IDS:
        row = rows_by_control_id.get(control_id)
        if row is None:
            issues.append(GateIssue(control_id=control_id, message="required control row is missing"))
            continue
        issues.extend(_validate_row(row))
    status: GateStatus = "passed" if not issues else "failed"
    return GateOutcome(
        status=status,
        checked_control_count=len(REQUIRED_CONTROL_IDS),
        issues=tuple(issues),
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate private GCP cost-control evidence without calling GCP APIs.")
    parser.add_argument("--evidence-path", required=True, help="Path to the private GCP cost-control evidence CSV.")
    return parser


def main(argv: Sequence[str]) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        rows = _read_rows(Path(args.evidence_path))
        outcome = evaluate_rows(rows)
    except (FileNotFoundError, ValueError) as error:
        _emit_event("gcp_cost_controls_evidence_error", {"message": str(error)})
        return 2
    _emit_event(
        "gcp_cost_controls_evidence_summary",
        {
            "status": outcome.status,
            "checked_control_count": outcome.checked_control_count,
            "issue_count": len(outcome.issues),
            "issues": tuple({"control_id": issue.control_id, "message": issue.message} for issue in outcome.issues),
        },
    )
    return 0 if outcome.status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
