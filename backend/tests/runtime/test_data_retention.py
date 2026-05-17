import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.modules.ops.data_retention import (
    AnalysisJobsSensitivePayloadRetentionConfig,
    CallbackRetentionCleanupAdapter,
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

    def test_analysis_jobs_ttl_scrub_config_defaults_to_disabled_dry_run(self) -> None:
        config = AnalysisJobsSensitivePayloadRetentionConfig.from_env(
            lambda _name: None,
            RetentionPolicyConfig(original_ttl_days=45, derived_ttl_days=90, log_ttl_days=14),
        )

        self.assertFalse(config.enabled)
        self.assertTrue(config.dry_run)
        self.assertEqual(config.ttl_days, 45)
        self.assertEqual(config.batch_size, 100)

    def test_analysis_jobs_ttl_scrub_config_uses_env_with_minimums(self) -> None:
        values = {
            "ANALYSIS_JOBS_TTL_SCRUB_ENABLED": "1",
            "ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN": "0",
            "ANALYSIS_JOBS_TTL_SCRUB_DAYS": "0",
            "ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE": "-5",
        }
        config = AnalysisJobsSensitivePayloadRetentionConfig.from_env(
            values.get,
            RetentionPolicyConfig(original_ttl_days=30, derived_ttl_days=90, log_ttl_days=14),
        )

        self.assertTrue(config.enabled)
        self.assertFalse(config.dry_run)
        self.assertEqual(config.ttl_days, 1)
        self.assertEqual(config.batch_size, 1)

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
        remaining = store.list_records(RetentionDataClass.DERIVED, 10)
        self.assertEqual([item.record_id for item in remaining], ["fresh-derived"])

    def test_cleanup_keeps_record_when_delete_callback_returns_false(self) -> None:
        now = datetime(2026, 2, 14, tzinfo=timezone.utc)
        store = InMemoryRetentionStore(
            [
                RetentionRecord(
                    record_id="expired-original",
                    data_class=RetentionDataClass.ORIGINAL,
                    created_at=now - timedelta(days=31),
                ),
            ]
        )
        adapter = CallbackRetentionCleanupAdapter(lambda _record: False)
        job = RetentionCleanupJob(
            store=store,
            policy=RetentionPolicyConfig(original_ttl_days=30, derived_ttl_days=90, log_ttl_days=14),
            adapter=adapter,
        )

        result = job.run_once(data_class=RetentionDataClass.ORIGINAL, now=now)

        self.assertEqual(result.deleted_count, 0)
        self.assertEqual([item.record_id for item in store.list_records(RetentionDataClass.ORIGINAL, 10)], ["expired-original"])

    def test_in_memory_retention_store_upserts_same_record_id(self) -> None:
        now = datetime(2026, 2, 14, tzinfo=timezone.utc)
        store = InMemoryRetentionStore()

        store.add(
            RetentionRecord(
                record_id="asset-1",
                data_class=RetentionDataClass.ORIGINAL,
                created_at=now,
                user_id="usr-1",
                storage_key="media/usr-1/history/asset-1/original.jpg",
                object_generation=1,
            )
        )
        store.add(
            RetentionRecord(
                record_id="asset-1",
                data_class=RetentionDataClass.ORIGINAL,
                created_at=now - timedelta(days=31),
                user_id="usr-1",
                storage_key="media/usr-1/history/asset-1/original.jpg",
                object_generation=2,
            )
        )

        records = store.list_records(RetentionDataClass.ORIGINAL, 10)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].object_generation, 2)
        self.assertEqual(records[0].created_at, now - timedelta(days=31))

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

    def test_json_file_retention_store_upserts_same_record_id(self) -> None:
        now = datetime(2026, 2, 14, tzinfo=timezone.utc)
        with TemporaryDirectory() as tmp:
            store = JsonFileRetentionStore(str(Path(tmp) / "retention.json"))
            store.add(
                RetentionRecord(
                    record_id="asset-1",
                    data_class=RetentionDataClass.ORIGINAL,
                    created_at=now,
                    user_id="usr-1",
                    storage_key="media/usr-1/history/asset-1/original.jpg",
                    object_generation=1,
                )
            )
            store.add(
                RetentionRecord(
                    record_id="asset-1",
                    data_class=RetentionDataClass.ORIGINAL,
                    created_at=now - timedelta(days=31),
                    user_id="usr-1",
                    storage_key="media/usr-1/history/asset-1/original.jpg",
                    object_generation=2,
                )
            )

            reopened = JsonFileRetentionStore(str(Path(tmp) / "retention.json"))
            records = reopened.list_records(RetentionDataClass.ORIGINAL, 10)
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0].object_generation, 2)

    def test_json_file_retention_store_remove_persists(self) -> None:
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
            store.add(
                RetentionRecord(
                    record_id="rec-2",
                    data_class=RetentionDataClass.LOG,
                    created_at=now,
                    request_id="req-2",
                )
            )

            store.remove("rec-1")

            reopened = JsonFileRetentionStore(str(Path(tmp) / "retention.json"))
            records = reopened.list_records(RetentionDataClass.LOG, 10)
            self.assertEqual([item.record_id for item in records], ["rec-2"])

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
