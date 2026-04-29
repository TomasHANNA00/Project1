"use client";

import { Panda } from "./Panda";

interface TrackPhase {
  id: string;
  progress: number;
}

interface PandaTrackProps {
  phases: TrackPhase[];
  phaseAnchors: number[];
  containerHeight: number;
}

export default function PandaTrack({ phases, phaseAnchors, containerHeight }: PandaTrackProps) {
  const firstNonComplete = phases.findIndex((p) => p.progress < 100);
  const isAllDone = firstNonComplete === -1;
  const pandaAnchorIdx = isAllDone ? phases.length - 1 : firstNonComplete;
  const pandaAnchor = phaseAnchors[pandaAnchorIdx] ?? 0;
  // Center 128px panda on the dot
  const pandaTop = Math.max(0, pandaAnchor - 64);
  const pandaPose: "traveler" | "wave" = isAllDone ? "wave" : "traveler";

  return (
    <div
      style={{
        position: "relative",
        height: containerHeight || 200,
        display: "flex",
        justifyContent: "center",
      }}
    >
      {/* Dotted vertical line */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 0,
          borderLeft: "2px dashed var(--portal-line-1)",
          transform: "translateX(-50%)",
        }}
      />

      {/* Phase dots */}
      {phases.map((phase, i) => {
        const top = phaseAnchors[i] ?? i * 92;
        return (
          <div
            key={phase.id}
            style={{
              position: "absolute",
              top: top - 4,
              left: "50%",
              transform: "translateX(-50%)",
              width: 8,
              height: 8,
              borderRadius: "50%",
              ...(phase.progress >= 100
                ? { background: "var(--portal-blue)", border: "none" }
                : { background: "white", border: "2px solid var(--portal-line-1)" }),
            }}
          />
        );
      })}

      {/* Panda — moves only when a phase hits 100% */}
      <div
        className="panda-track-position"
        style={{
          position: "absolute",
          top: pandaTop,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <Panda pose={pandaPose} size={128} />
      </div>
    </div>
  );
}
