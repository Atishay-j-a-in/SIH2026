"use client";

import React from "react";

/* -------------------------------------------------------------------------- */
/* 1. ADVANCED DRONE CAPTURE & PATH TRACING VISUAL (W01 -> W05)               */
/* -------------------------------------------------------------------------- */

export function AdvancedCaptureVisual() {
  const flightPathD = "M 90,320 C 220,160 340,340 480,200 C 580,90 660,240 730,170";

  return (
    <div className="svg-container">
      <svg
        viewBox="0 0 800 540"
        role="img"
        aria-label="Autonomous drone tracing flight path from waypoint W01 to W05 and scanning terrain"
        className="story-svg"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="cap-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#080c14" />
            <stop offset="50%" stopColor="#0a101d" />
            <stop offset="100%" stopColor="#05080f" />
          </linearGradient>

          <linearGradient id="cap-grid-fade" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
          </linearGradient>

          <linearGradient id="cap-scan-cone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.75" />
            <stop offset="35%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="85%" stopColor="#0284c7" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
          </linearGradient>

          <radialGradient id="cap-drone-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="1" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="cap-gcp-pulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>

          <filter id="cap-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background & Precision Grid */}
        <rect width="800" height="540" fill="url(#cap-bg)" />

        <g opacity="0.1" stroke="#60a5fa" strokeWidth="0.5">
          {Array.from({ length: 17 }).map((_, i) => (
            <line key={`bg-v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="540" />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={`bg-h-${i}`} x1="0" y1={i * 45} x2="800" y2={i * 45} />
          ))}
        </g>

        {/* 3D Isometric Elevation Terrain Plane */}
        <g className="cap-terrain-system" transform="translate(400, 370)">
          {/* Isometric Base Grid */}
          <g stroke="url(#cap-grid-fade)" strokeWidth="1" fill="none">
            {[-120, -80, -40, 0, 40, 80, 120].map((y, i) => (
              <path
                key={`iso-h-${i}`}
                d={`M -330 ${y * 0.58 + 40} L 0 ${y * 0.58 - 110} L 330 ${y * 0.58 + 40} L 0 ${y * 0.58 + 190} Z`}
                strokeOpacity={0.25 + (i % 2) * 0.15}
              />
            ))}
            {[-240, -180, -120, -60, 0, 60, 120, 180, 240].map((x, i) => (
              <line
                key={`iso-d1-${i}`}
                x1={x}
                y1={-60 + (x < 0 ? -x * 0.35 : x * 0.35)}
                x2={x * 0.4}
                y2={150 - Math.abs(x) * 0.2}
                strokeOpacity="0.3"
              />
            ))}
          </g>

          {/* Topographic Contour Elevation Mounds */}
          <g className="cap-contours">
            <path
              d="M -240 20 C -180 -40, -90 -30, -30 10 C 30 50, 120 20, 210 -10 C 270 -30, 290 40, 220 70 C 140 100, -80 110, -180 80 Z"
              fill="rgba(59, 130, 246, 0.04)"
              stroke="#3b82f6"
              strokeWidth="1"
              strokeOpacity="0.4"
            />
            <path
              d="M -190 0 C -140 -40, -60 -30, -10 0 C 40 30, 100 10, 160 -15 C 210 -35, 220 20, 170 45 C 110 70, -50 80, -140 55 Z"
              fill="rgba(59, 130, 246, 0.06)"
              stroke="#60a5fa"
              strokeWidth="1"
              strokeOpacity="0.5"
            />
            <path
              d="M -130 -15 C -90 -45, -30 -35, 10 -10 C 50 15, 90 0, 130 -15 C 160 -25, 160 10, 120 30 C 70 50, -40 55, -100 35 Z"
              fill="rgba(59, 130, 246, 0.09)"
              stroke="#38bdf8"
              strokeWidth="1.2"
              strokeOpacity="0.7"
            />
          </g>

          {/* 3D Isometric Buildings on Ground */}
          <g className="cap-building" transform="translate(-170, -20)">
            <polygon points="0,0 70,-35 140,0 70,35" fill="rgba(0, 0, 0, 0.5)" />
            <polygon points="0,0 0,-70 70,-35 70,35" fill="rgba(15, 23, 42, 0.9)" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.6" />
            <polygon points="70,35 70,-35 140,-70 140,0" fill="rgba(30, 41, 59, 0.85)" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.6" />
            <polygon points="0,-70 70,-105 140,-70 70,-35" fill="rgba(59, 130, 246, 0.25)" stroke="#00f0ff" strokeWidth="1.2" />
            <line x1="35" y1="-52" x2="105" y2="-88" stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.7" />
            <line x1="35" y1="-88" x2="105" y2="-52" stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.7" />
          </g>

          <g className="cap-building" transform="translate(10, -70)">
            <polygon points="0,0 90,-45 180,0 90,45" fill="rgba(0, 0, 0, 0.6)" />
            <polygon points="0,0 0,-110 90,-65 90,45" fill="rgba(15, 23, 42, 0.92)" stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.7" />
            <polygon points="90,45 90,-65 180,-110 180,0" fill="rgba(30, 41, 59, 0.88)" stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.7" />
            <polygon points="0,-110 90,-155 180,-110 90,-65" fill="rgba(59, 130, 246, 0.3)" stroke="#00f0ff" strokeWidth="1.4" />
            <line x1="90" y1="-155" x2="90" y2="-180" stroke="#00f0ff" strokeWidth="1.5" />
            <circle cx="90" cy="-180" r="3" fill="#00f0ff" filter="url(#cap-glow)" />
          </g>

          <g className="cap-building" transform="translate(150, 10)">
            <polygon points="0,0 60,-30 120,0 60,30" fill="rgba(0, 0, 0, 0.5)" />
            <polygon points="0,0 0,-45 60,-15 60,30" fill="rgba(15, 23, 42, 0.85)" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.5" />
            <polygon points="60,30 60,-15 120,-45 120,0" fill="rgba(30, 41, 59, 0.8)" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.5" />
            <polygon points="0,-45 60,-75 120,-45 60,-15" fill="rgba(59, 130, 246, 0.18)" stroke="#38bdf8" strokeWidth="1" />
          </g>

          {/* Ground Control Points Targets */}
          <g transform="translate(-190, 70)">
            <circle cx="0" cy="0" r="16" fill="url(#cap-gcp-pulse)" className="cap-ping-ring" />
            <circle cx="0" cy="0" r="6" fill="none" stroke="#00f0ff" strokeWidth="1" />
            <circle cx="0" cy="0" r="2.5" fill="#00f0ff" />
          </g>
          <g transform="translate(200, 85)">
            <circle cx="0" cy="0" r="16" fill="url(#cap-gcp-pulse)" className="cap-ping-ring-delayed" />
            <circle cx="0" cy="0" r="6" fill="none" stroke="#00f0ff" strokeWidth="1" />
            <circle cx="0" cy="0" r="2.5" fill="#00f0ff" />
          </g>

          {/* Point Cloud Shimmer Matrix */}
          <g fill="#00f0ff" opacity="0.85">
            {[
              [-120, -10], [-90, -30], [-70, 15], [-40, -15], [-20, 25],
              [40, -20], [70, 20], [110, -10], [130, 30], [160, -35],
              [-140, 40], [-80, 55], [0, 65], [60, 75], [120, 60],
              [-10, -120], [40, -110], [80, -95], [100, -140], [-50, -80]
            ].map(([px, py], idx) => (
              <circle
                key={`pt-${idx}`}
                cx={px}
                cy={py}
                r="1.5"
                className="cap-cloud-pt"
                style={{ animationDelay: `${(idx * 0.18) % 2.5}s` }}
              />
            ))}
          </g>

          {/* Moving Sweeping Laser Line */}
          <ellipse cx="0" cy="10" rx="260" ry="110" fill="none" stroke="#00f0ff" strokeWidth="1.5" strokeDasharray="8 8" className="cap-laser-sweep" />
        </g>

        {/* FLIGHT TRAJECTORY PATH & WAYPOINTS W01 to W05 */}
        <g className="cap-flight-path-system">
          {/* Main Flight Path Spline */}
          <path
            d={flightPathD}
            fill="none"
            stroke="#1e293b"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d={flightPathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeDasharray="8 8"
            className="cap-path-stream"
          />

          {/* Waypoints W01 to W05 */}
          {[
            { id: "W01", x: 90, y: 320 },
            { id: "W02", x: 220, y: 220 },
            { id: "W03", x: 370, y: 270 },
            { id: "W04", x: 520, y: 160 },
            { id: "W05", x: 730, y: 170 },
          ].map((wp) => (
            <g key={wp.id} transform={`translate(${wp.x}, ${wp.y})`}>
              <circle cx="0" cy="0" r="14" fill="none" stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.4" />
              <circle cx="0" cy="0" r="5" fill="#070d18" stroke="#00f0ff" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="2" fill="#00f0ff" />
              <text
                x="0"
                y="-10"
                textAnchor="middle"
                fill="#00f0ff"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fontWeight="bold"
                letterSpacing="0.05em"
              >
                {wp.id}
              </text>
            </g>
          ))}
        </g>

        {/* DRONE TRACING THE PATH FROM W01 TO W05 (Smooth & Calm Gliding) */}
        <g className="cap-drone-tracker">
          {/* Volumetric LiDAR / Optical Sensor Frustum */}
          <polygon
            points="0,14 -120,180 120,180"
            fill="url(#cap-scan-cone)"
            className="cap-frustum-cone"
          />
          <line x1="0" y1="14" x2="-120" y2="180" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.4" />
          <line x1="0" y1="14" x2="120" y2="180" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.4" />
          <ellipse cx="0" cy="180" rx="120" ry="24" fill="none" stroke="#00f0ff" strokeWidth="1" strokeDasharray="4 4" strokeOpacity="0.6" />

          {/* Clean Aerospace Drone Chassis (No buzzing propellers) */}
          <g className="cap-drone-chassis">
            {/* 4 Carbon Motor Struts */}
            <line x1="-36" y1="-10" x2="36" y2="10" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
            <line x1="-36" y1="10" x2="36" y2="-10" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
            <line x1="-36" y1="-10" x2="36" y2="10" stroke="#00f0ff" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="-36" y1="10" x2="36" y2="-10" stroke="#00f0ff" strokeWidth="0.8" strokeOpacity="0.5" />

            {/* 4 Sleek Motor Nacelles with Soft Beacons */}
            {[
              [-36, -10],
              [36, -10],
              [-36, 10],
              [36, 10],
            ].map(([mx, my], mi) => (
              <g key={`motor-${mi}`} transform={`translate(${mx}, ${my})`}>
                {/* Aero Pod Disc */}
                <circle cx="0" cy="0" r="9" fill="rgba(15, 23, 42, 0.9)" stroke="#475569" strokeWidth="1" />
                <circle cx="0" cy="0" r="5" fill="none" stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.6" />
                <circle cx="0" cy="0" r="2" fill={mi === 0 ? "#ef4444" : mi === 1 ? "#22c55e" : "#00f0ff"} />
              </g>
            ))}

            {/* Central Drone Body */}
            <rect x="-18" y="-10" width="36" height="20" rx="6" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.5" />
            <line x1="-10" y1="0" x2="10" y2="0" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.8" />
            
            {/* Gimbal Camera with glowing aperture */}
            <circle cx="0" cy="10" r="5" fill="#020617" stroke="#00f0ff" strokeWidth="1.2" />
            <circle cx="0" cy="10" r="2.5" fill="url(#cap-drone-core)" filter="url(#cap-glow)" />
          </g>

          {/* Smooth motion gliding level along W01 -> W05 and back */}
          <animateMotion
            path={flightPathD}
            dur="9s"
            repeatCount="indefinite"
            keyPoints="0; 1; 0"
            keyTimes="0; 0.5; 1"
            calcMode="spline"
            keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
          />
        </g>
      </svg>

      <style jsx>{`
        .svg-container {
          width: 100%;
          height: 100%;
          position: relative;
        }
        .story-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .cap-frustum-cone {
          animation: frustumPulse 3s ease-in-out infinite alternate;
        }
        .cap-path-stream {
          animation: pathDash 2.4s linear infinite;
        }
        .cap-laser-sweep {
          animation: laserSweep 4s ease-in-out infinite alternate;
          transform-origin: center;
        }
        .cap-ping-ring {
          animation: pingPulse 2.4s cubic-bezier(0, 0.2, 0.8, 1) infinite;
          transform-origin: center;
        }
        .cap-ping-ring-delayed {
          animation: pingPulse 2.4s cubic-bezier(0, 0.2, 0.8, 1) infinite;
          animation-delay: 1.2s;
          transform-origin: center;
        }
        .cap-cloud-pt {
          animation: ptShimmer 3s ease-in-out infinite alternate;
        }

        @keyframes frustumPulse {
          0% {
            opacity: 0.4;
          }
          100% {
            opacity: 0.85;
          }
        }
        @keyframes pathDash {
          to {
            stroke-dashoffset: -32;
          }
        }
        @keyframes laserSweep {
          0% {
            transform: translateY(-30px) scale(0.92);
            opacity: 0.3;
          }
          100% {
            transform: translateY(30px) scale(1.08);
            opacity: 0.9;
          }
        }
        @keyframes pingPulse {
          0% {
            r: 3;
            opacity: 0.9;
          }
          100% {
            r: 22;
            opacity: 0;
          }
        }
        @keyframes ptShimmer {
          0% {
            opacity: 0.2;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1.6);
          }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. ADVANCED SURVEYING VISUAL: BUILDING IN CENTER & DRONE REVOLVING AROUND  */
/* -------------------------------------------------------------------------- */

export function AdvancedSurveyVisual() {
  // Raised high-altitude elliptical 3D orbit around the central building
  const orbitPathD = "M 400,55 C 650,55 660,235 400,235 C 140,235 150,55 400,55 Z";

  return (
    <div className="svg-container">
      <svg
        viewBox="0 0 800 540"
        role="img"
        aria-label="Surveying digital twin structure with drone revolving higher around central building"
        className="story-svg"
      >
        <defs>
          <linearGradient id="sur-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#080c14" />
            <stop offset="60%" stopColor="#09111e" />
            <stop offset="100%" stopColor="#05080e" />
          </linearGradient>

          <linearGradient id="sur-facade-left" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#091322" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="sur-facade-right" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="sur-glass-tint" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.3" />
          </linearGradient>

          <radialGradient id="sur-drone-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="1" />
            <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="sur-beam-cone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
          </linearGradient>

          <filter id="sur-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <rect width="800" height="540" fill="url(#sur-bg)" />

        {/* Spatial Blueprint Grid */}
        <g opacity="0.1" stroke="#38bdf8" strokeWidth="0.5">
          {Array.from({ length: 17 }).map((_, i) => (
            <line key={`sur-bg-v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="540" />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={`sur-bg-h-${i}`} x1="0" y1={i * 45} x2="800" y2={i * 45} />
          ))}
        </g>

        {/* 360° Photogrammetric Orbit Trajectory Track (Raised Higher) */}
        <g className="sur-orbit-system">
          {/* Main Orbit Ring Guide */}
          <path
            d={orbitPathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            strokeOpacity="0.4"
            className="sur-orbit-line"
          />
          {/* Outer auxiliary orbit ring */}
          <ellipse
            cx="400"
            cy="145"
            rx="290"
            ry="90"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="1"
            strokeDasharray="10 8"
            strokeOpacity="0.2"
          />
        </g>

        {/* PROMINENT CENTRAL 3D ISOMETRIC BUILDING STRUCTURE */}
        <g className="sur-center-building" transform="translate(400, 310)">
          {/* Foundation Ground Slab */}
          <polygon
            points="-180,40 0,-50 180,40 0,130"
            fill="rgba(15, 23, 42, 0.75)"
            stroke="#1e293b"
            strokeWidth="1.5"
          />
          <polygon
            points="-180,40 -180,55 0,145 180,55 180,40 0,130"
            fill="rgba(2, 6, 23, 0.9)"
            stroke="#334155"
            strokeWidth="1"
          />

          {/* Lower Atrium / Left Wing */}
          <g transform="translate(-100, 0)">
            <polygon points="0,0 0,-70 70,-35 70,35" fill="url(#sur-facade-left)" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.6" />
            <polygon points="70,35 70,-35 140,-70 140,0" fill="url(#sur-facade-right)" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.6" />
            <polygon points="0,-70 70,-105 140,-70 70,-35" fill="url(#sur-glass-tint)" stroke="#00f0ff" strokeWidth="1.2" />
            {[-50, -30, -10, 10].map((yOff, i) => (
              <line key={`mul-l-${i}`} x1="15" y1={yOff - 10} x2="55" y2={yOff + 10} stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.4" />
            ))}
          </g>

          {/* Main Central High-Rise Tower */}
          <g transform="translate(-20, -50)">
            {/* Left Solid/Glazed Facade */}
            <polygon points="-70,35 -70,-160 50,-100 50,95" fill="url(#sur-facade-left)" stroke="#60a5fa" strokeWidth="1.2" />
            {/* Right Solid/Glazed Facade */}
            <polygon points="50,95 50,-100 170,-160 170,35" fill="url(#sur-facade-right)" stroke="#60a5fa" strokeWidth="1.2" />
            {/* Rooftop */}
            <polygon points="-70,-160 50,-220 170,-160 50,-100" fill="url(#sur-glass-tint)" stroke="#00f0ff" strokeWidth="1.5" />
            
            {/* Rooftop survey datum ring */}
            <ellipse cx="50" cy="-160" rx="35" ry="16" fill="none" stroke="#00f0ff" strokeWidth="1.2" strokeDasharray="4 3" />
            <circle cx="50" cy="-160" r="3" fill="#00f0ff" />

            {/* Floor Slabs */}
            {[-130, -100, -70, -40, -10, 20, 50].map((levelY, li) => (
              <g key={`floor-${li}`}>
                <line x1="-70" y1={levelY - 15} x2="50" y2={levelY + 45} stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.5" />
                <line x1="50" y1={levelY + 45} x2="170" y2={levelY - 15} stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.5" />
              </g>
            ))}

            {/* Vertical Mullion Columns */}
            {[-40, -10, 20].map((colX, ci) => (
              <line key={`col-l-${ci}`} x1={colX} y1={-140 + ci * 15} x2={colX} y2={55 + ci * 15} stroke="#00f0ff" strokeWidth="0.7" strokeOpacity="0.6" />
            ))}
            {[80, 110, 140].map((colX, ci) => (
              <line key={`col-r-${ci}`} x1={colX} y1={-80 - ci * 15} x2={colX} y2={115 - ci * 15} stroke="#00f0ff" strokeWidth="0.7" strokeOpacity="0.6" />
            ))}

            {/* Glowing Structural Vertex Nodes */}
            {[
              [-70, -160], [50, -220], [170, -160], [50, -100],
              [-70, 35], [50, 95], [170, 35],
              [-70, -60], [50, 0], [170, -60]
            ].map(([vx, vy], vi) => (
              <circle key={`vnode-${vi}`} cx={vx} cy={vy} r="2.5" fill="#00f0ff" filter="url(#sur-glow)" className="sur-vertex-pulse" />
            ))}
          </g>

          {/* Clean Geometric Dimension Calipers */}
          <g transform="translate(-160, 105)">
            <line x1="0" y1="-20" x2="0" y2="10" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="360" y1="-20" x2="360" y2="10" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="0" y1="5" x2="360" y2="5" stroke="#00f0ff" strokeWidth="1.2" />
            <path d="M 0 2 L 6 5 L 0 8 Z" fill="#00f0ff" />
            <path d="M 360 2 L 354 5 L 360 8 Z" fill="#00f0ff" />
          </g>

          <g transform="translate(195, -210)">
            <line x1="-30" y1="0" x2="10" y2="0" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="-30" y1="270" x2="10" y2="270" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="5" y1="0" x2="5" y2="270" stroke="#00f0ff" strokeWidth="1.2" />
            <path d="M 2 0 L 5 6 L 8 0 Z" fill="#00f0ff" />
            <path d="M 2 270 L 5 264 L 8 270 Z" fill="#00f0ff" />
          </g>
        </g>

        {/* DRONE CALMLY REVOLVING HIGHER AROUND THE CENTRAL BUILDING */}
        <g className="sur-revolving-drone">
          {/* Dynamic Laser Frustum pointing down towards the central building */}
          <polygon
            points="0,10 -85,170 85,170"
            fill="url(#sur-beam-cone)"
            className="sur-beam-pulse"
          />
          <line x1="0" y1="10" x2="-85" y2="170" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.5" />
          <line x1="0" y1="10" x2="85" y2="170" stroke="#00f0ff" strokeWidth="1" strokeOpacity="0.5" />
          <line x1="0" y1="10" x2="0" y2="170" stroke="#38bdf8" strokeWidth="1" strokeDasharray="3 3" />

          {/* Clean Revolving Drone Body */}
          <g className="sur-drone-assembly">
            <line x1="-30" y1="-8" x2="30" y2="8" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
            <line x1="-30" y1="8" x2="30" y2="-8" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
            <line x1="-30" y1="-8" x2="30" y2="8" stroke="#00f0ff" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="-30" y1="8" x2="30" y2="-8" stroke="#00f0ff" strokeWidth="0.8" strokeOpacity="0.5" />

            {[
              [-30, -8],
              [30, -8],
              [-30, 8],
              [30, 8],
            ].map(([mx, my], mi) => (
              <g key={`motor-sur-${mi}`} transform={`translate(${mx}, ${my})`}>
                <circle cx="0" cy="0" r="8" fill="rgba(15, 23, 42, 0.9)" stroke="#475569" strokeWidth="1" />
                <circle cx="0" cy="0" r="4.5" fill="none" stroke="#38bdf8" strokeWidth="0.8" strokeOpacity="0.6" />
                <circle cx="0" cy="0" r="1.5" fill={mi === 0 ? "#ef4444" : mi === 1 ? "#22c55e" : "#00f0ff"} />
              </g>
            ))}

            {/* Fuselage & Camera Lens */}
            <rect x="-15" y="-8" width="30" height="16" rx="5" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.2" />
            <circle cx="0" cy="8" r="4.5" fill="#020617" stroke="#00f0ff" strokeWidth="1" />
            <circle cx="0" cy="8" r="2" fill="url(#sur-drone-core)" filter="url(#sur-glow)" />
          </g>

          {/* Smooth, level orbital revolution around building */}
          <animateMotion
            path={orbitPathD}
            dur="8s"
            repeatCount="indefinite"
          />
        </g>
      </svg>

      <style jsx>{`
        .svg-container {
          width: 100%;
          height: 100%;
          position: relative;
        }
        .story-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .sur-orbit-line {
          animation: orbitStream 3s linear infinite;
        }
        .sur-beam-pulse {
          animation: beamShimmer 3s ease-in-out infinite alternate;
        }
        .sur-vertex-pulse {
          animation: vPulse 2.8s ease-in-out infinite alternate;
        }

        @keyframes orbitStream {
          to {
            stroke-dashoffset: -24;
          }
        }
        @keyframes beamShimmer {
          0% {
            opacity: 0.35;
          }
          100% {
            opacity: 0.85;
          }
        }
        @keyframes vPulse {
          0% {
            opacity: 0.3;
            r: 2;
          }
          100% {
            opacity: 1;
            r: 3.2;
          }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. ADVANCED COMPATIBILITY VISUAL: FORMATS -> 3D CORE -> SOFTWARES          */
/* -------------------------------------------------------------------------- */

export function AdvancedCompatibilityVisual() {
  const formats = [
    { label: "MP4", color: "#38bdf8", y: 100 },
    { label: "MOV", color: "#60a5fa", y: 160 },
    { label: "JPG", color: "#00f0ff", y: 220 },
    { label: "PNG", color: "#38bdf8", y: 280 },
    { label: "RAW", color: "#818cf8", y: 340 },
    { label: "AVI", color: "#00f0ff", y: 400 },
  ];

  const softwares = [
    { label: "AutoCAD", color: "#ef4444", y: 100 },
    { label: "SketchUp", color: "#3b82f6", y: 160 },
    { label: "Unity", color: "#a855f7", y: 220 },
    { label: "Unreal", color: "#f97316", y: 280 },
    { label: "Blender", color: "#00f0ff", y: 340 },
    { label: "Revit", color: "#22c55e", y: 400 },
  ];

  return (
    <div className="svg-container">
      <svg
        viewBox="0 0 800 540"
        role="img"
        aria-label="Universal media formats processing through 3D synthesis core to industry software"
        className="story-svg"
      >
        <defs>
          <linearGradient id="pipe-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#080c14" />
            <stop offset="50%" stopColor="#0a1220" />
            <stop offset="100%" stopColor="#05080e" />
          </linearGradient>

          <linearGradient id="pipe-core-reactor" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.05" />
          </linearGradient>

          <linearGradient id="pipe-stream-cyan" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#00f0ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.3" />
          </linearGradient>

          <linearGradient id="pipe-stream-export" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.8" />
          </linearGradient>

          <radialGradient id="pipe-glow-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#3b82f6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>

          <filter id="pipe-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <rect width="800" height="540" fill="url(#pipe-bg)" />

        {/* Micro Circuit Grid */}
        <g opacity="0.1" stroke="#38bdf8" strokeWidth="0.5">
          {Array.from({ length: 17 }).map((_, i) => (
            <line key={`pipe-bg-v-${i}`} x1={i * 50} y1="0" x2={i * 50} y2="540" />
          ))}
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={`pipe-bg-h-${i}`} x1="0" y1={i * 45} x2="800" y2={i * 45} />
          ))}
        </g>

        {/* INGESTION BUS HIGHWAYS (Left Formats -> Center Core) */}
        <g className="pipe-bus-ingest">
          {formats.map((f, i) => (
            <g key={`in-bus-${i}`}>
              <path
                d={`M 140 ${f.y + 18} C 240 ${f.y + 18}, 280 270, 350 270`}
                fill="none"
                stroke="#1e293b"
                strokeWidth="2"
              />
              <path
                d={`M 140 ${f.y + 18} C 240 ${f.y + 18}, 280 270, 350 270`}
                fill="none"
                stroke="url(#pipe-stream-cyan)"
                strokeWidth="2"
                strokeDasharray="8 12"
                className="pipe-dash-stream-in"
                style={{ animationDelay: `${i * 0.22}s` }}
              />
            </g>
          ))}
        </g>

        {/* EXPORT BUS HIGHWAYS (Center Core -> Right Softwares) */}
        <g className="pipe-bus-export">
          {softwares.map((s, i) => (
            <g key={`out-bus-${i}`}>
              <path
                d={`M 450 270 C 520 270, 560 ${s.y + 18}, 650 ${s.y + 18}`}
                fill="none"
                stroke="#1e293b"
                strokeWidth="2"
              />
              <path
                d={`M 450 270 C 520 270, 560 ${s.y + 18}, 650 ${s.y + 18}`}
                fill="none"
                stroke="url(#pipe-stream-export)"
                strokeWidth="2"
                strokeDasharray="8 12"
                className="pipe-dash-stream-out"
                style={{ animationDelay: `${i * 0.22}s` }}
              />
            </g>
          ))}
        </g>

        {/* LEFT COLUMN: FILE FORMAT LABELS */}
        <g className="pipe-formats-col" transform="translate(45, 0)">
          {formats.map((f) => (
            <g key={f.label} transform={`translate(0, ${f.y})`}>
              <rect
                x="0"
                y="0"
                width="95"
                height="36"
                rx="6"
                fill="#070d18"
                stroke="#1e293b"
                strokeWidth="1"
              />
              <rect x="0" y="0" width="3.5" height="36" rx="1.5" fill={f.color} />
              
              <text
                x="14"
                y="22"
                fill="#ffffff"
                fontSize="13"
                fontFamily="var(--font-mono)"
                fontWeight="bold"
                letterSpacing="0.05em"
              >
                {f.label}
              </text>
              
              <circle cx="82" cy="18" r="3" fill="#22c55e" className="pipe-led-pulse" />
            </g>
          ))}
        </g>

        {/* CENTER: 3D RECONSTRUCTION NEURAL CORE */}
        <g className="pipe-core-group" transform="translate(400, 270)">
          {/* Rotating Outer Gyro Ring 1 */}
          <circle
            cx="0"
            cy="0"
            r="94"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="14 10 4 10"
            strokeOpacity="0.6"
            className="pipe-ring-cw"
          />

          {/* Rotating Outer Gyro Ring 2 */}
          <circle
            cx="0"
            cy="0"
            r="80"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="1"
            strokeDasharray="8 6"
            strokeOpacity="0.5"
            className="pipe-ring-ccw"
          />

          <circle cx="0" cy="0" r="70" fill="url(#pipe-core-reactor)" />
          <circle cx="0" cy="0" r="28" fill="url(#pipe-glow-core)" filter="url(#pipe-glow)" className="pipe-energy-pulse" />

          {/* 3D Rotating Isometric Polyhedral Mesh */}
          <g className="pipe-polyhedron-mesh">
            <polygon points="0,-48 42,-24 42,24 0,48 -42,24 -42,-24" fill="rgba(15, 23, 42, 0.7)" stroke="#00f0ff" strokeWidth="1.5" />
            <line x1="0" y1="-48" x2="0" y2="48" stroke="#38bdf8" strokeWidth="1.2" />
            <line x1="-42" y1="-24" x2="42" y2="24" stroke="#38bdf8" strokeWidth="1.2" />
            <line x1="-42" y1="24" x2="42" y2="-24" stroke="#38bdf8" strokeWidth="1.2" />
            
            <polygon points="0,-24 24,0 0,24 -24,0" fill="rgba(59, 130, 246, 0.35)" stroke="#ffffff" strokeWidth="1.2" />
            
            {[
              [0, -48], [42, -24], [42, 24], [0, 48], [-42, 24], [-42, -24],
              [0, 0], [0, -24], [24, 0], [0, 24], [-24, 0]
            ].map(([vx, vy], vi) => (
              <circle key={`core-v-${vi}`} cx={vx} cy={vy} r="2.5" fill="#00f0ff" />
            ))}
          </g>
        </g>

        {/* RIGHT COLUMN: SOFTWARE DESTINATION LABELS */}
        <g className="pipe-software-col" transform="translate(650, 0)">
          {softwares.map((s) => (
            <g key={s.label} transform={`translate(0, ${s.y})`}>
              <rect
                x="0"
                y="0"
                width="110"
                height="36"
                rx="6"
                fill="#070d18"
                stroke="#1e293b"
                strokeWidth="1"
              />
              <rect x="0" y="0" width="3.5" height="36" rx="1.5" fill={s.color} />

              <text
                x="14"
                y="22"
                fill="#ffffff"
                fontSize="12"
                fontFamily="var(--font-mono)"
                fontWeight="bold"
                letterSpacing="0.03em"
              >
                {s.label}
              </text>

              <circle cx="98" cy="18" r="3" fill="#22c55e" className="pipe-led-pulse" />
            </g>
          ))}
        </g>
      </svg>

      <style jsx>{`
        .svg-container {
          width: 100%;
          height: 100%;
          position: relative;
        }
        .story-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .pipe-ring-cw {
          animation: ringRotateCW 16s linear infinite;
          transform-origin: center;
        }
        .pipe-ring-ccw {
          animation: ringRotateCCW 12s linear infinite;
          transform-origin: center;
        }
        .pipe-energy-pulse {
          animation: corePulse 2.4s ease-in-out infinite alternate;
          transform-origin: center;
        }
        .pipe-polyhedron-mesh {
          animation: meshFloat 5s ease-in-out infinite alternate;
          transform-origin: center;
        }
        .pipe-dash-stream-in {
          animation: streamIn 1.8s linear infinite;
        }
        .pipe-dash-stream-out {
          animation: streamOut 1.8s linear infinite;
        }
        .pipe-led-pulse {
          animation: ledGlow 1.2s ease-in-out infinite alternate;
        }

        @keyframes ringRotateCW {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes ringRotateCCW {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(-360deg);
          }
        }
        @keyframes corePulse {
          0% {
            opacity: 0.4;
            transform: scale(0.85);
          }
          100% {
            opacity: 1;
            transform: scale(1.18);
          }
        }
        @keyframes meshFloat {
          0% {
            transform: rotate(0deg) scale(0.95);
          }
          50% {
            transform: rotate(4deg) scale(1.04);
          }
          100% {
            transform: rotate(-4deg) scale(0.98);
          }
        }
        @keyframes streamIn {
          from {
            stroke-dashoffset: 40;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes streamOut {
          from {
            stroke-dashoffset: 40;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes ledGlow {
          0% {
            opacity: 0.35;
          }
          100% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
