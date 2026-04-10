import { Inter } from "next/font/google";
import PortalProviders from "@/app/components/portal/PortalProviders";

const inter = Inter({ subsets: ["latin"] });

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={inter.className} style={{ minHeight: "100vh", background: "#F5F7FB" }}>
      <PortalProviders>{children}</PortalProviders>
    </div>
  );
}
