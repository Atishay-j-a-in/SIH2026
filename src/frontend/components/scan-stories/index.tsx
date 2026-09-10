"use client";

import { useEffect, useRef } from "react";
import {
  AdvancedCaptureVisual,
  AdvancedSurveyVisual,
  AdvancedCompatibilityVisual,
} from "./new-visuals";

const STORIES = [
  {
    id: "capture",
    title: "Drone mapping without the hassle and cost",
    body: "No cumbersome software to download. Upload your drone data to the web, review the capture, and process the model with one click.",
    visual: "capture",
  },
  {
    id: "survey",
    title: "Surveying made simple",
    body: "Map large areas and structures, then create digital reconstructions your team can view, measure, and edit long after leaving the job site.",
    visual: "survey",
  },
  {
    id: "compatibility",
    title: "Effortless compatibility",
    body: "The 3rD Lens processes PNG, JPG, MP4, MOV, AVI, and M4V from most commercial drones. Host captures online and export into SketchUp, Unity, AutoCAD, and more.",
    visual: "compatibility",
  },
];

// Preserved original SVGs (do not delete)
export function DroneIcon() {
  return (
    <g className="drone">
      <line x1="-34" y1="0" x2="34" y2="0" />
      <line x1="0" y1="-22" x2="0" y2="22" />
      <rect x="-14" y="-8" width="28" height="16" />
      <circle cx="-44" cy="0" r="10" />
      <circle cx="44" cy="0" r="10" />
      <circle cx="0" cy="-32" r="10" />
      <circle cx="0" cy="32" r="10" />
      <path className="scan-cone" d="M -10 12 L -74 144 L 74 144 L 10 12 Z" />
    </g>
  );
}

export function CaptureSvg() {
  return (
    <svg viewBox="0 0 720 520" role="img" aria-label="Drone scanning a mapped site">
      <defs>
        <linearGradient id="scan-blue" x1="0" x2="1" y1="0" y2="1">
          <stop stopColor="#3b82f6" stopOpacity="0.5" />
          <stop offset="1" stopColor="#62e6ff" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <rect className="svg-bg" width="720" height="520" />
      <g className="grid-plane">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`h-${i}`} x1="82" y1={210 + i * 23} x2="638" y2={210 + i * 23} />
        ))}
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={`v-${i}`} x1={94 + i * 44} y1="198" x2={142 + i * 24} y2="458" />
        ))}
      </g>
      <g className="terrain-blocks">
        <path d="M164 344h96v68h-96z" />
        <path d="M286 286h78v126h-78z" />
        <path d="M396 324h118v88H396z" />
        <path d="M544 364h42v48h-42z" />
      </g>
      <path className="scan-line" d="M114 246 C250 194 438 205 612 242" />
      <g transform="translate(354 112)">
        <DroneIcon />
      </g>
      <g className="hud-pill" transform="translate(88 72)">
        <rect width="202" height="42" />
        <text x="18" y="27">UPLOAD READY</text>
      </g>
      <g className="hud-pill" transform="translate(430 72)">
        <rect width="202" height="42" />
        <text x="18" y="27">1 CLICK PROCESS</text>
      </g>
    </svg>
  );
}

export function SurveySvg() {
  return (
    <svg viewBox="0 0 720 520" role="img" aria-label="3D building reconstruction">
      <rect className="svg-bg" width="720" height="520" />
      <g className="orbit-rings" transform="translate(352 274)">
        <ellipse rx="214" ry="76" />
        <ellipse rx="166" ry="52" />
        <ellipse rx="98" ry="30" />
      </g>
      <g className="structure" transform="translate(172 138)">
        <path d="M80 190 L248 248 L414 190 L246 126 Z" />
        <path d="M80 190 L80 96 L246 32 L414 96 L414 190 L248 248 Z" />
        <path d="M80 96 L248 154 L414 96" />
        <path d="M248 154 L248 248" />
        <path d="M246 32 L246 126" />
        <path d="M128 114 L128 208" />
        <path d="M368 114 L368 208" />
        <path d="M168 80 L328 80" />
      </g>
      <g className="measurement-lines">
        <path d="M182 386 H536" />
        <path d="M182 374 v24" />
        <path d="M536 374 v24" />
        <text x="318" y="418">42.6 M</text>
      </g>
      <g transform="translate(510 92) scale(.72)">
        <DroneIcon />
      </g>
    </svg>
  );
}

export function CompatibilitySvg() {
  return (
    <svg viewBox="0 0 720 520" role="img" aria-label="File compatibility and export pipeline">
      <rect className="svg-bg" width="720" height="520" />
      <g className="format-nodes">
        {[
          [118, 116, "PNG"],
          [246, 88, "JPG"],
          [374, 116, "MP4"],
          [502, 88, "MOV"],
          [182, 396, "AVI"],
          [438, 396, "M4V"],
        ].map(([x, y, label]) => (
          <g key={label} transform={`translate(${x} ${y})`}>
            <rect x="-44" y="-20" width="88" height="40" />
            <text textAnchor="middle" y="6">{label}</text>
          </g>
        ))}
      </g>
      <g className="pipeline-lines">
        <path d="M118 116 L354 256 L502 88" />
        <path d="M246 88 L354 256 L182 396" />
        <path d="M374 116 L354 256 L438 396" />
      </g>
      <g className="model-core" transform="translate(354 256)">
        <path d="M-92 42 L0 -54 L106 28 L16 92 Z" />
        <path d="M-92 42 L-24 -8 L0 -54 L38 2 L106 28 L16 92 Z" />
        <circle r="44" />
        <text textAnchor="middle" y="7">3D</text>
      </g>
      <g className="export-stack" transform="translate(538 306)">
        <rect width="116" height="34" />
        <rect y="44" width="116" height="34" />
        <rect y="88" width="116" height="34" />
        <text x="16" y="23">SKP</text>
        <text x="16" y="67">FBX</text>
        <text x="16" y="111">DWG</text>
      </g>
    </svg>
  );
}

function StoryVisual({ visual }: { visual: string }) {
  if (visual === "survey") return <AdvancedSurveyVisual />;
  if (visual === "compatibility") return <AdvancedCompatibilityVisual />;
  return <AdvancedCaptureVisual />;
}

export function ScanStories() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -80px 0px" }
    );

    section.querySelectorAll(".scan-story").forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="scan-stories" aria-label="Drone mapping workflow">
      <div className="scan-stories-inner">
        {STORIES.map((story, index) => (
          <article
            key={story.id}
            className={`scan-story ${index % 2 === 1 ? "is-reversed" : ""}`}
          >
            <div className="story-visual">
              <StoryVisual visual={story.visual} />
            </div>
            <div className="story-copy">
              <span className="story-index">0{index + 1}</span>
              <h2>{story.title}</h2>
              <p>{story.body}</p>
            </div>
          </article>
        ))}
      </div>
      <style jsx>{`
        .scan-stories {
          position: relative;
          z-index: 5;
          background: var(--background);
          padding: clamp(4rem, 9vw, 9rem) clamp(1.5rem, 5vw, 6rem);
          overflow: hidden;
        }
        .scan-stories::before {
          content: "";
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(232, 232, 232, 0.16) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: linear-gradient(to bottom, transparent, black 12%, black 88%, transparent);
          opacity: 0.38;
          pointer-events: none;
        }
        .scan-stories-inner {
          position: relative;
          max-width: 1440px;
          margin: 0 auto;
          display: grid;
          gap: clamp(5rem, 9vw, 10rem);
        }
        .scan-story {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 0.92fr);
          gap: clamp(2rem, 6vw, 7rem);
          align-items: center;
          min-height: 68vh;
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .scan-story.is-reversed {
          grid-template-columns: minmax(320px, 0.92fr) minmax(0, 1fr);
        }
        .scan-story.is-reversed .story-visual {
          order: 2;
        }
        .scan-story.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .story-visual {
          min-height: clamp(320px, 38vw, 540px);
          border: 1px solid var(--border);
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(232, 232, 232, 0.02)), var(--surface);
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.025), 0 32px 80px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }
        .story-visual :global(svg) {
          width: 100%;
          height: 100%;
          min-height: clamp(320px, 38vw, 540px);
          display: block;
        }
        .story-copy {
          max-width: 650px;
        }
        .story-index {
          display: inline-block;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          letter-spacing: 0.22em;
          color: var(--accent);
          margin-bottom: 1.35rem;
        }
        .story-copy h2 {
          font-family: var(--font-display);
          font-size: clamp(2.4rem, 5.6vw, 5.2rem);
          line-height: 0.95;
          letter-spacing: -0.04em;
          color: var(--ink);
          text-wrap: balance;
          margin: 0 0 1.6rem;
        }
        .story-copy p {
          font-size: clamp(1rem, 1.5vw, 1.2rem);
          line-height: 1.7;
          color: var(--ink-muted);
          max-width: 62ch;
          text-wrap: pretty;
        }
        .story-visual :global(.svg-bg) {
          fill: #0a0a0a;
        }
        .story-visual :global(.grid-plane line),
        .story-visual :global(.orbit-rings ellipse),
        .story-visual :global(.measurement-lines path),
        .story-visual :global(.pipeline-lines path) {
          fill: none;
          stroke: rgba(232, 232, 232, 0.18);
          stroke-width: 1;
        }
        .story-visual :global(.terrain-blocks path),
        .story-visual :global(.structure path),
        .story-visual :global(.model-core path) {
          fill: rgba(232, 232, 232, 0.05);
          stroke: rgba(232, 232, 232, 0.62);
          stroke-width: 1.5;
        }
        .story-visual :global(.drone line),
        .story-visual :global(.drone rect),
        .story-visual :global(.drone circle) {
          fill: rgba(8, 8, 8, 0.9);
          stroke: #e8e8e8;
          stroke-width: 2;
        }
        .story-visual :global(.drone) {
          animation: droneDrift 5.5s cubic-bezier(0.45, 0, 0.2, 1) infinite alternate;
        }
        .story-visual :global(.scan-cone) {
          fill: url(#scan-blue);
          stroke: rgba(98, 230, 255, 0.45);
          stroke-width: 1;
          animation: scanPulse 2.4s ease-out infinite;
        }
        .story-visual :global(.scan-line) {
          fill: none;
          stroke: var(--accent);
          stroke-width: 2;
          stroke-dasharray: 18 16;
          animation: scanDash 2.8s linear infinite;
        }
        .story-visual :global(.hud-pill rect),
        .story-visual :global(.format-nodes rect),
        .story-visual :global(.export-stack rect) {
          fill: rgba(8, 8, 8, 0.88);
          stroke: rgba(232, 232, 232, 0.32);
        }
        .story-visual :global(text) {
          fill: #e8e8e8;
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.12em;
        }
        .story-visual :global(.orbit-rings) {
          animation: orbitTilt 6s ease-in-out infinite alternate;
          transform-origin: 352px 274px;
        }
        .story-visual :global(.structure) {
          animation: modelFloat 4.8s ease-in-out infinite alternate;
        }
        .story-visual :global(.measurement-lines text) {
          fill: var(--accent);
        }
        .story-visual :global(.pipeline-lines path) {
          stroke: rgba(59, 130, 246, 0.65);
          stroke-dasharray: 10 14;
          animation: scanDash 3.4s linear infinite;
        }
        .story-visual :global(.model-core circle) {
          fill: rgba(59, 130, 246, 0.16);
          stroke: rgba(98, 230, 255, 0.78);
          stroke-width: 1.5;
          animation: scanPulse 2.6s ease-out infinite;
        }
        @keyframes droneDrift {
          from { transform: translate(-20px, -8px); }
          to { transform: translate(24px, 12px); }
        }
        @keyframes scanPulse {
          0%, 100% { opacity: 0.32; }
          50% { opacity: 0.88; }
        }
        @keyframes scanDash {
          to { stroke-dashoffset: -68; }
        }
        @keyframes orbitTilt {
          from { transform: rotate(-2deg); }
          to { transform: rotate(2deg); }
        }
        @keyframes modelFloat {
          from { transform: translate(172px, 146px); }
          to { transform: translate(172px, 124px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .scan-story {
            opacity: 1;
            transform: none;
            transition: none;
          }
          .story-visual :global(*) {
            animation: none !important;
          }
        }
        @media (max-width: 900px) {
          .scan-story,
          .scan-story.is-reversed {
            grid-template-columns: 1fr;
            min-height: auto;
          }
          .scan-story.is-reversed .story-visual {
            order: 0;
          }
        }
      `}</style>
    </section>
  );
}
