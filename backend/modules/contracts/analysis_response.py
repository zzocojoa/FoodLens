from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

from backend.modules.contracts.observability import LatencyMsContract


SafetyStatus = Literal["SAFE", "CAUTION", "DANGER"]
DecisionStatus = Literal["OK", "ASK", "AVOID"]
AnalysisOrigin = Literal["food_photo", "label_photo", "barcode_lookup", "barcode_to_label_fallback"]
RecommendedAction = Literal["eat", "verify_label", "ask_staff", "avoid"]
UncertaintyReason = Literal["image_ambiguity", "missing_label_text", "barcode_not_found", "low_confidence", "unknown"]
AnalysisDiagnosticsOrigin = Literal["food_photo", "smart_route"]
AnalysisDiagnosticsUsageSource = Literal["provider_usage_metadata", "estimated", "not_chargeable"]
DecisionConfidence = Literal["high", "medium", "low"]


class TranslationCardContract(BaseModel):
    language: str
    text: Optional[str] = None
    audio_query: Optional[str] = None


class NutritionContract(BaseModel):
    calories: Optional[float] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    fiber: Optional[float] = None
    sodium: Optional[float] = None
    sugar: Optional[float] = None
    servingSize: Optional[str] = None
    dataSource: Optional[str] = None


class IngredientContract(BaseModel):
    name: str
    name_en: Optional[str] = None
    name_ko: Optional[str] = None
    isAllergen: bool = False
    bbox: Optional[list[int]] = None
    box_2d: Optional[list[int]] = None
    confidence_score: Optional[float] = None
    riskReason: Optional[str] = None


class AnalysisDiagnosticsContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: AnalysisDiagnosticsOrigin
    fallback_used: bool
    fallback_reason: Optional[str] = None
    finish_reason: Optional[int] = None
    truncated: bool
    usage_source: AnalysisDiagnosticsUsageSource


class AnalysisResponseContract(BaseModel):
    foodName: str
    safetyStatus: SafetyStatus
    ingredients: list[IngredientContract] = Field(default_factory=list)
    decision_status: Optional[DecisionStatus] = None
    analysis_origin: Optional[AnalysisOrigin] = None
    recommended_action: Optional[RecommendedAction] = None
    uncertainty_reason: Optional[UncertaintyReason] = None
    decision_confidence: Optional[DecisionConfidence] = None

    foodName_en: Optional[str] = None
    foodName_ko: Optional[str] = None
    confidence: Optional[int] = None
    nutrition: Optional[NutritionContract] = None
    translationCard: Optional[TranslationCardContract] = None
    raw_result: Optional[str] = None
    raw_result_en: Optional[str] = None
    raw_result_ko: Optional[str] = None
    request_id: Optional[str] = None
    prompt_version: Optional[str] = None
    used_model: Optional[str] = None
    latency_ms: Optional[LatencyMsContract] = None
    label_diagnostics: Optional[dict] = None
    analysis_diagnostics: Optional[AnalysisDiagnosticsContract] = None
