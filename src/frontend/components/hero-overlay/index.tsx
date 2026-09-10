"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function HeroOverlay() {
  const sectionRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    gsap.registerPlugin(ScrollTrigger);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const context = gsap.context(() => {
      const content = section.querySelector(".hero-content");
      if (!content) return;

      if (reduceMotion) {
        gsap.set(section, { autoAlpha: 1 });
        return;
      }

      gsap.timeline({
        scrollTrigger: {
          trigger: ".scroll-spacer",
          start: "top top",
          end: "20% top",
          scrub: 0.45,
        },
      })
        .to(content, { y: -32, autoAlpha: 0, ease: "none" }, 0)
        .to(section, { pointerEvents: "none", ease: "none" }, 0);
    }, sectionRef);

    return () => context.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="hero-overlay"
      aria-label="Hero"
    >
      <div className="hero-content">
        <div className="hero-eyebrow">Pro grade drone mapping</div>
        <h1 className="hero-title">
          The 3rD
          <br />
          Lens
        </h1>
        <p className="hero-tagline">
          From a single drone pass to full 3D reality capture.
        </p>
        <div className="hero-scroll-cue">
          <span className="scroll-text">Scroll to explore</span>
          <div className="scroll-line" />
        </div>
      </div>
      <style jsx>{`
        .hero-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 10;
          display: flex;
          align-items: flex-end;
          padding: clamp(2rem, 5vw, 6rem);
          transition: opacity 0.1s linear;
        }
        .hero-content {
          max-width: 800px;
        }
        .hero-eyebrow {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 1.5rem;
          opacity: 0.9;
        }
        .hero-title {
          font-family: var(--font-display);
          font-size: clamp(3.5rem, 10vw, 8rem);
          font-weight: 800;
          line-height: 0.9;
          letter-spacing: -0.04em;
          color: var(--ink);
          text-wrap: balance;
          margin: 0 0 1.5rem 0;
        }
        .hero-tagline {
          font-family: var(--font-body);
          font-size: clamp(1rem, 2vw, 1.35rem);
          line-height: 1.5;
          color: var(--ink-muted);
          max-width: 480px;
          margin: 0 0 3rem 0;
        }
        .hero-scroll-cue {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .scroll-text {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }
        .scroll-line {
          width: 60px;
          height: 1px;
          background: var(--ink-muted);
          opacity: 0.4;
          position: relative;
          overflow: hidden;
        }
        .scroll-line::after {
          content: "";
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: var(--accent);
          animation: scrollPulse 2s ease-in-out infinite;
        }
        @keyframes scrollPulse {
          0% {
            left: -100%;
          }
          50% {
            left: 0%;
          }
          100% {
            left: 100%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .scroll-line::after {
            animation: none;
            left: 0;
          }
        }
        @media (max-width: 640px) {
          .hero-overlay {
            padding: 1.5rem;
          }
        }
      `}</style>
    </section>
  );
}
