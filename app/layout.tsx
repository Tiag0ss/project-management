import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import BrandingRuntime from "@/components/BrandingRuntime";
import ThemeRuntime from "@/components/ThemeRuntime";
import GlobalGridEnhancer from "@/components/GlobalGridEnhancer";
import AIAssistantWidget from "@/components/AIAssistantWidget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Project Management App",
  description: "Manage your projects efficiently",
  icons: {
    icon: "/window.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <PermissionsProvider>
            <ToastProvider>
              <ThemeRuntime />
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
