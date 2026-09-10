"use client";

import { useState, useRef } from "react";
import axios from "axios";
import {
  UploadCloud,
  FileVideo,
  AlertCircle,
  CheckCircle2,
  FileUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { API_URL, BACKEND_ACTIVE } from "@/lib/api";
import { DEMO_DATASETS, type DemoDataset } from "@/lib/demo-datasets";

const CHUNK_SIZE = 8 * 1024 * 1024;
const CHUNK_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

interface Props {
  token: string;
  onUploadStart: (source: { file?: File; previewUrl: string; datasetId?: DemoDataset["id"] }) => void;
  onUploadComplete: (jobId: string) => void;
}

export default function UploadForm({
  token,
  onUploadStart,
  onUploadComplete,
}: Props) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [gpsFile, setGpsFile] = useState<File | null>(null);
  const [rtkFile, setRtkFile] = useState<File | null>(null);
  const [imuFile, setImuFile] = useState<File | null>(null);
  const [gcpFile, setGcpFile] = useState<File | null>(null);
  const [calibFile, setCalibFile] = useState<File | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<DemoDataset | null>(null);
  const [selectedGpsDataset, setSelectedGpsDataset] = useState<DemoDataset | null>(null);
  const [showDemoPicker, setShowDemoPicker] = useState<"video" | "gps" | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sentBytes, setSentBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [error, setError] = useState("");

  const videoRef = useRef<HTMLInputElement>(null);
  const gpsRef = useRef<HTMLInputElement>(null);
  const rtkRef = useRef<HTMLInputElement>(null);
  const imuRef = useRef<HTMLInputElement>(null);
  const gcpRef = useRef<HTMLInputElement>(null);
  const calibRef = useRef<HTMLInputElement>(null);

  const authHeader = { Authorization: `Bearer ${token}` };

  const putChunk = async (uploadId: string, index: number, blob: Blob) => {
    const form = new FormData();
    form.append("upload_id", uploadId);
    form.append("chunk_index", String(index));
    form.append("chunk", blob);

    let lastError: unknown;
    for (let attempt = 1; attempt <= CHUNK_RETRIES; attempt++) {
      try {
        await axios.post(`${API_URL}/api/v1/upload/chunk`, form, {
          headers: authHeader,
        });
        return;
      } catch (err) {
        lastError = err;
        if (attempt < CHUNK_RETRIES) await sleep(attempt * 1000);
      }
    }
    throw lastError;
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!BACKEND_ACTIVE) {
      if (!selectedDataset || !selectedGpsDataset) {
        setError("Select both a source video and GPS metadata before starting the pipeline.");
        return;
      }
      setIsUploading(true);
      setError("");
      setSentBytes(0);
      onUploadStart({ previewUrl: selectedDataset.videoUrl, datasetId: selectedDataset.id });

      const totalSize = 42 * 1024 * 1024;
      setTotalBytes(totalSize);
      for (let i = 1; i <= 24; i++) {
        await sleep(100);
        setSentBytes(Math.round((i / 24) * totalSize));
      }
      setIsUploading(false);
      onUploadComplete(`demo-job-${selectedDataset.id}`);
      return;
    }

    if (!videoFile || !gpsFile) {
      setError("Please select both a drone video and GPS metadata file.");
      return;
    }

    setIsUploading(true);
    setError("");
    setSentBytes(0);
    onUploadStart({ file: videoFile, previewUrl: URL.createObjectURL(videoFile) });

    const allFiles = [videoFile, gpsFile];
    if (rtkFile) allFiles.push(rtkFile);
    if (imuFile) allFiles.push(imuFile);
    if (gcpFile) allFiles.push(gcpFile);
    if (calibFile) allFiles.push(calibFile);
    const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);
    setTotalBytes(totalSize);

    try {
      const init = await axios.post(
        `${API_URL}/api/v1/upload/init`,
        {
          filename: videoFile.name,
          total_size: totalSize,
          total_chunks: Math.max(1, Math.ceil(videoFile.size / CHUNK_SIZE)),
          metadata: {
            device: "drone",
            gps_file: gpsFile.name,
            video_file: videoFile.name,
            optional_files: [
              rtkFile && { type: "rtk", filename: rtkFile.name },
              imuFile && { type: "imu", filename: imuFile.name },
              gcpFile && { type: "gcp", filename: gcpFile.name },
              calibFile && { type: "calibration", filename: calibFile.name },
            ].filter(Boolean),
          },
        },
        { headers: authHeader }
      );
      const uploadId = init.data.upload_id;

      let uploaded = 0;
      const totalChunks = Math.max(
        1,
        Math.ceil(videoFile.size / CHUNK_SIZE)
      );
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, videoFile.size);
        await putChunk(uploadId, i, videoFile.slice(start, end));
        uploaded += end - start;
        setSentBytes(uploaded);
      }

      const extraFiles = [gpsFile, rtkFile, imuFile, gcpFile, calibFile].filter(
        (f): f is File => f !== null
      );
      for (const file of extraFiles) {
        const chunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
        for (let i = 0; i < chunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          await putChunk(uploadId, totalChunks + i, file.slice(start, end));
          uploaded += end - start;
          setSentBytes(uploaded);
        }
      }

      const done = await axios.post(
        `${API_URL}/api/v1/upload/complete`,
        { upload_id: uploadId },
        { headers: authHeader }
      );

      setIsUploading(false);
      onUploadComplete(done.data.job_id);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
      setError(
        axiosErr?.response?.data?.error || axiosErr?.message || "Upload failed"
      );
      setIsUploading(false);
    }
  };

  const percent =
    totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0;

  const renderDropzone = (
    file: File | null,
    onFile: (f: File) => void,
    accept: string,
    label: string,
    description: string,
    required: boolean,
    disabled: boolean,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) => (
    <div
      className={`dropzone ${file ? "has-file" : ""}`}
      style={{
        border: file ? "1px dotted rgba(34, 197, 94, 0.5)" : "1px dotted rgba(255, 255, 255, 0.2)",
        background: file ? "rgba(34, 197, 94, 0.04)" : "rgba(255, 255, 255, 0.02)",
        cursor: "pointer",
        minHeight: "70px",
        borderRadius: "4px",
        transition: "border-color 0.2s, background 0.2s",
        padding: "1rem 0.75rem",
      }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {file ? (
        <div className="file-selected">
          <CheckCircle2 className="file-check" />
          <div className="file-meta">
            <span className="file-name">{file.name}</span>
            <span className="file-size">{formatMB(file.size)} MB</span>
          </div>
        </div>
      ) : (
        <div
          className="dropzone-content"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            gap: "0.3rem",
            textAlign: "center",
          }}
        >
          <FileVideo className="dropzone-icon" />
          <span className="dropzone-label">
            {label}
            {required && <span className="required">*</span>}
          </span>
          {description && <span className="dropzone-desc">{description}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="upload-form">
      <h2 className="form-title">
        <UploadCloud className="title-icon" />
        Upload Drone Data
      </h2>

      <form onSubmit={submitForm}>
        {!BACKEND_ACTIVE ? (
          <div className="demo-datasets">
            <span className="section-label">Required</span>
            <button
              type="button"
              className={`demo-dropzone ${selectedDataset ? "selected" : ""}`}
              onClick={() => setShowDemoPicker("video")}
              disabled={isUploading}
            >
              <FileVideo className="dropzone-icon" />
              <span className="demo-dropzone-copy">
                <strong>{selectedDataset?.videoUrl.split("/").pop() || "Select drone video"}</strong>
                <small>{selectedDataset ? "Video selected" : "Choose from 3 bundled captures"}</small>
              </span>
              <ChevronDown className="demo-picker-icon" />
            </button>
            <button
              type="button"
              className={`demo-dropzone ${selectedGpsDataset ? "selected" : ""}`}
              onClick={() => setShowDemoPicker("gps")}
              disabled={isUploading}
            >
              <FileUp className="dropzone-icon" />
              <span className="demo-dropzone-copy">
                <strong>{selectedGpsDataset?.gpsUrl.split("/").pop() || "Select GPS metadata"}</strong>
                <small>{selectedGpsDataset ? "GPS JSON selected" : "Required flight metadata (.json)"}</small>
              </span>
              <ChevronDown className="demo-picker-icon" />
            </button>
          </div>
        ) : (
          <>
        <div className="section">
          <span className="section-label">Mandatory</span>

          <div className="field">
            <label className="field-label">Drone Video File</label>
            {renderDropzone(
              videoFile,
              setVideoFile,
              ".mp4,.mov",
              "Drag & drop your drone video",
              "1080p or 4K resolution, MP4 or MOV format",
              true,
              isUploading,
              videoRef
            )}
          </div>

          <div className="field">
            <label className="field-label">GPS & Flight Metadata</label>
            {renderDropzone(
              gpsFile,
              setGpsFile,
              ".srt,.csv,.json",
              "Drag & drop flight telemetry",
              "Time-stamped positional logs (.srt, .csv, or .json)",
              true,
              isUploading,
              gpsRef
            )}
          </div>
        </div>

        <button
          type="button"
          className="optional-toggle"
          onClick={() => setShowOptional(!showOptional)}
        >
          Optional Telemetry & Georeferencing
          {showOptional ? (
            <ChevronUp className="toggle-icon" />
          ) : (
            <ChevronDown className="toggle-icon" />
          )}
        </button>

        {showOptional && (
          <div className="section optional-section">
            <div className="field">
              <label className="field-label">RTK / PPK Correction Logs</label>
              {renderDropzone(
                rtkFile,
                setRtkFile,
                ".obs,.nav,.pos",
                "RTK / PPK Correction Logs",
                "",
                false,
                isUploading,
                rtkRef
              )}
            </div>

            <div className="field">
              <label className="field-label">IMU Telemetry</label>
              {renderDropzone(
                imuFile,
                setImuFile,
                ".csv,.json",
                "IMU Telemetry",
                "",
                false,
                isUploading,
                imuRef
              )}
            </div>

            <div className="field">
              <label className="field-label">
                Ground Control Points (GCPs)
              </label>
              {renderDropzone(
                gcpFile,
                setGcpFile,
                ".csv,.txt",
                "Ground Control Points (GCPs)",
                "",
                false,
                isUploading,
                gcpRef
              )}
            </div>

            <div className="field">
              <label className="field-label">Camera Calibration</label>
              {renderDropzone(
                calibFile,
                setCalibFile,
                ".json,.csv",
                "Camera Calibration",
                "",
                false,
                isUploading,
                calibRef
              )}
            </div>
          </div>
        )}
          </>
        )}

        {isUploading && (
          <div className="progress-section">
            <div className="progress-header">
              <span className="progress-label">Uploading in chunks</span>
              <span className="progress-bytes">
                {formatMB(sentBytes)} / {formatMB(totalBytes)} MB
              </span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="progress-fill"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="error-box">
            <AlertCircle className="error-icon" />
            <p>{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={BACKEND_ACTIVE
            ? !videoFile || !gpsFile || isUploading || !token
            : !selectedDataset || !selectedGpsDataset || isUploading || !token}
          className="submit-btn"
        >
          {isUploading ? (
            <>
              <div className="spinner" />
              Uploading {percent}%
            </>
          ) : (
            <>
              <FileUp className="btn-icon" />
              Start Pipeline
            </>
          )}
        </button>
      </form>

      {showDemoPicker && (
        <div
          className="demo-picker-backdrop"
          role="presentation"
          onClick={() => setShowDemoPicker(null)}
        >
          <div
            className="demo-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="demo-picker-header">
              <div>
                <span className="section-label">
                  {showDemoPicker === "video" ? "Source video" : "GPS metadata"}
                </span>
                <h3 id="demo-picker-title">
                  {showDemoPicker === "video" ? "Choose a flight capture" : "Choose matching GPS data"}
                </h3>
              </div>
              <button
                type="button"
                className="demo-picker-close"
                onClick={() => setShowDemoPicker(null)}
                aria-label="Close picker"
              >
                ×
              </button>
            </div>
            <div className="demo-picker-options">
              {DEMO_DATASETS.map((dataset) => (
                <button
                  type="button"
                  key={dataset.id}
                  className="demo-picker-option"
                  onClick={() => {
                    if (showDemoPicker === "video") setSelectedDataset(dataset);
                    else setSelectedGpsDataset(dataset);
                    setShowDemoPicker(null);
                  }}
                >
                  {showDemoPicker === "video" ? (
                    <video
                      className="demo-picker-thumb"
                      src={dataset.videoUrl}
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className="demo-picker-json">JSON</div>
                  )}
                  <span className="demo-picker-option-copy">
                    <strong>{dataset.label}</strong>
                    <small>
                      {showDemoPicker === "video"
                        ? dataset.videoUrl.split("/").pop()
                        : dataset.gpsUrl.split("/").pop()}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .upload-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          height: 100%;
          padding: clamp(1rem, 2vw, 1.5rem);
          overflow-y: auto;
        }
        .form-title {
          font-family: var(--font-display);
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0;
        }
        .title-icon {
          width: 18px;
          height: 18px;
          color: var(--accent);
        }
        .section {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .demo-datasets {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }
        .demo-dropzone {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          width: 100%;
          min-height: 74px;
          padding: 0.85rem 0.75rem;
          color: var(--ink-muted);
          background: rgba(255, 255, 255, 0.02);
          border: 1px dotted rgba(255, 255, 255, 0.22);
          border-radius: 4px;
          text-align: left;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .demo-dropzone:hover:not(:disabled),
        .demo-dropzone.selected {
          color: var(--ink);
          border-color: rgba(34, 197, 94, 0.55);
          background: rgba(34, 197, 94, 0.05);
        }
        .demo-dropzone:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .demo-dropzone-copy {
          display: flex;
          flex: 1;
          min-width: 0;
          flex-direction: column;
          gap: 0.2rem;
        }
        .demo-dropzone-copy strong {
          overflow: hidden;
          font-size: 0.72rem;
          font-weight: 500;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .demo-dropzone-copy small {
          color: var(--ink-muted);
          font-family: var(--font-mono);
          font-size: 0.55rem;
        }
        .demo-picker-icon {
          width: 14px;
          height: 14px;
          flex: 0 0 14px;
        }
        .demo-picker-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: rgba(0, 0, 0, 0.72);
        }
        .demo-picker-dialog {
          width: min(680px, 100%);
          max-height: min(680px, 90vh);
          overflow-y: auto;
          padding: 1.25rem;
          background: #101110;
          border: 1px solid #2b342c;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
        }
        .demo-picker-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .demo-picker-header h3 {
          margin: 0.35rem 0 0;
          color: var(--ink);
          font-family: var(--font-display);
          font-size: 1.2rem;
        }
        .demo-picker-close {
          width: 30px;
          height: 30px;
          color: var(--ink-muted);
          background: transparent;
          border: 1px solid var(--border);
          cursor: pointer;
          font-size: 1.25rem;
          line-height: 1;
        }
        .demo-picker-options {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .demo-picker-option {
          display: flex;
          min-width: 0;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
          color: var(--ink);
          text-align: left;
          background: #171a17;
          border: 1px solid #303830;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.15s;
        }
        .demo-picker-option:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
        }
        .demo-picker-thumb,
        .demo-picker-json {
          display: block;
          width: 100%;
          height: 120px;
          object-fit: cover;
          background: #050505;
        }
        .demo-picker-json {
          display: grid;
          place-items: center;
          color: #4ade80;
          font-family: var(--font-mono);
          font-size: 1.25rem;
        }
        .demo-picker-option-copy {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.7rem;
        }
        .demo-picker-option-copy strong {
          font-size: 0.72rem;
        }
        .demo-picker-option-copy small {
          overflow: hidden;
          color: var(--ink-muted);
          font-family: var(--font-mono);
          font-size: 0.52rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .demo-datasets-copy {
          color: var(--ink-muted);
          font-size: 0.72rem;
          line-height: 1.5;
          margin: 0;
        }
        .demo-dataset-list {
          display: grid;
          gap: 0.5rem;
        }
        .demo-dataset {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          width: 100%;
          padding: 0.8rem;
          text-align: left;
          color: var(--ink-muted);
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .demo-dataset:hover:not(:disabled) {
          color: var(--ink);
          border-color: var(--ink-muted);
        }
        .demo-dataset.selected {
          color: var(--ink);
          border-color: rgba(59, 130, 246, 0.7);
          background: rgba(59, 130, 246, 0.08);
        }
        .demo-dataset:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .demo-dataset-radio {
          width: 11px;
          height: 11px;
          flex: 0 0 11px;
          border: 1px solid var(--ink-muted);
          border-radius: 50%;
        }
        .demo-dataset.selected .demo-dataset-radio {
          border: 3px solid var(--accent);
        }
        .demo-dataset-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          min-width: 0;
        }
        .demo-dataset-info strong {
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 600;
        }
        .demo-dataset-info small {
          overflow: hidden;
          color: var(--ink-muted);
          font-family: var(--font-mono);
          font-size: 0.56rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .section-label {
          font-family: var(--font-mono);
          font-size: 0.55rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .field-label {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          color: var(--ink-muted);
        }
        .required {
          color: #ef4444;
          margin-left: 2px;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }
        .dropzone-icon {
          width: 18px;
          height: 18px;
          color: var(--ink-muted);
          flex-shrink: 0;
        }
        .dropzone:hover .dropzone-icon {
          color: var(--accent);
        }
        .dropzone-label {
          font-family: var(--font-body);
          font-size: 0.72rem;
          color: var(--ink);
        }
        .dropzone-desc {
          font-family: var(--font-mono);
          font-size: 0.55rem;
          letter-spacing: 0.06em;
          color: var(--ink-muted);
          margin-top: 0.15rem;
        }
        .file-selected {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .file-check {
          width: 14px;
          height: 14px;
          color: #22c55e;
          flex-shrink: 0;
        }
        .file-meta {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .file-name {
          font-family: var(--font-body);
          font-size: 0.68rem;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .file-size {
          font-family: var(--font-mono);
          font-size: 0.5rem;
          letter-spacing: 0.06em;
          color: var(--ink-muted);
          flex-shrink: 0;
        }
        .optional-toggle {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: none;
          border: none;
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          color: var(--ink-muted);
          cursor: pointer;
          padding: 0.4rem 0;
          transition: color 0.15s;
        }
        .optional-toggle:hover {
          color: var(--ink);
        }
        .toggle-icon {
          width: 12px;
          height: 12px;
        }
        .optional-section {
          padding-left: 0.75rem;
          border-left: 1px solid var(--border);
        }
        .progress-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .progress-label {
          font-family: var(--font-body);
          font-size: 0.8rem;
          color: var(--accent);
        }
        .progress-bytes {
          font-family: var(--font-mono);
          font-size: 0.7rem;
          letter-spacing: 0.06em;
          color: var(--ink-muted);
        }
        .progress-track {
          height: 4px;
          background: var(--border);
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.2s ease;
        }
        .error-box {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          padding: 0.8rem;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #fca5a5;
          font-size: 0.8rem;
        }
        .error-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .submit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          width: 100%;
          padding: 0.6rem;
          background: var(--ink);
          color: var(--background);
          border: none;
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.15s;
          margin-top: 0.4rem;
        }
        .submit-btn:hover:not(:disabled) {
          background: var(--accent);
        }
        .submit-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .btn-icon {
          width: 16px;
          height: 16px;
        }
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .spinner {
            animation: none;
          }
          .progress-fill {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
