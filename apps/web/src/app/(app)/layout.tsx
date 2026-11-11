import { BottomNav } from "@/components/app/bottom-nav";

/** Mobile app shell: a phone-width column (centred on desktop) with the bottom tab bar. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-backdrop min-h-dvh">
      <div className="relative mx-auto min-h-dvh max-w-[480px] bg-cream pb-28 shadow-[0_0_80px_-30px_rgba(20,61,35,0.45)]">
        {children}
        <BottomNav />
      </div>
    </div>
  );
}
