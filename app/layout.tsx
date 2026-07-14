import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import BrandingRuntime from "@/components/BrandingRuntime";
import PreferencesRuntime from "@/components/PreferencesRuntime";
import { PREFERENCES_EARLY_APPLY_SCRIPT } from "@/lib/colorVision";
import GlobalGridEnhancer from "@/components/GlobalGridEnhancer";
import AIAssistantWidget from "@/components/AIAssistantWidget";
import { getPublicBranding, inferFaviconType } from "@/lib/branding/publicBranding.server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { companyName, faviconUrl } = await getPublicBranding();
  const faviconType = inferFaviconType(faviconUrl);

  return {
    title: companyName,
    description: "Manage your projects efficiently",
    icons: {
      icon: faviconType ? [{ url: faviconUrl, type: faviconType }] : faviconUrl,
      shortcut: faviconUrl,
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <PermissionsProvider>
            <ToastProvider>
              <PreferencesRuntime />
              <BrandingRuntime />
              <GlobalGridEnhancer />
              {children}
              <AIAssistantWidget />
            </ToastProvider>
          </PermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
