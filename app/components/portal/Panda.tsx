"use client";
import Image from "next/image";

interface PandaProps {
  pose?: "traveler" | "wave";
  size?: number;
}

export function Panda({ pose = "traveler", size = 128 }: PandaProps) {
  const aspect = pose === "traveler" ? 340 / 502 : 272 / 388;
  return (
    <div className="panda-idle" style={{ display: "inline-block" }}>
      <Image
        src={`/portal/panda-${pose}.png`}
        alt="PandAI"
        width={Math.round(size * aspect)}
        height={size}
        priority
        style={{ filter: "drop-shadow(0 4px 8px rgba(30,58,138,0.2))" }}
      />
    </div>
  );
}
