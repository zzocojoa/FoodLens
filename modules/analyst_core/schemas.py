"""JSON schema builders for Gemini structured output."""


def build_label_response_schema() -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "foodName": {"type": "STRING"},
            "foodName_en": {"type": "STRING"},
            "foodName_ko": {"type": "STRING"},
            "safetyStatus": {"type": "STRING", "enum": ["SAFE", "CAUTION", "DANGER"]},
            "confidence": {"type": "INTEGER"},
            "nutrition": {
                "type": "OBJECT",
                "properties": {
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
            },
            "ingredients": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "isAllergen": {"type": "BOOLEAN"},
                        "riskReason": {"type": "STRING"},
                    },
                    "required": ["name", "isAllergen"],
                },
            },
            "raw_result": {"type": "STRING"},
        },
        "required": ["foodName", "nutrition", "ingredients", "safetyStatus"],
    }


def build_food_response_schema() -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "foodName": {"type": "STRING"},
            "foodName_en": {"type": "STRING"},
            "foodName_ko": {"type": "STRING"},
            "canonicalFoodId": {"type": "STRING"},
            "foodOrigin": {"type": "STRING"},
            "safetyStatus": {"type": "STRING", "enum": ["SAFE", "CAUTION", "DANGER"]},
            "confidence": {"type": "INTEGER"},
            "ingredients": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "bbox": {"type": "ARRAY", "items": {"type": "INTEGER"}},
                        "isAllergen": {"type": "BOOLEAN"},
                    },
                    "required": ["name", "bbox", "isAllergen"],
                },
            },
            "translationCard": {
                "type": "OBJECT",
                "properties": {
                    "language": {"type": "STRING"},
                    "text": {"type": "STRING"},
                    "audio_query": {"type": "STRING"},
                },
            },
            "raw_result": {"type": "STRING"},
        },
        "required": ["foodName", "ingredients", "safetyStatus"],
    }


def build_barcode_allergen_schema() -> dict:
    return {
        "type": "OBJECT",
        "properties": {
            "safetyStatus": {"type": "STRING", "enum": ["SAFE", "CAUTION", "DANGER"]},
            "coachMessage": {"type": "STRING"},
            "ingredients": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "isAllergen": {"type": "BOOLEAN"},
                        "riskReason": {"type": "STRING"},
                    },
                    "required": ["name", "isAllergen"],
                },
            },
        },
        "required": ["safetyStatus", "ingredients", "coachMessage"],
    }

