#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Instance segmentation of images using SAM2 model and saving the results as label maps.
"""

# Standard library imports
import os
import json
import argparse
from typing import Dict, List, Any, Tuple

# Third-party imports
import cv2
import numpy as np
import torch
import matplotlib.pyplot as plt
from PIL import Image
from tqdm import tqdm

# Local module imports
from submodules.sam2.sam2.build_sam import build_sam2
from submodules.sam2.sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator


def setup_gpu_acceleration() -> None:
    """
    Configure GPU acceleration settings, including automatic mixed precision and TensorFloat32 support.
    """
    # For Ampere and above GPU architectures, enable TF32
    if torch.cuda.is_available() and torch.cuda.get_device_properties(0).major >= 8:
        # Enable TensorFloat32 to improve matrix multiplication performance
        # Reference: https://pytorch.org/docs/stable/notes/cuda.html#tensorfloat-32-tf32-on-ampere-devices
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True


def parse_arguments() -> argparse.Namespace:
    """
    Parse command line arguments.
    
    Returns:
        argparse.Namespace: Namespace containing all parameters
    """
    parser = argparse.ArgumentParser(description='Segment images using SAM2 model and save label maps.')
    parser.add_argument('--model_checkpoint', 
                        type=str, 
                        default="checkpoints/sam2_hiera_large.pt", 
                        help='Path to SAM2 model checkpoint')
    parser.add_argument('--model_cfg', 
                        type=str, 
                        default="configs/sam2/sam2_hiera_l.yaml", 
                        help='Path to SAM2 model configuration')
    parser.add_argument('--image_dir', 
                        type=str, 
                        default="data/Simingshan_2_colmap", 
                        help='Directory containing images to segment')
    return parser.parse_args()


def show_annotations(annotations: List[Dict[str, Any]], borders: bool = True) -> None:
    """
    Display masks with optional borders.
    
    Args:
        annotations: List of annotations containing segmentation masks
        borders: Whether to display borders, default is True
    """
    if not annotations:
        return
        
    sorted_annotations = sorted(annotations, key=(lambda x: x['area']), reverse=True)
    ax = plt.gca()
    ax.set_autoscale_on(False)

    # Create transparent background image
    mask_shape = sorted_annotations[0]['segmentation'].shape
    img = np.ones((mask_shape[0], mask_shape[1], 4))
    img[:, :, 3] = 0
    
    for annotation in sorted_annotations:
        mask = annotation['segmentation']
        # Generate random color for each mask
        color_mask = np.concatenate([np.random.random(3), [0.5]])
        img[mask] = color_mask 
        
        # Draw borders if needed
        if borders:
            contours, _ = cv2.findContours(mask.astype(np.uint8), 
                                          cv2.RETR_EXTERNAL, 
                                          cv2.CHAIN_APPROX_NONE)
            contours = [cv2.approxPolyDP(contour, epsilon=0.01, closed=True) 
                       for contour in contours]
            cv2.drawContours(img, contours, -1, (0, 0, 1, 0.4), thickness=1) 
            
    ax.imshow(img)


def is_fully_contained(mask_a: Dict[str, Any], mask_b: Dict[str, Any]) -> bool:
    """
    Check if mask_a is fully contained within mask_b.
    
    Args:
        mask_a: First mask
        mask_b: Second mask
        
    Returns:
        bool: True if mask_a is fully contained in mask_b
    """
    # Check if bounding box is contained
    bbox_a, bbox_b = mask_a['bbox'], mask_b['bbox']
    if not (bbox_a[0] >= bbox_b[0] and bbox_a[1] >= bbox_b[1] and
            bbox_a[0] + bbox_a[2] <= bbox_b[0] + bbox_b[2] and
            bbox_a[1] + bbox_a[3] <= bbox_b[1] + bbox_b[3]):
        return False
    
    # Check if segmentation mask is contained
    mask_a_pixels = mask_a['segmentation']
    mask_b_pixels = mask_b['segmentation']
    if np.all(mask_a_pixels[mask_a_pixels] == mask_b_pixels[mask_a_pixels]):
        return True
    
    return False


def merge_masks(masks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Merge masks by removing those fully contained within others.
    
    Args:
        masks: List of masks to merge
        
    Returns:
        List[Dict[str, Any]]: List of merged masks
    """
    merged_masks = []
    for i, mask_a in enumerate(masks):
        merged = False
        for j, mask_b in enumerate(masks):
            if i != j and is_fully_contained(mask_a, mask_b):
                merged = True
                break
        if not merged:
            merged_masks.append(mask_a)
    return merged_masks


def create_label_map(image_name: str, masks: List[Dict[str, Any]], 
                    image_shape: Tuple[int, int]) -> Dict[str, Any]:
    """
    Create a label map for a given image based on its masks.
    
    Args:
        image_name: Image name
        masks: List of masks for the image
        image_shape: Image shape (height, width)
        
    Returns:
        Dict[str, Any]: Dictionary containing image name and label map
    """
    # Sort masks by area in descending order
    sorted_masks = sorted(masks, key=lambda x: x['area'], reverse=True)
    label_map = np.zeros(image_shape[:2], dtype=np.uint8)
    
    # Assign unique label to each mask
    for idx, mask in enumerate(sorted_masks, start=1):
        segmentation = mask['segmentation'].astype(np.uint8)
        label_map[segmentation == 1] = idx
    
    data = {
        'image_name': image_name,
        'label_map': label_map.tolist()
    }
    
    return data


def save_label_maps_as_json(label_maps: Dict[str, Any], output_file_path: str) -> None:
    """
    Save all label maps to a single JSON file.
    
    Args:
        label_maps: Dictionary of label maps
        output_file_path: Output JSON file path
    """
    try:
        with open(output_file_path, 'w') as json_file:
            json.dump(label_maps, json_file)
        print(f"Successfully saved label maps to: {output_file_path}")
    except Exception as e:
        print(f"Error saving label maps: {e}")


def load_sam2_model(model_cfg: str, model_checkpoint: str) -> SAM2AutomaticMaskGenerator:
    """
    Load SAM2 model and create automatic mask generator.
    
    Args:
        model_cfg: Model configuration file path
        model_checkpoint: Model checkpoint path
        
    Returns:
        SAM2AutomaticMaskGenerator: Configured mask generator
    """
    try:
        # Load SAM2 model
        sam2_model = build_sam2(model_cfg, model_checkpoint, device='cuda', apply_postprocessing=False)
        
        # Create automatic mask generator
        mask_generator = SAM2AutomaticMaskGenerator(model=sam2_model)
        return mask_generator
    except Exception as e:
        print(f"Error loading SAM2 model: {e}")
        raise


def process_image(image_path: str, mask_generator: SAM2AutomaticMaskGenerator, 
                 output_dir: str) -> Tuple[str, np.ndarray]:
    """
    Process a single image and generate masks and label map.
    
    Args:
        image_path: Image file path
        mask_generator: SAM2 mask generator
        output_dir: Output directory
        
    Returns:
        Tuple[str, np.ndarray]: Image name and label map data
    """
    try:
        print(f"Processing image: {image_path}")
        # Open image and get dimensions
        image = Image.open(image_path)
        width, height = image.size
        # Convert image to NumPy array
        image_array = np.array(image.convert("RGB"))
        
        # Generate and merge masks
        with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
            masks = mask_generator.generate(image_array)
        merged_masks = merge_masks(masks)
        
        # Create visualization image
        fig = plt.figure(figsize=(width / 100, height / 100), dpi=100)
        ax = fig.add_subplot(111)
        plt.imshow(np.zeros((height, width, 4)))  # Create fully transparent background
        show_annotations(merged_masks)
        
        # Save mask visualization
        os.makedirs(output_dir, exist_ok=True)
        output_file_path = os.path.join(output_dir, os.path.basename(image_path).split('.')[0] + '.jpg')
        plt.axis('off')
        ax.set_position([0, 0, 1, 1])  # Ensure content fills entire figure
        plt.savefig(output_file_path, bbox_inches=None, pad_inches=0)
        plt.close()
        
        # Create label map
        img_name = os.path.basename(image_path)
        label_map_data = create_label_map(img_name, merged_masks, (height, width))
        
        return img_name, label_map_data['label_map']
    except Exception as e:
        print(f"Error processing image {image_path}: {e}")
        return None, None


def run_segmentation(image_dir: str, model_checkpoint: str, model_cfg: str, progress_callback=None) -> None:
    """
    Callable wrapper to process all images and save results programmatically.
    """
    try:
        # Load model
        mask_generator = load_sam2_model(model_cfg, model_checkpoint)
        
        # Prepare image paths
        images_dir = os.path.join(image_dir, "images")
        if not os.path.exists(images_dir):
            raise FileNotFoundError(f"Image directory does not exist: {images_dir}")
            
        image_extensions = ('.JPG', '.jpg', '.png', '.jpeg')
        image_paths = [
            os.path.join(images_dir, fname) 
            for fname in os.listdir(images_dir) 
            if fname.lower().endswith(image_extensions)
        ]
        
        if not image_paths:
            print(f"Warning: No image files found in {images_dir}")
            return
            
        # Output directory
        output_dir = os.path.join(image_dir, 'masks')
        os.makedirs(output_dir, exist_ok=True)
        
        # Process all images
        all_label_maps = {}
        for i, image_path in enumerate(tqdm(image_paths, desc="Processing images")):
            img_name, label_map = process_image(image_path, mask_generator, output_dir)
            if img_name and label_map is not None:
                all_label_maps[img_name] = label_map
            if progress_callback:
                progress_callback(i, len(image_paths))
                
        # Save all label maps
        if all_label_maps:
            output_json_path = os.path.join(output_dir, 'masks.json')
            save_label_maps_as_json(all_label_maps, output_json_path)
        else:
            print("Warning: No label maps were generated")
            
    except Exception as e:
        print(f"Error: {e}")

def main() -> None:
    """
    Main function for CLI execution.
    """
    args = parse_arguments()
    setup_gpu_acceleration()
    run_segmentation(args.image_dir, args.model_checkpoint, args.model_cfg)


if __name__ == "__main__":
    main()



