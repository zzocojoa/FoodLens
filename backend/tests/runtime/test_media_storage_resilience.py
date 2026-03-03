import unittest

from backend.modules.media.service import GcsMediaStorage, MediaStorageError


class _FakeBlob:
    def __init__(self, *, upload_exc: Exception | None = None):
        self.upload_exc = upload_exc
        self.cache_control = None

    def upload_from_string(self, _payload: bytes, content_type: str | None = None):
        if self.upload_exc is not None:
            raise self.upload_exc
        return None


class _FakeBucket:
    def __init__(self, blob: _FakeBlob):
        self._blob = blob
        self.last_object_key = None

    def blob(self, object_key: str):
        self.last_object_key = object_key
        return self._blob


class _FakeGcsError(Exception):
    def __init__(self, status_code: int):
        super().__init__(f"http {status_code}")
        self.code = status_code
        self.response = type("Response", (), {"status_code": status_code})()


class MediaStorageResilienceTests(unittest.TestCase):
    def _build_storage(self, *, upload_exc: Exception | None = None) -> GcsMediaStorage:
        storage = object.__new__(GcsMediaStorage)
        storage.bucket_name = "test-bucket"
        storage.object_prefix = "media"
        storage.max_upload_bytes = 2 * 1024 * 1024
        storage._bucket = _FakeBucket(_FakeBlob(upload_exc=upload_exc))
        return storage

    def test_upload_maps_missing_bucket_to_503(self):
        storage = self._build_storage(upload_exc=_FakeGcsError(404))

        with self.assertRaises(MediaStorageError) as captured:
            storage.upload_original(
                user_id="usr_1",
                scope="profile",
                mime_type="image/jpeg",
                payload=b"abc",
            )

        self.assertEqual(captured.exception.code, "MEDIA_GCS_BUCKET_NOT_FOUND")
        self.assertEqual(captured.exception.status_code, 503)

    def test_upload_maps_permission_denied_to_503(self):
        storage = self._build_storage(upload_exc=_FakeGcsError(403))

        with self.assertRaises(MediaStorageError) as captured:
            storage.upload_original(
                user_id="usr_1",
                scope="history",
                mime_type="image/png",
                payload=b"abc",
            )

        self.assertEqual(captured.exception.code, "MEDIA_GCS_PERMISSION_DENIED")
        self.assertEqual(captured.exception.status_code, 503)

    def test_upload_maps_unclassified_upstream_error_to_502(self):
        storage = self._build_storage(upload_exc=RuntimeError("unexpected"))

        with self.assertRaises(MediaStorageError) as captured:
            storage.upload_original(
                user_id="usr_1",
                scope="history",
                mime_type="image/webp",
                payload=b"abc",
            )

        self.assertEqual(captured.exception.code, "MEDIA_UPLOAD_FAILED")
        self.assertEqual(captured.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
