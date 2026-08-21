import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "CoversBee Mail",
  description: "CoversBee staff order and campaign email tool",
};

// Deliberately minimal: the staff nav bar, Zoho-connection banner, and
// log-out control live in app/(staff)/layout.tsx instead, so pages outside
// that group — /login and the customer-facing /unsubscribe — don't show
// internal staff navigation to someone who isn't logged in (or isn't staff
// at all, in /unsubscribe's case).
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
