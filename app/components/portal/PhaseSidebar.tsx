"use client";

interface SidebarPhase {
  id: string;
  phase_number: number;
  name: string;
  progress: number;
}

interface PhaseSidebarProps {
  phases: SidebarPhase[];
  onPhaseClick: (phaseId: string) => void;
  leftOffset?: number;
  topOffset?: number;
}

export default function PhaseSidebar({ phases, onPhaseClick, leftOffset = 0, topOffset = 60 }: PhaseSidebarProps) {
  return (
    <aside
      className="hidden min-[900px]:block"
      style={{
        width: "180px",
        position: "fixed",
        top: `${topOffset}px`,
        left: `${leftOffset}px`,
        bottom: 0,
        overflowY: "auto",
        padding: "24px 20px",
        background: "#F5F7FB",
        borderRight: "1px solid #E2E8F0",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "#94A3B8",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "20px",
        }}
      >
        Fases del Proyecto
      </p>

      <div style={{ position: "relative" }}>
        {/* Vertical connecting line */}
        {phases.length > 1 && (
          <div
            style={{
              position: "absolute",
              left: "6px",
              top: "7px",
              bottom: "26px",
              width: "1px",
              background: "#E2E8F0",
            }}
          />
        )}

        {phases.map((phase) => {
          const isDone = phase.progress >= 100;
          const isInProgress = phase.progress > 0 && phase.progress < 100;

          return (
            <div
              key={phase.id}
              onClick={() => onPhaseClick(phase.id)}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                paddingBottom: "20px",
                cursor: "pointer",
              }}
            >
              {/* Phase dot */}
              <div
                className={isInProgress ? "animate-pulse" : ""}
                style={{
                  position: "relative",
                  zIndex: 1,
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  marginTop: "1px",
                  background: isDone
                    ? "#059669"
                    : isInProgress
                    ? "#3B82F6"
                    : "#CBD5E1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isDone && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path
                      d="M1.5 4L3.5 6L6.5 2"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>

              {/* Phase label */}
              <div>
                <p
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: isDone
                      ? "#059669"
                      : isInProgress
                      ? "#3B82F6"
                      : "#94A3B8",
                    lineHeight: "1.3",
                  }}
                >
                  Fase {phase.phase_number}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    color: "#94A3B8",
                    marginTop: "1px",
                  }}
                >
                  {Math.round(phase.progress)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
