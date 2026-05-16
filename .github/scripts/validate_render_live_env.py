#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


RENDER_API_BASE_URL = "https://api.render.com/v1"
RENDER_PAGE_LIMIT = 100
DEFAULT_LIVE_ENV_KEYS: tuple[str, ...] = (
    "GEMINI_MODEL_NAME",
    "GEMINI_LABEL_MODEL_NAME",
    "GEMINI_LABEL_FALLBACK_MODEL_NAME",
    "GEMINI_LABEL_FALLBACK_ENABLED",
    "GEMINI_LABEL_PRO_FALLBACK_ENABLED",
    "GEMINI_LABEL_FALLBACK_ON_PARSE_ERROR",
    "GEMINI_LABEL_FALLBACK_ON_MAX_TOKENS",
    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_FALLBACK",
    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK",
    "LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER",
    "AUTH_RATE_LIMIT_BACKEND",
    "AUTH_RATE_LIMIT_TABLE",
    "AUTH_GOOGLE_OAUTH_PROMPT",
)


JsonRequester = Callable[[str, str, str], object]


@dataclass(frozen=True)
class BlueprintEnvVar:
    key: str
    value: str | None
    sync: str | None


@dataclass(frozen=True)
class BlueprintService:
    name: str
    env_vars: dict[str, BlueprintEnvVar]


@dataclass(frozen=True)
class ServiceEnvCheck:
    service_name: str
    key: str
    present: bool
    matches_blueprint: bool | None


@dataclass(frozen=True)
class PaginatedItems:
    items: list[dict[str, Any]]
    next_cursor: str | None


def _unquote(value: str) -> str:
    trimmed = value.strip()
    if len(trimmed) >= 2 and trimmed[0] == '"' and trimmed[-1] == '"':
        return trimmed[1:-1]
    if len(trimmed) >= 2 and trimmed[0] == "'" and trimmed[-1] == "'":
        return trimmed[1:-1]
    return trimmed


def _field_value(block: list[str], field_name: str) -> str | None:
    pattern = re.compile(rf"^\s+{re.escape(field_name)}:\s*(.*)$")
    for line in block:
        match = pattern.match(line)
        if match is not None:
            return _unquote(match.group(1))
    return None


def _parse_env_vars(block: list[str]) -> dict[str, BlueprintEnvVar]:
    env_vars: dict[str, BlueprintEnvVar] = {}
    current_key: str | None = None
    for line in block:
        key_match = re.match(r"^\s+- key:\s*([A-Z0-9_]+)\s*$", line)
        if key_match is not None:
            current_key = key_match.group(1)
            env_vars[current_key] = BlueprintEnvVar(key=current_key, value=None, sync=None)
            continue
        if current_key is None:
            continue
        value_match = re.match(r"^\s+value:\s*(.*)$", line)
        if value_match is not None and env_vars[current_key].value is None:
            env_vars[current_key] = BlueprintEnvVar(
                key=current_key,
                value=_unquote(value_match.group(1)),
                sync=env_vars[current_key].sync,
            )
            continue
        sync_match = re.match(r"^\s+sync:\s*(\S+)\s*$", line)
        if sync_match is not None and env_vars[current_key].sync is None:
            env_vars[current_key] = BlueprintEnvVar(
                key=current_key,
                value=env_vars[current_key].value,
                sync=sync_match.group(1),
            )
    return env_vars


def parse_blueprint_services(path: Path) -> list[BlueprintService]:
    lines = path.read_text(encoding="utf-8").splitlines()
    starts = [index for index, line in enumerate(lines) if re.match(r"^  - type: ", line)]
    if not starts:
        raise RuntimeError(f"Render blueprint has no services: {path}")
    services: list[BlueprintService] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(lines)
        block = lines[start:end]
        service_name = _field_value(block, "name")
        if service_name is None:
            raise RuntimeError(f"Render blueprint service at line {start + 1} has no name.")
        services.append(BlueprintService(name=service_name, env_vars=_parse_env_vars(block)))
    return services


def _request_json(method: str, url: str, api_key: str) -> object:
    request = Request(
        url,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            response_body = response.read().decode("utf-8")
    except HTTPError as error:
        raise RuntimeError(f"Render API {method} failed with status {error.code}.") from error
    except TimeoutError as error:
        raise RuntimeError(f"Render API {method} timed out.") from error
    except URLError as error:
        raise RuntimeError(f"Render API {method} failed: {error.reason}") from error
    try:
        return json.loads(response_body)
    except json.JSONDecodeError as error:
        raise RuntimeError("Render API returned invalid JSON.") from error


def _response_cursor(response: dict[str, Any]) -> str | None:
    for cursor_key in ("nextCursor", "next_cursor", "cursor"):
        cursor = response.get(cursor_key)
        if isinstance(cursor, str) and cursor.strip():
            return cursor
    return None


def _response_page(response: object) -> PaginatedItems:
    if isinstance(response, list):
        items = [item for item in response if isinstance(item, dict)]
        return PaginatedItems(items=items, next_cursor=_cursor_from_items(items))
    if isinstance(response, dict):
        results = response.get("results")
        if isinstance(results, list):
            items = [item for item in results if isinstance(item, dict)]
            return PaginatedItems(items=items, next_cursor=_response_cursor(response) or _cursor_from_items(items))
        env_vars = response.get("envVars")
        if isinstance(env_vars, list):
            items = [item for item in env_vars if isinstance(item, dict)]
            return PaginatedItems(items=items, next_cursor=_response_cursor(response) or _cursor_from_items(items))
        services = response.get("services")
        if isinstance(services, list):
            items = [item for item in services if isinstance(item, dict)]
            return PaginatedItems(items=items, next_cursor=_response_cursor(response) or _cursor_from_items(items))
    raise RuntimeError("Render API list response did not include a supported item list.")


def _cursor_from_items(items: list[dict[str, Any]]) -> str | None:
    if not items:
        return None
    cursor = items[-1].get("cursor")
    return cursor if isinstance(cursor, str) and cursor.strip() else None


def _paginated_get(api_key: str, path: str, request_json: JsonRequester) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    cursor: str | None = None
    seen_cursors: set[str] = set()
    while True:
        query: dict[str, str] = {"limit": str(RENDER_PAGE_LIMIT)}
        if cursor is not None:
            query["cursor"] = cursor
        url = f"{RENDER_API_BASE_URL}{path}?{urlencode(query)}"
        page = _response_page(request_json("GET", url, api_key))
        page_items = page.items
        items.extend(page_items)
        next_cursor = page.next_cursor
        if next_cursor is None or next_cursor in seen_cursors:
            return items
        seen_cursors.add(next_cursor)
        cursor = next_cursor


def _service_payload(item: dict[str, Any]) -> dict[str, Any]:
    service = item.get("service")
    return service if isinstance(service, dict) else item


def _env_var_payload(item: dict[str, Any]) -> dict[str, Any]:
    env_var = item.get("envVar")
    return env_var if isinstance(env_var, dict) else item


def _service_id_env_name(service_name: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", service_name).strip("_").upper()
    return f"RENDER_SERVICE_ID_{normalized}"


def _service_id_from_env(env: dict[str, str], service_name: str) -> str | None:
    scoped_name = _service_id_env_name(service_name)
    scoped_value = (env.get(scoped_name) or "").strip()
    if scoped_value:
        return scoped_value
    if service_name == "foodlens-api":
        shared_value = (env.get("RENDER_SERVICE_ID") or "").strip()
        if shared_value:
            return shared_value
    return None


def _service_ids_by_name(
    env: dict[str, str],
    api_key: str,
    service_names: tuple[str, ...],
    request_json: JsonRequester,
) -> dict[str, str]:
    service_ids: dict[str, str] = {}
    unresolved_names: list[str] = []
    for service_name in service_names:
        env_service_id = _service_id_from_env(env, service_name)
        if env_service_id is None:
            unresolved_names.append(service_name)
            continue
        service_ids[service_name] = env_service_id
    if not unresolved_names:
        return service_ids

    for item in _paginated_get(api_key, "/services", request_json):
        service = _service_payload(item)
        name = service.get("name")
        service_id = service.get("id")
        if isinstance(name, str) and isinstance(service_id, str) and name in unresolved_names:
            service_ids[name] = service_id
    return service_ids


def _live_env_vars(api_key: str, service_id: str, request_json: JsonRequester) -> dict[str, str | None]:
    live_env: dict[str, str | None] = {}
    path = f"/services/{service_id}/env-vars"
    for item in _paginated_get(api_key, path, request_json):
        env_var = _env_var_payload(item)
        key = env_var.get("key")
        if not isinstance(key, str):
            continue
        value = env_var.get("value")
        value_preview = env_var.get("valuePreview")
        if isinstance(value, str):
            live_env[key] = value
        elif isinstance(value_preview, str):
            live_env[key] = value_preview
        else:
            live_env[key] = None
    return live_env


def _required_scoped_env_vars(service: BlueprintService) -> dict[str, BlueprintEnvVar]:
    service_contract: dict[str, BlueprintEnvVar] = {}
    for key in DEFAULT_LIVE_ENV_KEYS:
        env_var = service.env_vars.get(key)
        if env_var is None:
            raise RuntimeError(f"render.yaml service {service.name} is missing required live env key {key}.")
        if env_var.sync == "false":
            raise RuntimeError(f"render.yaml service {service.name} key {key} must define a literal value.")
        service_contract[key] = env_var
    return service_contract


def _required_env_contract(services: list[BlueprintService], all_blueprint_env: bool) -> dict[str, dict[str, BlueprintEnvVar]]:
    contract: dict[str, dict[str, BlueprintEnvVar]] = {}
    for service in services:
        if not service.env_vars:
            raise RuntimeError(f"render.yaml service {service.name} has no env vars to validate.")
        service_contract = service.env_vars if all_blueprint_env else _required_scoped_env_vars(service)
        contract[service.name] = dict(sorted(service_contract.items()))
    return contract


def _check_service_env(
    service_name: str,
    blueprint_env: dict[str, BlueprintEnvVar],
    live_env: dict[str, str | None],
    check_values: bool,
) -> list[ServiceEnvCheck]:
    checks: list[ServiceEnvCheck] = []
    for key, blueprint_var in blueprint_env.items():
        present = key in live_env
        matches_blueprint: bool | None = None
        if check_values and present and blueprint_var.value is not None and blueprint_var.sync != "false":
            matches_blueprint = live_env[key] == blueprint_var.value
        checks.append(
            ServiceEnvCheck(
                service_name=service_name,
                key=key,
                present=present,
                matches_blueprint=matches_blueprint,
            )
        )
    return checks


def _print_check(check: ServiceEnvCheck) -> None:
    if check.matches_blueprint is None:
        match_status = "not_checked"
    else:
        match_status = str(check.matches_blueprint).lower()
    print(
        "[RenderLiveEnvGate] "
        f"service={check.service_name} key={check.key} "
        f"present={str(check.present).lower()} matches_blueprint={match_status}"
    )


def run_gate(
    env: dict[str, str],
    blueprint_path: Path,
    check_values: bool,
    all_blueprint_env: bool,
    request_json: JsonRequester,
) -> int:
    api_key = (env.get("RENDER_API_KEY") or "").strip()
    if not api_key:
        print("[RenderLiveEnvGate] Missing required env: RENDER_API_KEY", file=sys.stderr)
        return 2

    contract = _required_env_contract(parse_blueprint_services(blueprint_path), all_blueprint_env)
    service_names = tuple(contract.keys())
    service_ids = _service_ids_by_name(env, api_key, service_names, request_json)
    checks: list[ServiceEnvCheck] = []
    missing_services: list[str] = []
    for service_name, blueprint_env in contract.items():
        service_id = service_ids.get(service_name)
        if service_id is None:
            missing_services.append(service_name)
            print(
                "[RenderLiveEnvGate] "
                f"service={service_name} exists=false action=set {_service_id_env_name(service_name)} "
                "or ensure a Render service has the same name as render.yaml"
            )
            continue
        checks.extend(_check_service_env(service_name, blueprint_env, _live_env_vars(api_key, service_id, request_json), check_values))

    for check in checks:
        _print_check(check)

    missing_count = sum(1 for check in checks if not check.present)
    mismatch_count = sum(1 for check in checks if check.matches_blueprint is False)
    if missing_services or missing_count > 0 or mismatch_count > 0:
        print(
            "[RenderLiveEnvGate] live env contract failed: "
            f"services_checked={len(contract) - len(missing_services)} "
            f"missing_services={len(missing_services)} missing_keys={missing_count} "
            f"mismatched_values={mismatch_count} action=update Render Dashboard env keys or render.yaml",
            file=sys.stderr,
        )
        return 1

    print(f"[RenderLiveEnvGate] live env contract checks passed. services_checked={len(contract)}")
    return 0


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate Render live env key parity without printing env values.")
    parser.add_argument("--blueprint", required=True, help="Path to render.yaml")
    parser.add_argument("--presence-only", action="store_true", help="Check key presence without comparing values")
    parser.add_argument(
        "--all-blueprint-env",
        action="store_true",
        help="Audit every render.yaml env key instead of the default AI guardrail contract",
    )
    parser.add_argument("--check-values", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    try:
        check_values = not bool(args.presence_only)
        return run_gate(dict(os.environ), Path(args.blueprint), check_values, bool(args.all_blueprint_env), _request_json)
    except RuntimeError as error:
        print(f"[RenderLiveEnvGate] {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
