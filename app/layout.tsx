import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Manrope } from "next/font/google";
import { createServiceClient } from "@/lib/supabase/server";
import { LogOutButton } from "./nav-actions";
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

// The Zoho-connection banner below reads live system_status on every request.
// Without this, `next build` would statically pre-render the layout once at
// build time and the banner would never reflect later state changes.
export const dynamic = "force-dynamic";

const NAV_LINKS = [
  { href: "/orders", label: "Orders" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/customers", label: "Customers" },
  { href: "/email-log", label: "Email Log" },
];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const supabase = createServiceClient();
  const { data: status } = await supabase
    .from("system_status")
    .select("zoho_connected, last_error")
    .single();

  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        {status && !status.zoho_connected && (
          <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
            Email sending is broken — reconnect Zoho.
            {status.last_error ? ` (${status.last_error})` : ""}
          </div>
        )}
        <header className="flex items-center justify-between gap-4 bg-ink px-6 py-3">
          <div className="flex items-center gap-8">
            <Link href="/orders" className="flex items-center gap-2">
              <Image src="/logo.png" alt="CoversBee" width={28} height={28} priority />
              <span className="text-sm font-bold tracking-wide text-white">
                CoversBee <span className="text-gold">Mail</span>
              </span>
            </Link>
            <nav className="flex gap-6">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-white/70 transition-colors hover:text-gold"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <LogOutButton />
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
