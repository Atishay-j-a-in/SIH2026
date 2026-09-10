"use client";

import { useRef, useEffect, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useFrameSequencer } from "./use-frame-sequencer";

interface FrameSequencerProps {
  children?: React.ReactNode;
}

export function FrameSequencer({ children }: FrameSequencerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { totalFrames, framesRef, isLoaded } = useFrameSequencer();
  const drawnFrameRef = useRef(-1);
  const currentFrameRef = useRef(0);

  const drawFrame = useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const img = framesRef.current[index];

      if (!canvas || !ctx || !img?.complete || !img?.naturalWidth) return;

      if (drawnFrameRef.current === index) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();

      if (
        canvas.width !== rect.width * dpr ||
        canvas.height !== rect.height * dpr
      ) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.clearRect(0, 0, rect.width, rect.height);

      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = rect.width / rect.height;

      let drawW: number, drawH: number, drawX: number, drawY: number;

      if (imgRatio > canvasRatio) {
        drawH = rect.height;
        drawW = drawH * imgRatio;
        drawX = (rect.width - drawW) / 2;
        drawY = 0;
      } else {
        drawW = rect.width;
        drawH = drawW / imgRatio;
        drawX = 0;
        drawY = (rect.height - drawH) / 2;
      }

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      drawnFrameRef.current = index;
    },
    [framesRef]
  );

  useEffect(() => {
    if (!isLoaded) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const playhead = { frame: 0 };

    gsap.registerPlugin(ScrollTrigger);

    drawFrame(0);

    if (reduceMotion) {
      return;
    }

    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.085,
      smoothWheel: true,
    });

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(1000, 16);

    const frameTween = gsap.to(playhead, {
      frame: totalFrames - 1,
      ease: "none",
      onUpdate: () => {
        currentFrameRef.current = Math.round(playhead.frame);
        drawFrame(currentFrameRef.current);
      },
      scrollTrigger: {
        trigger: ".scroll-spacer",
        start: "top top",
        end: "bottom top",
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
    });

    ScrollTrigger.refresh();

    return () => {
      frameTween.kill();
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
      gsap.ticker.remove(tick);
    };
  }, [drawFrame, isLoaded, totalFrames]);

  useEffect(() => {
    const handleResize = () => {
      drawnFrameRef.current = -1;
      drawFrame(currentFrameRef.current);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [drawFrame]);

  return (
    <>
      <div className="frame-sequencer-wrap">
        <canvas
          ref={canvasRef}
          className="frame-sequencer-canvas"
          aria-hidden="true"
        />
        {children}
      </div>
      <style jsx>{`
        .frame-sequencer-wrap {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 0;
          overflow: hidden;
        }
        .frame-sequencer-canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
      `}</style>
    </>
  );
}
