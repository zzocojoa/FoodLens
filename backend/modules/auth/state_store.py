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


class AuthProjectionStore(Protocol):
    def save_projection(self, payload: dict[str, object]) -> None:
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


@dataclass(slots=True)
class PostgresAuthProjectionStore:
    database_url: str
    table_prefix: str = "auth_projection"

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise AuthStateStoreError("DATABASE_URL is required for postgres auth projection backend.")
        self.table_prefix = self._sanitize_table_name(self.table_prefix)

    def save_projection(self, payload: dict[str, object]) -> None:
        connect = self._load_connect()
        try:
            users = self._as_list(payload.get("users"))
            profiles = self._as_list(payload.get("profiles"))
            allergies = self._as_list(payload.get("allergies"))
            settings = self._as_list(payload.get("settings"))
            history = self._as_list(payload.get("history"))
            media_assets = self._as_list(payload.get("media_assets"))
            user_ids = [str(row.get("user_id")) for row in users if row.get("user_id")]
            history_ids = [str(row.get("id")) for row in history if row.get("id")]
            asset_ids = [str(row.get("asset_id")) for row in media_assets if row.get("asset_id")]

            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    for row in users:
                        cursor.execute(
                            (
                                f"INSERT INTO {self._table('users')} "
                                "(user_id,email,display_name,provider,provider_subject,locale,email_verified_at,created_at,updated_at) "
                                "VALUES (%s,%s,%s,%s,%s,%s,%s::timestamptz,%s::timestamptz,%s::timestamptz) "
                                "ON CONFLICT (user_id) DO UPDATE SET "
                                "email=EXCLUDED.email,"
                                "display_name=EXCLUDED.display_name,"
                                "provider=EXCLUDED.provider,"
                                "provider_subject=EXCLUDED.provider_subject,"
                                "locale=EXCLUDED.locale,"
                                "email_verified_at=EXCLUDED.email_verified_at,"
                                "updated_at=EXCLUDED.updated_at"
                            ),
                            (
                                row.get("user_id"),
                                row.get("email"),
                                row.get("display_name"),
                                row.get("provider"),
                                row.get("provider_subject"),
                                row.get("locale"),
                                row.get("email_verified_at"),
                                row.get("created_at"),
                                row.get("updated_at"),
                            ),
                        )

                    for row in profiles:
                        cursor.execute(
                            (
                                f"INSERT INTO {self._table('profiles')} "
                                "(user_id,email,display_name,profile_image_url,profile_image_asset_id,gender,birth_year,"
                                "disliked_ingredients,locale,timezone,current_trip_start,current_trip_location,current_trip_coordinates,"
                                "created_at,updated_at) "
                                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s::jsonb,%s::timestamptz,%s::timestamptz) "
                                "ON CONFLICT (user_id) DO UPDATE SET "
                                "email=EXCLUDED.email,"
                                "display_name=EXCLUDED.display_name,"
                                "profile_image_url=EXCLUDED.profile_image_url,"
                                "profile_image_asset_id=EXCLUDED.profile_image_asset_id,"
                                "gender=EXCLUDED.gender,"
                                "birth_year=EXCLUDED.birth_year,"
                                "disliked_ingredients=EXCLUDED.disliked_ingredients,"
                                "locale=EXCLUDED.locale,"
                                "timezone=EXCLUDED.timezone,"
                                "current_trip_start=EXCLUDED.current_trip_start,"
                                "current_trip_location=EXCLUDED.current_trip_location,"
                                "current_trip_coordinates=EXCLUDED.current_trip_coordinates,"
                                "updated_at=EXCLUDED.updated_at"
                            ),
                            (
                                row.get("user_id"),
                                row.get("email"),
                                row.get("display_name"),
                                row.get("profile_image_url"),
                                row.get("profile_image_asset_id"),
                                row.get("gender"),
                                row.get("birth_year"),
                                json.dumps(row.get("disliked_ingredients") or [], ensure_ascii=False),
                                row.get("locale"),
                                row.get("timezone"),
                                row.get("current_trip_start"),
                                row.get("current_trip_location"),
                                json.dumps(row.get("current_trip_coordinates"), ensure_ascii=False),
                                row.get("created_at"),
                                row.get("updated_at"),
                            ),
                        )

                    for row in allergies:
                        cursor.execute(
                            (
                                f"INSERT INTO {self._table('allergies')} "
                                "(user_id,allergies,dietary_restrictions,severity_map,updated_at) "
                                "VALUES (%s,%s::jsonb,%s::jsonb,%s::jsonb,%s::timestamptz) "
                                "ON CONFLICT (user_id) DO UPDATE SET "
                                "allergies=EXCLUDED.allergies,"
                                "dietary_restrictions=EXCLUDED.dietary_restrictions,"
                                "severity_map=EXCLUDED.severity_map,"
                                "updated_at=EXCLUDED.updated_at"
                            ),
                            (
                                row.get("user_id"),
                                json.dumps(row.get("allergies") or [], ensure_ascii=False),
                                json.dumps(row.get("dietary_restrictions") or [], ensure_ascii=False),
                                json.dumps(row.get("severity_map") or {}, ensure_ascii=False),
                                row.get("updated_at"),
                            ),
                        )

                    for row in settings:
                        cursor.execute(
                            (
                                f"INSERT INTO {self._table('settings')} "
                                "(user_id,language,target_language,auto_play_audio,selected_emoji,client_state,updated_at) "
                                "VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s::timestamptz) "
                                "ON CONFLICT (user_id) DO UPDATE SET "
                                "language=EXCLUDED.language,"
                                "target_language=EXCLUDED.target_language,"
                                "auto_play_audio=EXCLUDED.auto_play_audio,"
                                "selected_emoji=EXCLUDED.selected_emoji,"
                                "client_state=EXCLUDED.client_state,"
                                "updated_at=EXCLUDED.updated_at"
                            ),
                            (
                                row.get("user_id"),
                                row.get("language"),
                                row.get("target_language"),
                                bool(row.get("auto_play_audio")),
                                row.get("selected_emoji"),
                                json.dumps(row.get("client_state") or {}, ensure_ascii=False),
                                row.get("updated_at"),
                            ),
                        )

                    for row in history:
                        cursor.execute(
                            (
                                f"INSERT INTO {self._table('history')} "
                                "(history_id,user_id,entry,idempotency_key,created_at,updated_at) "
                                "VALUES (%s,%s,%s::jsonb,%s,%s::timestamptz,%s::timestamptz) "
                                "ON CONFLICT (history_id) DO UPDATE SET "
                                "user_id=EXCLUDED.user_id,"
                                "entry=EXCLUDED.entry,"
                                "idempotency_key=EXCLUDED.idempotency_key,"
                                "updated_at=EXCLUDED.updated_at"
                            ),
                            (
                                row.get("id"),
                                row.get("user_id"),
                                json.dumps(row.get("entry") or {}, ensure_ascii=False),
                                row.get("idempotency_key"),
                                row.get("created_at"),
                                row.get("updated_at"),
                            ),
                        )

                    for row in media_assets:
                        cursor.execute(
                            (
                                f"INSERT INTO {self._table('media_assets')} "
                                "(asset_id,user_id,scope,mime_type,size_bytes,sha256,object_key,created_at,updated_at,last_accessed_at) "
                                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s::timestamptz,%s::timestamptz,%s::timestamptz) "
                                "ON CONFLICT (asset_id) DO UPDATE SET "
                                "user_id=EXCLUDED.user_id,"
                                "scope=EXCLUDED.scope,"
                                "mime_type=EXCLUDED.mime_type,"
                                "size_bytes=EXCLUDED.size_bytes,"
                                "sha256=EXCLUDED.sha256,"
                                "object_key=EXCLUDED.object_key,"
                                "updated_at=EXCLUDED.updated_at,"
                                "last_accessed_at=EXCLUDED.last_accessed_at"
                            ),
                            (
                                row.get("asset_id"),
                                row.get("user_id"),
                                row.get("scope"),
                                row.get("mime_type"),
                                int(row.get("size_bytes") or 0),
                                row.get("sha256"),
                                row.get("object_key"),
                                row.get("created_at"),
                                row.get("updated_at"),
                                row.get("last_accessed_at"),
                            ),
                        )
                    self._delete_missing_projection_rows(
                        cursor=cursor,
                        user_ids=user_ids,
                        history_ids=history_ids,
                        asset_ids=asset_ids,
                    )
        except Exception as error:  # pragma: no cover - defensive integration guard
            raise AuthStateStoreError(f"Failed to save auth projection to postgres: {error}") from error

    def _delete_missing_projection_rows(
        self,
        *,
        cursor: object,
        user_ids: list[str],
        history_ids: list[str],
        asset_ids: list[str],
    ) -> None:
        self._delete_missing_by_column(cursor=cursor, table=self._table("users"), column="user_id", values=user_ids)
        self._delete_missing_by_column(cursor=cursor, table=self._table("profiles"), column="user_id", values=user_ids)
        self._delete_missing_by_column(cursor=cursor, table=self._table("allergies"), column="user_id", values=user_ids)
        self._delete_missing_by_column(cursor=cursor, table=self._table("settings"), column="user_id", values=user_ids)
        self._delete_missing_by_column(cursor=cursor, table=self._table("history"), column="history_id", values=history_ids)
        self._delete_missing_by_column(cursor=cursor, table=self._table("media_assets"), column="asset_id", values=asset_ids)

    def _delete_missing_by_column(
        self,
        *,
        cursor: object,
        table: str,
        column: str,
        values: list[str],
    ) -> None:
        if values:
            cursor.execute(
                f"DELETE FROM {table} WHERE {column} <> ALL(%s)",
                (values,),
            )
            return
        cursor.execute(f"DELETE FROM {table}")

    def _ensure_tables(self, conn: object) -> None:
        users = self._table("users")
        profiles = self._table("profiles")
        allergies = self._table("allergies")
        settings = self._table("settings")
        history = self._table("history")
        media_assets = self._table("media_assets")
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {users} ("
                    "user_id TEXT PRIMARY KEY,"
                    "email TEXT NOT NULL,"
                    "display_name TEXT NULL,"
                    "provider TEXT NOT NULL,"
                    "provider_subject TEXT NULL,"
                    "locale TEXT NOT NULL,"
                    "email_verified_at TIMESTAMPTZ NULL,"
                    "created_at TIMESTAMPTZ NOT NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL"
                    ")"
                )
            )
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {profiles} ("
                    "user_id TEXT PRIMARY KEY,"
                    "email TEXT NOT NULL,"
                    "display_name TEXT NULL,"
                    "profile_image_url TEXT NULL,"
                    "profile_image_asset_id TEXT NULL,"
                    "gender TEXT NULL,"
                    "birth_year INTEGER NULL,"
                    "disliked_ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,"
                    "locale TEXT NOT NULL,"
                    "timezone TEXT NOT NULL,"
                    "current_trip_start TEXT NULL,"
                    "current_trip_location TEXT NULL,"
                    "current_trip_coordinates JSONB NULL,"
                    "created_at TIMESTAMPTZ NOT NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL"
                    ")"
                )
            )
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {allergies} ("
                    "user_id TEXT PRIMARY KEY,"
                    "allergies JSONB NOT NULL DEFAULT '[]'::jsonb,"
                    "dietary_restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,"
                    "severity_map JSONB NOT NULL DEFAULT '{}'::jsonb,"
                    "updated_at TIMESTAMPTZ NOT NULL"
                    ")"
                )
            )
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {settings} ("
                    "user_id TEXT PRIMARY KEY,"
                    "language TEXT NOT NULL,"
                    "target_language TEXT NULL,"
                    "auto_play_audio BOOLEAN NOT NULL DEFAULT FALSE,"
                    "selected_emoji TEXT NULL,"
                    "client_state JSONB NOT NULL DEFAULT '{}'::jsonb,"
                    "updated_at TIMESTAMPTZ NOT NULL"
                    ")"
                )
            )
            cursor.execute(
                f"ALTER TABLE {settings} ADD COLUMN IF NOT EXISTS client_state JSONB NOT NULL DEFAULT '{{}}'::jsonb"
            )
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {history} ("
                    "history_id TEXT PRIMARY KEY,"
                    "user_id TEXT NOT NULL,"
                    "entry JSONB NOT NULL,"
                    "idempotency_key TEXT NULL,"
                    "created_at TIMESTAMPTZ NOT NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL"
                    ")"
                )
            )
            cursor.execute(f"CREATE INDEX IF NOT EXISTS {history}_user_id_idx ON {history} (user_id)")
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {media_assets} ("
                    "asset_id TEXT PRIMARY KEY,"
                    "user_id TEXT NOT NULL,"
                    "scope TEXT NOT NULL,"
                    "mime_type TEXT NOT NULL,"
                    "size_bytes INTEGER NOT NULL,"
                    "sha256 TEXT NOT NULL,"
                    "object_key TEXT NOT NULL,"
                    "created_at TIMESTAMPTZ NOT NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL,"
                    "last_accessed_at TIMESTAMPTZ NOT NULL"
                    ")"
                )
            )
            cursor.execute(f"CREATE INDEX IF NOT EXISTS {media_assets}_user_id_idx ON {media_assets} (user_id)")

    def _load_connect(self):
        try:
            from psycopg import connect  # type: ignore
        except Exception as error:  # pragma: no cover - import guard
            raise AuthStateStoreError(
                "psycopg is required for postgres auth projection backend. Install backend/requirements.txt."
            ) from error
        return connect

    @staticmethod
    def _sanitize_table_name(raw: str) -> str:
        candidate = (raw or "").strip() or "auth_projection"
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", candidate):
            raise AuthStateStoreError("AUTH_PROJECTION_TABLE_PREFIX has invalid format.")
        return candidate

    def _table(self, suffix: str) -> str:
        return f"{self.table_prefix}_{suffix}"

    @staticmethod
    def _as_list(value: object) -> list[dict[str, object]]:
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, dict)]
