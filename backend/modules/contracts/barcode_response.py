from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


SafetyStatus = Literal["SAFE", "CAUTION", "DANGER"]


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
