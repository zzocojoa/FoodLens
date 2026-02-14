import json
import os
import traceback
from typing import Tuple

from dotenv import load_dotenv
from PIL import Image

from backend.modules.analyst_runtime.food_analyst import FoodAnalyst
from backend.modules.barcode.service import BarcodeService
from backend.modules.analyst_runtime.router import SmartRouter


def load_environment() -> None:
    dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    dotenv_path = os.path.abspath(dotenv_path)
    if os.path.exists(dotenv_path):
        load_dotenv(dotenv_path)
        print(f"[Startup] Loaded .env from {dotenv_path}")
    else:
        print(f"[Startup] Warning: .env not found at {dotenv_path}. Using environment variables.")


def log_environment_debug() -> None:
    print("--- [Server Debug Environment] ---")
    print(f"PORT: {os.getenv('PORT', '8000')}")
    print(f"GEMINI_MODEL_NAME: {os.getenv('GEMINI_MODEL_NAME', 'Not set')}")
    print(f"KOREAN_FDA_API_KEY: {'[SET]' if os.getenv('KOREAN_FDA_API_KEY') else '[MISSING]'}")

    sa_json = os.getenv("GCP_SERVICE_ACCOUNT_JSON", "")
    print(f"GCP_SERVICE_ACCOUNT_JSON Raw Length: {len(sa_json)}")
    if sa_json:
        try:
            if sa_json.strip().startswith("{") and sa_json.strip().endswith("}"):
                parsed_sa = json.loads(sa_json)
                print(
                    f"[Startup] ✓ GCP_SERVICE_ACCOUNT_JSON parsed successfully. Project: {parsed_sa.get('project_id')}"
                )
            else:
                print("[Startup] ⚠️ WARNING: GCP_SERVICE_ACCOUNT_JSON is incomplete or improperly formatted.")
                print(f"[Startup] Text starts with: {repr(sa_json[:30])}")
                print(f"[Startup] Text ends with: {repr(sa_json[-30:])}")
                if sa_json.strip().startswith("{") and not sa_json.strip().endswith("}"):
                    print("[Startup] 🛑 ERROR: JSON is truncated!")
        except Exception as error:
            print(f"[Startup] ✗ Error parsing GCP_SERVICE_ACCOUNT_JSON: {error}")
            print(f"[Startup] Raw content sample: {repr(sa_json[:100])}...")


def initialize_services() -> Tuple[FoodAnalyst, BarcodeService, SmartRouter]:
    try:
        print("[Startup] Initializing FoodAnalyst...")
        analyst = FoodAnalyst()
        print("[Startup] ✓ FoodAnalyst initialized.")
        barcode_service = BarcodeService()
        print("[Startup] ✓ BarcodeService initialized.")
        smart_router = SmartRouter(analyst)
        print("[Startup] ✓ SmartRouter initialized.")
        return analyst, barcode_service, smart_router
    except Exception as error:
        print(f"[Startup] ✗ FAILED to initialize services: {error}")
        traceback.print_exc()
        raise


def decode_upload_to_image(contents: bytes) -> Image.Image:
    from io import BytesIO

    return Image.open(BytesIO(contents))
