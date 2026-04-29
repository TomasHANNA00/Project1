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
        borderBottom: "1px solid var(--portal-line-1)",
      }}
    >
      <div
        style={{
          padding: "0 32px",
          height: "68px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Left: Logo */}
        <Image
          src="/logo-vambe.png"
          alt="Vambe"
          height={44}
          width={140}
          style={{ width: "auto", height: "44px", display: "block" }}
          priority
        />

        {/* Right: Company badge + progress */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {companyName && (
            <span
              style={{
                background: "var(--portal-blue-lighter)",
                color: "var(--portal-blue-deep)",
                borderRadius: "999px",
                padding: "6px 14px",
                fontSize: "13px",
                fontWeight: 700,
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
                fontWeight: 800,
                color: isDone ? "var(--portal-green)" : "var(--portal-blue)",
                lineHeight: 1,
              }}
            >
              {Math.round(totalProgress)}%
            </div>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--portal-fg-5)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginTop: "2px",
              }}
            >
              PROGRESO TOTAL
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
