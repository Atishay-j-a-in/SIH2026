"use client";

import { FrameSequencer } from "../components/frame-sequencer";
import { HeroOverlay } from "../components/hero-overlay";
import { Features } from "../components/features";
import { CTA } from "../components/cta";
import { ScanStories } from "../components/scan-stories";
import { GridOverlay } from "../components/grid-overlay";

export default function Home() {
  return (
    <>
      <FrameSequencer>
        <HeroOverlay />
      </FrameSequencer>

      <GridOverlay enabled={true} />

      <div className="scroll-spacer" />

      <Features />
      <ScanStories />
      <CTA />

      <style jsx>{`
        .scroll-spacer {
          height: 1480vh;
          pointer-events: none;
        }
      `}</style>
    </>
  );
}
