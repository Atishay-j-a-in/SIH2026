"use client";

import { useEffect, useRef } from "react";

const FEATURES = [
  {
    number: "01",
    title: "Single Pass Capture",
    description:
      "Fly once. Record video. Our pipeline extracts every angle from a continuous drone feed, no multi-pass surveys required.",
  },
  {
    number: "02",
    title: "3D Mesh Generation",
    description:
      "Real-time photogrammetry converts video frames into high-fidelity 3D meshes with accurate geometry and texture.",
  },
  {
    number: "03",
    title: "Survey-Grade Accuracy",
    description:
      "Georeferenced outputs meeting survey-grade tolerances. Export to CAD, GIS, or any standard point cloud format.",
  },
  {
    number: "04",
    title: "Instant Deployment",
    description:
      "From upload to interactive 3D model in minutes, not days. Cloud processing scales with your fleet.",
  },
];

export function Features() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" }
    );

    const items = section.querySelectorAll(".feature-item");
    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="features" id="features">
      <div className="features-inner">
        <div className="features-header">
          <span className="section-label">Capabilities</span>
          <h2 className="section-title">
            One flight.
            <br />
            Full reconstruction.
          </h2>
        </div>
        <div className="features-grid">
          {FEATURES.map((feature) => (
            <article key={feature.number} className="feature-item">
              <span className="feature-number">{feature.number}</span>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
      <style jsx>{`
        .features {
          position: relative;
          z-index: 5;
          background: var(--surface);
          padding: clamp(4rem, 10vw, 10rem) clamp(1.5rem, 5vw, 6rem);
        }
        .features-inner {
          max-width: 1400px;
          margin: 0 auto;
        }
        .features-header {
          margin-bottom: clamp(3rem, 6vw, 6rem);
        }
        .section-label {
          display: block;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 1.5rem;
        }
        .section-title {
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 6vw, 5rem);
          font-weight: 700;
          line-height: 0.95;
          letter-spacing: -0.03em;
          color: var(--ink);
          text-wrap: balance;
          margin: 0;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1px;
          background: var(--border);
        }
        .feature-item {
          background: var(--surface);
          padding: clamp(2rem, 3vw, 3rem);
          display: flex;
          flex-direction: column;
          gap: 1rem;
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-item.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .feature-item:nth-child(1) {
          transition-delay: 0ms;
        }
        .feature-item:nth-child(2) {
          transition-delay: 100ms;
        }
        .feature-item:nth-child(3) {
          transition-delay: 200ms;
        }
        .feature-item:nth-child(4) {
          transition-delay: 300ms;
        }
        .feature-number {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.15em;
          color: var(--ink-muted);
        }
        .feature-title {
          font-family: var(--font-display);
          font-size: clamp(1.25rem, 2.5vw, 1.75rem);
          font-weight: 600;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin: 0;
        }
        .feature-description {
          font-family: var(--font-body);
          font-size: 0.95rem;
          line-height: 1.6;
          color: var(--ink-muted);
          margin: 0;
          max-width: 360px;
        }
        @media (prefers-reduced-motion: reduce) {
          .feature-item {
            opacity: 1;
            transform: none;
            transition: none;
          }
        }
        @media (max-width: 640px) {
          .features-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
