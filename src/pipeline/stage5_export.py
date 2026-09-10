"""
Stage 5: Multi-Format Export

Converts the trained 3rD Lens Gaussian point cloud into 5 output formats:
1. PLY  — Raw colored point cloud (direct copy from 3rD Lens output)
2. OBJ  — Poisson surface reconstruction mesh
3. GLB  — Binary glTF (converted from OBJ mesh)
4. LAS  — LiDAR point cloud format with RGB and optional CRS
5. GeoTIFF — Top-down orthomosaic projection
"""

import os
import json
import shutil
import numpy as np
from pathlib import Path
from typing import Optional, List, Dict, Any

import open3d as o3d
import trimesh
from plyfile import PlyData

from pipeline.config import (
    POISSON_DEPTH,
    POISSON_MIN_DENSITY,
    EXPORT_DIR,
)


def export_ply(input_ply_path: str, output_dir: str) -> str:
    """
    Export PLY — direct copy from 3rD Lens output.
    The 3rD Lens output PLY contains Gaussian splat data (xyz, SH, opacity, scale, rotation).
    We also export a simplified colored point cloud PLY for compatibility.
    """
    output_path = os.path.join(output_dir, "model.ply")

    # Read the Gaussian PLY and extract just xyz + color for a standard PLY
    try:
        plydata = PlyData.read(input_ply_path)
        vertex = plydata['vertex']

        # Extract positions
        x = np.array(vertex['x'])
        y = np.array(vertex['y'])
        z = np.array(vertex['z'])
        points = np.column_stack([x, y, z])

        # Try to extract colors from SH coefficients (f_dc_0, f_dc_1, f_dc_2)
        # These are spherical harmonic DC components, convert to RGB
        try:
            r = np.array(vertex['f_dc_0'])
            g = np.array(vertex['f_dc_1'])
            b = np.array(vertex['f_dc_2'])
            # SH DC to RGB: color = SH * C0 + 0.5, where C0 = 0.28209479177387814
            C0 = 0.28209479177387814
            colors = np.column_stack([
                np.clip(r * C0 + 0.5, 0, 1),
                np.clip(g * C0 + 0.5, 0, 1),
                np.clip(b * C0 + 0.5, 0, 1),
            ])
        except ValueError:
            # Fallback: try direct red/green/blue
            try:
                colors = np.column_stack([
                    np.array(vertex['red']) / 255.0,
                    np.array(vertex['green']) / 255.0,
                    np.array(vertex['blue']) / 255.0,
                ])
            except ValueError:
                colors = np.ones((len(x), 3)) * 0.5  # Gray fallback

        # Create Open3D point cloud and save as clean PLY
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(points)
        pcd.colors = o3d.utility.Vector3dVector(colors)
        o3d.io.write_point_cloud(output_path, pcd)

    except Exception:
        # If parsing fails, just copy the raw file
        shutil.copy2(input_ply_path, output_path)

    return output_path


def export_obj(input_ply_path: str, output_dir: str, progress_callback=None) -> str:
    """
    Export OBJ — Poisson surface reconstruction from the dense point cloud.
    """
    output_path = os.path.join(output_dir, "model.obj")

    if progress_callback:
        progress_callback("export", 30, "Running Poisson surface reconstruction...")

    # Load point cloud
    pcd = _load_point_cloud_from_gaussian_ply(input_ply_path)

    # Estimate normals (required for Poisson)
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
    )
    pcd.orient_normals_consistent_tangent_plane(k=15)

    # Poisson surface reconstruction
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=POISSON_DEPTH
    )

    # Remove low-density vertices (cleaning artifacts at boundaries)
    densities = np.asarray(densities)
    density_threshold = np.quantile(densities, POISSON_MIN_DENSITY)
    vertices_to_remove = densities < density_threshold
    mesh.remove_vertices_by_mask(vertices_to_remove)

    # Transfer vertex colors
    mesh.compute_vertex_normals()

    if progress_callback:
        num_verts = len(np.asarray(mesh.vertices))
        num_faces = len(np.asarray(mesh.triangles))
        progress_callback("export", 50, f"Mesh: {num_verts} vertices, {num_faces} faces")

    # Save OBJ
    o3d.io.write_triangle_mesh(output_path, mesh)
    return output_path


def export_glb(obj_path: str, output_dir: str, progress_callback=None) -> str:
    """
    Export GLB — Convert OBJ mesh to binary glTF format.
    """
    output_path = os.path.join(output_dir, "model.glb")

    if progress_callback:
        progress_callback("export", 60, "Converting to GLB...")

    # Load the OBJ mesh with trimesh
    mesh = trimesh.load(obj_path, force="mesh")

    # Export as binary glTF
    mesh.export(output_path, file_type="glb")
    return output_path


def export_las(
    input_ply_path: str,
    output_dir: str,
    gps_metadata: Optional[List[Dict[str, Any]]] = None,
    progress_callback=None,
) -> str:
    """
    Export LAS — LiDAR point cloud format with RGB and optional CRS.
    """
    output_path = os.path.join(output_dir, "model.las")

    if progress_callback:
        progress_callback("export", 70, "Exporting LAS...")

    try:
        import laspy
    except ImportError:
        raise ImportError("laspy is required for LAS export: pip install laspy")

    # Load point cloud
    pcd = _load_point_cloud_from_gaussian_ply(input_ply_path)
    points = np.asarray(pcd.points)
    colors = np.asarray(pcd.colors)

    # Apply GPS offset if available
    offset = np.zeros(3)
    if gps_metadata and len(gps_metadata) > 0:
        # Use the first GPS coordinate as the origin offset
        first_gps = gps_metadata[0]
        try:
            from pyproj import Transformer

            # Convert WGS84 lat/lon to UTM for metric coordinates
            lat, lon = first_gps["latitude"], first_gps["longitude"]

            # Determine UTM zone
            utm_zone = int((lon + 180) / 6) + 1
            is_north = lat >= 0
            epsg_code = 32600 + utm_zone if is_north else 32700 + utm_zone

            transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg_code}", always_xy=True)
            easting, northing = transformer.transform(lon, lat)
            altitude = first_gps.get("altitude", 0)
            offset = np.array([easting, northing, altitude])
        except (ImportError, Exception):
            # If pyproj not available, use raw lat/lon as offset
            offset = np.array([
                first_gps.get("longitude", 0),
                first_gps.get("latitude", 0),
                first_gps.get("altitude", 0),
            ])

    # Create LAS file
    header = laspy.LasHeader(point_format=2, version="1.2")
    header.offsets = offset
    header.scales = np.array([0.001, 0.001, 0.001])  # mm precision

    las = laspy.LasData(header)

    # Set coordinates (add offset for geo-registration)
    las.x = points[:, 0] + offset[0]
    las.y = points[:, 1] + offset[1]
    las.z = points[:, 2] + offset[2]

    # Set RGB colors (LAS uses 16-bit color)
    las.red = (colors[:, 0] * 65535).astype(np.uint16)
    las.green = (colors[:, 1] * 65535).astype(np.uint16)
    las.blue = (colors[:, 2] * 65535).astype(np.uint16)

    las.write(output_path)
    return output_path


def export_geotiff(
    input_ply_path: str,
    output_dir: str,
    gps_metadata: Optional[List[Dict[str, Any]]] = None,
    resolution: float = 0.1,
    progress_callback=None,
) -> str:
    """
    Export GeoTIFF — Top-down orthomosaic projection of the point cloud.

    Projects the point cloud onto a 2D grid from above, creating a nadir view.
    """
    output_path = os.path.join(output_dir, "orthomosaic.tif")

    if progress_callback:
        progress_callback("export", 85, "Generating GeoTIFF orthomosaic...")

    # Load point cloud
    pcd = _load_point_cloud_from_gaussian_ply(input_ply_path)
    points = np.asarray(pcd.points)
    colors = (np.asarray(pcd.colors) * 255).astype(np.uint8)

    # Project from top (XY plane)
    x_min, y_min = points[:, 0].min(), points[:, 1].min()
    x_max, y_max = points[:, 0].max(), points[:, 1].max()

    # Create raster grid
    width = int((x_max - x_min) / resolution) + 1
    height = int((y_max - y_min) / resolution) + 1

    # Cap raster size to prevent OOM
    max_dim = 8192
    if width > max_dim or height > max_dim:
        scale = max_dim / max(width, height)
        resolution = resolution / scale
        width = int((x_max - x_min) / resolution) + 1
        height = int((y_max - y_min) / resolution) + 1

    raster = np.zeros((3, height, width), dtype=np.uint8)
    z_buffer = np.full((height, width), -np.inf)

    # Rasterize points (simple z-buffer)
    col = ((points[:, 0] - x_min) / resolution).astype(int)
    row = ((y_max - points[:, 1]) / resolution).astype(int)  # Flip Y for image coords

    # Clip to bounds
    valid = (col >= 0) & (col < width) & (row >= 0) & (row < height)
    col, row = col[valid], row[valid]
    z_vals = points[valid, 2]
    rgb = colors[valid]

    # Z-buffer: keep highest point
    for i in range(len(col)):
        if z_vals[i] > z_buffer[row[i], col[i]]:
            z_buffer[row[i], col[i]] = z_vals[i]
            raster[0, row[i], col[i]] = rgb[i, 0]
            raster[1, row[i], col[i]] = rgb[i, 1]
            raster[2, row[i], col[i]] = rgb[i, 2]

    # Write GeoTIFF
    try:
        import rasterio
        from rasterio.transform import from_bounds

        # Determine CRS and transform
        crs = "EPSG:4326"  # Default
        geo_x_min, geo_y_min = x_min, y_min
        geo_x_max, geo_y_max = x_max, y_max

        if gps_metadata and len(gps_metadata) >= 2:
            try:
                from pyproj import Transformer

                first = gps_metadata[0]
                lat, lon = first["latitude"], first["longitude"]
                utm_zone = int((lon + 180) / 6) + 1
                is_north = lat >= 0
                epsg_code = 32600 + utm_zone if is_north else 32700 + utm_zone
                crs = f"EPSG:{epsg_code}"

                transformer = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
                e, n = transformer.transform(lon, lat)
                geo_x_min = e + x_min
                geo_y_min = n + y_min
                geo_x_max = e + x_max
                geo_y_max = n + y_max
            except (ImportError, Exception):
                pass

        transform = from_bounds(geo_x_min, geo_y_min, geo_x_max, geo_y_max, width, height)

        with rasterio.open(
            output_path,
            "w",
            driver="GTiff",
            height=height,
            width=width,
            count=3,
            dtype="uint8",
            crs=crs,
            transform=transform,
        ) as dst:
            dst.write(raster)

    except ImportError:
        # Fallback: save as plain TIFF using PIL
        from PIL import Image
        img = np.transpose(raster, (1, 2, 0))  # CHW → HWC
        Image.fromarray(img).save(output_path.replace(".tif", ".png"))
        output_path = output_path.replace(".tif", ".png")

    return output_path


def _load_point_cloud_from_gaussian_ply(ply_path: str) -> o3d.geometry.PointCloud:
    """
    Load a Gaussian splat PLY and extract xyz + RGB as an Open3D point cloud.
    Handles both raw point cloud PLY and Gaussian splat PLY formats.
    """
    plydata = PlyData.read(ply_path)
    vertex = plydata['vertex']

    x = np.array(vertex['x'])
    y = np.array(vertex['y'])
    z = np.array(vertex['z'])
    points = np.column_stack([x, y, z])

    # Try SH DC coefficients first (Gaussian splat format)
    try:
        r = np.array(vertex['f_dc_0'])
        g = np.array(vertex['f_dc_1'])
        b = np.array(vertex['f_dc_2'])
        C0 = 0.28209479177387814
        colors = np.column_stack([
            np.clip(r * C0 + 0.5, 0, 1),
            np.clip(g * C0 + 0.5, 0, 1),
            np.clip(b * C0 + 0.5, 0, 1),
        ])
    except ValueError:
        # Standard PLY with red/green/blue
        try:
            colors = np.column_stack([
                np.array(vertex['red']) / 255.0,
                np.array(vertex['green']) / 255.0,
                np.array(vertex['blue']) / 255.0,
            ])
        except ValueError:
            colors = np.ones((len(x), 3)) * 0.5

    # Filter out invalid points (NaN, Inf, or extreme outliers)
    valid = np.all(np.isfinite(points), axis=1)
    if valid.sum() < len(points):
        points = points[valid]
        colors = colors[valid]

    # Statistical outlier removal for cleaner export
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(points)
    pcd.colors = o3d.utility.Vector3dVector(colors)

    if len(points) > 1000:
        pcd, _ = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)

    return pcd


def run_stage5(
    gaussian_ply_path: str,
    output_dir: str,
    gps_metadata: Optional[List[Dict[str, Any]]] = None,
    progress_callback=None,
) -> Dict[str, str]:
    """
    Run Stage 5: Export the trained Gaussian model to all 5 formats.

    Args:
        gaussian_ply_path: Path to the DroneSplat output point_cloud.ply
        output_dir: Directory to save all exported files
        gps_metadata: Optional GPS data from Stage 1
        progress_callback: Optional callback(stage, progress_pct, message)

    Returns:
        Dict mapping format name to output file path
    """
    os.makedirs(output_dir, exist_ok=True)
    outputs = {}

    if progress_callback:
        progress_callback("export", 0, "Starting Stage 5: Multi-format export")

    # 1. PLY
    if progress_callback:
        progress_callback("export", 10, "Exporting PLY point cloud...")
    outputs["ply"] = export_ply(gaussian_ply_path, output_dir)

    # 2. OBJ (Poisson mesh)
    outputs["obj"] = export_obj(gaussian_ply_path, output_dir, progress_callback)

    # 3. GLB (from OBJ)
    outputs["glb"] = export_glb(outputs["obj"], output_dir, progress_callback)

    # 4. LAS
    outputs["las"] = export_las(
        gaussian_ply_path, output_dir, gps_metadata, progress_callback
    )

    # 5. GeoTIFF
    outputs["geotiff"] = export_geotiff(
        gaussian_ply_path, output_dir, gps_metadata, progress_callback=progress_callback
    )

    if progress_callback:
        progress_callback("export", 100, "All formats exported successfully")

    return outputs


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Stage 5: Export 3D model to multiple formats")
    parser.add_argument("--input", type=str, required=True, help="Path to Gaussian PLY file")
    parser.add_argument("--output", type=str, required=True, help="Output directory")
    parser.add_argument("--gps", type=str, default=None, help="Path to gps_metadata.json")

    args = parser.parse_args()

    gps_data = None
    if args.gps and os.path.exists(args.gps):
        with open(args.gps) as f:
            gps_data = json.load(f)

    def print_progress(stage, pct, msg):
        print(f"[{stage}] {pct:3d}% | {msg}")

    results = run_stage5(
        gaussian_ply_path=args.input,
        output_dir=args.output,
        gps_metadata=gps_data,
        progress_callback=print_progress,
    )

    print("\n=== Stage 5 Complete ===")
    for fmt, path in results.items():
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f"  {fmt}: {path} ({size_mb:.1f} MB)")
