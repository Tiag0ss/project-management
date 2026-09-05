import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import BrandingRuntime from "@/components/BrandingRuntime";
import PreferencesRuntime from "@/components/PreferencesRuntime";
import PwaRegister from "@/components/PwaRegister";
import AuthenticatedAppGate from "@/components/AuthenticatedAppGate";
import { PREFERENCES_EARLY_APPLY_SCRIPT } from "@/lib/colorVision";
import { getPublicBranding, inferFaviconType } from "@/lib/branding/publicBranding.server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Synapse shell fonts (see pm-synapse / rebuild plan). */
const dmSans = DM_Sans({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-dm-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0a0e13",
  width: "device-width",
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const { companyName, faviconUrl } = await getPublicBranding();
  const faviconType = inferFaviconType(faviconUrl);

  return {
    title: companyName,
    description: "Manage your projects efficiently",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: companyName,
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        ...(faviconType
          ? [{ url: faviconUrl, type: faviconType }]
          : [{ url: faviconUrl }]),
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      shortcut: faviconUrl,
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_EARLY_APPLY_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <AuthProvider>
          <PermissionsProvider>
            <ToastProvider>
              <PreferencesRuntime />
              <BrandingRuntime />
              <PwaRegister />
              <AuthenticatedAppGate>{children}</AuthenticatedAppGate>
            </ToastProvider>
          </PermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
