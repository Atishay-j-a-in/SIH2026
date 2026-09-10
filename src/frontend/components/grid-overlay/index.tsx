"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

interface GridOverlayProps {
  enabled?: boolean;
}

export function GridOverlay({ enabled = true }: GridOverlayProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!gridRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      gsap.to(gridRef.current, {
        opacity: 0.72,
        scale: 1.04,
        ease: "none",
        scrollTrigger: {
          trigger: ".scroll-spacer",
          start: "top top",
          end: "bottom top",
          scrub: 0.8,
        },
      });
    }, gridRef);

    return () => context.revert();
  }, []);

  if (!enabled) return null;

  return (
    <div className="grid-overlay" aria-hidden="true">
      <div ref={gridRef} className="grid-overlay-inner" />
      <style jsx>{`
        .grid-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          pointer-events: none;
          overflow: hidden;
        }
        .grid-overlay-inner {
          width: 100%;
          height: 100%;
          background-image:
            linear-gradient(
              to right,
              rgba(255, 255, 255, 0.035) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              rgba(255, 255, 255, 0.035) 1px,
              transparent 1px
            );
          background-size: 80px 80px;
          mask-image: radial-gradient(
            ellipse 70% 60% at 50% 50%,
            black 20%,
            transparent 80%
          );
        }
        @media (max-width: 640px) {
          .grid-overlay-inner {
            background-size: 56px 56px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .grid-overlay-inner {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
