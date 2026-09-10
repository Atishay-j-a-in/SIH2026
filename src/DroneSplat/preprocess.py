import os
import sys
import gc

# Ensure DUSt3R and CroCo submodules are in sys.path
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
for _p in [
    os.path.join(_BASE_DIR, "submodules", "dust3r"),
    os.path.join(_BASE_DIR, "submodules", "dust3r", "croco"),
    os.path.join(_BASE_DIR, "submodules", "croco"),
]:
    if os.path.exists(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

import torch
import numpy as np
import argparse
import time
import matplotlib.pyplot as plt
from plyfile import PlyData, PlyElement

from submodules.dust3r.dust3r.inference import inference
from submodules.dust3r.dust3r.model import AsymmetricCroCo3DStereo
from submodules.dust3r.dust3r.utils.device import to_numpy
from submodules.dust3r.dust3r.image_pairs import make_pairs
from submodules.dust3r.dust3r.cloud_opt import global_aligner, GlobalAlignerMode
from utils.dust3r_utils import  compute_global_alignment, load_images,  save_colmap_cameras, save_colmap_images

from scene.colmap_loader import read_extrinsics_binary, read_intrinsics_binary

def get_args_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image_size", type=int, default=512, choices=[512, 224], help="image size")
    parser.add_argument("--model_path", type=str, default="checkpoints/DUSt3R_ViTLarge_BaseDecoder_512_linear.pth", help="path to the model weights")
    parser.add_argument("--device", type=str, default='cuda', help="pytorch device")
    parser.add_argument("--batch_size", type=int, default=4)
    parser.add_argument("--schedule", type=str, default='linear')
    parser.add_argument("--lr", type=float, default=0.01)
    parser.add_argument("--niter", type=int, default=500)
    parser.add_argument("--focal_avg", action="store_true")
    parser.add_argument("--img_base_path", type=str, default="data/uni3_512_confidence/32_views")
    parser.add_argument("--colmap_path", type=str, default="uni3_512_colmap/32_views/sparse/0")
    parser.add_argument("--min_threshold", type=float, default=1.0)
    parser.add_argument("--preset_pose", action="store_true", help="Use preset pose if provided")
    return parser

def load_image_list(file_path):
    with open(file_path, 'r') as file:
        return [line.strip() for line in file.readlines()]


def quad2rotation(q):
    """
    Convert quaternion to rotation in batch. Since all operation in pytorch, support gradient passing.

    Args:
        quad (tensor, batch_size*4): quaternion.

    Returns:
        rot_mat (tensor, batch_size*3*3): rotation.
    """
    if not isinstance(q, torch.Tensor):
        q = torch.tensor(q).cuda()

    norm = torch.sqrt(
        q[:, 0] * q[:, 0] + q[:, 1] * q[:, 1] + q[:, 2] * q[:, 2] + q[:, 3] * q[:, 3]
    )
    q = q / norm[:, None]
    rot = torch.zeros((q.size(0), 3, 3)).to(q)
    r = q[:, 0]
    x = q[:, 1]
    y = q[:, 2]
    z = q[:, 3]
    rot[:, 0, 0] = 1 - 2 * (y * y + z * z)
    rot[:, 0, 1] = 2 * (x * y - r * z)
    rot[:, 0, 2] = 2 * (x * z + r * y)
    rot[:, 1, 0] = 2 * (x * y + r * z)
    rot[:, 1, 1] = 1 - 2 * (x * x + z * z)
    rot[:, 1, 2] = 2 * (y * z - r * x)
    rot[:, 2, 0] = 2 * (x * z - r * y)
    rot[:, 2, 1] = 2 * (y * z + r * x)
    rot[:, 2, 2] = 1 - 2 * (x * x + y * y)
    return rot


def get_camera_from_tensor(inputs):
    """
    Convert quaternion and translation to transformation matrix.

    """
    if not isinstance(inputs, torch.Tensor):
        inputs = torch.tensor(inputs).cuda()

    N = len(inputs.shape)
    if N == 1:
        inputs = inputs.unsqueeze(0)

    quad, T = inputs[:, :4], inputs[:, 4:]
    w2c = torch.eye(4).to(inputs).float()
    R = quad2rotation(quad).squeeze()
    w2c[:3, :3] = R.T
    w2c[:3, 3] = -torch.matmul(R.T, T.squeeze(0))
    return w2c

def storePly(path, xyz, rgb, confidence):
    # Define the dtype for the structured array, including confidence
    dtype = [('x', 'f4'), ('y', 'f4'), ('z', 'f4'),
             ('nx', 'f4'), ('ny', 'f4'), ('nz', 'f4'),
             ('red', 'u1'), ('green', 'u1'), ('blue', 'u1'),
             ('confidence', 'f4')]  # Add confidence

    normals = np.zeros_like(xyz)  # Assuming normals are zero if not provided

    # Ensure that confidence has the same number of elements as xyz
    if confidence.shape[0] != xyz.shape[0]:
        raise ValueError("Confidence and points (xyz) must have the same number of elements")
    elements = np.empty(xyz.shape[0], dtype=dtype)

    attributes = np.concatenate((xyz, normals, rgb, confidence[:, np.newaxis]), axis=1)
    elements[:] = list(map(tuple, attributes))

    vertex_element = PlyElement.describe(elements, 'vertex')
    ply_data = PlyData([vertex_element])
    ply_data.write(path)


def filter_known_cameras_and_images(img_list, known_cameras, known_images):
    filtered_cameras = {}
    filtered_images = {}

    for image_name in img_list:
        for image_id, image in known_images.items():
            if image.name == image_name:
                camera_id = image.camera_id
                if camera_id in known_cameras:
                    filtered_cameras[camera_id] = known_cameras[camera_id]
                filtered_images[image_id] = image

    return filtered_cameras, filtered_images

def extract_known_poses_and_focals_with_mask(filtered_images, filtered_cameras, img_list):
    known_poses = []
    known_focals = []
    pose_msk = []

    for img_name in img_list:
        if any(image.name == img_name for image in filtered_images.values()):
            pose_msk.append(True)
            # 找到对应的图像并提取位姿
            for img_id, image in filtered_images.items():
                if image.name == img_name:
                    qvec = torch.tensor(image.qvec, dtype=torch.float32)
                    tvec = torch.tensor(image.tvec, dtype=torch.float32)
                    pose_matrix = get_camera_from_tensor(torch.cat([qvec, tvec]))
                    known_poses.append(pose_matrix)
                    break
        else:
            pose_msk.append(False)

    for cam_id, camera in filtered_cameras.items():
        focal_length = camera.params[0]
        known_focals.append(focal_length)

    return known_poses, known_focals, pose_msk


def run_preprocess(
    img_base_path,
    model_path="checkpoints/DUSt3R_ViTLarge_BaseDecoder_512_dpt.pth",
    device="cuda",
    batch_size=4,
    schedule="linear",
    lr=0.01,
    niter=500,
    image_size=512,
    min_threshold=1.0,
    focal_avg=False,
    preset_pose=False,
    colmap_path=None,
):
    """
    Callable wrapper for DUSt3R preprocessing.
    
    This function performs dense stereo matching and pose estimation using DUSt3R,
    outputting COLMAP-format camera files and a dense point cloud for DroneSplat training.
    
    Args:
        img_base_path: Path to scene directory containing 'images/', 'train_list.txt', 'test_list.txt'
        model_path: Path to DUSt3R checkpoint
        device: 'cuda' or 'cpu'
        batch_size: Inference batch size
        schedule: Learning rate schedule ('linear' or 'cosine')
        lr: Learning rate for global alignment
        niter: Number of alignment iterations
        image_size: DUSt3R input resolution (512 or 224)
        min_threshold: Minimum confidence threshold
        focal_avg: Whether to average focal lengths
        preset_pose: Whether to use preset COLMAP poses
        colmap_path: Path to existing COLMAP sparse reconstruction (used with preset_pose)
    
    Returns:
        dict with keys: output_colmap_path, num_points, focal
    """
    img_folder_path = os.path.join(img_base_path, "images")
    os.makedirs(img_folder_path, exist_ok=True)
    model = AsymmetricCroCo3DStereo.from_pretrained(model_path).to(device)

    train_img_list = load_image_list(os.path.join(img_base_path, 'train_list.txt'))
    test_img_list = load_image_list(os.path.join(img_base_path, 'test_list.txt'))

    img_list = sorted(os.listdir(img_folder_path))
    images, ori_size = load_images(img_folder_path, size=image_size)
    start_time = time.time()

    pairs = make_pairs(images, scene_graph='complete', prefilter=None, symmetrize=True)
    output = inference(pairs, model, device, batch_size=batch_size)
    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    output_colmap_path = img_folder_path.replace("images", "sparse/0")
    os.makedirs(output_colmap_path, exist_ok=True)

    scene = global_aligner(output, device=device, mode=GlobalAlignerMode.PointCloudOptimizer)

    init = "mst"
    if preset_pose and colmap_path:
        colmap_sparse_path = colmap_path
        known_cameras = read_intrinsics_binary(os.path.join(colmap_sparse_path, 'cameras.bin'))
        known_images = read_extrinsics_binary(os.path.join(colmap_sparse_path, 'images.bin'))
        filtered_cameras, filtered_images = filter_known_cameras_and_images(img_list, known_cameras, known_images)
        known_poses, known_focals, pose_msk = extract_known_poses_and_focals_with_mask(filtered_images, filtered_cameras, img_list)
        known_focals = [focal / 2.671875 for focal in known_focals]
        scene.preset_pose(known_poses=known_poses, pose_msk=pose_msk)
        scene.preset_focal(known_focals=known_focals, msk=pose_msk)
        init = "known_poses"

    loss = compute_global_alignment(scene=scene, init=init, niter=niter, schedule=schedule, lr=lr, focal_avg=focal_avg)
    scene = scene.clean_pointcloud()

    imgs = to_numpy(scene.imgs)
    focals = scene.get_focals()
    poses = to_numpy(scene.get_im_poses())
    pts3d = to_numpy(scene.get_pts3d())
    min_conf_thr = np.exp(min_threshold)
    scene.min_conf_thr = float(scene.conf_trf(torch.tensor(min_conf_thr)))
    confidence_masks = to_numpy(scene.get_masks())
    intrinsics = to_numpy(scene.get_intrinsics())
    confidence_map = [conf.detach().cpu().numpy() for conf in scene.im_conf]
    confidence_map = np.array(confidence_map)

    # Save train points
    train_img_indices = [img_list.index(img) for img in train_img_list if img in img_list]
    pts_4_3dgs_train = np.concatenate([pts3d[i][confidence_masks[i]] for i in train_img_indices])
    color_4_3dgs_train = np.concatenate([imgs[i][confidence_masks[i]] for i in train_img_indices])
    confidance_map_train = np.concatenate([confidence_map[i][confidence_masks[i]] for i in train_img_indices])
    storePly(
        os.path.join(output_colmap_path, "points3D.ply"),
        pts_4_3dgs_train,
        (color_4_3dgs_train * 255.0).astype(np.uint8),
        confidance_map_train.astype(np.uint8),
    )
    np.save(output_colmap_path + "/confidence_map_train.npy", confidance_map_train)

    # Save test points
    test_img_indices = [img_list.index(img) for img in test_img_list if img in img_list]
    pts_4_3dgs_test = np.concatenate([pts3d[i][confidence_masks[i]] for i in test_img_indices])
    color_4_3dgs_test = np.concatenate([imgs[i][confidence_masks[i]] for i in test_img_indices])
    confidance_map_test = np.concatenate([confidence_map[i][confidence_masks[i]] for i in test_img_indices])
    storePly(
        os.path.join(output_colmap_path, "points3D_test.ply"),
        pts_4_3dgs_test,
        (color_4_3dgs_test * 255.0).astype(np.uint8),
        confidance_map_test.astype(np.uint8),
    )
    np.save(output_colmap_path + "/confidence_map_test.npy", confidance_map_test)

    end_time = time.time()
    print(f"Preprocessing time: {end_time - start_time:.1f} seconds")

    # Save COLMAP camera files
    save_colmap_cameras(ori_size, intrinsics, os.path.join(output_colmap_path, 'cameras.txt'))
    save_colmap_images(poses, os.path.join(output_colmap_path, 'images.txt'), img_list)

    # Save all points and metadata
    pts_4_3dgs = np.concatenate([p[m] for p, m in zip(pts3d, confidence_masks)])
    color_4_3dgs = (np.concatenate([p[m] for p, m in zip(imgs, confidence_masks)]) * 255.0).astype(np.uint8)
    all_conf = np.concatenate([c[m] for c, m in zip(confidence_map, confidence_masks)])
    storePly(os.path.join(output_colmap_path, "points3D_all.ply"), pts_4_3dgs, color_4_3dgs, all_conf.astype(np.uint8))
    np.save(output_colmap_path + "/confidence_map.npy", np.array(all_conf))
    np.save(output_colmap_path + "/pts_4_3dgs_all.npy", np.array(pts3d).reshape(-1, 3))
    np.save(output_colmap_path + "/focal.npy", np.array(focals.detach().cpu().numpy()))

    return {
        "output_colmap_path": output_colmap_path,
        "num_points": len(pts_4_3dgs_train),
        "focal": focals.detach().cpu().numpy().tolist(),
        "elapsed_seconds": end_time - start_time,
    }


if __name__ == '__main__':
    
    parser = get_args_parser()
    args = parser.parse_args()

    model_path = args.model_path
    device = args.device
    batch_size = args.batch_size
    schedule = args.schedule
    lr = args.lr
    niter = args.niter
    img_base_path = args.img_base_path
    img_folder_path = os.path.join(img_base_path, "images")
    os.makedirs(img_folder_path, exist_ok=True)
    model = AsymmetricCroCo3DStereo.from_pretrained(model_path).to(device)

    train_img_list = load_image_list(os.path.join(img_base_path, 'train_list.txt'))
    print("train_img_list", train_img_list)
    test_img_list = load_image_list(os.path.join(img_base_path, 'test_list.txt'))
    print("test_img_list", test_img_list)
    
    img_list = sorted(os.listdir(img_folder_path))
    images, ori_size = load_images(img_folder_path, size=512) 
    start_time = time.time()

    pairs = make_pairs(images, scene_graph='complete', prefilter=None, symmetrize=True)
    output = inference(pairs, model, args.device, batch_size=batch_size)
    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    output_colmap_path=img_folder_path.replace("images", "sparse/0")
    os.makedirs(output_colmap_path, exist_ok=True)

    scene = global_aligner(output, device=args.device, mode=GlobalAlignerMode.PointCloudOptimizer)

    init = "mst"
    if args.preset_pose:
        print("-----------Preset Pose-----------")
        colmap_sparse_path = args.preset_colmap_path
        known_cameras = read_intrinsics_binary(os.path.join(colmap_sparse_path, 'cameras.bin'))
        known_images = read_extrinsics_binary(os.path.join(colmap_sparse_path, 'images.bin'))

        filtered_cameras, filtered_images = filter_known_cameras_and_images(img_list, known_cameras, known_images)
        known_poses, known_focals, pose_msk = extract_known_poses_and_focals_with_mask(filtered_images, filtered_cameras, img_list)

        print("known_focals", known_focals)
        known_focals = [focal /2.671875 for focal in known_focals]
        print("known_focals", known_focals)
        # print("known_poses:", known_poses)
        scene.preset_pose(known_poses=known_poses, pose_msk=pose_msk)
        scene.preset_focal(known_focals=known_focals, msk=pose_msk)
        init = "known_poses"

    loss = compute_global_alignment(scene=scene, init=init, niter=niter, schedule=schedule, lr=lr, focal_avg=args.focal_avg)
    scene = scene.clean_pointcloud()   

    imgs = to_numpy(scene.imgs)
    focals = scene.get_focals()
    poses = to_numpy(scene.get_im_poses())
    pts3d = to_numpy(scene.get_pts3d())
    min_conf_thr = np.exp(args.min_threshold)
    scene.min_conf_thr = float(scene.conf_trf(torch.tensor(min_conf_thr)))
    print("scene.min_conf_thr", scene.min_conf_thr)
    confidence_masks = to_numpy(scene.get_masks())
    intrinsics = to_numpy(scene.get_intrinsics())
    confidence_map = [conf.detach().cpu().numpy() for conf in scene.im_conf]
    print("confidence_map", len(confidence_map), confidence_map[0].shape)
    confidence_map = np.array(confidence_map)
    print("confidance_map", confidence_map.shape)

    save_dir = os.path.join(output_colmap_path, 'images_with_confidence')
    os.makedirs(save_dir, exist_ok=True)
    for i, im_conf in enumerate(scene.im_conf):
        img_np = imgs[i]
        im_conf_np = im_conf.detach().cpu().numpy()
        
        fig, axes = plt.subplots(1, 2, figsize=(10, 5))
        axes[0].imshow(img_np)
        axes[0].axis('off')
        axes[0].set_title(f'Image {i}')
        
        cax = axes[1].imshow(im_conf_np, cmap='hot', interpolation='nearest')
        axes[1].axis('off')
        axes[1].set_title(f'Confidence {i}')
        fig.colorbar(cax, ax=axes[1], fraction=0.046, pad=0.04)

        # Save the figure
        fig.savefig(os.path.join(save_dir, f'image_conf_{i}.png'))
        plt.close(fig)

    ## train pts3d
    train_img_indices = [img_list.index(img) for img in train_img_list]
    pts_4_3dgs_train = np.concatenate([pts3d[i][confidence_masks[i]] for i in train_img_indices])
    print("pts_4_3dgs_train", pts_4_3dgs_train.shape)
    color_4_3dgs_train = np.concatenate([imgs[i][confidence_masks[i]] for i in train_img_indices])
    confidance_map_train = np.concatenate([confidence_map[i][confidence_masks[i]] for i in train_img_indices])
    output_train_colmap_path = os.path.join(output_colmap_path, "points3D.ply")
    storePly(output_train_colmap_path, pts_4_3dgs_train, (color_4_3dgs_train * 255.0).astype(np.uint8), confidance_map_train.astype(np.uint8))

    np.save(output_colmap_path + "/confidence_map_train.npy", confidance_map_train)

    

    ## test pts3d
    test_img_indices = [img_list.index(img) for img in test_img_list]
    pts_4_3dgs_test = np.concatenate([pts3d[i][confidence_masks[i]] for i in test_img_indices])
    print("pts_4_3dgs_test", pts_4_3dgs_test.shape)
    color_4_3dgs_test = np.concatenate([imgs[i][confidence_masks[i]] for i in test_img_indices])
    confidance_map_test =  np.concatenate([confidence_map[i][confidence_masks[i]] for i in test_img_indices])
    output_test_colmap_path = os.path.join(output_colmap_path, "points3D_test.ply")
    storePly(output_test_colmap_path, pts_4_3dgs_test, (color_4_3dgs_test * 255.0).astype(np.uint8), confidance_map_test.astype(np.uint8))
    
    np.save(output_colmap_path + "/confidence_map_test.npy", confidance_map_test)

    end_time = time.time()
    print(f"Time : {end_time-start_time} seconds")

    # save
    save_colmap_cameras(ori_size, intrinsics, os.path.join(output_colmap_path, 'cameras.txt'))
    save_colmap_images(poses, os.path.join(output_colmap_path, 'images.txt'), img_list)
    print("pts3d", len(pts3d), pts3d[0].shape)
    pts_4_3dgs = np.concatenate([p[m] for p, m in zip(pts3d, confidence_masks)])
    print("pts_4_3dgs", pts_4_3dgs.shape)
    color_4_3dgs = np.concatenate([p[m] for p, m in zip(imgs, confidence_masks)])
    color_4_3dgs = (color_4_3dgs * 255.0).astype(np.uint8)

    confidence_map = np.concatenate([c[m] for c, m in zip(confidence_map, confidence_masks)])

    
    storePly(os.path.join(output_colmap_path, "points3D_all.ply"), pts_4_3dgs, color_4_3dgs, confidence_map.astype(np.uint8))
    np.save(output_colmap_path + "/confidence_map.npy", np.array(confidence_map))
    pts_4_3dgs_all = np.array(pts3d).reshape(-1, 3)
    np.save(output_colmap_path + "/pts_4_3dgs_all.npy", pts_4_3dgs_all)
    np.save(output_colmap_path + "/focal.npy", np.array(focals.detach().cpu().numpy()))
