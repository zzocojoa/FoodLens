import asyncio
import time
import traceback
from typing import Dict, Any

from vertexai.generative_models import GenerativeModel, Image as VertexImage
from PIL import Image
import io

from backend.modules.analyst_runtime.food_analyst import FoodAnalyst
from backend.modules.analyst_runtime.router_utils import (
    build_barcode_route_response,
    build_not_food_response,
    build_router_error_response,
    parse_classification_response,
)

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
            
            category, confidence = parse_classification_response(response.text)

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
                return build_barcode_route_response(category)

            else: # NOT_FOOD or Unknown
                return build_not_food_response(category)

        except Exception as e:
            print(f"[SmartRouter] Error: {e}")
            traceback.print_exc()
            return build_router_error_response(e)
