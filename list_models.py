import vertexai
from vertexai.generative_models import GenerativeModel
import os
from dotenv import load_dotenv
import tempfile

load_dotenv()

# Configure Vertex AI
project_id = os.getenv("GCP_PROJECT_ID")
location = os.getenv("GCP_LOCATION", "us-central1")
service_account_json = os.getenv("GCP_SERVICE_ACCOUNT_JSON")

if service_account_json:
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write(service_account_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = f.name

if not project_id:
    print("Error: GCP_PROJECT_ID not found in environment.")
    exit(1)

vertexai.init(project=project_id, location=location)

print(f"Vertex AI initialized for project: {project_id}")
print("Note: Vertex AI SDK does not have a simple 'list_models' client-side equivalent like the Google AI SDK.")
print("The configured model is ready to use.")
