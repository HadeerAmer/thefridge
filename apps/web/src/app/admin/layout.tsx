import Link from "next/link";
import { AdminAutoRefresh } from "@/components/admin/admin-live";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata = { title: { default: "Admin", template: "%s · Admin · The Fridge" } };
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-forest-ink text-white lg:sticky lg:top-0 lg:h-dvh lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/admin" className="block">
            <span className="wordmark text-2xl !text-sun [-webkit-text-stroke:0]">THE FRIDGE</span>
            <span className="block font-hand text-lg text-leaf">Ops dashboard</span>
          </Link>
          <Link href="/" className="text-xs text-white/70 underline lg:mt-2 lg:inline-block">
            Open customer app ↗
          </Link>
        </div>
        <AdminNav />
      </aside>
      <main className="min-w-0 px-4 py-6 lg:px-8">{children}</main>
      <AdminAutoRefresh />
    </div>
  );
}
