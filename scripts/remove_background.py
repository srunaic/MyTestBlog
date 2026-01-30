import os
import glob
from PIL import Image, ImageOps

def remove_checkerboard(image_path):
    print(f"Processing: {image_path}")
    img = Image.open(image_path).convert("RGBA")
    datas = img.getdata()

    # Common checkerboard colors: White (255,255,255) and Grey (usually 204,204,204 or similar)
    # Some grids use transparent + grey, others use two solid colors.
    
    new_data = []
    for item in datas:
        # Check if the pixel is white or a specific grey scale
        # threshold for "white/grey" background removal
        r, g, b, a = item
        
        # Checkerboard patterns often use #FFFFFF (255,255,255) and #ECECEC (236,236,236)
        # We target pixels where R, G, B are very close to each other (grey/white)
        # and fall within the background color ranges detected.
        
        is_white = r > 245 and g > 245 and b > 245
        
        # Catch the light grey squares (~236)
        is_light_grey = (230 < r < 245) and (230 < g < 245) and (230 < b < 245)
        
        # Check if R, G, B are nearly equal (typical for grey-scale background grids)
        diff = max(r, g, b) - min(r, g, b)
        is_grayscale = diff <= 3
        
        # Final background check
        if is_white or (is_light_grey and is_grayscale):
            new_data.append((255, 255, 255, 0)) # Make fully transparent
        else:
            new_data.append(item)

    img.putdata(new_data)
    
    # Optional: Trim empty borders
    # bbox = img.getbbox()
    # if bbox:
    #     img = img.crop(bbox)
        
    img.save(image_path, "PNG")
    print(f"Done: {image_path}")

def main():
    target_dir = os.path.join("assets", "emoticons")
    if not os.path.exists(target_dir):
        print(f"Error: {target_dir} not found.")
        return
    
    files = glob.glob(os.path.join(target_dir, "*.png"))
    if not files:
        print("No PNG files found in assets/emoticons.")
        return
        
    for f in files:
        remove_checkerboard(f)

if __name__ == "__main__":
    main()
