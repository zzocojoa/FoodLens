from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


AnalysisJobMode = Literal["food", "label", "smart"]
AnalysisJobStatus = Literal[
    "queued",
    "preprocessing",
    "inference",
    "nutrition",
    "finalizing",
    "completed",
    "fallback_completed",
    "failed",
]


class AnalysisJobSubmitResponseContract(BaseModel):
    job_id: str
    request_id: str
    status: AnalysisJobStatus
    accepted_at: str
    poll_after_ms: int


class AnalysisJobStatusResponseContract(BaseModel):
    job_id: str
    request_id: str
    status: AnalysisJobStatus
    stage: Optional[str] = None
    accepted_at: str
    started_at: Optional[str] = None
    updated_at: str
    poll_after_ms: int
    progress_hint: Optional[str] = None
    used_model: Optional[str] = None
    prompt_version: Optional[str] = None
    latency_ms_by_stage: dict[str, int] = Field(default_factory=dict)
    fallback_reason: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None

    foodName: Optional[str] = None
    safetyStatus: Optional[Literal["SAFE", "CAUTION", "DANGER"]] = None
    ingredients: list[dict] = Field(default_factory=list)

    foodName_en: Optional[str] = None
    foodName_ko: Optional[str] = None
    confidence: Optional[int] = None
    nutrition: Optional[dict] = None
    translationCard: Optional[dict] = None
    raw_result: Optional[str] = None
    raw_result_en: Optional[str] = None
    raw_result_ko: Optional[str] = None
