"use client";

interface PortalHeroProps {
  onContactAdmin?: () => void;
}

export default function PortalHero({ onContactAdmin }: PortalHeroProps) {
  const handleContact = () => {
    if (onContactAdmin) {
      onContactAdmin();
    } else {
      window.location.href = "mailto:tomas.hanna@vambe.ai";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        padding: "32px 0 24px",
        gap: "24px",
      }}
    >
      {/* Left: Title + subtitle */}
      <div>
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 800,
            color: "var(--portal-fg-1)",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Tu recorrido con{" "}
          <span style={{ color: "var(--portal-blue)" }}>Vambe</span>
        </h1>
        <p
          style={{
            marginTop: "6px",
            fontSize: "14px",
            color: "var(--portal-fg-4)",
            maxWidth: "520px",
            lineHeight: 1.5,
          }}
        >
          PandAI avanza una fase cada vez que completas todas sus tareas.
          Selecciona una fase para ver el detalle.
        </p>
      </div>

      {/* Right: Contact admin link */}
      <button
        onClick={handleContact}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--portal-blue)",
          fontWeight: 600,
          fontSize: "13px",
          padding: "8px 0",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Hablar con tu admin
      </button>
    </div>
  );
}
