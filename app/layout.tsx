import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { createServiceClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CoversBee Mail",
  description: "CoversBee staff order and campaign email tool",
};

// The Zoho-connection banner below reads live system_status on every request.
// Without this, `next build` would statically pre-render the layout once at
// build time and the banner would never reflect later state changes.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = createServiceClient();
  const { data: status } = await supabase
    .from("system_status")
    .select("zoho_connected, last_error")
    .single();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {status && !status.zoho_connected && (
          <div style={{ background: "#c0392b", color: "#fff", padding: "8px", textAlign: "center" }}>
            Email sending is broken — reconnect Zoho.
            {status.last_error ? ` (${status.last_error})` : ""}
          </div>
        )}
        <header className="flex justify-end p-4">
          <a href="/login">Staff login</a>
        </header>
        {children}
      </body>
    </html>
  );
}
