from vertexai.generative_models import HarmBlockThreshold, HarmCategory

DEFAULT_THRESHOLD = HarmBlockThreshold.BLOCK_ONLY_HIGH
DEFAULT_SAFETY_CATEGORIES = (
    HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    HarmCategory.HARM_CATEGORY_HARASSMENT,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
)


def build_default_safety_settings() -> dict:
    return {category: DEFAULT_THRESHOLD for category in DEFAULT_SAFETY_CATEGORIES}
