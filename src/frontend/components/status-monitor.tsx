"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Activity,
  Download,
  LayoutDashboard,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { API_URL, outputUrl, BACKEND_ACTIVE } from "@/lib/api";
import { getDemoDataset, type DemoDataset } from "@/lib/demo-datasets";

const POLL_MS = 5000;

export interface PipelineStatus {
  stage: string;
  progress_percent: number;
  status?: string;
  metrics?: Record<string, string>;
  download_url?: string;
  model_url?: string;
  geotiff_url?: string;
  obj_url?: string;
  las_url?: string;
  glb_url?: string;
  message?: string;
  error?: string;
}

interface Props {
  jobId: string;
  token: string;
  result: PipelineStatus | null;
  datasetId?: DemoDataset["id"];
  onComplete: (data: PipelineStatus) => void;
}

export default function StatusMonitor({
  jobId,
  token,
  result,
  datasetId = "1",
  onComplete,
}: Props) {
  const [status, setStatus] = useState<PipelineStatus>({
    stage: "Initializing...",
    progress_percent: 0,
  });
  const [socketError, setSocketError] = useState("");
  const settled = useRef(false);

  useEffect(() => {
    if (!jobId || !token) return;
    settled.current = false;

    if (!BACKEND_ACTIVE) {
      const stages = [
        {
          stage: "dust3r",
          progress_percent: 8,
          message: "Loading reconstruction workspace...",
        },
        {
          stage: "dust3r",
          progress_percent: 20,
          message: "Processing 77 images...",
        },
        {
          stage: "dust3r",
          progress_percent: 35,
          message: "Matching image pairs...",
        },
        {
          stage: "dust3r",
          progress_percent: 50,
          message: "Running global alignment...",
        },
        {
          stage: "dust3r",
          progress_percent: 65,
          message: "Estimating camera poses...",
        },
        {
          stage: "dust3r",
          progress_percent: 75,
          message: "Saving COLMAP-format output...",
        },
        {
          stage: "sam2",
          progress_percent: 82,
          message: "Loading segmentation model...",
        },
        {
          stage: "sam2",
          progress_percent: 86,
          message: "Segmenting foreground regions...",
        },
        {
          stage: "sam2",
          progress_percent: 90,
          message: "Segmented 77/77",
        },
        {
          stage: "train",
          progress_percent: 5,
          message: "Training 5000 iterations...",
        },
        {
          stage: "train",
          progress_percent: 25,
          message: "Initializing Gaussian scene...",
        },
        {
          stage: "train",
          progress_percent: 50,
          message: "Optimizing geometry and appearance...",
        },
        {
          stage: "train",
          progress_percent: 75,
          message: "Refining spatial detail...",
        },
        {
          stage: "train",
          progress_percent: 95,
          message: "Training iteration 5000/5000",
        },
        {
          stage: "export",
          progress_percent: 10,
          message: "Preparing export formats...",
        },
        {
          stage: "export",
          progress_percent: 30,
          message: "Running Poisson surface reconstruction...",
        },
        {
          stage: "export",
          progress_percent: 60,
          message: "Writing PLY and OBJ files...",
        },
        {
          stage: "export",
          progress_percent: 85,
          message: "Writing GLB and LAS files...",
        },
        {
          stage: "Complete",
          progress_percent: 100,
          message: "Pipeline complete",
        },
      ];
      let idx = -1;
      const timer = setInterval(() => {
        if (settled.current) {
          clearInterval(timer);
          return;
        }
        idx += 1;
        setStatus(stages[idx]);
        if (stages[idx].stage === "Complete") {
          settled.current = true;
          clearInterval(timer);
          onComplete({
            stage: "Complete",
            progress_percent: 100,
            status: "complete",
            metrics: {
              processing_time_s: "48.7",
              estimated_spatial_accuracy_m: "0.02",
              keyframe_count: "77",
              vertex_count: "284,719",
            },
            model_url: getDemoDataset(datasetId).modelUrl,
            obj_url: getDemoDataset(datasetId).objUrl,
            las_url: getDemoDataset(datasetId).lasUrl,
            glb_url: datasetId === "1" ? "/1/model%20(4).glb" : undefined,
          });
        }
      }, 1800);
      return () => clearInterval(timer);
    }

    const absorb = (data: PipelineStatus) => {
      if (!data) return;
      setStatus(data);
      const done = data.stage === "Complete" || data.status === "complete";
      const failed = data.status === "failed";
      if ((done || failed) && !settled.current) {
        settled.current = true;
        onComplete(data);
      }
    };

    const socket: Socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      setSocketError("");
      socket.emit("subscribe", { job_id: jobId, token });
    });
    socket.on("status_update", absorb);
    socket.on("error", (e: { message?: string }) =>
      setSocketError(e?.message || "Socket error")
    );
    socket.on("connect_error", () =>
      setSocketError("Live updates unavailable, polling instead")
    );

    const poll = setInterval(async () => {
      if (settled.current) return;
      try {
        const res = await fetch(`${API_URL}/api/v1/status/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) absorb(await res.json());
      } catch {
        /* transient */
      }
    }, POLL_MS);

    return () => {
      clearInterval(poll);
      socket.disconnect();
    };
  }, [datasetId, jobId, token, onComplete]);

  if (result?.status === "failed") {
    return (
      <div className="sm-panel sm-failed">
        <h2 className="sm-title sm-title-fail">
          <XCircle className="sm-icon" /> Pipeline Failed
        </h2>
        <p className="sm-error">
          {result.error || result.message || "Unknown error"}
        </p>
        <style jsx>{`
          .sm-panel {
            padding: 1.5rem;
            border: 1px solid rgba(239, 68, 68, 0.35);
            background: rgba(239, 68, 68, 0.06);
          }
          .sm-title {
            font-family: var(--font-display);
            font-size: 1.2rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin: 0 0 0.75rem;
          }
          .sm-title-fail {
            color: #fca5a5;
          }
          .sm-icon {
            width: 22px;
            height: 22px;
          }
          .sm-error {
            font-family: var(--font-mono);
            font-size: 0.8rem;
            color: #fca5a5;
            word-break: break-all;
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  if (result) {
    const m = result.metrics ?? {};
    return (
      <div className="sm-panel sm-done">
        <h2 className="sm-title sm-title-done">
          <CheckCircle2 className="sm-icon" /> Pipeline Complete
        </h2>
        <div className="sm-metrics">
          <div className="sm-metric">
            <span className="sm-metric-label">Processing Time</span>
            <span className="sm-metric-val">
              {m.processing_time_s != null ? `${m.processing_time_s}s` : "—"}
            </span>
          </div>
          <div className="sm-metric">
            <span className="sm-metric-label">Spatial Accuracy</span>
            <span className="sm-metric-val">
              {m.estimated_spatial_accuracy_m != null
                ? `${m.estimated_spatial_accuracy_m}m`
                : "—"}
            </span>
          </div>
          <div className="sm-metric">
            <span className="sm-metric-label">Keyframes</span>
            <span className="sm-metric-val">
              {m.keyframe_count ?? "—"}
            </span>
          </div>
          <div className="sm-metric">
            <span className="sm-metric-label">Vertices</span>
            <span className="sm-metric-val">
              {m.vertex_count?.toLocaleString() ?? "—"}
            </span>
          </div>
        </div>
        <div className="sm-downloads">
          {result.model_url && (
            <a
              href={outputUrl(result.model_url, token)}
              download
              className="sm-dl sm-dl-primary"
            >
              <Download className="sm-dl-icon" /> Download GLB
            </a>
          )}
          {result.geotiff_url && (
            <a
              href={outputUrl(result.geotiff_url, token)}
              download
              className="sm-dl sm-dl-secondary"
            >
              <LayoutDashboard className="sm-dl-icon" /> Get GeoTIFF
            </a>
          )}
        </div>
        <style jsx>{`
          .sm-panel {
            padding: 1.5rem;
            border: 1px solid rgba(34, 197, 94, 0.35);
            background: rgba(34, 197, 94, 0.04);
          }
          .sm-title {
            font-family: var(--font-display);
            font-size: 1.2rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin: 0 0 1rem;
          }
          .sm-title-done {
            color: #4ade80;
          }
          .sm-icon {
            width: 22px;
            height: 22px;
          }
          .sm-metrics {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
            margin-bottom: 1.25rem;
          }
          .sm-metric {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
            padding: 0.75rem;
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
          }
          .sm-metric-label {
            font-family: var(--font-mono);
            font-size: 0.6rem;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--ink-muted);
          }
          .sm-metric-val {
            font-family: var(--font-mono);
            font-size: 1rem;
            color: var(--ink);
          }
          .sm-downloads {
            display: flex;
            gap: 0.75rem;
          }
          .sm-dl {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.75rem;
            font-family: var(--font-mono);
            font-size: 0.7rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            text-decoration: none;
            transition: background 0.15s;
          }
          .sm-dl-icon {
            width: 14px;
            height: 14px;
          }
          .sm-dl-primary {
            background: var(--accent);
            color: #fff;
          }
          .sm-dl-primary:hover {
            background: #2563eb;
          }
          .sm-dl-secondary {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid var(--border);
            color: var(--ink);
          }
          .sm-dl-secondary:hover {
            background: rgba(255, 255, 255, 0.1);
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="sm-panel sm-live">
      <h2 className="sm-title sm-title-live">
        <Activity className="sm-icon sm-pulse" /> Live Execution Progress
      </h2>
      <div className="sm-live-header">
        <span className="sm-live-stage">{status.stage}</span>
        <span className="sm-live-pct">{status.progress_percent ?? 0}%</span>
      </div>
      <div
        className="sm-live-track"
        role="progressbar"
        aria-valuenow={status.progress_percent ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Pipeline progress"
      >
        <div
          className="sm-live-fill"
          style={{ width: `${status.progress_percent ?? 0}%` }}
        />
      </div>
      <div className="sm-live-log">
        &gt; {status.message || "Waiting for pipeline..."}
      </div>
      {socketError && <p className="sm-warn">{socketError}</p>}
      <style jsx>{`
        .sm-panel {
          padding: 1.5rem;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.015);
        }
        .sm-title {
          font-family: var(--font-display);
          font-size: 1.2rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0 0 1rem;
        }
        .sm-title-live {
          color: var(--ink);
        }
        .sm-icon {
          width: 20px;
          height: 20px;
          color: var(--accent);
        }
        .sm-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
        .sm-live-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        .sm-live-stage {
          font-family: var(--font-body);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--accent);
        }
        .sm-live-pct {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--ink-muted);
        }
        .sm-live-track {
          height: 6px;
          background: var(--border);
          overflow: hidden;
          margin-bottom: 1rem;
        }
        .sm-live-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.4s ease;
        }
        .sm-live-log {
          font-family: var(--font-mono);
          font-size: 0.7rem;
          color: #4ade80;
          background: rgba(0, 0, 0, 0.4);
          padding: 0.6rem 0.8rem;
          border: 1px solid rgba(74, 222, 128, 0.15);
        }
        .sm-warn {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          color: #fbbf24;
          margin: 0.5rem 0 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .sm-pulse {
            animation: none;
          }
          .sm-live-fill {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
