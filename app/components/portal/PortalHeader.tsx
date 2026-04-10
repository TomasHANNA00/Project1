import Image from "next/image";

interface PortalHeaderProps {
  companyName: string | null;
  totalProgress: number;
}

export default function PortalHeader({ companyName, totalProgress }: PortalHeaderProps) {
  const isDone = totalProgress >= 100;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "white",
        borderBottom: "1px solid #E2E8F0",
      }}
    >
      <div
        style={{
          padding: "0 32px",
          height: "60px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left: Logo */}
        <Image src="/logo-vambe.png" alt="Vambe" height={40} width={0} style={{ width: "auto", display: "block" }} priority />

        {/* Right: Company badge + progress */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {companyName && (
            <span
              style={{
                background: "#DBEAFE",
                color: "#1D4ED8",
                borderRadius: "100px",
                padding: "4px 12px",
                fontSize: "12px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {companyName}
            </span>
          )}
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: isDone ? "#059669" : "#3B82F6",
                lineHeight: 1,
              }}
            >
              {Math.round(totalProgress)}%
            </div>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#94A3B8",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginTop: "2px",
              }}
            >
              Progreso Total
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
