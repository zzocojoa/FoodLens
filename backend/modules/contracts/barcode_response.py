from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from backend.modules.contracts.observability import LatencyMsContract


SafetyStatus = Literal["SAFE", "CAUTION", "DANGER"]
DecisionStatus = Literal["OK", "ASK", "AVOID"]
AnalysisOrigin = Literal["food_photo", "label_photo", "barcode_lookup", "barcode_to_label_fallback"]
RecommendedAction = Literal["eat", "verify_label", "ask_staff", "avoid"]
UncertaintyReason = Literal["image_ambiguity", "missing_label_text", "barcode_not_found", "low_confidence", "unknown"]
DecisionConfidence = Literal["high", "medium", "low"]


class BarcodeIngredientContract(BaseModel):
    name: str
    isAllergen: bool = False
    name_en: Optional[str] = None
    name_ko: Optional[str] = None
    riskReason: Optional[str] = None


class BarcodeNutritionDataContract(BaseModel):
    calories: Optional[float] = None
    carbs: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    fiber: Optional[float] = None
    sodium: Optional[float] = None
    sugar: Optional[float] = None
    servingSize: Optional[str] = None


class BarcodeDataContract(BaseModel):
    food_name: str
    food_name_en: Optional[str] = None
    food_name_ko: Optional[str] = None
    safetyStatus: Optional[SafetyStatus] = None
    decision_status: Optional[DecisionStatus] = None
    analysis_origin: Optional[AnalysisOrigin] = None
    recommended_action: Optional[RecommendedAction] = None
    uncertainty_reason: Optional[UncertaintyReason] = None
    decision_confidence: Optional[DecisionConfidence] = None
    coachMessage: Optional[str] = None
    raw_result: Optional[str] = None
    raw_result_en: Optional[str] = None
    raw_result_ko: Optional[str] = None

    ingredients: list[BarcodeIngredientContract | str] = Field(default_factory=list)

    calories: Optional[float] = None
    carbs: Optional[float] = None
    protein: Optional[float] = None
    fat: Optional[float] = None
    fiber: Optional[float] = None
    sodium: Optional[float] = None
    sugar: Optional[float] = None
    servingSize: Optional[str] = None
    source: Optional[str] = None
    image_url: Optional[str] = None

    raw_data: Optional[dict[str, Any]] = None


class BarcodeLookupResponseContract(BaseModel):
    found: bool
    data: Optional[BarcodeDataContract] = None
    message: Optional[str] = None
    error: Optional[str] = None
    request_id: Optional[str] = None
    prompt_version: Optional[str] = None
    used_model: Optional[str] = None
    latency_ms: Optional[LatencyMsContract] = None
