"use client";

import { Suspense, useState, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import {
  ArcballControls,
  Center,
  Bounds,
  Html,
  Line,
} from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { Float32BufferAttribute } from "three";
import type { BufferGeometry, Vector3, Mesh } from "three";
import { Download, MousePointer2, Ruler } from "lucide-react";

type Mode = "cursor" | "measure";

function PointCloud({
  url,
  mode,
  onPick,
}: {
  url: string;
  mode: Mode;
  onPick: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const geometry = useLoader(PLYLoader, url) as BufferGeometry;
  const position = geometry.getAttribute("position");
  if (position && !(position.array instanceof Float32Array)) {
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute(position.array, position.itemSize)
    );
  }
  geometry.computeBoundingSphere();

  return (
    <points
      geometry={geometry}
      onPointerDown={mode === "measure" ? onPick : undefined}
    >
      <pointsMaterial
        vertexColors={Boolean(geometry.getAttribute("color"))}
      color="#ffffff"
        size={0.0015}
        sizeAttenuation
        alphaTest={0.5}
        depthWrite
        transparent={false}
      />
    </points>
  );
}

function Marker({ position }: { position: Vector3 }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.scale.setScalar(
        1 + Math.sin(clock.getElapsedTime() * 3) * 0.15
      );
    }
  });
  return (
    <mesh ref={ref} position={[position.x, position.y, position.z]}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshBasicMaterial color="#ef4444" />
    </mesh>
  );
}

interface ViewerDownloads {
  ply: string;
  obj?: string;
  glb?: string;
  las?: string;
}

export default function Viewer3D({
  modelUrl,
  downloads,
}: {
  modelUrl: string;
  downloads?: ViewerDownloads;
}) {
  const [mode, setMode] = useState<Mode>("cursor");
  const [points, setPoints] = useState<Vector3[]>([]);

  const handlePick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setPoints((prev) =>
      prev.length >= 2 ? [e.point] : [...prev, e.point]
    );
  };

  const distance = () => {
    if (points.length < 2) return null;
    return points[0].distanceTo(points[1]).toFixed(2);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setPoints([]);
  };

  return (
    <div className="viewer3d-wrap">
      <div className="viewer3d-hud">
        <div className="hud-top">
          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === "cursor" ? "active" : ""}`}
              onClick={() => switchMode("cursor")}
              title="Orbit mode"
            >
              <MousePointer2 className="mode-icon" />
            </button>
            <button
              className={`mode-btn ${mode === "measure" ? "active" : ""}`}
              onClick={() => switchMode("measure")}
              title="Measure mode"
            >
              <Ruler className="mode-icon" />
            </button>
          </div>
        </div>

        {mode === "measure" && (
          <div className="hud-measure">
            <p className="hud-hint">
              {points.length === 0
                ? "Tap first point on model"
                : points.length === 1
                  ? "Tap second point to measure"
                  : ""}
            </p>
            {points.length === 2 && (
              <div className="hud-result">
                <span className="hud-distance">{distance()} m</span>
                <button
                  className="hud-clear"
                  onClick={() => setPoints([])}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Canvas
        camera={{ position: [0, 5, 10], fov: 50 }}
        gl={{ alpha: false, antialias: false }}
      >
        <color attach="background" args={["#d9ddd8"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 10]} intensity={1} />
        <gridHelper args={[50, 50, "#c3c9c4", "#d0d5d1"]} />
        <Suspense
          fallback={
            <Html center>
              <span className="viewer3d-loading">Loading mesh...</span>
            </Html>
          }
        >
          <Bounds fit clip margin={1.2}>
            <Center>
              <group rotation={[Math.PI, 0, 0]}>
                <PointCloud url={modelUrl} mode={mode} onPick={handlePick} />
              </group>
            </Center>
          </Bounds>
        </Suspense>

        {points.map((p, i) => (
          <Marker key={i} position={p} />
        ))}

        {points.length === 2 && (
          <Line
            points={[points[0], points[1]]}
            color="#ef4444"
            lineWidth={2}
            dashed
            dashSize={0.2}
            gapSize={0.1}
          />
        )}

          <ArcballControls
          makeDefault
          enabled={mode === "cursor"}
          enableRotate={mode === "cursor"}
          enablePan={mode === "cursor"}
          enableZoom={mode === "cursor"}
            enableAnimations={false}
        />
      </Canvas>

      <div className="viewer-downloads" aria-label="Download model formats">
        {[
          ["PLY", downloads?.ply || modelUrl],
          ["OBJ", downloads?.obj],
          ["GLB", downloads?.glb],
          ["LAS", downloads?.las],
        ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, href]) => (
          <a key={label} href={href} download className="viewer-download">
            <Download className="download-icon" />
            {label}
          </a>
        ))}
      </div>

      <style jsx>{`
        .viewer3d-wrap {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 400px;
          background: #eef1ed;
          overflow: hidden;
        }
        .viewer3d-wrap :global(canvas) {
          display: block;
          width: 100% !important;
          height: 100% !important;
        }
        .viewer3d-hud {
          position: absolute;
          top: 1rem;
          left: 1rem;
          z-index: 10;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .hud-top {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .mode-toggle {
          display: flex;
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid #cbd3ca;
          box-shadow: 0 8px 24px rgba(28, 42, 30, 0.12);
          overflow: hidden;
        }
        .mode-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: transparent;
          border: none;
          color: #647064;
          cursor: pointer;
          transition: color 0.15s, background 0.15s;
        }
        .mode-btn:hover {
          color: #1f2c21;
          background: #e4ebe3;
        }
        .mode-btn.active {
          color: #2d65bd;
          background: #e7efff;
        }
        .mode-icon {
          width: 16px;
          height: 16px;
        }
        .hud-measure {
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid #cbd3ca;
          padding: 0.6rem 0.8rem;
          box-shadow: 0 8px 24px rgba(28, 42, 30, 0.12);
        }
        .hud-hint {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.08em;
          color: #647064;
          margin: 0;
        }
        .hud-result {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          margin-top: 0.3rem;
        }
        .hud-distance {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          font-weight: 600;
          color: #4ade80;
        }
        .hud-clear {
          font-family: var(--font-mono);
          font-size: 0.55rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #526052;
          background: #f7f9f6;
          border: 1px solid #cbd3ca;
          padding: 0.2rem 0.4rem;
          cursor: pointer;
          transition: color 0.15s;
        }
        .hud-clear:hover {
          color: #1f2c21;
        }
        .viewer-downloads {
          position: absolute;
          right: 1rem;
          bottom: 1rem;
          z-index: 10;
          display: flex;
          gap: 0.5rem;
          padding: 0.35rem;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid #cbd3ca;
          box-shadow: 0 8px 24px rgba(28, 42, 30, 0.12);
        }
        .viewer-download {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 0.6rem;
          color: #526052;
          border: 1px solid transparent;
          font-family: var(--font-mono);
          font-size: 0.58rem;
          letter-spacing: 0.1em;
          text-decoration: none;
          transition: color 0.15s, background 0.15s, border-color 0.15s;
        }
        .viewer-download:hover {
          color: #1f2c21;
          background: #e7efff;
          border-color: #b9c9e9;
        }
        .download-icon {
          width: 12px;
          height: 12px;
        }
        .viewer3d-loading {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--ink-muted);
        }
      `}</style>
    </div>
  );
}
