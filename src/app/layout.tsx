import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { PwaInstallBanner } from "@/components/modules/PwaInstallBanner";
import { AuthProvider } from "@/context/AuthContext";
import { OfflineSyncProvider } from "@/context/OfflineSyncContext";
import PinPadModal from "@/components/common/PinPadModal";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-heebo",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "Tooly | ניהול ציוד וכלי עבודה",
  description:
    "מערכת מתקדמת לניהול ציוד וכלי עבודה, ניפוק מרוכז, בדיקת אביזרים, סריקת ברקוד QR ויומן תנועות.",
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
    <html lang="he" dir="rtl" className={`${heebo.variable} ${heebo.className} bg-white text-blue-950`} suppressHydrationWarning>
      <body className="min-h-screen bg-white text-blue-950 antialiased selection:bg-blue-600 selection:text-white font-sans" suppressHydrationWarning>
        <AuthProvider>
          <OfflineSyncProvider>
            {children}
            <PinPadModal />
            <PwaInstallBanner />
          </OfflineSyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
