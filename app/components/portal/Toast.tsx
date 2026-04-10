"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

interface ToastContextValue {
  showToast: (message: string, type?: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

interface ToastState {
  id: number;
  message: string;
  type: "success" | "error";
  leaving: boolean;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ id: Date.now(), message, type, leaving: false });
    timerRef.current = setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, leaving: true } : null));
      timerRef.current = setTimeout(() => setToast(null), 400);
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          key={toast.id}
          style={{
            position: "fixed",
            bottom: "32px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 200,
            padding: "12px 20px",
            borderRadius: "10px",
            background: toast.type === "error" ? "#FEF2F2" : "#0F1629",
            color: toast.type === "error" ? "#DC2626" : "white",
            fontSize: "13px",
            fontWeight: 500,
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            maxWidth: "360px",
            whiteSpace: "nowrap",
            animation: toast.leaving
              ? "toast-out 0.4s ease forwards"
              : "toast-in 0.3s ease forwards",
          }}
        >
          {toast.type === "error" ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#DC2626" strokeWidth="1.5" />
              <path d="M8 5v3M8 11v.5" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8L6.5 11.5L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
