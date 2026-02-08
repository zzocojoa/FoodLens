import os
from PIL import Image

# Configuration
SOURCE_IMAGE = "/Users/beatlefeed/Documents/FoodLens-project/Gemini_Generated_Image_tswfiptswfiptswf.png"
OUTPUT_DIR = "/Users/beatlefeed/Documents/FoodLens-project/FoodLens/assets/images/ios_icons"
SIZES = {
    "app_store_1024.png": (1024, 1024),
    "iphone_180.png": (180, 180),
    "ipad_pro_167.png": (167, 167),
    "settings_87.png": (87, 87)
}

def generate_icons():
    # Ensure output directory exists
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Created directory: {OUTPUT_DIR}")

    try:
        # Open source image
        with Image.open(SOURCE_IMAGE) as img:
            print(f"Opened source image: {SOURCE_IMAGE} ({img.size})")

            # Convert to RGB (remove alpha channel if present, as requested 'non-transparent')
            # If the source has transparency, we might want to composite it over white or keep it solid if it already is.
            # The prompt said "누끼 배경이 포함되지 않은" -> "Not including the removed background" -> ORIGINAL background.
            # Assuming the source image is fully opaque or we want it opaque.
            # iOS icons must be opaque.
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3]) # 3 is alpha channel
                img = background
            else:
                img = img.convert('RGB')

            for filename, size in SIZES.items():
                # Resize using LANCZOS for high quality
                resized_img = img.resize(size, Image.Resampling.LANCZOS)
                
                output_path = os.path.join(OUTPUT_DIR, filename)
                resized_img.save(output_path, "PNG")
                print(f"Generated: {output_path} ({size})")
                
    except Exception as e:
        print(f"Error generating icons: {e}")

if __name__ == "__main__":
    generate_icons()
