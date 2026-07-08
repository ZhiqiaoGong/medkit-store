import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedKit Studio | Configure a medical kit",
  description:
    "Build a field-ready medical kit with live inventory and transparent pricing.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
