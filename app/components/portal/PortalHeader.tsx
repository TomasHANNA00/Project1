"use client";

import Image from "next/image";
import { useAuth } from "@/app/contexts/AuthContext";

interface PortalHeaderProps {
  companyName: string | null;
  totalProgress: number;
}

export default function PortalHeader({ companyName, totalProgress }: PortalHeaderProps) {
  const { signOut } = useAuth();
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

        {/* Right: Company badge + progress + sign out */}
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

          {/* Sign out */}
          <button
            onClick={signOut}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "1px solid var(--portal-line-1)",
              borderRadius: "8px",
              cursor: "pointer",
              color: "var(--portal-fg-5)",
              fontWeight: 600,
              fontSize: "12px",
              padding: "6px 12px",
              whiteSpace: "nowrap",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--portal-fg-3)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--portal-fg-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--portal-line-1)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--portal-fg-5)";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </div>
    </header>
  );
}
