"use client";

import { ToastProvider } from "./Toast";

export default function PortalProviders({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
