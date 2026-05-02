#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


JsonValue = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject = dict[str, JsonValue]
BlueprintEnvMap = dict[str, dict[str, str | None]]
LiveEnvMap = dict[str, str | None]
JsonRequester = Callable[[str, str, str], JsonValue]
Sleeper = Callable[[float], None]

RENDER_API_BASE_URL = "https://api.render.com/v1"
DEFAULT_SUMMARY_PATH = "artifacts/phase6/render-live-readiness/summary.json"
SERVICE_ID_ENV_NAMES: dict[str, str] = {
    "foodlens-api": "RENDER_FOODLENS_API_SERVICE_ID",
    "foodlens-worker": "RENDER_FOODLENS_WORKER_SERVICE_ID",
    "foodlens-retention-cron": "RENDER_FOODLENS_RETENTION_CRON_SERVICE_ID",
}
LIVE_STATUS = "live"
FAILED_DEPLOY_STATUSES = frozenset(("build_failed", "update_failed", "canceled", "cancelled"))
REQUEST_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 2.0
MAX_PAGINATION_PAGES = 50
BLUEPRINT_REQUIRED_LITERAL_KEYS: dict[str, str] = {
    "GEMINI_MODEL_NAME": "gemini-2.0-flash",
    "GEMINI_LABEL_PRIMARY_MODEL_NAME": "gemini-2.5-flash",
    "GEMINI_LABEL_FALLBACK_MODEL_NAME": "gemini-2.5-pro",
    "GEMINI_LABEL_PRO_FALLBACK_ENABLED": "0",
    "GEMINI_LABEL_ALLOW_PRO_PRIMARY": "0",
    "LABEL_COST_GUARDRAIL_ENABLED": "1",
    "LABEL_COST_GUARDRAIL_STORAGE_BACKEND": "postgres",
    "LABEL_COST_GUARDRAIL_TABLE": "label_monthly_usage",
    "LABEL_MONTHLY_BUDGET_USD": "10",
    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
    "LABEL_ESTIMATED_TOKENS_PER_REQUEST": "1500",
    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE": "0.012",
    "LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE": "900",
    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK": "0.05",
    "LABEL_ESTIMATED_TOKENS_PER_REQUEST_PRO_FALLBACK": "2500",
    "LABEL_PER_REQUEST_BUDGET_USD": "0.07",
    "COST_GUARDRAIL_RESERVATION_TTL_SECONDS": "900",
    "FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
    "FOOD_ANALYSIS_ESTIMATED_TOKENS_PER_REQUEST": "1500",
    "BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST": "0.003",
    "BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST": "256",
    "SMART_ROUTER_COST_GUARDRAIL_ENABLED": "1",
    "SMART_ROUTER_COST_GUARDRAIL_STORAGE_BACKEND": "postgres",
    "SMART_ROUTER_COST_GUARDRAIL_TABLE": "smart_router_monthly_usage",
    "SMART_ROUTER_MONTHLY_BUDGET_USD": "2",
    "SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST": "0.003",
    "SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST": "128",
    "MEDIA_STORAGE_BACKEND": "gcs",
    "MEDIA_GCS_PREFIX": "media",
    "MEDIA_RENDER_WEBP_METHOD": "4",
    "MEDIA_RENDER_MAX_CONCURRENT_MISSES": "2",
}
LIVE_ONLY_REQUIRED_LITERAL_KEYS: dict[str, str] = {
    "GCP_LOCATION": "us-central1",
    "GEMINI_MAX_CONCURRENT_SLOTS": "3",
    "GEMINI_RETRY_INITIAL_SECONDS": "2.0",
    "GEMINI_RETRY_MAX_SECONDS": "30.0",
    "GEMINI_RETRY_MULTIPLIER": "2.0",
    "GEMINI_429_BACKOFF_INITIAL_SECONDS": "0.5",
    "GEMINI_429_BACKOFF_MULTIPLIER": "2.0",
    "GEMINI_429_COOLDOWN_SECONDS": "15.0",
    "GEMINI_429_COOLDOWN_MIN_CONSECUTIVE": "4",
}
LIVE_ONLY_REQUIRED_SERVICES = frozenset(("foodlens-api", "foodlens-worker"))
LEGACY_MODEL_KEY = "GEMINI_LABEL_MODEL_NAME"
EXPECTED_LEGACY_MODEL_VALUE = "gemini-2.5-flash"
EXPECTED_SERVICE_NAMES = frozenset(SERVICE_ID_ENV_NAMES.keys())


def emit_event(event: str, fields: JsonObject) -> None:
    payload: JsonObject = {"event": event}
    payload.update(fields)
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def fail(message: str) -> None:
    emit_event("render_live_readiness_error", {"message": message})
    raise SystemExit(1)


def unquote(value: str) -> str:
    trimmed = value.strip()
    if len(trimmed) >= 2 and trimmed[0] == '"' and trimmed[-1] == '"':
        return trimmed[1:-1]
    if len(trimmed) >= 2 and trimmed[0] == "'" and trimmed[-1] == "'":
        return trimmed[1:-1]
    return trimmed


def field_value(block: list[str], field_name: str) -> str | None:
    pattern = re.compile(rf"^\s+{re.escape(field_name)}:\s*(.*)$")
    for line in block:
        match = pattern.match(line)
        if match is not None:
            return unquote(match.group(1))
    return None


def parse_env_vars(block: list[str]) -> BlueprintEnvMap:
    env_vars: BlueprintEnvMap = {}
    current_key: str | None = None
    for line in block:
        key_match = re.match(r"^\s+- key:\s*([A-Z0-9_]+)\s*$", line)
        if key_match is not None:
            current_key = key_match.group(1)
            env_vars[current_key] = {"value": None, "sync": None}
            continue
        if current_key is None:
            continue
        value_match = re.match(r"^\s+value:\s*(.*)$", line)
        if value_match is not None and env_vars[current_key]["value"] is None:
            env_vars[current_key]["value"] = unquote(value_match.group(1))
            continue
        sync_match = re.match(r"^\s+sync:\s*(\S+)\s*$", line)
        if sync_match is not None and env_vars[current_key]["sync"] is None:
            env_vars[current_key]["sync"] = sync_match.group(1)
            continue
    return env_vars


def parse_services(lines: list[str]) -> dict[str, dict[str, object]]:
    starts = [index for index, line in enumerate(lines) if re.match(r"^  - type: ", line)]
    if not starts:
        fail("render.yaml has no services.")
    services: dict[str, dict[str, object]] = {}
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(lines)
        block = lines[start:end]
        type_match = re.match(r"^  - type:\s*(\S+)\s*$", block[0])
        if type_match is None:
            fail("render.yaml service type could not be parsed.")
        service_name = field_value(block, "name")
        if service_name is None:
            fail("render.yaml service name could not be parsed.")
        services[service_name] = {
            "type": type_match.group(1),
            "env_vars": parse_env_vars(block),
        }
    return services


def read_blueprint_contract(blueprint_path: Path) -> dict[str, BlueprintEnvMap]:
    if not blueprint_path.exists():
        fail("render.yaml is missing.")
    services = parse_services(blueprint_path.read_text(encoding="utf-8").splitlines())
    actual_names = frozenset(services.keys())
    if actual_names != EXPECTED_SERVICE_NAMES:
        fail("render.yaml service set does not match FoodLens Render services.")
    contracts: dict[str, BlueprintEnvMap] = {}
    for service_name, service in services.items():
        env_vars = service.get("env_vars")
        if not isinstance(env_vars, dict):
            fail("render.yaml env contract could not be parsed.")
        contracts[service_name] = cast(BlueprintEnvMap, env_vars)
    return contracts


def write_json(path: Path, payload: JsonObject) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def request_json(method: str, url: str, api_key: str) -> JsonValue:
    request = Request(
        url,
        method=method,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    last_error: RuntimeError | None = None
    for attempt in range(1, REQUEST_ATTEMPTS + 1):
        try:
            with urlopen(request, timeout=30) as response:
                response_body = response.read().decode("utf-8")
            return cast(JsonValue, json.loads(response_body))
        except HTTPError as error:
            error_body = error.read().decode("utf-8", errors="replace")
            last_error = RuntimeError(
                f"Render API request failed: method={method} status={error.code} body={error_body[:300]}"
            )
        except URLError as error:
            last_error = RuntimeError(f"Render API request failed: method={method} reason={error.reason}")
        except json.JSONDecodeError as error:
            last_error = RuntimeError(f"Render API response was not JSON: method={method} error={error.msg}")
        if attempt < REQUEST_ATTEMPTS:
            emit_event("render_api_retry", {"attempt": attempt, "method": method})
            time.sleep(RETRY_DELAY_SECONDS)
    if last_error is None:
        raise RuntimeError("Render API request failed without explicit error.")
    raise last_error


def json_object(value: JsonValue, message: str) -> JsonObject:
    if not isinstance(value, dict):
        raise RuntimeError(message)
    return cast(JsonObject, value)


def json_list(value: JsonValue, message: str) -> list[JsonValue]:
    if not isinstance(value, list):
        raise RuntimeError(message)
    return cast(list[JsonValue], value)


def response_items(response: JsonValue, list_keys: tuple[str, ...]) -> list[JsonValue]:
    if isinstance(response, list):
        return json_list(response, "Render API list response was not a list.")
    obj = json_object(response, "Render API list response was not an object.")
    for key in (*list_keys, "items"):
        raw_items = obj.get(key)
        if isinstance(raw_items, list):
            return json_list(raw_items, "Render API list field was not a list.")
    raise RuntimeError("Render API list response did not include a recognized item list.")


def next_cursor(response: JsonValue) -> str | None:
    if not isinstance(response, dict):
        return None
    obj = json_object(response, "Render API pagination response was not an object.")
    for key in ("nextCursor", "next_cursor", "next"):
        value = obj.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    cursor = obj.get("cursor")
    if isinstance(cursor, dict):
        nested = cursor.get("next")
        if isinstance(nested, str) and nested.strip():
            return nested.strip()
    return None


def item_cursor(item: JsonValue) -> str | None:
    if not isinstance(item, dict):
        return None
    value = item.get("cursor")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def next_page_cursor(response: JsonValue, items: list[JsonValue], current_cursor: str | None) -> str | None:
    candidate = next_cursor(response)
    if candidate is None and items:
        candidate = item_cursor(items[-1])
    if candidate is not None and candidate == current_cursor:
        raise RuntimeError("Render API pagination cursor did not advance.")
    return candidate


def extract_env_item(item: JsonValue) -> tuple[str, str | None] | None:
    if not isinstance(item, dict):
        return None
    item_obj = json_object(item, "Render env item was not an object.")
    candidate = item_obj.get("envVar")
    if isinstance(candidate, dict):
        item_obj = json_object(candidate, "Render envVar item was not an object.")
    key = item_obj.get("key")
    if not isinstance(key, str) or not key.strip():
        return None
    raw_value = item_obj.get("value")
    if raw_value is None:
        return key.strip(), None
    if isinstance(raw_value, str):
        return key.strip(), raw_value
    return key.strip(), str(raw_value)


def list_live_env_vars(api_key: str, service_id: str, requester: JsonRequester) -> LiveEnvMap:
    live_env: LiveEnvMap = {}
    cursor: str | None = None
    page_count = 0
    while page_count < MAX_PAGINATION_PAGES:
        page_count += 1
        params: dict[str, str] = {"limit": "100"}
        if cursor is not None:
            params["cursor"] = cursor
        url = f"{RENDER_API_BASE_URL}/services/{service_id}/env-vars?{urlencode(params)}"
        response = requester("GET", url, api_key)
        items = response_items(response, ("envVars", "data", "results"))
        for item in items:
            parsed = extract_env_item(item)
            if parsed is None:
                continue
            key, value = parsed
            live_env[key] = value
        cursor = next_page_cursor(response, items, cursor)
        if cursor is None:
            return live_env
    raise RuntimeError("Render env var pagination exceeded the page limit.")


def parse_timestamp(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone.")
    return parsed.astimezone(timezone.utc)


def deploy_created_at(deploy: JsonObject) -> datetime | None:
    value = deploy.get("createdAt")
    if not isinstance(value, str):
        return None
    try:
        return parse_timestamp(value)
    except ValueError:
        return None


def extract_deploy_items(items: list[JsonValue]) -> list[JsonObject]:
    deploys: list[JsonObject] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        item_obj = json_object(item, "Render deploy item was not an object.")
        nested = item_obj.get("deploy")
        if isinstance(nested, dict):
            deploys.append(json_object(nested, "Render nested deploy item was not an object."))
            continue
        deploys.append(item_obj)
    return deploys


def list_deploys(api_key: str, service_id: str, requester: JsonRequester) -> list[JsonObject]:
    deploys: list[JsonObject] = []
    cursor: str | None = None
    page_count = 0
    while page_count < MAX_PAGINATION_PAGES:
        page_count += 1
        params: dict[str, str] = {"limit": "100"}
        if cursor is not None:
            params["cursor"] = cursor
        url = f"{RENDER_API_BASE_URL}/services/{service_id}/deploys?{urlencode(params)}"
        response = requester("GET", url, api_key)
        items = response_items(response, ("deploys", "data", "results"))
        deploys.extend(extract_deploy_items(items))
        cursor = next_page_cursor(response, items, cursor)
        if cursor is None:
            return deploys
    raise RuntimeError("Render deploy pagination exceeded the page limit.")


def service_object(response: JsonValue) -> JsonObject:
    obj = json_object(response, "Render service response was not an object.")
    nested = obj.get("service")
    if isinstance(nested, dict):
        return json_object(nested, "Render nested service response was not an object.")
    return obj


def service_identity_gate_summary(
    api_key: str,
    service_id: str,
    expected_name: str,
    requester: JsonRequester,
) -> tuple[JsonObject, bool]:
    service = service_object(requester("GET", f"{RENDER_API_BASE_URL}/services/{service_id}", api_key))
    actual_name = service.get("name")
    actual_id = service.get("id")
    id_present = isinstance(actual_id, str) and bool(actual_id.strip())
    name_matches = isinstance(actual_name, str) and actual_name == expected_name
    return {
        "id_present": id_present,
        "name_status": "match" if name_matches else "mismatch_or_missing",
    }, id_present and name_matches


def deploy_gate_summary(
    api_key: str,
    service_id: str,
    min_created_at: datetime | None,
    requester: JsonRequester,
) -> tuple[JsonObject, bool]:
    deploys = list_deploys(api_key, service_id, requester)
    if not deploys:
        return {"status": "missing", "created_at": None, "id_present": False}, False
    candidates = deploys
    if min_created_at is not None:
        candidates = [
            deploy
            for deploy in deploys
            if (created_at := deploy_created_at(deploy)) is not None and created_at >= min_created_at
        ]
        if not candidates:
            return {"status": "missing_after_min_created_at", "created_at": None, "id_present": False}, False
    latest = candidates[0]
    status = latest.get("status")
    normalized_status = status if isinstance(status, str) and status.strip() else "unknown"
    created_at = latest.get("createdAt")
    finished_at = latest.get("finishedAt")
    deploy_id = latest.get("id")
    passed = normalized_status == LIVE_STATUS
    if normalized_status in FAILED_DEPLOY_STATUSES:
        passed = False
    return {
        "status": normalized_status,
        "created_at": created_at if isinstance(created_at, str) else None,
        "finished_at": finished_at if isinstance(finished_at, str) else None,
        "id_present": isinstance(deploy_id, str) and bool(deploy_id.strip()),
    }, passed


def compare_key_sets(
    expected_env: BlueprintEnvMap,
    live_env: LiveEnvMap,
    service_name: str,
    expected_project_id: str,
) -> tuple[JsonObject, bool]:
    missing_keys: list[str] = []
    empty_keys: list[str] = []
    literal_drift_keys: list[str] = []
    checked_literal_keys: list[str] = []
    checked_presence_keys: list[str] = []
    for key, expected in sorted(expected_env.items()):
        if key not in live_env:
            missing_keys.append(key)
            continue
        live_value = live_env[key]
        if live_value == "":
            empty_keys.append(key)
            continue
        expected_value = expected.get("value")
        if expected_value is None:
            checked_presence_keys.append(key)
            continue
        checked_literal_keys.append(key)
        if live_value != expected_value:
            literal_drift_keys.append(key)
    live_only_missing_keys: list[str] = []
    live_only_drift_keys: list[str] = []
    if service_name in LIVE_ONLY_REQUIRED_SERVICES:
        for key, expected_value in sorted(LIVE_ONLY_REQUIRED_LITERAL_KEYS.items()):
            if key not in live_env:
                live_only_missing_keys.append(key)
                continue
            if live_env[key] != expected_value:
                live_only_drift_keys.append(key)
    legacy_model_drift = LEGACY_MODEL_KEY in live_env and live_env[LEGACY_MODEL_KEY] != EXPECTED_LEGACY_MODEL_VALUE
    project_drift_keys: list[str] = []
    if expected_project_id and live_env.get("GCP_PROJECT_ID") != expected_project_id:
        project_drift_keys.append("GCP_PROJECT_ID")
    passed = not (
        missing_keys
        or empty_keys
        or literal_drift_keys
        or live_only_missing_keys
        or live_only_drift_keys
        or legacy_model_drift
        or project_drift_keys
    )
    summary: JsonObject = {
        "blueprint_key_count": len(expected_env),
        "checked_literal_key_count": len(checked_literal_keys),
        "checked_presence_key_count": len(checked_presence_keys),
        "empty_required_keys": empty_keys,
        "legacy_model_key_status": "drift" if legacy_model_drift else "ok_or_absent",
        "live_only_drift_keys": live_only_drift_keys,
        "live_only_missing_keys": live_only_missing_keys,
        "literal_drift_keys": literal_drift_keys,
        "missing_required_keys": missing_keys,
        "project_id_status": "drift" if project_drift_keys else "ok_or_unchecked",
    }
    return summary, passed


def dry_run_summary(contracts: dict[str, BlueprintEnvMap]) -> tuple[JsonObject, bool]:
    service_summaries: JsonObject = {}
    passed = True
    for service_name, env_vars in sorted(contracts.items()):
        missing_literal_keys = [key for key in BLUEPRINT_REQUIRED_LITERAL_KEYS if env_vars.get(key, {}).get("value") != BLUEPRINT_REQUIRED_LITERAL_KEYS[key]]
        sync_false_without_value = [
            key
            for key, metadata in sorted(env_vars.items())
            if metadata.get("value") is None and metadata.get("sync") != "false"
        ]
        service_passed = not missing_literal_keys and not sync_false_without_value
        passed = passed and service_passed
        service_summaries[service_name] = {
            "blueprint_key_count": len(env_vars),
            "missing_or_drifted_local_literal_keys": missing_literal_keys,
            "sync_false_contract_drift_keys": sync_false_without_value,
        }
    return {"passed": passed, "services": service_summaries}, passed


def required_env_names_for_live() -> list[str]:
    return ["RENDER_API_KEY", *SERVICE_ID_ENV_NAMES.values()]


def missing_required_env(env: dict[str, str], required_names: list[str]) -> list[str]:
    return [name for name in required_names if not (env.get(name) or "").strip()]


def run_live(
    env: dict[str, str],
    contracts: dict[str, BlueprintEnvMap],
    requester: JsonRequester,
) -> tuple[JsonObject, bool]:
    missing = missing_required_env(env, required_env_names_for_live())
    if missing:
        return {"passed": False, "missing_env": missing, "services": {}}, False
    api_key = env["RENDER_API_KEY"]
    service_ids = {
        service_name: env[service_id_env_name].strip()
        for service_name, service_id_env_name in SERVICE_ID_ENV_NAMES.items()
    }
    if len(set(service_ids.values())) != len(service_ids):
        return {"passed": False, "duplicate_service_id_env": True, "services": {}}, False
    expected_project_id = (env.get("RENDER_EXPECTED_GCP_PROJECT_ID") or "").strip()
    min_created_at: datetime | None = None
    raw_min_created_at = (env.get("RENDER_DEPLOY_MIN_CREATED_AT") or "").strip()
    if raw_min_created_at:
        min_created_at = parse_timestamp(raw_min_created_at)
    service_summaries: JsonObject = {}
    passed = True
    for service_name, service_id_env_name in sorted(SERVICE_ID_ENV_NAMES.items()):
        service_id = service_ids[service_name]
        identity_summary, identity_passed = service_identity_gate_summary(api_key, service_id, service_name, requester)
        live_env = list_live_env_vars(api_key, service_id, requester)
        env_summary, env_passed = compare_key_sets(contracts[service_name], live_env, service_name, expected_project_id)
        deploy_summary, deploy_passed = deploy_gate_summary(api_key, service_id, min_created_at, requester)
        service_passed = identity_passed and env_passed and deploy_passed
        passed = passed and service_passed
        service_summaries[service_name] = {
            "deploy": deploy_summary,
            "env": env_summary,
            "identity": identity_summary,
            "passed": service_passed,
        }
        emit_event(
            "render_live_service_checked",
            {
                "service_name": service_name,
                "identity_passed": identity_passed,
                "env_passed": env_passed,
                "deploy_passed": deploy_passed,
            },
        )
    return {"passed": passed, "services": service_summaries}, passed


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify FoodLens Render live env readiness without printing values.")
    parser.add_argument("--mode", choices=("dry-run", "live"), required=True)
    parser.add_argument("--summary-path", required=False)
    parser.add_argument("--render-yaml", required=False)
    return parser.parse_args(argv)


def main(argv: list[str], env: dict[str, str], requester: JsonRequester, sleeper: Sleeper) -> int:
    args = parse_args(argv)
    root_dir = Path(__file__).resolve().parents[2]
    render_yaml = Path(str(args.render_yaml)) if args.render_yaml else root_dir / "render.yaml"
    summary_path = Path(str(args.summary_path)) if args.summary_path else root_dir / DEFAULT_SUMMARY_PATH
    contracts = read_blueprint_contract(render_yaml)
    try:
        if args.mode == "dry-run":
            summary, passed = dry_run_summary(contracts)
        else:
            summary, passed = run_live(env, contracts, requester)
    except RuntimeError as error:
        summary = {"passed": False, "error": type(error).__name__}
        write_json(summary_path, summary)
        emit_event("render_live_readiness_failed", {"error": type(error).__name__})
        return 1
    except ValueError as error:
        summary = {"passed": False, "error": type(error).__name__, "message": str(error)}
        write_json(summary_path, summary)
        emit_event("render_live_readiness_failed", {"error": type(error).__name__})
        return 1
    write_json(summary_path, summary)
    emit_event("render_live_readiness_complete", {"mode": str(args.mode), "passed": passed, "summary_path": str(summary_path)})
    sleeper(0.0)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:], dict(os.environ), request_json, time.sleep))
