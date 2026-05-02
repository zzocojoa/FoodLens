import asyncio
import time
import traceback
from typing import Awaitable, Callable, Dict, Any

from fastapi import HTTPException
from vertexai.generative_models import GenerativeModel, Image as VertexImage
from PIL import Image
import io

from backend.modules.analyst_runtime.food_analyst import (
    FoodAnalyst,
    ProviderUsageRecord,
    extract_provider_usage_record,
)
from backend.modules.analyst_runtime.router_utils import (
    build_barcode_route_response,
    build_not_food_response,
    build_router_error_response,
    parse_classification_response,
)

ClassificationUsageRecorder = Callable[[], None]


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

    async def _generate_classification_response(
        self,
        image: Image.Image,
        usage_recorder: ClassificationUsageRecorder | None = None,
    ) -> Any:
        vertex_image = self._prepare_image(image)
        prompt = self._build_classification_prompt()

        try:
            return await asyncio.to_thread(
                self.router_model.generate_content,
                [prompt, vertex_image],
                generation_config={"response_mime_type": "application/json", "temperature": 0.0}
            )
        finally:
            if usage_recorder is not None:
                usage_recorder()

    async def classify_image(
        self,
        image: Image.Image,
        usage_recorder: ClassificationUsageRecorder | None = None,
    ) -> tuple[str, float]:
        response = await self._generate_classification_response(image, usage_recorder)
        return parse_classification_response(response.text)

    async def _classify_image_with_usage(
        self,
        image: Image.Image,
        usage_recorder: ClassificationUsageRecorder | None,
    ) -> tuple[str, float, list[ProviderUsageRecord]]:
        custom_classify = self.__dict__.get("classify_image")
        if custom_classify is not None:
            if usage_recorder is not None:
                usage_recorder()
            category, confidence = await custom_classify(image)
            return category, confidence, []
        response = await self._generate_classification_response(image, usage_recorder)
        usage_record = extract_provider_usage_record(
            response,
            route="smart_router_classify",
            model_name="gemini-2.0-flash",
        )
        usage_records = [usage_record] if usage_record is not None else []
        category, confidence = parse_classification_response(response.text)
        return category, confidence, usage_records

    def _attach_router_usage(
        self,
        result: Dict[str, Any],
        router_usage_records: list[ProviderUsageRecord],
    ) -> Dict[str, Any]:
        if router_usage_records:
            result["_router_usage"] = router_usage_records
        return result

    async def route_analysis(
        self,
        image: Image.Image,
        allergy_info: str = "None",
        iso_country_code: str = "US",
        locale: str | None = None,
        label_analysis_handler: Callable[[Image.Image, str, str, str | None], Awaitable[Dict[str, Any]]] | None = None,
        food_analysis_handler: Callable[[Image.Image, str, str, str | None], Awaitable[Dict[str, Any]]] | None = None,
        classification_usage_recorder: ClassificationUsageRecorder | None = None,
    ) -> Dict[str, Any]:
        """
        Classifies the image and executes the corresponding analysis method.
        """
        print(f"[SmartRouter] Identifying image type...")
        start_time = time.time()
        
        try:
            # 1. Classify
            category, confidence, router_usage_records = await self._classify_image_with_usage(
                image,
                classification_usage_recorder,
            )

            print(f"[SmartRouter] Result: {category} ({confidence:.2f}) - {time.time() - start_time:.2f}s")

            # 2. Route
            if category == "REAL_FOOD" or category == "MENU":
                print("[SmartRouter] Routing to -> Food Analysis")
                if food_analysis_handler is None:
                    result = await asyncio.to_thread(
                        self.analyst.analyze_food_json,
                        image,
                        allergy_info,
                        iso_country_code,
                    )
                else:
                    result = await food_analysis_handler(image, allergy_info, iso_country_code, locale)
                result["router_category"] = category
                return self._attach_router_usage(result, router_usage_records)

            elif category == "NUTRITION_LABEL":
                print("[SmartRouter] Routing to -> Label Analysis")
                if label_analysis_handler is None:
                    result = build_router_error_response(
                        RuntimeError("label_analysis_handler is required for NUTRITION_LABEL smart routing"),
                        locale=locale,
                    )
                    result["router_category"] = category
                    return self._attach_router_usage(result, router_usage_records)
                result = await label_analysis_handler(image, allergy_info, iso_country_code, locale)
                result["router_category"] = category
                return self._attach_router_usage(result, router_usage_records)

            elif category == "BARCODE":
                return self._attach_router_usage(
                    build_barcode_route_response(category, locale=locale),
                    router_usage_records,
                )

            else: # NOT_FOOD or Unknown
                return self._attach_router_usage(
                    build_not_food_response(category, locale=locale),
                    router_usage_records,
                )

        except HTTPException:
            raise
        except Exception as e:
            print(f"[SmartRouter] Error: {e}")
            traceback.print_exc()
            return build_router_error_response(e, locale=locale)
