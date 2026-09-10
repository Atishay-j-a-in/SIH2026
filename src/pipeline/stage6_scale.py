"""Append-only metric scale calibration for reconstructed Gaussian scenes."""

import json
import math
import os
import re
import shutil
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from plyfile import PlyData, PlyElement


def _gps_to_local_meters(gps_metadata: List[Dict[str, Any]]) -> np.ndarray:
    """Convert GPS coordinates to a local metric frame."""
    if len(gps_metadata) < 2:
        return np.empty((0, 3), dtype=np.float64)
    try:
        from pyproj import Transformer

        first = gps_metadata[0]
        lat = float(first["latitude"])
        lon = float(first["longitude"])
        zone = int((lon + 180.0) / 6.0) + 1
        epsg = 32600 + zone if lat >= 0 else 32700 + zone
        transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
        origin_x, origin_y = transformer.transform(lon, lat)
        result = []
        for item in gps_metadata:
            x, y = transformer.transform(float(item["longitude"]), float(item["latitude"]))
            result.append((x - origin_x, y - origin_y, float(item.get("altitude", 0.0)) - float(first.get("altitude", 0.0))))
        return np.asarray(result, dtype=np.float64)
    except (ImportError, KeyError, TypeError, ValueError):
        return np.empty((0, 3), dtype=np.float64)


def _quaternion_to_rotation(q: np.ndarray) -> np.ndarray:
    w, x, y, z = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def _camera_centers(images_path: str) -> List[Tuple[str, np.ndarray]]:
    if not os.path.exists(images_path):
        return []
    centers = []
    with open(images_path, "r", encoding="utf-8") as file:
        for line in file:
            fields = line.strip().split()
            if len(fields) != 10 or not fields[0].isdigit():
                continue
            try:
                quaternion = np.asarray([float(value) for value in fields[1:5]])
                translation = np.asarray([float(value) for value in fields[5:8]])
                center = -_quaternion_to_rotation(quaternion).T @ translation
                centers.append((fields[9], center))
            except ValueError:
                continue
    return centers


def _frame_number(name: str) -> Optional[int]:
    match = re.search(r"(\d+)", os.path.basename(name))
    return int(match.group(1)) if match else None


def _estimate_from_camera_trajectory(images_path: str, gps_metadata: List[Dict[str, Any]]) -> Optional[float]:
    centers = _camera_centers(images_path)
    gps_points = _gps_to_local_meters(gps_metadata)
    if len(centers) < 2 or len(gps_points) < 2:
        return None
    gps_by_frame = {
        int(item["frame_index"]): index
        for index, item in enumerate(gps_metadata)
        if "frame_index" in item
    }
    zero_based_metadata = bool(gps_by_frame) and min(gps_by_frame) == 0
    pairs = []
    for filename, center in centers:
        number = _frame_number(filename)
        if number is None:
            continue
        frame_index = number - 1 if zero_based_metadata else number
        gps_index = gps_by_frame.get(frame_index)
        if gps_index is not None and gps_index < len(gps_points):
            pairs.append((center, gps_points[gps_index]))
    if len(pairs) < 2:
        return None
    scene = np.asarray([item[0] for item in pairs])
    metric = np.asarray([item[1] for item in pairs])
    scene_distances = np.linalg.norm(np.diff(scene, axis=0), axis=1)
    metric_distances = np.linalg.norm(np.diff(metric, axis=0), axis=1)
    valid = (scene_distances > 1e-6) & (metric_distances > 0.05)
    if not np.any(valid):
        return None
    return float(np.median(metric_distances[valid] / scene_distances[valid]))


def _estimate_from_extent(gaussian_ply_path: str, gps_metadata: List[Dict[str, Any]]) -> Optional[float]:
    gps_points = _gps_to_local_meters(gps_metadata)
    if len(gps_points) < 2:
        return None
    vertex = PlyData.read(gaussian_ply_path)["vertex"]
    scene = np.column_stack([np.asarray(vertex[axis]) for axis in ("x", "y", "z")])
    scene_span = np.linalg.norm(np.ptp(scene[:, :2], axis=0))
    gps_span = np.linalg.norm(np.ptp(gps_points[:, :2], axis=0))
    if scene_span <= 1e-6 or gps_span <= 0.05:
        return None
    return float(gps_span / scene_span)


def _scale_gaussian_ply(input_path: str, output_path: str, factor: float) -> None:
    plydata = PlyData.read(input_path)
    vertex = plydata["vertex"]
    data = vertex.data.copy()
    for axis in ("x", "y", "z"):
        if axis in data.dtype.names:
            data[axis] *= factor
    if factor > 0:
        for axis in ("scale_0", "scale_1", "scale_2"):
            if axis in data.dtype.names:
                data[axis] += math.log(factor)
    elements = [
        PlyElement.describe(data, "vertex") if element.name == "vertex" else element
        for element in plydata.elements
    ]
    PlyData(elements, text=plydata.text, byte_order=plydata.byte_order).write(output_path)


def calibrate_metric_scale(
    gaussian_ply_path: str,
    scene_dir: str,
    gps_metadata: Optional[List[Dict[str, Any]]] = None,
    progress_callback=None,
) -> Tuple[str, Dict[str, Any]]:
    """Create a metrically scaled copy of the trained Gaussian PLY."""
    gps_metadata = gps_metadata or []
    manual_factor = float(os.environ.get("DRONESPLAT_SCALE_FACTOR", "1.0"))
    images_path = os.path.join(scene_dir, "sparse", "0", "images.txt")
    factor = None if not gps_metadata else _estimate_from_camera_trajectory(images_path, gps_metadata)
    source = "gps_camera_trajectory"
    if factor is None and gps_metadata:
        factor = _estimate_from_extent(gaussian_ply_path, gps_metadata)
        source = "gps_scene_extent"
    if factor is None or not np.isfinite(factor) or factor <= 0:
        factor = manual_factor
        source = "manual_or_identity"

    output_path = os.path.join(os.path.dirname(gaussian_ply_path), "point_cloud_metric.ply")
    if progress_callback:
        progress_callback("scale", 20, f"Applying metric scale factor {factor:.6g} ({source})...")
    if abs(factor - 1.0) < 1e-12:
        shutil.copy2(gaussian_ply_path, output_path)
    else:
        _scale_gaussian_ply(gaussian_ply_path, output_path, factor)

    report = {"scale_factor": factor, "source": source, "units": "meters", "gps_entries": len(gps_metadata)}
    with open(os.path.join(os.path.dirname(output_path), "metric_scale.json"), "w", encoding="utf-8") as file:
        json.dump(report, file, indent=2)
    if progress_callback:
        progress_callback("scale", 100, "Metric-scaled Gaussian model ready")
    return output_path, report