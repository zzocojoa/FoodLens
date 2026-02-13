"""JSON schema builders for Gemini structured output."""
from typing import Any, Final, TypeAlias

SchemaDict: TypeAlias = dict[str, Any]
SAFETY_STATUS_ENUM: Final[list[str]] = ["SAFE", "CAUTION", "DANGER"]


def _build_object_schema(properties: SchemaDict, required: list[str] | None = None) -> SchemaDict:
    schema = {
        "type": "OBJECT",
        "properties": properties,
    }
    if required:
        schema["required"] = required
    return schema


def _build_array_schema(item_schema: SchemaDict) -> SchemaDict:
    return {
        "type": "ARRAY",
        "items": item_schema,
    }


def _build_allergen_ingredient_item_schema() -> SchemaDict:
    return _build_object_schema(
        properties={
            "name": {"type": "STRING"},
            "name_en": {"type": "STRING"},
            "name_ko": {"type": "STRING"},
            "isAllergen": {"type": "BOOLEAN"},
            "riskReason": {"type": "STRING"},
        },
        required=["name", "isAllergen"],
    )


def _build_food_ingredient_item_schema() -> SchemaDict:
    return _build_object_schema(
        properties={
            "name": {"type": "STRING"},
            "name_en": {"type": "STRING"},
            "name_ko": {"type": "STRING"},
            "bbox": {"type": "ARRAY", "items": {"type": "INTEGER"}},
            "isAllergen": {"type": "BOOLEAN"},
        },
        required=["name", "bbox", "isAllergen"],
    )


def build_label_response_schema() -> SchemaDict:
    return _build_object_schema(
        properties={
            "foodName": {"type": "STRING"},
            "foodName_en": {"type": "STRING"},
            "foodName_ko": {"type": "STRING"},
            "raw_result_en": {"type": "STRING"},
            "raw_result_ko": {"type": "STRING"},
            "safetyStatus": {"type": "STRING", "enum": SAFETY_STATUS_ENUM},
            "confidence": {"type": "INTEGER"},
            "nutrition": _build_object_schema(
                properties={
                    "calories": {"type": "NUMBER"},
                    "carbs": {"type": "NUMBER"},
                    "protein": {"type": "NUMBER"},
                    "fat": {"type": "NUMBER"},
                    "sugar": {"type": "NUMBER"},
                    "sodium": {"type": "NUMBER"},
                    "fiber": {"type": "NUMBER"},
                    "servingSize": {"type": "STRING"},
                    "dataSource": {"type": "STRING"},
                },
            ),
            "ingredients": _build_array_schema(_build_allergen_ingredient_item_schema()),
            "raw_result": {"type": "STRING"},
        },
        required=["foodName", "nutrition", "ingredients", "safetyStatus"],
    )


def build_food_response_schema() -> SchemaDict:
    return _build_object_schema(
        properties={
            "foodName": {"type": "STRING"},
            "foodName_en": {"type": "STRING"},
            "foodName_ko": {"type": "STRING"},
            "raw_result_en": {"type": "STRING"},
            "raw_result_ko": {"type": "STRING"},
            "canonicalFoodId": {"type": "STRING"},
            "foodOrigin": {"type": "STRING"},
            "safetyStatus": {"type": "STRING", "enum": SAFETY_STATUS_ENUM},
            "confidence": {"type": "INTEGER"},
            "ingredients": _build_array_schema(_build_food_ingredient_item_schema()),
            "translationCard": _build_object_schema(
                properties={
                    "language": {"type": "STRING"},
                    "text": {"type": "STRING"},
                    "audio_query": {"type": "STRING"},
                },
            ),
            "raw_result": {"type": "STRING"},
        },
        required=["foodName", "ingredients", "safetyStatus"],
    )


def build_barcode_allergen_schema() -> SchemaDict:
    return _build_object_schema(
        properties={
            "safetyStatus": {"type": "STRING", "enum": SAFETY_STATUS_ENUM},
            "coachMessage": {"type": "STRING"},
            "ingredients": _build_array_schema(_build_allergen_ingredient_item_schema()),
        },
        required=["safetyStatus", "ingredients", "coachMessage"],
    )
