from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.modules.contracts.analysis_response import AnalysisDiagnosticsContract, FoodOrigin


AnalysisJobMode = Literal["food", "label", "smart"]
DecisionStatus = Literal["OK", "ASK", "AVOID"]
AnalysisOrigin = Literal["food_photo", "label_photo", "barcode_lookup", "barcode_to_label_fallback"]
RecommendedAction = Literal["eat", "verify_label", "ask_staff", "avoid"]
UncertaintyReason = Literal["image_ambiguity", "missing_label_text", "barcode_not_found", "low_confidence", "unknown"]
DecisionConfidence = Literal["high", "medium", "low"]
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
    idempotency_reused: bool


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
    decision_status: Optional[DecisionStatus] = None
    analysis_origin: Optional[AnalysisOrigin] = None
    recommended_action: Optional[RecommendedAction] = None
    uncertainty_reason: Optional[UncertaintyReason] = None
    decision_confidence: Optional[DecisionConfidence] = None

    foodName_en: Optional[str] = None
    foodName_ko: Optional[str] = None
    foodOrigin: Optional[FoodOrigin] = None
    confidence: Optional[int] = None
    nutrition: Optional[dict] = None
    translationCard: Optional[dict] = None
    raw_result: Optional[str] = None
    raw_result_en: Optional[str] = None
    raw_result_ko: Optional[str] = None
    label_diagnostics: Optional[dict] = None
    analysis_diagnostics: Optional[AnalysisDiagnosticsContract] = None
