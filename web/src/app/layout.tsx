import type { Metadata } from "next";
import { OwnerProvider } from "@/lib/owner-context";
import { BRAND_NAME } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: "Self-hosted SMS bridge dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <OwnerProvider>{children}</OwnerProvider>
      </body>
    </html>
  );
}
