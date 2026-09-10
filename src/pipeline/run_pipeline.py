"""
Pipeline Orchestrator: Chains all 6 stages sequentially.

Stages:
1. Frame Extraction + 4K→1080p Downscale + GPS Parse
2. DUSt3R Pose Estimation (preprocess.py)
3. SAM2 Instance Segmentation (seg_all_instances.py)
4. 3rD Lens Gaussian Splatting Training (train.py)
5. Multi-Format Export (PLY, OBJ, GLB, LAS, GeoTIFF)
6. GPS Geo-registration (integrated into Stage 5)

Key design decisions:
- Stages run sequentially to stay within 24GB VRAM budget
- torch.cuda.empty_cache() called between GPU-heavy stages
- Progress callbacks enable real-time WebSocket updates to the frontend
"""

import os
import sys
import json
import time
import gc
import logging
import importlib.util
from typing import Optional, Callable, Dict, Any, List

# Add project root and all submodule directories to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for _p in [
    PROJECT_ROOT,
    os.path.join(PROJECT_ROOT, "DroneSplat"),
    os.path.join(PROJECT_ROOT, "DroneSplat", "submodules", "dust3r"),
    os.path.join(PROJECT_ROOT, "DroneSplat", "submodules", "dust3r", "croco"),
    os.path.join(PROJECT_ROOT, "DroneSplat", "submodules", "croco"),
]:
    if os.path.exists(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from pipeline.config import (
    DRONESPLAT_ROOT,
    DATA_DIR,
    OUTPUT_DIR,
    EXPORT_DIR,
    TARGET_RESOLUTION,
    FRAME_EXTRACT_FPS,
    MAX_FRAMES,
    GS_TRAIN_ITERATIONS,
    GS_TEST_ITERATIONS,
    GS_SAVE_ITERATIONS,
    DUST3R_CHECKPOINT,
    SAM2_CHECKPOINT,
    SAM2_CONFIG,
    DUST3R_IMAGE_SIZE,
    DUST3R_SCENE_GRAPH,
)

logger = logging.getLogger(__name__)

# Type alias for the progress callback
ProgressCallback = Optional[Callable[[str, int, str], None]]


def _normalize_gps_metadata(gps_data: Any) -> List[Dict[str, Any]]:
    """Normalize supported GPS JSON wrappers and field aliases."""
    if isinstance(gps_data, dict):
        gps_data = gps_data.get("gps_data", gps_data.get("records", []))
    if not isinstance(gps_data, list):
        return []

    normalized = []
    for index, item in enumerate(gps_data):
        if not isinstance(item, dict):
            continue
        try:
            latitude = item["latitude"] if "latitude" in item else item["lat"]
            longitude = item["longitude"] if "longitude" in item else item["lon"]
            altitude = item.get("altitude", item.get("alt", 0.0))
            record = dict(item)
            record["latitude"] = float(latitude)
            record["longitude"] = float(longitude)
            record["altitude"] = float(altitude)
            record.setdefault("frame_index", index)
            normalized.append(record)
        except (KeyError, TypeError, ValueError):
            continue
    return normalized


def _clear_gpu_memory():
    """Clear GPU VRAM between stages to prevent OOM on 24GB cards."""
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            # Log current VRAM usage
            allocated = torch.cuda.memory_allocated() / (1024**3)
            reserved = torch.cuda.memory_reserved() / (1024**3)
            logger.info(f"GPU Memory — Allocated: {allocated:.2f} GB, Reserved: {reserved:.2f} GB")
    except ImportError:
        pass


def _run_stage2_dust3r(scene_dir: str, progress_callback: ProgressCallback = None):
    """
    Stage 2: DUSt3R pose estimation.
    Wraps DroneSplat/preprocess.py to run programmatically.
    """
    if progress_callback:
        progress_callback("dust3r", 0, "Starting DUSt3R pose estimation...")

    # Import DUSt3R preprocessing
    from preprocess import (
        get_args_parser,
        load_image_list,
        storePly,
        AsymmetricCroCo3DStereo,
        load_images,
        make_pairs,
        inference,
        global_aligner,
        GlobalAlignerMode,
        compute_global_alignment,
        to_numpy,
        save_colmap_cameras,
        save_colmap_images,
    )
    import torch
    import numpy as np

    img_folder_path = os.path.join(scene_dir, "images")
    output_colmap_path = os.path.join(scene_dir, "sparse", "0")
    os.makedirs(output_colmap_path, exist_ok=True)

    if progress_callback:
        progress_callback("dust3r", 10, "Loading DUSt3R model...")

    # Load model
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if not os.path.isfile(DUST3R_CHECKPOINT):
        raise FileNotFoundError(
            "DUSt3R checkpoint not found at "
            f"{DUST3R_CHECKPOINT}. Download "
            "DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth into "
            f"{os.path.dirname(DUST3R_CHECKPOINT)} before running Stage 2."
        )
    model = AsymmetricCroCo3DStereo.from_pretrained(DUST3R_CHECKPOINT).to(device)

    # Load images
    train_img_list = load_image_list(os.path.join(scene_dir, "train_list.txt"))
    test_img_list = load_image_list(os.path.join(scene_dir, "test_list.txt"))
    img_list = sorted(os.listdir(img_folder_path))
    images, ori_size = load_images(img_folder_path, size=DUST3R_IMAGE_SIZE)

    if progress_callback:
        progress_callback("dust3r", 20, f"Processing {len(images)} images...")

    # Run DUSt3R inference
    pairs = make_pairs(
        images,
        scene_graph=DUST3R_SCENE_GRAPH,
        prefilter=None,
        symmetrize=True,
    )
    logger.info(
        "DUSt3R scene graph: %s (%d directed pairs, %d images)",
        DUST3R_SCENE_GRAPH,
        len(pairs),
        len(images),
    )
    output = inference(pairs, model, device, batch_size=4)

    # Inference has finished; release the DUSt3R network before alignment.
    # The alignment scene retains its own prediction tensors and needs this VRAM.
    del model
    gc.collect()
    _clear_gpu_memory()

    if progress_callback:
        progress_callback("dust3r", 50, "Running global alignment...")

    # Global alignment
    scene = global_aligner(output, device=device, mode=GlobalAlignerMode.PointCloudOptimizer)
    loss = compute_global_alignment(
        scene=scene, init="mst", niter=500, schedule="linear", lr=0.01, focal_avg=False
    )
    scene = scene.clean_pointcloud()

    if progress_callback:
        progress_callback("dust3r", 75, "Saving COLMAP-format output...")

    # Extract results
    imgs = to_numpy(scene.imgs)
    focals = scene.get_focals()
    poses = to_numpy(scene.get_im_poses())
    pts3d = to_numpy(scene.get_pts3d())
    min_conf_thr = np.exp(1.0)
    scene.min_conf_thr = float(scene.conf_trf(torch.tensor(min_conf_thr)))
    confidence_masks = to_numpy(scene.get_masks())
    intrinsics = to_numpy(scene.get_intrinsics())
    confidence_map = [conf.detach().cpu().numpy() for conf in scene.im_conf]
    confidence_map = np.array(confidence_map)

    # Save train points
    train_img_indices = [img_list.index(img) for img in train_img_list if img in img_list]
    pts_4_3dgs_train = np.concatenate([pts3d[i][confidence_masks[i]] for i in train_img_indices])
    color_4_3dgs_train = np.concatenate([imgs[i][confidence_masks[i]] for i in train_img_indices])
    conf_train = np.concatenate([confidence_map[i][confidence_masks[i]] for i in train_img_indices])
    storePly(
        os.path.join(output_colmap_path, "points3D.ply"),
        pts_4_3dgs_train,
        (color_4_3dgs_train * 255.0).astype(np.uint8),
        conf_train.astype(np.uint8),
    )

    # Save COLMAP camera files
    save_colmap_cameras(ori_size, intrinsics, os.path.join(output_colmap_path, "cameras.txt"))
    save_colmap_images(poses, os.path.join(output_colmap_path, "images.txt"), img_list)

    # Save confidence maps
    np.save(os.path.join(output_colmap_path, "confidence_map_train.npy"), conf_train)
    np.save(os.path.join(output_colmap_path, "focal.npy"), focals.detach().cpu().numpy())

    # Cleanup DUSt3R tensors before the next GPU-heavy stage.
    del scene, output
    gc.collect()
    _clear_gpu_memory()

    if progress_callback:
        progress_callback("dust3r", 100, f"DUSt3R complete: {len(pts_4_3dgs_train)} points")


def _run_stage3_sam2(scene_dir: str, progress_callback: ProgressCallback = None):
    """
    Stage 3: SAM2 instance segmentation for dynamic object masking.
    Wraps DroneSplat/seg_all_instances.py.
    """
    if progress_callback:
        progress_callback("sam2", 0, "Starting SAM2 segmentation...")

    from seg_all_instances import (
        setup_gpu_acceleration,
        load_sam2_model,
        process_image,
        save_label_maps_as_json,
    )
    import glob

    setup_gpu_acceleration()

    if progress_callback:
        progress_callback("sam2", 10, "Loading SAM2 model...")

    mask_generator = load_sam2_model(SAM2_CONFIG, SAM2_CHECKPOINT)

    images_dir = os.path.join(scene_dir, "images")
    output_dir = os.path.join(scene_dir, "masks")
    os.makedirs(output_dir, exist_ok=True)

    image_extensions = ('.JPG', '.jpg', '.png', '.jpeg')
    image_paths = sorted([
        os.path.join(images_dir, f)
        for f in os.listdir(images_dir)
        if f.lower().endswith(image_extensions)
    ])

    if progress_callback:
        progress_callback("sam2", 20, f"Segmenting {len(image_paths)} images...")

    all_label_maps = {}
    for i, image_path in enumerate(image_paths):
        img_name, label_map = process_image(image_path, mask_generator, output_dir)
        if img_name and label_map is not None:
            all_label_maps[img_name] = label_map

        if progress_callback:
            pct = 20 + int(70 * (i + 1) / len(image_paths))
            progress_callback("sam2", pct, f"Segmented {i + 1}/{len(image_paths)}")

    # Save label maps
    if all_label_maps:
        save_label_maps_as_json(all_label_maps, os.path.join(output_dir, "masks.json"))

    # Cleanup
    del mask_generator
    _clear_gpu_memory()

    if progress_callback:
        progress_callback("sam2", 100, f"SAM2 complete: {len(all_label_maps)} masks generated")


def _run_stage4_train(
    scene_dir: str,
    scene_name: str,
    iterations: int = GS_TRAIN_ITERATIONS,
    progress_callback: ProgressCallback = None,
) -> str:
    """
    Stage 4: DroneSplat 3DGS training.
    Wraps DroneSplat/train.py.

    Returns:
        Path to the output point_cloud.ply
    """
    if progress_callback:
        progress_callback("train", 0, "Starting 3DGS training...")

    import torch
    from argparse import Namespace

    # Clear VRAM before training
    _clear_gpu_memory()

    train_path = os.path.join(DRONESPLAT_ROOT, "train.py")
    train_spec = importlib.util.spec_from_file_location("dronesplat_train", train_path)
    if train_spec is None or train_spec.loader is None:
        raise ImportError(f"Unable to load DroneSplat trainer from {train_path}")
    train_module = importlib.util.module_from_spec(train_spec)
    train_spec.loader.exec_module(train_module)
    training = train_module.training
    from arguments import ModelParams, PipelineParams, OptimizationParams
    from argparse import ArgumentParser

    model_path = os.path.join(OUTPUT_DIR, scene_name)
    os.makedirs(model_path, exist_ok=True)

    # Build args as DroneSplat expects
    parser = ArgumentParser()
    lp = ModelParams(parser)
    op = OptimizationParams(parser)
    pp = PipelineParams(parser)

    test_iterations = sorted({
        *(iteration for iteration in GS_TEST_ITERATIONS if iteration < iterations),
        iterations,
    })
    save_iterations = sorted({
        *(iteration for iteration in GS_SAVE_ITERATIONS if iteration < iterations),
        iterations,
    })

    # Construct argv-style args
    argv = [
        "-s", scene_dir,
        "-m", model_path,
        "--scene", scene_name,
        "--iter", str(iterations),
        "--use_masks",
        "--schedule_densify_grad_threshold",
        "--test_iterations", *[str(t) for t in test_iterations],
        "--save_iterations", *[str(s) for s in save_iterations],
    ]

    parser.add_argument('--ip', type=str, default="127.0.0.1")
    parser.add_argument('--port', type=int, default=6009)
    parser.add_argument('--debug_from', type=int, default=-1)
    parser.add_argument('--detect_anomaly', action='store_true', default=False)
    parser.add_argument("--test_iterations", nargs="+", type=int, default=test_iterations)
    parser.add_argument("--save_iterations", nargs="+", type=int, default=save_iterations)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--checkpoint_iterations", nargs="+", type=int, default=[])
    parser.add_argument("--start_checkpoint", type=str, default=None)
    parser.add_argument("--scene", type=str, default=None)
    parser.add_argument("--get_video", action="store_true")
    parser.add_argument("--preset_instance_threshold", type=float, default=0.4)
    parser.add_argument("--threshold_local", type=float, default=0.4)
    parser.add_argument("--use_masks", action="store_true")
    parser.add_argument("--mask_start_iter", type=int, default=500)
    parser.add_argument("--sam2_ckpt", type=str, default=SAM2_CHECKPOINT)
    parser.add_argument("--sam2_cfg", type=str, default=SAM2_CONFIG)
    parser.add_argument("--schedule_densify_grad_threshold", action="store_true")

    args = parser.parse_args(argv)

    if progress_callback:
        progress_callback("train", 5, f"Training {iterations} iterations...")

    # Run training
    torch.autograd.set_detect_anomaly(False)
    training(
        lp.extract(args),
        op.extract(args),
        pp.extract(args),
        args.test_iterations,
        args.save_iterations,
        args.checkpoint_iterations,
        args.start_checkpoint,
        args.debug_from,
        args,
        progress_callback=progress_callback,
    )

    # Find the output PLY
    output_ply = os.path.join(
        model_path,
        "point_cloud",
        f"iteration_{iterations}",
        "point_cloud.ply",
    )

    if not os.path.exists(output_ply):
        raise FileNotFoundError(f"Training output not found at {output_ply}")

    _clear_gpu_memory()

    if progress_callback:
        ply_size = os.path.getsize(output_ply) / (1024 * 1024)
        progress_callback("train", 100, f"Training complete: {ply_size:.1f} MB point cloud")

    return output_ply


def run_pipeline(
    video_path: str,
    scene_name: str,
    fps: float = FRAME_EXTRACT_FPS,
    max_frames: Optional[int] = MAX_FRAMES,
    iterations: int = GS_TRAIN_ITERATIONS,
    skip_extract: bool = False,
    progress_callback: ProgressCallback = None,
) -> Dict[str, Any]:
    """
    Run the complete 3rD Lens pipeline: Video → 5-format 3D models.

    Args:
        video_path: Path to the drone video file.
        scene_name: Unique scene/job identifier.
        fps: Frame extraction rate (default: 1 FPS).
        iterations: 3DGS training iterations (default: 5000).
        skip_extract: If True, skip Stage 1 (use pre-extracted frames).
        progress_callback: Callback(stage, progress_pct, message) for real-time updates.

    Returns:
        Dict with:
        - scene_dir: Path to the scene data
        - output_ply: Path to the trained Gaussian PLY
        - exports: Dict of format → file path
        - timings: Dict of stage → elapsed seconds
        - total_time: Total pipeline time in seconds
    """
    timings = {}
    total_start = time.time()
    scene_dir = os.path.join(DATA_DIR, scene_name)
    gps_data = None

    # ── Stage 1: Frame Extraction ────────────────────────────────────────────
    if not skip_extract:
        stage_start = time.time()
        from pipeline.stage1_extract import run_stage1

        result = run_stage1(
            video_path=video_path,
            scene_name=scene_name,
            fps=fps,
            max_frames=max_frames,
            target_resolution=TARGET_RESOLUTION,
            progress_callback=progress_callback,
        )
        scene_dir = result["scene_dir"]
        gps_data = _normalize_gps_metadata(result.get("gps_data"))
        timings["stage1_extract"] = time.time() - stage_start
        logger.info(f"Stage 1 complete in {timings['stage1_extract']:.1f}s")
    else:
        # Load existing GPS data if available
        gps_path = os.path.join(scene_dir, "gps_metadata.json")
        if os.path.exists(gps_path):
            with open(gps_path) as f:
                gps_data = _normalize_gps_metadata(json.load(f))

    # ── Stage 2: DUSt3R Pose Estimation ──────────────────────────────────────
    stage_start = time.time()

    # Change CWD to DroneSplat root for correct relative imports
    original_cwd = os.getcwd()
    os.chdir(DRONESPLAT_ROOT)

    try:
        _run_stage2_dust3r(scene_dir, progress_callback)
    finally:
        os.chdir(original_cwd)

    timings["stage2_dust3r"] = time.time() - stage_start
    logger.info(f"Stage 2 complete in {timings['stage2_dust3r']:.1f}s")

    # ── Stage 3: SAM2 Segmentation ───────────────────────────────────────────
    stage_start = time.time()

    os.chdir(DRONESPLAT_ROOT)
    try:
        _run_stage3_sam2(scene_dir, progress_callback)
    finally:
        os.chdir(original_cwd)

    timings["stage3_sam2"] = time.time() - stage_start
    logger.info(f"Stage 3 complete in {timings['stage3_sam2']:.1f}s")

    # ── Stage 4: DroneSplat 3DGS Training ────────────────────────────────────
    stage_start = time.time()

    os.chdir(DRONESPLAT_ROOT)
    try:
        output_ply = _run_stage4_train(
            scene_dir, scene_name, iterations, progress_callback
        )
    finally:
        os.chdir(original_cwd)

    timings["stage4_train"] = time.time() - stage_start
    logger.info(f"Stage 4 complete in {timings['stage4_train']:.1f}s")

    # ── Appended metric scale calibration ───────────────────────────────────
    stage_start = time.time()
    scaled_output_ply = output_ply
    scale_info = {
        "scale_factor": 1.0,
        "source": "scaling_unavailable",
        "units": "scene_units",
        "gps_entries": len(gps_data or []),
    }
    try:
        from pipeline.stage6_scale import calibrate_metric_scale

        scaled_output_ply, scale_info = calibrate_metric_scale(
            gaussian_ply_path=output_ply,
            scene_dir=scene_dir,
            gps_metadata=gps_data,
            progress_callback=progress_callback,
        )
    except Exception:
        logger.exception("Metric scale calibration failed; exporting the raw model")
        if progress_callback:
            progress_callback("scale", 100, "Scaling unavailable; exporting raw model")
    timings["stage6_scale"] = time.time() - stage_start
    logger.info("Metric scale calibration complete: %s", scale_info)

    # ── Stage 5: Multi-Format Export ─────────────────────────────────────────
    stage_start = time.time()
    from pipeline.stage5_export import run_stage5

    export_dir = os.path.join(EXPORT_DIR, scene_name)
    exports = run_stage5(
        gaussian_ply_path=scaled_output_ply,
        output_dir=export_dir,
        gps_metadata=gps_data,
        progress_callback=progress_callback,
    )
    timings["stage5_export"] = time.time() - stage_start
    logger.info(f"Stage 5 complete in {timings['stage5_export']:.1f}s")

    # ── Done ─────────────────────────────────────────────────────────────────
    total_time = time.time() - total_start

    if progress_callback:
        progress_callback("done", 100, f"Pipeline complete in {total_time:.1f}s")

    result = {
        "scene_dir": scene_dir,
        "output_ply": scaled_output_ply,
        "raw_output_ply": output_ply,
        "scale": scale_info,
        "exports": exports,
        "timings": timings,
        "total_time": total_time,
    }

    logger.info(f"Total pipeline time: {total_time:.1f}s")
    for stage, elapsed in timings.items():
        logger.info(f"  {stage}: {elapsed:.1f}s")

    return result


if __name__ == "__main__":
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(description="Run the complete 3rD Lens pipeline")
    parser.add_argument("--video", type=str, help="Path to drone video file")
    parser.add_argument("--scene", type=str, required=True, help="Scene/job name")
    parser.add_argument("--fps", type=float, default=FRAME_EXTRACT_FPS)
    parser.add_argument("--max-frames", type=int, default=MAX_FRAMES,
                        help="Maximum number of frames to extract")
    parser.add_argument("--iter", type=int, default=GS_TRAIN_ITERATIONS)
    parser.add_argument("--skip-extract", action="store_true",
                        help="Skip frame extraction (use existing data)")

    args = parser.parse_args()

    if not args.skip_extract and not args.video:
        parser.error("--video is required unless --skip-extract is used")

    def print_progress(stage, pct, msg):
        print(f"[{stage:15s}] {pct:3d}% | {msg}")

    result = run_pipeline(
        video_path=args.video or "",
        scene_name=args.scene,
        fps=args.fps,
        max_frames=args.max_frames,
        iterations=args.iter,
        skip_extract=args.skip_extract,
        progress_callback=print_progress,
    )

    print("\n" + "=" * 60)
    print("PIPELINE COMPLETE")
    print("=" * 60)
    print(f"Total time: {result['total_time']:.1f}s")
    print(f"\nExported files:")
    for fmt, path in result["exports"].items():
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f"  {fmt:8s}: {path} ({size_mb:.1f} MB)")
