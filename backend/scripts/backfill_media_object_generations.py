#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.modules.auth.service import InMemoryAuthSessionService
from backend.modules.media.service import MediaStorageError, build_media_storage_from_env
from backend.modules.ops.data_retention import (
    InMemoryRetentionStore,
    JsonFileRetentionStore,
    PostgresRetentionStore,
    RetentionDataClass,
    RetentionRecord,
)
from backend.modules.server_bootstrap import load_environment

logger = logging.getLogger("foodlens.media.backfill")


@dataclass(frozen=True)
class BackfillResult:
    scanned: int
    updated: int
    skipped_existing_generation: int
    skipped_missing_object: int
    skipped_hash_mismatch: int
    skipped_object_key_mismatch: int
    failed: int


def _media_object_key_log_hash(object_key: str) -> str:
    return hashlib.sha256(object_key.encode("utf-8")).hexdigest()[:16]


def _parse_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value.strip():
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return datetime.now(timezone.utc)


def _build_retention_store() -> Any:
    database_url = (os.environ.get("DATABASE_URL", "") or "").strip()
    backend = (os.environ.get("RETENTION_STORE_BACKEND", "memory") or "memory").strip().lower()
    if backend == "file":
        return JsonFileRetentionStore(os.environ.get("RETENTION_STORE_PATH", "/tmp/foodlens_retention_store.json"))
    if backend == "postgres":
        return PostgresRetentionStore(
            database_url=database_url,
            table_name=os.environ.get("RETENTION_STORE_TABLE", "retention_records"),
        )
    return InMemoryRetentionStore()


def _verify_legacy_asset_payload(*, media_storage: Any, asset: dict[str, object]) -> int | None:
    object_key = str(asset.get("object_key") or "").strip()
    payload = media_storage.fetch_original(object_key=object_key)
    expected_size = int(asset.get("size_bytes") or -1)
    expected_sha256 = str(asset.get("sha256") or "").strip().lower()
    actual_sha256 = hashlib.sha256(payload.bytes_data).hexdigest()
    if expected_size != len(payload.bytes_data) or expected_sha256 != actual_sha256:
        return None
    return media_storage.get_original_generation(object_key=object_key)


def _is_media_asset_object_key(*, asset: dict[str, object], object_prefix: str) -> bool:
    object_key = str(asset.get("object_key") or "").strip()
    user_id = str(asset.get("user_id") or "").strip()
    scope = str(asset.get("scope") or "").strip()
    asset_id = str(asset.get("asset_id") or "").strip()
    key_parts = [part for part in object_key.strip().strip("/").split("/") if part]
    prefix_parts = [part for part in object_prefix.strip().strip("/").split("/") if part] or ["media"]
    expected_parts = [*prefix_parts, user_id, scope, asset_id]
    if len(key_parts) != len(expected_parts) + 1:
        return False
    return key_parts[:-1] == expected_parts and key_parts[-1].startswith("original.")


def run_backfill(
    *,
    auth_service: Any,
    media_storage: Any,
    retention_store: Any,
    apply_changes: bool,
    limit: int | None,
) -> BackfillResult:
    scanned = 0
    updated = 0
    skipped_existing_generation = 0
    skipped_missing_object = 0
    skipped_hash_mismatch = 0
    skipped_object_key_mismatch = 0
    failed = 0

    assets = auth_service.list_media_assets()
    for asset in assets:
        if limit is not None and scanned >= limit:
            break
        scanned += 1
        if asset.get("object_generation") is not None:
            skipped_existing_generation += 1
            continue

        object_key = str(asset.get("object_key") or "").strip()
        asset_id = str(asset.get("asset_id") or "").strip()
        object_prefix = str(getattr(media_storage, "object_prefix", "media"))
        if not _is_media_asset_object_key(asset=asset, object_prefix=object_prefix):
            skipped_object_key_mismatch += 1
            logger.warning(
                "[MediaBackfill] object key mismatch asset_id=%s object_key_hash=%s",
                asset_id,
                _media_object_key_log_hash(object_key),
            )
            continue
        try:
            generation = _verify_legacy_asset_payload(media_storage=media_storage, asset=asset)
        except MediaStorageError as error:
            if error.code == "MEDIA_NOT_FOUND":
                skipped_missing_object += 1
                logger.warning(
                    "[MediaBackfill] missing object asset_id=%s object_key_hash=%s",
                    asset_id,
                    _media_object_key_log_hash(object_key),
                )
                continue
            failed += 1
            logger.warning(
                "[MediaBackfill] failed asset_id=%s object_key_hash=%s code=%s status=%s",
                asset_id,
                _media_object_key_log_hash(object_key),
                error.code,
                error.status_code,
            )
            continue

        if generation is None:
            skipped_hash_mismatch += 1
            logger.warning(
                "[MediaBackfill] hash mismatch asset_id=%s object_key_hash=%s",
                asset_id,
                _media_object_key_log_hash(object_key),
            )
            continue

        if apply_changes:
            retention_store.add(
                RetentionRecord(
                    record_id=asset_id,
                    data_class=RetentionDataClass.ORIGINAL,
                    created_at=_parse_datetime(asset.get("created_at")),
                    user_id=str(asset.get("user_id") or "") or None,
                    request_id=None,
                    storage_key=object_key,
                    object_generation=generation,
                )
            )
            auth_service.update_media_asset_generation(
                asset_id=asset_id,
                object_generation=generation,
            )
        updated += 1

    return BackfillResult(
        scanned=scanned,
        updated=updated,
        skipped_existing_generation=skipped_existing_generation,
        skipped_missing_object=skipped_missing_object,
        skipped_hash_mismatch=skipped_hash_mismatch,
        skipped_object_key_mismatch=skipped_object_key_mismatch,
        failed=failed,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    load_environment()
    auth_service = InMemoryAuthSessionService.from_env(os.environ.get)
    media_storage = build_media_storage_from_env(os.environ.get)
    retention_store = _build_retention_store()
    result = run_backfill(
        auth_service=auth_service,
        media_storage=media_storage,
        retention_store=retention_store,
        apply_changes=bool(args.apply),
        limit=args.limit,
    )
    mode = "apply" if args.apply else "dry-run"
    print(
        "media_generation_backfill "
        f"mode={mode} scanned={result.scanned} updated={result.updated} "
        f"skipped_existing_generation={result.skipped_existing_generation} "
        f"skipped_missing_object={result.skipped_missing_object} "
        f"skipped_hash_mismatch={result.skipped_hash_mismatch} "
        f"skipped_object_key_mismatch={result.skipped_object_key_mismatch} failed={result.failed}"
    )
    return 1 if result.failed > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
