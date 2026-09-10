"use client";

import { useRef, useState, useEffect } from "react";

export const TOTAL_FRAMES = 415;
const FRAME_PATH = "/frames/frame_";
const FRAME_PADDING = 3;

function getFramePath(index: number): string {
  const num = String(index + 1).padStart(FRAME_PADDING, "0");
  return `${FRAME_PATH}${num}.webp`;
}

export function useFrameSequencer() {
  const [isLoaded, setIsLoaded] = useState(false);
  const framesRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    const images: HTMLImageElement[] = [];
    let loaded = 0;

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const img = new Image();
      img.src = getFramePath(i);
      img.onload = () => {
        loaded++;
        if (loaded === TOTAL_FRAMES) {
          setIsLoaded(true);
        }
      };
      images.push(img);
    }

    framesRef.current = images;
  }, []);

  return {
    totalFrames: TOTAL_FRAMES,
    framesRef,
    isLoaded,
  };
}
