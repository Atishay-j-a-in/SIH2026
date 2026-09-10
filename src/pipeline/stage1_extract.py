"""
Stage 1: Video Ingestion, 4K→1080p Downscaling, Frame Extraction, and GPS Metadata Parsing.

This module handles:
1. Accepting a drone video file (MP4, MOV, AVI, MKV)
2. Downscaling 4K video to 1080p to fit within 24GB VRAM budget
3. Extracting frames at a configurable FPS (default: 1 FPS)
4. Parsing GPS/telemetry metadata from SRT subtitle files or EXIF data
5. Generating train/test split lists for 3rD Lens
"""

import os
import re
import json
import glob
import subprocess
import shutil
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any

from pipeline.config import (
    TARGET_RESOLUTION,
    FRAME_EXTRACT_FPS,
    MAX_FRAMES,
    TRAIN_TEST_SPLIT,
    DATA_DIR,
)


def get_video_resolution(video_path: str) -> Tuple[int, int]:
    """
    Get the resolution of a video file using ffprobe.

    Returns:
        Tuple of (width, height)
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0:s=x",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    width, height = result.stdout.strip().split("x")
    return int(width), int(height)


def get_video_duration(video_path: str) -> float:
    """Get the duration of a video in seconds."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def extract_frames(
    video_path: str,
    output_dir: str,
    fps: float = FRAME_EXTRACT_FPS,
    max_frames: Optional[int] = MAX_FRAMES,
    target_resolution: Optional[Tuple[int, int]] = None,
    progress_callback=None,
) -> int:
    """
    Extract frames from a video file at the specified FPS, optionally downscaling.

    Args:
        video_path: Path to the input video file.
        output_dir: Directory to save extracted frames.
        fps: Frames per second to extract.
        target_resolution: If provided, downscale to (width, height).
        progress_callback: Optional callback(stage, progress_pct, message).

    Returns:
        Number of frames extracted.
    """
    if max_frames is not None and max_frames < 1:
        raise ValueError("max_frames must be at least 1")

    os.makedirs(output_dir, exist_ok=True)
    for frame_path in glob.glob(os.path.join(output_dir, "frame_*.jpg")):
        os.remove(frame_path)

    # Get source video info
    src_width, src_height = get_video_resolution(video_path)
    duration = get_video_duration(video_path)

    if progress_callback:
        progress_callback(
            "frame_extract", 0,
            f"Video: {src_width}x{src_height}, {duration:.1f}s"
        )

    # Build ffmpeg filter chain
    vf_filters = [f"fps={fps}"]

    # Downscale if video is larger than target
    needs_downscale = False
    if target_resolution:
        tw, th = target_resolution
        if src_width > tw or src_height > th:
            # Scale to fit within target while maintaining aspect ratio
            vf_filters.append(
                f"scale={tw}:{th}:force_original_aspect_ratio=decrease"
            )
            needs_downscale = True

    vf_string = ",".join(vf_filters)

    if progress_callback:
        msg = f"Extracting at {fps} FPS"
        if needs_downscale:
            msg += f", downscaling to {target_resolution[0]}x{target_resolution[1]}"
        progress_callback("frame_extract", 10, msg)

    # Run ffmpeg
    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-vf", vf_string,
        "-qscale:v", "2",  # High quality JPEG
        "-start_number", "0",
    ]
    if max_frames is not None:
        cmd.extend(["-frames:v", str(max_frames)])
    cmd.extend([
        os.path.join(output_dir, "frame_%06d.jpg"),
        "-y",  # Overwrite existing
        "-loglevel", "warning",
    ])

    subprocess.run(cmd, check=True)

    # Count extracted frames
    frames = sorted(glob.glob(os.path.join(output_dir, "frame_*.jpg")))
    num_frames = len(frames)

    if progress_callback:
        progress_callback(
            "frame_extract", 90,
            f"Extracted {num_frames} frames"
        )

    return num_frames


def parse_srt_gps(srt_path: str) -> List[Dict[str, Any]]:
    """
    Parse GPS metadata from a DJI-style SRT subtitle file.

    DJI SRT format typically contains entries like:
        [latitude: 30.123456] [longitude: 120.654321] [altitude: 50.0]

    Returns:
        List of dicts with keys: timestamp, latitude, longitude, altitude
    """
    gps_data = []

    if not os.path.exists(srt_path):
        return gps_data

    with open(srt_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # DJI SRT patterns
    lat_pattern = re.compile(r"\[latitude[:\s]+([+-]?\d+\.?\d*)\]", re.IGNORECASE)
    lon_pattern = re.compile(r"\[longitude[:\s]+([+-]?\d+\.?\d*)\]", re.IGNORECASE)
    alt_pattern = re.compile(r"\[altitude[:\s]+([+-]?\d+\.?\d*)\]", re.IGNORECASE)
    # Alternative DJI format: GPS(lat, lon, alt)
    gps_pattern = re.compile(
        r"GPS\s*\(\s*([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)\s*\)"
    )

    # Try block-based parsing first (standard SRT format)
    blocks = content.strip().split("\n\n")
    for i, block in enumerate(blocks):
        lat_match = lat_pattern.search(block)
        lon_match = lon_pattern.search(block)
        alt_match = alt_pattern.search(block)
        gps_match = gps_pattern.search(block)

        if lat_match and lon_match:
            entry = {
                "frame_index": i,
                "latitude": float(lat_match.group(1)),
                "longitude": float(lon_match.group(1)),
                "altitude": float(alt_match.group(1)) if alt_match else 0.0,
            }
            gps_data.append(entry)
        elif gps_match:
            entry = {
                "frame_index": i,
                "latitude": float(gps_match.group(1)),
                "longitude": float(gps_match.group(2)),
                "altitude": float(gps_match.group(3)),
            }
            gps_data.append(entry)

    return gps_data


def try_parse_exif_gps(image_dir: str) -> List[Dict[str, Any]]:
    """
    Try to extract GPS from image EXIF data using exiftool or piexif.

    Returns:
        List of dicts with keys: filename, latitude, longitude, altitude
    """
    gps_data = []

    try:
        # Try exiftool first (most reliable for drone images)
        cmd = [
            "exiftool",
            "-json",
            "-GPSLatitude", "-GPSLongitude", "-GPSAltitude",
            "-n",  # Numeric output (decimal degrees)
            image_dir
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode == 0 and result.stdout.strip():
            exif_entries = json.loads(result.stdout)
            for entry in exif_entries:
                if "GPSLatitude" in entry and "GPSLongitude" in entry:
                    gps_data.append({
                        "filename": os.path.basename(entry.get("SourceFile", "")),
                        "latitude": float(entry["GPSLatitude"]),
                        "longitude": float(entry["GPSLongitude"]),
                        "altitude": float(entry.get("GPSAltitude", 0)),
                    })
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        pass

    # Fallback: try piexif
    if not gps_data:
        try:
            import piexif

            image_files = sorted(glob.glob(os.path.join(image_dir, "*.jpg")))
            for img_path in image_files:
                try:
                    exif_dict = piexif.load(img_path)
                    gps_info = exif_dict.get("GPS", {})
                    if piexif.GPSIFD.GPSLatitude in gps_info:
                        lat = _convert_gps_dms(
                            gps_info[piexif.GPSIFD.GPSLatitude],
                            gps_info.get(piexif.GPSIFD.GPSLatitudeRef, b"N")
                        )
                        lon = _convert_gps_dms(
                            gps_info[piexif.GPSIFD.GPSLongitude],
                            gps_info.get(piexif.GPSIFD.GPSLongitudeRef, b"E")
                        )
                        alt_tuple = gps_info.get(piexif.GPSIFD.GPSAltitude, (0, 1))
                        alt = alt_tuple[0] / alt_tuple[1] if isinstance(alt_tuple, tuple) else 0

                        gps_data.append({
                            "filename": os.path.basename(img_path),
                            "latitude": lat,
                            "longitude": lon,
                            "altitude": alt,
                        })
                except Exception:
                    continue
        except ImportError:
            pass

    return gps_data


def _convert_gps_dms(dms_tuple, ref) -> float:
    """Convert GPS DMS (degrees, minutes, seconds) to decimal degrees."""
    d = dms_tuple[0][0] / dms_tuple[0][1]
    m = dms_tuple[1][0] / dms_tuple[1][1]
    s = dms_tuple[2][0] / dms_tuple[2][1]
    decimal = d + m / 60.0 + s / 3600.0
    if ref in (b"S", b"W", "S", "W"):
        decimal = -decimal
    return decimal


def generate_train_test_split(
    image_dir: str,
    output_dir: str,
    train_ratio: float = TRAIN_TEST_SPLIT,
) -> Tuple[List[str], List[str]]:
    """
    Generate train_list.txt and test_list.txt for 3rD Lens.
    Every Nth frame goes to test set (ensures spatial distribution).

    Returns:
        (train_list, test_list) — lists of filenames
    """
    image_files = sorted([
        f for f in os.listdir(image_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ])

    if not image_files:
        raise ValueError(f"No images found in {image_dir}")

    # Calculate test interval (e.g., every 5th frame for 80/20 split)
    test_interval = max(1, int(1.0 / (1.0 - train_ratio)))

    train_list = []
    test_list = []
    for i, fname in enumerate(image_files):
        if (i + 1) % test_interval == 0:
            test_list.append(fname)
        else:
            train_list.append(fname)

    # Ensure at least 1 test image
    if not test_list and len(train_list) > 1:
        test_list.append(train_list.pop())

    # Write lists
    train_path = os.path.join(output_dir, "train_list.txt")
    test_path = os.path.join(output_dir, "test_list.txt")

    with open(train_path, "w") as f:
        f.write("\n".join(train_list) + "\n")
    with open(test_path, "w") as f:
        f.write("\n".join(test_list) + "\n")

    return train_list, test_list


def run_stage1(
    video_path: str,
    scene_name: str,
    fps: float = FRAME_EXTRACT_FPS,
    max_frames: Optional[int] = MAX_FRAMES,
    target_resolution: Tuple[int, int] = TARGET_RESOLUTION,
    progress_callback=None,
) -> dict:
    """
    Run Stage 1: Complete video ingestion pipeline.

    Args:
        video_path: Path to the drone video file.
        scene_name: Unique scene/job identifier.
        fps: Frames per second to extract.
        target_resolution: Max resolution (width, height) — downscales 4K.
        progress_callback: Optional callback(stage, progress_pct, message).

    Returns:
        Dict with keys:
        - scene_dir: Path to the prepared scene directory
        - image_dir: Path to extracted images
        - num_frames: Number of frames extracted
        - train_count: Number of training frames
        - test_count: Number of test frames
        - gps_data: List of GPS entries (may be empty)
    """
    if progress_callback:
        progress_callback("frame_extract", 0, "Starting Stage 1: Frame Extraction")

    # Create scene directory in DroneSplat's data format
    scene_dir = os.path.join(DATA_DIR, scene_name)
    image_dir = os.path.join(scene_dir, "images")
    os.makedirs(image_dir, exist_ok=True)

    # Step 1: Extract frames with optional downscaling
    num_frames = extract_frames(
        video_path=video_path,
        output_dir=image_dir,
        fps=fps,
        max_frames=max_frames,
        target_resolution=target_resolution,
        progress_callback=progress_callback,
    )

    if num_frames == 0:
        raise RuntimeError(f"No frames extracted from {video_path}")

    if progress_callback:
        progress_callback("frame_extract", 50, f"Extracted {num_frames} frames")

    # Step 2: Parse GPS metadata
    gps_data = []

    # Try SRT file (same name as video, .srt extension)
    video_stem = Path(video_path).stem
    video_parent = Path(video_path).parent
    srt_candidates = [
        video_parent / f"{video_stem}.srt",
        video_parent / f"{video_stem}.SRT",
    ]
    for srt_path in srt_candidates:
        if srt_path.exists():
            gps_data = parse_srt_gps(str(srt_path))
            break

    # Fallback: try EXIF from extracted frames
    if not gps_data:
        gps_data = try_parse_exif_gps(image_dir)

    # Save GPS metadata
    gps_path = os.path.join(scene_dir, "gps_metadata.json")
    with open(gps_path, "w") as f:
        json.dump(gps_data, f, indent=2)

    if progress_callback:
        gps_msg = f"Found {len(gps_data)} GPS entries" if gps_data else "No GPS data found"
        progress_callback("frame_extract", 75, gps_msg)

    # Step 3: Generate train/test split
    train_list, test_list = generate_train_test_split(
        image_dir=image_dir,
        output_dir=scene_dir,
        train_ratio=TRAIN_TEST_SPLIT,
    )

    if progress_callback:
        progress_callback(
            "frame_extract", 100,
            f"Done: {len(train_list)} train, {len(test_list)} test frames"
        )

    return {
        "scene_dir": scene_dir,
        "image_dir": image_dir,
        "num_frames": num_frames,
        "train_count": len(train_list),
        "test_count": len(test_list),
        "gps_data": gps_data,
        "gps_metadata_path": gps_path,
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Stage 1: Extract frames from drone video")
    parser.add_argument("--video", type=str, required=True, help="Path to drone video")
    parser.add_argument("--scene", type=str, required=True, help="Scene/job name")
    parser.add_argument("--fps", type=float, default=FRAME_EXTRACT_FPS, help="Extraction FPS")
    parser.add_argument("--max-frames", type=int, default=MAX_FRAMES,
                        help="Maximum number of frames to extract")
    parser.add_argument("--max-width", type=int, default=TARGET_RESOLUTION[0])
    parser.add_argument("--max-height", type=int, default=TARGET_RESOLUTION[1])

    args = parser.parse_args()

    def print_progress(stage, pct, msg):
        print(f"[{stage}] {pct:3d}% | {msg}")

    result = run_stage1(
        video_path=args.video,
        scene_name=args.scene,
        fps=args.fps,
        max_frames=args.max_frames,
        target_resolution=(args.max_width, args.max_height),
        progress_callback=print_progress,
    )

    print("\n=== Stage 1 Complete ===")
    for k, v in result.items():
        if k != "gps_data":
            print(f"  {k}: {v}")
    print(f"  gps_entries: {len(result['gps_data'])}")
