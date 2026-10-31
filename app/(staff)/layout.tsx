import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { StaffNav } from "./StaffNav";

// The Zoho-connection banner below reads live system_status on every
// request. Without this, `next build` would statically pre-render this
// layout once at build time and the banner would never reflect later state
// changes.
export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServiceClient();
  const { data: status } = await supabase
    .from("system_status")
    .select("zoho_connected, last_error")
    .single();

  const session = await createServerClient();
  const { data: { user } } = await session.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row print:block">
      <StaffNav email={user?.email ?? null} />
      <div className="min-w-0 flex-1">
        {status && !status.zoho_connected && (
          <div className="bg-red-600 px-4 py-2 text-center text-sm font-medium text-white print:hidden">
            Email sending is broken — reconnect Zoho.
            {status.last_error ? ` (${status.last_error})` : ""}
          </div>
        )}
        <main>{children}</main>
      </div>
    </div>
  );
}
