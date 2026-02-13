USDA_API_BASE = "https://api.nal.usda.gov/fdc/v1"
KOREAN_FDA_API_BASE = "http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02"
OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/cgi/search.pl"
FATSECRET_TOKEN_URL = "https://oauth.fatsecret.com/connect/token"
FATSECRET_API_URL = "https://platform.fatsecret.com/rest/server.api"

# Timeout Configuration (seconds)
API_TIMEOUT_FAST = 3.0
API_TIMEOUT_SLOW = 10.0
API_CONNECT_TIMEOUT = 2.0

# Food name synonyms for fuzzy matching
FOOD_SYNONYMS = {
    "kimchi stew": "kimchi jjigae",
    "kimchi soup": "kimchi jjigae",
    "김치찌개": "kimchi jjigae",
    "bibimbap": "bibimbap",
    "비빔밥": "bibimbap",
    "bulgogi": "bulgogi",
    "불고기": "bulgogi",
    "korean bbq": "bulgogi",
    "tteokbokki": "tteokbokki",
    "떡볶이": "tteokbokki",
    "spicy rice cake": "tteokbokki",
    "samgyeopsal": "pork belly",
    "삼겹살": "pork belly",
    "sashimi": "raw fish",
    "onigiri": "rice ball",
    "mac and cheese": "macaroni and cheese",
    "mac n cheese": "macaroni and cheese",
    "burger": "hamburger",
    "fries": "french fries",
    "fried rice": "fried rice",
    "볶음밥": "fried rice",
}

