
import os
import vertexai
from vertexai.generative_models import GenerativeModel
from dotenv import load_dotenv
import json
import tempfile

# Load env safely
load_dotenv()

project_id = os.getenv("GCP_PROJECT_ID")
location = os.getenv("GCP_LOCATION", "us-central1")
model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-1.5-pro-002")
service_account_json = os.getenv("GCP_SERVICE_ACCOUNT_JSON")

print(f"Project: {project_id}")
print(f"Location: {location}")
print(f"Model: {model_name}")

if service_account_json:
    # Create temp file for credentials
    with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix='.json') as temp_key:
        try:
            # Parse JSON to ensure it's valid, then write string
            key_dict = json.loads(service_account_json)
            json.dump(key_dict, temp_key)
            temp_key.flush()
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_key.name
            print(f"Credentials set from JSON string to {temp_key.name}")
        except Exception as e:
            print(f"Error parsing service account JSON: {e}")

try:
    vertexai.init(project=project_id, location=location)
    model = GenerativeModel(model_name)
    print(f"Successfully initialized model: {model_name}")
    
    # Try a simple generation to confirm
    response = model.generate_content("Hello, are you working?")
    print(f"Response: {response.text}")
    print("SUCCESS")

except Exception as e:
    print(f"ERROR: {e}")
