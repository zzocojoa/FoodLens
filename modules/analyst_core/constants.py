"""Constants used by analyst logic."""

# ISO 3166-1 alpha-2 country code -> Primary language mapping
ISO_COUNTRY_TO_LANGUAGE = {
    # East Asia
    "KR": "Korean",
    "JP": "Japanese",
    "CN": "Chinese (Simplified)",
    "TW": "Chinese (Traditional)",
    "HK": "Chinese (Traditional)",
    # Southeast Asia
    "TH": "Thai",
    "VN": "Vietnamese",
    "ID": "Indonesian",
    "MY": "Malay",
    "PH": "Filipino/English",
    "SG": "English",
    # South Asia
    "IN": "Hindi/English",
    # Europe
    "FR": "French",
    "DE": "German",
    "IT": "Italian",
    "ES": "Spanish",
    "PT": "Portuguese",
    "NL": "Dutch",
    "PL": "Polish",
    "RU": "Russian",
    "GR": "Greek",
    "TR": "Turkish",
    # Americas
    "US": "English",
    "CA": "English/French",
    "MX": "Spanish",
    "BR": "Portuguese",
    "AR": "Spanish",
    # Oceania
    "AU": "English",
    "NZ": "English",
    # Middle East
    "AE": "Arabic",
    "SA": "Arabic",
    "IL": "Hebrew",
    # Default fallback aliases
    "GB": "English",
    "UK": "English",
}

# Standard allergen categories (FDA/EU major allergens + app compatibility aliases)
STANDARD_ALLERGENS = {
    # Peanuts
    "peanut": "Peanut",
    "peanuts": "Peanut",
    "땅콩": "Peanut",
    # Tree Nuts
    "tree nut": "Tree Nut",
    "tree nuts": "Tree Nut",
    "treenut": "Tree Nut",
    "nuts": "Tree Nut",
    "almond": "Tree Nut (Almond)",
    "walnut": "Tree Nut (Walnut)",
    "cashew": "Tree Nut (Cashew)",
    "pistachio": "Tree Nut (Pistachio)",
    "견과류": "Tree Nut",
    "호두": "Tree Nut (Walnut)",
    "아몬드": "Tree Nut (Almond)",
    # Dairy/Milk
    "milk": "Milk/Dairy",
    "dairy": "Milk/Dairy",
    "lactose": "Milk/Dairy",
    "우유": "Milk/Dairy",
    "유제품": "Milk/Dairy",
    # Eggs
    "egg": "Egg",
    "eggs": "Egg",
    "계란": "Egg",
    "달걀": "Egg",
    # Wheat/Gluten
    "wheat": "Wheat/Gluten",
    "gluten": "Wheat/Gluten",
    "밀": "Wheat/Gluten",
    "글루텐": "Wheat/Gluten",
    # Soy
    "soy": "Soy",
    "soybean": "Soy",
    "soybeans": "Soy",
    "대두": "Soy",
    "콩": "Soy",
    # Fish
    "fish": "Fish",
    "생선": "Fish",
    # Shellfish
    "shellfish": "Shellfish",
    "shrimp": "Shellfish (Shrimp)",
    "crab": "Shellfish (Crab)",
    "lobster": "Shellfish (Lobster)",
    "갑각류": "Shellfish",
    "새우": "Shellfish (Shrimp)",
    "게": "Shellfish (Crab)",
    # Sesame
    "sesame": "Sesame",
    "참깨": "Sesame",
    # Sulfites
    "sulfite": "Sulfite",
    "sulfites": "Sulfite",
    "아황산염": "Sulfite",
}

