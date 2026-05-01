#!/usr/bin/env python3
from __future__ import annotations

import argparse
import io
import json
import logging
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping
from uuid import uuid4

REQUIRED_ENV_NAMES: tuple[str, ...] = (
    "DATABASE_URL",
    "AUTH_STATE_KEY",
    "MEDIA_GCS_BUCKET",
    "GCP_SERVICE_ACCOUNT_JSON",
)
ARTIFACT_DIR_ENV_NAME = "STAGING_SMOKE_ARTIFACT_DIR"
DEFAULT_ARTIFACT_DIR = "artifacts/phase6/staging-integration-smoke"
SMOKE_PASSWORD = "Passw0rd!"
SENSITIVE_ENV_NAMES: tuple[str, ...] = (
    "DATABASE_URL",
    "AUTH_STATE_KEY",
    "GCP_SERVICE_ACCOUNT_JSON",
    "MEDIA_GCS_BUCKET",
)
DATABASE_URL_PATTERN = re.compile(r"postgres(?:ql)?://[^\s'\"),]+", re.IGNORECASE)
BEARER_TOKEN_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]+")
SERVER_HOST_PATTERN = re.compile(r'(server at|host name)\s+"[^"]+"', re.IGNORECASE)


def _ensure_repo_root_on_path() -> None:
    root = Path(__file__).resolve().parents[2]
    root_value = str(root)
    if root_value not in sys.path:
        sys.path.insert(0, root_value)


@dataclass(frozen=True)
class SmokeResult:
    name: str
    passed: bool
    details: dict[str, object]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _load_backend_env() -> None:
    from dotenv import load_dotenv

    load_dotenv(_repo_root() / "backend" / ".env")


def _configure_runtime_env() -> None:
    os.environ.setdefault("OPENAPI_EXPORT_ONLY", "1")
    os.environ.setdefault("AUTH_EMAIL_VERIFICATION_REQUIRED", "1")
    os.environ.setdefault("AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED", "1")
    os.environ.setdefault("AUTH_EMAIL_VERIFICATION_DELIVERY_MODE", "log")
    os.environ.setdefault("AUTH_STATE_BACKEND", "postgres")
    os.environ.setdefault("RETENTION_STORE_BACKEND", "postgres")
    os.environ.setdefault("RETENTION_DELETE_BACKEND", "media_asset")
    os.environ.setdefault("MEDIA_STORAGE_BACKEND", "gcs")
    os.environ.setdefault("DELETION_QUEUE_BACKEND", "postgres")
    os.environ.setdefault("DELETION_HANDLER_BACKEND", "user")
    os.environ.setdefault("MEDIA_GCS_PREFIX", "media")
    os.environ.setdefault("MEDIA_MAX_UPLOAD_MB", "10")


def _configure_logging() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s:%(name)s:%(message)s")
    for logger_name in ("httpx", "foodlens", "foodlens.media", "foodlens.auth"):
        logging.getLogger(logger_name).setLevel(logging.WARNING)


def missing_required_env(env: Mapping[str, str]) -> list[str]:
    return [name for name in REQUIRED_ENV_NAMES if not (env.get(name) or "").strip()]


def _write_json(path: Path, payload: Mapping[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _summary_payload(results: list[SmokeResult]) -> dict[str, object]:
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "generated_at": generated_at,
        "passed": all(result.passed for result in results),
        "results": [
            {
                "name": result.name,
                "passed": result.passed,
                "details": result.details,
            }
            for result in results
        ],
    }


def _write_summary(artifact_dir: Path, results: list[SmokeResult]) -> None:
    _write_json(artifact_dir / "summary.json", _summary_payload(results))


def _safe_error_message(error: BaseException) -> str:
    message = str(error)
    for env_name in SENSITIVE_ENV_NAMES:
        env_value = os.environ.get(env_name)
        if env_value and len(env_value) >= 6:
            message = message.replace(env_value, f"[REDACTED_{env_name}]")
    message = DATABASE_URL_PATTERN.sub("[REDACTED_DATABASE_URL]", message)
    message = BEARER_TOKEN_PATTERN.sub("Bearer [REDACTED_TOKEN]", message)
    message = SERVER_HOST_PATTERN.sub(lambda match: f'{match.group(1)} "[REDACTED_HOST]"', message)
    return message[:500]


def _root_error(error: BaseException) -> BaseException:
    current = error
    seen: set[int] = set()
    while id(current) not in seen:
        seen.add(id(current))
        next_error = current.__cause__ or current.__context__
        if next_error is None:
            return current
        current = next_error
    return current


def _safe_error_details(error: BaseException) -> dict[str, object]:
    root_error = _root_error(error)
    details: dict[str, object] = {
        "error_type": type(error).__name__,
        "root_error_type": type(root_error).__name__,
    }
    message = _safe_error_message(error)
    root_message = _safe_error_message(root_error)
    if message:
        details["error_message"] = message
    if root_message and root_message != message:
        details["root_error_message"] = root_message
    return details


def _png_bytes() -> bytes:
    from PIL import Image

    output = io.BytesIO()
    Image.new("RGB", (6, 6), color=(38, 92, 148)).save(output, format="PNG")
    return output.getvalue()


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _signup_and_verify(client: Any, email_prefix: str) -> dict[str, object]:
    email = f"{email_prefix}-{uuid4().hex[:12]}@example.com"
    signup_response = client.post(
        "/auth/email/signup",
        json={
            "email": email,
            "password": SMOKE_PASSWORD,
            "display_name": "Staging Smoke",
            "locale": "ko-KR",
        },
    )
    if signup_response.status_code != 200:
        raise RuntimeError("signup_failed")
    signup_body = signup_response.json()
    verification_debug_code = str(signup_body.get("verification_debug_code") or "")
    if not verification_debug_code:
        raise RuntimeError("verification_code_missing")

    verify_response = client.post(
        "/auth/email/verify",
        json={
            "email": email,
            "code": verification_debug_code,
        },
    )
    if verify_response.status_code != 200:
        raise RuntimeError("verify_failed")
    verified_body = verify_response.json()
    access_token = str(verified_body.get("access_token") or "")
    user_id = str(verified_body.get("user", {}).get("id") or verified_body.get("user_id") or "")
    if not access_token or not user_id:
        raise RuntimeError("verified_session_missing")
    return {
        "access_token": access_token,
        "user_id": user_id,
    }


def _upload_media(client: Any, access_token: str) -> dict[str, object]:
    upload_response = client.post(
        "/me/media/upload",
        files={"file": ("staging-smoke.png", _png_bytes(), "image/png")},
        data={"scope": "history"},
        headers=_auth_headers(access_token),
    )
    if upload_response.status_code != 200:
        raise RuntimeError("upload_failed")
    asset = upload_response.json().get("asset")
    if not isinstance(asset, dict):
        raise RuntimeError("upload_asset_missing")
    if not str(asset.get("asset_id") or ""):
        raise RuntimeError("upload_asset_id_missing")
    if not str(asset.get("render_url") or ""):
        raise RuntimeError("upload_render_url_missing")
    if asset.get("object_generation") is None:
        raise RuntimeError("upload_generation_missing")
    return asset


def _metadata_removed(auth_service: Any, asset_id: str, user_id: str) -> bool:
    from backend.modules.auth.service import AuthServiceError

    try:
        auth_service.get_media_asset(asset_id=asset_id, user_id=user_id)
        return False
    except AuthServiceError as error:
        if error.code == "AUTH_MEDIA_NOT_FOUND":
            return True
        raise


def _delete_smoke_user(auth_service: Any, user_id: str) -> bool:
    if not user_id:
        return True
    if auth_service is None:
        return False
    try:
        auth_service.delete_user_account(user_id=user_id)
        return True
    except Exception:
        return False


def _run_media_delete_smoke(server_module: Any) -> SmokeResult:
    from fastapi.testclient import TestClient

    user_id = ""
    try:
        with TestClient(server_module.app) as client:
            auth_service = server_module.app.state.auth_service
            session = _signup_and_verify(client, "staging-media-delete")
            user_id = str(session["user_id"])
            asset = _upload_media(client, str(session["access_token"]))
            asset_id = str(asset["asset_id"])
            render_url = str(asset["render_url"])
            render_before = client.get(render_url)
            delete_response = client.delete(f"/me/media/{asset_id}", headers=_auth_headers(str(session["access_token"])))
            render_after = client.get(render_url)
            metadata_removed = _metadata_removed(auth_service, asset_id, user_id)
            cleanup_removed = _delete_smoke_user(auth_service, user_id)
            return SmokeResult(
                name="media_delete",
                passed=(
                    render_before.status_code == 200
                    and delete_response.status_code == 200
                    and render_after.status_code == 404
                    and metadata_removed
                    and cleanup_removed
                ),
                details={
                    "upload_status": 200,
                    "render_before_status": render_before.status_code,
                    "delete_status": delete_response.status_code,
                    "render_after_status": render_after.status_code,
                    "metadata_removed": metadata_removed,
                    "object_generation_present": asset.get("object_generation") is not None,
                    "cleanup_removed": cleanup_removed,
                },
            )
    except Exception as error:
        cleanup_removed = False
        if user_id:
            cleanup_removed = _delete_smoke_user(getattr(server_module.app.state, "auth_service", None), user_id)
        details = _safe_error_details(error)
        details["cleanup_removed"] = cleanup_removed
        return SmokeResult("media_delete", False, details)


def _retention_record_from_asset(asset: Mapping[str, object], user_id: str) -> RetentionRecord:
    from backend.modules.ops.data_retention import RetentionDataClass, RetentionRecord

    return RetentionRecord(
        record_id=str(asset["asset_id"]),
        data_class=RetentionDataClass.ORIGINAL,
        created_at=datetime.now(timezone.utc) - timedelta(seconds=2),
        user_id=user_id,
        request_id=f"staging-retention-{uuid4().hex[:12]}",
        storage_key=str(asset["object_key"]),
        object_generation=int(asset["object_generation"]),
    )


def _remove_retention_record(server_module: Any, record_id: str) -> bool:
    retention_store = getattr(server_module.app.state, "retention_store", None)
    if retention_store is None:
        return False
    retention_store.remove(record_id)
    return True


def _run_retention_retry_smoke(server_module: Any) -> SmokeResult:
    from fastapi.testclient import TestClient

    user_id = ""
    try:
        with TestClient(server_module.app) as client:
            auth_service = server_module.app.state.auth_service
            session = _signup_and_verify(client, "staging-retention-retry")
            user_id = str(session["user_id"])
            asset = _upload_media(client, str(session["access_token"]))
            render_url = str(asset["render_url"])
            record = _retention_record_from_asset(asset, user_id)
            retry_result = bool(server_module._delete_media_retention_record(record))
            render_after = client.get(render_url)
            asset_id = str(asset["asset_id"])
            metadata_removed = _metadata_removed(auth_service, asset_id, user_id)
            retention_removed = False
            if retry_result and metadata_removed:
                retention_removed = _remove_retention_record(server_module, asset_id)
            cleanup_removed = metadata_removed and _delete_smoke_user(auth_service, user_id)
            return SmokeResult(
                name="retention_retry",
                passed=(
                    retry_result
                    and render_after.status_code == 404
                    and metadata_removed
                    and retention_removed
                    and cleanup_removed
                ),
                details={
                    "retry_result": retry_result,
                    "render_after_status": render_after.status_code,
                    "metadata_removed": metadata_removed,
                    "retention_removed": retention_removed,
                    "object_generation_present": asset.get("object_generation") is not None,
                    "cleanup_removed": cleanup_removed,
                },
            )
    except Exception as error:
        cleanup_removed = False
        if user_id:
            cleanup_removed = _delete_smoke_user(getattr(server_module.app.state, "auth_service", None), user_id)
        details = _safe_error_details(error)
        details["cleanup_removed"] = cleanup_removed
        return SmokeResult("retention_retry", False, details)


def _drop_queue_tables(database_url: str, queue_table: str, status_table: str) -> None:
    from psycopg import connect, sql

    with connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(queue_table)))
            cursor.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(status_table)))


def _age_dequeued_row(database_url: str, queue_table: str, queue_id: str) -> None:
    from psycopg import connect, sql

    with connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                sql.SQL("UPDATE {} SET dequeued_at = NOW() - INTERVAL '900 seconds' WHERE queue_id = %s").format(
                    sql.Identifier(queue_table)
                ),
                (queue_id,),
            )


def _with_queue_cleanup_result(
    result: SmokeResult,
    database_url: str,
    queue_table: str,
    status_table: str,
) -> SmokeResult:
    from dataclasses import replace

    try:
        _drop_queue_tables(database_url, queue_table, status_table)
    except Exception as error:
        details = dict(result.details)
        details["cleanup_removed"] = False
        details["cleanup_error_type"] = type(error).__name__
        details["cleanup_root_error_type"] = type(_root_error(error)).__name__
        cleanup_message = _safe_error_message(_root_error(error))
        if cleanup_message:
            details["cleanup_root_error_message"] = cleanup_message
        return replace(result, passed=False, details=details)
    details = dict(result.details)
    details["cleanup_removed"] = True
    return replace(result, details=details)


def _run_postgres_queue_crash_rehearsal() -> SmokeResult:
    from backend.modules.ops.deletion_queue import (
        DeletionQueueConsumer,
        DeletionRequest,
        DeletionStatus,
        DeletionStatusSnapshot,
        DeletionTarget,
        NoOpDeletionHandler,
        PostgresDeletionQueueStorage,
    )

    database_url = os.environ["DATABASE_URL"]
    suffix = uuid4().hex[:12]
    queue_table = f"staging_smoke_deletion_queue_{suffix}"
    status_table = f"staging_smoke_deletion_status_{suffix}"
    storage = PostgresDeletionQueueStorage(
        database_url=database_url,
        queue_table_name=queue_table,
        status_table_name=status_table,
    )
    now = datetime.now(timezone.utc)
    item = DeletionRequest(
        queue_id=f"staging-smoke-{suffix}",
        created_at=now,
        target=DeletionTarget.DATA,
        user_id=f"staging-user-{suffix}",
        reason="staging_integration_smoke",
    )
    result: SmokeResult
    try:
        storage.enqueue(item)
        claimed = storage.dequeue()
        if claimed is None:
            raise RuntimeError("queue_claim_missing")
        _age_dequeued_row(database_url, queue_table, item.queue_id)
        storage.save_status(
            DeletionStatusSnapshot(
                queue_id=item.queue_id,
                created_at=item.created_at,
                updated_at=now - timedelta(seconds=900),
                status=DeletionStatus.IN_PROGRESS,
                target=item.target,
                user_id=item.user_id,
                request_id=item.request_id,
                reason=item.reason,
            )
        )
        recovered = storage.requeue_stale(lease_seconds=300)
        status_after_requeue = storage.get_status(item.queue_id)
        consumer = DeletionQueueConsumer(storage, NoOpDeletionHandler())
        consume_result = consumer.consume_queue_id(item.queue_id)
        final_status = storage.get_status(item.queue_id)
        final_size = storage.size()
        passed = (
            recovered == 1
            and status_after_requeue is not None
            and status_after_requeue.status == DeletionStatus.PENDING
            and consume_result is not None
            and consume_result.status == DeletionStatus.DONE
            and final_status is not None
            and final_status.status == DeletionStatus.DONE
            and final_size == 0
        )
        result = SmokeResult(
            name="postgres_queue_crash_rehearsal",
            passed=passed,
            details={
                "recovered": recovered,
                "status_after_requeue": status_after_requeue.status.value if status_after_requeue else None,
                "consume_result": consume_result.status.value if consume_result else None,
                "final_status": final_status.status.value if final_status else None,
                "final_size": final_size,
            },
        )
    except Exception as error:
        result = SmokeResult("postgres_queue_crash_rehearsal", False, _safe_error_details(error))
    return _with_queue_cleanup_result(result, database_url, queue_table, status_table)


def _run_smokes(artifact_dir: Path) -> int:
    results: list[SmokeResult] = []
    try:
        import backend.server as server
    except Exception as error:
        results.append(SmokeResult("server_import", False, _safe_error_details(error)))
        _write_summary(artifact_dir, results)
        for result in results:
            print(f"[StagingSmoke] {result.name}: FAIL")
        return 1

    try:
        results.append(_run_media_delete_smoke(server))
    except Exception as error:
        results.append(SmokeResult("media_delete", False, _safe_error_details(error)))
    try:
        results.append(_run_retention_retry_smoke(server))
    except Exception as error:
        results.append(SmokeResult("retention_retry", False, _safe_error_details(error)))
    try:
        results.append(_run_postgres_queue_crash_rehearsal())
    except Exception as error:
        results.append(SmokeResult("postgres_queue_crash_rehearsal", False, _safe_error_details(error)))
    _write_summary(artifact_dir, results)
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(f"[StagingSmoke] {result.name}: {status}")
    return 0 if all(result.passed for result in results) else 1


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run FoodLens staging integration smoke checks.")
    parser.add_argument("--check-env-only", action="store_true")
    parser.add_argument("--artifact-dir", default=os.environ.get(ARTIFACT_DIR_ENV_NAME, DEFAULT_ARTIFACT_DIR))
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    _ensure_repo_root_on_path()
    _load_backend_env()
    args = _parse_args(argv)
    _configure_runtime_env()
    _configure_logging()
    missing = missing_required_env(os.environ)
    if missing:
        if not args.check_env_only:
            _write_summary(
                Path(str(args.artifact_dir)),
                [SmokeResult("required_env", False, {"missing_env": missing})],
            )
        print(f"[StagingSmoke] Missing required env: {', '.join(missing)}", file=sys.stderr)
        return 2
    if args.check_env_only:
        print("[StagingSmoke] Required env is present.")
        return 0
    return _run_smokes(Path(str(args.artifact_dir)))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
