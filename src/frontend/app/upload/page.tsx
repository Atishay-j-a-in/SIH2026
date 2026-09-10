"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { fetchToken, outputUrl } from "@/lib/api";
import { getDemoDataset, type DemoDataset } from "@/lib/demo-datasets";
import { PipelineStatus } from "@/components/status-monitor";

const UploadForm = dynamic(
  () => import("../../components/upload-form"),
  { ssr: false }
);

const StatusMonitor = dynamic(
  () => import("../../components/status-monitor"),
  { ssr: false }
);

const Viewer3D = dynamic(
  () => import("../../components/viewer-3d"),
  { ssr: false }
);

type AppPhase = "idle" | "uploading" | "processing" | "complete" | "failed";

export default function UploadPage() {
  const [token, setToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<PipelineStatus | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<DemoDataset>(getDemoDataset("1"));

  useEffect(() => {
    fetchToken()
      .then(setToken)
      .catch((err: unknown) =>
        setAuthError(
          err instanceof Error
            ? err.message
            : "Could not reach the pipeline API"
        )
      );
  }, []);

  const handleUploadStart = useCallback((source: { file?: File; previewUrl: string; datasetId?: DemoDataset["id"] }) => {
    setVideoPreviewUrl((currentUrl) => {
      if (currentUrl.startsWith("blob:")) URL.revokeObjectURL(currentUrl);
      return source.previewUrl;
    });
    if (source.datasetId) setSelectedDataset(getDemoDataset(source.datasetId));
    setPhase("uploading");
    setResult(null);
  }, []);

  const handleUploadComplete = useCallback((id: string) => {
    setJobId(id);
    setPhase("processing");
  }, []);

  const handlePipelineComplete = useCallback((data: PipelineStatus) => {
    setResult(data);
    if (data.status === "failed") {
      setPhase("failed");
    } else {
      setPhase("complete");
    }
  }, []);

  const handleReset = useCallback(() => {
    setVideoPreviewUrl((currentUrl) => {
      if (currentUrl.startsWith("blob:")) URL.revokeObjectURL(currentUrl);
      return "";
    });
    setPhase("idle");
    setJobId("");
    setResult(null);
  }, []);

  return (
    <div className="upload-page">
      <header className="upload-nav">
        <Link href="/" className="nav-brand">
          The 3rD Lens
        </Link>
        <div className="nav-right">
          {phase !== "idle" && (
            <button className="reset-btn" onClick={handleReset} title="Process another video">
              <RotateCcw className="reset-icon" />
            </button>
          )}
        </div>
      </header>

      <main className="upload-split">
        <div className="split-left">
          {videoPreviewUrl && phase !== "idle" ? (
            <div className="video-preview-panel">
              <div className="video-preview-heading">
                <span className="video-preview-label">Source video</span>
                <span className="video-preview-status">
                  {phase === "complete" ? "Ready to compare" : "Pipeline input"}
                </span>
              </div>
              <video
                className="video-preview"
                src={videoPreviewUrl}
                controls
                playsInline
                preload="metadata"
              />
              <p className="video-preview-caption">
                Play the original capture while reviewing the generated model.
              </p>
            </div>
          ) : authError ? (
            <div className="auth-error">
              <p className="auth-error-title">Backend unavailable</p>
              <p className="auth-error-msg">{authError}</p>
            </div>
          ) : (
            <UploadForm
              token={token}
              onUploadStart={handleUploadStart}
              onUploadComplete={handleUploadComplete}
            />
          )}
        </div>

        <div className="split-right">
          {phase === "processing" || phase === "failed" ? (
            <StatusMonitor
              jobId={jobId}
              token={token}
              result={result}
              datasetId={selectedDataset.id}
              onComplete={handlePipelineComplete}
            />
          ) : phase === "complete" && result?.model_url ? (
            <Viewer3D
              modelUrl={
                result.model_url.startsWith("/")
                  ? result.model_url
                  : outputUrl(result.model_url, token)
              }
              downloads={{
                ply: result.model_url,
                obj: result.obj_url,
                glb: result.glb_url,
                las: result.las_url,
              }}
            />
          ) : (
            <div className="empty-viewer">
              <span>Upload video to generate 3D model</span>
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .upload-page {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          background: var(--background);
          overflow: hidden;
        }
        .upload-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem clamp(1.5rem, 3vw, 2.5rem);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          z-index: 20;
        }
        .nav-brand {
          font-family: var(--font-display);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--ink);
          text-decoration: none;
        }
        .nav-brand:hover {
          color: var(--accent);
        }
        .nav-right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .reset-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border);
          color: var(--ink-muted);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
          padding: 0;
        }
        .reset-btn:hover {
          color: var(--ink);
          border-color: var(--ink-muted);
        }
        .reset-icon {
          width: 14px;
          height: 14px;
        }
        .upload-split {
          display: grid;
          grid-template-columns: minmax(340px, 0.42fr) 1fr;
          flex: 1;
          min-height: 0;
        }
        .split-left {
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .split-right {
          position: relative;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .auth-error {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .auth-error-title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 700;
          color: #fca5a5;
          margin: 0;
        }
        .auth-error-msg {
          font-family: var(--font-body);
          font-size: 0.85rem;
          color: var(--ink-muted);
          margin: 0;
        }
        .video-preview-panel {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: clamp(1rem, 2vw, 1.5rem);
          height: 100%;
          overflow-y: auto;
        }
        .video-preview-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .video-preview-label,
        .video-preview-status,
        .video-preview-caption {
          font-family: var(--font-mono);
        }
        .video-preview-label {
          color: var(--ink);
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .video-preview-status {
          color: var(--accent);
          font-size: 0.58rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-align: right;
        }
        .video-preview {
          display: block;
          width: 100%;
          max-height: min(52vh, 460px);
          aspect-ratio: 16 / 10;
          object-fit: contain;
          background: #050505;
          border: 1px solid var(--border);
        }
        .video-preview-caption {
          color: var(--ink-muted);
          font-size: 0.62rem;
          line-height: 1.5;
          margin: 0;
        }
        .empty-viewer {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid var(--border);
          margin: 1rem;
        }
        .empty-viewer span {
          font-family: var(--font-mono);
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          color: var(--ink-muted);
        }
        @media (max-width: 860px) {
          .upload-split {
            grid-template-columns: 1fr;
            grid-template-rows: auto 1fr;
          }
          .split-left {
            border-right: none;
            border-bottom: 1px solid var(--border);
            max-height: 50vh;
          }
        }
      `}</style>
    </div>
  );
}
