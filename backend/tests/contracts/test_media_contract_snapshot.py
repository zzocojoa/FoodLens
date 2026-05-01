import json
import unittest
from pathlib import Path


class MediaContractSnapshotTests(unittest.TestCase):
    def test_media_paths_are_published(self) -> None:
        schema_path = Path("backend/contracts/openapi.json")
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        paths = schema["paths"]

        self.assertIn("/me/media/upload", paths)
        self.assertIn("post", paths["/me/media/upload"])
        self.assertIn("/me/media/{asset_id}", paths)
        self.assertIn("delete", paths["/me/media/{asset_id}"])
        self.assertIn("/media/render/{asset_id}", paths)
        self.assertIn("get", paths["/media/render/{asset_id}"])

    def test_media_delete_contract_shape(self) -> None:
        schema_path = Path("backend/contracts/openapi.json")
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        media_delete = schema["paths"]["/me/media/{asset_id}"]["delete"]

        self.assertIn("asset_id", json.dumps(media_delete.get("parameters", [])))
        self.assertIn("200", media_delete["responses"])


if __name__ == "__main__":
    unittest.main()
