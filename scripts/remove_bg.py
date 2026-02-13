import os
import glob
from rembg import remove
from PIL import Image

INPUT_DIR = "FoodLens/assets/images/allergens"
PNG_GLOB = "*.png"


def process_image(path: str) -> None:
    print(f"Processing {path}...")
    try:
        img = Image.open(path).convert("RGBA")
        # u2net model will be downloaded on first run (~170MB)
        output = remove(img)
        output.save(path)
        print(f"Done: {path}")
    except Exception as error:
        print(f"Error processing {path}: {error}")


def list_png_files(input_dir: str) -> list[str]:
    return glob.glob(os.path.join(input_dir, PNG_GLOB))


def main() -> None:
    files = list_png_files(INPUT_DIR)
    print(f"Found {len(files)} images to process.")

    if len(files) == 0:
        print(f"No images found in {INPUT_DIR}")
        # Verify absolute path just in case
        abs_path = os.path.abspath(INPUT_DIR)
        print(f"Checked absolute path: {abs_path}")

    for file_path in files:
        process_image(file_path)


if __name__ == "__main__":
    main()
