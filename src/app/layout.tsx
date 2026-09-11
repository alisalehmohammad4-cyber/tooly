import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaInstallBanner } from "@/components/modules/PwaInstallBanner";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "Tooly - Industrial Tool & Asset Management",
  description:
    "Enterprise QR barcode asset management, quick field onboarding, custody check-in/out, and multi-warehouse inventory.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tooly",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-white text-blue-950">
      <body className="min-h-screen bg-white text-blue-950 antialiased selection:bg-blue-600 selection:text-white">
        {children}
        <PwaInstallBanner />
      </body>
    </html>
  );
}
