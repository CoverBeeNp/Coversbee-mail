import Link from "next/link";
import Image from "next/image";
import { createServiceClient } from "@/lib/supabase/server";
import { LogOutButton } from "./nav-actions";

// The Zoho-connection banner below reads live system_status on every
// request. Without this, `next build` would statically pre-render this
// layout once at build time and the banner would never reflect later state
// changes.
export const dynamic = "force-dynamic";

const NAV_LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/orders", label: "Orders" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/customers", label: "Customers" },
  { href: "/email-log", label: "Email Log" },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServiceClient();
  const { data: status } = await supabase
    .from("system_status")
    .select("zoho_connected, last_error")
    .single();

  return (
    <>
      {status && !status.zoho_connected && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
          Email sending is broken — reconnect Zoho.
          {status.last_error ? ` (${status.last_error})` : ""}
        </div>
      )}
      <header className="flex items-center justify-between gap-4 bg-ink px-6 py-3">
        <div className="flex items-center gap-8">
          <Link href="/overview" className="flex items-center gap-2">
            <Image src="/logo.png" alt="CoversBee" width={28} height={27} priority />
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
    </>
  );
}
