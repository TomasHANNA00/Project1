"use client";

import { useEffect, useRef, useState } from "react";

interface RailPhase {
  id: string;
  phase_number: number;
  name: string;
  progress: number;
}

interface PhaseRailProps {
  phases: RailPhase[];
  activePhaseId: string;
  onPhaseClick: (phaseId: string) => void;
  onAnchorsChange?: (anchors: number[]) => void;
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3.5 9L7.5 13L14.5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PhaseRail({ phases, activePhaseId, onPhaseClick, onAnchorsChange }: PhaseRailProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Compute anchor positions (center-Y of each sphere relative to container top)
  useEffect(() => {
    if (!onAnchorsChange || !containerRef.current) return;
    const containerTop = containerRef.current.getBoundingClientRect().top;
    const anchors = itemRefs.current.map((el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 - containerTop;
    });
    onAnchorsChange(anchors);
  });

  if (isMobile) {
    // Horizontal scroll strip on mobile
    return (
      <div
        style={{
          display: "flex",
          gap: "12px",
          overflowX: "auto",
          padding: "12px 0",
          scrollbarWidth: "none",
        }}
      >
        {phases.map((phase) => {
          const isActive = phase.id === activePhaseId;
          const isDone = phase.progress >= 100;
          return (
            <button
              key={phase.id}
              onClick={() => onPhaseClick(phase.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 8px",
                borderRadius: "10px",
                outline: isActive ? "2px solid var(--portal-blue)" : "none",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "15px",
                  ...(isDone
                    ? { background: "var(--portal-blue)", color: "white", border: "none" }
                    : isActive
                    ? { background: "white", border: "2.5px solid var(--portal-blue)", color: "var(--portal-blue)" }
                    : { background: "white", border: "1.5px solid var(--portal-line-1)", color: "var(--portal-fg-5)" }),
                }}
              >
                {isDone ? <CheckIcon /> : phase.phase_number}
              </div>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: isActive ? 800 : isDone ? 600 : 600,
                  color: isActive ? "var(--portal-fg-1)" : isDone ? "var(--portal-fg-4)" : "var(--portal-fg-5)",
                  whiteSpace: "nowrap",
                }}
              >
                {phase.name}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Desktop: vertical list
  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
      {phases.map((phase, i) => {
        const isActive = phase.id === activePhaseId;
        const isDone = phase.progress >= 100;

        return (
          <div
            key={phase.id}
            style={{
              // Active border wrapper
              ...(isActive
                ? {
                    border: "2px solid var(--portal-blue)",
                    borderRadius: "14px",
                    padding: "8px",
                    margin: "-8px",
                  }
                : { padding: "0" }),
            }}
          >
            <button
              ref={(el) => { itemRefs.current[i] = el; }}
              onClick={() => onPhaseClick(phase.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px",
                width: "100%",
              }}
            >
              {/* Sphere */}
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "18px",
                  ...(isDone && !isActive
                    ? { background: "var(--portal-blue)", border: "none", color: "white" }
                    : isActive
                    ? {
                        background: "white",
                        border: "2.5px solid var(--portal-blue)",
                        color: "var(--portal-blue)",
                        boxShadow: "0 0 0 5px rgba(37,99,235,0.12)",
                      }
                    : { background: "white", border: "1.5px solid var(--portal-line-1)", color: "var(--portal-fg-5)" }),
                }}
              >
                {isDone && !isActive ? <CheckIcon /> : phase.phase_number}
              </div>

              {/* Title */}
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: isActive ? 800 : isDone ? 600 : 600,
                  color: isActive ? "var(--portal-fg-1)" : isDone ? "var(--portal-fg-4)" : "var(--portal-fg-5)",
                  textAlign: "center",
                  lineHeight: 1.25,
                  maxWidth: "180px",
                  margin: 0,
                }}
              >
                {phase.name}
              </p>
            </button>
          </div>
        );
      })}
    </div>
  );
}
