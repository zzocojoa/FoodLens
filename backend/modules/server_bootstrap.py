import os
import traceback
from typing import Tuple

from dotenv import load_dotenv
from PIL import Image, ImageOps

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
    print(f"GCP_SERVICE_ACCOUNT_JSON: {'[SET]' if bool(sa_json) else '[MISSING]'}")


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

    image = Image.open(BytesIO(contents))

    # Normalize EXIF orientation so portrait/landscape captures are analyzed consistently.
    # Some mobile captures store rotation metadata instead of rotating raw pixels.
    try:
        normalized = ImageOps.exif_transpose(image)
    except Exception:
        normalized = image

    if normalized.mode not in ("RGB", "RGBA"):
        normalized = normalized.convert("RGB")

    return normalized
