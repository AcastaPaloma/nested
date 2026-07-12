import type { Metadata } from "next";
import { DotGothic16, Major_Mono_Display } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const dotGothic16 = DotGothic16({
  weight: "400",
  variable: "--font-dotgothic16",
  subsets: ["latin"],
});

const majorMonoDisplay = Major_Mono_Display({
  weight: "400",
  variable: "--font-majormonodisplay",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nested — conversations with spatial memory",
  description: "Branch conversations on a canvas and control exactly what stays in context.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${dotGothic16.variable} ${majorMonoDisplay.variable} antialiased`}
        style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
      >
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
