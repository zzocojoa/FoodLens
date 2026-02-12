import asyncio
import json
import time
import traceback
from typing import Dict, Any, Optional

from google.cloud import aiplatform
import vertexai
from vertexai.generative_models import GenerativeModel, Part, Image as VertexImage
from PIL import Image
import io

from modules.analyst import FoodAnalyst

class SmartRouter:
    """
    Intelligent router that classifies an input image (mostly from Gallery)
    and routes it to the appropriate analysis pipeline (Food or Label).
    Uses Gemini 2.0 Flash for low-latency classification.
    """
    
    def __init__(self, analyst: FoodAnalyst):
        self.analyst = analyst
        # Use Flash for routing (cheap & fast)
        self.router_model = GenerativeModel("gemini-2.0-flash")
        
    def _prepare_image(self, pil_image: Image.Image) -> VertexImage:
        """Helper to convert PIL image to Vertex Image."""
        img_byte_arr = io.BytesIO()
        pil_image.save(img_byte_arr, format='JPEG')
        return VertexImage.from_bytes(img_byte_arr.getvalue())

    def _build_classification_prompt(self) -> str:
        return """
        You are an AI Router for a Food Analysis App.
        Analyze the uploaded image and classify it into EXACTLY one of these categories:
        
        1. REAL_FOOD: An image of prepared food, ingredients, meals, or fruits/vegetables.
        2. NUTRITION_LABEL: An image containing a nutrition facts table or ingredient list text.
        3. BARCODE: An image clearly showing a product barcode.
        4. MENU: A restaurant menu text.
        5. NOT_FOOD: Anything else (people, selfies, cars, landscapes, non-food objects).
        
        Return ONLY a JSON object:
        { "category": "CATEGORY_NAME", "confidence": 0.0-1.0 }
        """

    async def route_analysis(self, image: Image.Image, allergy_info: str = "None", iso_country_code: str = "US") -> Dict[str, Any]:
        """
        Classifies the image and executes the corresponding analysis method.
        """
        print(f"[SmartRouter] Identifying image type...")
        start_time = time.time()
        
        try:
            # 1. Classify
            vertex_image = self._prepare_image(image)
            prompt = self._build_classification_prompt()
            
            response = await asyncio.to_thread(
                self.router_model.generate_content,
                [prompt, vertex_image],
                generation_config={"response_mime_type": "application/json", "temperature": 0.0}
            )
            
            try:
                classification = json.loads(response.text)
                category = classification.get("category", "NOT_FOOD")
                confidence = classification.get("confidence", 0.0)
            except json.JSONDecodeError:
                print(f"[SmartRouter] Failed to parse JSON: {response.text}")
                category = "NOT_FOOD"
                confidence = 0.0

            print(f"[SmartRouter] Result: {category} ({confidence:.2f}) - {time.time() - start_time:.2f}s")

            # 2. Route
            if category == "REAL_FOOD" or category == "MENU":
                print("[SmartRouter] Routing to -> Food Analysis")
                # Add a flag to result indicating it was auto-routed
                result = await asyncio.to_thread(
                    self.analyst.analyze_food_json, 
                    image, allergy_info, iso_country_code
                )
                result["router_category"] = category
                return result

            elif category == "NUTRITION_LABEL":
                print("[SmartRouter] Routing to -> Label Analysis")
                result = await asyncio.to_thread(
                    self.analyst.analyze_label_json,
                    image, allergy_info, iso_country_code
                )
                result["router_category"] = category
                return result

            elif category == "BARCODE":
                return {
                    "safetyStatus": "CAUTION",
                    "coachMessage": "바코드가 감지되었습니다. 더 정확한 분석을 위해 바코드 스캐너를 이용해주세요.",
                    "foodName": "바코드 감지됨",
                    "ingredients": [],
                    "router_category": category
                }

            else: # NOT_FOOD or Unknown
                return {
                    "safetyStatus": "CAUTION",
                    "coachMessage": "음식이나 영양성분표가 아닌 것 같습니다. 음식 사진을 올려주세요.",
                    "foodName": "알 수 없음",
                    "ingredients": [],
                    "router_category": category
                }

        except Exception as e:
            print(f"[SmartRouter] Error: {e}")
            traceback.print_exc()
            return {
                "safetyStatus": "CAUTION",
                "coachMessage": "이미지 분석 중 오류가 발생했습니다.",
                "error": str(e)
            }
