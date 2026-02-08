from PIL import Image

# Open the splash image
img = Image.open("/Users/beatlefeed/Documents/FoodLens-project/스플레시.png")
img = img.convert("RGB")

# Get the edge color (top-left corner pixel)
edge_color = img.getpixel((0, 0))

# Convert to hex
hex_color = "#{:02x}{:02x}{:02x}".format(*edge_color)
print(f"Image size: {img.size}")
print(f"Edge color (top-left): RGB{edge_color} -> {hex_color}")

# Also check a few other edge pixels for consistency
top_right = img.getpixel((img.width - 1, 0))
bottom_left = img.getpixel((0, img.height - 1))
bottom_right = img.getpixel((img.width - 1, img.height - 1))

print(f"Top-right: RGB{top_right}")
print(f"Bottom-left: RGB{bottom_left}")
print(f"Bottom-right: RGB{bottom_right}")
