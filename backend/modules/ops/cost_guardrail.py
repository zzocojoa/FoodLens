from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from typing import Protocol


class CostGuardrailAction(StrEnum):
    NORMAL = "normal"
    WARN = "warn"
    DEGRADE = "degrade"
    FALLBACK = "fallback"


@dataclass
class MonthlyUsage:
    period_key: str
    total_cost_usd: float = 0.0
    total_tokens: int = 0


@dataclass(frozen=True)
class CostGuardrailDecision:
    action: CostGuardrailAction
    ratio: float
    projected_total_cost_usd: float
    period_key: str


class MonthlyUsageStorage(Protocol):
    def get(self, period_key: str) -> MonthlyUsage:
        ...

    def put(self, usage: MonthlyUsage) -> None:
        ...


class InMemoryMonthlyUsageStorage:
    def __init__(self) -> None:
        self._store: dict[str, MonthlyUsage] = {}

    def get(self, period_key: str) -> MonthlyUsage:
        usage = self._store.get(period_key)
        if usage is None:
            usage = MonthlyUsage(period_key=period_key)
            self._store[period_key] = usage
        return usage

    def put(self, usage: MonthlyUsage) -> None:
        self._store[usage.period_key] = usage


class CostGuardrailService:
    def __init__(
        self,
        storage: MonthlyUsageStorage,
        *,
        monthly_budget_usd: float,
        warn_ratio: float = 0.70,
        degrade_ratio: float = 0.85,
        fallback_ratio: float = 1.00,
    ) -> None:
        self.storage = storage
        self.monthly_budget_usd = max(0.0001, monthly_budget_usd)
        self.warn_ratio = warn_ratio
        self.degrade_ratio = degrade_ratio
        self.fallback_ratio = fallback_ratio

    def _period_key(self, now: datetime | None = None) -> str:
        now = now or datetime.now(timezone.utc)
        return f"{now.year:04d}-{now.month:02d}"

    def evaluate(self, projected_cost_usd: float, *, now: datetime | None = None) -> CostGuardrailDecision:
        period_key = self._period_key(now)
        usage = self.storage.get(period_key)
        projected_total = usage.total_cost_usd + max(0.0, projected_cost_usd)
        ratio = projected_total / self.monthly_budget_usd

        if ratio >= self.fallback_ratio:
            action = CostGuardrailAction.FALLBACK
        elif ratio >= self.degrade_ratio:
            action = CostGuardrailAction.DEGRADE
        elif ratio >= self.warn_ratio:
            action = CostGuardrailAction.WARN
        else:
            action = CostGuardrailAction.NORMAL

        return CostGuardrailDecision(
            action=action,
            ratio=ratio,
            projected_total_cost_usd=projected_total,
            period_key=period_key,
        )

    def record(self, *, cost_usd: float, tokens: int, now: datetime | None = None) -> MonthlyUsage:
        period_key = self._period_key(now)
        usage = self.storage.get(period_key)
        usage.total_cost_usd += max(0.0, cost_usd)
        usage.total_tokens += max(0, tokens)
        self.storage.put(usage)
        return usage
