import os
import glob
from rembg import remove
from PIL import Image

INPUT_DIR = "FoodLens/assets/images/allergens"

def process_image(path):
    print(f"Processing {path}...")
    try:
        img = Image.open(path).convert("RGBA")
        # u2net model will be downloaded on first run (~170MB)
        output = remove(img)
        output.save(path)
        print(f"Done: {path}")
    except Exception as e:
        print(f"Error processing {path}: {e}")

files = glob.glob(os.path.join(INPUT_DIR, "*.png"))
print(f"Found {len(files)} images to process.")

if len(files) == 0:
    print(f"No images found in {INPUT_DIR}")
    # Verify absolute path just in case
    abs_path = os.path.abspath(INPUT_DIR)
    print(f"Checked absolute path: {abs_path}")

for f in files:
    process_image(f)
