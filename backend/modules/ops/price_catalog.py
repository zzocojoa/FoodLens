from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import json
import math
from pathlib import Path
from typing import Mapping
from urllib.parse import urlparse


OFFICIAL_PRICE_SOURCE_HOSTS: tuple[str, ...] = (
    "ai.google.dev",
    "cloud.google.com",
    "console.cloud.google.com",
    "developers.openai.com",
    "openai.com",
    "platform.openai.com",
)


class PriceCatalogError(RuntimeError):
    pass


@dataclass(frozen=True)
class TokenPrice:
    usd_per_1m_tokens: float
    sku: str
    source_url: str
    verified_at: date


@dataclass(frozen=True)
class ModelPrice:
    provider: str
    model: str
    input: TokenPrice
    output: TokenPrice
    cached_input: TokenPrice | None
    thoughts: TokenPrice | None


@dataclass(frozen=True)
class PriceCatalog:
    version: str
    entries: tuple[ModelPrice, ...]


@dataclass(frozen=True)
class UsageCostEstimate:
    cost_usd: float
    tokens: int
    source: str


def load_price_catalog(path: str) -> PriceCatalog:
    catalog_path = Path(path).expanduser()
    if not catalog_path.is_file():
        raise PriceCatalogError(f"AI cost price catalog file does not exist: path={catalog_path}")
    try:
        raw_catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise PriceCatalogError(
            f"AI cost price catalog is not valid JSON: path={catalog_path}; error={error}"
        ) from error
    if not isinstance(raw_catalog, dict):
        raise PriceCatalogError(f"AI cost price catalog root must be an object: path={catalog_path}")
    return _parse_price_catalog(raw_catalog=raw_catalog, path=str(catalog_path))


def estimate_usage_cost_from_catalog(
    *,
    usage_records: object,
    catalog: PriceCatalog,
) -> UsageCostEstimate | None:
    normalized_records = _normalize_usage_records(raw_records=usage_records)
    if not normalized_records:
        return None

    entries_by_key = {
        _catalog_key(provider=entry.provider, model=entry.model): entry
        for entry in catalog.entries
    }
    total_cost_usd = 0.0
    total_tokens = 0
    priced_records = 0
    for record in normalized_records:
        provider = _read_required_str(raw=record, field_name="provider", path="usage_record")
        model = _read_required_str(raw=record, field_name="model", path="usage_record")
        entry = entries_by_key.get(_catalog_key(provider=provider, model=model))
        if entry is None:
            raise PriceCatalogError(
                f"AI cost price catalog missing model entry: provider={provider}; model={model}"
            )
        total_cost_usd += _estimate_record_cost(record=record, entry=entry)
        total_tokens += _record_total_tokens(record=record)
        priced_records += 1

    if priced_records <= 0 or total_tokens <= 0:
        return None
    return UsageCostEstimate(
        cost_usd=total_cost_usd,
        tokens=total_tokens,
        source=f"price_catalog:{catalog.version}",
    )


def _parse_price_catalog(*, raw_catalog: Mapping[str, object], path: str) -> PriceCatalog:
    version = _read_required_str(raw=raw_catalog, field_name="version", path=path)
    raw_entries = raw_catalog.get("entries")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise PriceCatalogError(f"AI cost price catalog entries must be a non-empty list: path={path}")
    entries = tuple(
        _parse_model_price(raw_entry=raw_entry, path=f"{path}.entries[{index}]")
        for index, raw_entry in enumerate(raw_entries)
    )
    _validate_unique_entries(entries=entries, path=path)
    return PriceCatalog(version=version, entries=entries)


def _parse_model_price(*, raw_entry: object, path: str) -> ModelPrice:
    if not isinstance(raw_entry, dict):
        raise PriceCatalogError(f"AI cost price catalog entry must be an object: path={path}")
    provider = _read_required_str(raw=raw_entry, field_name="provider", path=path)
    model = _read_required_str(raw=raw_entry, field_name="model", path=path)
    return ModelPrice(
        provider=provider,
        model=model,
        input=_parse_token_price(raw_entry=raw_entry, field_name="input", path=path),
        output=_parse_token_price(raw_entry=raw_entry, field_name="output", path=path),
        cached_input=_parse_optional_token_price(raw_entry=raw_entry, field_name="cached_input", path=path),
        thoughts=_parse_optional_token_price(raw_entry=raw_entry, field_name="thoughts", path=path),
    )


def _parse_optional_token_price(
    *,
    raw_entry: Mapping[str, object],
    field_name: str,
    path: str,
) -> TokenPrice | None:
    raw_price = raw_entry.get(field_name)
    if raw_price is None:
        return None
    return _parse_token_price(raw_entry=raw_entry, field_name=field_name, path=path)


def _parse_token_price(*, raw_entry: Mapping[str, object], field_name: str, path: str) -> TokenPrice:
    raw_price = raw_entry.get(field_name)
    price_path = f"{path}.{field_name}"
    if not isinstance(raw_price, dict):
        raise PriceCatalogError(f"AI cost price entry must be an object: path={price_path}")
    usd_per_1m_tokens = _read_required_float(raw=raw_price, field_name="usd_per_1m_tokens", path=price_path)
    if not math.isfinite(usd_per_1m_tokens) or usd_per_1m_tokens <= 0.0:
        raise PriceCatalogError(f"AI cost price must be positive and finite: path={price_path}.usd_per_1m_tokens")
    sku = _read_required_str(raw=raw_price, field_name="sku", path=price_path)
    source_url = _read_required_str(raw=raw_price, field_name="source_url", path=price_path)
    verified_at = _read_required_date(raw=raw_price, field_name="verified_at", path=price_path)
    _validate_source_url(source_url=source_url, path=f"{price_path}.source_url")
    return TokenPrice(
        usd_per_1m_tokens=usd_per_1m_tokens,
        sku=sku,
        source_url=source_url,
        verified_at=verified_at,
    )


def _estimate_record_cost(*, record: Mapping[str, object], entry: ModelPrice) -> float:
    prompt_tokens = _read_optional_int(raw=record, field_name="prompt_tokens")
    completion_tokens = _read_optional_int(raw=record, field_name="completion_tokens")
    cached_tokens = _read_optional_int(raw=record, field_name="cached_tokens")
    thoughts_tokens = _read_optional_int(raw=record, field_name="thoughts_tokens")

    if prompt_tokens is None and completion_tokens is None and cached_tokens is None and thoughts_tokens is None:
        raise PriceCatalogError(
            f"AI cost price catalog cannot price total-only usage: provider={entry.provider}; model={entry.model}"
        )

    billable_cached_tokens = cached_tokens or 0
    if billable_cached_tokens > 0 and entry.cached_input is None:
        raise PriceCatalogError(
            f"AI cost price catalog missing cached_input rate: provider={entry.provider}; model={entry.model}"
        )
    billable_prompt_tokens = max(0, (prompt_tokens or 0) - billable_cached_tokens)
    cost = _tokens_to_usd(tokens=billable_prompt_tokens, price=entry.input)
    if entry.cached_input is not None:
        cost += _tokens_to_usd(tokens=billable_cached_tokens, price=entry.cached_input)
    cost += _tokens_to_usd(tokens=completion_tokens or 0, price=entry.output)
    if thoughts_tokens:
        if entry.thoughts is None:
            raise PriceCatalogError(
                f"AI cost price catalog missing thoughts rate: provider={entry.provider}; model={entry.model}"
            )
        cost += _tokens_to_usd(tokens=thoughts_tokens, price=entry.thoughts)
    return cost


def _tokens_to_usd(*, tokens: int, price: TokenPrice) -> float:
    return (float(max(0, tokens)) / 1_000_000.0) * price.usd_per_1m_tokens


def _record_total_tokens(*, record: Mapping[str, object]) -> int:
    total_tokens = _read_optional_int(raw=record, field_name="total_tokens")
    if total_tokens is not None:
        return total_tokens
    prompt_tokens = _read_optional_int(raw=record, field_name="prompt_tokens")
    cached_tokens = _read_optional_int(raw=record, field_name="cached_tokens")
    input_tokens = max(prompt_tokens or 0, cached_tokens or 0)
    token_counts = [
        input_tokens,
        _read_optional_int(raw=record, field_name="completion_tokens") or 0,
        _read_optional_int(raw=record, field_name="thoughts_tokens") or 0,
    ]
    return sum(token_counts)


def _normalize_usage_records(*, raw_records: object) -> list[dict[str, object]]:
    if not isinstance(raw_records, list):
        return []
    normalized_records: list[dict[str, object]] = []
    for raw_record in raw_records:
        if not isinstance(raw_record, dict):
            continue
        observed_tokens = _record_total_tokens(record=raw_record)
        if observed_tokens <= 0:
            continue
        normalized_record: dict[str, object] = {
            "provider": str(raw_record.get("provider") or "").strip(),
            "model": str(raw_record.get("model") or "").strip(),
        }
        if not normalized_record["provider"] or not normalized_record["model"]:
            raise PriceCatalogError(
                "AI cost price catalog cannot price usage without provider/model identity"
            )
        for field_name in (
            "prompt_tokens",
            "completion_tokens",
            "cached_tokens",
            "thoughts_tokens",
            "total_tokens",
        ):
            parsed_value = _read_optional_int(raw=raw_record, field_name=field_name)
            if parsed_value is not None:
                normalized_record[field_name] = parsed_value
        normalized_records.append(normalized_record)
    return normalized_records


def _catalog_key(*, provider: str, model: str) -> tuple[str, str]:
    return provider.strip().lower(), model.strip().lower()


def _validate_unique_entries(*, entries: tuple[ModelPrice, ...], path: str) -> None:
    seen_keys: set[tuple[str, str]] = set()
    for entry in entries:
        key = _catalog_key(provider=entry.provider, model=entry.model)
        if key in seen_keys:
            raise PriceCatalogError(
                f"AI cost price catalog has duplicate model entry: path={path}; provider={entry.provider}; model={entry.model}"
            )
        seen_keys.add(key)


def _validate_source_url(*, source_url: str, path: str) -> None:
    parsed_url = urlparse(source_url)
    if parsed_url.scheme != "https":
        raise PriceCatalogError(f"AI cost price source_url must be https: path={path}")
    hostname = parsed_url.hostname
    if hostname is None or hostname.lower() not in OFFICIAL_PRICE_SOURCE_HOSTS:
        raise PriceCatalogError(f"AI cost price source_url must use an official pricing host: path={path}")
    if parsed_url.username or parsed_url.password or parsed_url.query or parsed_url.fragment:
        raise PriceCatalogError(f"AI cost price source_url must not include credentials, query, or fragment: path={path}")


def _read_required_str(*, raw: Mapping[str, object], field_name: str, path: str) -> str:
    value = raw.get(field_name)
    if not isinstance(value, str) or not value.strip():
        raise PriceCatalogError(f"AI cost price catalog field must be a non-empty string: path={path}.{field_name}")
    return value.strip()


def _read_required_float(*, raw: Mapping[str, object], field_name: str, path: str) -> float:
    value = raw.get(field_name)
    if isinstance(value, bool):
        raise PriceCatalogError(f"AI cost price catalog field must be numeric: path={path}.{field_name}")
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise PriceCatalogError(f"AI cost price catalog field must be numeric: path={path}.{field_name}") from error


def _read_required_date(*, raw: Mapping[str, object], field_name: str, path: str) -> date:
    value = _read_required_str(raw=raw, field_name=field_name, path=path)
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise PriceCatalogError(f"AI cost price catalog field must be ISO date: path={path}.{field_name}") from error


def _read_optional_int(*, raw: Mapping[str, object], field_name: str) -> int | None:
    value = raw.get(field_name)
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed_value = int(value)
    except (TypeError, ValueError):
        return None
    if parsed_value < 0:
        return None
    return parsed_value
