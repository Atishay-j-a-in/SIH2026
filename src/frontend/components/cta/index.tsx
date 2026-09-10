"use client";

import { useEffect, useRef } from "react";

export function CTA() {
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
      { threshold: 0.2 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="cta" id="contact">
      <div className="cta-inner">
        <div className="cta-content">
          <span className="cta-label">Get started</span>
          <h2 className="cta-title">
            Ready to see
            <br />
            every angle?
          </h2>
          <p className="cta-description">
            Deploy The 3rD Lens on your next survey. Single flight, full 3D
            output, zero rework.
          </p>
          <div className="cta-actions">
            <a href="/upload" className="cta-button cta-button-primary">
              Try now
            </a>
            <a href="#features" className="cta-button cta-button-secondary">
              View capabilities
            </a>
          </div>
        </div>
        <div className="cta-specs">
          <div className="spec-item">
            <span className="spec-value">{"<"}5min</span>
            <span className="spec-label">Processing time</span>
          </div>
          <div className="spec-item">
            <span className="spec-value">2cm</span>
            <span className="spec-label">Resolution</span>
          </div>
          <div className="spec-item">
            <span className="spec-value">1x</span>
            <span className="spec-label">Flight passes</span>
          </div>
        </div>
      </div>
      <footer className="site-footer">
        <div className="footer-inner">
          <span className="footer-brand">The 3rD Lens</span>
          <span className="footer-copy">&copy; 2026</span>
        </div>
      </footer>
      <style jsx>{`
        .cta {
          position: relative;
          z-index: 5;
          background: var(--background);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: clamp(4rem, 10vw, 10rem) clamp(1.5rem, 5vw, 6rem) 0;
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
            transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .cta.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .cta-inner {
          max-width: 1400px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: clamp(3rem, 6vw, 8rem);
          align-items: end;
          padding-bottom: clamp(4rem, 8vw, 8rem);
          border-bottom: 1px solid var(--border);
        }
        .cta-label {
          display: block;
          font-family: var(--font-mono);
          font-size: 0.7rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 1.5rem;
        }
        .cta-title {
          font-family: var(--font-display);
          font-size: clamp(2.5rem, 6vw, 5rem);
          font-weight: 700;
          line-height: 0.95;
          letter-spacing: -0.03em;
          color: var(--ink);
          text-wrap: balance;
          margin: 0 0 1.5rem 0;
        }
        .cta-description {
          font-family: var(--font-body);
          font-size: clamp(1rem, 1.5vw, 1.2rem);
          line-height: 1.6;
          color: var(--ink-muted);
          max-width: 480px;
          margin: 0 0 2.5rem 0;
        }
        .cta-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .cta-button {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-decoration: none;
          padding: 1rem 2rem;
          border: 1px solid var(--border);
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .cta-button-primary {
          background: var(--ink);
          color: var(--background);
          border-color: var(--ink);
        }
        .cta-button-primary:hover {
          background: var(--accent);
          border-color: var(--accent);
        }
        .cta-button-secondary {
          background: transparent;
          color: var(--ink);
        }
        .cta-button-secondary:hover {
          border-color: var(--ink);
        }
        .cta-specs {
          display: flex;
          gap: clamp(2rem, 4vw, 4rem);
          padding-bottom: 0.5rem;
        }
        .spec-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          text-align: right;
        }
        .spec-value {
          font-family: var(--font-display);
          font-size: clamp(1.5rem, 3vw, 2.5rem);
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--ink);
        }
        .spec-label {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }
        .site-footer {
          padding: 2rem clamp(1.5rem, 5vw, 6rem);
        }
        .footer-inner {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .footer-brand {
          font-family: var(--font-display);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--ink);
        }
        .footer-copy {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          color: var(--ink-muted);
        }
        @media (prefers-reduced-motion: reduce) {
          .cta {
            opacity: 1;
            transform: none;
            transition: none;
          }
        }
        @media (max-width: 900px) {
          .cta-inner {
            grid-template-columns: 1fr;
            gap: 3rem;
          }
          .cta-specs {
            text-align: left;
          }
          .spec-item {
            text-align: left;
          }
        }
      `}</style>
    </section>
  );
}
