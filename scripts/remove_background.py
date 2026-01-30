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
        
        # Checkerboard patterns often use #FFFFFF and #CCCCCC (204, 204, 204)
        # or #FEFEFE and #EDEDED. 
        # We target pixels where R, G, B are high and very close to each other (grey/white)
        # AND strictly avoid touching the character colors.
        
        is_white = r > 240 and g > 240 and b > 240
        is_grey_grid = (190 < r < 215) and (190 < g < 215) and (190 < b < 215)
        
        # Refined grid check: colors are often exactly equal in checkerboards
        is_exact_grey = (r == g == b) and (180 < r < 230)
        
        if is_white or is_grey_grid or is_exact_grey:
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
