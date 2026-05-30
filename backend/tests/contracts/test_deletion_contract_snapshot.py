import json
import unittest
from pathlib import Path


class DeletionContractSnapshotTests(unittest.TestCase):
    def test_deletion_status_payload_excludes_internal_failure_fields(self) -> None:
        schema_path = Path("backend/contracts/openapi.json")
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        payload_schema = schema["components"]["schemas"]["DeletionStatusPayload"]
        properties = payload_schema["properties"]

        self.assertEqual(
            set(properties),
            {
                "request_id",
                "target",
                "status",
                "requested_at",
                "completed_at",
                "retryable",
                "failure_code",
                "message",
            },
        )
        for forbidden_property in (
            "queue_id",
            "reason",
            "error",
            "error_detail",
            "failure_reason",
            "retry_count",
            "next_attempt_at",
        ):
            self.assertNotIn(forbidden_property, properties)

    def test_deletion_status_payload_failure_code_is_fixed(self) -> None:
        schema_path = Path("backend/contracts/openapi.json")
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        properties = schema["components"]["schemas"]["DeletionStatusPayload"]["properties"]

        self.assertEqual(
            properties["failure_code"]["anyOf"][0]["const"],
            "DELETION_REQUEST_FAILED",
        )
        self.assertEqual(
            properties["message"]["anyOf"][0]["const"],
            "Deletion request failed. Please retry or contact support with request_id.",
        )
        self.assertEqual(properties["target"]["enum"], ["account", "data"])


if __name__ == "__main__":
    unittest.main()
