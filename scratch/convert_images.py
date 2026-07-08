import os
from PIL import Image

def convert_to_webp(source_path, target_path, quality=80):
    try:
        im = Image.open(source_path)
        im.save(target_path, "WEBP", quality=quality)
        src_size = os.path.getsize(source_path)
        dst_size = os.path.getsize(target_path)
        reduction = (src_size - dst_size) / src_size * 100
        print(f"Converted: {source_path} ({src_size/1024:.1f} KB) -> {target_path} ({dst_size/1024:.1f} KB) | Reduction: {reduction:.1f}%")
    except Exception as e:
        print(f"Error converting {source_path}: {e}")

def main():
    # Convert images in images/
    images_dir = "images"
    if os.path.exists(images_dir):
        for filename in os.listdir(images_dir):
            if filename.endswith(".png"):
                src = os.path.join(images_dir, filename)
                dst = os.path.join(images_dir, filename.replace(".png", ".webp"))
                convert_to_webp(src, dst, quality=82)

    # Convert root favicon.png
    if os.path.exists("favicon.png"):
        convert_to_webp("favicon.png", "favicon.webp", quality=85)
        # Also let's keep a compressed favicon.png version since some legacy browsers prefer it
        try:
            im = Image.open("favicon.png")
            im.save("favicon_compressed.png", "PNG", optimize=True)
            print("Compressed root favicon.png")
            os.replace("favicon_compressed.png", "favicon.png")
        except Exception as e:
            print(f"Error compressing favicon.png: {e}")

if __name__ == "__main__":
    main()
