import os
from PIL import Image

def slice_emoticons(image_path, output_dir):
    """
    Slices a sprite sheet into individual images based on alpha channel connectivity.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    try:
        img = Image.open(image_path).convert("RGBA")
    except Exception as e:
        print(f"Error opening image: {e}")
        return

    # Create a mask of non-transparent pixels
    width, height = img.size
    visited = set()
    emoticon_count = 0
    
    print(f"Processing image: {width}x{height}")

    for y in range(height):
        for x in range(width):
            if (x, y) in visited:
                continue
            
            r, g, b, a = img.getpixel((x, y))
            
            # Smart background detection:
            # If (0,0) is used as background color reference
            bg_r, bg_g, bg_b, bg_a = img.getpixel((0, 0))
            is_background = False
            
            if a == 0:
                is_background = True
            elif abs(r - bg_r) < 20 and abs(g - bg_g) < 20 and abs(b - bg_b) < 20: 
                # If pixel is close to background color (within tolerance)
                is_background = True

            if not is_background: # Found a non-background pixel
                # Start of a new emoticon, perform flood fill/BFS to find the whole component
                queue = [(x, y)]
                visited.add((x, y))
                min_x, max_x = x, x
                min_y, max_y = y, y
                
                component_pixels = []

                while queue:
                    curr_x, curr_y = queue.pop(0)
                    component_pixels.append((curr_x, curr_y))
                    
                    min_x = min(min_x, curr_x)
                    max_x = max(max_x, curr_x)
                    min_y = min(min_y, curr_y)
                    max_y = max(max_y, curr_y)

                    # Check 4 neighbors
                    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                        nx, ny = curr_x + dx, curr_y + dy
                        
                        if 0 <= nx < width and 0 <= ny < height:
                            if (nx, ny) not in visited:
                                nr, ng, nb, na = img.getpixel((nx, ny))
                                
                                is_neighbor_bg = False
                                if na == 0:
                                    is_neighbor_bg = True
                                elif abs(nr - bg_r) < 20 and abs(ng - bg_g) < 20 and abs(nb - bg_b) < 20:
                                    is_neighbor_bg = True
                                
                                if not is_neighbor_bg:
                                    visited.add((nx, ny))
                                    queue.append((nx, ny))

                # Crop and save
                # Add some padding
                pad = 2
                crop_box = (
                    max(0, min_x - pad),
                    max(0, min_y - pad),
                    min(width, max_x + 1 + pad),
                    min(height, max_y + 1 + pad)
                )
                
                # Check for very small noise
                if (crop_box[2] - crop_box[0]) < 10 or (crop_box[3] - crop_box[1]) < 10:
                    continue

                cropped_img = img.crop(crop_box)
                
                emoticon_count += 1
                filename = f"emo_{emoticon_count:02d}.png"
                save_path = os.path.join(output_dir, filename)
                cropped_img.save(save_path)
                print(f"Saved {filename} ({crop_box})")

    print(f"Done! {emoticon_count} emoticons sliced.")

if __name__ == "__main__":
    base_dir = r"d:\AntiGravity AI File\blog"
    sprite_path = os.path.join(base_dir, "assets", "emoticons", "original_sprite.png")
    output_path = os.path.join(base_dir, "assets", "emoticons")
    
    print(f"Sprite Path: {sprite_path}")
    slice_emoticons(sprite_path, output_path)
