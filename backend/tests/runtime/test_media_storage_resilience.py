import unittest

from backend.modules.media.service import GcsMediaStorage, MediaStorageError


class _FakeBlob:
    def __init__(
        self,
        *,
        upload_exc: Exception | None = None,
        delete_exc: Exception | None = None,
        reload_exc: Exception | None = None,
        generation: int | str | None = 7,
    ):
        self.upload_exc = upload_exc
        self.delete_exc = delete_exc
        self.reload_exc = reload_exc
        self.generation = generation
        self.cache_control = None
        self.upload_if_generation_match = None
        self.delete_if_generation_match = None

    def upload_from_string(
        self,
        _payload: bytes,
        content_type: str | None = None,
        if_generation_match: int | None = None,
    ):
        self.upload_if_generation_match = if_generation_match
        if self.upload_exc is not None:
            raise self.upload_exc
        return None

    def reload(self):
        if self.reload_exc is not None:
            raise self.reload_exc
        return None

    def delete(self, if_generation_match: int | None = None):
        self.delete_if_generation_match = if_generation_match
        if self.delete_exc is not None:
            raise self.delete_exc
        return True


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
    def _build_storage(
        self,
        *,
        upload_exc: Exception | None = None,
        delete_exc: Exception | None = None,
        reload_exc: Exception | None = None,
        generation: int | str | None = 7,
    ) -> GcsMediaStorage:
        storage = object.__new__(GcsMediaStorage)
        storage.bucket_name = "test-bucket"
        storage.object_prefix = "media"
        storage.max_upload_bytes = 2 * 1024 * 1024
        storage._bucket = _FakeBucket(
            _FakeBlob(
                upload_exc=upload_exc,
                delete_exc=delete_exc,
                reload_exc=reload_exc,
                generation=generation,
            )
        )
        return storage

    def test_upload_uses_create_only_precondition_and_returns_generation(self):
        storage = self._build_storage(generation="9")

        result = storage.upload_original(
            user_id="usr_1",
            scope="profile",
            mime_type="image/jpeg",
            payload=b"abc",
        )

        blob = storage._bucket._blob
        self.assertEqual(blob.upload_if_generation_match, 0)
        self.assertEqual(result.generation, 9)

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

    def test_delete_uses_supplied_generation_precondition(self):
        storage = self._build_storage(generation=11)

        storage.delete_original(object_key="media/usr_1/history/asset_1/original.jpg", generation=17)

        blob = storage._bucket._blob
        self.assertEqual(blob.delete_if_generation_match, 17)

    def test_delete_loads_current_generation_when_not_supplied(self):
        storage = self._build_storage(generation="23")

        storage.delete_original(object_key="media/usr_1/history/asset_1/original.jpg")

        blob = storage._bucket._blob
        self.assertEqual(blob.delete_if_generation_match, 23)

    def test_delete_maps_precondition_failure_to_409(self):
        storage = self._build_storage(delete_exc=_FakeGcsError(412), generation=23)

        with self.assertRaises(MediaStorageError) as captured:
            storage.delete_original(object_key="media/usr_1/history/asset_1/original.jpg")

        self.assertEqual(captured.exception.code, "MEDIA_DELETE_PRECONDITION_FAILED")
        self.assertEqual(captured.exception.status_code, 409)

    def test_get_original_generation_maps_missing_object_to_404(self):
        storage = self._build_storage(reload_exc=_FakeGcsError(404), generation=23)

        with self.assertRaises(MediaStorageError) as captured:
            storage.get_original_generation(object_key="media/usr_1/history/asset_1/original.jpg")

        self.assertEqual(captured.exception.code, "MEDIA_NOT_FOUND")
        self.assertEqual(captured.exception.status_code, 404)

    def test_delete_fails_when_generation_missing_after_reload(self):
        storage = self._build_storage(generation=None)

        with self.assertRaises(MediaStorageError) as captured:
            storage.delete_original(object_key="media/usr_1/history/asset_1/original.jpg")

        self.assertEqual(captured.exception.code, "MEDIA_DELETE_GENERATION_MISSING")
        self.assertEqual(captured.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
