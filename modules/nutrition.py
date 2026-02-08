"""
Multi-tier Nutrition API Integration Module
Priority: 1. Korean FDA (식약처) → 2. USDA → 3. Open Food Facts
"""

import os
from dotenv import load_dotenv
load_dotenv()
import httpx
from typing import Optional, Dict, Any
from urllib.parse import quote

# API Endpoints
USDA_API_BASE = "https://api.nal.usda.gov/fdc/v1"
KOREAN_FDA_API_BASE = "http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02"
OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/cgi/search.pl"
FATSECRET_TOKEN_URL = "https://oauth.fatsecret.com/connect/token"
FATSECRET_API_URL = "https://platform.fatsecret.com/rest/server.api"

# Timeout Configuration (seconds)
# Shorter timeouts for faster fallback to next API
API_TIMEOUT_FAST = 3.0       # For reliable APIs (USDA, Korean FDA)
API_TIMEOUT_SLOW = 10.0      # Increased for Open Food Facts reliability
API_CONNECT_TIMEOUT = 2.0    # Connection timeout (fail fast if server unreachable)

# Food name synonyms for fuzzy matching
# Maps common variations → standardized search term
FOOD_SYNONYMS = {
    # Korean dishes
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
    
    # Japanese
    "sashimi": "raw fish",
    "onigiri": "rice ball",
    
    # Western
    "mac and cheese": "macaroni and cheese",
    "mac n cheese": "macaroni and cheese",
    "burger": "hamburger",
    "fries": "french fries",
    
    # Common variations
    "fried rice": "fried rice",
    "볶음밥": "fried rice",
}

def normalize_food_name(food_name: str) -> list[str]:
    """
    Returns a list of normalized food name variants for API queries.
    Includes the original name plus any synonyms.
    
    Args:
        food_name: Original food name from AI analysis
        
    Returns:
        List of search terms to try (original + synonyms + variations)
    """
    if not food_name:
        return []
    
    variants = [food_name]
    lower_name = food_name.lower().strip()
    
    # Check direct synonym match
    if lower_name in FOOD_SYNONYMS:
        variants.append(FOOD_SYNONYMS[lower_name])
    
    # Check partial matches
    for key, value in FOOD_SYNONYMS.items():
        if key in lower_name or lower_name in key:
            if value not in variants:
                variants.append(value)
    
    # Add common transformations
    # Remove common prefixes/suffixes
    transforms = [
        lower_name.replace("korean ", ""),
        lower_name.replace(" dish", ""),
        lower_name.replace(" bowl", ""),
    ]
    for t in transforms:
        if t != lower_name and t not in variants:
            variants.append(t)
    
    return variants


class NutritionLookup:
    def __init__(self):
        self.usda_api_key = os.getenv("USDA_API_KEY")
        self.korean_fda_api_key = os.getenv("KOREAN_FDA_API_KEY")
        self.fatsecret_id = os.getenv("FATSECRET_CLIENT_ID")
        self.fatsecret_secret = os.getenv("FATSECRET_CLIENT_SECRET")
        self.fatsecret_token = None
        
        if not self.usda_api_key:
            print("Warning: USDA_API_KEY not found")
        if not self.korean_fda_api_key:
            print("Warning: KOREAN_FDA_API_KEY not found")
        if not self.fatsecret_id or not self.fatsecret_secret:
            print("Warning: FATSECRET_CLIENT_ID or FATSECRET_CLIENT_SECRET not found")
    
    def search_food(self, food_name: str, food_origin: str = "unknown") -> Optional[Dict[str, Any]]:
        """
        Multi-tier nutrition lookup based on food origin.
        Priority: Korean FDA → USDA → FatSecret → Open Food Facts
        
        Uses fuzzy matching via normalize_food_name() to try multiple
        name variants for improved matching success.
        """
        # Get all name variants for fuzzy matching
        name_variants = normalize_food_name(food_name)
        
        for query in name_variants:
            result = self._search_food_single(query, food_origin)
            if self._has_calories(result):
                return result
        
        return self._get_fallback_nutrition(food_name)
    
    def _search_food_single(self, food_name: str, food_origin: str) -> Optional[Dict[str, Any]]:
        """Internal: Search with a single food name query."""
        result = None
        
        # 1. 한국 음식 → 식약처 먼저
        if food_origin == "korean":
            # Fallback chain for Korean: 식약처 -> FatSecret -> Open Food Facts
            result, found = self._try_search_chain(
                food_name,
                [self._search_korean_fda, self._search_fatsecret, self._search_open_food_facts]
            )
            if found:
                return result
        
        # 2. 단일 재료 또는 서양 음식 → USDA
        if food_origin in ["single_ingredient", "western", "unknown"]:
            result = self._search_usda(food_name)
            if self._has_calories(result):
                return result
        
        # 3. 기타 아시아 음식: FatSecret이 아시아 음식 데이터가 꽤 좋음
        if food_origin in ["asian", "other"]:
            result, found = self._try_search_chain(
                food_name,
                [self._search_fatsecret, self._search_open_food_facts, self._search_usda]
            )
            if found:
                return result
        
        # 4. 최종 fallback chain
        if not self._has_calories(result):
            result, _ = self._try_search_chain(
                food_name,
                [self._search_usda, self._search_fatsecret, self._search_open_food_facts]
            )
        
        return result  # Let caller handle fallback
    
    # ==================== Korean FDA (식약처) ====================
    def _search_korean_fda(self, food_name: str) -> Optional[Dict[str, Any]]:
        """Search Korean FDA nutrition database."""
        if not self.korean_fda_api_key:
            return None
        
        try:
            params = {
                "serviceKey": self.korean_fda_api_key,
                "type": "json",
                "FOOD_NM_KR": food_name,
                "numOfRows": 5,
                "pageNo": 1
            }
            
            url = f"{KOREAN_FDA_API_BASE}/getFoodNtrCpntDbInq02"
            response = httpx.get(url, params=params, timeout=API_TIMEOUT_FAST)
            
            # If rate limit exceeded or error, print and return None to trigger fallback
            if response.status_code != 200:
                print(f"Korean FDA API error: {response.status_code}")
                return None
                
            data = response.json()
            
            # Parse response
            body = data.get("body", {})
            items = body.get("items", [])
            
            if not items:
                print(f"No Korean FDA results for: {food_name}")
                return None
            
            item = items[0]
            print(f"Korean FDA found: {item.get('FOOD_NM_KR', food_name)}")
            
            return {
                "calories": self._safe_float(item.get("AMT_NUM1")),  # 에너지(kcal)
                "protein": self._safe_float(item.get("AMT_NUM3")),   # 단백질(g)
                "carbs": self._safe_float(item.get("AMT_NUM6")),     # 탄수화물(g)
                "fat": self._safe_float(item.get("AMT_NUM4")),       # 지방(g)
                "fiber": self._safe_float(item.get("AMT_NUM9")),     # 식이섬유(g)
                "sodium": self._safe_float(item.get("AMT_NUM13")),   # 나트륨(mg)
                "sugar": self._safe_float(item.get("AMT_NUM7")),     # 당류(g)
                "servingSize": item.get("SERVING_SIZE", "100g"),
                "dataSource": "식약처 식품영양성분DB",
                "description": item.get("FOOD_NM_KR", food_name)
            }
            
        except Exception as e:
            print(f"Korean FDA API error: {e}")
            return None

    # ==================== FatSecret Platform ====================
    def _get_fatsecret_token(self):
        """Get OAuth 2.0 access token for FatSecret."""
        if not self.fatsecret_id or not self.fatsecret_secret:
            return None
            
        try:
            response = httpx.post(
                FATSECRET_TOKEN_URL,
                data={"grant_type": "client_credentials"},
                auth=(self.fatsecret_id, self.fatsecret_secret),
                timeout=API_TIMEOUT_FAST
            )
            response.raise_for_status()
            token_data = response.json()
            return token_data.get("access_token")
        except Exception as e:
            print(f"FatSecret token error: {e}")
            return None

    def _search_fatsecret(self, food_name: str) -> Optional[Dict[str, Any]]:
        """Search FatSecret Platform API."""
        if not self.fatsecret_id or not self.fatsecret_secret:
            return None
            
        try:
            # Get token if not exists (simple implementation, no expiry check for now)
            if not self.fatsecret_token:
                self.fatsecret_token = self._get_fatsecret_token()
                
            if not self.fatsecret_token:
                return None
            
            # 1. Search for food
            search_params = {
                "method": "foods.search",
                "search_expression": food_name,
                "format": "json",
                "max_results": 1
            }
            
            headers = {"Authorization": f"Bearer {self.fatsecret_token}"}
            
            response = httpx.get(FATSECRET_API_URL, params=search_params, headers=headers, timeout=API_TIMEOUT_FAST)
            
            # If 401 Unauthorized, maybe token expired. Retry once.
            if response.status_code == 401:
                 self.fatsecret_token = self._get_fatsecret_token()
                 headers = {"Authorization": f"Bearer {self.fatsecret_token}"}
                 response = httpx.get(FATSECRET_API_URL, params=search_params, headers=headers, timeout=API_TIMEOUT_FAST)
            
            response.raise_for_status()
            data = response.json()
            
            foods_container = data.get("foods", {})
            food_list = foods_container.get("food", [])
            
            # FatSecret returns single dict if only 1 result, list if multiple
            if isinstance(food_list, dict):
                food_list = [food_list]
                
            if not food_list:
                print(f"No FatSecret results for: {food_name}")
                return None
                
            # Get food ID to fetch details
            food_id = food_list[0].get("food_id")
            food_description = food_list[0].get("food_description", "") # Contains simple summary
            food_name_result = food_list[0].get("food_name", food_name)
            
            # 2. Get detailed food info
            detail_params = {
                "method": "food.get.v2",
                "food_id": food_id,
                "format": "json"
            }
            
            detail_res = httpx.get(FATSECRET_API_URL, params=detail_params, headers=headers, timeout=API_TIMEOUT_FAST)
            detail_res.raise_for_status()
            detail_data = detail_res.json()
            
            food_details = detail_data.get("food", {})
            servings = food_details.get("servings", {}).get("serving", [])
            
            if isinstance(servings, dict):
                servings = [servings]
                
            if not servings:
                return None
                
            # Prefer 100g serving if available, otherwise first one
            target_serving = servings[0]
            for s in servings:
                if "100g" in s.get("serving_description", "") or s.get("metric_serving_unit") == "g" and s.get("metric_serving_amount") == "100.000":
                    target_serving = s
                    break
            
            print(f"FatSecret found: {food_name_result}")
            
            return {
                "calories": self._safe_float(target_serving.get("calories")),
                "protein": self._safe_float(target_serving.get("protein")),
                "carbs": self._safe_float(target_serving.get("carbohydrate")),
                "fat": self._safe_float(target_serving.get("fat")),
                "fiber": self._safe_float(target_serving.get("fiber")),
                "sodium": self._safe_float(target_serving.get("sodium")),
                "sugar": self._safe_float(target_serving.get("sugar")),
                "servingSize": target_serving.get("serving_description", "1 serving"),
                "dataSource": "FatSecret Platform",
                "description": food_name_result
            }
            
        except Exception as e:
            print(f"FatSecret API error: {e}")
            return None
    
    # ==================== USDA ====================
    def _search_usda(self, food_name: str) -> Optional[Dict[str, Any]]:
        """Search USDA FoodData Central."""
        if not self.usda_api_key:
            return None
        
        # Try original name first, then fall back to main ingredient
        search_queries = [food_name]
        if " " in food_name:
            words = food_name.split()
            search_queries.append(words[-1])
        
        for query in search_queries:
            result = self._search_usda_query(query)
            if self._has_calories(result):
                return result
        
        return None
    
    def _search_usda_query(self, query: str) -> Optional[Dict[str, Any]]:
        """Execute USDA API search."""
        try:
            params = {
                "api_key": self.usda_api_key,
                "query": query,
                "pageSize": 5
            }
            
            response = httpx.get(f"{USDA_API_BASE}/foods/search", params=params, timeout=API_TIMEOUT_FAST)
            
            # Handle limits/errors
            if response.status_code != 200:
                print(f"USDA API error: {response.status_code}")
                return None
                
            data = response.json()
            
            foods = data.get("foods", [])
            if not foods:
                return None
            
            food = foods[0]
            nutrients = self._extract_usda_nutrients(food)
            
            print(f"USDA found: {food.get('description', query)}")
            
            return {
                "calories": nutrients.get("Energy", 0),
                "protein": nutrients.get("Protein", 0),
                "carbs": nutrients.get("Carbohydrate, by difference", 0),
                "fat": nutrients.get("Total lipid (fat)", 0),
                "fiber": nutrients.get("Fiber, total dietary", 0),
                "sodium": nutrients.get("Sodium, Na", 0),
                "sugar": nutrients.get("Sugars, total including NLEA", 0),
                "servingSize": "100g",
                "dataSource": "USDA FoodData Central",
                "fdcId": food.get("fdcId"),
                "description": food.get("description", query)
            }
            
        except Exception as e:
            print(f"USDA API error: {e}")
            return None
    
    def _extract_usda_nutrients(self, food: Dict) -> Dict[str, float]:
        """Extract nutrient values from USDA food data."""
        nutrients = {}
        for nutrient in food.get("foodNutrients", []):
            name = nutrient.get("nutrientName", "")
            value = nutrient.get("value", 0)
            if name and value:
                nutrients[name] = value
        return nutrients
    
    # ==================== Open Food Facts ====================
    def _search_open_food_facts(self, food_name: str) -> Optional[Dict[str, Any]]:
        """Search Open Food Facts database."""
        try:
            params = {
                "search_terms": food_name,
                "search_simple": 1,
                "action": "process",
                "json": 1,
                "page_size": 5
            }
            
            headers = {"User-Agent": "FoodLens App - https://github.com/foodlens"}
            # Use shorter timeout for Open Food Facts (often slow/unreliable)
            timeout = httpx.Timeout(API_TIMEOUT_SLOW, connect=API_CONNECT_TIMEOUT)
            response = httpx.get(OPEN_FOOD_FACTS_API, params=params, headers=headers, timeout=timeout)
            response.raise_for_status()
            data = response.json()
            
            products = data.get("products", [])
            if not products:
                print(f"No Open Food Facts results for: {food_name}")
                return None
            
            # Find first product with nutrition data
            for product in products:
                nutrients = product.get("nutriments", {})
                if nutrients.get("energy-kcal_100g") or nutrients.get("energy_100g"):
                    print(f"Open Food Facts found: {product.get('product_name', food_name)}")
                    
                    # Energy might be in kcal or kJ
                    energy = nutrients.get("energy-kcal_100g")
                    if not energy:
                        energy_kj = nutrients.get("energy_100g", 0)
                        energy = energy_kj / 4.184 if energy_kj else 0
                    
                    if energy:
                        try:
                            # Debug log for type issue
                            # print(f"DEBUG: Energy value: {energy}, Type: {type(energy)}")
                            energy = float(energy)
                            return {
                                "calories": round(energy, 1),
                                "protein": nutrients.get("proteins_100g"),
                        "carbs": nutrients.get("carbohydrates_100g"),
                        "fat": nutrients.get("fat_100g"),
                        "fiber": nutrients.get("fiber_100g"),
                        "sodium": nutrients.get("sodium_100g", 0) * 1000 if nutrients.get("sodium_100g") else None,  # g to mg
                        "sugar": nutrients.get("sugars_100g"),
                        "servingSize": "100g",
                        "dataSource": "Open Food Facts",
                        "description": product.get("product_name", food_name)
                    }
                        except (ValueError, TypeError):
                            print(f"Open Food Facts API error: invalid energy value {energy}")
                            return None
            
            return None
            
        except Exception as e:
            print(f"Open Food Facts API error: {e}")
            return None
    
    # ==================== Helpers ====================
    def _has_calories(self, result: Optional[Dict[str, Any]]) -> bool:
        return bool(result and result.get("calories") is not None)

    def _try_search_chain(self, food_name: str, searchers) -> tuple[Optional[Dict[str, Any]], bool]:
        last_result = None
        for searcher in searchers:
            last_result = searcher(food_name)
            if self._has_calories(last_result):
                return last_result, True
        return last_result, False

    def _safe_float(self, value) -> Optional[float]:
        """Safely convert value to float."""
        if value is None or value == "" or value == "-":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    
    def _get_fallback_nutrition(self, food_name: str) -> Dict[str, Any]:
        """Return fallback when no data is available."""
        return {
            "calories": None,
            "protein": None,
            "carbs": None,
            "fat": None,
            "fiber": None,
            "sodium": None,
            "sugar": None,
            "servingSize": "100g",
            "dataSource": "Unavailable",
            "description": food_name
        }


# Singleton
_nutrition_lookup = None

def get_nutrition_lookup() -> NutritionLookup:
    global _nutrition_lookup
    if _nutrition_lookup is None:
        _nutrition_lookup = NutritionLookup()
    return _nutrition_lookup


def lookup_nutrition(food_name: str, food_origin: str = "unknown") -> Optional[Dict[str, Any]]:
    """Convenience function for nutrition lookup."""
    return get_nutrition_lookup().search_food(food_name, food_origin)
