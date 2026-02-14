import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.modules.ops.data_retention import (
    InMemoryRetentionStore,
    JsonFileRetentionStore,
    LocalFileRetentionCleanupAdapter,
    NoOpRetentionCleanupAdapter,
    RetentionCleanupJob,
    RetentionDataClass,
    RetentionPolicyConfig,
    RetentionRecord,
)


class DataRetentionTests(unittest.TestCase):
    def test_ttl_expired_selection(self) -> None:
        now = datetime(2026, 2, 14, tzinfo=timezone.utc)
        store = InMemoryRetentionStore(
            [
                RetentionRecord(
                    record_id="old-original",
                    data_class=RetentionDataClass.ORIGINAL,
                    created_at=now - timedelta(days=31),
                    user_id="user-a",
                ),
                RetentionRecord(
                    record_id="fresh-original",
                    data_class=RetentionDataClass.ORIGINAL,
                    created_at=now - timedelta(days=10),
                    user_id="user-a",
                ),
                RetentionRecord(
                    record_id="old-log",
                    data_class=RetentionDataClass.LOG,
                    created_at=now - timedelta(days=20),
                    request_id="req-1",
                ),
            ]
        )
        job = RetentionCleanupJob(
            store=store,
            policy=RetentionPolicyConfig(original_ttl_days=30, derived_ttl_days=90, log_ttl_days=14),
            adapter=NoOpRetentionCleanupAdapter(),
        )

        expired_original = job.select_expired(data_class=RetentionDataClass.ORIGINAL, now=now)
        expired_log = job.select_expired(data_class=RetentionDataClass.LOG, now=now)

        self.assertEqual([item.record_id for item in expired_original], ["old-original"])
        self.assertEqual([item.record_id for item in expired_log], ["old-log"])

    def test_cleanup_run_once_deletes_only_expired(self) -> None:
        now = datetime(2026, 2, 14, tzinfo=timezone.utc)
        store = InMemoryRetentionStore(
            [
                RetentionRecord(
                    record_id="expired-derived",
                    data_class=RetentionDataClass.DERIVED,
                    created_at=now - timedelta(days=100),
                ),
                RetentionRecord(
                    record_id="fresh-derived",
                    data_class=RetentionDataClass.DERIVED,
                    created_at=now - timedelta(days=5),
                ),
            ]
        )
        adapter = NoOpRetentionCleanupAdapter()
        job = RetentionCleanupJob(
            store=store,
            policy=RetentionPolicyConfig(original_ttl_days=30, derived_ttl_days=90, log_ttl_days=14),
            adapter=adapter,
        )

        result = job.run_once(data_class=RetentionDataClass.DERIVED, now=now)

        self.assertEqual(result.scanned_count, 2)
        self.assertEqual(result.expired_count, 1)
        self.assertEqual(result.deleted_count, 1)
        self.assertEqual(adapter.deleted_ids, ["expired-derived"])

    def test_json_file_retention_store_persists_records(self) -> None:
        now = datetime(2026, 2, 14, tzinfo=timezone.utc)
        with TemporaryDirectory() as tmp:
            store = JsonFileRetentionStore(str(Path(tmp) / "retention.json"))
            store.add(
                RetentionRecord(
                    record_id="rec-1",
                    data_class=RetentionDataClass.LOG,
                    created_at=now,
                    request_id="req-1",
                )
            )
            reopened = JsonFileRetentionStore(str(Path(tmp) / "retention.json"))
            records = reopened.list_records(RetentionDataClass.LOG, 10)
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0].record_id, "rec-1")

    def test_local_file_cleanup_adapter_deletes_only_under_allowed_root(self) -> None:
        now = datetime(2026, 2, 14, tzinfo=timezone.utc)
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / "images" / "a.jpg"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("x", encoding="utf-8")

            adapter = LocalFileRetentionCleanupAdapter([str(root)])
            ok_record = RetentionRecord(
                record_id="ok-1",
                data_class=RetentionDataClass.ORIGINAL,
                created_at=now,
                storage_key="images/a.jpg",
            )
            blocked_record = RetentionRecord(
                record_id="blocked-1",
                data_class=RetentionDataClass.ORIGINAL,
                created_at=now,
                storage_key="../outside.txt",
            )

            self.assertTrue(adapter.delete_record(ok_record))
            self.assertFalse(target.exists())
            self.assertFalse(adapter.delete_record(blocked_record))


if __name__ == "__main__":
    unittest.main()
