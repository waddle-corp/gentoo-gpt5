"use client";

import { useEffect, useRef, useState } from "react";
import LeftChatPanel from "@/components/panels/LeftChatPanel";
import CenterSimulationPanel from "@/components/panels/CenterSimulationPanel";

export default function Home() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftWidthPx, setLeftWidthPx] = useState<number>(480);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Initialize left width to ~42% of container width on first mount for sensible default
    const rect = container.getBoundingClientRect();
    if (rect.width && leftWidthPx === 480) {
      setLeftWidthPx(Math.max(320, Math.min(rect.width * 0.42, rect.width - 360)));
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const container = containerRef.current;
    if (!container) return;

    const handlePointerMove = (event: MouseEvent | TouchEvent) => {
      const rect = container.getBoundingClientRect();
      const clientX = (event as TouchEvent).touches
        ? (event as TouchEvent).touches[0].clientX
        : (event as MouseEvent).clientX;
      // Compute desired left width relative to container
      let next = clientX - rect.left;
      const minLeft = 280; // Min width for left panel
      const minRight = 360; // Min width for right panel
      next = Math.max(minLeft, Math.min(next, rect.width - minRight));
      setLeftWidthPx(next);
    };

    const stopResizing = () => setIsResizing(false);

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopResizing);
    window.addEventListener("touchmove", handlePointerMove, { passive: false });
    window.addEventListener("touchend", stopResizing);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", stopResizing);
      window.removeEventListener("touchmove", handlePointerMove as any);
      window.removeEventListener("touchend", stopResizing);
    };
  }, [isResizing]);

  const startResizing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return (
    <main className="h-full p-0 bg-background">
      <div
        ref={containerRef}
        className={`grid h-full min-h-0 ${isResizing ? "select-none" : ""}`}
        style={{ gridTemplateColumns: `${leftWidthPx}px 6px 1fr` }}
      >
        <div className="h-full min-h-0 overflow-hidden" style={{ backgroundColor: "#323232" }}>
          <LeftChatPanel />
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
          className="h-full w-[6px] bg-[#1f1f1f] cursor-col-resize hover:bg-[#2a2a2a]"
          onMouseDown={startResizing}
          onTouchStart={startResizing}
        />
        <div className="h-full min-h-0 overflow-hidden" style={{ backgroundColor: "var(--right-panel)" }}>
          <CenterSimulationPanel embedded />
        </div>
      </div>
    </main>
  );
}
