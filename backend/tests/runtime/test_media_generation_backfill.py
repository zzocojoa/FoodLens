import hashlib
import unittest

from backend.modules.media.service import MediaObjectPayload, MediaStorageError
from backend.scripts.backfill_media_object_generations import run_backfill


class _FakeAuthService:
    def __init__(self, assets: list[dict[str, object]]) -> None:
        self.assets = assets
        self.updated: list[tuple[str, int]] = []

    def list_media_assets(self) -> list[dict[str, object]]:
        return [dict(asset) for asset in self.assets]

    def update_media_asset_generation(self, *, asset_id: str, object_generation: int) -> dict[str, object]:
        self.updated.append((asset_id, object_generation))
        for asset in self.assets:
            if asset["asset_id"] == asset_id:
                asset["object_generation"] = object_generation
                return dict(asset)
        raise AssertionError("missing asset")


class _FakeMediaStorage:
    def __init__(self, payloads: dict[str, bytes], generations: dict[str, int]) -> None:
        self.payloads = payloads
        self.generations = generations

    def fetch_original(self, *, object_key: str) -> MediaObjectPayload:
        if object_key not in self.payloads:
            raise MediaStorageError(
                code="MEDIA_NOT_FOUND",
                message="Media object not found.",
                status_code=404,
            )
        return MediaObjectPayload(bytes_data=self.payloads[object_key], mime_type="image/png")

    def get_original_generation(self, *, object_key: str) -> int:
        return self.generations[object_key]


class _FakeRetentionStore:
    def __init__(self) -> None:
        self.records: list[object] = []

    def add(self, record: object) -> None:
        self.records.append(record)


class MediaGenerationBackfillTests(unittest.TestCase):
    def _asset(self, *, payload: bytes, object_generation: int | None) -> dict[str, object]:
        return {
            "asset_id": "asset_legacy",
            "user_id": "usr_legacy",
            "scope": "history",
            "mime_type": "image/png",
            "size_bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
            "object_key": "media/usr_legacy/history/asset_legacy/original.png",
            "object_generation": object_generation,
            "created_at": "2026-05-01T00:00:00Z",
        }

    def test_dry_run_verifies_legacy_asset_without_writes(self) -> None:
        payload = b"abc"
        auth_service = _FakeAuthService([self._asset(payload=payload, object_generation=None)])
        media_storage = _FakeMediaStorage(
            {"media/usr_legacy/history/asset_legacy/original.png": payload},
            {"media/usr_legacy/history/asset_legacy/original.png": 77},
        )
        retention_store = _FakeRetentionStore()

        result = run_backfill(
            auth_service=auth_service,
            media_storage=media_storage,
            retention_store=retention_store,
            apply_changes=False,
            limit=None,
        )

        self.assertEqual(result.updated, 1)
        self.assertEqual(auth_service.updated, [])
        self.assertEqual(retention_store.records, [])

    def test_apply_updates_auth_and_retention_when_hash_matches(self) -> None:
        payload = b"abc"
        auth_service = _FakeAuthService([self._asset(payload=payload, object_generation=None)])
        media_storage = _FakeMediaStorage(
            {"media/usr_legacy/history/asset_legacy/original.png": payload},
            {"media/usr_legacy/history/asset_legacy/original.png": 77},
        )
        retention_store = _FakeRetentionStore()

        result = run_backfill(
            auth_service=auth_service,
            media_storage=media_storage,
            retention_store=retention_store,
            apply_changes=True,
            limit=None,
        )

        self.assertEqual(result.updated, 1)
        self.assertEqual(auth_service.updated, [("asset_legacy", 77)])
        self.assertEqual(len(retention_store.records), 1)

    def test_hash_mismatch_skips_without_writes(self) -> None:
        auth_service = _FakeAuthService([self._asset(payload=b"abc", object_generation=None)])
        media_storage = _FakeMediaStorage(
            {"media/usr_legacy/history/asset_legacy/original.png": b"changed"},
            {"media/usr_legacy/history/asset_legacy/original.png": 77},
        )
        retention_store = _FakeRetentionStore()

        result = run_backfill(
            auth_service=auth_service,
            media_storage=media_storage,
            retention_store=retention_store,
            apply_changes=True,
            limit=None,
        )

        self.assertEqual(result.updated, 0)
        self.assertEqual(result.skipped_hash_mismatch, 1)
        self.assertEqual(auth_service.updated, [])
        self.assertEqual(retention_store.records, [])

    def test_object_key_mismatch_skips_without_writes(self) -> None:
        payload = b"abc"
        asset = self._asset(payload=payload, object_generation=None)
        asset["object_key"] = "media/other-user/history/asset_legacy/original.png"
        auth_service = _FakeAuthService([asset])
        media_storage = _FakeMediaStorage(
            {"media/other-user/history/asset_legacy/original.png": payload},
            {"media/other-user/history/asset_legacy/original.png": 77},
        )
        retention_store = _FakeRetentionStore()

        result = run_backfill(
            auth_service=auth_service,
            media_storage=media_storage,
            retention_store=retention_store,
            apply_changes=True,
            limit=None,
        )

        self.assertEqual(result.updated, 0)
        self.assertEqual(result.skipped_object_key_mismatch, 1)
        self.assertEqual(auth_service.updated, [])
        self.assertEqual(retention_store.records, [])


if __name__ == "__main__":
    unittest.main()
