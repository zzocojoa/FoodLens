from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


SafetyStatus = Literal["SAFE", "CAUTION", "DANGER"]


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


class AnalysisResponseContract(BaseModel):
    foodName: str
    safetyStatus: SafetyStatus
    ingredients: list[IngredientContract] = Field(default_factory=list)

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
