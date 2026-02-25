from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Protocol


class AuthStateStoreError(Exception):
    pass


class AuthStateStore(Protocol):
    def load(self) -> dict[str, object] | None:
        ...

    def save(self, payload: dict[str, object]) -> None:
        ...


@dataclass(slots=True)
class PostgresAuthStateStore:
    database_url: str
    table_name: str = "auth_runtime_state"
    state_key: str = "default"

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise AuthStateStoreError("DATABASE_URL is required for postgres auth state backend.")
        self.table_name = self._sanitize_table_name(self.table_name)

    def load(self) -> dict[str, object] | None:
        connect = self._load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_table(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"SELECT state_json FROM {self.table_name} WHERE state_key = %s",
                        (self.state_key,),
                    )
                    row = cursor.fetchone()
                    if not row:
                        return None
                    payload = row[0]
                    if isinstance(payload, dict):
                        return payload
                    if isinstance(payload, str):
                        parsed = json.loads(payload)
                        if isinstance(parsed, dict):
                            return parsed
                    raise AuthStateStoreError("Unexpected auth state payload type loaded from postgres.")
        except AuthStateStoreError:
            raise
        except Exception as error:  # pragma: no cover - defensive integration guard
            raise AuthStateStoreError(f"Failed to load auth state from postgres: {error}") from error

    def save(self, payload: dict[str, object]) -> None:
        connect = self._load_connect()
        try:
            serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_table(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.table_name} (state_key, state_json, updated_at) "
                            "VALUES (%s, %s::jsonb, NOW()) "
                            "ON CONFLICT (state_key) DO UPDATE "
                            "SET state_json = EXCLUDED.state_json, updated_at = NOW()"
                        ),
                        (self.state_key, serialized),
                    )
        except Exception as error:  # pragma: no cover - defensive integration guard
            raise AuthStateStoreError(f"Failed to save auth state to postgres: {error}") from error

    def _ensure_table(self, conn: object) -> None:
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.table_name} ("
                    "state_key TEXT PRIMARY KEY,"
                    "state_json JSONB NOT NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
                    ")"
                )
            )

    def _load_connect(self):
        try:
            from psycopg import connect  # type: ignore
        except Exception as error:  # pragma: no cover - import guard
            raise AuthStateStoreError(
                "psycopg is required for postgres auth state backend. Install backend/requirements.txt."
            ) from error
        return connect

    @staticmethod
    def _sanitize_table_name(raw: str) -> str:
        candidate = (raw or "").strip() or "auth_runtime_state"
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", candidate):
            raise AuthStateStoreError("AUTH_STATE_TABLE has invalid format.")
        return candidate
